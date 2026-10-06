/**
 * Tabla ordenable con fila de total opcional.
 * Cada columna define cómo renderizar y cómo ordenar su valor.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  header: string
  align?: 'left' | 'right'
  render: (row: T) => ReactNode
  sort?: (row: T) => number | string | null
  className?: string
}

interface Props<T> {
  rows: T[]
  columns: Column<T>[]
  footer?: ReactNode[]
  rowKey: (r: T, i: number) => string
  maxRows?: number
  caption?: string
}

export function DataTable<T>({ rows, columns, footer, rowKey, maxRows = 400, caption }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [expanded, setExpanded] = useState(false)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    return [...rows].sort((a, b) => {
      const va = col.sort!(a)
      const vb = col.sort!(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
  }, [rows, columns, sort])

  const limit = expanded ? maxRows : 15
  const visible = sorted.slice(0, limit)

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b bg-secondary/60">
              {columns.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th key={c.key} scope="col" className={cn('whitespace-nowrap px-4 py-2.5 font-medium text-muted-foreground', c.align === 'right' ? 'text-right' : 'text-left')}>
                    {c.sort ? (
                      <button
                        type="button"
                        className={cn('inline-flex items-center gap-1 hover:text-ink', c.align === 'right' && 'flex-row-reverse')}
                        onClick={() => setSort(active ? (sort!.dir === -1 ? { key: c.key, dir: 1 } : null) : { key: c.key, dir: -1 })}
                      >
                        {c.header}
                        {active ? sort!.dir === -1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" /> : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={rowKey(r, i)} className="border-b last:border-0 hover:bg-accent/40">
                {columns.map((c) => (
                  <td key={c.key} className={cn('px-4 py-2.5 align-middle', c.align === 'right' && 'tabular whitespace-nowrap text-right', c.className)}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="border-t-2 bg-secondary/50 font-semibold text-ink">
                {footer.map((f, i) => (
                  <td key={i} className={cn('px-4 py-3', columns[i]?.align === 'right' && 'tabular whitespace-nowrap text-right')}>
                    {f}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {sorted.length > 15 && (
        <div className="no-print flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
          <span>
            Mostrando {Math.min(limit, sorted.length)} de {sorted.length}
          </span>
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => setExpanded((x) => !x)}>
            {expanded ? 'Ver menos' : 'Ver todas'}
          </button>
        </div>
      )}
    </div>
  )
}
