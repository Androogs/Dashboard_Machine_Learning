/**
 * Modelo de los "entornos de reporte" (formato del reporte de gerencia).
 *
 * A partir de una tabla (MatrixSheet) se calcula, para cada sede/agencia:
 *  - valor del periodo actual y del periodo de comparación
 *  - serie mensual del año actual y del anterior (si la tabla es mensual)
 *  - el último mes vs el mes anterior (vista "Ago vs Sep")
 *
 * Modos:
 *  - acum:    acumulado enero → mes de corte del año actual vs mismos meses del año anterior
 *  - mes:     solo el mes de corte vs el mismo mes del año anterior (o el mes anterior si hay un solo año)
 *  - periodo: tablas sin meses (años, o un solo mes por año como "sep-25 / sep-26")
 */
import type { MatrixSheet, MetricInfo, Period, UnitInfo } from '@/types/report'
import { defaultMatrixConfig, latestPeriod, periodsWithData, valueMetrics } from './matrix'
import { monthLong, monthShort, shortLabel, titleCase, variation } from '@/lib/format'
import { PALETA_TIENDAS, brandOf, colorOf } from '@/config/negocio'

export type EnvMode = 'acum' | 'mes' | 'periodo'

export interface EnvConfig {
  metricKey: string
  /** Periodo de corte (clave "2026-09" o "2026") */
  cutKey: string
  mode: EnvMode
}

export interface EnvRow {
  label: string
  short: string
  group: string
  cur: number | null
  prev: number | null
  /** Serie mensual (meses 1..corte) del año actual y del anterior */
  mCur: (number | null)[]
  mPrev: (number | null)[]
  /** Último mes y mes anterior (vista mes vs mes) */
  lastCur: number | null
  lastPrev: number | null
  target: number | null
}

export interface EnvGroup {
  name: string
  color: string
  rows: EnvRow[]
  cur: number
  prev: number | null
  mCur: (number | null)[]
  mPrev: (number | null)[]
  lastCur: number
  lastPrev: number | null
  target: number | null
}

export interface EnvModel {
  /** Nombre de la dimensión (Sede, Asesor, Modelo…) */
  dim: string
  metric: MetricInfo
  unit: UnitInfo
  mode: EnvMode
  /** Modos disponibles para esta tabla */
  modes: EnvMode[]
  /** Periodos que se pueden elegir como corte */
  cutOptions: Period[]
  cut: Period
  curLabel: string
  prevLabel: string | null
  /** "Enero – Septiembre 2026 vs 2025" */
  rangeLabel: string
  /** "Acumulado a septiembre 2026" */
  badge: string
  /** Etiquetas de la serie mensual (Ene … Sep); vacío si la tabla no es mensual */
  monthLabels: string[]
  /** Vista mes vs mes anterior (solo tablas mensuales) */
  last: { curLabel: string; prevLabel: string } | null
  rows: EnvRow[]
  /** Grupos reales (marcas); vacío si la tabla tiene un solo grupo */
  groups: EnvGroup[]
  total: EnvGroup
  hasTarget: boolean
}

/* ------------------------------------------------------------------ */

const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)
const sumOrNull = (xs: (number | null)[]) => (xs.some((x) => x != null) ? sum(xs) : null)

function prevMonth(p: Period): { year: number; month: number } {
  return p.month === 1 ? { year: p.year - 1, month: 12 } : { year: p.year, month: (p.month ?? 1) - 1 }
}
const keyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

export function defaultEnvConfig(s: MatrixSheet, metricKey?: string): EnvConfig {
  const key = metricKey ?? defaultMatrixConfig(s).metricKey
  const metric = s.metrics.find((m) => m.key === key) ?? valueMetrics(s)[0]
  const cut = latestPeriod(s, metric)
  const years = new Set(metric.periods.filter((p) => p.month).map((p) => p.year))
  const mode: EnvMode = !cut.month ? 'periodo' : isSingleMonthPerYear(metric) ? 'periodo' : years.has(cut.year - 1) ? 'acum' : 'mes'
  return { metricKey: metric.key, cutKey: cut.key, mode }
}

/** Tablas con un solo mes por año (ej: "sep-25 | sep-26"): se tratan como periodos */
function isSingleMonthPerYear(m: MetricInfo) {
  const byYear = new Map<number, number>()
  for (const p of m.periods) if (p.month) byYear.set(p.year, (byYear.get(p.year) ?? 0) + 1)
  return byYear.size >= 2 && [...byYear.values()].every((n) => n === 1)
}

export function buildEnv(s: MatrixSheet, cfg: EnvConfig): EnvModel {
  const metric = s.metrics.find((m) => m.key === cfg.metricKey) ?? valueMetrics(s)[0]
  const colOf = new Map<string, number>()
  s.columns.forEach((c, i) => {
    if (c.metricKey === metric.key && c.period && !colOf.has(c.period.key)) colOf.set(c.period.key, i)
  })
  const targetMetric = s.metrics.find((m) => m.role === 'target')
  const tColOf = new Map<string, number>()
  if (targetMetric) s.columns.forEach((c, i) => c.metricKey === targetMetric.key && c.period && tColOf.set(c.period.key, i))

  const withData = periodsWithData(s, metric)
  const cut = metric.periods.find((p) => p.key === cfg.cutKey) ?? latestPeriod(s, metric)
  const monthly = Boolean(cut.month) && !isSingleMonthPerYear(metric)
  const hasPrevYear = monthly && metric.periods.some((p) => p.year === cut.year - 1 && p.month)
  const modes: EnvMode[] = monthly ? (hasPrevYear ? ['acum', 'mes'] : ['mes', 'acum']) : ['periodo']
  const mode: EnvMode = modes.includes(cfg.mode) ? cfg.mode : modes[0]

  // Filas sin ningún dato en la métrica (ej: "Gerencia" vacía) no se muestran
  const items = s.rows.filter((r) => r.type === 'item' && [...colOf.values()].some((i) => (r.values[i] ?? 0) !== 0))
  const v = (row: (typeof items)[number], key: string) => {
    const i = colOf.get(key)
    return i === undefined ? null : row.values[i]
  }
  const tv = (row: (typeof items)[number], key: string) => {
    const i = tColOf.get(key)
    return i === undefined ? null : row.values[i]
  }

  // Periodo de comparación en modo "periodo": el anterior en la lista
  const sortedP = [...metric.periods].sort((a, b) => a.key.localeCompare(b.key))
  const prevPeriod = sortedP[sortedP.findIndex((p) => p.key === cut.key) - 1] ?? null

  const months = monthly ? Array.from({ length: cut.month! }, (_, i) => i + 1) : []
  const pm = monthly ? prevMonth(cut) : null

  const rows: EnvRow[] = items.map((r) => {
    const mCur = months.map((m) => v(r, keyOf(cut.year, m)))
    const mPrev = months.map((m) => v(r, keyOf(cut.year - 1, m)))
    let cur: number | null
    let prev: number | null
    let target: number | null = null
    if (mode === 'acum') {
      cur = sumOrNull(mCur)
      prev = hasPrevYear ? sumOrNull(mPrev) : null
      target = tColOf.size ? sumOrNull(months.map((m) => tv(r, keyOf(cut.year, m)))) : null
    } else if (mode === 'mes') {
      cur = v(r, cut.key)
      prev = hasPrevYear ? v(r, keyOf(cut.year - 1, cut.month!)) : pm ? v(r, keyOf(pm.year, pm.month)) : null
      target = tv(r, cut.key)
    } else {
      cur = v(r, cut.key)
      prev = prevPeriod ? v(r, prevPeriod.key) : null
      target = tv(r, cut.key)
    }
    return {
      label: r.label,
      short: shortLabel(r.label),
      group: r.group,
      cur,
      prev,
      mCur,
      mPrev,
      lastCur: monthly ? v(r, cut.key) : null,
      lastPrev: pm ? v(r, keyOf(pm.year, pm.month)) : null,
      target,
    }
  })

  const agg = (name: string, list: EnvRow[], color: string): EnvGroup => ({
    name,
    color,
    rows: list,
    cur: sum(list.map((r) => r.cur)),
    prev: list.some((r) => r.prev != null) ? sum(list.map((r) => r.prev)) : null,
    mCur: months.map((_, i) => sumOrNull(list.map((r) => r.mCur[i]))),
    mPrev: months.map((_, i) => sumOrNull(list.map((r) => r.mPrev[i]))),
    lastCur: sum(list.map((r) => r.lastCur)),
    lastPrev: list.some((r) => r.lastPrev != null) ? sum(list.map((r) => r.lastPrev)) : null,
    target: list.some((r) => r.target != null) ? sum(list.map((r) => r.target)) : null,
  })

  const realGroups = s.groups.filter((g) => rows.some((r) => r.group === g))
  // Nombre visible del grupo: el de la marca conocida ("SUZUKI" → "Suzuki"); si no, el original
  const nice = (g: string) => brandOf(g)?.label ?? g
  for (const r of rows) r.group = nice(r.group)
  const groups = realGroups.length > 1 ? realGroups.map((g, i) => agg(nice(g), rows.filter((r) => r.group === nice(g)), colorOf(g, PALETA_TIENDAS[i % PALETA_TIENDAS.length]))) : []

  // Etiquetas
  let curLabel: string
  let prevLabel: string | null
  let rangeLabel: string
  let badge: string
  const mLong = cut.month ? monthLong(cut.month) : ''
  if (mode === 'acum') {
    curLabel = String(cut.year)
    prevLabel = hasPrevYear ? String(cut.year - 1) : null
    rangeLabel = `${cut.month === 1 ? 'Enero' : `Enero – ${mLong}`} ${cut.year}${prevLabel ? ` vs ${prevLabel}` : ''}`
    badge = `Acumulado a ${mLong.toLowerCase()} ${cut.year}`
  } else if (mode === 'mes') {
    curLabel = `${monthShort(cut.month!)} ${cut.year}`
    prevLabel = hasPrevYear ? `${monthShort(cut.month!)} ${cut.year - 1}` : pm ? `${monthShort(pm.month)} ${pm.year}` : null
    rangeLabel = `${mLong} ${cut.year}${prevLabel ? ` vs ${prevLabel}` : ''}`
    badge = `Mes de ${mLong.toLowerCase()} ${cut.year}`
  } else {
    // Un mes por año (sep-25 / sep-26) o años: se rotula por año
    const sameMonth = prevPeriod && cut.month && prevPeriod.month === cut.month
    curLabel = sameMonth || !cut.month ? String(cut.year) : cut.label
    prevLabel = prevPeriod ? (sameMonth || !prevPeriod.month ? String(prevPeriod.year) : prevPeriod.label) : null
    rangeLabel = `${curLabel}${prevLabel ? ` vs ${prevLabel}` : ''}`
    badge = cut.month ? `Corte a ${mLong.toLowerCase()} ${cut.year}` : `Año ${cut.year}`
  }

  return {
    dim: s.dimensionLabel.trim() === 'Elemento' ? 'Punto de venta' : titleCase(s.dimensionLabel),
    metric,
    unit: s.unit,
    mode,
    modes,
    cutOptions: [...withData].sort((a, b) => b.key.localeCompare(a.key)),
    cut,
    curLabel,
    prevLabel,
    rangeLabel,
    badge,
    monthLabels: months.map(monthShort),
    last: monthly && pm ? { curLabel: `${monthShort(cut.month!)} ${cut.year}`, prevLabel: `${monthShort(pm.month)} ${pm.year}` } : null,
    rows,
    groups,
    total: agg('Total', rows, '#378ADD'),
    hasTarget: rows.some((r) => r.target != null),
  }
}

/** Mayor crecimiento (con base > 0) entre una lista de filas. */
export function topGrowth<T extends { cur: number | null; prev: number | null }>(list: T[]): (T & { var: number }) | null {
  const c = list
    .filter((r) => (r.prev ?? 0) > 0 && r.cur != null)
    .map((r) => ({ ...r, var: variation(r.cur, r.prev)! }))
    .sort((a, b) => b.var - a.var)
  return c[0] ?? null
}
