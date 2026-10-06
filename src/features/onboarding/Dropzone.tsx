/**
 * Zona de carga con arrastrar/soltar y selección por clic.
 * Valida extensión y tamaño a través del store (validateFile).
 */
import { useRef, useState } from 'react'
import { FileSpreadsheet, UploadCloud, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtBytes } from '@/lib/format'

interface Props {
  label: string
  hint?: string
  file: File | null
  error: string | null
  onFile: (f: File | null) => void
  /** Si existe, muestra "Quitar" para eliminar este espacio de carga */
  onRemoveSlot?: () => void
}

export function Dropzone({ label, hint, file, error, onFile, onRemoveSlot }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const pick = (files: FileList | null) => {
    if (files && files.length > 1) {
      onFile(files[0])
      return
    }
    onFile(files?.[0] ?? null)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <span className="flex items-center gap-2">
          {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
          {onRemoveSlot && (
            <button type="button" onClick={onRemoveSlot} className="rounded px-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-ink">
              Quitar
            </button>
          )}
        </span>
      </div>

      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-positive/30 bg-positive-soft/60 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-positive shadow-card">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink" title={file.name}>
              {file.name}
            </p>
            <p className="text-xs text-muted-foreground">{fmtBytes(file.size)}, listo para analizar</p>
          </div>
          <button
            type="button"
            onClick={() => onFile(null)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-white hover:text-ink"
            aria-label={`Quitar ${file.name}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            pick(e.dataTransfer.files)
          }}
          className={cn(
            'flex min-h-[176px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card px-6 py-8 text-center transition-colors',
            over ? 'border-primary bg-accent' : 'border-input hover:border-primary/50 hover:bg-accent/40',
            error && 'border-negative/50',
          )}
        >
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-full', over ? 'bg-primary text-white' : 'bg-accent text-primary')}>
            <UploadCloud className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Arrastra el archivo aquí o haz clic para buscarlo</p>
            <p className="mt-1 text-xs text-muted-foreground">Excel .xlsx, .xlsm o .xls</p>
          </div>
        </button>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-negative" role="alert">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <input
        ref={input}
        type="file"
        accept=".xlsx,.xlsm,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
