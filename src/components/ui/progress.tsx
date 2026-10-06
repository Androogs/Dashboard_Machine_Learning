import { cn } from '@/lib/utils'

/** Barra de progreso simple (0-100). */
export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  )
}
