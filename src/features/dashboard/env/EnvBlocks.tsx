/**
 * Bloques visuales de los entornos de reporte (estructura del reporte de gerencia,
 * con el sistema de diseño del dashboard).
 */
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { fmtPct, fmtVar } from '@/lib/format'
import logo from '@/assets/logo-sumoto.png'

/* ---------------- Encabezado del reporte ---------------- */

export function ReportBand({ title, info, badge }: { title: string; info: string; badge: string }) {
  return (
    <div className="print-break flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 shadow-card sm:flex-row sm:items-center sm:justify-between">
      <img src={logo} alt="Sumoto S.A." className="h-9 w-auto self-start object-contain sm:h-10" />
      <div className="sm:text-right">
        <p className="text-[14px] font-semibold text-[#1a2b5e]">{title}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{info}</p>
        <span className="mt-1.5 inline-block rounded-full border border-[#1a2b5e]/20 bg-[#1a2b5e]/[0.06] px-3 py-0.5 text-[11px] font-medium text-[#1a2b5e]">{badge}</span>
      </div>
    </div>
  )
}

/* ---------------- Navegación por vistas (pastillas) ---------------- */

export interface PillItem {
  id: string
  label: string
  /** Color de acento (ej: vista mes vs mes) */
  accent?: string
}

export function PillNav({ items, active, onChange }: { items: PillItem[]; active: string; onChange: (id: string) => void }) {
  if (items.length < 2) return null
  return (
    <nav className="no-print flex flex-wrap gap-1.5" aria-label="Vistas del reporte">
      {items.map((it) => {
        const on = it.id === active
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            aria-pressed={on}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
              on ? 'border-[#1a2b5e] bg-[#1a2b5e] text-white' : 'bg-card text-muted-foreground hover:bg-secondary hover:text-ink',
            )}
            style={!on && it.accent ? { borderColor: it.accent, color: it.accent } : undefined}
          >
            {it.label}
          </button>
        )
      })}
    </nav>
  )
}

/* ---------------- KPI con franja de color ---------------- */

const STRIPE = { blue: '#378ADD', green: '#1D9E75', amber: '#BA7517', coral: '#D85A30' }

export function KpiStripe({ tone, label, value, delta, note }: { tone: keyof typeof STRIPE; label: string; value: string; delta?: number | null; note?: string }) {
  return (
    <div className="print-break relative overflow-hidden rounded-xl border bg-card px-4 pb-3.5 pt-4 shadow-card">
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: STRIPE[tone] }} />
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{label}</p>
      <p className="tabular mt-1.5 truncate text-[24px] font-semibold leading-none tracking-[-0.02em] text-ink" title={value}>
        {value}
      </p>
      <p className={cn('mt-1.5 truncate text-[11.5px] font-medium', delta == null ? 'text-muted-foreground' : delta >= 0 ? 'text-positive' : 'text-negative')} title={note}>
        {delta != null && `${delta >= 0 ? '▲' : '▼'} ${fmtPct(Math.abs(delta))} `}
        {note}
      </p>
    </div>
  )
}

export function KpiRow({ children, columns = 4 }: { children: ReactNode; columns?: 3 | 4 }) {
  return <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2', columns === 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-4')}>{children}</div>
}

/* ---------------- Tarjeta de gráfica ---------------- */

export function EnvCard({ title, legend, children, className }: { title: string; legend?: { label: string; color: string }[]; children: ReactNode; className?: string }) {
  return (
    <section className={cn('print-break min-w-0 rounded-xl border bg-card p-4 shadow-card', className)}>
      <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">{title}</h3>
      {legend && legend.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-3">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      {children}
    </section>
  )
}

export function Row2({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 lg:grid-cols-2">{children}</div>
}

/* ---------------- Variación en pastilla ---------------- */

export function VarPill({ value }: { value: number | null | undefined }) {
  if (value == null || !isFinite(value)) return <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium text-muted-foreground">—</span>
  const up = value >= 0
  return (
    <span className={cn('tabular whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold', up ? 'bg-[#E1F5EE] text-[#085041]' : 'bg-[#FAECE7] text-[#712B13]')}>
      {up ? '▲' : '▼'} {fmtPct(Math.abs(value))}
    </span>
  )
}

/* ---------------- Tabla comparativa con tendencia ---------------- */

export interface EnvTableCol<T> {
  key: string
  header: string
  align?: 'right'
  render: (r: T) => ReactNode
  muted?: boolean
  width?: string
}

export function EnvTable<T>({ rows, cols, footer, foot, rowKey }: { rows: T[]; cols: EnvTableCol<T>[]; footer?: ReactNode[]; foot?: string; rowKey: (r: T) => string }) {
  return (
    <div className="print-break overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={cn('border-b bg-secondary/70 px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground', c.align === 'right' ? 'text-right' : 'text-left')}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="border-b last:border-0 hover:bg-secondary/50">
                {cols.map((c) => (
                  <td key={c.key} className={cn('px-3 py-2', c.align === 'right' && 'tabular whitespace-nowrap text-right', c.muted && 'text-muted-foreground')}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="bg-secondary/60 font-semibold text-ink">
                {footer.map((f, i) => (
                  <td key={i} className={cn('px-3 py-2.5', cols[i]?.align === 'right' && 'tabular whitespace-nowrap text-right')}>
                    {f}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {foot && <p className="border-t px-3 py-2 text-[10.5px] text-muted-foreground">{foot}</p>}
    </div>
  )
}

/** Barra de tendencia proporcional al máximo de la tabla */
export function TrendBar({ value, max, color = '#378ADD' }: { value: number | null; max: number; color?: string }) {
  const w = max > 0 && value ? Math.max(2, Math.round((Math.max(0, value) / max) * 100)) : 2
  return (
    <span className="block h-1.5 w-full max-w-[160px] rounded-full bg-secondary">
      <span className="block h-1.5 rounded-full" style={{ width: `${w}%`, background: color }} />
    </span>
  )
}

export const varOf = (cur: number | null, prev: number | null) => (cur == null || prev == null || prev === 0 ? null : (cur - prev) / Math.abs(prev))
export { fmtVar }
