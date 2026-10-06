/**
 * Entorno de reporte para tablas comparativas (formato del reporte de gerencia):
 *
 *  Vista general · una vista por marca/grupo · último mes vs mes anterior
 *
 * Cada vista: encabezado con logo, 4 KPIs, gráficas (barras, donas, línea mensual)
 * y tabla con Var. %, Part. % y barra de tendencia.
 */
import { useMemo, useState } from 'react'
import type { MatrixSheet } from '@/types/report'
import { buildEnv, defaultEnvConfig, topGrowth, type EnvConfig, type EnvGroup, type EnvModel, type EnvRow } from '@/analysis/env'
import { matrixQuality, valueMetrics } from '@/analysis/matrix'
import { valueFormat } from '@/lib/units'
import { fmtPct, plural, titleCase } from '@/lib/format'
import { PALETA_TIENDAS, colorOf } from '@/config/negocio'
import { FilterField } from '../blocks'
import { EnvCard, EnvTable, KpiRow, KpiStripe, PillNav, ReportBand, Row2, TrendBar, VarPill, varOf, type EnvTableCol } from './EnvBlocks'
import { BarPair, DonutLegend, LinePair, VarBars } from './EnvCharts'
import { COLOR_COMPARACION } from '@/config/negocio'

const MES_COLOR = '#9B59B6'

export function EnvReport({ sheet, title }: { sheet: MatrixSheet; title: string }) {
  const [cfg, setCfg] = useState<EnvConfig>(() => defaultEnvConfig(sheet))
  const [view, setView] = useState('general')
  const env = useMemo(() => buildEnv(sheet, cfg), [sheet, cfg])
  const fmt = valueFormat(env.unit)
  const dim = sheet.dimensionLabel.trim() === 'Elemento' ? 'Punto de venta' : titleCase(sheet.dimensionLabel)
  const metrics = valueMetrics(sheet)
  // Control de calidad del Excel (totales que no cuadran, datos en meses futuros) como nota al pie
  const quality = useMemo(() => {
    const q = matrixQuality(sheet)
    const out: string[] = []
    const fut = [...new Set(q.filter((x) => x.kind === 'future').map((x) => x.where))]
    if (fut.length) out.push(`Calidad de datos: hay cifras en periodos que aún no han ocurrido (${fut.slice(0, 4).join(', ')}). Revisa si las columnas están corridas.`)
    const tot = q.filter((x) => x.kind !== 'future')
    if (tot.length) out.push(`Calidad de datos: ${tot.length} total(es) o % del Excel no cuadran con la suma de sus filas (ej: ${tot[0].where}, ${tot[0].column}). El dashboard usa los valores recalculados.`)
    return out
  }, [sheet])

  const pills = [
    { id: 'general', label: 'Vista general' },
    ...env.groups.map((g) => ({ id: `g:${g.name}`, label: g.name })),
    ...(env.last ? [{ id: 'mes', label: `${env.last.prevLabel.split(' ')[0]} vs ${env.last.curLabel}`, accent: MES_COLOR }] : []),
  ]
  const activeView = pills.some((p) => p.id === view) ? view : 'general'
  const group = activeView.startsWith('g:') ? env.groups.find((g) => `g:${g.name}` === activeView) ?? null : null

  const bandTitle =
    activeView === 'mes'
      ? `Comparativo ${env.last!.prevLabel} vs ${env.last!.curLabel}`
      : group
        ? `${title} — ${group.name}`
        : `${title}${env.groups.length ? ' — Todas las marcas' : ''}`
  const bandInfo = activeView === 'mes' ? `Mes actual frente al mes anterior` : env.rangeLabel
  const bandBadge = activeView === 'mes' ? `Mes de ${env.last!.curLabel.toLowerCase()}` : env.badge

  return (
    <div className="flex flex-col gap-4">
      <PillNav items={pills} active={activeView} onChange={setView} />
      <ReportBand title={bandTitle} info={bandInfo} badge={bandBadge} />

      {/* Controles del periodo */}
      {(env.cutOptions.length > (env.mode === 'periodo' ? 2 : 1) || env.modes.length > 1 || metrics.length > 1) && activeView !== 'mes' && (
        <div className="no-print flex flex-wrap items-end gap-3">
          {metrics.length > 1 && (
            <FilterField
              label="Métrica"
              value={env.metric.key}
              onChange={(k) => setCfg(defaultEnvConfig(sheet, k))}
              options={metrics.map((m) => ({ value: m.key, label: titleCase(m.label) }))}
            />
          )}
          {env.cutOptions.length > (env.mode === 'periodo' ? 2 : 1) && (
            <FilterField label="Corte" value={env.cut.key} onChange={(k) => setCfg((c) => ({ ...c, cutKey: k }))} options={env.cutOptions.map((p) => ({ value: p.key, label: p.label }))} />
          )}
          {env.modes.length > 1 && (
            <FilterField
              label="Mostrar"
              value={env.mode}
              onChange={(m) => setCfg((c) => ({ ...c, mode: m as EnvConfig['mode'] }))}
              options={env.modes.map((m) => ({ value: m, label: m === 'acum' ? 'Acumulado del año' : 'Solo el mes de corte' }))}
            />
          )}
        </div>
      )}

      {activeView === 'mes' ? (
        <MonthView env={env} fmt={fmt} dim={dim} />
      ) : group ? (
        <GroupView env={env} g={group} fmt={fmt} dim={dim} />
      ) : (
        <GeneralView env={env} fmt={fmt} dim={dim} />
      )}

      {(sheet.notes.length > 0 || quality.length > 0) && (
        <ul className="space-y-0.5 px-1 text-[10.5px] text-muted-foreground">
          {quality.map((n) => (
            <li key={n} className="text-warning">
              * {n}
            </li>
          ))}
          {sheet.notes.map((n) => (
            <li key={n}>* {n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

type F = ReturnType<typeof valueFormat>

/* ================================================================== */
/* Vista general                                                       */
/* ================================================================== */

function GeneralView({ env, fmt, dim }: { env: EnvModel; fmt: F; dim: string }) {
  const t = env.total
  const hasGroups = env.groups.length > 1
  const rows = [...env.rows].sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0))
  const leader = hasGroups ? [...env.groups].sort((a, b) => b.cur - a.cur)[0] : null
  const leaderRow = rows[0]
  const grow = topGrowth(env.rows)
  const top10 = rows.slice(0, 10)
  const accLabel = env.mode === 'acum' ? ' (acum.)' : ''

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label={`Total ${env.curLabel}${accLabel}`} value={fmt.compact(t.cur)} delta={varOf(t.cur, t.prev)} note={env.prevLabel ? `vs ${env.prevLabel}` : ''} />
        <KpiStripe tone="green" label={env.prevLabel ? `Total ${env.prevLabel}${accLabel}` : 'Periodo de comparación'} value={env.prevLabel ? fmt.compact(t.prev) : '—'} note="Base de comparación" />
        {env.hasTarget ? (
          <KpiStripe tone="amber" label="Cumplimiento de meta" value={t.target ? fmtPct(t.cur / t.target) : '—'} note={`Meta ${fmt.compact(t.target)}`} />
        ) : leader ? (
          <KpiStripe tone="amber" label={`Marca líder ${env.curLabel}`} value={fmt.compact(leader.cur)} delta={varOf(leader.cur, leader.prev)} note={`${leader.name}`} />
        ) : (
          <KpiStripe tone="amber" label={`Líder ${env.curLabel}`} value={fmt.compact(leaderRow?.cur)} note={leaderRow?.short} />
        )}
        <KpiStripe tone="coral" label="Mayor crecimiento" value={grow ? `${grow.var >= 0 ? '+' : ''}${Math.round(grow.var * 100)} %` : '—'} note={grow?.short ?? 'Sin base de comparación'} />
      </KpiRow>

      {hasGroups ? (
        <Row2>
          <EnvCard title={`${env.metric.label} por marca — ${env.prevLabel ?? ''} vs ${env.curLabel}`} legend={legend(env)}>
            <BarPair
              labels={env.groups.map((g) => g.name)}
              prev={env.prevLabel ? env.groups.map((g) => g.prev) : null}
              cur={env.groups.map((g) => g.cur)}
              prevLabel={env.prevLabel}
              curLabel={env.curLabel}
              color={env.groups.map((g) => g.color)}
              format={fmt.compact}
            />
          </EnvCard>
          <EnvCard title={`Distribución por marca ${env.curLabel}`}>
            <DonutLegend labels={env.groups.map((g) => g.name)} values={env.groups.map((g) => g.cur)} colors={env.groups.map((g) => g.color)} format={fmt.compact} extra={(i) => varExtra(env.groups[i], env.prevLabel)} />
          </EnvCard>
        </Row2>
      ) : (
        <Row2>
          <EnvCard title={`${env.metric.label} por ${dim.toLowerCase()} — ${env.prevLabel ?? ''} vs ${env.curLabel}`} legend={legend(env)}>
            <BarPair
              labels={rows.slice(0, 12).map((r) => r.short)}
              fullLabels={rows.slice(0, 12).map((r) => r.label)}
              prev={env.prevLabel ? rows.slice(0, 12).map((r) => r.prev) : null}
              cur={rows.slice(0, 12).map((r) => r.cur)}
              prevLabel={env.prevLabel}
              curLabel={env.curLabel}
              color="#378ADD"
              format={fmt.compact}
            />
          </EnvCard>
          <EnvCard title={`Distribución por ${dim.toLowerCase()} ${env.curLabel} (top 10)`}>
            <DonutLegend labels={top10.map((r) => r.short)} values={top10.map((r) => r.cur ?? 0)} colors={PALETA_TIENDAS} format={fmt.compact} extra={(i) => varExtra(top10[i], env.prevLabel)} />
          </EnvCard>
        </Row2>
      )}

      <Row2>
        {hasGroups && (
          <EnvCard title={`Distribución por ${dim.toLowerCase()} ${env.curLabel} (top 10)`}>
            <DonutLegend labels={top10.map((r) => r.short)} values={top10.map((r) => r.cur ?? 0)} colors={PALETA_TIENDAS} format={fmt.compact} extra={(i) => varExtra(top10[i], env.prevLabel)} />
          </EnvCard>
        )}
        <TrendOrVar env={env} rows={rows} fmt={fmt} title="Evolución mensual total" series={env.total} color="#378ADD" className={hasGroups ? '' : 'lg:col-span-2'} />
      </Row2>

      <RowsTable env={env} rows={rows} fmt={fmt} dim={dim} showGroup={hasGroups} total={env.total} />
    </>
  )
}

/* ================================================================== */
/* Vista por marca / grupo                                             */
/* ================================================================== */

function GroupView({ env, g, fmt, dim }: { env: EnvModel; g: EnvGroup; fmt: F; dim: string }) {
  const rows = [...g.rows].sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0))
  const leader = rows[0]
  const grow = topGrowth(g.rows)
  const accLabel = env.mode === 'acum' ? ' (acum.)' : ''
  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label={`Total ${env.curLabel}${accLabel}`} value={fmt.compact(g.cur)} delta={varOf(g.cur, g.prev)} note={env.prevLabel ? `vs ${env.prevLabel}` : ''} />
        <KpiStripe tone="green" label={env.prevLabel ? `Total ${env.prevLabel}${accLabel}` : 'Periodo de comparación'} value={env.prevLabel ? fmt.compact(g.prev) : '—'} note="Base de comparación" />
        {env.hasTarget ? (
          <KpiStripe tone="amber" label="Cumplimiento de meta" value={g.target ? fmtPct(g.cur / g.target) : '—'} note={`Meta ${fmt.compact(g.target)}`} />
        ) : (
          <KpiStripe tone="amber" label={`${singular(dim)} líder ${env.curLabel}`} value={fmt.compact(leader?.cur)} note={leader?.short} />
        )}
        <KpiStripe tone="coral" label="Mayor crecimiento" value={grow ? `${grow.var >= 0 ? '+' : ''}${Math.round(grow.var * 100)} %` : '—'} note={grow?.short ?? 'Sin base de comparación'} />
      </KpiRow>
      <Row2>
        <EnvCard title={`${pluralOf(dim)} ${g.name} — ${env.mode === 'acum' ? 'acumulado' : env.curLabel}`} legend={legend(env, g.color)}>
          <BarPair
            labels={rows.map((r) => stripBrand(r.short, g.name))}
            fullLabels={rows.map((r) => r.label)}
            prev={env.prevLabel ? rows.map((r) => r.prev) : null}
            cur={rows.map((r) => r.cur)}
            prevLabel={env.prevLabel}
            curLabel={env.curLabel}
            color={g.color}
            format={fmt.compact}
          />
        </EnvCard>
        <EnvCard title={`Distribución por ${dim.toLowerCase()} ${env.curLabel}`}>
          <DonutLegend labels={rows.map((r) => r.short)} values={rows.map((r) => r.cur ?? 0)} colors={PALETA_TIENDAS} format={fmt.compact} extra={(i) => varExtra(rows[i], env.prevLabel)} />
        </EnvCard>
      </Row2>
      <TrendOrVar env={env} rows={rows} fmt={fmt} title={`Mensual ${g.name}`} series={g} color={g.color} />
      <RowsTable env={env} rows={rows} fmt={fmt} dim={dim} showGroup={false} total={g} />
    </>
  )
}

/* ================================================================== */
/* Último mes vs mes anterior                                          */
/* ================================================================== */

function MonthView({ env, fmt, dim }: { env: EnvModel; fmt: F; dim: string }) {
  const L = env.last!
  const t = env.total
  const rows = [...env.rows].sort((a, b) => (b.lastCur ?? 0) - (a.lastCur ?? 0))
  const asPair = rows.map((r) => ({ ...r, cur: r.lastCur, prev: r.lastPrev }))
  const grow = topGrowth(asPair)
  const hasGroups = env.groups.length > 1
  const max = Math.max(...rows.map((r) => r.lastCur ?? 0))
  const cols: EnvTableCol<EnvRow>[] = [
    { key: 'n', header: singular(dim), render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, width: '28%' },
    ...(hasGroups ? [{ key: 'g', header: 'Marca', render: (r: EnvRow) => <span className="text-[11px] text-muted-foreground">{r.group}</span>, width: '10%' }] : []),
    { key: 'p', header: L.prevLabel, align: 'right', muted: true, render: (r) => fmt.full(r.lastPrev) },
    { key: 'c', header: L.curLabel, align: 'right', render: (r) => <span className="font-semibold">{fmt.full(r.lastCur)}</span> },
    { key: 'v', header: 'Var. %', align: 'right', render: (r) => <VarPill value={varOf(r.lastCur, r.lastPrev)} /> },
    { key: 's', header: `Part.% ${L.curLabel.split(' ')[0]}`, align: 'right', muted: true, render: (r) => fmtPct(t.lastCur ? (r.lastCur ?? 0) / t.lastCur : 0) },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={r.lastCur} max={max} color={MES_COLOR} /> },
  ]
  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label={`Total ${L.curLabel}`} value={fmt.compact(t.lastCur)} delta={varOf(t.lastCur, t.lastPrev)} note={`vs ${L.prevLabel}`} />
        <KpiStripe tone="green" label={`Total ${L.prevLabel}`} value={fmt.compact(t.lastPrev)} note="Mes anterior" />
        <KpiStripe tone="amber" label={`Top ${singular(dim).toLowerCase()} ${L.curLabel.split(' ')[0].toLowerCase()}`} value={fmt.compact(rows[0]?.lastCur)} note={rows[0]?.short} />
        <KpiStripe tone="coral" label="Mayor crecimiento" value={grow ? `${grow.var >= 0 ? '+' : ''}${Math.round(grow.var * 100)} %` : '—'} note={grow?.short ?? '—'} />
      </KpiRow>
      <Row2>
        <EnvCard
          title={`${env.metric.label} por ${hasGroups ? 'marca' : dim.toLowerCase()} — ${L.prevLabel} vs ${L.curLabel}`}
          legend={[
            { label: L.prevLabel, color: COLOR_COMPARACION },
            { label: L.curLabel, color: MES_COLOR },
          ]}
        >
          {hasGroups ? (
            <BarPair labels={env.groups.map((g) => g.name)} prev={env.groups.map((g) => g.lastPrev)} cur={env.groups.map((g) => g.lastCur)} prevLabel={L.prevLabel} curLabel={L.curLabel} color={env.groups.map((g) => g.color)} format={fmt.compact} />
          ) : (
            <BarPair
              labels={rows.slice(0, 12).map((r) => r.short)}
              fullLabels={rows.slice(0, 12).map((r) => r.label)}
              prev={rows.slice(0, 12).map((r) => r.lastPrev)}
              cur={rows.slice(0, 12).map((r) => r.lastCur)}
              prevLabel={L.prevLabel}
              curLabel={L.curLabel}
              color={MES_COLOR}
              format={fmt.compact}
            />
          )}
        </EnvCard>
        <EnvCard title={`Distribución por ${hasGroups ? 'marca' : dim.toLowerCase()} — ${L.curLabel}`}>
          {hasGroups ? (
            <DonutLegend
              labels={env.groups.map((g) => g.name)}
              values={env.groups.map((g) => g.lastCur)}
              colors={env.groups.map((g) => g.color)}
              format={fmt.compact}
              extra={(i) => varExtra({ cur: env.groups[i].lastCur, prev: env.groups[i].lastPrev }, L.prevLabel)}
            />
          ) : (
            <DonutLegend labels={rows.slice(0, 10).map((r) => r.short)} values={rows.slice(0, 10).map((r) => r.lastCur ?? 0)} colors={PALETA_TIENDAS} format={fmt.compact} />
          )}
        </EnvCard>
      </Row2>
      <EnvTable
        rows={rows}
        cols={cols}
        rowKey={(r) => r.label}
        footer={['Total', ...(hasGroups ? [''] : []), fmt.full(t.lastPrev), fmt.full(t.lastCur), <VarPill key="v" value={varOf(t.lastCur, t.lastPrev)} />, '100 %', '']}
        foot={`* Comparativo mensual ${L.prevLabel} vs ${L.curLabel} por ${dim.toLowerCase()}. Part.% sobre total ${L.curLabel}: ${fmt.compact(t.lastCur)}.`}
      />
    </>
  )
}

/* ================================================================== */
/* Piezas compartidas                                                  */
/* ================================================================== */

function TrendOrVar({ env, rows, fmt, title, series, color, className }: { env: EnvModel; rows: EnvRow[]; fmt: F; title: string; series: EnvGroup; color: string; className?: string }) {
  if (env.monthLabels.length >= 2) {
    const prevYear = String(env.cut.year - 1)
    const curYear = String(env.cut.year)
    const hasPrev = series.mPrev.some((x) => x != null)
    return (
      <EnvCard className={className} title={`${title} — ${hasPrev ? `${prevYear} vs ` : ''}${curYear}`} legend={[...(hasPrev ? [{ label: prevYear, color: COLOR_COMPARACION }] : []), { label: curYear, color }]}>
        <LinePair labels={env.monthLabels} prev={hasPrev ? series.mPrev : null} cur={series.mCur} prevLabel={hasPrev ? prevYear : null} curLabel={curYear} color={color} format={fmt.compact} />
      </EnvCard>
    )
  }
  if (!env.prevLabel) return null
  return (
    <EnvCard className={className} title={`Variación % por ${singular(env.dim).toLowerCase()} — ${env.prevLabel} vs ${env.curLabel}`}>
      <VarBars labels={rows.map((r) => r.short)} cur={rows.map((r) => r.cur)} prev={rows.map((r) => r.prev)} prevLabel={env.prevLabel} curLabel={env.curLabel} format={fmt.compact} />
    </EnvCard>
  )
}

function RowsTable({ env, rows, fmt, dim, showGroup, total }: { env: EnvModel; rows: EnvRow[]; fmt: F; dim: string; showGroup: boolean; total: EnvGroup }) {
  const max = Math.max(...rows.map((r) => r.cur ?? 0))
  const cols: EnvTableCol<EnvRow>[] = [
    { key: 'n', header: singular(dim), render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, width: showGroup ? '27%' : '34%' },
    ...(showGroup ? [{ key: 'g', header: 'Marca', render: (r: EnvRow) => <span className="text-[11px] text-muted-foreground">{r.group}</span>, width: '10%' }] : []),
    ...(env.prevLabel ? [{ key: 'p', header: env.prevLabel, align: 'right' as const, muted: true, render: (r: EnvRow) => fmt.full(r.prev) }] : []),
    { key: 'c', header: env.curLabel, align: 'right', render: (r) => <span className="font-semibold">{fmt.full(r.cur)}</span> },
    ...(env.hasTarget
      ? [
          { key: 'm', header: 'Meta', align: 'right' as const, muted: true, render: (r: EnvRow) => fmt.full(r.target) },
          { key: 'k', header: 'Cumpl.', align: 'right' as const, render: (r: EnvRow) => (r.target ? fmtPct((r.cur ?? 0) / r.target) : '—') },
        ]
      : []),
    ...(env.prevLabel ? [{ key: 'v', header: 'Var. %', align: 'right' as const, render: (r: EnvRow) => <VarPill value={varOf(r.cur, r.prev)} /> }] : []),
    { key: 's', header: 'Part.%', align: 'right', muted: true, render: (r) => fmtPct(total.cur ? (r.cur ?? 0) / total.cur : 0) },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={r.cur} max={max} color={showGroup ? colorOf(r.group) : total.color} /> },
  ]
  const footer = [
    'Total',
    ...(showGroup ? [''] : []),
    ...(env.prevLabel ? [fmt.full(total.prev)] : []),
    fmt.full(total.cur),
    ...(env.hasTarget ? [fmt.full(total.target), total.target ? fmtPct(total.cur / total.target) : '—'] : []),
    ...(env.prevLabel ? [<VarPill key="v" value={varOf(total.cur, total.prev)} />] : []),
    '100 %',
    '',
  ]
  const what = env.mode === 'acum' ? `Acumulado ${env.monthLabels.length > 1 ? `${env.monthLabels[0].toLowerCase()}–${env.monthLabels.at(-1)!.toLowerCase()}` : env.monthLabels[0]?.toLowerCase() ?? ''}` : env.rangeLabel
  return (
    <EnvTable
      rows={rows}
      cols={cols}
      footer={footer}
      rowKey={(r) => `${r.group}|${r.label}`}
      foot={`* ${what}. Ordenado por volumen ${env.curLabel} desc. Part.% sobre total ${fmt.compact(total.cur)}.`}
    />
  )
}

const legend = (env: EnvModel, color = '#1D9E75') => [...(env.prevLabel ? [{ label: env.prevLabel, color: COLOR_COMPARACION }] : []), { label: env.curLabel, color }]
const varExtra = (r: { cur: number | null; prev: number | null }, prevLabel: string | null) => {
  const v = varOf(r.cur, r.prev)
  return prevLabel && v != null ? `Var. vs ${prevLabel}: ${v >= 0 ? '+' : ''}${fmtPct(v)}` : ''
}
const singular = (dim: string) => (dim === 'Elemento' ? 'Punto de venta' : dim)
const pluralOf = (dim: string) => (dim === 'Punto de venta' || dim === 'Elemento' ? 'Puntos de venta' : titleCase(plural(dim)))
/** "AKT CR 66" en la vista AKT → "CR 66" */
const stripBrand = (label: string, brand: string) => label.replace(new RegExp(`^${brand}\\s+`, 'i'), '') || label
