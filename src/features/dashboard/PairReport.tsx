/**
 * Reportes de comparación directa: Documento 1 vs Documento 2.
 * - FlatPairReport:   dos bases planas (ej: Base repuestos 2026 vs 2025)
 * - MatrixPairReport: dos informes consolidados (ej: Informe septiembre vs agosto)
 */
import { useMemo, useState } from 'react'
import type { FlatSheet, MatrixSheet } from '@/types/report'
import { computeFlatPair, computeMatrixPair, type FlatPairConfig, type FlatPairView, type MatrixPairView } from '@/analysis/compare'
import { dateCols, defaultFlatConfig, dimensions, measures } from '@/analysis/flat'
import { defaultMatrixConfig, valueMetrics, type MatrixConfig } from '@/analysis/matrix'
import { fmtInt, fmtPct, monthLong, titleCase, variation } from '@/lib/format'
import { valueFormat } from '@/lib/units'
import { flatFormat } from '@/analysis/flatFormat'
import { Badge } from '@/components/ui/badge'
import { ChartCard, ChipFilter, ComplianceBadge, FilterBar, FilterField, Grid, KpiCard, ReportHeader, Toggle, VarBadge } from './blocks'
import { DataTable, type Column } from './DataTable'
import { MultiSeriesChart } from './charts/MultiSeriesChart'
import { RankingChart } from './charts/RankingChart'
import { C } from './charts/theme'

function DocTags({ a, b }: { a: string; b: string }) {
  return (
    <>
      <Badge>Comparativa entre documentos</Badge>
      <Badge variant="outline">Doc. 1: {a}</Badge>
      <Badge variant="outline">Doc. 2: {b}</Badge>
    </>
  )
}

/* =================================================================== */
/* Bases planas                                                        */
/* =================================================================== */

export function FlatPairReport({ a, b, title }: { a: FlatSheet; b: FlatSheet; title: string }) {
  const shared = (list: { name: string }[], other: { name: string }[]) => list.filter((x) => other.some((y) => y.name === x.name))
  const ms = shared(measures(a), measures(b))
  const ds = shared(dimensions(a), dimensions(b))
  const dts = shared(dateCols(a), dateCols(b))

  const [cfg, setCfg] = useState<FlatPairConfig>(() => {
    const d = defaultFlatConfig(a)
    return {
      measure: ms.some((m) => m.name === d.measure) ? d.measure : ms[0]?.name ?? '',
      dimension: ds.some((x) => x.name === d.dimension) ? d.dimension : ds[0]?.name ?? null,
      dateCol: dts.some((x) => x.name === d.dateCol) ? d.dateCol : dts[0]?.name ?? null,
      commonMonthsOnly: true,
    }
  })

  const view = useMemo<FlatPairView | null>(() => (cfg.measure ? computeFlatPair(a, b, cfg) : null), [a, b, cfg])

  if (!view) {
    return (
      <div className="flex flex-col gap-6">
        <ReportHeader title={title} tags={<DocTags a={a.fileName} b={b.fileName} />} />
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Los documentos no comparten columnas numéricas con el mismo nombre, por lo que no se pueden comparar directamente.</p>
      </div>
    )
  }

  const mcol = measures(a).find((m) => m.name === cfg.measure)!
  const F = flatFormat(a, mcol)
  const f = (v: number) => F.compact(v)
  const full = (v: number | null) => F.full(v)
  const [la, lb] = view.labels
  type Row = FlatPairView['byDim'][number]

  const columns: Column<Row>[] = [
    { key: 'label', header: cfg.dimension ?? '', render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, sort: (r) => r.short },
    { key: 'a', header: la, align: 'right', render: (r) => <span className="font-semibold text-ink">{full(r.a)}</span>, sort: (r) => r.a },
    { key: 'b', header: lb, align: 'right', render: (r) => full(r.b), sort: (r) => r.b },
    { key: 'd', header: 'Diferencia', align: 'right', render: (r) => <span className={r.varAbs < 0 ? 'text-negative' : 'text-positive'}>{full(r.varAbs)}</span>, sort: (r) => r.varAbs },
    { key: 'v', header: 'Var. %', align: 'right', render: (r) => <VarBadge value={r.varPct} />, sort: (r) => r.varPct },
    { key: 's', header: `Participación ${la}`, align: 'right', render: (r) => fmtPct(r.shareA), sort: (r) => r.shareA },
  ]
  const t = view.totals
  const footer = ['Total', full(t.a), full(t.b), full(t.a - t.b), <VarBadge key="v" value={t.varPct} />, '100 %']
  const monthsText = view.months.length ? view.months.map((m) => monthLong(m).slice(0, 3)).join(', ') : 'todos los registros'

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader title={title} subtitle={`Variación = (${la} − ${lb}) / ${lb}. Meses comparados: ${cfg.commonMonthsOnly ? monthsText : 'todos'}.`} tags={<DocTags a={a.fileName} b={b.fileName} />} />

      <FilterBar>
        <FilterField label="Medida" value={cfg.measure} onChange={(v) => setCfg((c) => ({ ...c, measure: v }))} options={ms.map((m) => ({ value: m.name, label: m.name }))} />
        {ds.length > 0 && <FilterField label="Agrupar por" value={cfg.dimension ?? ''} onChange={(v) => setCfg((c) => ({ ...c, dimension: v }))} options={ds.map((d) => ({ value: d.name, label: d.name }))} />}
        {dts.length > 1 && <FilterField label="Fecha de referencia" value={cfg.dateCol ?? ''} onChange={(v) => setCfg((c) => ({ ...c, dateCol: v }))} options={dts.map((d) => ({ value: d.name, label: d.name }))} />}
        {dts.length > 0 && <Toggle label="Comparar solo meses presentes en ambos" checked={cfg.commonMonthsOnly} onChange={(v) => setCfg((c) => ({ ...c, commonMonthsOnly: v }))} />}
      </FilterBar>

      <Grid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard emphasis label={`${cfg.measure} ${la}`} value={f(t.a)} delta={t.varPct} deltaLabel={`vs ${lb}`} />
        <KpiCard label={`${cfg.measure} ${lb}`} value={f(t.b)} sub="Documento 2" />
        <KpiCard label="Diferencia" value={f(t.a - t.b)} sub={t.a >= t.b ? `${la} por encima` : `${la} por debajo`} />
        <KpiCard label="Registros" value={`${fmtInt(t.countA)} vs ${fmtInt(t.countB)}`} delta={variation(t.countA, t.countB)} deltaLabel={`promedio ${f(t.avgA ?? 0)} vs ${f(t.avgB ?? 0)}`} />
      </Grid>

      <Grid className="lg:grid-cols-3">
        {view.monthly.length > 0 && (
          <ChartCard className="lg:col-span-2" title="Comparativo mensual" description={`${la} frente a ${lb}`}>
            <MultiSeriesChart
              data={view.monthly}
              xKey="label"
              series={[
                { key: 'b', name: lb, color: C.compare },
                { key: 'a', name: la, color: C.primary },
              ]}
              format={f}
            />
          </ChartCard>
        )}
        {view.monthly.length > 0 && (
          <ChartCard title="Variación por mes" description={`${la} vs ${lb}`}>
            <RankingChart mode="variation" data={view.monthly.filter((m) => m.varPct != null).map((m) => ({ label: m.label, full: monthLong(m.month), value: m.varPct! }))} />
          </ChartCard>
        )}
        {cfg.dimension && (
          <>
            <ChartCard className="lg:col-span-2" title={`${cfg.measure} por ${cfg.dimension.toLowerCase()}`} description="Principales 10 según el Documento 1">
              <MultiSeriesChart
                horizontal
                data={view.byDim.slice(0, 10).map((r) => ({ label: r.short, a: r.a, b: r.b }))}
                xKey="label"
                series={[
                  { key: 'b', name: lb, color: C.compare },
                  { key: 'a', name: la, color: C.primary },
                ]}
                format={f}
              />
            </ChartCard>
            <ChartCard title={`Variación por ${cfg.dimension.toLowerCase()}`} description="Ordenado de mayor a menor">
              <RankingChart
                mode="variation"
                data={view.byDim
                  .filter((r) => r.varPct != null && r.b > 0)
                  .sort((x, y) => (y.varPct ?? 0) - (x.varPct ?? 0))
                  .slice(0, 16)
                  .map((r) => ({ label: r.short, full: r.label, value: r.varPct! }))}
              />
            </ChartCard>
          </>
        )}
      </Grid>

      {cfg.dimension && (
        <section className="flex flex-col gap-3">
          <h3 className="text-base font-semibold text-ink">Tabla comparativa por {cfg.dimension.toLowerCase()}</h3>
          <DataTable rows={view.byDim} columns={columns} footer={footer} rowKey={(r) => r.label} />
        </section>
      )}

    </div>
  )
}

/* =================================================================== */
/* Matrices                                                            */
/* =================================================================== */

export function MatrixPairReport({ a, b, title }: { a: MatrixSheet; b: MatrixSheet; title: string }) {
  const [cfg, setCfg] = useState<MatrixConfig>(() => defaultMatrixConfig(a))
  const view = useMemo<MatrixPairView>(() => computeMatrixPair(a, b, cfg), [a, b, cfg])
  const metric = a.metrics.find((m) => m.key === cfg.metricKey)!
  const [la, lb] = view.labels
  const t = view.totals
  const money = (v: number) => valueFormat(view.unit).compact(v)
  const fmtCOP = valueFormat(view.unit).full
  type Row = MatrixPairView['items'][number]
  const hasTarget = t.targetA != null

  const columns: Column<Row>[] = [
    { key: 'label', header: titleCase(a.dimensionLabel), render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, sort: (r) => r.short },
    { key: 'g', header: 'Grupo', render: (r) => <Badge variant="secondary">{r.group}</Badge>, sort: (r) => r.group },
    { key: 'a', header: la, align: 'right', render: (r) => <span className="font-semibold text-ink">{fmtCOP(r.a)}</span>, sort: (r) => r.a },
    { key: 'b', header: lb, align: 'right', render: (r) => fmtCOP(r.b), sort: (r) => r.b },
    { key: 'v', header: 'Var. %', align: 'right', render: (r) => <VarBadge value={r.varPct} />, sort: (r) => r.varPct },
    ...(hasTarget
      ? ([
          { key: 'ca', header: `Cumpl. ${la}`, align: 'right', render: (r) => <ComplianceBadge value={r.complianceA} />, sort: (r) => r.complianceA },
          { key: 'cb', header: `Cumpl. ${lb}`, align: 'right', render: (r) => <ComplianceBadge value={r.complianceB} />, sort: (r) => r.complianceB },
        ] as Column<Row>[])
      : []),
  ]
  const footer = ['Total', '', fmtCOP(t.a), fmtCOP(t.b), <VarBadge key="v" value={t.varPct} />, ...(hasTarget ? [<ComplianceBadge key="a" value={t.complianceA} />, <ComplianceBadge key="b" value={t.complianceB} />] : [])]

  return (
    <div className="flex flex-col gap-6">
      <ReportHeader title={title} subtitle={`${titleCase(view.metricLabel)}: ${view.periodA} (Doc. 1) frente a ${view.periodB} (Doc. 2).`} tags={<DocTags a={a.fileName} b={b.fileName} />} />

      <FilterBar>
        {valueMetrics(a).length > 1 && (
          <FilterField
            label="Métrica"
            value={cfg.metricKey}
            onChange={(k) => {
              const m = a.metrics.find((x) => x.key === k)!
              setCfg((c) => ({ ...c, metricKey: k, periodKey: m.periods[m.periods.length - 1].key }))
            }}
            options={valueMetrics(a).map((m) => ({ value: m.key, label: titleCase(m.label) }))}
          />
        )}
        {metric.periods.length > 1 && (
          <FilterField label="Periodo (Doc. 1)" value={cfg.periodKey} onChange={(v) => setCfg((c) => ({ ...c, periodKey: v }))} options={[...metric.periods].reverse().map((p) => ({ value: p.key, label: p.label }))} />
        )}
        <ChipFilter label="Grupos" options={a.groups} selected={cfg.groups} onChange={(groups) => setCfg((c) => ({ ...c, groups }))} />
      </FilterBar>

      <Grid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard emphasis label={`${titleCase(view.metricLabel)} ${la}`} value={money(t.a)} delta={t.varPct} deltaLabel={`vs ${lb}`} />
        <KpiCard label={`${titleCase(view.metricLabel)} ${lb}`} value={money(t.b)} sub="Documento 2" />
        <KpiCard label="Diferencia" value={money(t.a - t.b)} />
        {hasTarget ? (
          <KpiCard label="Cumplimiento" value={`${fmtPct(t.complianceA)} vs ${fmtPct(t.complianceB)}`} sub={t.complianceA != null && t.complianceB != null ? `${((t.complianceA - t.complianceB) * 100).toFixed(1).replace('.', ',')} p.p.` : undefined} />
        ) : (
          <KpiCard label="Elementos comparados" value={fmtInt(view.items.filter((i) => i.a != null && i.b != null).length)} />
        )}
      </Grid>

      <Grid className="lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Comparativo por grupo" description={`${la} frente a ${lb}`}>
          <MultiSeriesChart
            data={view.groups}
            xKey="label"
            series={[
              { key: 'b', name: lb, color: C.compare },
              { key: 'a', name: la, color: C.primary },
            ]}
            format={money}
          />
        </ChartCard>
        <ChartCard title="Variación por grupo">
          <RankingChart mode="variation" data={view.groups.filter((g) => g.varPct != null).map((g) => ({ label: g.label, value: g.varPct! }))} />
        </ChartCard>
        {view.series.length > 1 && (
          <ChartCard className="lg:col-span-3" title="Evolución en ambos documentos" description={titleCase(view.metricLabel)}>
            <MultiSeriesChart
              variant="lines"
              data={view.series}
              xKey="label"
              series={[
                { key: 'b', name: `Doc. 2 (${b.fileName.replace(/\.xlsx?$/i, '').slice(0, 24)})`, color: C.compare },
                { key: 'a', name: `Doc. 1 (${a.fileName.replace(/\.xlsx?$/i, '').slice(0, 24)})`, color: C.primary },
              ]}
              format={money}
            />
          </ChartCard>
        )}
        <ChartCard className="lg:col-span-3" title={`Variación por ${a.dimensionLabel.toLowerCase().trim()}`}>
          <RankingChart
            mode="variation"
            data={view.items
              .filter((i) => i.varPct != null)
              .sort((x, y) => (y.varPct ?? 0) - (x.varPct ?? 0))
              .map((i) => ({ label: i.short, full: i.label, value: i.varPct! }))}
          />
        </ChartCard>
      </Grid>

      <section className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-ink">Tabla comparativa</h3>
        <DataTable rows={view.items} columns={columns} footer={footer} rowKey={(r) => r.label} />
      </section>

    </div>
  )
}
