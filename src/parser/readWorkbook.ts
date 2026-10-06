/**
 * Lectura de libros Excel con SheetJS.
 *
 * Convierte cada hoja en una matriz de celdas (RawSheet) con tipos limpios:
 *  - números como number
 *  - textos recortados (vacíos → null)
 *  - fechas como ExcelDate (calculadas desde el serial de Excel, sin
 *    desfases de zona horaria que suelen aparecer con `cellDates: true`)
 */
import * as XLSXns from 'xlsx'
import type { Cell, ExcelDate, RawSheet } from '@/types/report'
import { makeDate } from './cells'

export { makeDate, isExcelDate, looksLikeExcel } from './cells'

// Compatibilidad: en navegador (ESM) los exports son nombrados; en Node (CJS) vienen en "default"
const DEFAULT_KEY = 'default'
const XLSX: typeof XLSXns = (XLSXns as unknown as { SSF?: unknown }).SSF
  ? XLSXns
  : (XLSXns as unknown as Record<string, typeof XLSXns>)[DEFAULT_KEY]

/** Límites de seguridad para no bloquear el navegador con hojas gigantes */
const MAX_ROWS = 250_000
const MAX_COLS = 400

/** Fechas en texto tipo "30/09/2026" o "2026-09-30" (respaldo por si el DMS exporta texto). */
function parseTextDate(s: string): ExcelDate | null {
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s.*)?$/)
  if (m) return makeDate(+m[3], +m[2], +m[1]) // formato colombiano dd/mm/aaaa
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/)
  if (m) return makeDate(+m[1], +m[2], +m[3])
  return null
}

function toCell(cell: XLSXns.CellObject | undefined, date1904: boolean): Cell {
  if (!cell || cell.v == null) return null
  const v = cell.v
  switch (cell.t) {
    case 'n': {
      const n = v as number
      // ¿El formato numérico de la celda corresponde a una fecha?
      if (cell.z && XLSX.SSF.is_date(String(cell.z))) {
        const p = XLSX.SSF.parse_date_code(n, { date1904 })
        if (p) return makeDate(p.y, p.m, p.d)
      }
      return isFinite(n) ? n : null
    }
    case 'd': {
      const dt = v as Date
      // Redondeo al día más cercano para neutralizar desfases de segundos/zonas
      const t = new Date(dt.getTime() + 12 * 3600 * 1000)
      return makeDate(t.getFullYear(), t.getMonth() + 1, t.getDate())
    }
    case 'b':
      return Boolean(v)
    case 'e':
      return null // errores tipo #DIV/0! se tratan como vacío
    default: {
      const s = String(v).trim()
      if (!s) return null
      const td = s.length <= 24 ? parseTextDate(s) : null
      return td ?? s
    }
  }
}

export interface ReadOptions {
  /** Hojas que no se procesan (se devuelven vacías con skipped = true) */
  skip?: (name: string) => boolean
}

export interface RawSheetResult extends RawSheet {
  skipped?: boolean
}

export function readWorkbook(buf: ArrayBuffer, opts: ReadOptions = {}): RawSheetResult[] {
  // 1.ª pasada (rápida): solo nombres de hojas, para decidir cuáles leer
  const names = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames
  const wanted = names.filter((n) => !opts.skip?.(n))
  const wb = XLSX.read(buf, {
    type: 'array',
    sheets: wanted,
    cellNF: true, // necesitamos el formato para detectar fechas
    cellDates: false,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
    sheetStubs: false,
  })
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904)

  return names.map((name) => {
    if (!wanted.includes(name)) return { name, rows: [], width: 0, skipped: true }
    const ws = wb.Sheets[name]
    const ref = ws?.['!ref']
    if (!ws || !ref) return { name, rows: [], width: 0 }

    const range = XLSX.utils.decode_range(ref)
    const lastRow = Math.min(range.e.r, range.s.r + MAX_ROWS)
    const lastCol = Math.min(range.e.c, range.s.c + MAX_COLS)
    const rows: Cell[][] = []
    let width = 0

    // Pre-calcular las letras de columna acelera mucho las hojas grandes
    const colLetters: string[] = []
    for (let c = 0; c <= lastCol; c++) colLetters[c] = XLSX.utils.encode_col(c)

    for (let r = 0; r <= lastRow; r++) {
      const row: Cell[] = new Array(lastCol + 1).fill(null)
      let lastFilled = -1
      for (let c = range.s.c; c <= lastCol; c++) {
        const val = toCell(ws[colLetters[c] + (r + 1)] as XLSXns.CellObject | undefined, date1904)
        if (val !== null) {
          row[c] = val
          lastFilled = c
        }
      }
      rows.push(row)
      if (lastFilled + 1 > width) width = lastFilled + 1
    }

    // Celdas combinadas: Excel solo guarda el valor en la esquina superior izquierda.
    // Se replica a todo el rango SOLO si es texto (ej: "ENERO" sobre 2025 | 2026);
    // los números no se replican para no duplicar cifras.
    for (const m of ws['!merges'] ?? []) {
      if (m.s.r > lastRow || m.s.c > lastCol) continue
      const v = rows[m.s.r]?.[m.s.c]
      if (typeof v !== 'string') continue
      // Títulos combinados a lo ancho (ej: "SUMOTO S.A." en A1:AB1) no se replican
      if (m.e.c - m.s.c + 1 > 4) continue
      for (let r = m.s.r; r <= Math.min(m.e.r, lastRow); r++) {
        for (let c = m.s.c; c <= Math.min(m.e.c, lastCol); c++) {
          if (rows[r][c] === null) rows[r][c] = v
          if (c + 1 > width) width = c + 1
        }
      }
    }

    // Quitar filas vacías al final
    while (rows.length && rows[rows.length - 1].every((c) => c === null)) rows.pop()
    for (const row of rows) row.length = width
    return { name, rows, width }
  })
}
