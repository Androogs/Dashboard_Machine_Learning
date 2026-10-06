/** Tendencia por periodo: área del valor + línea punteada de meta (Recharts). */
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { C, axisTick } from './theme'
import { ChartTooltip, seriesTotals } from './ChartTooltip'
import { fmtCompact } from '@/lib/format'

interface Props {
  data: { label: string; value: number | null; target?: number | null }[]
  valueName: string
  format: (v: number) => string
  height?: number
}

export function TrendChart({ data, valueName, format, height = 280 }: Props) {
  const hasTarget = data.some((d) => d.target != null)
  const totals = seriesTotals(data, ['value'])
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.primaryMid} stopOpacity={0.22} />
            <stop offset="100%" stopColor={C.primaryMid} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} dy={6} />
        <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={56} />
        <Tooltip content={<ChartTooltip format={format} totals={totals} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Area type="monotone" dataKey="value" name={valueName} stroke={C.primary} strokeWidth={2.25} fill="url(#trendFill)" dot={{ r: 3, fill: C.primary }} activeDot={{ r: 5 }} />
        {hasTarget && <Line type="monotone" dataKey="target" name="Meta" stroke={C.target} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
      </ComposedChart>
    </ResponsiveContainer>
  )
}
