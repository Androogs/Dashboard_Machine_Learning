/**
 * Análisis de hojas PLANAS (bases de registros del DMS).
 *
 * Criterios de cálculo:
 *  - Total:          suma de la medida seleccionada (ej: Ventas) sobre los registros filtrados.
 *  - Registros:      número de filas con la medida diligenciada.
 *  - Promedio:       total / registros (ej: ticket promedio por línea o por orden).
 *  - Margen:         suma utilidad / suma medida, solo si existe una columna de utilidad.
 *  - Serie mensual:  agrupación por año-mes de la columna de fecha seleccionada.
 *  - Mes actual vs anterior: último mes con datos frente al mes inmediatamente previo.
 */
import type { FlatColumn, FlatSheet } from '@/types/report'
import { COLUMNA_UTILIDAD, PRIORIDAD_DIMENSION, PRIORIDAD_FECHA, PRIORIDAD_MEDIDA } from '@/config/negocio'
import { monthShort, shortLabel, variation } from '@/lib/format'
import { buildYoy, type YoyData } from './matrix'

export interface FlatConfig {
  measure: string
  dimension: string | null
  dateCol: string | null
  /** 'all' o "YYYY-MM" */
  month: string
}

export interface MonthPoint {
  key: string
  label: string
  year: number
  month: number
  value: number
  count: number
}

export interface DimRow {
  label: string
  short: string
  value: number
  count: number
  share: number
  cur: number | null
  prev: number | null
  varPct: number | null
}

export interface FlatView {
  measure: FlatColumn
  dimension: FlatColumn | null
  total: number
  count: number
  avg: number | null
  profit: number | null
  margin: number | null
  months: MonthPoint[]
  yoy: YoyData | null
  curMonth: MonthPoint | null
  prevMonth: MonthPoint | null
  /** Mismo mes del año anterior (si existe en la base) */
  yoyMonth: MonthPoint | null
  byDim: DimRow[]
  secondary: { column: string; rows: { label: string; value: number; share: number }[] } | null
}

/* ------------------------------------------------------------------ */

export const measures = (s: FlatSheet) => s.columns.filter((c) => c.type === 'measure' || c.type === 'number')
export const dimensions = (s: FlatSheet) => s.columns.filter((c) => c.type === 'category' && c.distinct >= 2)
export const dateCols = (s: FlatSheet) => s.columns.filter((c) => c.type === 'date')

function pickBy(cols: FlatColumn[], prefs: RegExp[]): FlatColumn | null {
  for (const re of prefs) {
    const f = cols.find((c) => re.test(c.name))
    if (f) return f
  }
  return cols[0] ?? null
}

/** ¿La medida es una cantidad (unidades) y no dinero? */
export const isQuantity = (c: FlatColumn) => c.measureKind !== 'money' && /(cant|unid|und|registros|vendidas)/i.test(c.name)

/** Base de facturas de vehículos: trae VIN, chasis o motor por fila */
export const isVehicleBase = (s: FlatSheet) => s.columns.some((c) => /^(vin|chasis|motor)$/i.test(c.name))

export function defaultFlatConfig(s: FlatSheet): FlatConfig {
  // En bases de motos la medida natural son las unidades (cant o conteo de registros)
  const vehicleQty = isVehicleBase(s)
    ? measures(s).find((c) => /^(cant|cantidad|unidades|unidades vendidas)$/i.test(c.name)) ?? measures(s).find((c) => c.derived && c.measureKind === 'number')
    : undefined
  const m =
    vehicleQty ??
    pickBy(
      measures(s).filter((c) => c.type === 'measure' && !c.derived),
      PRIORIDAD_MEDIDA,
    ) ??
    measures(s)[0]
  const dims = s.columns.filter((c) => c.type === 'category' && c.distinct >= 2)
  const d = pickBy(dims, PRIORIDAD_DIMENSION)
  if (!m) return { measure: '', dimension: d?.name ?? null, dateCol: null, month: 'all' }
  const dt = pickBy(dateCols(s), PRIORIDAD_FECHA)
  return { measure: m?.name ?? '', dimension: d?.name ?? null, dateCol: dt?.name ?? null, month: 'all' }
}

export const monthKeyOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Serie mensual completa (sin filtro de mes). */
export function monthlySeries(s: FlatSheet, measure: string, dateCol: string | null, rowMask?: Uint8Array): MonthPoint[] {
  if (!dateCol) return []
  const dates = s.data[dateCol] as (number | null)[]
  const vals = s.data[measure] as (number | null)[]
  const map = new Map<string, MonthPoint>()
  for (let i = 0; i < dates.length; i++) {
    if (rowMask && !rowMask[i]) continue
    const d = dates[i]
    const v = vals[i]
    if (d == null || v == null) continue
    const k = monthKeyOf(d)
    let p = map.get(k)
    if (!p) {
      const [y, m] = k.split('-').map(Number)
      p = { key: k, label: `${monthShort(m)} ${y}`, year: y, month: m, value: 0, count: 0 }
      map.set(k, p)
    }
    p.value += v
    p.count++
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

export function computeFlat(s: FlatSheet, cfg: FlatConfig): FlatView {
  const measure = s.columns.find((c) => c.name === cfg.measure) ?? measures(s)[0]
  if (!measure) throw new Error('La hoja no tiene columnas numéricas para analizar.')
  const dimension = cfg.dimension ? s.columns.find((c) => c.name === cfg.dimension) ?? null : null
  const vals = s.data[measure.name] as (number | null)[]
  const dates = cfg.dateCol ? (s.data[cfg.dateCol] as (number | null)[]) : null
  const dimVals = dimension ? (s.data[dimension.name] as (string | null)[]) : null

  const months = monthlySeries(s, measure.name, cfg.dateCol)
  const inMonth = (i: number) => cfg.month === 'all' || (dates?.[i] != null && monthKeyOf(dates[i]!) === cfg.month)

  // Mes actual = el filtrado, o el último con datos
  const curMonth = cfg.month !== 'all' ? months.find((m) => m.key === cfg.month) ?? null : months[months.length - 1] ?? null
  const curIdx = curMonth ? months.findIndex((m) => m.key === curMonth.key) : -1
  const prevMonth = curIdx > 0 ? months[curIdx - 1] : null
  const yoyMonth = curMonth ? months.find((m) => m.year === curMonth.year - 1 && m.month === curMonth.month) ?? null : null

  // Utilidad (para margen) si la medida es de ventas/valor y existe la columna
  // El margen solo tiene sentido si la medida está en pesos (utilidad / ventas)
  const profitCol = measure.measureKind === 'money' ? s.columns.find((c) => c.type === 'measure' && COLUMNA_UTILIDAD.test(c.name) && c.name !== measure.name) : undefined
  const profitVals = profitCol ? (s.data[profitCol.name] as (number | null)[]) : null

  let total = 0
  let count = 0
  let profit = 0
  const dimMap = new Map<string, DimRow>()
  const secName = pickSecondary(s, dimension?.name ?? null)
  const secVals = secName ? (s.data[secName] as (string | null)[]) : null
  const secMap = new Map<string, number>()

  for (let i = 0; i < vals.length; i++) {
    const v = vals[i]
    if (v == null) continue
    const mk = dates?.[i] != null ? monthKeyOf(dates[i]!) : null

    if (dimVals) {
      const key = dimVals[i] ?? '(Sin dato)'
      let row = dimMap.get(key)
      if (!row) {
        row = { label: key, short: shortLabel(key), value: 0, count: 0, share: 0, cur: null, prev: null, varPct: null }
        dimMap.set(key, row)
      }
      if (inMonth(i)) {
        row.value += v
        row.count++
      }
      if (mk && curMonth && mk === curMonth.key) row.cur = (row.cur ?? 0) + v
      if (mk && prevMonth && mk === prevMonth.key) row.prev = (row.prev ?? 0) + v
    }

    if (!inMonth(i)) continue
    total += v
    count++
    if (profitVals) profit += profitVals[i] ?? 0
    if (secVals) {
      const k = secVals[i] ?? '(Sin dato)'
      secMap.set(k, (secMap.get(k) ?? 0) + v)
    }
  }

  const byDim = [...dimMap.values()]
    .filter((r) => r.count > 0 || r.cur != null || r.prev != null)
    .map((r) => ({ ...r, share: total ? r.value / total : 0, varPct: variation(r.cur, r.prev) }))
    .sort((a, b) => b.value - a.value)

  let secondary: FlatView['secondary'] = null
  if (secName && secMap.size >= 2) {
    const sorted = [...secMap.entries()].sort((a, b) => b[1] - a[1])
    const top = sorted.slice(0, 6)
    const rest = sorted.slice(6).reduce((a, [, v]) => a + v, 0)
    if (rest) top.push(['Otros', rest])
    secondary = { column: secName, rows: top.map(([label, value]) => ({ label, value, share: total ? value / total : 0 })) }
  }

  return {
    measure,
    dimension,
    total,
    count,
    avg: count ? total / count : null,
    profit: profitVals ? profit : null,
    margin: profitVals && total ? profit / total : null,
    months,
    yoy: buildYoy(months),
    curMonth,
    prevMonth,
    yoyMonth,
    byDim,
    secondary,
  }
}

/** Dimensión secundaria para la dona: la siguiente en prioridad, con pocas categorías. */
function pickSecondary(s: FlatSheet, primary: string | null): string | null {
  const cands = s.columns.filter((c) => c.type === 'category' && c.name !== primary && c.distinct >= 2 && c.distinct <= 30)
  const pref = [/marca/i, /modelo/i, /financiera|forma.?de.?pago/i, /grupo|subgrupo/i, /motivo|tipo|linea/i, /estado/i]
  for (const re of pref) {
    const f = cands.find((c) => re.test(c.name))
    if (f) return f.name
  }
  return cands[0]?.name ?? null
}

/** Año dominante de una base (para etiquetar documentos: "2026" vs "2025"). */
export function dominantYear(s: FlatSheet, dateCol: string | null): number | null {
  if (!dateCol || !s.data[dateCol]) return null
  const counts = new Map<number, number>()
  for (const ms of s.data[dateCol] as (number | null)[]) {
    if (ms == null) continue
    const y = new Date(ms).getUTCFullYear()
    counts.set(y, (counts.get(y) ?? 0) + 1)
  }
  let best: number | null = null
  let max = 0
  for (const [y, c] of counts) if (c > max) [best, max] = [y, c]
  return best
}
