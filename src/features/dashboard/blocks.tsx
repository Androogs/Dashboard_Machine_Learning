/**
 * Bloques visuales reutilizables del dashboard:
 * KpiCard, ChartCard, VarBadge, ComplianceBadge, FilterField, SectionTitle.
 */
import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fmtPct, fmtVar } from '@/lib/format'
import { UMBRALES_CUMPLIMIENTO } from '@/config/negocio'

/* ---------------- Variación coloreada ---------------- */

export function VarBadge({ value, className, invert = false }: { value: number | null | undefined; className?: string; invert?: boolean }) {
  if (value == null || !isFinite(value)) return <span className={cn('text-xs text-muted-foreground', className)}>—</span>
  const good = invert ? value < 0 : value > 0
  const flat = Math.abs(value) < 0.0005
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular',
        flat ? 'bg-secondary text-muted-foreground' : good ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {fmtVar(value)}
    </span>
  )
}

export function ComplianceBadge({ value }: { value: number | null | undefined }) {
  if (value == null || !isFinite(value)) return <span className="text-xs text-muted-foreground">—</span>
  const { cumple, riesgo } = UMBRALES_CUMPLIMIENTO
  const cls = value >= cumple ? 'bg-positive-soft text-positive' : value >= riesgo ? 'bg-warning-soft text-warning' : 'bg-negative-soft text-negative'
  return <span className={cn('inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold tabular', cls)}>{fmtPct(value)}</span>
}

/** Barra de progreso de cumplimiento (para KPI de meta). */
export function ComplianceBar({ value }: { value: number }) {
  const { cumple, riesgo } = UMBRALES_CUMPLIMIENTO
  const color = value >= cumple ? 'bg-positive' : value >= riesgo ? 'bg-warning' : 'bg-negative'
  return (
    <div className="relative mt-3 h-1.5 rounded-full bg-secondary">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, Math.max(2, value * 100))}%` }} />
    </div>
  )
}

/* ---------------- KPI ---------------- */

interface KpiProps {
  label: string
  value: string
  sub?: ReactNode
  delta?: number | null
  deltaLabel?: string
  footer?: ReactNode
  emphasis?: boolean
}

export function KpiCard({ label, value, sub, delta, deltaLabel, footer, emphasis }: KpiProps) {
  return (
    <Card className={cn('print-break flex flex-col p-5', emphasis && 'border-primary/25 bg-[linear-gradient(160deg,hsl(221_80%_97%),white_60%)]')}>
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <span className="tabular mt-2 text-[26px] font-semibold leading-none tracking-[-0.02em] text-ink">{value}</span>
      {(delta !== undefined || sub) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {delta !== undefined && <VarBadge value={delta} />}
          {deltaLabel && <span>{deltaLabel}</span>}
          {sub && <span>{sub}</span>}
        </div>
      )}
      {footer}
    </Card>
  )
}

/* ---------------- Contenedor de gráfica ---------------- */

export function ChartCard({ title, description, children, className, action }: { title: string; description?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <Card className={cn('print-break flex min-w-0 flex-col', className)}>
      <div className="flex items-start justify-between gap-3 p-5 pb-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1 px-3 pb-4 sm:px-5">{children}</div>
    </Card>
  )
}

/* ---------------- Filtros ---------------- */

export function FilterField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <label className={cn('flex min-w-[150px] flex-1 flex-col gap-1 sm:max-w-[240px]', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

/** Chips de selección múltiple (ej: marcas). Vacío = todas. */
export function ChipFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  if (options.length < 2) return null
  const all = selected.length === 0
  const toggle = (o: string) => {
    const next = selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]
    onChange(next.length === options.length ? [] : next)
  }
  const chip = 'rounded-full border px-3 py-1 text-xs font-medium transition-colors'
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        <button type="button" onClick={() => onChange([])} className={cn(chip, all ? 'border-primary bg-primary text-white' : 'bg-card hover:bg-secondary')} aria-pressed={all}>
          Todas
        </button>
        {options.map((o) => {
          const on = !all && selected.includes(o)
          return (
            <button key={o} type="button" onClick={() => toggle(o)} className={cn(chip, on ? 'border-primary bg-accent text-primary' : 'bg-card hover:bg-secondary')} aria-pressed={on}>
              {o}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="no-print flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border bg-card/70 p-4">{children}</div>
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 pb-2 text-sm text-ink">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn('relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-input')}
      >
        <span className={cn('absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
      {label}
    </label>
  )
}

/* ---------------- Encabezado de reporte ---------------- */

export function ReportHeader({ title, subtitle, tags }: { title: string; subtitle?: ReactNode; tags?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">{tags}</div>
      <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-[28px]">{title}</h2>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  )
}

export function Grid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4', className)}>{children}</div>
}
