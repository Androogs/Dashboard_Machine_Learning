/**
 * Real vs Meta con % de cumplimiento en eje secundario (Chart.js).
 * Barras: valor real y meta. Línea: cumplimiento %.
 */
import { Chart } from 'react-chartjs-2'
import type { ChartData, ChartOptions } from 'chart.js'
import { C } from './theme'
import { fmtCompact, fmtPct } from '@/lib/format'

interface Props {
  labels: string[]
  real: (number | null)[]
  target: (number | null)[]
  realName: string
  format: (v: number) => string
  height?: number
}

export function ComboChart({ labels, real, target, realName, format, height = 300 }: Props) {
  const compliance = real.map((r, i) => (target[i] && r != null ? r / (target[i] as number) : null))
  const data: ChartData<'bar' | 'line', (number | null)[], string> = {
    labels,
    datasets: [
      { type: 'bar', label: realName, data: real, backgroundColor: C.primary, borderRadius: 4, maxBarThickness: 34, yAxisID: 'y', order: 2 },
      { type: 'bar', label: 'Meta', data: target, backgroundColor: 'hsl(220 18% 86%)', borderRadius: 4, maxBarThickness: 34, yAxisID: 'y', order: 3 },
      {
        type: 'line',
        label: 'Cumplimiento',
        data: compliance,
        borderColor: C.target,
        backgroundColor: C.target,
        pointRadius: 3.5,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.3,
        yAxisID: 'y1',
        order: 1,
      },
    ],
  }
  const options: ChartOptions<'bar' | 'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, boxHeight: 6, padding: 16 } },
      tooltip: {
        backgroundColor: 'white',
        titleColor: 'hsl(224 52% 14%)',
        bodyColor: 'hsl(220 12% 35%)',
        borderColor: 'hsl(220 16% 89%)',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y
            if (v == null) return `${ctx.dataset.label}: —`
            return `${ctx.dataset.label}: ${ctx.dataset.yAxisID === 'y1' ? fmtPct(v) : format(v)}`
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: { grid: { color: C.grid }, border: { display: false }, ticks: { callback: (v) => fmtCompact(Number(v)) } },
      y1: { position: 'right', grid: { display: false }, border: { display: false }, min: 0, ticks: { callback: (v) => fmtPct(Number(v), 0) } },
    },
  }
  return (
    <div style={{ height }}>
      <Chart type="bar" data={data as ChartData<'bar', (number | null)[], string>} options={options as ChartOptions<'bar'>} />
    </div>
  )
}
