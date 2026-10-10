import type { Cell, MatrixColumn, MatrixRow, MatrixSheet, MetricInfo, Period, RawSheet } from '@/types/report'
import { detectUnit } from '@/lib/units'
import { monthShort, norm } from '@/lib/format'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

interface PeriodStart {
  column: number
  period: Period
}

interface ValueColumn {
  source: number
  period: Period
  metric: 'target' | 'value'
}

function text(value: Cell): string {
  return typeof value === 'string' ? value.trim() : ''
}

function monthNumber(value: Cell): number | null {
  const valueText = norm(value)
  if (/acumulado|total/.test(valueText)) return null
  const index = MONTHS.findIndex((month) => valueText.includes(month))
  if (index >= 0) return index + 1
  if (valueText.startsWith('sept') || valueText.startsWith('set')) return 9
  return null
}

function detectPeriods(header: Cell[], year: number): PeriodStart[] {
  const periods: PeriodStart[] = []
  let previousMonth = 0
  for (let column = 0; column < header.length; column++) {
    const month = monthNumber(header[column])
    if (!month || month === previousMonth) continue
    previousMonth = month
    periods.push({
      column,
      period: {
        key: `${year}-${String(month).padStart(2, '0')}`,
        year,
        month,
        label: `${monthShort(month)} ${year}`,
      },
    })
  }
  return periods
}

function classifySubheader(value: Cell): 'target' | 'value' | 'ratio' | null {
  const label = norm(value)
  if (/^(pres|ppto|presupuesto|meta)\b/.test(label)) return 'target'
  if (/^(real|ejecucion|ejecutado|venta)\b/.test(label)) return 'value'
  if (/%|cumpl|porc/.test(label)) return 'ratio'
  return null
}

function columnsForPeriods(
  periods: PeriodStart[],
  subheader: Cell[] | undefined,
  width: number,
): ValueColumn[] {
  const columns: ValueColumn[] = []
  for (const { column, period } of periods) {
    if (subheader) {
      let target: number | null = null
      let value: number | null = null
      for (let source = column; source < Math.min(column + 3, width); source++) {
        const role = classifySubheader(subheader[source])
        if (role === 'target') target = source
        if (role === 'value') value = source
      }
      if (target !== null) columns.push({ source: target, period, metric: 'target' })
      if (value !== null) columns.push({ source: value, period, metric: 'value' })
      if (target === null && value === null && column + 1 < width) {
        columns.push({ source: column, period, metric: 'target' }, { source: column + 1, period, metric: 'value' })
      }
    } else {
      columns.push({ source: column, period, metric: 'value' })
    }
  }
  return columns
}

function numeric(value: Cell): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/\s/g, '').replace(/,/g, '')
  if (!cleaned || !/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function rowType(label: string, section: number): MatrixRow['type'] {
  if (!/^(total|gran total|total general|sub\s*total)\b/i.test(label)) return 'item'
  return section === 4 ? 'subtotal' : 'grandtotal'
}

function createBudgetTable(
  raw: RawSheet,
  ctx: { id: string; docIndex: number; fileName: string },
  tableIndex: number,
  options: {
    headerRow: number
    endRow: number
    section: number
    title: string
    tableLabel: string
    dimension: string
    year: number
    starts: PeriodStart[]
    subheader?: Cell[]
    initialGroup?: string
  },
): MatrixSheet | null {
  const valueColumns = columnsForPeriods(options.starts, options.subheader, raw.width)
  if (!valueColumns.length) return null
  const hasTarget = valueColumns.some((column) => column.metric === 'target')
  const metrics: MetricInfo[] = hasTarget
    ? [
        { key: 'presupuesto', label: 'Presupuesto', role: 'target', periods: [] },
        { key: 'ejecutado', label: 'Ejecutado', role: 'value', periods: [] },
      ]
    : [{ key: 'presupuesto', label: 'Presupuesto', role: 'value', periods: [] }]
  const metricByRole = new Map(metrics.map((metric) => [metric.role, metric]))
  const columns: MatrixColumn[] = valueColumns.map((column, index) => {
    const metric = metricByRole.get(column.metric)!
    if (!metric.periods.some((period) => period.key === column.period.key)) metric.periods.push(column.period)
    return {
      index,
      metricKey: metric.key,
      metricLabel: metric.label,
      role: column.metric,
      period: column.period,
    }
  })

  const rows: MatrixRow[] = []
  const groups: string[] = []
  let group = options.initialGroup ?? 'General'
  if (options.initialGroup) groups.push(options.initialGroup)
  for (let rowIndex = options.headerRow + (options.subheader ? 2 : 1); rowIndex < options.endRow; rowIndex++) {
    const source = raw.rows[rowIndex] ?? []
    const label = text(source[0]) || (typeof source[0] === 'number' ? String(source[0]) : '')
    if (!label) continue
    const normalized = norm(label)
    if (/^seccion\s+[1-4]\b/.test(normalized)) break
    if (/^(marca|sede|modelo)$/.test(normalized)) continue

    const seat = label.match(/^►\s*SEDE\s*:\s*(.+)$/i)
    if (seat) {
      group = seat[1].trim()
      if (!groups.includes(group)) groups.push(group)
      continue
    }

    const values = valueColumns.map(({ source: column }) => numeric(source[column]))
    if (!values.some((value) => value !== null)) continue

    const type = rowType(label, options.section)
    rows.push({
      label,
      group: type === 'grandtotal' ? '' : group,
      type,
      values,
      ...(options.section === 4 && type === 'subtotal' ? { partial: true } : {}),
    })
  }

  if (!rows.some((row) => row.type === 'item')) return null
  const sample = rows.filter((row) => row.type === 'item').flatMap((row) =>
    row.values.filter((value): value is number => value !== null),
  )
  const unit = detectUnit(sample, `${raw.name} ${options.title} ${ctx.fileName}`)
  for (const metric of metrics) metric.periods.sort((a, b) => a.key.localeCompare(b.key))

  return {
    kind: 'matrix',
    source: 'informe',
    unit,
    notes: ['Los porcentajes de cumplimiento y totales se recalculan desde las filas de detalle.'],
    sheetName: raw.name.trim(),
    tableLabel: options.tableLabel,
    id: `${ctx.id}-b${tableIndex}`,
    name: options.title,
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title: options.title,
    dimensionLabel: options.dimension,
    columns,
    metrics,
    groups: groups.length ? groups : ['General'],
    rows,
  }
}

function budgetYear(rows: Cell[][], fileName: string): number {
  const context = `${fileName} ${rows.slice(0, 5).flat().map(text).join(' ')}`
  return Number(context.match(/\b(19|20)\d{2}\b/)?.[0] ?? 2026)
}

function sectionHeaders(rows: Cell[][]): Array<{ row: number; section: number }> {
  const sections: Array<{ row: number; section: number }> = []
  rows.forEach((row, index) => {
    const match = norm(row[0]).match(/^seccion\s+([1-4])\b/)
    if (match) sections.push({ row: index, section: Number(match[1]) })
  })
  return sections
}

function sectionTables(
  raw: RawSheet,
  ctx: { id: string; docIndex: number; fileName: string },
  nextTableIndex: number,
  year: number,
): MatrixSheet[] {
  const rows = raw.rows
  const sections = sectionHeaders(rows)
  if (!sections.length) return []

  const output: MatrixSheet[] = []
  for (let index = 0; index < sections.length; index++) {
    const { row: sectionRow, section } = sections[index]
    const endRow = sections[index + 1]?.row ?? rows.length
    const headerRow = rows.findIndex((row, rowIndex) => {
      if (rowIndex <= sectionRow || rowIndex >= endRow) return false
      const label = norm(row[0])
      return label === 'sede' || label === 'modelo'
    })
    if (headerRow < 0) continue

    const header = rows[headerRow] ?? []
    const subheader = rows[headerRow + 1] ?? []
    const hasSubheader = subheader.some((cell) => classifySubheader(cell) !== null)
    const starts = detectPeriods(header, year)
    if (!starts.length) continue
    const initialGroup = section === 4
      ? rows.slice(sectionRow + 1, headerRow)
          .map((row) => text(row[0]).match(/^►\s*SEDE\s*:\s*(.+)$/i)?.[1]?.trim())
          .find((value): value is string => Boolean(value))
      : undefined
    const titleBySection: Record<number, { title: string; tableLabel: string; dimension: string }> = {
      1: { title: 'Presupuesto 2026 por sede', tableLabel: 'Presupuesto por sede', dimension: 'Sede' },
      2: { title: 'Presupuesto vs ejecutado por sede', tableLabel: 'Ejecución por sede', dimension: 'Sede' },
      3: { title: 'Presupuesto vs ejecutado por modelo', tableLabel: 'Ejecución por modelo', dimension: 'Modelo' },
      4: { title: 'Presupuesto vs ejecutado por sede y modelo', tableLabel: 'Detalle por sede y modelo', dimension: 'Modelo' },
    }
    const details = titleBySection[section]
    const table = createBudgetTable(raw, ctx, nextTableIndex + output.length, {
      headerRow,
      endRow,
      section,
      ...details,
      year,
      starts,
      subheader: hasSubheader ? subheader : undefined,
      initialGroup,
    })
    if (table) output.push(table)
  }
  return output
}

function summaryTable(
  raw: RawSheet,
  ctx: { id: string; docIndex: number; fileName: string },
  tableIndex: number,
  year: number,
): MatrixSheet | null {
  const headerRow = raw.rows.findIndex((row) => norm(row[0]) === 'marca')
  if (headerRow < 0) return null
  const header = raw.rows[headerRow] ?? []
  const subheader = raw.rows[headerRow + 1] ?? []
  const starts = detectPeriods(header, year)
  if (!starts.length) return null
  const summary = createBudgetTable(raw, ctx, tableIndex, {
    headerRow,
    endRow: raw.rows.length,
    section: 2,
    title: 'Ejecución presupuestal por marca',
    tableLabel: 'Ejecución por marca',
    dimension: 'Marca',
    year,
    starts,
    subheader,
  })
  return summary ? { ...summary, presentation: 'budget-summary' } : null
}

/** Convierte las tablas de ejecución presupuestal a reportes normales del dashboard. */
export function parseBudgetExecutionWorkbook(
  raws: RawSheet[],
  ctx: { docIndex: number; fileName: string },
): MatrixSheet[] | null {
  const hasSummary = raws.some((raw) => norm(raw.name) === 'resumen general' && raw.rows.some((row) => norm(row[0]) === 'marca'))
  const hasBrandSections = raws.some((raw) => sectionHeaders(raw.rows).length >= 2)
  if (!hasSummary || !hasBrandSections) return null

  const year = budgetYear(raws.flatMap((raw) => raw.rows), ctx.fileName)
  const reports: MatrixSheet[] = []
  raws.forEach((raw, index) => {
    const sheetCtx = { ...ctx, id: `d${ctx.docIndex}-s${index}` }
    if (norm(raw.name) === 'resumen general') {
      const summary = summaryTable(raw, sheetCtx, 0, year)
      if (summary) reports.push(summary)
      return
    }
    reports.push(...sectionTables(raw, sheetCtx, 0, year))
  })

  return reports.length ? reports : null
}
