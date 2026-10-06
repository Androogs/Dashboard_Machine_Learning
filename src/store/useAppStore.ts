/**
 * Estado global de la aplicación (Zustand).
 *
 * Pasos del flujo:
 *   onboarding → upload → processing → dashboard
 */
import { create } from 'zustand'
import type { ParsedWorkbook, Report, UploadMode } from '@/types/report'
import { parseFile, validateFile } from '@/parser'
import { buildReports } from '@/analysis/compare'
import { HOJAS_CONFIDENCIALES } from '@/config/negocio'

export type Step = 'onboarding' | 'upload' | 'processing' | 'review' | 'dashboard'

/** Selección por defecto: hojas con datos que no son contables/confidenciales. */
export function defaultSelection(workbooks: ParsedWorkbook[]): string[] {
  // Los documentos adicionales (ej: RUNT) y las hojas RUNT siempre quedan incluidos
  return workbooks.flatMap((w) =>
    w.sheets.filter((s) => s.kind !== 'empty' && (w.docIndex >= 2 || s.kind === 'runt' || !HOJAS_CONFIDENCIALES.test(s.name))).map((s) => s.id),
  )
}

/** ¿Vale la pena mostrar la revisión de hojas? (hojas omitidas, confidenciales, sin estructura o muchas hojas) */
function needsReview(workbooks: ParsedWorkbook[]): boolean {
  const sheets = workbooks.flatMap((w) => w.sheets)
  return sheets.length > 10 || sheets.some((s) => s.kind === 'empty' || (s.kind !== 'runt' && s.docIndex < 2 && HOJAS_CONFIDENCIALES.test(s.name)))
}

const filterWorkbooks = (wbs: ParsedWorkbook[], ids: string[]) => wbs.map((w) => ({ ...w, sheets: w.sheets.filter((s) => ids.includes(s.id)) }))

export interface ProgressState {
  doc: number
  step: string
  pct: number
}

interface AppState {
  step: Step
  mode: UploadMode | null
  /** [0] Documento 1, [1] Documento 2 (modo comparación), [2…] documentos adicionales (ej: RUNT) */
  files: (File | null)[]
  fileErrors: (string | null)[]
  /** Cantidad de espacios para documentos adicionales */
  extraSlots: number
  progress: ProgressState[]
  error: string | null
  workbooks: ParsedWorkbook[]
  reports: Report[]
  /** Id de la hoja activa ('' = la primera) */
  activeId: string
  isSample: boolean
  /** Ids de hojas incluidas en el dashboard */
  selected: string[]
  /** true si se pasó por la revisión de hojas (permite volver a ella desde el dashboard) */
  reviewed: boolean

  chooseMode: (m: UploadMode) => void
  setFile: (i: number, f: File | null) => void
  addExtra: () => void
  removeExtra: (i: number) => void
  backToOnboarding: () => void
  reset: () => void
  start: () => Promise<void>
  loadSample: () => Promise<void>
  setActive: (id: string) => void
  setSelected: (ids: string[]) => void
  confirmSelection: () => void
  openReview: () => void
}

const initial = {
  step: 'onboarding' as Step,
  mode: null,
  files: [null, null] as (File | null)[],
  fileErrors: [null, null] as (string | null)[],
  extraSlots: 0,
  progress: [],
  error: null,
  workbooks: [],
  reports: [],
  activeId: '',
  isSample: false,
  selected: [] as string[],
  reviewed: false,
}

export const useAppStore = create<AppState>((set, get) => ({
  ...initial,

  chooseMode: (mode) => set({ mode, step: 'upload', files: [null, null], fileErrors: [null, null], extraSlots: 0, error: null }),

  addExtra: () => set((s) => ({ extraSlots: Math.min(4, s.extraSlots + 1) })),
  removeExtra: (i) =>
    set((s) => {
      const files = [...s.files]
      const fileErrors = [...s.fileErrors]
      files.splice(2 + i, 1)
      fileErrors.splice(2 + i, 1)
      return { files, fileErrors, extraSlots: Math.max(0, s.extraSlots - 1) }
    }),

  setFile: (i, f) => {
    const files = [...get().files]
    const fileErrors = [...get().fileErrors]
    const err = f ? validateFile(f) : null
    files[i] = err ? null : f
    fileErrors[i] = err
    set({ files, fileErrors, error: null })
  },

  backToOnboarding: () => set({ ...initial }),
  reset: () => set({ ...initial }),
  setActive: (activeId) => {
    set({ activeId })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  },

  start: async () => {
    const { mode, files } = get()
    // Documento 1 (índice 0), Documento 2 en comparación (índice 1) y adicionales (índice 2+)
    const list: { file: File; doc: number }[] = []
    if (files[0]) list.push({ file: files[0], doc: 0 })
    if (mode === 'compare' && files[1]) list.push({ file: files[1], doc: 1 })
    files.slice(2).forEach((f, k) => f && list.push({ file: f, doc: 2 + k }))
    if (!list.length) return
    set({
      step: 'processing',
      error: null,
      progress: list.map((x) => ({ doc: x.doc, step: 'En cola', pct: 0 })),
    })
    try {
      const workbooks: ParsedWorkbook[] = []
      for (const { file, doc } of list) {
        const wb = await parseFile(file, doc, (step, pct) => set((s) => ({ progress: s.progress.map((p) => (p.doc === doc ? { ...p, step, pct } : p)) })))
        workbooks.push(wb)
      }
      if (!workbooks.some((w) => w.sheets.some((s) => s.kind !== 'empty'))) {
        throw new Error('No se encontraron hojas estructuradas. Revisa que el archivo tenga una fila de cabeceras con datos debajo.')
      }
      set((s) => ({ progress: s.progress.map((p) => ({ ...p, step: 'Listo', pct: 100 })) }))
      // Pequeña pausa para que el usuario vea el 100 %
      await new Promise((r) => setTimeout(r, 350))
      const selected = defaultSelection(workbooks)
      if (needsReview(workbooks)) {
        set({ workbooks, selected, step: 'review', reviewed: true, isSample: false })
      } else {
        set({ workbooks, selected, reports: buildReports(filterWorkbooks(workbooks, selected)), step: 'dashboard', activeId: '', isSample: false, reviewed: false })
      }
    } catch (e) {
      set({ step: 'upload', error: e instanceof Error ? e.message : String(e) })
    }
  },

  setSelected: (selected) => set({ selected }),

  confirmSelection: () => {
    const { workbooks, selected } = get()
    set({ reports: buildReports(filterWorkbooks(workbooks, selected)), step: 'dashboard', activeId: '' })
  },

  openReview: () => set({ step: 'review' }),

  /** Carga los datos de src/data/ejemplo.ts (útil para probar sin archivos). */
  loadSample: async () => {
    set({ step: 'processing', mode: 'single', progress: [{ doc: 0, step: 'Cargando ejemplo', pct: 40 }], error: null })
    const { buildSampleWorkbook } = await import('@/data/ejemplo')
    const wb = buildSampleWorkbook()
    await new Promise((r) => setTimeout(r, 450))
    set({ workbooks: [wb], selected: wb.sheets.map((s) => s.id), reports: buildReports([wb]), step: 'dashboard', activeId: '', isSample: true, reviewed: false })
  },
}))
