/**
 * Comparativa Documento 1 vs Documento 2.
 *
 * Convención: Documento 1 = periodo actual, Documento 2 = periodo de referencia.
 * Variación % = (Doc 1 - Doc 2) / |Doc 2|.
 *
 * Para bases planas, por defecto se comparan SOLO los meses presentes en ambos
 * documentos (ej: Ene-Sep 2026 vs Ene-Sep 2025) para que la comparación sea justa.
 */
import type { FlatSheet, MatrixSheet, ParsedWorkbook, PivotSheet, Report, RuntSheet, UnitInfo } from '@/types/report'
import { monthShort, norm, shortLabel, variation } from '@/lib/format'
import { computeMatrix, type MatrixConfig } from './matrix'
import { dominantYear, monthKeyOf } from './flat'

/* ---------------- Emparejamiento de hojas ---------------- */

const MONTHS = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/g

/** Clave de nombre sin meses ni años: "RESULTADOS MES SEPTIEMBRE" ≈ "RESULTADOS MES AGOSTO" */
export const sheetKey = (name: string) => norm(name).replace(MONTHS, '').replace(/\d+/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim()

const fileTitle = (f: string) => f.replace(/\.(xlsx|xlsm|xls)$/i, '').trim()
const isGeneric = (n: string) => /^(sheet|hoja)\s*\d*$/i.test(n.trim())

/** Título legible de un reporte de una hoja. */
export function sheetTitle(s: MatrixSheet | FlatSheet | PivotSheet | RuntSheet): string {
  if (s.kind === 'runt' || s.kind === 'pivot') return s.title
  if (!isGeneric(s.name)) return s.name.trim()
  // Exportaciones del DMS con nombre de archivo automático (ej: "Grd_20261002150704"): se usa el nombre del reporte
  const file = fileTitle(s.fileName)
  if (/^[a-z]{2,5}_\d{8,}$/i.test(file) && s.kind === 'flat' && s.title) return s.title.charAt(0).toUpperCase() + s.title.slice(1)
  return file
}

export function buildReports(workbooks: ParsedWorkbook[]): Report[] {
  type Data = MatrixSheet | FlatSheet | PivotSheet | RuntSheet
  const data = (wb?: ParsedWorkbook) => (wb?.sheets ?? []).filter((s): s is Data => s.kind !== 'empty')
  const single = (s: Data, suffix = ''): Report => ({ id: s.id, mode: 'single', title: `${sheetTitle(s)}${suffix}`, sheet: s })
  const w1 = workbooks.find((w) => w.docIndex === 0)
  const w2 = workbooks.find((w) => w.docIndex === 1)
  // Documentos adicionales (ej: RUNT): siempre se muestran solos, sin emparejar
  const extras = workbooks.filter((w) => w.docIndex >= 2).flatMap((w) => data(w).map((s) => single(s)))
  const a = data(w1)
  if (!w2) return [...a.map((s) => single(s)), ...extras]

  const b = data(w2)
  const usedB = new Set<string>()
  const reports: Report[] = []

  for (const s of a) {
    if (s.kind === 'runt' || s.kind === 'pivot') {
      reports.push(single(s))
      continue
    }
    let match = b.find((x): x is MatrixSheet | FlatSheet => !usedB.has(x.id) && x.kind === s.kind && sheetKey(x.name) === sheetKey(s.name)) as MatrixSheet | FlatSheet | undefined
    // Tablas por bloques con la misma dimensión (ej: "mix" vs "MIX COMP. AÑO", ambas por MODELO)
    if (!match && s.kind === 'matrix' && s.source === 'bloques') {
      const cands = b.filter((x): x is MatrixSheet => !usedB.has(x.id) && x.kind === 'matrix' && x.source === 'bloques' && norm(x.dimensionLabel) === norm(s.dimensionLabel))
      const sameDimInA = a.filter((x) => x.kind === 'matrix' && x.source === 'bloques' && norm(x.dimensionLabel) === norm(s.dimensionLabel))
      if (cands.length === 1 && sameDimInA.length === 1) match = cands[0]
    }
    // Si cada archivo tiene una sola hoja con datos, se comparan entre sí
    if (!match && a.length === 1 && b.length === 1 && b[0].kind === s.kind) match = b[0] as MatrixSheet | FlatSheet
    if (match) {
      usedB.add(match.id)
      reports.push({ id: `${s.id}~${match.id}`, mode: 'pair', title: sheetTitle(s), a: s, b: match })
    } else {
      reports.push(single(s, ' (Doc. 1)'))
    }
  }
  for (const s of b) if (!usedB.has(s.id)) reports.push(single(s, ' (Doc. 2)'))
  return [...reports, ...extras]
}

/** Etiqueta corta del documento (año dominante si es distinto entre ambos, si no el nombre del archivo). */
export function docLabels(a: MatrixSheet | FlatSheet, b: MatrixSheet | FlatSheet, dateA?: string | null, dateB?: string | null): [string, string] {
  let ya: number | null = null
  let yb: number | null = null
  if (a.kind === 'flat' && b.kind === 'flat') {
    ya = dominantYear(a, dateA ?? null)
    yb = dominantYear(b, dateB ?? null)
  }
  if (ya && yb && ya !== yb) return [String(ya), String(yb)]
  const fa = fileTitle(a.fileName)
  const fb = fileTitle(b.fileName)
  if (fa !== fb) return [fa.length > 28 ? 'Documento 1' : fa, fb.length > 28 ? 'Documento 2' : fb]
  return ['Documento 1', 'Documento 2']
}

/* ---------------- Comparación de bases planas ---------------- */

export interface FlatPairConfig {
  measure: string
  dimension: string | null
  dateCol: string | null
  commonMonthsOnly: boolean
}

export interface FlatPairView {
  labels: [string, string]
  months: number[]
  excludedMonths: { a: number[]; b: number[] }
  totals: { a: number; b: number; varPct: number | null; countA: number; countB: number; avgA: number | null; avgB: number | null }
  monthly: Array<{ month: number; label: string; a: number | null; b: number | null; varPct: number | null }>
  byDim: Array<{ label: string; short: string; a: number; b: number; varAbs: number; varPct: number | null; shareA: number }>
}

function monthMask(s: FlatSheet, dateCol: string | null, allowed: Set<number> | null): Uint8Array {
  const n = s.rowCount
  const mask = new Uint8Array(n).fill(1)
  if (!dateCol || !allowed) return mask
  const d = s.data[dateCol] as (number | null)[]
  for (let i = 0; i < n; i++) {
    const ms = d[i]
    mask[i] = ms != null && allowed.has(new Date(ms).getUTCMonth() + 1) ? 1 : 0
  }
  return mask
}

function monthsPresent(s: FlatSheet, dateCol: string | null): Set<number> {
  const out = new Set<number>()
  if (!dateCol) return out
  for (const ms of s.data[dateCol] as (number | null)[]) if (ms != null) out.add(new Date(ms).getUTCMonth() + 1)
  return out
}

export function computeFlatPair(a: FlatSheet, b: FlatSheet, cfg: FlatPairConfig): FlatPairView {
  const dateA = cfg.dateCol && a.data[cfg.dateCol] ? cfg.dateCol : null
  const dateB = cfg.dateCol && b.data[cfg.dateCol] ? cfg.dateCol : null
  const ma = monthsPresent(a, dateA)
  const mb = monthsPresent(b, dateB)
  const common = new Set([...ma].filter((m) => mb.has(m)))
  const useCommon = cfg.commonMonthsOnly && common.size > 0
  const maskA = monthMask(a, dateA, useCommon ? common : null)
  const maskB = monthMask(b, dateB, useCommon ? common : null)

  const agg = (s: FlatSheet, mask: Uint8Array, date: string | null) => {
    const vals = (s.data[cfg.measure] ?? []) as (number | null)[]
    const dims = cfg.dimension ? ((s.data[cfg.dimension] ?? []) as (string | null)[]) : null
    const dt = date ? (s.data[date] as (number | null)[]) : null
    let total = 0
    let count = 0
    const byMonth = new Map<number, number>()
    const byDim = new Map<string, number>()
    for (let i = 0; i < vals.length; i++) {
      const v = vals[i]
      if (v == null || !mask[i]) continue
      total += v
      count++
      if (dt?.[i] != null) {
        const m = Number(monthKeyOf(dt[i]!).slice(5))
        byMonth.set(m, (byMonth.get(m) ?? 0) + v)
      }
      if (dims) {
        const k = dims[i] ?? '(Sin dato)'
        byDim.set(k, (byDim.get(k) ?? 0) + v)
      }
    }
    return { total, count, byMonth, byDim }
  }

  const A = agg(a, maskA, dateA)
  const B = agg(b, maskB, dateB)
  const allMonths = [...new Set([...A.byMonth.keys(), ...B.byMonth.keys()])].sort((x, y) => x - y)
  const labels = new Set([...A.byDim.keys(), ...B.byDim.keys()])

  return {
    labels: docLabels(a, b, dateA, dateB),
    months: [...common].sort((x, y) => x - y),
    excludedMonths: useCommon
      ? { a: [...ma].filter((m) => !common.has(m)).sort((x, y) => x - y), b: [...mb].filter((m) => !common.has(m)).sort((x, y) => x - y) }
      : { a: [], b: [] },
    totals: {
      a: A.total,
      b: B.total,
      varPct: variation(A.total, B.total),
      countA: A.count,
      countB: B.count,
      avgA: A.count ? A.total / A.count : null,
      avgB: B.count ? B.total / B.count : null,
    },
    monthly: allMonths.map((m) => {
      const va = A.byMonth.get(m) ?? null
      const vb = B.byMonth.get(m) ?? null
      return { month: m, label: monthShort(m), a: va, b: vb, varPct: variation(va, vb) }
    }),
    byDim: [...labels]
      .map((label) => {
        const va = A.byDim.get(label) ?? 0
        const vb = B.byDim.get(label) ?? 0
        return { label, short: shortLabel(label), a: va, b: vb, varAbs: va - vb, varPct: variation(va, vb), shareA: A.total ? va / A.total : 0 }
      })
      .sort((x, y) => y.a - x.a || y.b - x.b),
  }
}

/* ---------------- Comparación de matrices ---------------- */

export interface MatrixPairView {
  unit: UnitInfo
  labels: [string, string]
  periodA: string
  periodB: string
  metricLabel: string
  totals: { a: number; b: number; varPct: number | null; targetA: number | null; targetB: number | null; complianceA: number | null; complianceB: number | null }
  items: Array<{ label: string; short: string; group: string; a: number | null; b: number | null; varPct: number | null; complianceA: number | null; complianceB: number | null }>
  groups: Array<{ label: string; a: number; b: number; varPct: number | null }>
  series: Array<{ label: string; a: number | null; b: number | null }>
}

export function computeMatrixPair(a: MatrixSheet, b: MatrixSheet, cfgA: MatrixConfig): MatrixPairView {
  const va = computeMatrix(a, { ...cfgA, compareKey: '' })
  const metricB = b.metrics.find((m) => m.key === va.metric.key) ?? b.metrics.find((m) => m.role === 'value')!
  const periodB = metricB.periods.find((p) => p.key === va.period.key) ?? metricB.periods[metricB.periods.length - 1]
  const vb = computeMatrix(b, { metricKey: metricB.key, periodKey: periodB.key, compareKey: '', groups: cfgA.groups })

  const mapB = new Map(vb.items.map((i) => [norm(i.label), i]))
  const items = va.items.map((i) => {
    const o = mapB.get(norm(i.label))
    mapB.delete(norm(i.label))
    return { label: i.label, short: i.short, group: i.group, a: i.value, b: o?.value ?? null, varPct: variation(i.value, o?.value), complianceA: i.compliance, complianceB: o?.compliance ?? null }
  })
  for (const o of mapB.values()) items.push({ label: o.label, short: o.short, group: o.group, a: null, b: o.value, varPct: null, complianceA: null, complianceB: o.compliance })

  const groupLabels = [...new Set([...va.groups.map((g) => g.label), ...vb.groups.map((g) => g.label)])]
  const groups = groupLabels.map((g) => {
    const x = va.groups.find((y) => y.label === g)?.value ?? 0
    const y = vb.groups.find((z) => z.label === g)?.value ?? 0
    return { label: g, a: x, b: y, varPct: variation(x, y) }
  })

  // Serie: alinear por mes si ambas son mensuales; si no, por posición
  const monthly = va.series.every((p) => p.month != null) && vb.series.every((p) => p.month != null)
  const series = monthly
    ? [...new Set([...va.series, ...vb.series].map((p) => p.month as number))]
        .sort((x, y) => x - y)
        .map((m) => ({
          label: monthShort(m),
          a: va.series.filter((p) => p.month === m).at(-1)?.value ?? null,
          b: vb.series.filter((p) => p.month === m).at(-1)?.value ?? null,
        }))
    : va.series.map((p, i) => ({ label: p.label, a: p.value, b: vb.series[i]?.value ?? null }))

  const fa = fileTitle(a.fileName)
  const fb = fileTitle(b.fileName)
  const labels: [string, string] =
    va.period.label !== periodB.label ? [va.period.label, periodB.label] : fa !== fb ? [fa.slice(0, 28), fb.slice(0, 28)] : ['Documento 1', 'Documento 2']

  return {
    unit: a.unit,
    labels,
    periodA: va.period.label,
    periodB: periodB.label,
    metricLabel: va.metric.label,
    totals: {
      a: va.total.value,
      b: vb.total.value,
      varPct: variation(va.total.value, vb.total.value),
      targetA: va.total.target,
      targetB: vb.total.target,
      complianceA: va.total.compliance,
      complianceB: vb.total.compliance,
    },
    items,
    groups,
    series,
  }
}
