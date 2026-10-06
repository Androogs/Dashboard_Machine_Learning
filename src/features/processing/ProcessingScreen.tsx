/**
 * Pantalla de procesamiento: progreso por documento + vista previa en esqueleto.
 */
import { Check, Loader2 } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { AppHeader } from '@/features/AppHeader'

const STAGES = ['Leyendo hojas del archivo', 'Detectando estructura', 'Calculando indicadores', 'Construyendo dashboard']

export function ProcessingScreen() {
  const { progress, files, mode } = useAppStore()
  const overall = progress.length ? progress.reduce((a, p) => a + p.pct, 0) / progress.length : 0
  const stageIdx = overall >= 98 ? 3 : overall >= 55 ? 2 : overall >= 15 ? 1 : 0

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto grid max-w-5xl gap-8 px-5 pb-16 pt-10 lg:grid-cols-[360px_1fr]">
        <section aria-live="polite">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Analizando tu información</h1>
          <p className="mt-2 text-sm text-muted-foreground">Las bases grandes del DMS pueden tardar unos segundos.</p>

          <ol className="mt-6 space-y-3">
            {STAGES.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                    i < stageIdx ? 'border-positive bg-positive text-white' : i === stageIdx ? 'border-primary text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {i < stageIdx ? <Check className="h-3.5 w-3.5" /> : i === stageIdx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-[11px]">{i + 1}</span>}
                </span>
                <span className={i <= stageIdx ? 'font-medium text-ink' : 'text-muted-foreground'}>{s}</span>
              </li>
            ))}
          </ol>

          <div className="mt-8 space-y-4">
            {progress.map((p) => (
              <div key={p.doc} className="rounded-xl border bg-card p-4 shadow-card">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-ink">{p.doc >= 2 ? 'Documento adicional' : mode === 'compare' ? `Documento ${p.doc + 1}` : 'Documento'}: {files[p.doc]?.name ?? 'Ejemplo'}</span>
                  <span className="tabular text-muted-foreground">{Math.round(p.pct)} %</span>
                </div>
                <Progress value={p.pct} />
                <p className="mt-2 truncate text-xs text-muted-foreground">{p.step}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="hidden rounded-2xl border bg-card p-5 shadow-card lg:block" aria-hidden>
          <Skeleton className="h-6 w-56" />
          <div className="mt-5 grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Skeleton className="col-span-2 h-56" />
            <Skeleton className="h-56" />
          </div>
          <Skeleton className="mt-4 h-40" />
        </section>
      </main>
    </div>
  )
}
