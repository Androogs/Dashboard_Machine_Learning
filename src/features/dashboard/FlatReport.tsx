/**
 * Reporte de una hoja PLANA (base de registros del DMS) analizada sola.
 * La comparación es intra-archivo: mes a mes y año a año si hay varios años.
 */
import { useMemo, useState } from 'react'
import type { FlatSheet } from '@/types/report'
import { computeFlat, dateCols, defaultFlatConfig, dimensions, measures, type DimRow, type FlatConfig } from '@/analysis/flat'
import { fmtInt, fmtPct } from '@/lib/format'
import { flatFormat } from '@/analysis/flatFormat'
import { Badge } from '@/components/ui/badge'
import { ChartCard, FilterBar, FilterField, Grid, KpiCard, ReportHeader, VarBadge } from './blocks'
import { DataTable, type Column } from './DataTable'
import { DonutChart } from './charts/DonutChart'
import { MultiSeriesChart } from './charts/MultiSeriesChart'
import { TrendChart } from './charts/TrendChart'
import { C, yearColor } from './charts/theme'

export function FlatReport({ sheet, title }: { sheet: FlatSheet; title: string }) {
  const [cfg, setCfg] = useState<FlatConfig>(() => defaultFlatConfig(sheet))
  const view = useMemo(() => computeFlat(sheet, cfg), [sheet, cfg])

  const F = flatFormat(sheet, view.measure)
  const f = (v: number) => F.compact(v)
  const full = (v: number | null) => F.full(v)
  const dimName = view.dimension?.name ?? ''
  const periodLabel = cfg.month === 'all' ? (view.months.length ? `${view.months[0].label} a ${view.months.at(-1)!.label}` : 'Todo el archivo') : view.curMonth?.label ?? ''

  const columns: Column<DimRow>[] = [
    { key: 'label', header: dimName, render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, sort: (r) => r.short },
    { key: 'value', header: `${view.measure.name} (${cfg.month === 'all' ? 'acumulado' : view.curMonth?.label ?? ''})`, align: 'right', render: (r) => <span className="font-semibold text-ink">{full(r.value)}</span>, sort: (r) => r.value },
    { key: 'share', header: 'Participación', align: 'right', render: (r) => fmtPct(r.share), sort: (r) => r.share },
    { key: 'count', header: 'Registros', align: 'right', render: (r) => fmtInt(r.count), sort: (r) => r.count },
    ...(view.curMonth && view.prevMonth
      ? ([
          { key: 'cur', header: view.curMonth.label, align: 'right', render: (r) => full(r.cur), sort: (r) => r.cur },
          { key: 'prev', header: view.prevMonth.label, align: 'right', render: (r) => full(r.prev), sort: (r) => r.prev },
          { key: 'var', header: 'Var. %', align: 'right', render: (r) => <VarBadge value={r.varPct} />, sort: (r) => r.varPct },
        ] as Column<DimRow>[])
      : []),
  ]
  const curTotal = view.byDim.reduce((a, r) => a + (r.cur ?? 0), 0)
  const prevTotal = view.byDim.reduce((a, r) => a + (r.prev ?? 0), 0)
  const footer = [
    'Total',
    full(view.total),
    '100 %',
    fmtInt(view.count),
    ...(view.curMonth && view.prevMonth ? [full(curTotal), full(prevTotal), <VarBadge key="v" value={prevTotal ? (curTotal - prevTotal) / Math.abs(prevTotal) : null} />] : []),
  ]

  const top = view.byDim.slice(0, 12).map((r) => ({ label: r.short, value: r.value }))
  const vsMonth = view.prevMonth ? view.byDim.slice(0, 10).map((r) => ({ label: r.short, a: r.cur, b: r.prev })) : []
  const dateOptions = dateCols(sheet)

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader
        title={title}
        subtitle={`${sheet.title ? `${sheet.title}. ` : ''}${fmtInt(sheet.rowCount)} registros${sheet.generatedAt ? `. Generado el ${sheet.generatedAt}` : ''}.`}
        tags={
          <>
            <Badge>Base de registros</Badge>
            <Badge variant="outline">{sheet.fileName}</Badge>
          </>
        }
      />

      <FilterBar>
        <FilterField label="Medida" value={cfg.measure} onChange={(v) => setCfg((c) => ({ ...c, measure: v }))} options={measures(sheet).map((m) => ({ value: m.name, label: m.name }))} />
        {dimensions(sheet).length > 0 && (
          <FilterField label="Agrupar por" value={cfg.dimension ?? ''} onChange={(v) => setCfg((c) => ({ ...c, dimension: v }))} options={dimensions(sheet).map((d) => ({ value: d.name, label: d.name }))} />
        )}
        {dateOptions.length > 1 && (
          <FilterField label="Fecha de referencia" value={cfg.dateCol ?? ''} onChange={(v) => setCfg((c) => ({ ...c, dateCol: v, month: 'all' }))} options={dateOptions.map((d) => ({ value: d.name, label: d.name }))} />
        )}
        {view.months.length > 1 && (
          <FilterField
            label="Mes"
            value={cfg.month}
            onChange={(v) => setCfg((c) => ({ ...c, month: v }))}
            options={[{ value: 'all', label: 'Todos los meses' }, ...[...view.months].reverse().map((m) => ({ value: m.key, label: m.label }))]}
          />
        )}
      </FilterBar>

      <Grid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          emphasis
          label={`${view.measure.name} ${cfg.month === 'all' ? 'acumulado' : view.curMonth?.label ?? ''}`}
          value={f(view.total)}
          sub={periodLabel}
          delta={cfg.month !== 'all' && view.prevMonth && view.curMonth ? (view.curMonth.value - view.prevMonth.value) / Math.abs(view.prevMonth.value || 1) : undefined}
          deltaLabel={cfg.month !== 'all' && view.prevMonth ? `vs ${view.prevMonth.label}` : undefined}
        />
        <KpiCard label="Registros" value={fmtInt(view.count)} sub={`Promedio ${f(view.avg ?? 0)} por registro`} />
        {view.curMonth ? (
          <KpiCard
            label={cfg.month === 'all' ? `Último mes (${view.curMonth.label})` : 'Mismo mes año anterior'}
            value={cfg.month === 'all' ? f(view.curMonth.value) : view.yoyMonth ? f(view.yoyMonth.value) : '—'}
            delta={
              cfg.month === 'all'
                ? view.prevMonth
                  ? (view.curMonth.value - view.prevMonth.value) / Math.abs(view.prevMonth.value || 1)
                  : undefined
                : view.yoyMonth
                  ? (view.curMonth.value - view.yoyMonth.value) / Math.abs(view.yoyMonth.value || 1)
                  : undefined
            }
            deltaLabel={cfg.month === 'all' ? (view.prevMonth ? `vs ${view.prevMonth.label}` : undefined) : view.yoyMonth ? 'variación año a año' : 'sin datos del año anterior'}
          />
        ) : (
          <KpiCard label={`${dimName || 'Categorías'} distintas`} value={fmtInt(view.byDim.length)} />
        )}
        {view.margin != null ? (
          <KpiCard label="Margen de utilidad" value={fmtPct(view.margin)} sub={`Utilidad ${f(view.profit ?? 0)}`} />
        ) : (
          <KpiCard label="Promedio mensual" value={view.months.length ? f(view.months.reduce((a, m) => a + m.value, 0) / view.months.length) : '—'} sub={`${view.months.length} mes(es) con datos`} />
        )}
      </Grid>

      <Grid className="lg:grid-cols-3">
        {view.months.length >= 2 ? (
          <ChartCard className="lg:col-span-2" title={`Evolución mensual de ${view.measure.name.toLowerCase()}`} description={`Por ${cfg.dateCol?.toLowerCase()}`}>
            <TrendChart data={view.months.map((m) => ({ label: m.label, value: m.value }))} valueName={view.measure.name} format={f} />
          </ChartCard>
        ) : (
          top.length > 0 && (
            <ChartCard className="lg:col-span-2" title={`${view.measure.name} por ${dimName.toLowerCase()}`} description="Principales 12">
              <MultiSeriesChart horizontal data={top} xKey="label" series={[{ key: 'value', name: view.measure.name, color: C.primary }]} format={f} />
            </ChartCard>
          )
        )}
        {view.secondary && (
          <ChartCard title={`Participación por ${view.secondary.column.toLowerCase()}`} description={periodLabel}>
            <DonutChart items={view.secondary.rows} centerLabel="Total" centerValue={f(view.total)} format={f} />
          </ChartCard>
        )}

        {view.yoy && (
          <ChartCard className="lg:col-span-2" title="Comparativo año a año" description={`${view.measure.name} por mes`}>
            <MultiSeriesChart
              variant="lines"
              data={view.yoy.rows}
              xKey="label"
              series={view.yoy.years.map((y, i) => ({ key: String(y), name: String(y), color: yearColor(i, view.yoy!.years.length) }))}
              format={f}
            />
          </ChartCard>
        )}

        {view.months.length >= 2 && top.length > 0 && (
          <ChartCard className={view.yoy ? '' : 'lg:col-span-1'} title={`Principales por ${dimName.toLowerCase()}`} description={periodLabel}>
            <MultiSeriesChart horizontal data={top} xKey="label" series={[{ key: 'value', name: view.measure.name, color: C.primary }]} format={f} height={300} />
          </ChartCard>
        )}

        {vsMonth.length > 0 && view.curMonth && view.prevMonth && (
          <ChartCard className={view.yoy ? 'lg:col-span-3' : 'lg:col-span-2'} title={`${view.curMonth.label} vs ${view.prevMonth.label}`} description={`Por ${dimName.toLowerCase()} (principales 10)`}>
            <MultiSeriesChart
              data={vsMonth}
              xKey="label"
              series={[
                { key: 'b', name: view.prevMonth.label, color: C.compare },
                { key: 'a', name: view.curMonth.label, color: C.primary },
              ]}
              format={f}
              height={300}
            />
          </ChartCard>
        )}
      </Grid>

      {view.dimension && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-ink">Tabla comparativa por {dimName.toLowerCase()}</h3>
          <DataTable rows={view.byDim} columns={columns} footer={footer} rowKey={(r) => r.label} caption={`Detalle por ${dimName}`} />
          {view.dimension.derived && <p className="text-xs text-muted-foreground">Dimensión creada por el sistema a partir del código de bodega (supuesto ajustable en src/config/negocio.ts).</p>}
        </section>
      )}

    </div>
  )
}
