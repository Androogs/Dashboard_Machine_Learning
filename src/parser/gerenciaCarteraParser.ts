/**
 * Informe de gerencia de cartera ("INFORME GERENCIA - CIERRE DE MES CARTERA …").
 *
 * El libro trae una hoja base ("Sheet") con una fila por cuota y envejecimiento
 * del saldo (sin vencer + 7 rangos de mora), más pivots comparativos mensual y
 * anual ya calculados. El resto de pestañas son auxiliares del mismo informe
 * (instrucciones, pivots de apoyo, listas): se consumen todas en un solo reporte.
 *
 * Clasificación por "Tipo 2" (columna curada en el propio libro):
 *  - fin:       desembolsos de financieras (ZAD→ADDI, ZK→BRILLA, ZD→INVERSIONES,
 *               ZE→CREDIORBE, ZG→FINAMIGA, ZH→PROGRESER, ZS→SISTECREDITO, ZC→SUFI)
 *  - cont:      contados e iniciales (MTE)
 *  - contab:    90 CONTABILIDAD
 *  - analizada: universo de las tablas dinámicas (propia diferida FPA, avalada
 *               FG/FJ, repuestos y servicios, seguros, traslados a propia, cargos)
 *  - ajuste:    recibos de caja y notas (saldo negativo: aplicaciones, no deuda)
 */
import type { Cell, GCBloque, GCSec, GCSeg, GCSegTop, GCTopDoc, GCRow, GCPeriodo, GerenciaCarteraSheet, RawSheet } from '@/types/report'
import { isExcelDate } from './cells'
import { monthLong, monthShort, norm, titleCase } from '@/lib/format'
import { SEGMENTOS_CARTERA } from '@/config/negocio'

const S = (c: Cell): string => (c == null ? '' : isExcelDate(c) ? '' : String(c).replace(/\s+/g, ' ').trim())
const N = (c: Cell): number => {
  if (typeof c === 'number' && isFinite(c)) return c
  if (typeof c === 'string') {
    const s = c.trim().replace(/[.$\s]/g, '').replace(',', '.')
    const n = Number(s)
    if (s && isFinite(n)) return n
    const p = Number(c)
    if (isFinite(p)) return p
  }
  return 0
}

/* ---------------- Detección ---------------- */

/** Hojas del informe que sí se leen (el resto son auxiliares del mismo informe). */
export const GC_KEEP = /^(sheet\d*|comparativo mensual.*|comparativo anual.*)$/i

/** El libro es un informe de gerencia de cartera si trae los comparativos o la tabla final. */
export const isGerenciaCarteraBook = (names: string[]) =>
  names.some((n) => /^tabla jesus/i.test(norm(n))) ||
  (names.some((n) => /^comparativo mensual/i.test(norm(n))) && names.some((n) => /^comparativo anual/i.test(norm(n))))

const HEADERS = ['bodega', 't.cartera', 'cobrador', 'saldo_capital', 'sin vencer', 'tipo 2']

function findHeader(raw: RawSheet): { row: number; idx: Record<string, number> } | null {
  for (let r = 0; r < Math.min(12, raw.rows.length); r++) {
    const names = (raw.rows[r] ?? []).map((c) => norm(S(c)))
    if (HEADERS.every((h) => names.includes(h))) {
      const idx: Record<string, number> = {}
      for (const k of [
        'bodega', 'tipo', 'razon_social', 'nit', 'z.cartera', 't.cartera', 'cobrador', 'financiera',
        'saldo_capital', 'saldo_a_corte', 'sin vencer',
        'de 1 a 30', 'de 31 a 60', 'de 61 a 90', 'de 91 a 120', 'de 121 a 180', 'de 181 a 360', 'mas de 360',
        'tipo 2', 'cartera por financera',
      ]) idx[k] = names.indexOf(k)
      return { row: r, idx }
    }
  }
  return null
}

/* ---------------- Clasificación ---------------- */

export function gcSeccion(t2: string): GCSec {
  const t = norm(t2)
  if (/^z[a-z]{1,2}\b/.test(t) && /desemb/.test(t)) return 'fin'
  if (/contados e iniciales/.test(t)) return 'cont'
  if (/^90 contabilidad/.test(t)) return 'contab'
  if (/^(rc|rs\b|r12\b|recibo|nd[pcs]|nc[cd]|fh)/.test(t)) return 'ajuste'
  return 'analizada'
}

const FIN_Z: Record<string, string> = {
  zad: 'ADDI', zc: 'SUFI', zd: 'INVERSIONES', ze: 'CREDIORBE', zg: 'FINAMIGA',
  zh: 'PROGRESER', zi: 'INVERMOTOS', zk: 'BRILLA', zl: 'FENALCO', zs: 'SISTECREDITO',
}

/** Nombre de financiera/grupo para la vista de financieras. */
export function gcFinanciera(t2: string, cpf: string): string {
  const m = norm(t2).match(/^z([a-z]{1,2})\b/)
  if (m && FIN_Z[`z${m[1]}`]) return FIN_Z[`z${m[1]}`]!
  const c = norm(cpf)
  if (c.startsWith('fg')) return 'INVERSIONES (avalada)'
  if (c.startsWith('fj')) return 'INVERMOTOS (avalada)'
  if (c.startsWith('fpa')) return 'Cartera propia diferida'
  if (c.startsWith('repuestos')) return 'Propia: repuestos y servicios'
  return 'Sin asignar'
}

/** Grupo de documento para la dona de composición. */
export function gcClaseDoc(t2: string): string {
  const t = norm(t2)
  if (gcSeccion(t2) === 'fin') return 'Desembolso financiera'
  if (gcSeccion(t2) === 'ajuste') return 'Recibos y notas'
  if (/contados e iniciales/.test(t)) return 'Contados e iniciales'
  if (/^90 contabilidad/.test(t)) return 'Contabilidad'
  if (/trasl?a?do|traspaso/.test(t)) return 'Traslado a propia'
  if (/avalada|proyeccion|interno financia/.test(t)) return 'Cartera financiada'
  if (/repuesto|^fr\b/.test(t)) return 'Repuestos'
  if (/seguro de vida/.test(t)) return 'Seguro de vida'
  if (/interes|costas|cobranza|cargos|cuotas/.test(t)) return 'Cargos e intereses'
  if (/otros ingresos|soat|servicios/.test(t)) return 'Otros servicios'
  return 'Otros'
}

/**
 * Segmento del saldo moroso por responsable (vista "Segmentos"):
 * A financieras (Ana), B contabilidad, C cajeras — SEGMENTOS_CARTERA en
 * config/negocio. 'otros' si el código del Tipo 2 no cae en ninguna lista.
 */
export function gcSegmento(t2: string): GCSeg | 'otros' {
  const code = norm(t2).match(/^[a-z0-9]+/)?.[0] ?? ''
  return SEGMENTOS_CARTERA.find((s) => s.match.test(code))?.id ?? 'otros'
}

/** Código de documento (primer token del Tipo 2): "RPE10 - …" → "rpe10". */
export const gcCodigo = (t2: string): string => norm(t2).match(/^[a-z0-9]+/)?.[0] ?? ''

/* ---------------- Comparativos ---------------- */

const BUCKET_KEYS = ['de 1 a 30', 'de 31 a 60', 'de 61 a 90', 'de 91 a 120', 'de 121 a 180', '181 a 360', 'mas de 360']

function serialLabel(c: Cell): { key: number; label: string } | null {
  if (isExcelDate(c)) return { key: c.ms, label: `${monthShort(c.m)} ${c.y}` }
  if (typeof c === 'number' && isFinite(c) && c > 30000 && c < 60000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(c) * 86400000
    const d = new Date(ms)
    return { key: ms, label: `${monthShort(d.getUTCMonth() + 1)} ${d.getUTCFullYear()}` }
  }
  return null
}

/** Lee una hoja comparativa: bloques "COMPARATIVO …" con dos periodos (serial + métricas). */
function parseComparativo(raw: RawSheet | undefined): GCBloque[] {
  if (!raw) return []
  const out: GCBloque[] = []
  const seen = new Map<string, number>()
  let lastGroup = 'General'
  let cur: GCBloque | null = null
  let idx: Record<string, number> | null = null
  for (let r = 0; r < raw.rows.length; r++) {
    const row = raw.rows[r]!
    const names = row.map((c) => norm(S(c)))
    const head = names.findIndex((n) => n === 'suma de % morosidad')
    if (head >= 0) {
      // El nombre del bloque viene en la fila anterior ("COMPARATIVO CARTERA CORRIENTE"…)
      const prevTitle = r > 0 ? S(raw.rows[r - 1]?.[0]) : ''
      const ownTitle = S(row[0])
      const rawTitle = /^comparativo/i.test(prevTitle) ? prevTitle : /^comparativo/i.test(ownTitle) ? ownTitle : ''
      let title = titleCase(rawTitle.replace(/^comparativo\s*(cartera|general)?\s*/i, '').replace(/^a\s+\w+$/i, '').trim() || 'General')
      if (title === 'Ana') title = 'Analizada' // la celda del libro viene truncada
      const n = (seen.get(title) ?? 0) + 1
      seen.set(title, n)
      if (n === 1) lastGroup = title
      else title = `${title} · ${lastGroup}` // sub-bloques repetidos (cobradores de la cartera anterior)
      cur = { title, periodos: [] }
      out.push(cur)
      const m: Record<string, number> = {}
      names.forEach((n2, i) => {
        if (n2 === 'suma de % morosidad') m.mor = i
        else if (n2 === 'suma de saldo_capital') m.sal = i
        else if (n2 === 'suma de sin vencer') m.sv = i
        else if (n2 === 'suma de moroso') m.mo = i
        else BUCKET_KEYS.forEach((bk, bi) => { if (n2 === `suma de ${bk}`) m[`b${bi}`] = i })
      })
      idx = m
      continue
    }
    if (!cur || !idx || idx.sal == null) continue
    const per = serialLabel(row[0])
    if (!per) {
      // Una fila sin serial cierra el bloque (totales / DIF)
      if (names.every((n2) => n2 === '' || n2 === 'dif')) cur = null
      continue
    }
    const p: GCPeriodo = {
      label: per.label,
      morosidad: idx.mor != null ? N(row[idx.mor]) : null,
      saldo: N(row[idx.sal]),
      sv: idx.sv != null ? N(row[idx.sv]) : 0,
      moroso: idx.mo != null ? N(row[idx.mo]) : 0,
      b: BUCKET_KEYS.map((_, bi) => (idx?.[`b${bi}`] != null ? N(row[idx[`b${bi}`]!]) : 0)),
    }
    cur.periodos.push(p)
    ;(p as { ms?: number }).ms = per.key
  }
  // Orden cronológico real por el serial del periodo
  for (const bl of out) bl.periodos.sort((a, b) => ((a as { ms?: number }).ms ?? 0) - ((b as { ms?: number }).ms ?? 0))
  return out.filter((b) => b.periodos.length)
}

/* ---------------- Base ---------------- */

export interface GCResult {
  sheets: GerenciaCarteraSheet[]
  consumed: string[]
}

const TOP_N = 30

export function parseGerenciaCarteraWorkbook(raws: RawSheet[], ctx: { docIndex: number; fileName: string }): GCResult | null {
  if (!isGerenciaCarteraBook(raws.map((r) => r.name))) return null
  const base = raws
    .map((raw) => ({ raw, header: findHeader(raw) }))
    .filter((x): x is { raw: RawSheet; header: { row: number; idx: Record<string, number> } } => x.header !== null)
    .sort((a, b) => b.raw.rows.length - a.raw.rows.length)[0]
  if (!base) return null
  const { raw, header } = base
  const c = (row: Cell[], k: string) => (header.idx[k] >= 0 ? row[header.idx[k]] : null)

  const BUCKET_COLS = ['de 1 a 30', 'de 31 a 60', 'de 61 a 90', 'de 91 a 120', 'de 121 a 180', 'de 181 a 360', 'mas de 360']
  const combos = new Map<string, GCRow>()
  const topDocs: GCTopDoc[] = []
  const pushTop = (d: GCTopDoc) => {
    topDocs.push(d)
    topDocs.sort((a, b) => Math.abs(b.sal) - Math.abs(a.sal))
    if (topDocs.length > TOP_N) topDocs.pop()
  }
  // Deudores por cobrador × segmento (vista "Segmentos"): cliente → moroso acumulado
  const segTopMap = new Map<string, { seg: GCSeg; cob: string; docs: Map<string, GCTopDoc> }>()
  let nDocs = 0

  for (const row of raw.rows.slice(header.row + 1)) {
    const bod = S(c(row, 'bodega'))
    const t2 = S(c(row, 'tipo 2'))
    const sal = N(c(row, 'saldo_capital'))
    if (!bod && !t2 && !sal) continue
    nDocs++
    const sec = gcSeccion(t2)
    const zona = S(c(row, 'z.cartera')) || 'Sin zona'
    const tc = S(c(row, 't.cartera')) || 'Sin clasificar'
    const cob = S(c(row, 'cobrador')) || 'Sin asignar'
    const cpf = S(c(row, 'cartera por financera'))
    const b = BUCKET_COLS.map((k) => N(c(row, k)))
    const rowMor = b.reduce((a, x) => a + x, 0)
    const key = `${sec}|${bod}|${zona}|${tc}|${cob}|${cpf}|${t2}`
    const cur = combos.get(key) ?? { sec, bod: bod || 'Sin bodega', zona, tc, cob, cpf, t2, n: 0, sal: 0, corte: 0, sv: 0, b: [0, 0, 0, 0, 0, 0, 0] }
    cur.n++
    cur.sal += sal
    cur.corte += N(c(row, 'saldo_a_corte'))
    cur.sv += N(c(row, 'sin vencer'))
    for (let i = 0; i < 7; i++) cur.b[i]! += b[i]!
    combos.set(key, cur)
    if (sec !== 'ajuste') {
      pushTop({
        cliente: S(c(row, 'razon_social')) || 'Sin nombre',
        nit: S(c(row, 'nit')),
        bod: bod || 'Sin bodega',
        t2,
        tc,
        cob,
        sal,
        moroso: rowMor,
      })
    }
    if (sec === 'analizada' && rowMor > 0) {
      const seg = gcSegmento(t2)
      if (seg !== 'otros') {
        const k = `${cob}|${seg}`
        const grp = segTopMap.get(k) ?? { seg, cob, docs: new Map<string, GCTopDoc>() }
        const cli = S(c(row, 'razon_social')) || 'Sin nombre'
        const d = grp.docs.get(cli) ?? { cliente: cli, nit: S(c(row, 'nit')), bod: bod || 'Sin bodega', t2, tc, cob, sal: 0, moroso: 0 }
        d.sal += sal
        d.moroso += rowMor
        grp.docs.set(cli, d)
        segTopMap.set(k, grp)
      }
    }
  }
  if (!combos.size) return null

  const rows = [...combos.values()]
  const segTops: GCSegTop[] = [...segTopMap.values()].map((g) => ({
    cob: g.cob,
    seg: g.seg,
    docs: [...g.docs.values()].sort((a, b) => b.moroso - a.moroso).slice(0, 10),
  }))
  const find = (re: RegExp) => raws.find((r) => re.test(r.name.trim()))
  const mensual = parseComparativo(find(/^comparativo mensual/i))
  const anual = parseComparativo(find(/^comparativo anual/i))

  // Periodo del informe: el serial más reciente de los comparativos; respaldo: nombre del archivo
  let periodo = ''
  const MES3: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 }
  const fm = ctx.fileName.match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*[\s._-]*(\d{4})/i)
  if (fm && MES3[fm[1]!.slice(0, 3).toLowerCase()]) periodo = `${monthLong(MES3[fm[1]!.slice(0, 3).toLowerCase()]!)} ${fm[2]}`
  const lastSerialLabel = [...mensual, ...anual].flatMap((b) => b.periodos.map((p) => p.label)).at(-1)

  const secSum = (sec: GCSec) => rows.filter((r) => r.sec === sec).reduce((a, r) => a + r.sal, 0)
  const fmtM = (v: number) => `$ ${(v / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  const total = rows.reduce((a, r) => a + r.sal, 0)
  const ajustes = secSum('ajuste')
  const notes = [
    `La cartera vigente (${fmtM(secSum('analizada') + secSum('fin') + secSum('cont') + secSum('contab'))}) excluye recibos de caja y notas (${fmtM(ajustes)}): son movimientos de aplicación, no deuda.`,
    `La "cartera analizada" (${fmtM(secSum('analizada'))}) corresponde al universo de las tablas dinámicas del informe; los desembolsos de financieras, contados e iniciales y contabilidad se muestran en la vista Financieras.`,
    'Los comparativos vienen calculados en el libro y no se ven afectados por los filtros.',
    `Base de ${nDocs.toLocaleString('es-CO')} cuotas; saldo_capital = sin vencer + rangos de mora. Registros totales: ${total.toLocaleString('es-CO', { maximumFractionDigits: 0 })}.`,
  ]

  return {
    sheets: [
      {
        kind: 'gerenciaCartera',
        id: `d${ctx.docIndex}-s-gerenciacartera`,
        name: raw.name.trim(),
        sheetName: raw.name.trim(),
        docIndex: ctx.docIndex,
        fileName: ctx.fileName,
        title: 'Cierre de mes — Cartera',
        periodo: periodo || lastSerialLabel || '',
        rows,
        topDocs,
        segTops,
        mensual,
        anual,
        notes,
      },
    ],
    consumed: raws.map((r) => r.name),
  }
}
