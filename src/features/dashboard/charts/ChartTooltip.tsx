/**
 * Tooltip personalizado para Recharts con el estilo del dashboard.
 * Muestra el valor, el % sobre el total de su serie y, con dos series, la variación entre ellas.
 */
import type { TooltipProps } from 'recharts'
import { fmtPct, fmtVar, variation } from '@/lib/format'

interface Props extends TooltipProps<number, string> {
  format: (v: number) => string
  /** Total por serie (dataKey) para calcular la participación */
  totals?: Record<string, number>
}

export function ChartTooltip({ active, payload, label, format, totals }: Props) {
  if (!active || !payload?.length) return null
  const two = payload.length === 2 ? variation(Number(payload[1].value), Number(payload[0].value)) : null
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-xs shadow-lift">
      <p className="mb-1.5 font-semibold text-ink">{label}</p>
      <div className="space-y-1">
        {payload.map((p) => {
          const tot = totals?.[String(p.dataKey)]
          return (
            <div key={String(p.dataKey)} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.name}
              </span>
              <span className="tabular font-medium text-ink">
                {p.value == null ? '—' : format(Number(p.value))}
                {p.value != null && tot ? <span className="ml-1 font-normal text-muted-foreground">({fmtPct(Number(p.value) / tot)})</span> : null}
              </span>
            </div>
          )
        })}
      </div>
      {payload.length === 2 && two != null && (
        <p className="mt-1.5 border-t pt-1.5 text-muted-foreground">
          Var. {payload[1].name} vs {payload[0].name}: <span className="font-semibold text-ink">{fmtVar(two)}</span>
        </p>
      )}
      {totals && <p className="mt-1 text-[10.5px] text-muted-foreground">(%) participación sobre el total de la serie</p>}
    </div>
  )
}

/** Suma por serie, para los porcentajes del tooltip. */
export function seriesTotals(data: Record<string, unknown>[], keys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of keys) out[k] = data.reduce((a, d) => a + Math.max(0, Number(d[k] ?? 0) || 0), 0)
  return out
}
