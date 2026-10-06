/**
 * Gráficas de los entornos de reporte (Chart.js), con el estilo del reporte de gerencia.
 *
 * Todas las ayudas emergentes (tooltips) muestran el valor y además porcentajes:
 *  - participación sobre el total de la serie ("43,5 % del total 2026")
 *  - variación frente a la otra serie ("Var. vs 2025: +11,1 %")
 */
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import type { ChartOptions, TooltipItem } from 'chart.js'
import '../charts/theme'
import { fmtCompact, fmtInt, fmtPct, fmtVar, variation } from '@/lib/format'

/** Ejes: cifras completas por debajo de 10.000 (evita etiquetas repetidas como "1 k, 1 k") */
const tick = (v: number) => (Math.abs(v) < 10_000 ? fmtInt(v) : fmtCompact(v))
import { COLOR_COMPARACION } from '@/config/negocio'

type Fmt = (v: number) => string

const tooltipBase = {
  backgroundColor: 'rgba(255,255,255,0.98)',
  titleColor: 'hsl(224 52% 14%)',
  bodyColor: 'hsl(220 12% 30%)',
  footerColor: 'hsl(220 12% 40%)',
  borderColor: 'hsl(220 16% 86%)',
  borderWidth: 1,
  padding: 10,
  boxPadding: 4,
  titleFont: { weight: 600 as const },
  footerFont: { weight: 500 as const },
}

const axes = (horizontal: boolean) => ({
  x: horizontal
    ? { grid: { color: 'rgba(128,128,128,0.1)' }, border: { display: false }, ticks: { font: { size: 10 }, callback: (v: string | number) => tick(Number(v)) } }
    : { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, autoSkip: false, maxRotation: 45 } },
  y: horizontal
    ? { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } }
    : { grid: { color: 'rgba(128,128,128,0.1)' }, border: { display: false }, ticks: { font: { size: 10 }, callback: (v: string | number) => tick(Number(v)) } },
})

const totalOf = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + Math.max(0, b ?? 0), 0)

/* ------------------------------------------------------------------ */
/* Barras: periodo de comparación vs periodo actual                    */
/* ------------------------------------------------------------------ */

interface PairProps {
  labels: string[]
  prev: (number | null)[] | null
  cur: (number | null)[]
  prevLabel: string | null
  curLabel: string
  /** Un color o un color por barra (ej: color de cada marca) */
  color: string | string[]
  format: Fmt
  height?: number
  horizontal?: boolean
  /** Etiquetas completas para el título del tooltip */
  fullLabels?: string[]
}

export function BarPair({ labels, prev, cur, prevLabel, curLabel, color, format, height = 220, horizontal = false, fullLabels }: PairProps) {
  const tCur = totalOf(cur)
  const tPrev = prev ? totalOf(prev) : 0
  const datasets = [
    ...(prev && prevLabel ? [{ label: prevLabel, data: prev, backgroundColor: COLOR_COMPARACION, borderRadius: 3, maxBarThickness: horizontal ? 14 : 34 }] : []),
    { label: curLabel, data: cur, backgroundColor: color, borderRadius: 3, maxBarThickness: horizontal ? 14 : 34 },
  ]
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: horizontal ? 'y' : 'x',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipBase,
        callbacks: {
          title: (items) => (fullLabels ? fullLabels[items[0].dataIndex] : items[0].label),
          label: (c: TooltipItem<'bar'>) => {
            const val = Number(horizontal ? c.parsed.x : c.parsed.y)
            const tot = c.dataset.label === curLabel ? tCur : tPrev
            return ` ${c.dataset.label}: ${format(val)} (${fmtPct(tot ? val / tot : 0)} del total ${c.dataset.label})`
          },
          footer: (items) => {
            if (!prev) return ''
            const i = items[0].dataIndex
            const d = variation(cur[i], prev[i])
            return d == null ? `Var. vs ${prevLabel}: sin base` : `Var. vs ${prevLabel}: ${fmtVar(d)}`
          },
        },
      },
    },
    scales: axes(horizontal),
  }
  return (
    <div style={{ position: 'relative', height }}>
      <Bar data={{ labels, datasets }} options={options} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Línea mensual: año anterior vs año actual                           */
/* ------------------------------------------------------------------ */

export function LinePair({ labels, prev, cur, prevLabel, curLabel, color, format, height = 200 }: PairProps & { color: string }) {
  const tCur = totalOf(cur)
  const tPrev = prev ? totalOf(prev) : 0
  const datasets = [
    ...(prev && prevLabel
      ? [{ label: prevLabel, data: prev, borderColor: COLOR_COMPARACION, backgroundColor: 'rgba(181,212,244,0.12)', tension: 0.4, pointRadius: 4, pointBackgroundColor: COLOR_COMPARACION, spanGaps: true }]
      : []),
    { label: curLabel, data: cur, borderColor: color, backgroundColor: 'rgba(55,138,221,0.08)', tension: 0.4, pointRadius: 4, pointBackgroundColor: color, spanGaps: true, fill: true },
  ]
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipBase,
        callbacks: {
          label: (c: TooltipItem<'line'>) => {
            const val = Number(c.parsed.y)
            const tot = c.dataset.label === curLabel ? tCur : tPrev
            return ` ${c.dataset.label}: ${format(val)} (${fmtPct(tot ? val / tot : 0)} del acumulado)`
          },
          footer: (items) => {
            if (!prev) return ''
            const d = variation(cur[items[0].dataIndex], prev[items[0].dataIndex])
            return d == null ? '' : `Var. vs ${prevLabel}: ${fmtVar(d)}`
          },
        },
      },
    },
    scales: { ...axes(false), x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } } },
  }
  return (
    <div style={{ position: 'relative', height }}>
      <Line data={{ labels, datasets }} options={options} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dona con leyenda lateral (valor % a la derecha)                     */
/* ------------------------------------------------------------------ */

export function DonutLegend({ labels, values, colors, format, extra }: { labels: string[]; values: number[]; colors: string[]; format: Fmt; extra?: (i: number) => string }) {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0)
  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipBase,
        callbacks: {
          label: (c) => ` ${format(Number(c.raw))} (${fmtPct(total ? Number(c.raw) / total : 0)} del total)`,
          footer: (items) => (extra ? extra(items[0].dataIndex) : ''),
        },
      },
    },
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[150px] w-[150px] shrink-0">
        <Doughnut data={{ labels, datasets: [{ data: values.map((x) => Math.max(0, x)), backgroundColor: colors, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] }} options={options} />
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1.5">
        {labels.map((l, i) => (
          <li key={`${l}-${i}`} className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[i % colors.length] }} />
            <span className="min-w-0 flex-1 truncate" title={l}>
              {l}
            </span>
            <span className="tabular font-medium text-ink">{fmtPct(total ? Math.max(0, values[i]) / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Barras horizontales de variación %                                  */
/* ------------------------------------------------------------------ */

export function VarBars({ labels, cur, prev, prevLabel, curLabel, format }: { labels: string[]; cur: (number | null)[]; prev: (number | null)[]; prevLabel: string; curLabel: string; format: Fmt }) {
  const vars = labels.map((_, i) => variation(cur[i], prev[i]))
  const idx = labels.map((_, i) => i).filter((i) => vars[i] != null)
  const data = idx.map((i) => Math.max(-1.5, Math.min(1.5, vars[i]!)) * 100)
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...tooltipBase,
        callbacks: {
          label: (c) => {
            const i = idx[c.dataIndex]
            return [` Var.: ${fmtVar(vars[i])}`, ` ${curLabel}: ${format(cur[i] ?? 0)}`, ` ${prevLabel}: ${format(prev[i] ?? 0)}`]
          },
        },
      },
    },
    scales: {
      x: { grid: { color: 'rgba(128,128,128,0.1)' }, border: { display: false }, ticks: { font: { size: 10 }, callback: (v) => `${v} %` } },
      y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 } } },
    },
  }
  return (
    <div style={{ position: 'relative', height: Math.max(200, idx.length * 22 + 30) }}>
      <Bar
        data={{ labels: idx.map((i) => labels[i]), datasets: [{ data, backgroundColor: data.map((d) => (d >= 0 ? '#1D9E75' : '#D85A30')), borderRadius: 3, maxBarThickness: 14 }] }}
        options={options}
      />
    </div>
  )
}
