/**
 * Utilidades de celdas sin dependencia de SheetJS
 * (así el bundle principal no carga la librería; solo el Web Worker).
 */
import type { ExcelDate } from '@/types/report'

export function makeDate(y: number, m: number, d: number): ExcelDate {
  return { kind: 'date', y, m, d, ms: Date.UTC(y, m - 1, d) }
}

export function isExcelDate(c: unknown): c is ExcelDate {
  return typeof c === 'object' && c !== null && (c as ExcelDate).kind === 'date'
}

/** Valida la firma binaria del archivo (ZIP para .xlsx / OLE2 para .xls). */
export function looksLikeExcel(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf.slice(0, 8))
  const isZip = b[0] === 0x50 && b[1] === 0x4b
  const isOle = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0
  return isZip || isOle
}
