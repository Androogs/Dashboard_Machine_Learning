import type { Cell, MatrixColumn, MatrixRow, MatrixSheet, MetricInfo, Period, RawSheet } from '@/types/report'
import { norm } from '@/lib/format'
import { periodFromCell } from './matrixParser'

interface ExecutionGroup {
  targetColumn: number
  valueColumn: number
  period: Period
}

function findExecutionHeader(rows: Cell[][]): { row: number; groups: ExecutionGroup[] } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const header = rows[r] ?? []
    const groups: ExecutionGroup[] = []
    for (let c = 1; c < header.length - 1; c++) {
      const period = periodFromCell(header[c])
      if (period && norm(header[c - 1]) === 'megas' && norm(header[c + 1]) === 'cumplimiento') {
        groups.push({ targetColumn: c - 1, valueColumn: c, period })
      }
    }
    if (groups.length >= 2) return { row: r, groups }
  }
  return null
}

export function parseExecutionSheet(
  raw: RawSheet,
  ctx: { id: string; docIndex: number; fileName: string },
): MatrixSheet | null {
  const header = findExecutionHeader(raw.rows)
  if (!header) return null

  const columns: MatrixColumn[] = []
  const targetMetric: MetricInfo = { key: 'megas', label: 'Megas', role: 'target', periods: [] }
  const valueMetric: MetricInfo = { key: 'ejecutado', label: 'Ejecutado', role: 'value', periods: [] }
  for (const group of header.groups) {
    columns.push(
      { index: columns.length, metricKey: targetMetric.key, metricLabel: targetMetric.label, role: 'target', period: group.period },
      { index: columns.length + 1, metricKey: valueMetric.key, metricLabel: valueMetric.label, role: 'value', period: group.period },
    )
    if (!targetMetric.periods.some((period) => period.key === group.period.key)) targetMetric.periods.push(group.period)
    if (!valueMetric.periods.some((period) => period.key === group.period.key)) valueMetric.periods.push(group.period)
  }
  targetMetric.periods.sort((a, b) => a.key.localeCompare(b.key))
  valueMetric.periods.sort((a, b) => a.key.localeCompare(b.key))

  const rows: MatrixRow[] = []
  for (let r = header.row + 1; r < raw.rows.length; r++) {
    const source = raw.rows[r] ?? []
    const rawLabel = source[0]
    const label = typeof rawLabel === 'string' ? rawLabel.trim() : typeof rawLabel === 'number' ? String(rawLabel) : ''
    if (!label) {
      if (rows.length) break
      continue
    }
    const values = header.groups.flatMap(({ targetColumn, valueColumn }) => [
      typeof source[targetColumn] === 'number' && Number.isFinite(source[targetColumn]) ? source[targetColumn] as number : null,
      typeof source[valueColumn] === 'number' && Number.isFinite(source[valueColumn]) ? source[valueColumn] as number : null,
    ])
    if (!values.some((value) => value !== null)) continue
    const total = /^(total|gran total|sub\s*total)\b/i.test(label)
    rows.push({ label, group: total ? '' : 'General', type: total ? 'grandtotal' : 'item', values })
  }

  if (!rows.some((row) => row.type === 'item' && row.values.some((value, index) => index % 2 === 1 && value !== null))) return null

  return {
    kind: 'matrix',
    source: 'bloques',
    unit: { kind: 'units', label: 'megas' },
    notes: ['MEGAS se interpreta como meta y la columna del mes como ejecutado; el cumplimiento se recalcula como ejecutado / meta.'],
    id: ctx.id,
    name: raw.name.trim(),
    sheetName: raw.name.trim(),
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title: raw.name.trim(),
    dimensionLabel: 'Financiera',
    columns,
    metrics: [valueMetric, targetMetric],
    groups: ['General'],
    rows,
  }
}
