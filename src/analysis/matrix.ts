/**
 * Análisis de hojas MATRIZ (Informe Comercial).
 *
 * Criterios de cálculo (todos recalculados desde los valores base del Excel):
 *  - Valor:         suma de la métrica seleccionada (ej: TOTAL VENTAS) para el periodo.
 *  - Cumplimiento:  valor / meta del mismo periodo.
 *  - Variación %:   (valor periodo - valor comparación) / |valor comparación|.
 *  - Comparación:   mismo mes del año anterior si existe (año a año);
 *                   si no, el periodo inmediatamente anterior.
 *  - Totales:       suma de las filas de detalle (no se usan las filas TOTAL del Excel,
 *                   que se usan solo para el control de calidad de datos).
 */
import type { MatrixSheet, MetricInfo, Period } from '@/types/report'
import { METRICAS, TOLERANCIA_TOTALES } from '@/config/negocio'
import { monthShort, norm, shortLabel, variation } from '@/lib/format'

export interface MatrixConfig {
  metricKey: string
  periodKey: string
  /** '' = sin comparación */
  compareKey: string
  /** Grupos (marcas) visibles; vacío = todos */
  groups: string[]
}

export interface MatrixItem {
  label: string
  short: string
  group: string
  value: number | null
  target: number | null
  compliance: number | null
  compare: number | null
  varAbs: number | null
  varPct: number | null
  components: Record<string, number | null>
}

export interface MatrixAgg {
  label: string
  value: number
  target: number | null
  compliance: number | null
  compare: number | null
  varPct: number | null
  components: Record<string, number>
  count: number
}

export interface SeriesPoint {
  key: string
  label: string
  year: number
  month: number | null
  /** null = periodo sin datos (ej: meses futuros del año en curso) */
  value: number | null
  target: number | null
  compliance: number | null
}

export interface YoyData {
  years: number[]
  rows: Array<{ month: number; label: string } & Record<string, number | string | null>>
}

export interface QualityIssue {
  where: string
  column: string
  excel: number
  calculated: number
  kind: 'total' | 'ratio' | 'future'
}

export interface MatrixView {
  metric: MetricInfo
  period: Period
  comparePeriod: Period | null
  compareKind: 'yoy' | 'prev' | 'custom' | null
  targetAvailable: boolean
  components: { key: string; label: string }[]
  items: MatrixItem[]
  groups: MatrixAgg[]
  total: MatrixAgg
  series: SeriesPoint[]
  yoy: YoyData | null
}

/* ------------------------------------------------------------------ */

export const valueMetrics = (s: MatrixSheet) => s.metrics.filter((m) => m.role === 'value' && m.periods.length > 0)

function colIndex(s: MatrixSheet, metricKey: string, periodKey: string): number {
  return s.columns.findIndex((c) => c.metricKey === metricKey && c.period?.key === periodKey)
}

const pick = (values: (number | null)[], i: number) => (i >= 0 ? values[i] : null)
const sumN = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0)

/** Periodo de comparación sugerido: mismo mes del año anterior; si no, el anterior. */
export function suggestCompare(metric: MetricInfo, period: Period): { period: Period | null; kind: 'yoy' | 'prev' | null } {
  const yoyKey = period.month ? `${period.year - 1}-${String(period.month).padStart(2, '0')}` : String(period.year - 1)
  const yoy = metric.periods.find((p) => p.key === yoyKey)
  if (yoy) return { period: yoy, kind: 'yoy' }
  const idx = metric.periods.findIndex((p) => p.key === period.key)
  if (idx > 0) return { period: metric.periods[idx - 1], kind: 'prev' }
  return { period: null, kind: null }
}

/** Mes actual ("2026-10"). */
export function currentPeriodKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
/** Último mes cerrado ("2026-09" si hoy es octubre de 2026). Es el máximo periodo por defecto. */
export function lastClosedKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return currentPeriodKey(d)
}
/** ¿El periodo es posterior a hoy? (anual: año mayor al actual) */
export const isFuture = (p: Period, cutoff = currentPeriodKey()) => (p.month ? p.key > cutoff : p.year > Number(cutoff.slice(0, 4)))

/** Periodos con datos reales (algún valor distinto de cero en las filas de detalle). */
export function periodsWithData(s: MatrixSheet, metric: MetricInfo): Period[] {
  const items = s.rows.filter((r) => r.type === 'item')
  return metric.periods.filter((p) => {
    const i = colIndex(s, metric.key, p.key)
    return i >= 0 && items.some((r) => (r.values[i] ?? 0) !== 0)
  })
}

/**
 * Último periodo con datos (evita escoger meses futuros vacíos como "octubre 2026"
 * o meses casi vacíos al final, con menos del 20 % de la mediana de los demás).
 */
export function latestPeriod(s: MatrixSheet, metric: MetricInfo): Period {
  const items = s.rows.filter((r) => r.type === 'item')
  const totalOf = (p: Period) => {
    const i = colIndex(s, metric.key, p.key)
    return Math.abs(sumN(items.map((r) => r.values[i])))
  }
  const raw = periodsWithData(s, metric)
  const totals = raw.map(totalOf).sort((a, b) => a - b)
  const median = totals[Math.floor(totals.length / 2)] ?? 0
  const withData = raw.filter((p) => totalOf(p) >= median * 0.2)
  const past = withData.filter((p) => !isFuture(p, lastClosedKey()))
  return past[past.length - 1] ?? withData[withData.length - 1] ?? metric.periods[metric.periods.length - 1]
}

export function defaultMatrixConfig(s: MatrixSheet): MatrixConfig {
  const vms = valueMetrics(s)
  let metric = vms[0]
  if (s.source === 'bloques') {
    // Tablas por bloques: la métrica principal es la que tiene más periodos (ej: ventas mensuales)
    metric = [...vms].sort((a, b) => b.periods.length - a.periods.length)[0]
  } else {
    for (const re of METRICAS.principal) {
      const found = vms.find((m) => re.test(norm(m.label)))
      if (found) {
        metric = found
        break
      }
    }
  }
  const period = latestPeriod(s, metric)
  const cmp = suggestCompare(metric, period)
  return { metricKey: metric.key, periodKey: period.key, compareKey: cmp.period?.key ?? '', groups: [] }
}

export function computeMatrix(s: MatrixSheet, cfg: MatrixConfig): MatrixView {
  const metric = s.metrics.find((m) => m.key === cfg.metricKey) ?? valueMetrics(s)[0]
  const period = metric.periods.find((p) => p.key === cfg.periodKey) ?? metric.periods[metric.periods.length - 1]
  const comparePeriod = cfg.compareKey ? metric.periods.find((p) => p.key === cfg.compareKey) ?? null : null
  const suggested = suggestCompare(metric, period)
  const compareKind = comparePeriod
    ? suggested.period?.key === comparePeriod.key
      ? suggested.kind
      : comparePeriod.year !== period.year && comparePeriod.month === period.month
        ? 'yoy'
        : 'custom'
    : null

  const vi = colIndex(s, metric.key, period.key)
  const ci = comparePeriod ? colIndex(s, metric.key, comparePeriod.key) : -1
  const targetMetric = s.metrics.find((m) => m.role === 'target' && m.periods.some((p) => p.key === period.key))
  const ti = targetMetric ? colIndex(s, targetMetric.key, period.key) : -1

  // Componentes: otras métricas de valor del mismo periodo (ej: MOSTRADOR y TALLER de TOTAL VENTAS)
  const components = valueMetrics(s)
    .filter((m) => m.key !== metric.key && m.periods.some((p) => p.key === period.key))
    .map((m) => ({ key: m.key, label: m.label, idx: colIndex(s, m.key, period.key) }))

  const visible = (g: string) => cfg.groups.length === 0 || cfg.groups.includes(g)
  const detail = s.rows.filter((r) => r.type === 'item' && visible(r.group))

  const items: MatrixItem[] = detail.map((r) => {
    const value = pick(r.values, vi)
    const target = pick(r.values, ti)
    const compare = pick(r.values, ci)
    const comps: Record<string, number | null> = {}
    for (const c of components) comps[c.key] = pick(r.values, c.idx)
    return {
      label: r.label,
      short: shortLabel(r.label),
      group: r.group,
      value,
      target,
      compliance: target ? (value ?? 0) / target : null,
      compare,
      varAbs: value != null && compare != null ? value - compare : null,
      varPct: variation(value, compare),
      components: comps,
    }
  })

  const aggregate = (label: string, list: MatrixItem[]): MatrixAgg => {
    const value = sumN(list.map((i) => i.value))
    const hasTarget = ti >= 0 && list.some((i) => i.target != null)
    const target = hasTarget ? sumN(list.map((i) => i.target)) : null
    const compare = ci >= 0 ? sumN(list.map((i) => i.compare)) : null
    const comps: Record<string, number> = {}
    for (const c of components) comps[c.key] = sumN(list.map((i) => i.components[c.key]))
    return {
      label,
      value,
      target,
      compliance: target ? value / target : null,
      compare,
      varPct: variation(value, compare),
      components: comps,
      count: list.length,
    }
  }

  const groups = s.groups.filter(visible).map((g) => aggregate(g, items.filter((i) => i.group === g)))

  // Serie histórica del total visible para la métrica.
  // Los periodos sin ningún dato (o en cero después del último mes con ventas) quedan en null.
  const lastWithData = periodsWithData(s, metric).at(-1)?.key ?? ''
  const series: SeriesPoint[] = metric.periods.map((p) => {
    const i = colIndex(s, metric.key, p.key)
    const tm = s.metrics.find((m) => m.role === 'target' && m.periods.some((x) => x.key === p.key))
    const t = tm ? colIndex(s, tm.key, p.key) : -1
    const vals = detail.map((r) => pick(r.values, i))
    const empty = vals.every((v) => v == null) || (p.key > lastWithData && vals.every((v) => !v))
    const value = empty ? null : sumN(vals)
    const target = t >= 0 ? sumN(detail.map((r) => pick(r.values, t))) : null
    return { key: p.key, label: p.label, year: p.year, month: p.month, value, target, compliance: target && value != null ? value / target : null }
  })

  return {
    metric,
    period,
    comparePeriod,
    compareKind,
    targetAvailable: ti >= 0,
    components: components.map(({ key, label }) => ({ key, label })),
    items,
    groups,
    total: aggregate('Total', items),
    series,
    yoy: buildYoy(series),
  }
}

/** Si hay meses de 2+ años, arma la tabla Mes × Año para la gráfica año a año. */
export function buildYoy(series: { year: number; month: number | null; value: number | null }[]): YoyData | null {
  const monthly = series.filter((p) => p.month != null)
  const years = [...new Set(monthly.map((p) => p.year))].sort()
  if (years.length < 2) return null
  const months = [...new Set(monthly.map((p) => p.month as number))].sort((a, b) => a - b)
  const rows = months.map((m) => {
    const row: { month: number; label: string } & Record<string, number | string | null> = { month: m, label: monthShort(m) }
    for (const y of years) row[String(y)] = monthly.find((p) => p.year === y && p.month === m)?.value ?? null
    return row
  })
  return { years, rows }
}

/**
 * Control de calidad: compara las filas TOTAL y los % de cumplimiento del Excel
 * contra los valores recalculados. Detecta fórmulas mal referenciadas.
 */
export function matrixQuality(s: MatrixSheet): QualityIssue[] {
  const issues: QualityIssue[] = []
  const sumCols = s.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.role === 'value' || c.role === 'target')
  const items = s.rows.filter((r) => r.type === 'item')

  for (const r of s.rows) {
    if (r.type === 'item' || r.partial) continue
    const scope = r.type === 'subtotal' ? items.filter((x) => x.group === r.group) : items
    for (const { c, i } of sumCols) {
      const excel = r.values[i]
      if (excel == null) continue
      const calc = sumN(scope.map((x) => x.values[i]))
      const base = Math.max(Math.abs(calc), Math.abs(excel), 1)
      if (Math.abs(excel - calc) / base > TOLERANCIA_TOTALES) {
        issues.push({
          where: r.type === 'subtotal' ? (s.source === 'bloques' ? r.label : `TOTAL ${r.group}`) : 'TOTAL general',
          column: `${c.metricLabel} ${c.period?.label ?? ''}`.trim(),
          excel,
          calculated: calc,
          kind: 'total',
        })
      }
    }
  }

  // Datos en periodos posteriores a hoy (columnas corridas o plantilla mal diligenciada)
  for (const m of s.metrics.filter((x) => x.role === 'value')) {
    for (const p of periodsWithData(s, m).filter((x) => isFuture(x))) {
      const i = colIndex(s, m.key, p.key)
      issues.push({ where: p.label, column: m.label, excel: sumN(items.map((r) => r.values[i])), calculated: 0, kind: 'future' })
    }
  }

  // % de cumplimiento del Excel vs valor/meta recalculado (solo filas de detalle)
  const ratioCols = s.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.role === 'ratio' && /cumpl/.test(c.metricKey) && c.period)
  for (const { c, i } of ratioCols) {
    const target = s.columns.findIndex((x) => x.role === 'target' && x.period?.key === c.period!.key)
    const value = s.columns.findIndex(
      (x) => x.role === 'value' && x.period?.key === c.period!.key && METRICAS.principal.slice(0, 3).some((re) => re.test(x.metricKey)),
    )
    if (target < 0 || value < 0) continue
    for (const r of items) {
      const excel = r.values[i]
      const t = r.values[target]
      if (excel == null || !t) continue
      const calc = (r.values[value] ?? 0) / t
      if (Math.abs(excel - calc) > 0.01) {
        issues.push({ where: r.label, column: `${c.metricLabel} ${c.period!.label}`, excel, calculated: calc, kind: 'ratio' })
      }
    }
  }
  return issues
}
