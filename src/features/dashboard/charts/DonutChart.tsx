/** Dona de participación con total al centro (Chart.js). */
import { Doughnut } from 'react-chartjs-2'
import type { ChartOptions } from 'chart.js'
import { PALETTE } from './theme'
import { fmtPct } from '@/lib/format'

interface Props {
  items: { label: string; value: number }[]
  centerLabel: string
  centerValue: string
  format: (v: number) => string
}

export function DonutChart({ items, centerLabel, centerValue, format }: Props) {
  const total = items.reduce((a, i) => a + Math.max(0, i.value), 0)
  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'white',
        titleColor: 'hsl(224 52% 14%)',
        bodyColor: 'hsl(220 12% 35%)',
        borderColor: 'hsl(220 16% 89%)',
        borderWidth: 1,
        callbacks: { label: (ctx) => `${format(Number(ctx.raw))} (${fmtPct(total ? Number(ctx.raw) / total : 0)})` },
      },
    },
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center lg:flex-col xl:flex-row">
      <div className="relative mx-auto h-44 w-44 shrink-0">
        <Doughnut
          data={{ labels: items.map((i) => i.label), datasets: [{ data: items.map((i) => Math.max(0, i.value)), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#fff', hoverOffset: 4 }] }}
          options={options}
        />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
          <span className="tabular text-base font-semibold text-ink">{centerValue}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
        {items.map((i, idx) => (
          <li key={i.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[idx % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground" title={i.label}>
              {i.label}
            </span>
            <span className="tabular font-medium text-ink">{fmtPct(total ? Math.max(0, i.value) / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
