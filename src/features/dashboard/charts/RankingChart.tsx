/**
 * Ranking horizontal con color por umbral (Recharts).
 * Se usa para % de cumplimiento (línea de referencia en 100 %) o variaciones.
 */
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { axisTick, C } from './theme'
import { fmtPct } from '@/lib/format'
import { UMBRALES_CUMPLIMIENTO } from '@/config/negocio'

interface Props {
  data: { label: string; value: number; full?: string }[]
  mode: 'compliance' | 'variation'
}

export function RankingChart({ data, mode }: Props) {
  const color = (v: number) =>
    mode === 'compliance'
      ? v >= UMBRALES_CUMPLIMIENTO.cumple
        ? C.positive
        : v >= UMBRALES_CUMPLIMIENTO.riesgo
          ? C.warning
          : C.negative
      : v >= 0
        ? C.positive
        : C.negative
  // Limitar valores extremos para que la escala sea legible
  const cap = mode === 'compliance' ? 2 : 1.5
  const shown = data.map((d) => ({ ...d, plot: Math.max(-cap, Math.min(cap, d.value)) }))
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26 + 40)}>
      <BarChart data={shown} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={C.grid} horizontal={false} />
        <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v) => fmtPct(v, 0)} domain={mode === 'compliance' ? [0, 'auto'] : ['auto', 'auto']} />
        <YAxis type="category" dataKey="label" tick={axisTick} tickLine={false} axisLine={false} width={132} />
        <Tooltip
          cursor={{ fill: 'hsl(221 80% 96% / 0.6)' }}
          content={({ active, payload }) =>
            active && payload?.[0] ? (
              <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lift">
                <p className="font-semibold text-ink">{payload[0].payload.full ?? payload[0].payload.label}</p>
                <p className="tabular mt-0.5 text-muted-foreground">{fmtPct(payload[0].payload.value)}</p>
              </div>
            ) : null
          }
        />
        {mode === 'compliance' && <ReferenceLine x={1} stroke={C.axis} strokeDasharray="4 3" label={{ value: 'Meta', position: 'top', fontSize: 10, fill: C.axis }} />}
        {mode === 'variation' && <ReferenceLine x={0} stroke={C.axis} />}
        <Bar dataKey="plot" radius={[0, 4, 4, 0]} maxBarSize={16}>
          {shown.map((d) => (
            <Cell key={d.label} fill={color(d.value)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
