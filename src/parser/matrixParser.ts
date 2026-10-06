/**
 * Parser de hojas tipo MATRIZ (Informe Comercial de Advance DMS).
 *
 * Estructura esperada (ver src/data/ejemplo.ts):
 *
 *   fila título   |            | INFORME POSVENTA |          |  ...
 *   fila métricas | AGENCIA    | META     | MOSTRADOR | TALLER | TOTAL VENTAS | CUMPLIMIENTO | META ...
 *   fila periodos | SUZUKI     | 2026-01  | 2026-01   | ...                  | %            | 2026-02 ...
 *   datos         | 102 - ...  | 145000000| ...
 *   grupo         | AKT        |          |           (fila sin valores = encabezado de grupo)
 *   total         | TOTAL      | ...      (subtotal del grupo; el último TOTAL es el total general)
 *
 * La detección es dinámica: se busca una fila de cabeceras seguida de una
 * fila con fechas o años. No depende de posiciones fijas.
 */
import type { Cell, MatrixColumn, MatrixRow, MatrixSheet, MetricInfo, MetricRole, Period, RawSheet } from '@/types/report'
import { isExcelDate } from './cells'
import { FILA_TOTAL, METRICAS } from '@/config/negocio'
import { monthShort, norm } from '@/lib/format'
import { detectUnit } from '@/lib/units'
import { parseMonthText } from './blockParser'

const isYear = (c: Cell) => typeof c === 'number' && Number.isInteger(c) && c >= 1990 && c <= 2100
const isText = (c: Cell): c is string => typeof c === 'string' && c.trim() !== ''

export function periodFromCell(c: Cell): Period | null {
  if (isExcelDate(c)) {
    return { key: `${c.y}-${String(c.m).padStart(2, '0')}`, year: c.y, month: c.m, label: `${monthShort(c.m)} ${c.y}` }
  }
  if (isYear(c)) {
    const y = c as number
    return { key: String(y), year: y, month: null, label: String(y) }
  }
  return null
}

/** Busca la fila de métricas (r) y la de periodos (r+1). Devuelve -1 si no aplica. */
export function findMatrixHeader(rows: Cell[][]): number {
  const limit = Math.min(rows.length - 2, 25)
  for (let r = 0; r < limit; r++) {
    const head = rows[r]
    const next = rows[r + 1]
    if (!head || !next) continue
    const headFilled = head.slice(1).filter((c) => c !== null).length
    const nextFilled = next.slice(1).filter((c) => c !== null).length
    const textCols = head.slice(1).filter(isText).length
    const periodCols = next.slice(1).filter((c) => periodFromCell(c) !== null).length
    // Reglas: ≥2 métricas en texto, ≥2 periodos debajo, y la fila de periodos debe estar
    // compuesta mayoritariamente por periodos (así no se confunde con un registro de una base plana
    // que trae varias fechas sueltas).
    // Si la fila de métricas son nombres de meses ("ENERO", "FEBRERO"…) es una tabla por bloques, no un Informe
    const monthCols = head.slice(1).filter((c) => isText(c) && parseMonthText(c)).length
    if (
      monthCols < textCols * 0.5 &&
      textCols >= 2 &&
      textCols >= headFilled * 0.6 &&
      periodCols >= 2 &&
      periodCols >= nextFilled * 0.5 &&
      isText(head[0]) &&
      !isExcelDate(next[0])
    ) {
      const hasNumbers = rows.slice(r + 2, r + 8).some((row) => row.slice(1).some((c) => typeof c === 'number'))
      if (hasNumbers) return r
    }
  }
  return -1
}

function classifyMetric(label: string): MetricRole {
  const n = norm(label)
  if (METRICAS.meta.test(n)) return 'target'
  if (METRICAS.derivada.test(n)) return 'derived'
  if (METRICAS.ratio.test(n)) return 'ratio'
  return 'value'
}

export function parseMatrix(
  raw: RawSheet,
  headerRow: number,
  ctx: { id: string; docIndex: number; fileName: string },
): MatrixSheet {
  const { rows, width } = raw
  const head = rows[headerRow]
  const periodsRow = rows[headerRow + 1]

  // Título: textos de las filas superiores (ej: "COMPARATIVO" + "AÑO A AÑO")
  const titleParts: string[] = []
  for (let r = 0; r < headerRow; r++) {
    for (const c of rows[r]) if (isText(c) && !titleParts.includes(c.trim())) titleParts.push(c.trim())
  }

  /* ---------- Columnas ---------- */
  const columns: MatrixColumn[] = []
  let lastPeriod: Period | null = null
  let lastLabel = ''
  for (let c = 1; c < width; c++) {
    const h = head[c]
    const rawLabel = isText(h) ? h.trim() : ''
    // Celdas combinadas: si la cabecera está vacía pero hay periodo, hereda la métrica anterior
    const label = rawLabel || (periodFromCell(periodsRow[c]) ? lastLabel : '')
    if (!label) continue
    lastLabel = label
    const role = classifyMetric(label)
    let period = periodFromCell(periodsRow[c])
    // "CUMPLIMIENTO %" o "%" pertenecen al periodo de la columna anterior
    if (!period && role !== 'value' && role !== 'target') period = lastPeriod
    if (period) lastPeriod = period
    columns.push({ index: c, metricKey: norm(label), metricLabel: label.replace(/\s+/g, ' '), role, period })
  }

  /* ---------- Métricas ---------- */
  const metricMap = new Map<string, MetricInfo>()
  for (const col of columns) {
    let m = metricMap.get(col.metricKey)
    if (!m) {
      m = { key: col.metricKey, label: col.metricLabel, role: col.role, periods: [] }
      metricMap.set(col.metricKey, m)
    }
    if (col.period && !m.periods.some((p) => p.key === col.period!.key)) m.periods.push(col.period)
  }
  for (const m of metricMap.values()) m.periods.sort((a, b) => a.key.localeCompare(b.key))

  /* ---------- Filas ---------- */
  const out: MatrixRow[] = []
  const groups: string[] = []
  let group = ''
  let groupHasTotal = false

  // El primer grupo suele estar en la celda A de la fila de periodos (ej: "SUZUKI")
  if (isText(periodsRow[0])) {
    group = periodsRow[0].trim()
    groups.push(group)
  }

  for (let r = headerRow + 2; r < rows.length; r++) {
    const row = rows[r]
    const label = isText(row[0]) ? row[0].trim() : typeof row[0] === 'number' ? String(row[0]) : ''
    const values = columns.map((col) => {
      const v = row[col.index]
      return typeof v === 'number' && isFinite(v) ? v : null
    })
    const hasValues = values.some((v) => v !== null)

    if (!label && !hasValues) continue // fila en blanco
    if (!label) continue // valores huérfanos sin etiqueta (notas, fórmulas sueltas)

    if (!hasValues && !FILA_TOTAL.test(label)) {
      // Encabezado de grupo (marca)
      group = label
      groupHasTotal = false
      if (!groups.includes(group)) groups.push(group)
      continue
    }

    if (FILA_TOTAL.test(label)) {
      const isGrand = !group || groupHasTotal
      out.push({ label, group: isGrand ? '' : group, type: isGrand ? 'grandtotal' : 'subtotal', values })
      if (!isGrand) groupHasTotal = true
      continue
    }

    if (!group) {
      group = 'General'
      groups.push(group)
    }
    out.push({ label, group, type: 'item', values })
  }

  const valueIdx = columns.map((c, i) => (c.role === 'value' ? i : -1)).filter((i) => i >= 0)
  const sample = out.filter((r) => r.type === 'item').flatMap((r) => valueIdx.map((i) => r.values[i]).filter((v): v is number => v != null))
  const unit = detectUnit(sample, `${raw.name} ${titleParts.join(' ')} ${ctx.fileName}`)

  return {
    kind: 'matrix',
    source: 'informe',
    unit,
    notes: ['CUMPLIMIENTO, COMPARATIVO, DIFERENCIA y % del Excel se recalculan desde los valores base.'],
    id: ctx.id,
    name: raw.name.trim(),
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title: titleParts.join(' ').replace(/\s+/g, ' ') || raw.name.trim(),
    dimensionLabel: isText(head[0]) ? head[0].trim() : 'Elemento',
    columns,
    metrics: [...metricMap.values()],
    groups,
    rows: out,
  }
}
