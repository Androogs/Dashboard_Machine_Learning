/**
 * Vista principal del tablero: hoja ASI VAMOS.
 *
 * KPIs de radicadas (ventas), cotizaciones, efectividad, data activa y seguimiento;
 * gráficas por asesor y por canal; resumen por marca/sede y tabla completa por asesor.
 *
 * Criterios (se recalculan desde los valores de cada asesor):
 *   Debe llevar      = meta ÷ días hábiles × día de avance
 *   % cumplimiento   = a hoy ÷ debe llevar
 *   % efectividad    = radicadas a hoy ÷ cotizaciones a hoy
 *   Proyección cierre (estimación lineal) = a hoy ÷ día de avance × días hábiles
 */
import type { ComercialAsiVamosRow, ComercialSheet } from '@/types/report'
import { fmtInt, fmtPct } from '@/lib/format'
import { UMBRALES_CUMPLIMIENTO, colorOf } from '@/config/negocio'
import { cn } from '@/lib/utils'
import { EnvCard, EnvTable, KpiRow, KpiStripe, Row2, TrendBar, type EnvTableCol } from '../env/EnvBlocks'
import { DonutLegend } from '../env/EnvCharts'
import { HBars } from './ComercialCharts'

const C = { azul: '#378ADD', verde: '#1D9E75', ambar: '#BA7517', coral: '#D85A30', claro: '#B5D4F4', violeta: '#7F77DD' }
const CANALES = ['vitrina', 'pauta', 'organico', 'volante', 'otro'] as const
const CANAL_LABEL = ['Vitrina', 'Pauta', 'Orgánico', 'Volante', 'Otro']
const CANAL_COLOR = [C.azul, C.verde, C.coral, C.ambar, C.violeta]

type Row = ComercialAsiVamosRow

interface Totals {
  asesores: number
  meta: number
  aHoy: number
  metaCoti: number
  coti: number
  data: number
  alta: number
  media: number
  baja: number
  segP: number
  segR: number
  neg: number
}

export function totalsOf(rows: Row[]): Totals {
  return rows.reduce<Totals>(
    (a, r) => ({
      asesores: a.asesores + 1,
      meta: a.meta + r.metaVentas,
      aHoy: a.aHoy + r.aHoy,
      metaCoti: a.metaCoti + r.metaCoti,
      coti: a.coti + r.aHoyCoti,
      data: a.data + r.dataActiva,
      alta: a.alta + r.alta,
      media: a.media + r.media,
      baja: a.baja + r.baja,
      segP: a.segP + r.segPendiente,
      segR: a.segR + r.segRealizado,
      neg: a.neg + r.negCreados,
    }),
    { asesores: 0, meta: 0, aHoy: 0, metaCoti: 0, coti: 0, data: 0, alta: 0, media: 0, baja: 0, segP: 0, segR: 0, neg: 0 },
  )
}

/** Pastilla de cumplimiento: verde ≥ meta, ámbar en riesgo, rojo crítico (umbrales en config/negocio.ts). */
function Cump({ value }: { value: number | null }) {
  if (value == null || !isFinite(value)) return <span className="text-muted-foreground">—</span>
  const tone = value >= UMBRALES_CUMPLIMIENTO.cumple ? 'bg-[#E1F5EE] text-[#085041]' : value >= UMBRALES_CUMPLIMIENTO.riesgo ? 'bg-[#FAEEDA] text-[#633806]' : 'bg-[#FAECE7] text-[#712B13]'
  return <span className={cn('tabular whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold', tone)}>{fmtPct(value)}</span>
}

export function AsiVamosView({
  rows,
  all,
  meta,
  color,
  group,
  groups,
  keyBy,
}: {
  rows: Row[]
  all: Row[]
  meta: ComercialSheet['meta']
  color: string
  group: string
  groups: string[]
  keyBy: 'marca' | 'sede'
}) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground shadow-card">
        {group} no tiene asesores en la hoja ASI VAMOS. Sus registros del CRM están en las demás secciones (Seguimiento, Pedidos…).
      </p>
    )
  }
  const dias = meta.diasHabiles ?? 0
  const av = meta.avance ?? 0
  const debe = (m: number) => (dias ? (m / dias) * av : 0)
  const ratio = (a: number, b: number) => (b ? a / b : null)
  const t = totalsOf(rows)
  const debeT = debe(t.meta)
  const debeCotiT = debe(t.metaCoti)
  const proy = av ? (t.aHoy / av) * dias : null

  // Etiqueta del asesor: se agrega la marca si el mismo nombre está en varias marcas (ej: DANIELA Suzuki y Hero)
  const dup = new Set(rows.map((r) => r.asesor).filter((n, i, arr) => arr.indexOf(n) !== i))
  const label = (r: Row) => (dup.has(r.asesor) ? `${r.asesor} (${r.marca})` : r.asesor)
  const list = [...rows].sort((a, b) => b.aHoy - a.aHoy || b.metaVentas - a.metaVentas)
  const byCoti = [...rows].sort((a, b) => b.aHoyCoti - a.aHoyCoti)
  const canales = CANALES.map((k) => rows.reduce((a, r) => a + r.canales[k], 0))
  const max = Math.max(0, ...list.map((r) => r.aHoy))

  const cols: EnvTableCol<Row>[] = [
    { key: 'n', header: 'Asesor', render: (r) => <span className="font-medium text-ink">{r.asesor}</span> },
    ...(group && keyBy === 'sede' ? [] : [{ key: 'm', header: 'Marca', render: (r: Row) => <span className="text-[11px] text-muted-foreground">{r.marca}</span> }]),
    ...(group && keyBy === 'sede' ? [] : [{ key: 's', header: 'Sede / bloque', render: (r: Row) => <span className="text-[11px] text-muted-foreground">{r.sede === r.bloque || r.bloque === r.marca ? r.sede : `${r.sede}, ${r.bloque}`}</span> }]),
    { key: 'mv', header: 'Meta', align: 'right', muted: true, render: (r) => fmtInt(r.metaVentas) },
    { key: 'd', header: 'Debe llevar', align: 'right', muted: true, render: (r) => debe(r.metaVentas).toLocaleString('es-CO', { maximumFractionDigits: 1 }) },
    { key: 'a', header: 'A hoy', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.aHoy)}</span> },
    { key: 'c', header: '% cump.', align: 'right', render: (r) => <Cump value={ratio(r.aHoy, debe(r.metaVentas))} /> },
    { key: 'q', header: 'Cotiz.', align: 'right', render: (r) => fmtInt(r.aHoyCoti) },
    { key: 'qc', header: '% cump. cotiz.', align: 'right', render: (r) => <Cump value={ratio(r.aHoyCoti, debe(r.metaCoti))} /> },
    { key: 'e', header: '% efect.', align: 'right', muted: true, render: (r) => (r.aHoyCoti ? fmtPct(r.aHoy / r.aHoyCoti) : '—') },
    { key: 'da', header: 'Data activa', align: 'right', muted: true, render: (r) => fmtInt(r.dataActiva) },
    { key: 'sp', header: 'Seg. pend.', align: 'right', muted: true, render: (r) => fmtInt(r.segPendiente) },
    { key: 'sr', header: 'Seg. real.', align: 'right', muted: true, render: (r) => fmtInt(r.segRealizado) },
    { key: 'ng', header: 'Neg. creados', align: 'right', muted: true, render: (r) => fmtInt(r.negCreados) },
    { key: 'b', header: 'Tendencia', render: (r) => <TrendBar value={r.aHoy} max={max} color={colorOf(r.marca, color)} /> },
  ]
  const showGroupCols = !(group && keyBy === 'sede')
  const footer = [
    'Total',
    ...(showGroupCols ? ['', ''] : []),
    fmtInt(t.meta),
    debeT.toLocaleString('es-CO', { maximumFractionDigits: 1 }),
    fmtInt(t.aHoy),
    <Cump key="c" value={ratio(t.aHoy, debeT)} />,
    fmtInt(t.coti),
    <Cump key="q" value={ratio(t.coti, debeCotiT)} />,
    t.coti ? fmtPct(t.aHoy / t.coti) : '—',
    fmtInt(t.data),
    fmtInt(t.segP),
    fmtInt(t.segR),
    fmtInt(t.neg),
    '',
  ]

  // Resumen por grupo (Vista general con varias marcas o sedes)
  const resumen = groups.map((g) => ({ g, t: totalsOf(all.filter((r) => r[keyBy] === g)) })).filter((x) => x.t.asesores > 0)
  const tAll = totalsOf(all)

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Radicadas a hoy" value={fmtInt(t.aHoy)} note={`Meta ${fmtInt(t.meta)}, debe llevar ${debeT.toLocaleString('es-CO', { maximumFractionDigits: 1 })}`} />
        <KpiStripe
          tone="green"
          label="% cumplimiento radicadas"
          value={fmtPct(ratio(t.aHoy, debeT))}
          note={t.aHoy >= debeT ? `Supera el debe llevar en ${fmtInt(Math.round(t.aHoy - debeT))}` : `Faltan ${fmtInt(Math.ceil(debeT - t.aHoy))} para el debe llevar`}
        />
        <KpiStripe tone="amber" label="Cotizaciones a hoy" value={fmtInt(t.coti)} note={`${fmtPct(ratio(t.coti, debeCotiT))} del debe llevar (meta ${fmtInt(t.metaCoti)})`} />
        <KpiStripe tone="coral" label="% efectividad" value={fmtPct(ratio(t.aHoy, t.coti))} note="Radicadas ÷ cotizaciones" />
      </KpiRow>
      <KpiRow>
        <KpiStripe tone="blue" label="Proyección al cierre" value={proy != null ? fmtInt(Math.round(proy)) : '—'} note={`Estimación lineal, ${fmtPct(proy != null ? ratio(proy, t.meta) : null)} de la meta`} />
        <KpiStripe tone="green" label="Data activa" value={fmtInt(t.data)} note={`${fmtInt(t.alta)} alta, ${fmtInt(t.media)} media, ${fmtInt(t.baja)} baja`} />
        <KpiStripe tone="amber" label="Seguimiento pendiente" value={fmtInt(t.segP)} note={`${fmtInt(t.segR)} realizados`} />
        <KpiStripe tone="coral" label="Negocios creados" value={fmtInt(t.neg)} note={`${fmtInt(t.asesores)} asesores`} />
      </KpiRow>

      <Row2>
        <EnvCard title="Radicadas a hoy vs debe llevar por asesor">
          <HBars
            labels={list.map(label)}
            series={[
              { label: 'Debe llevar', data: list.map((r) => Math.round(debe(r.metaVentas) * 10) / 10), color: C.claro },
              { label: 'Radicadas a hoy', data: list.map((r) => r.aHoy), color },
            ]}
          />
        </EnvCard>
        <EnvCard title="Radicadas por canal">
          <DonutLegend labels={CANAL_LABEL} values={canales} colors={CANAL_COLOR} format={(v) => `${fmtInt(v)} radicadas`} />
          <p className="mt-3 text-[10.5px] text-muted-foreground">Canales tal como vienen en la hoja (en algunos bloques no suman las radicadas a hoy).</p>
        </EnvCard>
        <EnvCard title="Cotizaciones a hoy vs debe llevar por asesor">
          <HBars
            labels={byCoti.map(label)}
            series={[
              { label: 'Debe llevar cotiz.', data: byCoti.map((r) => Math.round(debe(r.metaCoti) * 10) / 10), color: C.claro },
              { label: 'Cotizaciones a hoy', data: byCoti.map((r) => r.aHoyCoti), color: C.verde },
            ]}
          />
        </EnvCard>
        <EnvCard title="Clasificación de data activa">
          <DonutLegend labels={['Alta', 'Media', 'Baja']} values={[t.alta, t.media, t.baja]} colors={[C.verde, C.ambar, C.claro]} format={(v) => `${fmtInt(v)} registros`} />
        </EnvCard>
      </Row2>

      {!group && resumen.length > 1 && (
        <EnvTable
          rows={resumen}
          rowKey={(r) => r.g}
          cols={[
            { key: 'g', header: keyBy === 'marca' ? 'Marca' : 'Sede', render: (r) => <span className="font-semibold text-ink">{r.g}</span> },
            { key: 'n', header: 'Asesores', align: 'right', muted: true, render: (r) => fmtInt(r.t.asesores) },
            { key: 'm', header: 'Meta', align: 'right', muted: true, render: (r) => fmtInt(r.t.meta) },
            { key: 'd', header: 'Debe llevar', align: 'right', muted: true, render: (r) => debe(r.t.meta).toLocaleString('es-CO', { maximumFractionDigits: 1 }) },
            { key: 'a', header: 'A hoy', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.t.aHoy)}</span> },
            { key: 'c', header: '% cump.', align: 'right', render: (r) => <Cump value={ratio(r.t.aHoy, debe(r.t.meta))} /> },
            { key: 'q', header: 'Cotiz.', align: 'right', render: (r) => fmtInt(r.t.coti) },
            { key: 'qc', header: '% cump. cotiz.', align: 'right', render: (r) => <Cump value={ratio(r.t.coti, debe(r.t.metaCoti))} /> },
            { key: 'e', header: '% efect.', align: 'right', muted: true, render: (r) => (r.t.coti ? fmtPct(r.t.aHoy / r.t.coti) : '—') },
            { key: 'da', header: 'Data activa', align: 'right', muted: true, render: (r) => fmtInt(r.t.data) },
            { key: 'sp', header: 'Seg. pend.', align: 'right', muted: true, render: (r) => fmtInt(r.t.segP) },
            { key: 'p', header: 'Part.% radicadas', align: 'right', muted: true, render: (r) => fmtPct(ratio(r.t.aHoy, tAll.aHoy)) },
          ]}
          footer={[
            'Total',
            fmtInt(tAll.asesores),
            fmtInt(tAll.meta),
            debe(tAll.meta).toLocaleString('es-CO', { maximumFractionDigits: 1 }),
            fmtInt(tAll.aHoy),
            <Cump key="c" value={ratio(tAll.aHoy, debe(tAll.meta))} />,
            fmtInt(tAll.coti),
            <Cump key="q" value={ratio(tAll.coti, debe(tAll.metaCoti))} />,
            tAll.coti ? fmtPct(tAll.aHoy / tAll.coti) : '—',
            fmtInt(tAll.data),
            fmtInt(tAll.segP),
            '100 %',
          ]}
          foot={`* Resumen por ${keyBy === 'marca' ? 'marca' : 'sede'} de la hoja ASI VAMOS. Verde: cumple; ámbar: ${fmtPct(UMBRALES_CUMPLIMIENTO.riesgo, 0)} a 99 %; rojo: menos del ${fmtPct(UMBRALES_CUMPLIMIENTO.riesgo, 0)}.`}
        />
      )}

      <EnvTable
        rows={list}
        cols={cols}
        footer={footer}
        rowKey={(r) => `${r.marca}|${r.asesor}|${r.bloque}`}
        foot={`* Hoja ASI VAMOS. Debe llevar = meta ÷ ${dias || '—'} días hábiles × día de avance ${av || '—'}. % cump. = a hoy ÷ debe llevar. Ordenado por radicadas a hoy.`}
      />
    </>
  )
}
