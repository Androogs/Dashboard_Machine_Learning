/**
 * Paso de carga: 1 dropzone (modo único) o 2 dropzones (modo comparación).
 * El botón principal se habilita solo cuando los archivos requeridos están cargados.
 */
import { ArrowLeft, BarChart3, AlertTriangle, Info, Plus } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import { Button } from '@/components/ui/button'
import { AppHeader } from '@/features/AppHeader'
import { Dropzone } from './Dropzone'

export function UploadStep() {
  const { mode, files, fileErrors, error, setFile, start, backToOnboarding, extraSlots, addExtra, removeExtra } = useAppStore()
  const compare = mode === 'compare'
  const ready = compare ? Boolean(files[0] && files[1]) : Boolean(files[0])
  const sameFile = compare && files[0] && files[1] && files[0].name === files[1].name && files[0].size === files[1].size

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-5 pb-16 pt-8">
        <Button variant="ghost" size="sm" onClick={backToOnboarding} className="-ml-2 text-muted-foreground">
          <ArrowLeft /> Cambiar modo de carga
        </Button>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {compare ? 'Carga los dos documentos' : 'Carga tu documento'}
        </h1>
        <p className="mt-2 flex items-start gap-2 text-[15px] text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          {compare
            ? 'Cargarás dos archivos para realizar la comparativa entre ellos.'
            : 'El sistema leerá todas las hojas del archivo y generará un reporte por cada una.'}
        </p>

        <div className={`mt-8 grid gap-6 ${compare ? 'md:grid-cols-2' : ''}`}>
          <Dropzone
            label={compare ? 'Documento 1' : 'Documento Excel'}
            hint={compare ? 'Ej: Año actual / Mes actual' : undefined}
            file={files[0]}
            error={fileErrors[0]}
            onFile={(f) => setFile(0, f)}
          />
          {compare && (
            <Dropzone label="Documento 2" hint="Ej: Año anterior / Mes anterior" file={files[1]} error={fileErrors[1]} onFile={(f) => setFile(1, f)} />
          )}
        </div>

        {/* Documentos adicionales: se muestran como hojas aparte (ej: Comparativo RUNT) */}
        <section className="mt-8 rounded-xl border border-dashed bg-card/60 p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink">Documentos adicionales (opcional)</h2>
              <p className="text-[13px] text-muted-foreground">Agrega reportes complementarios, por ejemplo el Comparativo RUNT. Se muestran como hojas aparte en el dashboard.</p>
            </div>
            {extraSlots < 4 && (
              <Button variant="outline" size="sm" onClick={addExtra} className="mt-2 self-start sm:mt-0 sm:self-auto">
                <Plus /> Agregar documento adicional
              </Button>
            )}
          </div>
          {extraSlots > 0 && (
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {Array.from({ length: extraSlots }, (_, k) => (
                <Dropzone
                  key={k}
                  label={`Documento adicional ${k + 1}`}
                  hint="Ej: Comparativo RUNT"
                  file={files[2 + k] ?? null}
                  error={fileErrors[2 + k] ?? null}
                  onFile={(f) => setFile(2 + k, f)}
                  onRemoveSlot={() => removeExtra(k)}
                />
              ))}
            </div>
          )}
        </section>

        {sameFile && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden /> Cargaste el mismo archivo en ambos documentos. La comparación dará variación 0 %.
          </p>
        )}

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-negative/30 bg-negative-soft p-4 text-sm text-negative" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">No se pudo generar el dashboard</p>
              <p className="mt-0.5 text-negative/90">{error}</p>
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-3">
          <Button size="xl" disabled={!ready} onClick={start} className="w-full max-w-md tracking-wide">
            <BarChart3 className="!size-5" aria-hidden />
            GENERAR DASHBOARD / EMPEZAR ANÁLISIS
          </Button>
          {!ready && (
            <p className="text-xs text-muted-foreground">{compare ? 'Carga ambos documentos para continuar.' : 'Carga un documento para continuar.'}</p>
          )}
        </div>
      </main>
    </div>
  )
}
