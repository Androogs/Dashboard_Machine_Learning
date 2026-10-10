/**
 * Contenedor del dashboard: barra superior, lista de HOJAS de los Excel cargados
 * (lateral en escritorio, horizontal en móvil) y la hoja activa.
 * Si una hoja tiene varias tablas, se eligen dentro de la hoja.
 */
import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText, FlaskConical, ListChecks, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import type { Report } from '@/types/report'
import { groupBySheet, type SheetEntry } from '@/analysis/sheets'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/features/AppHeader'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { EnvReport } from './env/EnvReport'
import { RuntReport } from './env/RuntReport'
import { FlatReport } from './FlatReport'
import { PivotReport } from './PivotReport'
import { FlatPairReport, MatrixPairReport } from './PairReport'
import { cn } from '@/lib/utils'
import { downloadHtmlReport } from '@/lib/htmlReport'

function ReportView({ report, title }: { report: Report; title: string }) {
  if (report.mode === 'single') {
    const s = report.sheet
    if (s.kind === 'runt') return <RuntReport key={report.id} sheet={s} />
    if (s.kind === 'pivot') return <PivotReport key={report.id} sheet={s} title={title} />
    if (s.kind === 'matrix') return <EnvReport key={report.id} sheet={s} title={title} />
    return <FlatReport key={report.id} sheet={s} title={title} />
  }
  if (report.a.kind === 'flat' && report.b.kind === 'flat') return <FlatPairReport key={report.id} a={report.a} b={report.b} title={title} />
  if (report.a.kind === 'matrix' && report.b.kind === 'matrix') return <MatrixPairReport key={report.id} a={report.a} b={report.b} title={title} />
  return <p className="text-sm text-muted-foreground">Estas hojas tienen estructuras distintas y no se pueden comparar.</p>
}

const docName = (i: number, mode: string | null) => (i >= 2 ? 'Documento adicional' : mode === 'compare' ? `Documento ${i + 1}` : 'Documento')

function SheetView({ entry }: { entry: SheetEntry }) {
  const [tableId, setTableId] = useState(entry.tables[0].id)
  const table = entry.tables.find((t) => t.id === tableId) ?? entry.tables[0]
  return (
    <div className="flex flex-col gap-4">
      {entry.tables.length > 1 && (
        <div className="no-print flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Tablas de esta hoja:</span>
          <div className="inline-flex rounded-lg border bg-card p-0.5 shadow-card">
            {entry.tables.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTableId(t.id)}
                aria-pressed={t.id === table.id}
                className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors', t.id === table.id ? 'bg-primary text-white' : 'text-muted-foreground hover:text-ink')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <ErrorBoundary key={table.id} where={entry.title}>
        <ReportView report={table.report} title={entry.title} />
      </ErrorBoundary>
    </div>
  )
}

export function Dashboard() {
  const { reports, activeId, setActive, reset, isSample, reviewed, openReview, mode } = useAppStore()
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const sheets = useMemo(() => groupBySheet(reports), [reports])
  const active = sheets.find((s) => s.id === activeId) ?? sheets[0]
  const docs = [...new Set(sheets.map((s) => s.docIndex))]

  const handleExport = () => {
    try {
      downloadHtmlReport(reports, isSample)
      setExportError(null)
      setExportMessage('El informe HTML se generó. Revisa las descargas del navegador.')
    } catch (error) {
      setExportMessage(null)
      setExportError(error instanceof Error ? error.message : 'No se pudo generar el informe HTML.')
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader
        sticky
        right={
          <div className="flex items-center gap-2">
            {reviewed && (
              <Button variant="outline" size="sm" onClick={openReview} className="hidden md:inline-flex">
                <ListChecks /> Elegir hojas
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleExport} aria-label="Descargar informe HTML">
              <FileText /> <span className="hidden sm:inline">Descargar informe HTML</span><span className="sm:hidden">HTML</span>
            </Button>
            <Button variant="default" size="sm" onClick={reset}>
              <RotateCcw /> Nuevo análisis
            </Button>
          </div>
        }
      />
      {exportError && (
        <p role="alert" className="mx-auto max-w-[1440px] px-4 pt-2 text-sm text-destructive sm:px-5">
          {exportError}
        </p>
      )}
      {exportMessage && (
        <p role="status" className="mx-auto max-w-[1440px] px-4 pt-2 text-sm text-muted-foreground sm:px-5">
          {exportMessage}
        </p>
      )}

      {/* Navegación móvil: hojas */}
      <nav className="no-print sticky top-14 z-20 border-b bg-background/95 backdrop-blur lg:hidden" aria-label="Hojas">
        <div className="scrollbar-thin flex gap-1 overflow-x-auto px-4 py-2">
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium', active?.id === s.id ? 'border-[#1a2b5e] bg-[#1a2b5e] text-white' : 'bg-card text-ink')}
            >
              {s.title}
            </button>
          ))}
        </div>
      </nav>

      <div className="mx-auto flex max-w-[1440px] gap-8 px-4 sm:px-5">
        {/* Navegación lateral: hojas de cada documento */}
        <aside className="no-print sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto py-6 lg:block" aria-label="Hojas">
          {docs.map((d) => {
            const list = sheets.filter((s) => s.docIndex === d)
            return (
              <div key={d} className="mb-5">
                <p className="flex items-center gap-1.5 px-3 pb-1 text-xs font-medium text-muted-foreground">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-positive" aria-hidden /> {docName(d, mode)}
                </p>
                <p className="truncate px-3 pb-2 text-[11px] text-muted-foreground/80" title={list[0]?.fileName}>
                  {list[0]?.fileName}
                </p>
                <ul className="space-y-0.5">
                  {list.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setActive(s.id)}
                        aria-current={active?.id === s.id ? 'page' : undefined}
                        className={cn(
                          'flex w-full items-start rounded-lg px-3 py-2 text-left text-[13px] transition-colors',
                          active?.id === s.id ? 'bg-card font-semibold text-[#1a2b5e] shadow-card ring-1 ring-border' : 'text-ink/80 hover:bg-card/70',
                        )}
                      >
                        <span className="line-clamp-2">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </aside>

        <main className="min-w-0 flex-1 py-6 sm:py-8">
          {isSample && (
            <div className="no-print mb-6 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
              <FlaskConical className="h-4 w-4" aria-hidden /> Estás viendo datos de ejemplo ficticios (src/data/ejemplo.ts).
            </div>
          )}
          {active ? <SheetView key={active.id} entry={active} /> : <p className="text-sm text-muted-foreground">No hay hojas para mostrar.</p>}
        </main>
      </div>
    </div>
  )
}
