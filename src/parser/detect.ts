/**
 * Detección del tipo de hoja. Sin dependencia de SheetJS.
 *
 * Orden de prueba:
 *  1. MATRIZ tipo Informe comercial (fila de métricas + fila de periodos)
 *  2. TABLAS POR BLOQUES (fechas/meses en el encabezado, varias tablas por hoja)
 *  3. BASE PLANA (un registro por fila)
 *
 * Una hoja puede producir varios reportes (ej: una tabla por SEDE y otra por ASESOR).
 */
import type { ParsedSheet, RawSheet } from '@/types/report'
import { findMatrixHeader, parseMatrix } from './matrixParser'
import { parseBlocks } from './blockParser'
import { findFlatHeader, parseFlat } from './flatParser'
import { isRuntSheet, parseRunt } from './runtParser'

export function parseRawSheet(raw: RawSheet & { skipped?: boolean }, docIndex: number, fileName: string, i: number): ParsedSheet[] {
  const id = `d${docIndex}-s${i}`
  const ctx = { id, docIndex, fileName }
  const empty = (reason: string, skipped = false): ParsedSheet[] => [{ kind: 'empty', id, name: raw.name, docIndex, fileName, reason, skipped }]

  if (raw.skipped) return empty('Hoja contable de gran tamaño: se omitió para agilizar la carga.', true)
  const dataRows = raw.rows.filter((r) => r.some((c) => c !== null)).length
  if (dataRows < 2 || raw.width < 2) return empty('La hoja está vacía o no tiene suficientes datos.')

  const sheetName = raw.name.trim()
  try {
    if (isRuntSheet(raw)) {
      const runt = parseRunt(raw, ctx)
      if (runt) return [runt]
    }
    const m = findMatrixHeader(raw.rows)
    if (m >= 0) {
      const sheet = parseMatrix(raw, m, ctx)
      if (sheet.rows.some((r) => r.type === 'item') && sheet.metrics.some((x) => x.role === 'value' && x.periods.length)) return [{ ...sheet, sheetName }]
    }
    const blocks = parseBlocks(raw, ctx)
    if (blocks.length) return blocks.map((b) => ({ ...b, sheetName, tableLabel: blocks.length > 1 ? b.dimensionLabel : undefined }))

    const f = findFlatHeader(raw.rows, raw.width)
    if (f >= 0) {
      const sheet = parseFlat(raw, f, ctx)
      if (sheet.rowCount > 0) return [{ ...sheet, sheetName }]
    }
  } catch (e) {
    return empty(`No se pudo interpretar la hoja: ${e instanceof Error ? e.message : String(e)}`)
  }
  return empty('No se encontró una fila de cabeceras con datos estructurados debajo.')
}
