/**
 * Pantalla inicial: elección del modo de carga.
 * Opción A (un documento) muestra primero un diálogo de confirmación.
 */
import { useState } from 'react'
import { FlaskConical, ShieldCheck, FileSpreadsheet } from 'lucide-react'
import { useAppStore } from '@/store/useAppStore'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AppHeader } from '@/features/AppHeader'
import { SingleDocArt, TwoDocsArt } from './ModeArt'
import { cn } from '@/lib/utils'

export function Onboarding() {
  const chooseMode = useAppStore((s) => s.chooseMode)
  const loadSample = useAppStore((s) => s.loadSample)
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto flex max-w-5xl flex-col px-5 pb-16 pt-10 sm:pt-16">
        <div className="max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-card">
            <FileSpreadsheet className="h-3.5 w-3.5 text-primary" aria-hidden />
            Reportes de Advance DMS
          </p>
          <h1 className="text-balance text-3xl font-semibold tracking-[-0.025em] text-ink sm:text-[42px] sm:leading-[1.1]">
            Sistema de Reporte Esquematizado (Dashboard)
          </h1>
          <p className="mt-5 text-lg text-muted-foreground sm:text-xl">¿Cómo quieres cargar tu información?</p>
        </div>

        <div className="mt-9 grid gap-5 md:grid-cols-2">
          <ModeCard
            option="A"
            title="Cargar un solo documento Excel"
            description="Para archivos que ya traen la comparación por dentro: meses del mismo año, años distintos o acumulados, como el Informe comercial."
            art={<SingleDocArt />}
            onClick={() => setConfirmOpen(true)}
          />
          <ModeCard
            option="B"
            title="Cargar dos documentos Excel para comparar"
            description="Documento 1 frente a Documento 2, hoja por hoja. Por ejemplo, Base repuestos 2026 contra Base repuestos 2025."
            art={<TwoDocsArt />}
            onClick={() => chooseMode('compare')}
          />
        </div>

        <div className="mt-8 flex flex-col gap-3 border-t pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-positive" aria-hidden />
            Los archivos se procesan en tu navegador. No se envían a ningún servidor.
          </p>
          <button
            type="button"
            onClick={loadSample}
            className="inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 font-medium text-primary hover:bg-accent sm:self-auto"
          >
            <FlaskConical className="h-4 w-4" aria-hidden />
            Probar con datos de ejemplo
          </button>
        </div>
      </main>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Antes de cargar tu documento</AlertDialogTitle>
            <AlertDialogDescription>
              Asegúrate de que este documento contenga comparativas de diferentes meses del mismo año o diferente año, o comparativas de años
              diferentes, pero reportadas dentro del mismo archivo Excel. Todas las hojas deben estar estructuradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => chooseMode('single')}>Entendido, cargar documento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ModeCard(props: { option: string; title: string; description: string; art: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-card transition-[box-shadow,border-color,transform] duration-200',
        'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      )}
    >
      <div className="relative h-44 border-b bg-[linear-gradient(180deg,hsl(221_60%_97%),hsl(220_20%_98%))]">{props.art}</div>
      <div className="flex flex-1 flex-col gap-2 p-6">
        <span className="text-xs font-semibold text-primary">Opción {props.option}</span>
        <span className="text-lg font-semibold leading-snug tracking-tight text-ink">{props.title}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">{props.description}</span>
        <span className="mt-auto pt-3 text-sm font-medium text-primary underline-offset-4 group-hover:underline">Elegir esta opción</span>
      </div>
    </button>
  )
}
