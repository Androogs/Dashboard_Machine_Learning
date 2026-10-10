import type { FlatSheet, MatrixSheet, PivotSheet, Report, RuntSheet } from '@/types/report'
import { computeFlat, defaultFlatConfig, dimensions, measures } from '@/analysis/flat'
import { computeFlatPair, computeMatrixPair } from '@/analysis/compare'
import { buildEnv, defaultEnvConfig, topGrowth } from '@/analysis/env'
import { defaultMatrixConfig } from '@/analysis/matrix'
import { fmtInt, fmtPct, fmtVar, variation } from '@/lib/format'
import { flatFormat } from '@/analysis/flatFormat'
import { valueFormat } from '@/lib/units'
import { COLOR_COMPARACION } from '@/config/negocio'
import logoUrl from '@/assets/logo-sumoto.png?inline'

type SingleSheet = MatrixSheet | FlatSheet | PivotSheet | RuntSheet
type TableRow = Array<string | number | null>

/** Franjas de color de los KPIs (mismo sistema que el dashboard). */
const STRIPE = { blue: '#378ADD', green: '#1D9E75', amber: '#BA7517', coral: '#D85A30' } as const
type StripeTone = keyof typeof STRIPE

const REPORT_ACCENT = '#378ADD'

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

function table(headers: string[], rows: TableRow[], caption?: string, foot?: string): string {
  if (!rows.length) return '<p class="empty">No hay filas con datos para mostrar.</p>'
  return `<div class="table-wrap">${caption ? `<div class="table-cap">${escapeHtml(caption)}</div>` : ''}<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<td class="${i === 0 ? 'cell-lead' : 'cell-num'}">${render(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>${foot ? `<p class="table-foot">${escapeHtml(foot)}</p>` : ''}</div>`
}

/** Una celda puede ser texto, número o un fragmento HTML ya construido (ej: pastilla de variación). */
function render(cell: string | number | null): string {
  return typeof cell === 'string' && cell.startsWith('\u0000html:') ? cell.slice(6) : escapeHtml(cell)
}
const html = (markup: string) => `\u0000html:${markup}`

function kpis(items: Array<{ label: string; value: string; detail?: string; tone?: StripeTone; delta?: number | null }>): string {
  return `<div class="kpis">${items.map((item) => {
    const tone = item.tone ?? 'blue'
    const delta = item.delta
    const deltaMarkup = delta == null ? '' : `<b class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(delta))}</b> `
    return `<article class="kpi"><i class="kpi-stripe" style="background:${STRIPE[tone]}"></i><span class="kpi-label">${escapeHtml(item.label)}</span><strong class="kpi-value">${escapeHtml(item.value)}</strong>${deltaMarkup || item.detail ? `<small class="kpi-note">${deltaMarkup}${escapeHtml(item.detail ?? '')}</small>` : ''}</article>`
  }).join('')}</div>`
}

/** Leyenda de series (presupuesto vs ejecución, año anterior vs actual). */
function legend(items: Array<{ label: string; color: string }>): string {
  if (!items.length) return ''
  return `<div class="chart-legend">${items.map((item) => `<span><i style="background:${item.color}"></i>${escapeHtml(item.label)}</span>`).join('')}</div>`
}

/** Tarjeta con título para englobar una gráfica o tabla. */
function card(title: string, body: string, legendItems?: Array<{ label: string; color: string }>, className = ''): string {
  return `<section class="chart ${className}"><h3>${escapeHtml(title)}</h3>${legendItems ? legend(legendItems) : ''}${body}</section>`
}

function barChart(items: Array<{ label: string; value: number; display: string }>, title: string, legendItems?: Array<{ label: string; color: string }>): string {
  const sorted = [...items].filter((item) => Number.isFinite(item.value)).sort((a, b) => b.value - a.value).slice(0, 12)
  if (!sorted.length) return ''
  const max = Math.max(...sorted.map((item) => Math.abs(item.value)), 1)
  const body = sorted.map((item) => `<div class="bar-row"><span class="bar-label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(1, Math.round((Math.max(0, item.value) / max) * 100))}%"></span></span><span class="bar-value">${escapeHtml(item.display)}</span></div>`).join('')
  return card(title, body, legendItems)
}

function trendChart(items: Array<{ label: string; value: number }>, title: string): string {
  if (items.length < 2) return ''
  return card(title, lineSvg([{ color: REPORT_ACCENT, values: items.map((item) => item.value) }], items.map((item) => item.label)))
}

/** SVG de líneas reutilizable (una o varias series). */
function lineSvg(series: Array<{ color: string; values: (number | null)[] }>, labels: string[], formatValue: (value: number) => string = fmtInt): string {
  const width = 800
  const height = 220
  const padX = 26
  const padTop = 18
  const padBottom = 30
  const all = series.flatMap((s) => s.values.map((v) => v ?? 0))
  const max = Math.max(1, ...all)
  const ys = all.some((v) => v < 0)
  const min = ys ? Math.min(0, ...all) : 0
  const span = max - min || 1
  const x = (i: number) => padX + (labels.length <= 1 ? 0 : (i / (labels.length - 1)) * (width - padX * 2))
  const y = (v: number) => height - padBottom - ((v - min) / span) * (height - padTop - padBottom)
  const paths = series.map((s) => {
    const pts = s.values.map((v, i) => `${x(i)},${y(v ?? 0)}`).join(' ')
    const dots = s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v ?? 0)}" r="3.5" fill="${s.color}"><title>${escapeHtml(labels[i] ?? '')}: ${escapeHtml(formatValue(v ?? 0))}</title></circle>`).join('')
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />${dots}`
  }).join('')
  const step = Math.max(1, Math.ceil(labels.length / 10))
  const ticks = labels.map((label, i) =>
    i % step === 0 || i === labels.length - 1
      ? `<text x="${x(i)}" y="${height - 8}" text-anchor="middle">${escapeHtml(label)}</text>`
      : '',
  ).join('')
  return `<svg class="trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(labels.join(', '))}"><line x1="${padX}" y1="${y(min)}" x2="${width - padX}" y2="${y(min)}" stroke="#e3e8f0" stroke-width="1" />${paths}${ticks}</svg>`
}

function budgetBars(rows: Array<{ label: string; budget: number | null; execution: number | null }>, title: string, format: (value: number | null | undefined) => string): string {
  if (!rows.length) return ''
  const max = Math.max(1, ...rows.flatMap((row) => [row.budget ?? 0, row.execution ?? 0]))
  const series = [
    { key: 'budget', label: 'Presupuesto', className: 'budget-fill' },
    { key: 'execution', label: 'Ejecución', className: 'execution-fill' },
  ] as const
  const body = rows.map((row) => `<div class="budget-row"><strong>${escapeHtml(row.label)}</strong><div>${series.map(({ key, label, className }) => `<div class="budget-series"><span>${label}</span><span class="paired-track"><i class="${className}" style="width:${Math.max(0, Math.round(((row[key] ?? 0) / max) * 100))}%"></i></span><b>${escapeHtml(format(row[key]))}</b></div>`).join('')}</div></div>`).join('')
  return card(title, body, [{ label: 'Presupuesto', color: COLOR_COMPARACION }, { label: 'Ejecución', color: REPORT_ACCENT }])
}

function budgetTrendChart(labels: string[], budget: (number | null)[], execution: (number | null)[], title: string): string {
  if (labels.length < 2) return ''
  const body = lineSvg([
    { color: COLOR_COMPARACION, values: budget },
    { color: REPORT_ACCENT, values: execution },
  ], labels, fmtInt)
  return card(title, body, [{ label: 'Presupuesto', color: COLOR_COMPARACION }, { label: 'Ejecución', color: REPORT_ACCENT }])
}

/** Barras horizontales pareadas (periodo anterior vs actual). */
function pairedBars(rows: Array<{ label: string; prev: number | null; cur: number | null }>, title: string, prevLabel: string | null, curLabel: string, format: (value: number | null | undefined) => string): string {
  if (!rows.length) return ''
  const max = Math.max(1, ...rows.flatMap((row) => [row.prev ?? 0, row.cur ?? 0]))
  const series = [
    ...(prevLabel ? [{ key: 'prev' as const, label: prevLabel, className: 'budget-fill' }] : []),
    { key: 'cur' as const, label: curLabel, className: 'execution-fill' },
  ]
  const body = rows.map((row) => `<div class="budget-row"><strong title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</strong><div>${series.map(({ key, label, className }) => `<div class="budget-series"><span>${escapeHtml(label)}</span><span class="paired-track"><i class="${className}" style="width:${Math.max(0, Math.round(((row[key] ?? 0) / max) * 100))}%"></i></span><b>${escapeHtml(format(row[key]))}</b></div>`).join('')}</div></div>`).join('')
  return card(title, body, series.map(({ label, key }) => ({ label, color: key === 'cur' ? REPORT_ACCENT : COLOR_COMPARACION })))
}

function budgetSummaryReport(sheet: MatrixSheet, env: ReturnType<typeof buildEnv>, format: ReturnType<typeof valueFormat>): string {
  const rows = [...env.rows].sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0))
  const total = env.total
  const budgetMetric = sheet.metrics.find((metric) => metric.role === 'target')
  const budgetByMonth = env.monthLabels.map((_, index) => {
    const periodKey = `${env.cut.year}-${String(index + 1).padStart(2, '0')}`
    const column = budgetMetric
      ? sheet.columns.findIndex((item) => item.metricKey === budgetMetric.key && item.period?.key === periodKey)
      : -1
    return column < 0
      ? null
      : sheet.rows.filter((row) => row.type === 'item').reduce((sum, row) => sum + (row.values[column] ?? 0), 0)
  })
  const max = Math.max(1, ...rows.map((row) => row.cur ?? 0))
  const tableRows: TableRow[] = rows.map((row) => [
    row.label,
    format.full(row.target),
    format.full(row.cur),
    row.target ? fmtPct((row.cur ?? 0) / row.target) : '—',
    total.cur ? fmtPct((row.cur ?? 0) / total.cur) : '—',
    html(`<span class="inline-track"><i style="width:${Math.max(2, Math.round(((Math.max(0, row.cur ?? 0)) / max) * 100))}%"></i></span>`),
  ])
  const detail = detailTable(
    ['Marca', 'Presupuesto', 'Ejecución', 'Cumplimiento', 'Participación', 'Tendencia'],
    tableRows,
    [
      'Total',
      format.full(total.target),
      format.full(total.cur),
      total.target ? fmtPct(total.cur / total.target) : '—',
      '100 %',
      '',
    ],
    `* Acumulado del presupuesto y la ejecución a ${env.cut.label}. Participación sobre la ejecución total ${format.compact(total.cur)}.`,
  )
  return `${kpis([
    { label: 'Presupuesto', value: format.compact(total.target), detail: env.rangeLabel, tone: 'blue' },
    { label: 'Ejecución', value: format.compact(total.cur), detail: env.rangeLabel, tone: 'green' },
    { label: 'Cumplimiento de presupuesto', value: total.target ? fmtPct(total.cur / total.target) : '—', detail: `Presupuesto ${format.compact(total.target)}`, tone: 'amber' },
  ])}${budgetBars(rows.map((row) => ({ label: row.label, budget: row.target, execution: row.cur })), `Presupuesto y ejecución por marca — ${env.curLabel}`, format.compact)}${budgetTrendChart(env.monthLabels, budgetByMonth, total.mCur, `Evolución mensual de presupuesto y ejecución — ${env.cut.year}`)}${detail}`
}

/** Tabla de detalle con fila de total y nota al pie. */
function detailTable(headers: string[], rows: TableRow[], footer: TableRow, foot?: string): string {
  if (!rows.length) return '<p class="empty">No hay filas con datos para mostrar.</p>'
  return `<div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => `<td class="${i === 0 ? 'cell-lead' : 'cell-num'}">${render(cell)}</td>`).join('')}</tr>`).join('')}</tbody><tfoot><tr>${footer.map((cell, i) => `<td class="${i === 0 ? 'cell-lead' : 'cell-num'}">${render(cell)}</td>`).join('')}</tr></tfoot></table>${foot ? `<p class="table-foot">${escapeHtml(foot)}</p>` : ''}</div>`
}

function matrixReport(sheet: MatrixSheet): string {
  const config = defaultEnvConfig(sheet)
  const env = buildEnv(sheet, sheet.presentation === 'budget-summary' ? { ...config, mode: 'acum' } : config)
  const format = valueFormat(env.unit)
  if (sheet.presentation === 'budget-summary') return budgetSummaryReport(sheet, env, format)
  const rows = [...env.rows].sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0))
  const total = env.total
  const grow = topGrowth(env.rows)
  const targetLabel = sheet.metrics.find((metric) => metric.role === 'target')?.label ?? 'Meta'
  const details = rows.map((row) => [
    row.label,
    format.full(row.cur),
    format.full(row.prev),
    format.full(row.target),
    row.target && row.cur != null ? fmtPct(row.cur / row.target) : '—',
    row.prev ? fmtPct(((row.cur ?? 0) - row.prev) / Math.abs(row.prev)) : '—',
    total.cur ? fmtPct((row.cur ?? 0) / total.cur) : '—',
  ]) as TableRow[]
  const top = rows.slice(0, 12)
  const charts = [
    pairedBars(
      top.map((row) => ({ label: row.short || row.label, prev: row.prev, cur: row.cur })),
      `${env.metric.label} por ${env.dim} — ${env.prevLabel ?? ''} vs ${env.curLabel}`,
      env.prevLabel,
      env.curLabel,
      format.compact,
    ),
    budgetTrendChart(env.monthLabels, total.mPrev.some((v) => v != null) ? total.mPrev : new Array(env.monthLabels.length).fill(null), total.mCur, `Evolución mensual — ${total.mPrev.some((v) => v != null) ? `${env.cut.year - 1} vs ` : ''}${env.cut.year}`),
  ].join('')
  const detail = table(
    [env.dim, env.curLabel, env.prevLabel ?? 'Comparación', targetLabel, 'Cumplimiento', 'Variación', 'Participación'],
    details,
    `${env.metric.label} por ${env.dim}`,
    `* ${env.mode === 'acum' ? `Acumulado ${env.rangeLabel}` : env.rangeLabel}. Ordenado por volumen ${env.curLabel} desc.`,
  )
  return `${kpis([
    { label: `${env.metric.label} ${env.curLabel}`, value: format.compact(total.cur), detail: env.rangeLabel, tone: 'blue', delta: variation(total.cur, total.prev) },
    { label: env.prevLabel ? `${env.metric.label} ${env.prevLabel}` : 'Periodo anterior', value: env.prevLabel ? format.compact(total.prev) : '—', tone: 'green' },
    { label: 'Cumplimiento', value: total.target ? fmtPct(total.cur / total.target) : '—', detail: total.target ? `${targetLabel} ${format.compact(total.target)}` : `Sin ${targetLabel.toLowerCase()} disponible`, tone: 'amber' },
    { label: 'Mayor crecimiento', value: grow ? fmtVar(grow.var) : '—', detail: grow?.label ?? 'Sin comparación disponible', tone: 'coral' },
  ])}${charts}${detail}`
}

function flatReport(sheet: FlatSheet): string {
  const config = defaultFlatConfig(sheet)
  const view = computeFlat(sheet, config)
  const format = flatFormat(sheet, view.measure)
  const rows = view.byDim.map((row) => [
    row.label,
    format.full(row.value),
    fmtPct(row.share),
    fmtInt(row.count),
    format.full(row.cur),
    format.full(row.prev),
    row.varPct == null ? '—' : fmtVar(row.varPct),
  ])
  const monthlyRows = view.months.map((month) => [month.label, format.full(month.value), fmtInt(month.count)])
  const dimensionChart = view.byDim.slice(0, 12).map((row) => ({ label: row.label, value: row.value, display: format.compact(row.value) }))
  const cards = kpis([
    { label: view.measure.name, value: format.compact(view.total), detail: `${fmtInt(view.count)} registros`, tone: 'blue' },
    { label: 'Promedio por registro', value: format.compact(view.avg), tone: 'green' },
    { label: 'Categorías', value: fmtInt(view.byDim.length), detail: view.dimension?.name ?? 'Sin dimensión', tone: 'amber' },
    { label: 'Margen de utilidad', value: view.margin == null ? '—' : fmtPct(view.margin), tone: 'coral' },
  ])
  const charts = [
    trendChart(view.months.map((month) => ({ label: month.label, value: month.value })), `Evolución mensual de ${view.measure.name}`),
    barChart(dimensionChart, `${view.measure.name} por ${view.dimension?.name ?? 'categoría'}`),
  ].join('')
  const detail = view.dimension
    ? table([view.dimension.name, view.measure.name, 'Participación', 'Registros', 'Último mes', 'Mes anterior', 'Variación'], rows, 'Detalle completo por categoría')
    : ''
  return `${cards}${charts}${detail}${view.months.length ? table(['Periodo', view.measure.name, 'Registros'], monthlyRows, 'Serie mensual completa') : ''}`
}

function pivotReport(sheet: PivotSheet): string {
  const rows = sheet.rows.map((row) => {
    const values = sheet.series.map((_, index) => row.values[index] ?? 0)
    const total = values.reduce((sum, value) => sum + value, 0)
    return { label: row.label, values, total }
  }).sort((a, b) => b.total - a.total)
  const total = rows.reduce((sum, row) => sum + row.total, 0)
  const seriesTotals = sheet.series.map((_, index) => rows.reduce((sum, row) => sum + row.values[index], 0))
  const chart = barChart(seriesTotals.map((value, index) => ({ label: sheet.series[index], value, display: fmtInt(value) })), `${sheet.measureLabel} por categoría`)
  return `${kpis([
    { label: 'Total', value: fmtInt(total), detail: sheet.measureLabel, tone: 'blue' },
    { label: sheet.dimensionLabel, value: fmtInt(rows.length), detail: 'Categorías', tone: 'green' },
    { label: 'Categoría líder', value: rows[0]?.label ?? '—', detail: rows[0] ? fmtInt(rows[0].total) : '', tone: 'amber' },
    { label: 'Serie líder', value: sheet.series[seriesTotals.indexOf(Math.max(...seriesTotals))] ?? '—', tone: 'coral' },
  ])}${chart}${table(
    [sheet.dimensionLabel, ...sheet.series, 'Total', 'Participación'],
    rows.map((row) => [row.label, ...row.values.map(fmtInt), fmtInt(row.total), total ? fmtPct(row.total / total) : '—']),
    sheet.measureLabel,
  )}`
}

function runtReport(sheet: RuntSheet): string {
  const years = sheet.years.map(String)
  const markets = sheet.markets.map((market) => {
    const rows = market.rows.map((row) => [
      row.marca,
      fmtInt(row.prev),
      market.total.prev ? fmtPct((row.prev ?? 0) / market.total.prev) : '—',
      fmtInt(row.cur),
      market.total.cur ? fmtPct((row.cur ?? 0) / market.total.cur) : '—',
      row.prev ? fmtPct(((row.cur ?? 0) - row.prev) / Math.abs(row.prev)) : '—',
    ])
    const chart = barChart(market.rows.map((row) => ({ label: row.marca, value: row.cur ?? 0, display: fmtInt(row.cur) })), `Volumen ${market.name} ${years[1]}`)
    return `<h3 class="subtitle">Mercado ${escapeHtml(market.name)}</h3>${kpis([
      { label: years[0], value: fmtInt(market.total.prev), tone: 'blue' },
      { label: years[1], value: fmtInt(market.total.cur), detail: sheet.cutoff ? `Acumulado a ${sheet.cutoff}` : '', tone: 'green', delta: variation(market.total.cur, market.total.prev) },
      { label: 'Variación', value: market.total.prev ? fmtVar((market.total.cur - market.total.prev) / Math.abs(market.total.prev)) : '—', tone: 'amber' },
    ])}${chart}${table(['Marca', years[0], `Participación ${years[0]}`, years[1], `Participación ${years[1]}`, 'Variación'], rows, `Participación de mercado — ${market.name}`)}`
  }).join('')
  const own = sheet.own ? `<h3 class="subtitle">Ventas propias — ${escapeHtml(sheet.own.name)}</h3>${table(['Marca', years[0], years[1], 'Variación'], sheet.own.rows.map((row) => [
    row.marca, fmtInt(row.prev), fmtInt(row.cur), row.prev ? fmtVar(((row.cur ?? 0) - row.prev) / Math.abs(row.prev)) : '—',
  ]), 'Ventas propias')}` : ''
  return `${markets}${own}`
}

function singleReport(sheet: SingleSheet): string {
  if (sheet.kind === 'matrix') return matrixReport(sheet)
  if (sheet.kind === 'flat') return flatReport(sheet)
  if (sheet.kind === 'pivot') return pivotReport(sheet)
  return runtReport(sheet)
}

function matrixPairReport(a: MatrixSheet, b: MatrixSheet): string {
  const config = defaultMatrixConfig(a)
  const view = computeMatrixPair(a, b, config)
  const format = valueFormat(view.unit)
  const rows = view.items.map((row) => [
    row.label,
    format.full(row.a),
    format.full(row.b),
    format.full(row.a == null || row.b == null ? null : row.a - row.b),
    row.varPct == null ? '—' : fmtVar(row.varPct),
    row.complianceA == null ? '—' : fmtPct(row.complianceA),
    row.complianceB == null ? '—' : fmtPct(row.complianceB),
  ])
  return `${kpis([
    { label: view.labels[0], value: format.compact(view.totals.a), detail: view.periodA, tone: 'blue', delta: view.totals.varPct },
    { label: view.labels[1], value: format.compact(view.totals.b), detail: view.periodB, tone: 'green' },
    { label: 'Variación', value: view.totals.varPct == null ? '—' : fmtVar(view.totals.varPct), tone: 'amber' },
    { label: 'Métrica', value: view.metricLabel, tone: 'coral' },
  ])}${barChart(view.groups.map((row) => ({ label: row.label, value: row.a, display: format.compact(row.a) })), `${view.metricLabel} por grupo`)}${table(['Elemento', view.labels[0], view.labels[1], 'Diferencia', 'Variación', `Cumplimiento ${view.labels[0]}`, `Cumplimiento ${view.labels[1]}`], rows)}`
}

function flatPairReport(a: FlatSheet, b: FlatSheet): string {
  const sharedMeasures = measures(a).filter((measure) => measures(b).some((other) => other.name === measure.name))
  const configA = defaultFlatConfig(a)
  const measure = sharedMeasures.find((item) => item.name === configA.measure) ?? sharedMeasures[0]
  if (!measure) return '<p class="empty">Los documentos no comparten una medida numérica comparable.</p>'

  const sharedDimensions = dimensions(a).filter((dimension) => dimensions(b).some((other) => other.name === dimension.name))
  const sharedDates = a.columns.filter((column) => column.type === 'date' && b.columns.some((other) => other.name === column.name))
  const cfg = {
    measure: measure.name,
    dimension: sharedDimensions.some((dimension) => dimension.name === configA.dimension) ? configA.dimension : sharedDimensions[0]?.name ?? null,
    dateCol: sharedDates.some((column) => column.name === configA.dateCol) ? configA.dateCol : sharedDates[0]?.name ?? null,
    commonMonthsOnly: true,
  }
  const view = computeFlatPair(a, b, cfg)
  const measureColumn = measures(a).find((column) => column.name === cfg.measure)!
  const format = flatFormat(a, measureColumn)
  const rows = view.byDim.map((row) => [
    row.label,
    format.full(row.a),
    format.full(row.b),
    format.full(row.varAbs),
    row.varPct == null ? '—' : fmtVar(row.varPct),
    fmtPct(row.shareA),
  ])
  const monthly = view.monthly.map((point) => [point.label, format.full(point.a), format.full(point.b), point.varPct == null ? '—' : fmtVar(point.varPct)])
  const series = view.monthly.map((point) => ({ label: point.label, value: point.a ?? 0 }))
  return `${kpis([
    { label: view.labels[0], value: format.compact(view.totals.a), detail: measure.name, tone: 'blue', delta: view.totals.varPct },
    { label: view.labels[1], value: format.compact(view.totals.b), detail: measure.name, tone: 'green' },
    { label: 'Variación total', value: view.totals.varPct == null ? '—' : fmtVar(view.totals.varPct), tone: 'amber' },
    { label: 'Registros', value: `${fmtInt(view.totals.countA)} vs ${fmtInt(view.totals.countB)}`, tone: 'coral' },
  ])}${trendChart(series, `${measure.name} mensual`)}${cfg.dimension ? table([cfg.dimension, view.labels[0], view.labels[1], 'Diferencia', 'Variación', 'Participación'], rows) : ''}${monthly.length ? table(['Mes', view.labels[0], view.labels[1], 'Variación'], monthly, 'Comparativo mensual') : ''}`
}

function reportBody(report: Report): string {
  if (report.mode === 'single') return singleReport(report.sheet)
  if (report.a.kind === 'matrix' && report.b.kind === 'matrix') return matrixPairReport(report.a, report.b)
  if (report.a.kind === 'flat' && report.b.kind === 'flat') return flatPairReport(report.a, report.b)
  return '<p class="empty">Estas hojas tienen estructuras distintas y no se pueden comparar directamente.</p>'
}

function reportSource(report: Report): string {
  if (report.mode === 'single') return report.sheet.fileName
  return `${report.a.fileName} ↔ ${report.b.fileName}`
}

function safeFileName(value: string): string {
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return normalized.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'informe-dashboard'
}

export function downloadHtmlReport(reports: Report[], isSample = false): void {
  if (!reports.length) throw new Error('No hay reportes para exportar.')
  const createdAt = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())
  const contents = reports.map((report, index) => {
    const id = `reporte-${index + 1}`
    const band = `<div class="band"><img class="band-logo" src="${logoUrl}" alt="Sumoto S.A." /><div class="band-info"><p class="band-title">${escapeHtml(report.title)}</p><p class="band-sub">${escapeHtml(reportSource(report))}</p><span class="band-badge">Reporte ${index + 1} de ${reports.length}</span></div></div>`
    return `<article class="report" id="${id}">${band}${reportBody(report)}</article>`
  }).join('')
  const toc = reports.map((report, index) => `<li><a href="#reporte-${index + 1}"><span class="toc-num">${String(index + 1).padStart(2, '0')}</span><span class="toc-body"><b>${escapeHtml(report.title)}</b><small>${escapeHtml(reportSource(report))}</small></span></a></li>`).join('')
  const sampleNote = isSample ? '<p class="sample">Este informe contiene datos de ejemplo ficticios.</p>' : ''
  const docWord = reports.length === 1 ? '1 reporte' : `${reports.length} reportes`
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Informe compilado de los reportes cargados en el dashboard SUMOTO">
<title>Informe ejecutivo SUMOTO</title>
<style>
:root{color-scheme:light;--navy:#1a2b5e;--blue:#378add;--green:#1D9E75;--ink:#17233d;--muted:#68758a;--line:#e3e8f0;--line-soft:#edf1f7;--paper:#fff;--bg:#eef1f6;--soft:#f4f7fb}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 Inter,"Segoe UI",system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:'tnum' 1}
.page{max-width:1180px;margin:0 auto;padding:34px 26px 64px}
.num{font-variant-numeric:tabular-nums}
/* ---- Portada ---- */
.cover{position:relative;overflow:hidden;padding:40px 38px;border-radius:20px;color:#fff;background:radial-gradient(120% 140% at 100% 0%,#33619e 0%,#1f3a70 45%,#16264d 100%);box-shadow:0 18px 44px #16264d33}
.cover::after{content:"";position:absolute;right:-90px;top:-90px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,#ffffff22,transparent 68%)}
.cover-logo{height:46px;width:auto;object-fit:contain;margin-bottom:26px;filter:brightness(0) invert(1)}
.cover .eyebrow{position:relative;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#9dc0f2}
.cover h1{position:relative;margin:10px 0 8px;font-size:34px;line-height:1.12;letter-spacing:-.02em;font-weight:650;max-width:640px}
.cover p{position:relative;margin:0;color:#cfdcf5;font-size:14px;max-width:620px}
.cover-meta{position:relative;display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}
.cover-meta span{display:inline-flex;align-items:center;gap:7px;padding:6px 13px;border-radius:999px;background:#ffffff1a;border:1px solid #ffffff2e;font-size:12px;font-weight:500;color:#eaf1ff}
.sample{position:relative;margin-top:16px;padding:9px 14px;border-radius:10px;background:#fff4d6;color:#7a5410;font-size:12px;font-weight:500;display:inline-block}
/* ---- Índice ---- */
.contents{margin-top:22px;padding:26px 26px 20px;background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:0 4px 16px #17233d0a}
.contents h2{margin:0 0 6px;color:var(--navy);font-size:15px;letter-spacing:-.01em}
.contents ol{list-style:none;padding:0;margin:12px 0 0}
.contents li{border-bottom:1px solid var(--line-soft)}.contents li:last-child{border-bottom:0}
.contents a{display:flex;gap:14px;align-items:baseline;padding:12px 8px;border-radius:10px;text-decoration:none;transition:background .15s}
.contents a:hover{background:var(--soft)}
.toc-num{flex:none;color:var(--blue);font-size:12px;font-weight:700;letter-spacing:.05em;width:26px}
.toc-body{min-width:0}
.toc-body b{display:block;color:var(--navy);font-size:13.5px;font-weight:600}
.toc-body small{display:block;color:var(--muted);font-size:11.5px;overflow-wrap:anywhere}
/* ---- Reporte ---- */
.report{margin-top:22px;padding:26px;background:var(--paper);border:1px solid var(--line);border-radius:16px;box-shadow:0 4px 16px #17233d0a;scroll-margin-top:20px}
.band{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:16px 18px;margin-bottom:20px;border-radius:13px;background:linear-gradient(120deg,#f4f7fb,#eaf1fb);border:1px solid var(--line)}
.band-logo{height:34px;width:auto;object-fit:contain}
.band-info{margin-left:auto;text-align:right;min-width:0}
.band-title{margin:0;font-size:16px;font-weight:650;color:var(--navy);letter-spacing:-.01em}
.band-sub{margin:1px 0 0;color:var(--muted);font-size:11.5px;overflow-wrap:anywhere}
.band-badge{display:inline-block;margin-top:7px;padding:3px 11px;border-radius:999px;background:#1a2b5e14;border:1px solid #1a2b5e26;color:var(--navy);font-size:10.5px;font-weight:600}
.subtitle{margin:26px 0 10px;color:var(--navy);font-size:15px;font-weight:650;letter-spacing:-.01em}
/* ---- KPIs ---- */
.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:13px;margin:4px 0 4px}
.kpi{position:relative;overflow:hidden;min-width:0;padding:16px 16px 14px;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 2px 10px #17233d08}
.kpi-stripe{position:absolute;left:0;right:0;top:0;height:3px}
.kpi-label{display:block;color:var(--muted);font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.kpi-value{display:block;margin-top:6px;color:var(--navy);font-size:24px;line-height:1.15;font-weight:650;letter-spacing:-.02em;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.kpi-note{display:block;margin-top:6px;color:var(--muted);font-size:11.5px;font-weight:500}
.delta{font-weight:700}.delta.up{color:#0F6E56}.delta.down{color:#B0331A}
/* ---- Tarjetas / gráficas ---- */
.chart{margin:16px 0;padding:18px 20px;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 2px 10px #17233d08;break-inside:avoid}
.chart h3{margin:0 0 12px;color:var(--navy);font-size:12.5px;font-weight:650;letter-spacing:.01em}
.bar-row{display:grid;grid-template-columns:minmax(100px,190px) minmax(80px,1fr) minmax(64px,128px);align-items:center;gap:12px;margin:9px 0}
.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:var(--ink)}
.bar-track{height:12px;overflow:hidden;border-radius:8px;background:var(--line-soft)}
.bar-fill{display:block;height:100%;border-radius:8px;background:linear-gradient(90deg,#56a0e6,#1f4795)}
.bar-value{text-align:right;font-size:11.5px;font-weight:650;font-variant-numeric:tabular-nums;color:var(--navy)}
.trend{display:block;width:100%;height:216px}
.trend text{fill:var(--muted);font-size:11px}
.chart-legend{display:flex;flex-wrap:wrap;gap:16px;margin:-4px 0 12px;color:var(--muted);font-size:11px}
.chart-legend span{display:flex;align-items:center;gap:6px}
.chart-legend i{width:11px;height:11px;border-radius:3px}
.budget-fill{background:#b5d4f4}.execution-fill{background:#378add}
.budget-row{display:grid;grid-template-columns:minmax(90px,150px) 1fr;gap:14px;align-items:center;margin:12px 0}
.budget-row>strong{font-size:12px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.budget-series{display:grid;grid-template-columns:78px 1fr minmax(66px,104px);align-items:center;gap:9px;margin:6px 0;font-size:11px;color:var(--muted)}
.paired-track,.inline-track{display:block;height:9px;overflow:hidden;border-radius:8px;background:var(--line-soft)}
.paired-track i,.inline-track i{display:block;height:100%;border-radius:8px}
.budget-series b{text-align:right;color:var(--navy);font-variant-numeric:tabular-nums;font-weight:600}
.inline-track{min-width:74px;width:100%;max-width:160px}
.inline-track i{background:linear-gradient(90deg,#56a0e6,#1f4795)}
/* ---- Tablas ---- */
.table-wrap{overflow:auto;margin:16px 0;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 2px 10px #17233d08;break-inside:avoid}
.table-cap{padding:14px 16px 10px;color:var(--navy);font-weight:650;font-size:13px;border-bottom:1px solid var(--line-soft)}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:10px 13px;border-bottom:1px solid var(--line-soft);text-align:right;vertical-align:middle;font-variant-numeric:tabular-nums}
th{position:sticky;top:0;background:#f3f6fb;color:#52617a;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
th:first-child,td.cell-lead{text-align:left}
td.cell-lead{font-weight:600;color:var(--ink)}
tbody tr:hover{background:var(--soft)}
tbody tr:nth-child(even){background:#fbfcfe}
tbody tr:nth-child(even):hover{background:var(--soft)}
tfoot td{border-top:2px solid var(--line);border-bottom:0;background:#f6f9fd;font-weight:700;color:var(--navy)}
.table-foot{margin:0;padding:10px 16px;border-top:1px solid var(--line-soft);color:var(--muted);font-size:10.5px;background:#fbfcfe}
.empty{padding:14px 16px;border-radius:10px;background:var(--soft);color:var(--muted)}
/* ---- Pie ---- */
.footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:24px 6px 0;color:var(--muted);font-size:11px}
.footer img{height:22px;width:auto;object-fit:contain;opacity:.65}
@media(max-width:820px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.budget-row{grid-template-columns:minmax(70px,110px) 1fr}}
@media(max-width:760px){.page{padding:16px 12px 34px}.cover{padding:28px 22px}.cover h1{font-size:26px}.report,.contents{padding:16px}.band-info{margin-left:0;text-align:left;width:100%}.bar-row{grid-template-columns:minmax(80px,120px) minmax(40px,1fr) minmax(52px,92px);gap:6px}}
@media print{body{background:#fff}.page{max-width:none;padding:0}.cover,.contents,.report,.chart,.table-wrap{box-shadow:none}.report{break-before:page}.report:first-of-type{break-before:auto}.table-wrap{overflow:visible}.table-wrap table{min-width:0}.kpi,.chart,.table-wrap,.band{break-inside:avoid}th{position:static}.cover,.band,.kpi-stripe,.bar-fill,.inline-track i,.budget-fill,.execution-fill{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
</style>
</head>
<body><main class="page"><header class="cover"><img class="cover-logo" src="${logoUrl}" alt="Sumoto S.A." /><span class="eyebrow">Sistema de Reportes · SUMOTO S.A.</span><h1>Informe ejecutivo compilado</h1><p>Consolidado de desempeño comercial y presupuestal generado desde el dashboard de an&aacute;lisis.</p><div class="cover-meta"><span>${docWord}</span><span>Generado el ${escapeHtml(createdAt)}</span></div>${sampleNote}</header><nav class="contents"><h2>Contenido del informe</h2><ol>${toc}</ol></nav>${contents}<footer class="footer"><img src="${logoUrl}" alt="Sumoto S.A." /><span>Informe HTML generado localmente desde los reportes cargados en el dashboard SUMOTO.</span></footer></main></body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const filename = safeFileName(reports.length === 1 ? reports[0].title : 'Informe ejecutivo SUMOTO')
  link.href = url
  link.download = `${filename}.html`
  document.body.append(link)
  link.click()
  window.setTimeout(() => link.remove(), 1_000)
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
