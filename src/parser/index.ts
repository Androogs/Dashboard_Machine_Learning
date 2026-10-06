/**
 * API pública del parser para la interfaz.
 * - validateFile: validación previa (extensión, tamaño, firma binaria)
 * - parseFile:    procesa un archivo en un Web Worker con progreso
 */
import type { ParsedWorkbook } from '@/types/report'
import type { WorkerResponse } from './excel.worker'
import { looksLikeExcel } from './cells'

export const MAX_FILE_MB = 60
const EXT = /\.(xlsx|xlsm|xls)$/i

export function validateFile(file: File): string | null {
  if (!EXT.test(file.name)) return 'Formato no válido. Carga un archivo de Excel (.xlsx, .xlsm o .xls).'
  if (file.size === 0) return 'El archivo está vacío.'
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `El archivo supera ${MAX_FILE_MB} MB. Divide la base o filtra el periodo en el DMS.`
  return null
}

export async function parseFile(
  file: File,
  docIndex: number,
  onProgress: (step: string, pct: number) => void,
): Promise<ParsedWorkbook> {
  const buf = await file.arrayBuffer()
  if (!looksLikeExcel(buf)) {
    throw new Error(`"${file.name}" no es un Excel válido o está dañado. Ábrelo en Excel y guárdalo de nuevo como .xlsx.`)
  }
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./excel.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      // Respaldo: procesar en el hilo principal si el navegador no admite workers de módulo
      import('./parseWorkbook').then(({ parseWorkbook }) => {
        try {
          resolve(parseWorkbook(buf, docIndex, file.name, onProgress))
        } catch (e) {
          reject(e)
        }
      })
      return
    }
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') onProgress(msg.step, msg.pct)
      else if (msg.type === 'done') {
        worker.terminate()
        resolve(msg.result)
      } else {
        worker.terminate()
        reject(new Error(`No se pudo leer "${file.name}": ${msg.message}`))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(`Error procesando "${file.name}": ${e.message}`))
    }
    worker.postMessage({ buf, docIndex, fileName: file.name }, [buf])
  })
}
