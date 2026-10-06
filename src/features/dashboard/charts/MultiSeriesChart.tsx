/**
 * Gráfica genérica de varias series (Recharts):
 * - variant "bars": barras agrupadas (o apiladas con `stacked`)
 * - variant "lines": líneas (ideal para año a año)
 */
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisTick, C } from './theme'
import { ChartTooltip, seriesTotals } from './ChartTooltip'
import { fmtCompact } from '@/lib/format'

export interface SeriesDef {
  key: string
  name: string
  color: string
}

interface Props {
  data: Record<string, string | number | null>[]
  xKey: string
  series: SeriesDef[]
  variant?: 'bars' | 'lines'
  stacked?: boolean
  horizontal?: boolean
  format: (v: number) => string
  height?: number
}

export function MultiSeriesChart({ data, xKey, series, variant = 'bars', stacked, horizontal, format, height = 280 }: Props) {
  const totals = seriesTotals(data, series.map((s) => s.key))
  if (variant === 'lines') {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} dy={6} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={56} />
          <Tooltip content={<ChartTooltip format={format} totals={totals} />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={i === series.length - 1 ? 2.5 : 2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  const h = horizontal ? Math.max(height, data.length * 34 + 60) : height
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={C.grid} vertical={!!horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmtCompact} />
            <YAxis type="category" dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} width={132} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={false} dy={6} interval={0} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={56} />
          </>
        )}
        <Tooltip content={<ChartTooltip format={format} totals={totals} />} cursor={{ fill: 'hsl(221 80% 96% / 0.6)' }} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color}
            stackId={stacked ? 'a' : undefined}
            radius={stacked ? (i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            maxBarSize={horizontal ? 18 : 40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
