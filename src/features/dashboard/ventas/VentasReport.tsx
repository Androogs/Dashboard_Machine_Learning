/**
 * Reporte "Venta de motos" (base Ventas mes del DMS) con el maquetado de gerencia:
 * pastillas por marca, banda con logo, KPIs con franja de color, barras + donas,
 * evolución diaria y tablas por punto de venta y asesor.
 *
 * Los filtros (métrica, punto de venta, asesor, tipo de movimiento) aplican a toda
 * la vista. Las cifras son netas: las notas crédito (NCC/NCD) traen cantidad y
 * valores en negativo, así que se restan solas.
 */
import { useMemo, useState } from 'react'
import type { VentaRow, VentasSheet } from '@/types/report'
import { FilterField } from '../blocks'
import { EnvCard, EnvTable, KpiRow, KpiStripe, PillNav, ReportBand, Row2, TrendBar, type EnvTableCol } from '../env/EnvBlocks'
import { BarPair, DonutLegend, LinePair } from '../env/EnvCharts'
import { fmtCOP, fmtCOPCompact, fmtInt, fmtPct, shortLabel } from '@/lib/format'
import { colorOf, PALETA_TIENDAS } from '@/config/negocio'

const money = (v: number) => fmtCOPCompact(v)
const dayOf = (ms: number | null) => (ms == null ? '—' : new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(ms)))

type Metric = 'unidades' | 'venta' | 'utilidad'
type Mov = 'ALL' | 'v' | 'd'

const METRICAS: Record<Metric, { label: string; fmt: (v: number) => string; value: (r: VentaRow) => number }> = {
  unidades: { label: 'Motos vendidas', fmt: fmtInt, value: (r) => r.cant },
  venta: { label: 'Venta neta', fmt: money, value: (r) => r.precio },
  utilidad: { label: 'Utilidad', fmt: money, value: (r) => r.utilidad ?? 0 },
}

interface Agg {
  label: string
  short: string
  /** Unidades facturadas brutas (sin devoluciones) */
  facturadas: number
  /** Unidades devueltas (notas crédito), en positivo */
  devs: number
  /** Netas a hoy = facturadas − devoluciones */
  motos: number
  venta: number
  utilidad: number
}

function agg(rows: VentaRow[], key: 'marca' | 'bodega' | 'vendedor' | 'modelo'): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    const cur = m.get(r[key]) ?? { label: r[key], short: key === 'bodega' ? shortLabel(r[key]) : r[key], facturadas: 0, devs: 0, motos: 0, venta: 0, utilidad: 0 }
    if (r.devolucion) cur.devs += Math.abs(r.cant)
    else cur.facturadas += r.cant
    cur.motos += r.cant
    cur.venta += r.precio
    cur.utilidad += r.utilidad ?? 0
    m.set(r[key], cur)
  }
  const out = [...m.values()]
  // Bodegas distintas pueden compartir nombre corto: se les antepone el código.
  if (key === 'bodega') {
    const counts = new Map<string, number>()
    for (const x of out) counts.set(x.short, (counts.get(x.short) ?? 0) + 1)
    for (const x of out) {
      if ((counts.get(x.short) ?? 0) > 1) x.short = `${x.label.match(/^\d+/)?.[0] ?? x.label.slice(0, 4)} ${x.short}`
    }
  }
  return out
}

const metricValue = (a: Agg, m: Metric) => (m === 'unidades' ? a.motos : m === 'venta' ? a.venta : a.utilidad)

/** Evolución diaria del periodo según la métrica elegida. */
function daily(rows: VentaRow[], m: Metric) {
  const val = METRICAS[m].value
  const byDay = new Map<number, number>()
  for (const r of rows) {
    if (r.fecha == null) continue
    const d = new Date(r.fecha).getUTCDate()
    byDay.set(d, (byDay.get(d) ?? 0) + val(r))
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  return { labels: days.map(String), values: days.map((d) => byDay.get(d) ?? 0) }
}

export function VentasReport({ sheet }: { sheet: VentasSheet }) {
  const [view, setView] = useState('general')
  const [metric, setMetric] = useState<Metric>('unidades')
  const [pto, setPto] = useState('ALL')
  const [ase, setAse] = useState('ALL')
  const [mov, setMov] = useState<Mov>('ALL')

  const marcas = useMemo(() => agg(sheet.rows, 'marca').sort((a, b) => b.motos - a.motos), [sheet.rows])
  const bodegas = useMemo(() => agg(sheet.rows, 'bodega').sort((a, b) => a.label.localeCompare(b.label)), [sheet.rows])
  const asesores = useMemo(() => [...new Set(sheet.rows.map((r) => r.vendedor))].sort(), [sheet.rows])

  const base = useMemo(
    () =>
      sheet.rows.filter(
        (r) =>
          (pto === 'ALL' || r.bodega === pto) &&
          (ase === 'ALL' || r.vendedor === ase) &&
          (mov === 'ALL' || (mov === 'v' ? !r.devolucion : r.devolucion)),
      ),
    [sheet.rows, pto, ase, mov],
  )
  const rows = useMemo(() => (view === 'general' ? base : base.filter((r) => r.marca === view)), [base, view])

  const pills = [{ id: 'general', label: 'Vista general' }, ...marcas.map((m) => ({ id: m.label, label: m.label }))]
  const activeView = pills.some((p) => p.id === view) ? view : 'general'
  const motosNetas = rows.reduce((a, r) => a + r.cant, 0)

  return (
    <div className="flex flex-col gap-4">
      <PillNav items={pills} active={activeView} onChange={setView} />
      <ReportBand
        title={activeView === 'general' ? 'VENTA MOTOS — Todas las marcas' : `VENTA MOTOS — ${activeView}`}
        info={`${sheet.generatedAt ? `Generado el ${sheet.generatedAt} · ` : ''}${fmtInt(rows.length)} registros`}
        badge={sheet.periodo ? `Corte a ${sheet.periodo}` : 'Ventas del mes'}
      />

      <div className="no-print flex flex-wrap items-end gap-3">
        <FilterField label="Métrica" value={metric} onChange={(v) => setMetric(v as Metric)} options={Object.entries(METRICAS).map(([value, m]) => ({ value, label: m.label }))} />
        <FilterField label="Punto de venta" value={pto} onChange={setPto} options={[{ value: 'ALL', label: 'Todos' }, ...bodegas.map((b) => ({ value: b.label, label: b.short }))]} />
        <FilterField label="Asesor" value={ase} onChange={setAse} options={[{ value: 'ALL', label: 'Todos' }, ...asesores.map((a) => ({ value: a, label: a }))]} />
        <FilterField
          label="Mostrar"
          value={mov}
          onChange={(v) => setMov(v as Mov)}
          options={[
            { value: 'ALL', label: 'Ventas netas' },
            { value: 'v', label: 'Solo ventas' },
            { value: 'd', label: 'Solo devoluciones' },
          ]}
        />
      </div>

      {activeView === 'general' ? (
        <GeneralView rows={rows} metric={metric} />
      ) : (
        <MarcaView marca={activeView} rows={rows} metric={metric} totalMotos={motosNetas} allMotos={base.reduce((a, r) => a + r.cant, 0)} />
      )}

      {sheet.notes.length > 0 && (
        <ul className="space-y-0.5 px-1 text-[10.5px] text-muted-foreground">
          {sheet.notes.map((n) => (
            <li key={n}>* {n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ================================================================== */
/* KPIs compartidos                                                    */
/* ================================================================== */

function Kpis({ rows }: { rows: VentaRow[] }) {
  const facturadas = rows.filter((r) => !r.devolucion).reduce((a, r) => a + r.cant, 0)
  const devs = rows.filter((r) => r.devolucion).reduce((a, r) => a + Math.abs(r.cant), 0)
  const motos = rows.reduce((a, r) => a + r.cant, 0)
  const venta = rows.reduce((a, r) => a + r.precio, 0)
  const uti = rows.reduce((a, r) => a + (r.utilidad ?? 0), 0)
  return (
    <KpiRow>
      <KpiStripe tone="blue" label="Motos a hoy" value={fmtInt(motos)} note={`${fmtInt(facturadas)} facturadas · ${fmtInt(devs)} devoluciones`} />
      <KpiStripe tone="green" label="Venta neta" value={money(venta)} note="Precio + IVA, neta de devoluciones" />
      <KpiStripe tone="amber" label="Utilidad" value={money(uti)} note={venta ? `margen ${fmtPct(uti / venta)}` : 'sin venta'} />
      <KpiStripe tone="coral" label="Ticket promedio" value={money(motos ? venta / motos : 0)} note="Venta neta ÷ motos" />
    </KpiRow>
  )
}

/* ================================================================== */
/* Vista general (todas las marcas)                                    */
/* ================================================================== */

function GeneralView({ rows, metric }: { rows: VentaRow[]; metric: Metric }) {
  const M = METRICAS[metric]
  const marcas = useMemo(() => agg(rows, 'marca').sort((a, b) => metricValue(b, metric) - metricValue(a, metric)), [rows, metric])
  const bodegas = useMemo(() => agg(rows, 'bodega').sort((a, b) => metricValue(b, metric) - metricValue(a, metric)), [rows, metric])
  const asesores = useMemo(() => agg(rows, 'vendedor').sort((a, b) => metricValue(b, metric) - metricValue(a, metric)), [rows, metric])
  const evo = useMemo(() => daily(rows, metric), [rows, metric])

  const totalMotos = rows.reduce((a, r) => a + r.cant, 0)
  const totalFact = rows.filter((r) => !r.devolucion).reduce((a, r) => a + r.cant, 0)
  const totalDevs = rows.filter((r) => r.devolucion).reduce((a, r) => a + Math.abs(r.cant), 0)
  const totalVenta = rows.reduce((a, r) => a + r.precio, 0)
  const totalUti = rows.reduce((a, r) => a + (r.utilidad ?? 0), 0)
  const total = M === METRICAS.unidades ? totalMotos : M === METRICAS.venta ? totalVenta : totalUti
  const maxBod = Math.max(...bodegas.map((x) => metricValue(x, metric)), 0)
  const maxAse = Math.max(...asesores.map((x) => metricValue(x, metric)), 0)

  const dimCols = (label: string, max: number): EnvTableCol<Agg>[] => [
    { key: 'd', header: label, render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, width: '28%' },
    { key: 'f', header: 'Facturadas', align: 'right', muted: true, render: (r) => fmtInt(r.facturadas) },
    { key: 'dv', header: 'Devol.', align: 'right', muted: true, render: (r) => (r.devs ? fmtInt(r.devs) : '—') },
    { key: 'm', header: 'A hoy', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.motos)}</span> },
    { key: 'v', header: 'Venta neta', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.venta)}</span> },
    { key: 'u', header: 'Utilidad', align: 'right', muted: true, render: (r) => fmtCOP(r.utilidad) },
    { key: 'p', header: 'Part. %', align: 'right', muted: true, render: (r) => fmtPct(total ? metricValue(r, metric) / total : 0) },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={metricValue(r, metric)} max={max} /> },
  ]

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay registros con los filtros actuales.</p>

  return (
    <>
      <Kpis rows={rows} />
      <Row2>
        <EnvCard title={`${M.label} por marca`}>
          <BarPair
            labels={marcas.map((x) => x.label)}
            prev={null}
            cur={marcas.map((x) => metricValue(x, metric))}
            prevLabel={null}
            curLabel={M.label}
            color={marcas.map((x) => colorOf(x.label))}
            format={M.fmt}
          />
        </EnvCard>
        <EnvCard title={`Distribución por marca — ${M.label.toLowerCase()}`}>
          <DonutLegend labels={marcas.map((x) => x.label)} values={marcas.map((x) => metricValue(x, metric))} colors={marcas.map((x) => colorOf(x.label))} format={M.fmt} />
        </EnvCard>
      </Row2>
      <Row2>
        <EnvCard title={`Distribución por punto de venta (top 10) — ${M.label.toLowerCase()}`}>
          <DonutLegend labels={bodegas.slice(0, 10).map((x) => x.short)} values={bodegas.slice(0, 10).map((x) => metricValue(x, metric))} colors={PALETA_TIENDAS} format={M.fmt} />
        </EnvCard>
        <EnvCard title={`Evolución diaria — ${M.label.toLowerCase()}`}>
          <LinePair labels={evo.labels} prev={null} cur={evo.values} prevLabel={null} curLabel={M.label} color="#378ADD" format={M.fmt} />
        </EnvCard>
      </Row2>
      <EnvTable
        rows={bodegas}
        cols={dimCols('Punto de venta', maxBod)}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(totalFact), fmtInt(totalDevs), fmtInt(totalMotos), fmtCOP(totalVenta), fmtCOP(totalUti), '100 %', '']}
        foot="* A hoy = unidades facturadas menos devoluciones (notas crédito)."
      />
      <EnvTable
        rows={asesores.slice(0, 25)}
        cols={dimCols('Asesor', maxAse)}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(totalFact), fmtInt(totalDevs), fmtInt(totalMotos), fmtCOP(totalVenta), fmtCOP(totalUti), '100 %', '']}
        foot={asesores.length > 25 ? `* Se muestran los 25 asesores con más ${M.label.toLowerCase()} de ${fmtInt(asesores.length)}.` : undefined}
      />
    </>
  )
}

/* ================================================================== */
/* Vista por marca                                                     */
/* ================================================================== */

function MarcaView({ marca, rows, metric, totalMotos, allMotos }: { marca: string; rows: VentaRow[]; metric: Metric; totalMotos: number; allMotos: number }) {
  const M = METRICAS[metric]
  const bodegas = useMemo(() => agg(rows, 'bodega').sort((a, b) => metricValue(b, metric) - metricValue(a, metric)), [rows, metric])
  const modelos = useMemo(() => agg(rows, 'modelo').sort((a, b) => metricValue(b, metric) - metricValue(a, metric)), [rows, metric])
  const evo = useMemo(() => daily(rows, metric), [rows, metric])
  const detalle = useMemo(() => [...rows].sort((a, b) => b.precio - a.precio), [rows])
  const maxBod = Math.max(...bodegas.map((x) => metricValue(x, metric)), 0)

  const totalFact = rows.filter((r) => !r.devolucion).reduce((a, r) => a + r.cant, 0)
  const totalDevs = rows.filter((r) => r.devolucion).reduce((a, r) => a + Math.abs(r.cant), 0)
  const totalVenta = rows.reduce((a, r) => a + r.precio, 0)
  const totalUti = rows.reduce((a, r) => a + (r.utilidad ?? 0), 0)
  const total = metric === 'unidades' ? totalMotos : metric === 'venta' ? totalVenta : totalUti

  const bodCols: EnvTableCol<Agg>[] = [
    { key: 'd', header: 'Punto de venta', render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, width: '28%' },
    { key: 'f', header: 'Facturadas', align: 'right', muted: true, render: (r) => fmtInt(r.facturadas) },
    { key: 'dv', header: 'Devol.', align: 'right', muted: true, render: (r) => (r.devs ? fmtInt(r.devs) : '—') },
    { key: 'm', header: 'A hoy', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.motos)}</span> },
    { key: 'v', header: 'Venta neta', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.venta)}</span> },
    { key: 'u', header: 'Utilidad', align: 'right', muted: true, render: (r) => fmtCOP(r.utilidad) },
    { key: 'p', header: 'Part. %', align: 'right', muted: true, render: (r) => fmtPct(total ? metricValue(r, metric) / total : 0) },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={metricValue(r, metric)} max={maxBod} /> },
  ]
  const detCols: EnvTableCol<VentaRow>[] = [
    { key: 'd', header: 'Documento', render: (r) => <span className="font-medium text-ink">{`${r.tipo} ${r.numero ?? ''}`.trim()}</span>, width: '10%' },
    { key: 'f', header: 'Fecha', muted: true, render: (r) => dayOf(r.fecha) },
    { key: 'c', header: 'Cliente', render: (r) => r.cliente, width: '24%' },
    { key: 'b', header: 'Punto de venta', muted: true, render: (r) => shortLabel(r.bodega) },
    { key: 'a', header: 'Asesor', muted: true, render: (r) => r.vendedor },
    { key: 'mo', header: 'Modelo', muted: true, render: (r) => r.modelo },
    { key: 'p', header: 'Precio + IVA', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.precio)}</span> },
    { key: 'u', header: 'Utilidad', align: 'right', muted: true, render: (r) => fmtCOP(r.utilidad) },
  ]

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay ventas de {marca} con los filtros actuales.</p>

  return (
    <>
      <Kpis rows={rows} />
      <KpiRow columns={3}>
        <KpiStripe tone="blue" label="Participación en motos" value={fmtPct(allMotos ? totalMotos / allMotos : 0)} note={`${fmtInt(totalMotos)} de ${fmtInt(allMotos)} motos`} />
        <KpiStripe tone="green" label="Punto de venta líder" value={bodegas[0]?.short ?? '—'} note={`${fmtInt(bodegas[0]?.motos ?? 0)} motos`} />
        <KpiStripe tone="amber" label="Modelo líder" value={modelos[0]?.short ?? '—'} note={`${fmtInt(modelos[0]?.motos ?? 0)} motos`} />
      </KpiRow>
      <Row2>
        <EnvCard title={`${M.label} por punto de venta`}>
          <BarPair
            labels={bodegas.slice(0, 10).map((x) => x.short)}
            fullLabels={bodegas.slice(0, 10).map((x) => x.label)}
            prev={null}
            cur={bodegas.slice(0, 10).map((x) => metricValue(x, metric))}
            prevLabel={null}
            curLabel={M.label}
            color={colorOf(marca)}
            format={M.fmt}
          />
        </EnvCard>
        <EnvCard title={`Distribución por modelo (top 10) — ${M.label.toLowerCase()}`}>
          <DonutLegend labels={modelos.slice(0, 10).map((x) => x.short)} values={modelos.slice(0, 10).map((x) => metricValue(x, metric))} colors={PALETA_TIENDAS} format={M.fmt} />
        </EnvCard>
      </Row2>
      <EnvCard title={`Evolución diaria — ${M.label.toLowerCase()}`}>
        <LinePair labels={evo.labels} prev={null} cur={evo.values} prevLabel={null} curLabel={M.label} color={colorOf(marca)} format={M.fmt} />
      </EnvCard>
      <EnvTable
        rows={bodegas}
        cols={bodCols}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(totalFact), fmtInt(totalDevs), fmtInt(totalMotos), fmtCOP(totalVenta), fmtCOP(totalUti), '100 %', '']}
        foot="* A hoy = unidades facturadas menos devoluciones (notas crédito)."
      />
      <EnvTable
        rows={detalle.slice(0, 100)}
        cols={detCols}
        rowKey={(r) => `${r.tipo}-${r.numero}-${r.vin}`}
        footer={['Total', '', '', '', '', '', fmtCOP(totalVenta), fmtCOP(totalUti)]}
        foot={detalle.length > 100 ? `* Se muestran los 100 documentos de mayor valor de ${fmtInt(detalle.length)}.` : undefined}
      />
    </>
  )
}
