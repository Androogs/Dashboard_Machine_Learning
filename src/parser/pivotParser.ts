import type { Cell, PivotSheet, RawSheet } from '@/types/report'
import { norm, titleCase } from '@/lib/format'
import { isExcelDate } from './cells'

const isText = (value: Cell): value is string => typeof value === 'string' && value.trim() !== ''
const isTotal = (value: string) => /^(total|gran total|subtotal)\b/i.test(value.trim())
const isDimensionHeader = (value: string) => /^(etiquetas de fila|financieras?|marcas?|agencias?|asesores?|modelos?)$/i.test(value.trim())
const isMeasureHeader = (value: string) => /^(suma de|cantidad\b|cant\b|unidades?\b)/i.test(value.trim())
const isDerivedHeader = (value: string) => /(%|particip|cumplim|variac|diferenc)/i.test(value)

function dimensionFromName(name: string): string {
  const n = norm(name)
  if (n.includes('asesor')) return 'Asesor'
  if (n.includes('marca')) return 'Marca'
  if (n.includes('agencia')) return 'Agencia'
  if (n.includes('financiera')) return 'Financiera'
  return 'Elemento'
}

function readRows(
  rows: Cell[][],
  headerRow: number,
  labelColumn: number,
  valueColumns: number[],
): Array<{ label: string; values: (number | null)[] }> {
  const result: Array<{ label: string; values: (number | null)[] }> = []
  let started = false
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? []
    const rawLabel = row[labelColumn]
    const label = isText(rawLabel) ? rawLabel.trim() : typeof rawLabel === 'number' ? String(rawLabel) : ''
    if (isTotal(label)) break
    const values = valueColumns.map((c) => (typeof row[c] === 'number' && Number.isFinite(row[c]) ? row[c] as number : null))
    if (!label) {
      if (started) break
      continue
    }
    if (/^(etiquetas de fila|\(en blanco\)|\(blank\))$/i.test(label)) continue
    if (!values.some((value) => value !== null)) {
      if (started) break
      continue
    }
    started = true
    result.push({ label, values })
  }
  return result
}

function createPivot(
  raw: RawSheet,
  ctx: { id: string; docIndex: number; fileName: string },
  index: number,
  title: string,
  tableLabel: string,
  dimensionLabel: string,
  series: string[],
  rows: Array<{ label: string; values: (number | null)[] }>,
): PivotSheet {
  return {
    kind: 'pivot',
    id: `${ctx.id}-b${index}`,
    name: raw.name.trim(),
    sheetName: raw.name.trim(),
    tableLabel,
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title,
    dimensionLabel,
    measureLabel: 'Cantidad',
    series,
    rows,
    notes: ['Los totales y la participación se recalculan desde las filas de detalle.'],
  }
}

function financeTitle(rows: Cell[][], headerRow: number, labelColumn: number): string | null {
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 4); r--) {
    const row = rows[r] ?? []
    for (let c = Math.max(0, labelColumn - 1); c <= labelColumn + 1; c++) {
      if (norm(row[c]) !== 'financiera') continue
      const value = row[c + 1]
      if (isText(value) && norm(value).replace(/[()]/g, '') !== 'todas') return value.trim()
      if (isText(value)) return null
    }
  }
  return null
}

function sectionTitle(rows: Cell[][], headerRow: number, labelColumn: number): string | null {
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 3); r--) {
    const row = rows[r] ?? []
    for (let c = labelColumn; c <= labelColumn + 2; c++) {
      const value = row[c]
      if (!isText(value) || isDimensionHeader(value) || isMeasureHeader(value) || isDerivedHeader(value)) continue
      if (norm(value) === 'financiera' || /^\((todas|en blanco|blank)\)$/i.test(value.trim())) continue
      return value.trim()
    }
  }
  return null
}

/** Reconoce tablas dinámicas de Excel con categorías en columnas o en bloques. */
export function parsePivotSheet(
  raw: RawSheet,
  ctx: { id: string; docIndex: number; fileName: string },
): PivotSheet[] {
  const result: PivotSheet[] = []
  const rows = raw.rows
  const baseDimension = dimensionFromName(raw.name)
  const keepMainBrandCrossTab = norm(raw.name) === 'marca y financiera'

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []
    for (let labelColumn = 0; labelColumn < row.length; labelColumn++) {
      const labelHeader = row[labelColumn]
      if (!isText(labelHeader) || !isDimensionHeader(labelHeader)) continue

      const above = rows[r - 1] ?? []
      const isCrossTab = norm(labelHeader) === 'etiquetas de fila'
        && above.some((cell) => isText(cell) && norm(cell) === 'etiquetas de columna')
      if (isCrossTab) {
        const dimension = titleCase(row
          .slice(labelColumn + 1)
          .map((cell) => (isText(cell) && !isDerivedHeader(cell) && !isTotal(cell) ? cell.trim() : ''))
          .filter(Boolean)
          .at(-1) ?? baseDimension)
        const series: string[] = []
        const valueColumns: number[] = []
        for (let c = labelColumn + 1; c < row.length; c++) {
          const heading = row[c]
          if (isText(heading) && (isTotal(heading) || isDerivedHeader(heading))) break
          if (!isText(heading)) continue
          const hasValue = rows.slice(r + 1).some((dataRow) => typeof dataRow[c] === 'number')
          if (!hasValue) continue
          series.push(heading.trim())
          valueColumns.push(c)
        }
        if (series.length) {
          const data = readRows(rows, r, labelColumn, valueColumns)
          if (data.length) {
            result.push(createPivot(raw, ctx, result.length, raw.name.trim(), `${dimension} y financiera`, dimension, series, data))
            if (keepMainBrandCrossTab) return result.map((sheet) => ({ ...sheet, id: ctx.id }))
          }
        }
        continue
      }

      if (above.some(isExcelDate)) continue
      let measureColumn = -1
      let measure = ''
      for (let c = labelColumn + 1; c < row.length; c++) {
        if (isText(row[c]) && isMeasureHeader(row[c] as string)) {
          measureColumn = c
          measure = (row[c] as string).trim()
          break
        }
      }
      if (measureColumn < 0) continue

      const data = readRows(rows, r, labelColumn, [measureColumn])
      if (!data.length) continue
      const finance = financeTitle(rows, r, labelColumn)
      const section = sectionTitle(rows, r, labelColumn)
      const dimension = titleCase(baseDimension === 'Marca' && finance ? 'Marca' : baseDimension)
      const detail = finance ?? section
      const title = detail ? `${raw.name.trim()} — ${detail}` : raw.name.trim()
      const tableLabel = detail ? `${dimension} · ${detail}` : dimension
      result.push(createPivot(raw, ctx, result.length, title, tableLabel, dimension, [measure], data))
    }
  }

  return result.map((sheet, index) => ({ ...sheet, id: result.length === 1 ? ctx.id : `${ctx.id}-b${index}` }))
}
