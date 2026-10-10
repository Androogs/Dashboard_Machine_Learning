import { useMemo } from 'react'
import type { PivotSheet } from '@/types/report'
import { fmtInt, fmtPct } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { ChartCard, Grid, KpiCard, ReportHeader } from './blocks'
import { DataTable, type Column } from './DataTable'
import { DonutChart } from './charts/DonutChart'
import { MultiSeriesChart, type SeriesDef } from './charts/MultiSeriesChart'
import { PALETTE } from './charts/theme'

interface PivotRowView {
  label: string
  cells: number[]
  total: number
  share: number
}

export function PivotReport({ sheet, title }: { sheet: PivotSheet; title: string }) {
  const view = useMemo(() => {
    const rows = sheet.rows.map((row) => {
      const cells = sheet.series.map((_, index) => row.values[index] ?? 0)
      const total = cells.reduce((sum, value) => sum + value, 0)
      return { label: row.label, cells, total, share: 0 }
    })
    const total = rows.reduce((sum, row) => sum + row.total, 0)
    rows.forEach((row) => (row.share = total ? row.total / total : 0))
    const seriesTotals = sheet.series.map((label, index) => ({
      label,
      value: rows.reduce((sum, row) => sum + row.cells[index], 0),
    }))
    return {
      rows: rows.sort((a, b) => b.total - a.total),
      total,
      seriesTotals,
    }
  }, [sheet])

  const series: SeriesDef[] = sheet.series.map((name, index) => ({ key: `series-${index}`, name, color: PALETTE[index % PALETTE.length] }))
  const chartData: Record<string, string | number | null>[] = view.rows.slice(0, 12).map((row) => {
    const point: Record<string, string | number | null> = { label: row.label }
    row.cells.forEach((value, index) => (point[`series-${index}`] = value))
    return point
  })
  const tableColumns: Column<PivotRowView>[] = [
    { key: 'label', header: sheet.dimensionLabel, render: (row) => <span className="font-medium text-ink">{row.label}</span>, sort: (row) => row.label },
    ...sheet.series.map((name, index): Column<PivotRowView> => ({
      key: `series-${index}`,
      header: name,
      align: 'right',
      render: (row) => fmtInt(row.cells[index]),
      sort: (row) => row.cells[index],
    })),
    { key: 'total', header: 'Total', align: 'right', render: (row) => <span className="font-semibold text-ink">{fmtInt(row.total)}</span>, sort: (row) => row.total },
    { key: 'share', header: 'Participación', align: 'right', render: (row) => fmtPct(row.share), sort: (row) => row.share },
  ]
  const footer = [
    'Total',
    ...view.seriesTotals.map((item) => fmtInt(item.value)),
    fmtInt(view.total),
    view.total ? '100 %' : '—',
  ]
  const leaders = [...view.seriesTotals].sort((a, b) => b.value - a.value)
  const donutItems = leaders.slice(0, 7)
  if (leaders.length > 7) donutItems.push({ label: 'Otras categorías', value: leaders.slice(7).reduce((sum, item) => sum + item.value, 0) })
  const leaderRow = view.rows[0]
  const subtitle = `${view.rows.length} ${sheet.dimensionLabel.toLowerCase()} · ${sheet.series.length} categoría(s) · ${sheet.measureLabel.toLowerCase()}`

  return (
    <div className="flex flex-col gap-5">
      <ReportHeader
        title={title}
        subtitle={subtitle}
        tags={
          <>
            <Badge>Tabla dinámica</Badge>
            <Badge variant="outline">{sheet.fileName}</Badge>
          </>
        }
      />

      <Grid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard emphasis label="Total" value={fmtInt(view.total)} sub={sheet.measureLabel} />
        <KpiCard label={sheet.dimensionLabel} value={fmtInt(view.rows.length)} sub="Categorías con datos" />
        <KpiCard label="Mayor categoría" value={leaderRow?.label ?? '—'} sub={leaderRow ? fmtInt(leaderRow.total) : undefined} />
        <KpiCard label="Líder por serie" value={leaders[0]?.label ?? '—'} sub={leaders[0] ? fmtInt(leaders[0].value) : undefined} />
      </Grid>

      <Grid className="lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title={`${sheet.measureLabel} por ${sheet.dimensionLabel.toLowerCase()}`} description="Principales 12 categorías; barras apiladas por serie">
          <MultiSeriesChart data={chartData} xKey="label" series={series} horizontal stacked format={fmtInt} />
        </ChartCard>
        {donutItems.length > 1 && (
          <ChartCard title={`Distribución por ${sheet.series.length > 1 ? 'serie' : sheet.dimensionLabel.toLowerCase()}`}>
            <DonutChart items={donutItems} centerLabel="Total" centerValue={fmtInt(view.total)} format={fmtInt} />
          </ChartCard>
        )}
      </Grid>

      <DataTable
        rows={view.rows}
        columns={tableColumns}
        rowKey={(row) => row.label}
        footer={footer}
        caption={`${sheet.measureLabel} por ${sheet.dimensionLabel}`}
      />

      {sheet.notes.length > 0 && (
        <ul className="space-y-0.5 px-1 text-[10.5px] text-muted-foreground">
          {sheet.notes.map((note) => <li key={note}>* {note}</li>)}
        </ul>
      )}
    </div>
  )
}
