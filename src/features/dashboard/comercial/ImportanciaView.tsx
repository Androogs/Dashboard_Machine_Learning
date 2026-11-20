/**
 * Vista "Importancia" del tablero comercial: la tabla de la hoja ASI VAMOS
 * ordenada por cumplimiento de facturación, con jefe comercial, metas,
 * facturado, radicadas por canal, cotizaciones, data activa, efectividad,
 * seguimiento y negocios creados — igual que la presenta el documento.
 */
import type { ComercialAsiVamosRow, ComercialSheet } from '@/types/report'
import { fmtInt, fmtPct } from '@/lib/format'
import { UMBRALES_CUMPLIMIENTO, jefeComercial } from '@/config/negocio'
import { cn } from '@/lib/utils'
import { EnvCard, KpiRow, KpiStripe } from '../env/EnvBlocks'
import { HBars } from './ComercialCharts'

const C = { azul: '#378ADD', verde: '#1D9E75', ambar: '#BA7517', coral: '#D85A30', claro: '#B5D4F4' }

type Row = ComercialAsiVamosRow

function Cump({ value }: { value: number | null }) {
  if (value == null || !isFinite(value)) return <span className="text-muted-foreground">—</span>
  const tone = value >= UMBRALES_CUMPLIMIENTO.cumple ? 'bg-[#E1F5EE] text-[#085041]' : value >= UMBRALES_CUMPLIMIENTO.riesgo ? 'bg-[#FAEEDA] text-[#633806]' : 'bg-[#FAECE7] text-[#712B13]'
  return <span className={cn('tabular whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold', tone)}>{fmtPct(value)}</span>
}

const th = 'border-b bg-secondary/70 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.03em] text-muted-foreground'
const tdN = 'tabular whitespace-nowrap px-2 py-2 text-right'
const tdM = `${tdN} text-muted-foreground`

export function ImportanciaView({ rows, meta, color }: { rows: Row[]; meta: ComercialSheet['meta']; color: string }) {
  if (!rows.length) {
    return <p className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground shadow-card">No hay asesores en la hoja ASI VAMOS con este filtro.</p>
  }
  const dias = meta.diasHabiles ?? 0
  const av = meta.avance ?? 0
  const ratio = (a: number, b: number | null | undefined) => (b ? a / b : null)
  const debe = (r: Row) => r.debeLlevar ?? (dias ? (r.metaVentas / dias) * av : null)
  const debeCoti = (r: Row) => r.debeLlevarCoti ?? (dias ? (r.metaCoti / dias) * av : null)
  const cumpFact = (r: Row) => r.cumplFact ?? ratio(r.facturado, debe(r))
  const cumpRads = (r: Row) => r.cumplRads ?? ratio(r.aHoy, debe(r))
  const cumpCoti = (r: Row) => r.cumplCoti ?? ratio(r.aHoyCoti, debeCoti(r))
  const efect = (r: Row) => r.efectividadFact ?? r.efectividad ?? ratio(r.aHoy, r.aHoyCoti)
  const jefe = (r: Row) => jefeComercial(r.sede, r.marca) || r.jefeHoja || '—'

  // "En importancia": orden por cumplimiento de facturación; sin meta al final
  const dup = new Set(rows.map((r) => r.asesor).filter((n, i, arr) => arr.indexOf(n) !== i))
  const label = (r: Row) => (dup.has(r.asesor) ? `${r.asesor} (${r.marca})` : r.asesor)
  const list = [...rows].sort((a, b) => (cumpFact(b) ?? -1) - (cumpFact(a) ?? -1))

  const t = rows.reduce(
    (a, r) => ({
      meta: a.meta + r.metaVentas,
      fact: a.fact + r.facturado,
      debe: a.debe + (debe(r) ?? 0),
      rads: a.rads + r.aHoy,
      vit: a.vit + r.canales.vitrina,
      pau: a.pau + r.canales.pauta,
      org: a.org + r.canales.organico,
      vol: a.vol + r.canales.volante,
      otr: a.otr + r.canales.otro,
      metaC: a.metaC + r.metaCoti,
      debeC: a.debeC + (debeCoti(r) ?? 0),
      coti: a.coti + r.aHoyCoti,
      alta: a.alta + r.alta,
      media: a.media + r.media,
      baja: a.baja + r.baja,
      data: a.data + r.dataActiva,
      segP: a.segP + r.segPendiente,
      segR: a.segR + r.segRealizado,
      neg: a.neg + r.negCreados,
    }),
    { meta: 0, fact: 0, debe: 0, rads: 0, vit: 0, pau: 0, org: 0, vol: 0, otr: 0, metaC: 0, debeC: 0, coti: 0, alta: 0, media: 0, baja: 0, data: 0, segP: 0, segR: 0, neg: 0 },
  )
  const fmtD = (v: number | null) => (v == null ? '—' : v.toLocaleString('es-CO', { maximumFractionDigits: 1 }))

  const GROUPS: { label: string; span: number; color: string }[] = [
    { label: '', span: 3, color: 'transparent' },
    { label: 'Ventas', span: 4, color: C.azul },
    { label: 'Radicadas', span: 7, color: C.verde },
    { label: 'Cotizaciones', span: 4, color: C.ambar },
    { label: 'Data activa', span: 4, color: C.coral },
    { label: 'Efectividad', span: 1, color: '#7F77DD' },
    { label: 'Seguimiento', span: 3, color: '#888780' },
  ]
  const HEADERS = [
    '#', 'Asesor', 'Jefe comercial',
    'Meta', 'Debe llevar', 'Fact. a hoy', '% cump.',
    'A hoy', 'Vitrina', 'Pauta', 'Orgánico', 'Volante', 'Otro', '% cump.',
    'Meta', 'Debe llevar', 'A hoy', '% cump.',
    'Alta', 'Media', 'Baja', 'Total',
    '% efect. fact.',
    'Pendiente', 'Realizado', 'Neg. creados',
  ]

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Facturado a hoy" value={fmtInt(t.fact)} note={`Meta ${fmtInt(t.meta)}, debe llevar ${fmtD(t.debe)}`} />
        <KpiStripe tone="green" label="% cumplimiento fact." value={fmtPct(ratio(t.fact, t.debe))} note="Facturado ÷ debe llevar" />
        <KpiStripe tone="amber" label="Radicadas a hoy" value={fmtInt(t.rads)} note={fmtPct(ratio(t.rads, t.debe)) + ' del debe llevar'} />
        <KpiStripe tone="coral" label="Cotizaciones a hoy" value={fmtInt(t.coti)} note={`${fmtPct(ratio(t.coti, t.debeC))} del debe llevar (meta ${fmtInt(t.metaC)})`} />
      </KpiRow>
      <EnvCard title="Facturado a hoy vs debe llevar por asesor (orden de importancia)">
        <HBars
          labels={list.map(label)}
          series={[
            { label: 'Debe llevar', data: list.map((r) => Math.round((debe(r) ?? 0) * 10) / 10), color: C.claro },
            { label: 'Facturado a hoy', data: list.map((r) => r.facturado), color },
          ]}
        />
      </EnvCard>

      <div className="print-break overflow-hidden rounded-xl border bg-card shadow-card">
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[1240px] border-collapse text-[12px]">
            <thead>
              <tr>
                {GROUPS.map((g, i) => (
                  <th key={i} colSpan={g.span} className={cn(th, 'border-b-0 pb-0.5 pt-2 text-center')} style={g.label ? { borderBottom: `2px solid ${g.color}`, color: g.color } : undefined}>
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr>
                {HEADERS.map((h, i) => (
                  <th key={`${h}-${i}`} className={cn(th, i >= 3 ? 'text-right' : 'text-left', i < 3 && 'whitespace-nowrap')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r, idx) => (
                <tr key={`${r.marca}|${r.asesor}|${r.bloque}`} className="border-b last:border-0 hover:bg-secondary/50">
                  <td className="px-2 py-2 text-muted-foreground">{idx + 1}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-medium text-ink">{label(r)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">{jefe(r)}</td>
                  <td className={tdM}>{fmtInt(r.metaVentas)}</td>
                  <td className={tdM}>{fmtD(debe(r))}</td>
                  <td className={cn(tdN, 'font-semibold')}>{fmtInt(r.facturado)}</td>
                  <td className={tdN}><Cump value={cumpFact(r)} /></td>
                  <td className={cn(tdN, 'font-semibold')}>{fmtInt(r.aHoy)}</td>
                  <td className={tdM}>{fmtInt(r.canales.vitrina)}</td>
                  <td className={tdM}>{fmtInt(r.canales.pauta)}</td>
                  <td className={tdM}>{fmtInt(r.canales.organico)}</td>
                  <td className={tdM}>{fmtInt(r.canales.volante)}</td>
                  <td className={tdM}>{fmtInt(r.canales.otro)}</td>
                  <td className={tdN}><Cump value={cumpRads(r)} /></td>
                  <td className={tdM}>{fmtInt(r.metaCoti)}</td>
                  <td className={tdM}>{fmtD(debeCoti(r))}</td>
                  <td className={cn(tdN, 'font-semibold')}>{fmtInt(r.aHoyCoti)}</td>
                  <td className={tdN}><Cump value={cumpCoti(r)} /></td>
                  <td className={tdM}>{fmtInt(r.alta)}</td>
                  <td className={tdM}>{fmtInt(r.media)}</td>
                  <td className={tdM}>{fmtInt(r.baja)}</td>
                  <td className={cn(tdN, 'font-semibold')}>{fmtInt(r.dataActiva)}</td>
                  <td className={tdN}><Cump value={efect(r)} /></td>
                  <td className={tdM}>{fmtInt(r.segPendiente)}</td>
                  <td className={tdM}>{fmtInt(r.segRealizado)}</td>
                  <td className={cn(tdN, 'font-semibold')}>{fmtInt(r.negCreados)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/60 font-semibold text-ink">
                <td className="px-2 py-2.5" colSpan={3}>Total</td>
                <td className={tdN}>{fmtInt(t.meta)}</td>
                <td className={tdN}>{fmtD(t.debe)}</td>
                <td className={tdN}>{fmtInt(t.fact)}</td>
                <td className={tdN}><Cump value={ratio(t.fact, t.debe)} /></td>
                <td className={tdN}>{fmtInt(t.rads)}</td>
                <td className={tdN}>{fmtInt(t.vit)}</td>
                <td className={tdN}>{fmtInt(t.pau)}</td>
                <td className={tdN}>{fmtInt(t.org)}</td>
                <td className={tdN}>{fmtInt(t.vol)}</td>
                <td className={tdN}>{fmtInt(t.otr)}</td>
                <td className={tdN}><Cump value={ratio(t.rads, t.debe)} /></td>
                <td className={tdN}>{fmtInt(t.metaC)}</td>
                <td className={tdN}>{fmtD(t.debeC)}</td>
                <td className={tdN}>{fmtInt(t.coti)}</td>
                <td className={tdN}><Cump value={ratio(t.coti, t.debeC)} /></td>
                <td className={tdN}>{fmtInt(t.alta)}</td>
                <td className={tdN}>{fmtInt(t.media)}</td>
                <td className={tdN}>{fmtInt(t.baja)}</td>
                <td className={tdN}>{fmtInt(t.data)}</td>
                <td className={tdN}><Cump value={ratio(t.rads, t.coti)} /></td>
                <td className={tdN}>{fmtInt(t.segP)}</td>
                <td className={tdN}>{fmtInt(t.segR)}</td>
                <td className={tdN}>{fmtInt(t.neg)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t px-3 py-2 text-[10.5px] text-muted-foreground">
          * Orden de importancia: % de cumplimiento de facturación (facturado ÷ debe llevar). Jefe comercial asignado por sede/marca
          (Katherine Cuevas → Suzuki Palmira, Diana Mercedes → Suzuki Cali, Felipe Benítez → Honda/Auteco/Bajaj, Miller Solarte → AKT; configurable en src/config/negocio.ts).
          Los valores "debe llevar" y "% cumplimiento" vienen de la hoja ASI VAMOS; si el bloque no los trae se calculan con {dias || '—'} días hábiles × día {av || '—'}.
        </p>
      </div>
    </>
  )
}
