/**
 * Orquestador del parseo: lee el libro y decide, hoja por hoja,
 * si es una MATRIZ (informe consolidado) o una base PLANA (registros).
 * Es código puro (sin DOM) para poder ejecutarse en un Web Worker o en Node.
 */
import type { ParsedWorkbook } from '@/types/report'
import { readWorkbook } from './readWorkbook'
import { parseRawSheet } from './detect'
import { HOJAS_CONFIDENCIALES, HOJAS_NO_PROCESAR } from '@/config/negocio'

export { parseRawSheet }

export type ProgressFn = (step: string, pct: number) => void

export function parseWorkbook(buf: ArrayBuffer, docIndex: number, fileName: string, onProgress?: ProgressFn): ParsedWorkbook {
  const t0 = Date.now()
  onProgress?.('Leyendo hojas del archivo', 15)
  const raws = readWorkbook(buf, { skip: (n) => HOJAS_NO_PROCESAR.test(n) })
  onProgress?.(`Detectando estructura de ${raws.length} hoja(s)`, 55)
  const sheets = raws.flatMap((raw, i) => {
    const s = parseRawSheet(raw, docIndex, fileName, i)
    onProgress?.(`Hoja "${raw.name.trim()}" lista`, 55 + Math.round(((i + 1) / raws.length) * 40))
    return s
  })
  // Si alguna tabla del archivo es de motos, las demás tablas de cantidades también se rotulan "motos"
  if (sheets.some((s) => s.kind === 'matrix' && s.unit.label === 'motos')) {
    for (const s of sheets) {
      if (s.kind === 'matrix' && s.unit.kind === 'units' && s.unit.label !== 'motos' && !HOJAS_CONFIDENCIALES.test(s.name)) {
        s.unit = { kind: 'units', label: 'motos' }
        const m = s.metrics.find((x) => x.label === 'Unidades')
        if (m) m.label = 'Motos vendidas'
        for (const c of s.columns) if (c.metricLabel === 'Unidades') c.metricLabel = 'Motos vendidas'
      }
    }
  }
  return { docIndex, fileName, fileSize: buf.byteLength, sheets, parseMs: Date.now() - t0 }
}
