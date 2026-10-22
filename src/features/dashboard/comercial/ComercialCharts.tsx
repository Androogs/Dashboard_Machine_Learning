/**
 * Gráficas del tablero comercial (Chart.js), con el estilo del reporte de gerencia.
 * Las ayudas emergentes muestran el valor y porcentajes:
 *  - participación sobre el total de la serie ("12,5 % del total Facturado")
 *  - con varias series, participación dentro del asesor ("68,4 % de DANIELA")
 */
import { Bar } from 'react-chartjs-2'
import type { ChartOptions } from 'chart.js'
import '../charts/theme'
import { fmtInt, fmtPct } from '@/lib/format'

export interface HSeries {
  label: string
  data: number[]
  color: string
}

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
}

/** Barras horizontales por asesor (una o varias series, apiladas o agrupadas). */
export function HBars({ labels, series, stacked = false, unit = '', minHeight = 230 }: { labels: string[]; series: HSeries[]; stacked?: boolean; unit?: string; minHeight?: number }) {
  const totals = series.map((s) => s.data.reduce((a, b) => a + b, 0))
  const rowTotal = labels.map((_, i) => series.reduce((a, s) => a + (s.data[i] ?? 0), 0))
  const fmt = (v: number) => `${fmtInt(v)}${unit ? ` ${unit}` : ''}`
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: series.length > 1, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 8, boxHeight: 8, padding: 14, font: { size: 11 } } },
      tooltip: {
        ...tooltipBase,
        callbacks: {
          label: (c) => {
            const v = Number(c.parsed.x)
            const t = totals[c.datasetIndex]
            return ` ${c.dataset.label}: ${fmt(v)} (${fmtPct(t ? v / t : 0)} del total ${c.dataset.label})`
          },
          footer: (items) => {
            if (series.length < 2) return ''
            const i = items[0].dataIndex
            const parts = series.map((s) => `${s.label} ${fmtPct(rowTotal[i] ? (s.data[i] ?? 0) / rowTotal[i] : 0)}`)
            return `Total ${fmt(rowTotal[i])}: ${parts.join(', ')}`
          },
        },
      },
    },
    scales: {
      x: { stacked, grid: { color: '#edf0f5' }, border: { display: false }, ticks: { font: { size: 10 }, callback: (v) => fmtInt(Number(v)) } },
      y: { stacked, grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, autoSkip: false } },
    },
  }
  return (
    <div style={{ position: 'relative', height: Math.max(minHeight, labels.length * 22 + 60) }}>
      <Bar
        data={{ labels, datasets: series.map((s) => ({ label: s.label, data: s.data, backgroundColor: s.color, borderRadius: 3, maxBarThickness: 16 })) }}
        options={options}
      />
    </div>
  )
}
