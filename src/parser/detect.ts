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
import { parsePivotSheet } from './pivotParser'
import { parseExecutionSheet } from './executionParser'
import { norm } from '@/lib/format'

function splitDisbursementMetrics(sheets: ReturnType<typeof parseBlocks>): ParsedSheet[] {
  return sheets.flatMap((sheet) => sheet.metrics
    .filter((metric) => metric.role === 'value')
    .map((metric, metricIndex) => {
      const selected = sheet.columns
        .map((column, index) => ({ column, index }))
        .filter(({ column }) => column.metricKey === metric.key && column.role === 'value')
      const isMoney = /pesos|valor|desembolso/.test(norm(metric.label))
      return {
        ...sheet,
        id: `${sheet.id}-m${metricIndex}`,
        name: `${sheet.name} - ${sheet.title} — ${metric.label}`,
        title: `${sheet.title} — ${metric.label}`,
        tableLabel: metric.label,
        unit: isMoney ? { kind: 'money' as const, label: '' } : { kind: 'units' as const, label: 'unid.' },
        columns: selected.map(({ column }, index) => ({ ...column, index })),
        metrics: [metric],
        rows: sheet.rows.map((row) => ({ ...row, values: selected.map(({ index }) => row.values[index] ?? null) })),
      }
    }))
}

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
    const normalizedName = norm(sheetName)
    const hasUnlabeledExecutionGroups = raw.rows.some((row) => {
      const megas = row.filter((cell) => typeof cell === 'string' && norm(cell) === 'megas').length
      const compliance = row.filter((cell) => typeof cell === 'string' && norm(cell) === 'cumplimiento').length
      return megas > 1 && compliance > 1
    })
    if (/^ejecucion de financieras\b/.test(normalizedName) && hasUnlabeledExecutionGroups) {
      const execution = parseExecutionSheet(raw, ctx)
      if (execution) return [{ ...execution, sheetName }]
      return empty('No se pudieron asociar de forma fiable las columnas MEGAS, mes y cumplimiento.')
    }
    if (/^(comparativo mes a mes|acumulado 2025[- ]2026|desembolso financieras)$/.test(normalizedName)) {
      const blocks = parseBlocks(raw, ctx)
      if (blocks.length) {
        const reports = normalizedName === 'desembolso financieras'
          ? splitDisbursementMetrics(blocks)
          : blocks.map((block) => ({ ...block, sheetName }))
        if (reports.length) return reports
      }
    }
    const pivots = parsePivotSheet(raw, ctx)
    if (pivots.length) return pivots
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
