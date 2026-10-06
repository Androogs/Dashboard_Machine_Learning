/**
 * Revisión de hojas antes de generar el dashboard.
 * Lista las HOJAS de cada Excel (si una hoja tiene varias tablas, se describen dentro de la hoja)
 * y permite incluir/excluir hojas. Las hojas contables o con datos de terceros/socios
 * quedan desmarcadas por defecto.
 */
import { useMemo } from 'react'
import { ArrowLeft, BarChart3, CheckSquare, FileSpreadsheet, LayoutGrid, ShieldAlert, Square, Table2, Ban, Globe2 } from 'lucide-react'
import type { ParsedSheet } from '@/types/report'
import { useAppStore, defaultSelection } from '@/store/useAppStore'
import { HOJAS_CONFIDENCIALES } from '@/config/negocio'
import { buildReports } from '@/analysis/compare'
import { groupBySheet } from '@/analysis/sheets'
import { AppHeader } from '@/features/AppHeader'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { fmtInt, plural } from '@/lib/format'
import { valueMetrics } from '@/analysis/matrix'
import { cn } from '@/lib/utils'

/** Descripción corta de lo que se detectó en una tabla. */
function describe(s: ParsedSheet): string {
  if (s.kind === 'empty') return s.reason
  if (s.kind === 'runt') return `${s.markets.map((m) => m.name).join(', ')}${s.own ? ` y ventas ${s.own.name}` : ''}, ${s.years.join(' vs ')}.`
  if (s.kind === 'flat') {
    const n = s.columns.filter((c) => c.type === 'measure' || c.type === 'number').length
    return `${fmtInt(s.rowCount)} registros, ${n} columnas numéricas.`
  }
  const items = s.rows.filter((r) => r.type === 'item').length
  const periods = [...new Map(valueMetrics(s).flatMap((m) => m.periods).map((p) => [p.key, p])).values()].sort((a, b) => a.key.localeCompare(b.key))
  const range = periods.length ? `${periods[0].label} a ${periods.at(-1)!.label}` : ''
  const unit = s.unit.kind === 'money' ? 'en pesos' : `en ${s.unit.label}`
  return `${items} ${plural(s.dimensionLabel)}${s.groups.length > 1 ? ` en ${s.groups.length} grupos` : ''}, ${periods.length} periodos (${range}), ${unit}.`
}

const kindOf = (s: ParsedSheet) =>
  s.kind === 'empty'
    ? { label: 'Sin estructura', Icon: Ban }
    : s.kind === 'runt'
      ? { label: 'Mercado RUNT', Icon: Globe2 }
      : s.kind === 'flat'
        ? { label: 'Base de registros', Icon: Table2 }
        : { label: s.source === 'bloques' ? 'Tabla comparativa' : 'Informe consolidado', Icon: LayoutGrid }

const origin = (id: string) => id.split('-b')[0]

export function ReviewStep() {
  const { workbooks, selected, setSelected, confirmSelection, backToOnboarding, mode } = useAppStore()
  const all = workbooks.flatMap((w) => w.sheets)
  const usable = all.filter((s) => s.kind !== 'empty')
  const reportsCount = useMemo(
    () => groupBySheet(buildReports(workbooks.map((w) => ({ ...w, sheets: w.sheets.filter((s) => selected.includes(s.id)) })))).length,
    [workbooks, selected],
  )

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-28 pt-8">
        <Button variant="ghost" size="sm" onClick={backToOnboarding} className="-ml-2 text-muted-foreground">
          <ArrowLeft /> Cargar otros archivos
        </Button>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Revisa las hojas detectadas</h1>
        <p className="mt-2 max-w-3xl text-[15px] text-muted-foreground">
          Las hojas contables o con información de terceros y socios quedan desmarcadas por defecto; puedes incluirlas si las necesitas.
        </p>

        <div className="no-print mt-6 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setSelected(defaultSelection(workbooks))}>
            Solo comerciales
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelected(usable.map((s) => s.id))}>
            Todas
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelected([])}>
            Ninguna
          </Button>
        </div>

        {workbooks.map((w) => {
          // Agrupar tablas por hoja de origen
          const sheets: { key: string; name: string; tables: ParsedSheet[] }[] = []
          for (const s of w.sheets) {
            const k = origin(s.id)
            let e = sheets.find((x) => x.key === k)
            if (!e) {
              e = { key: k, name: s.kind === 'runt' ? `${s.title} (${s.name})` : ('sheetName' in s && s.sheetName) || s.name, tables: [] }
              sheets.push(e)
            }
            e.tables.push(s)
          }
          return (
            <section key={w.docIndex} className="mt-6">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
                <FileSpreadsheet className="h-4 w-4 text-positive" aria-hidden />
                {w.docIndex >= 2 ? 'Documento adicional: ' : mode === 'compare' ? `Documento ${w.docIndex + 1}: ` : ''}
                {w.fileName}
                <span className="font-normal text-muted-foreground">({sheets.length} hojas)</span>
              </h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-card">
                {sheets.map((sh) => {
                  const ids = sh.tables.filter((t) => t.kind !== 'empty').map((t) => t.id)
                  const on = ids.length > 0 && ids.every((id) => selected.includes(id))
                  const disabled = ids.length === 0
                  const kind = kindOf(sh.tables[0])
                  const confidential = w.docIndex < 2 && sh.tables[0].kind !== 'runt' && HOJAS_CONFIDENCIALES.test(sh.name)
                  const toggle = () => setSelected(on ? selected.filter((x) => !ids.includes(x)) : [...new Set([...selected, ...ids])])
                  return (
                    <li key={sh.key}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={toggle}
                        aria-pressed={on}
                        className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors', disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-accent/40')}
                      >
                        {on ? <CheckSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden /> : <Square className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-ink">{sh.name}</span>
                            <Badge variant={disabled ? 'outline' : 'secondary'}>
                              <kind.Icon className="h-3 w-3" aria-hidden /> {kind.label}
                            </Badge>
                            {sh.tables.length > 1 && <Badge variant="outline">{sh.tables.length} tablas</Badge>}
                            {confidential && !disabled && (
                              <Badge variant="warning">
                                <ShieldAlert className="h-3 w-3" aria-hidden /> Contable o confidencial
                              </Badge>
                            )}
                          </div>
                          {sh.tables.map((t) => (
                            <p key={t.id} className="mt-0.5 text-[13px] text-muted-foreground">
                              {sh.tables.length > 1 && t.kind === 'matrix' && <span className="font-medium text-ink/70">Por {t.dimensionLabel.toLowerCase()}: </span>}
                              {describe(t)}
                            </p>
                          ))}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </main>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 py-3 sm:flex-row">
          <p className="text-sm text-muted-foreground">{reportsCount} hoja(s) seleccionada(s)</p>
          <Button size="lg" disabled={!reportsCount} onClick={confirmSelection} className="w-full sm:w-auto">
            <BarChart3 aria-hidden /> GENERAR DASHBOARD
          </Button>
        </div>
      </div>
    </div>
  )
}
