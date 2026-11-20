/**
 * Reporte "Cierre de mes — Cartera" (informe de gerencia) con el maquetado
 * de gerencia: banda con logo, KPIs con franja, envejecimiento, donas y tablas.
 *
 * Secciones de la cartera (por "Tipo 2" del libro):
 *  - analizada: universo de las tablas dinámicas (propia, avalada, repuestos…)
 *  - fin:       desembolsos de financieras (ZAD, ZK, ZD, ZE, ZG, ZH, ZS, ZC…)
 *  - cont:      contados e iniciales · contab: 90 CONTABILIDAD
 *  - ajuste:    recibos de caja y notas (aplicaciones, no deuda) — se excluyen.
 *
 * Los comparativos mensual/anual vienen calculados en el libro: se muestran
 * tal cual y no los afectan los filtros.
 */
import { useMemo, useState } from 'react'
import type { GCBloque, GCRow, GCSec, GCSegTop, GCTopDoc, GerenciaCarteraSheet } from '@/types/report'
import { FilterField } from '../blocks'
import { EnvCard, EnvTable, KpiRow, KpiStripe, PillNav, ReportBand, Row2, TrendBar, VarPill, varOf, type EnvTableCol } from '../env/EnvBlocks'
import { BarPair, DonutLegend, VarBars } from '../env/EnvCharts'
import { fmtCOP, fmtCOPCompact, fmtInt, fmtPct, shortLabel, titleCase, variation } from '@/lib/format'
import { gcClaseDoc, gcCodigo, gcFinanciera, gcSegmento } from '@/parser/gerenciaCarteraParser'
import { PALETA_TIENDAS, SEGMENTOS_CARTERA, SEG_SIN_ASIGNAR, SUGERENCIA_SEGMENTO } from '@/config/negocio'

const money = fmtCOPCompact
const moroso = (r: GCRow) => r.b.reduce((a, x) => a + x, 0)

/** Rangos de mora en el orden del libro. */
const RANGOS = ['1-30', '31-60', '61-90', '91-120', '121-180', '181-360', '+360']
const AGING_LABELS = ['Sin vencer', ...RANGOS]

/** Colores por tipo de cartera y sección. */
const COLOR_TC: Record<string, string> = {
  corriente: '#378ADD', prejuridico: '#BA7517', juridico: '#D85A30', castigada: '#7F77DD',
}
const colorTC = (tc: string) => COLOR_TC[tc.replace(/^\d+\s*/, '').toLowerCase().replace(/\s+/g, '')] ?? '#378ADD'

const SEC_LABEL: Record<GCSec, string> = { fin: 'Desembolsos financieras', cont: 'Contados e iniciales', contab: 'Contabilidad', analizada: 'Cartera analizada', ajuste: 'Recibos y notas' }
const SEC_COLOR: Record<GCSec, string> = { analizada: '#378ADD', fin: '#1D9E75', cont: '#BA7517', contab: '#7F77DD', ajuste: '#888780' }

interface GAgg {
  label: string
  short: string
  n: number
  sal: number
  sv: number
  mor: number
  b: number[]
}

const newAgg = (label: string, short?: string): GAgg => ({ label, short: short ?? label, n: 0, sal: 0, sv: 0, mor: 0, b: [0, 0, 0, 0, 0, 0, 0] })

function addTo(a: GAgg, r: GCRow) {
  a.n += r.n
  a.sal += r.sal
  a.sv += r.sv
  for (let i = 0; i < 7; i++) {
    a.b[i]! += r.b[i]!
    a.mor += r.b[i]!
  }
}

function aggBy(rows: GCRow[], key: (r: GCRow) => string, short?: (s: string) => string): GAgg[] {
  const m = new Map<string, GAgg>()
  for (const r of rows) {
    const k = key(r)
    const cur = m.get(k) ?? newAgg(k, short?.(k))
    addTo(cur, r)
    m.set(k, cur)
  }
  return [...m.values()]
}

const tot = (rows: GCRow[]) => rows.reduce((a, r) => a + r.sal, 0)
const totAgg = (rows: GAgg[]) => rows.reduce((a, r) => a + r.sal, 0)
const mor = (rows: GCRow[]) => rows.reduce((a, r) => a + moroso(r), 0)

const stripCode = (s: string) => titleCase(s.replace(/^\d+\s*-?\s*/, '')) || 'Sin dato'

/* ================================================================== */
/* Componente principal                                                */
/* ================================================================== */

export function GerenciaCarteraReport({ sheet }: { sheet: GerenciaCarteraSheet }) {
  const [view, setView] = useState('resumen')
  const [bod, setBod] = useState('ALL')
  const [zona, setZona] = useState('ALL')
  const [cob, setCob] = useState('ALL')
  const [tc, setTc] = useState('ALL')

  // La deuda vigente excluye recibos de caja y notas (aplicaciones, no deuda)
  const debt = useMemo(() => sheet.rows.filter((r) => r.sec !== 'ajuste'), [sheet.rows])

  const bodegas = useMemo(() => aggBy(debt, (r) => r.bod, shortLabel).sort((a, b) => a.label.localeCompare(b.label)), [debt])
  const bodShort = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of bodegas) counts.set(b.short, (counts.get(b.short) ?? 0) + 1)
    const m = new Map<string, string>()
    for (const b of bodegas) {
      m.set(b.label, (counts.get(b.short) ?? 0) > 1 ? `${b.label.match(/^\d+/)?.[0] ?? ''} ${b.short}`.trim() : b.short)
    }
    return m
  }, [bodegas])
  const zonas = useMemo(() => [...new Set(debt.map((r) => r.zona))].sort(), [debt])
  const cobradores = useMemo(() => [...new Set(debt.map((r) => r.cob))].sort(), [debt])
  const tCarteras = useMemo(() => [...new Set(debt.map((r) => r.tc))].sort(), [debt])

  const rows = useMemo(
    () =>
      debt.filter(
        (r) =>
          (bod === 'ALL' || r.bod === bod) &&
          (zona === 'ALL' || r.zona === zona) &&
          (cob === 'ALL' || r.cob === cob) &&
          (tc === 'ALL' || r.tc === tc),
      ),
    [debt, bod, zona, cob, tc],
  )

  const pills = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'analizada', label: 'Cartera analizada' },
    { id: 'financieras', label: 'Financieras' },
    { id: 'segmentos', label: 'Segmentos' },
    { id: 'comparativos', label: 'Comparativos' },
    { id: 'detalle', label: 'Detalle' },
  ]
  const nCuotas = rows.reduce((a, r) => a + r.n, 0)

  return (
    <div className="flex flex-col gap-4">
      <PillNav items={pills} active={view} onChange={setView} />
      <ReportBand
        title="INFORME DE CARTERA — SUMOTO S.A."
        info={`${fmtInt(nCuotas)} cuotas · saldo_capital con envejecimiento (sin vencer + mora)`}
        badge={sheet.periodo ? `Cierre ${sheet.periodo}` : 'Cierre de mes'}
      />

      <div className="no-print flex flex-wrap items-end gap-3">
        <FilterField label="Bodega / sede" value={bod} onChange={setBod} options={[{ value: 'ALL', label: 'Todas' }, ...bodegas.map((b) => ({ value: b.label, label: bodShort.get(b.label) ?? b.short }))]} />
        <FilterField label="Zona de cartera" value={zona} onChange={setZona} options={[{ value: 'ALL', label: 'Todas' }, ...zonas.map((z) => ({ value: z, label: stripCode(z) }))]} />
        <FilterField label="Cobrador" value={cob} onChange={setCob} options={[{ value: 'ALL', label: 'Todos' }, ...cobradores.map((x) => ({ value: x, label: stripCode(x) }))]} />
        <FilterField label="Tipo de cartera" value={tc} onChange={setTc} options={[{ value: 'ALL', label: 'Todas' }, ...tCarteras.map((x) => ({ value: x, label: stripCode(x) }))]} />
      </div>

      {view === 'resumen' && <ResumenView rows={rows} />}
      {view === 'analizada' && <AnalizadaView rows={rows.filter((r) => r.sec === 'analizada')} />}
      {view === 'financieras' && <FinancierasView rows={rows} />}
      {view === 'segmentos' && <SegmentosView rows={rows} segTops={sheet.segTops} cob={cob} tc={tc} bod={bod} />}
      {view === 'comparativos' && <ComparativosView sheet={sheet} />}
      {view === 'detalle' && <DetalleView rows={rows} topDocs={sheet.topDocs} />}

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
/* Tabla de envejecimiento reutilizable                                */
/* ================================================================== */

const agingCols = (totalSal: number, max: number): EnvTableCol<GAgg>[] => [
  { key: 'd', header: 'Dimensión', render: (r) => <span className="font-medium text-ink" title={r.label}>{r.short}</span>, width: '24%' },
  { key: 'n', header: 'Cuotas', align: 'right', muted: true, render: (r) => fmtInt(r.n) },
  { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.sal)}</span> },
  { key: 'v', header: 'Sin vencer', align: 'right', muted: true, render: (r) => fmtCOP(r.sv) },
  { key: 'm', header: 'Moroso', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.mor)}</span> },
  { key: 'pm', header: '% mora', align: 'right', render: (r) => <span className={r.sal > 0 && r.mor / r.sal > 0.5 ? 'font-semibold text-[#D85A30]' : ''}>{r.sal ? fmtPct(r.mor / r.sal) : '—'}</span> },
  { key: 'p', header: 'Part. %', align: 'right', muted: true, render: (r) => fmtPct(totalSal ? r.sal / totalSal : 0) },
  { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={r.sal} max={max} /> },
]

function AgingCard({ rows }: { rows: GCRow[] }) {
  const a = newAgg('total')
  for (const r of rows) addTo(a, r)
  return (
    <EnvCard title="Envejecimiento del saldo — sin vencer y rangos de mora">
      <BarPair labels={AGING_LABELS} prev={null} cur={[a.sv, ...a.b]} prevLabel={null} curLabel="Saldo" color={AGING_LABELS.map((_, i) => (i === 0 ? '#1D9E75' : i <= 2 ? '#BA7517' : '#D85A30'))} format={money} />
    </EnvCard>
  )
}

/* ================================================================== */
/* Vista: Resumen                                                      */
/* ================================================================== */

function ResumenView({ rows }: { rows: GCRow[] }) {
  const analizada = rows.filter((r) => r.sec === 'analizada')
  const fin = rows.filter((r) => r.sec === 'fin')
  const cont = rows.filter((r) => r.sec === 'cont')
  const contab = rows.filter((r) => r.sec === 'contab')
  const saldo = tot(rows)
  const morosoTotal = mor(rows)

  const porSec = [
    { label: SEC_LABEL.analizada, v: tot(analizada), c: SEC_COLOR.analizada },
    { label: SEC_LABEL.fin, v: tot(fin), c: SEC_COLOR.fin },
    { label: SEC_LABEL.cont, v: tot(cont), c: SEC_COLOR.cont },
    { label: SEC_LABEL.contab, v: tot(contab), c: SEC_COLOR.contab },
  ]
  const porTC = useMemo(() => aggBy(rows, (r) => r.tc, stripCode).sort((a, b) => b.sal - a.sal), [rows])
  const porClase = useMemo(() => aggBy(rows, (r) => claseDocOf(r)).sort((a, b) => b.sal - a.sal), [rows])
  const porZona = useMemo(() => aggBy(rows, (r) => r.zona, stripCode).sort((a, b) => b.sal - a.sal), [rows])
  const maxTC = Math.max(...porTC.map((x) => x.sal), 0)

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay registros con los filtros actuales.</p>

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Saldo cartera vigente" value={money(saldo)} note={`${fmtInt(rows.reduce((a, r) => a + r.n, 0))} cuotas (sin recibos ni notas)`} />
        <KpiStripe tone="green" label="Cartera analizada" value={money(tot(analizada))} note="Universo de las tablas dinámicas" />
        <KpiStripe tone="amber" label="Moroso" value={money(morosoTotal)} note={`${fmtPct(saldo ? morosoTotal / saldo : 0)} del saldo vigente`} />
        <KpiStripe tone="coral" label="Financieras + contados" value={money(tot(fin) + tot(cont) + tot(contab))} note="Desembolsos, contados e iniciales y contabilidad" />
      </KpiRow>
      <Row2>
        <AgingCard rows={rows} />
        <EnvCard title="Composición del saldo por sección">
          <DonutLegend labels={porSec.map((x) => x.label)} values={porSec.map((x) => x.v)} colors={porSec.map((x) => x.c)} format={money} />
        </EnvCard>
      </Row2>
      <Row2>
        <EnvCard title="Saldo por tipo de cartera">
          <BarPair labels={porTC.map((x) => x.short)} fullLabels={porTC.map((x) => x.label)} prev={null} cur={porTC.map((x) => x.sal)} prevLabel={null} curLabel="Saldo" color={porTC.map((x) => colorTC(x.label))} format={money} />
        </EnvCard>
        <EnvCard title="Composición por grupo de documento">
          <DonutLegend labels={porClase.slice(0, 10).map((x) => x.short)} values={porClase.slice(0, 10).map((x) => x.sal)} colors={PALETA_TIENDAS} format={money} />
        </EnvCard>
      </Row2>
      <EnvTable
        rows={porTC}
        cols={agingCols(totAgg(porTC), maxTC)}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(rows.reduce((a, r) => a + r.n, 0)), fmtCOP(saldo), fmtCOP(rows.reduce((a, r) => a + r.sv, 0)), fmtCOP(morosoTotal), saldo ? fmtPct(morosoTotal / saldo) : '—', '100 %', '']}
      />
      <EnvTable
        rows={porZona.slice(0, 20)}
        cols={agingCols(totAgg(porZona), Math.max(...porZona.map((x) => x.sal), 0))}
        rowKey={(r) => r.label}
        foot={porZona.length > 20 ? `* Se muestran las 20 zonas con más saldo de ${fmtInt(porZona.length)}.` : undefined}
      />
    </>
  )
}

/* ================================================================== */
/* Vista: Cartera analizada                                            */
/* ================================================================== */

function AnalizadaView({ rows }: { rows: GCRow[] }) {
  const saldo = tot(rows)
  const morosoTotal = mor(rows)
  const sinVencer = rows.reduce((a, r) => a + r.sv, 0)
  const porCpf = useMemo(() => aggBy(rows, (r) => finLabelOf(r)).sort((a, b) => b.sal - a.sal), [rows])
  const porTC = useMemo(() => aggBy(rows, (r) => r.tc, stripCode).sort((a, b) => b.sal - a.sal), [rows])
  const porCob = useMemo(() => aggBy(rows, (r) => r.cob, stripCode).sort((a, b) => b.sal - a.sal), [rows])
  const porZona = useMemo(() => aggBy(rows, (r) => r.zona, stripCode).sort((a, b) => b.sal - a.sal), [rows])

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay cartera analizada con los filtros actuales.</p>

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Saldo analizado" value={money(saldo)} note={`${fmtInt(rows.reduce((a, r) => a + r.n, 0))} cuotas`} />
        <KpiStripe tone="green" label="Sin vencer" value={money(sinVencer)} note={saldo ? fmtPct(sinVencer / saldo) : ''} />
        <KpiStripe tone="amber" label="Moroso" value={money(morosoTotal)} note={saldo ? fmtPct(morosoTotal / saldo) : ''} />
        <KpiStripe tone="coral" label="% morosidad" value={saldo ? fmtPct(morosoTotal / saldo) : '—'} note="Moroso ÷ saldo analizado" />
      </KpiRow>
      <Row2>
        <AgingCard rows={rows} />
        <EnvCard title="Saldo por grupo financiero (Cartera por financiera)">
          <DonutLegend labels={porCpf.map((x) => x.short)} values={porCpf.map((x) => x.sal)} colors={PALETA_TIENDAS} format={money} />
        </EnvCard>
      </Row2>
      <Row2>
        <EnvCard title="Saldo por cobrador (top 10)">
          <BarPair labels={porCob.slice(0, 10).map((x) => x.short)} fullLabels={porCob.slice(0, 10).map((x) => x.label)} prev={null} cur={porCob.slice(0, 10).map((x) => x.sal)} prevLabel={null} curLabel="Saldo" color="#378ADD" format={money} horizontal height={260} />
        </EnvCard>
        <EnvCard title="Moroso por tipo de cartera">
          <BarPair labels={porTC.map((x) => x.short)} prev={null} cur={porTC.map((x) => x.mor)} prevLabel={null} curLabel="Moroso" color={porTC.map((x) => colorTC(x.label))} format={money} />
        </EnvCard>
      </Row2>
      <EnvTable
        rows={porCob.slice(0, 20)}
        cols={agingCols(totAgg(porCob), Math.max(...porCob.map((x) => x.sal), 0))}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(rows.reduce((a, r) => a + r.n, 0)), fmtCOP(saldo), fmtCOP(sinVencer), fmtCOP(morosoTotal), saldo ? fmtPct(morosoTotal / saldo) : '—', '100 %', '']}
        foot={porCob.length > 20 ? `* Se muestran los 20 cobradores con más saldo de ${fmtInt(porCob.length)}.` : undefined}
      />
      <EnvTable
        rows={porZona}
        cols={agingCols(totAgg(porZona), Math.max(...porZona.map((x) => x.sal), 0))}
        rowKey={(r) => r.label}
      />
    </>
  )
}

/* ================================================================== */
/* Vista: Financieras                                                  */
/* ================================================================== */

function finLabelOf(r: GCRow): string {
  if (r.sec === 'cont') return 'Contados e iniciales'
  if (r.sec === 'contab') return 'Contabilidad'
  if (r.sec === 'ajuste') return 'Ajustes'
  return gcFinanciera(r.t2, r.cpf)
}

function claseDocOf(r: GCRow): string {
  if (r.sec === 'cont') return 'Contados e iniciales'
  if (r.sec === 'contab') return 'Contabilidad'
  return gcClaseDoc(r.t2)
}

const FIN_COLORS = ['#378ADD', '#1D9E75', '#BA7517', '#D85A30', '#7F77DD', '#0F6E56', '#993C1D', '#2e3d7a', '#639922', '#5F5E5A', '#888780', '#185FA5', '#B5D4F4']

function FinancierasView({ rows }: { rows: GCRow[] }) {
  const porFin = useMemo(() => aggBy(rows, finLabelOf).sort((a, b) => b.sal - a.sal), [rows])
  const saldo = tot(rows)
  const morosoTotal = mor(rows)
  const directas = rows.filter((r) => r.sec === 'fin').reduce((a, r) => a + r.sal, 0)
  const avalada = rows.filter((r) => /avalada/i.test(finLabelOf(r))).reduce((a, r) => a + r.sal, 0)
  const propia = rows.filter((r) => r.sec === 'analizada').reduce((a, r) => a + r.sal, 0) - avalada

  const cols: EnvTableCol<GAgg>[] = [
    { key: 'f', header: 'Financiera / grupo', render: (r) => <span className="font-medium text-ink">{r.short}</span>, width: '26%' },
    { key: 'n', header: 'Cuotas', align: 'right', muted: true, render: (r) => fmtInt(r.n) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.sal)}</span> },
    { key: 'v', header: 'Sin vencer', align: 'right', muted: true, render: (r) => fmtCOP(r.sv) },
    { key: 'm', header: 'Moroso', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.mor)}</span> },
    { key: 'pm', header: '% mora', align: 'right', render: (r) => <span className={r.sal > 0 && r.mor / r.sal > 0.5 ? 'font-semibold text-[#D85A30]' : ''}>{r.sal ? fmtPct(r.mor / r.sal) : '—'}</span> },
    { key: 'p', header: 'Part. %', align: 'right', muted: true, render: (r) => fmtPct(saldo ? r.sal / saldo : 0) },
  ]

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay registros con los filtros actuales.</p>

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Desembolsos financieras" value={money(directas)} note="ZAD, ZK, ZD, ZE, ZG, ZH, ZS, ZC…" />
        <KpiStripe tone="green" label="Cartera avalada" value={money(avalada)} note="FG Inversiones · FJ Invermotos" />
        <KpiStripe tone="amber" label="Cartera propia y servicios" value={money(propia)} note="FPA, repuestos, seguros, traslados" />
        <KpiStripe tone="coral" label="Moroso total" value={money(morosoTotal)} note={saldo ? `${fmtPct(morosoTotal / saldo)} del saldo` : ''} />
      </KpiRow>
      <Row2>
        <EnvCard title="Saldo por financiera o grupo">
          <BarPair labels={porFin.slice(0, 12).map((x) => x.short)} fullLabels={porFin.slice(0, 12).map((x) => x.label)} prev={null} cur={porFin.slice(0, 12).map((x) => x.sal)} prevLabel={null} curLabel="Saldo" color={FIN_COLORS} format={money} horizontal height={Math.max(220, Math.min(porFin.length, 12) * 26 + 40)} />
        </EnvCard>
        <EnvCard title="Participación por financiera o grupo">
          <DonutLegend labels={porFin.slice(0, 12).map((x) => x.short)} values={porFin.slice(0, 12).map((x) => x.sal)} colors={FIN_COLORS} format={money} />
        </EnvCard>
      </Row2>
      <EnvTable
        rows={porFin}
        cols={cols}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(rows.reduce((a, r) => a + r.n, 0)), fmtCOP(saldo), fmtCOP(rows.reduce((a, r) => a + r.sv, 0)), fmtCOP(morosoTotal), saldo ? fmtPct(morosoTotal / saldo) : '—', '100 %']}
      />
    </>
  )
}

/* ================================================================== */
/* Vista: Segmentos (saldo moroso por responsable: Ana / Contabilidad /  */
/* Cajeras, según el código del Tipo 2 — SEGMENTOS_CARTERA en negocio)  */
/* ================================================================== */

/** Agregado por tipo de documento dentro de un segmento. */
interface SegTipoRow {
  t2: string
  n: number
  mor: number
  b: number[]
}

const t2Code = (t2: string) => gcCodigo(t2).toUpperCase() || t2.slice(0, 12)

function SegmentosView({ rows, segTops, cob, tc, bod }: { rows: GCRow[]; segTops: GCSegTop[]; cob: string; tc: string; bod: string }) {
  // Los segmentos dividen la cartera ANALIZADA (desembolsos, contados y
  // contabilidad son otras secciones del informe; recibos/notas van aparte).
  const analizada = useMemo(() => rows.filter((r) => r.sec === 'analizada'), [rows])

  const porSeg = useMemo(() => {
    const m = new Map<string, GAgg>()
    for (const s of SEGMENTOS_CARTERA) m.set(s.id, newAgg(s.nombre))
    m.set(SEG_SIN_ASIGNAR.id, newAgg(SEG_SIN_ASIGNAR.nombre))
    for (const r of analizada) addTo(m.get(gcSegmento(r.t2))!, r)
    return m
  }, [analizada])

  const porTipo = useMemo(() => {
    const m = new Map<string, SegTipoRow>()
    for (const r of analizada) {
      const cur = m.get(r.t2) ?? { t2: r.t2, n: 0, mor: 0, b: [0, 0, 0, 0, 0, 0, 0] }
      cur.n += r.n
      for (let i = 0; i < 7; i++) {
        cur.b[i]! += r.b[i]!
        cur.mor += r.b[i]!
      }
      m.set(r.t2, cur)
    }
    return [...m.values()].sort((a, b) => b.mor - a.mor)
  }, [analizada])

  const morTotal = analizada.reduce((a, r) => a + moroso(r), 0)
  const saldo = tot(analizada)
  const asignado = SEGMENTOS_CARTERA.reduce((a, s) => a + porSeg.get(s.id)!.mor, 0)
  const sinAsignar = porSeg.get(SEG_SIN_ASIGNAR.id)!

  const segDocs = (segId: string) =>
    segTops
      .filter((g) => g.seg === segId && (cob === 'ALL' || g.cob === cob))
      .flatMap((g) => g.docs)
      .filter((d) => (tc === 'ALL' || d.tc === tc) && (bod === 'ALL' || d.bod === bod))
      .sort((a, b) => b.moroso - a.moroso)
      .slice(0, 8)

  const sinAsignarTipos = porTipo.filter((t) => gcSegmento(t.t2) === 'otros' && t.mor > 0.5)
  const tiposChart = porTipo.filter((t) => t.mor > 0.5).slice(0, 16)

  if (!analizada.length) return <p className="text-sm text-muted-foreground">No hay cartera analizada con los filtros actuales.</p>

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Moroso total" value={money(morTotal)} note={`${fmtPct(saldo ? morTotal / saldo : 0)} del saldo analizado filtrado`} />
        {SEGMENTOS_CARTERA.map((s) => {
          const a = porSeg.get(s.id)!
          return <KpiStripe key={s.id} tone={s.id === 'A' ? 'green' : s.id === 'B' ? 'amber' : 'coral'} label={`${s.id} · ${s.nombre}`} value={money(a.mor)} note={`${fmtPct(morTotal ? a.mor / morTotal : 0)} del moroso · ${fmtInt(a.n)} cuotas`} />
        })}
      </KpiRow>

      <div className="rounded-xl border border-[#E8C547]/50 bg-[#FFFBEB] px-4 py-3 text-[12px] leading-relaxed text-[#633C00]">
        <b>Control de calidad:</b> A + B + C = <b>{fmtCOP(asignado)}</b> ({fmtPct(morTotal ? asignado / morTotal : 0)} del moroso)
        y quedan <b>{fmtCOP(sinAsignar.mor)}</b> ({fmtPct(morTotal ? sinAsignar.mor / morTotal : 0)}) sin asignar a segmento — ver
        la tabla al final. La suma cuadra exactamente con el moroso de la cartera analizada del filtro.
        {cob === 'ALL' && ' Sugerencia: filtra Cobrador = “Aux Cartera 1” y Tipo de cartera = “Corriente” para el informe del grupo 15.'}
      </div>

      <Row2>
        <EnvCard title="Participación del moroso por segmento">
          <DonutLegend
            labels={[...SEGMENTOS_CARTERA.map((s) => `${s.id} · ${s.nombre}`), SEG_SIN_ASIGNAR.nombre]}
            values={[...SEGMENTOS_CARTERA.map((s) => porSeg.get(s.id)!.mor), sinAsignar.mor]}
            colors={[...SEGMENTOS_CARTERA.map((s) => s.color), SEG_SIN_ASIGNAR.color]}
            format={money}
          />
        </EnvCard>
        <EnvCard title="Moroso por tipo de documento (color = segmento)">
          <BarPair
            labels={tiposChart.map((t) => t2Code(t.t2))}
            fullLabels={tiposChart.map((t) => t.t2)}
            prev={null}
            cur={tiposChart.map((t) => t.mor)}
            prevLabel={null}
            curLabel="Moroso"
            color={tiposChart.map((t) => SEGMENTOS_CARTERA.find((s) => s.id === gcSegmento(t.t2))?.color ?? SEG_SIN_ASIGNAR.color)}
            format={money}
            horizontal
            height={Math.max(240, tiposChart.length * 24 + 40)}
          />
        </EnvCard>
      </Row2>

      {SEGMENTOS_CARTERA.map((s) => (
        <SegmentoSeccion key={s.id} seg={s} agg={porSeg.get(s.id)!} tipos={porTipo.filter((t) => gcSegmento(t.t2) === s.id)} docs={segDocs(s.id)} total={morTotal} />
      ))}

      <EnvCard title="Sin asignar — tipos de documento fuera de los tres segmentos">
        <EnvTable
          rows={sinAsignarTipos}
          cols={[
            { key: 't', header: 'Tipo de documento', render: (r: SegTipoRow) => <span className="font-medium text-ink">{titleCase(r.t2)}</span>, width: '34%' },
            { key: 'n', header: 'Cuotas', align: 'right', muted: true, render: (r: SegTipoRow) => fmtInt(r.n) },
            { key: 'm', header: 'Moroso', align: 'right', render: (r: SegTipoRow) => <span className="font-semibold">{fmtCOP(r.mor)}</span> },
            { key: 'p', header: '% del moroso', align: 'right', muted: true, render: (r: SegTipoRow) => fmtPct(morTotal ? r.mor / morTotal : 0) },
            { key: 's', header: 'Adscripción sugerida', muted: true, render: (r: SegTipoRow) => SUGERENCIA_SEGMENTO[gcCodigo(r.t2)] ?? 'Por definir' },
          ]}
          rowKey={(r) => r.t2}
          foot="Para mover un tipo a un segmento, agrega su código a SEGMENTOS_CARTERA en src/config/negocio.ts."
        />
      </EnvCard>
    </>
  )
}

function SegmentoSeccion({ seg, agg, tipos, docs, total }: { seg: (typeof SEGMENTOS_CARTERA)[number]; agg: GAgg; tipos: SegTipoRow[]; docs: GCTopDoc[]; total: number }) {
  const tipoCols: EnvTableCol<SegTipoRow>[] = [
    { key: 't', header: 'Tipo de documento', render: (r) => <span className="font-medium text-ink" title={r.t2}>{titleCase(r.t2)}</span>, width: '40%' },
    { key: 'n', header: 'Cuotas', align: 'right', muted: true, render: (r) => fmtInt(r.n) },
    { key: 'm', header: 'Moroso', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.mor)}</span> },
    { key: 'p', header: '% del segmento', align: 'right', muted: true, render: (r) => fmtPct(agg.mor ? r.mor / agg.mor : 0) },
  ]
  const docCols: EnvTableCol<GCTopDoc>[] = [
    { key: 'c', header: 'Cliente', render: (r) => <span className="font-medium text-ink">{titleCase(r.cliente)}</span>, width: '46%' },
    { key: 't', header: 'Documento', muted: true, render: (r) => t2Code(r.t2) },
    { key: 'm', header: 'Moroso', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.moroso)}</span> },
    { key: 'p', header: '% seg.', align: 'right', muted: true, render: (r) => fmtPct(agg.mor ? r.moroso / agg.mor : 0) },
  ]
  const t0 = tipos[0]
  const nota = [
    t0 ? `${t2Code(t0.t2)} concentra ${fmtPct(agg.mor ? t0.mor / agg.mor : 0)} del segmento` : '',
    `mora reciente 1–30 días: ${fmtPct(agg.mor ? agg.b[0]! / agg.mor : 0)}`,
    `mora +360 días: ${fmtPct(agg.mor ? agg.b[6]! / agg.mor : 0)}`,
    docs.length ? `mayor deudor: ${titleCase(docs[0]!.cliente)} (${fmtCOP(docs[0]!.moroso)})` : '',
  ].filter(Boolean).join(' · ') + '.'

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-2 px-1">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: seg.color }} />
        <h3 className="text-[14px] font-semibold text-ink">Segmento {seg.id} — {seg.nombre}</h3>
        <span className="text-[11.5px] text-muted-foreground">Tipos: {seg.detalle}</span>
        <span className="ml-auto text-[11.5px] tabular text-muted-foreground">
          {fmtCOP(agg.mor)} · {fmtPct(total ? agg.mor / total : 0)} del moroso · {fmtInt(agg.n)} cuotas
        </span>
      </div>
      <Row2>
        <EnvTable rows={tipos} cols={tipoCols} rowKey={(r) => r.t2} footer={['Total segmento', fmtInt(agg.n), fmtCOP(agg.mor), '100 %']} />
        <EnvTable rows={docs} cols={docCols} rowKey={(r) => `${r.nit}-${r.t2}`} foot={docs.length ? undefined : 'Sin deudores morosos en este segmento con los filtros actuales.'} />
      </Row2>
      <Row2>
        <EnvCard title={`Envejecimiento del moroso — ${seg.nombre}`}>
          <BarPair labels={RANGOS} prev={null} cur={agg.b} prevLabel={null} curLabel="Moroso" color={seg.color} format={money} height={170} />
        </EnvCard>
        <EnvCard title="Lectura rápida">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{nota}</p>
        </EnvCard>
      </Row2>
    </section>
  )
}

/* ================================================================== */
/* Vista: Comparativos                                                 */
/* ================================================================== */

function ComparativoCard({ bloque, color }: { bloque: GCBloque; color: string }) {
  const [prev, cur] = bloque.periodos.length === 1 ? [null, bloque.periodos[0]!] : [bloque.periodos[0]!, bloque.periodos[bloque.periodos.length - 1]!]
  const cats = ['Saldo', 'Sin vencer', 'Moroso', ...RANGOS]
  const vals = (p: typeof cur | null) => (p ? [p.saldo, p.sv, p.moroso, ...p.b] : cats.map(() => null))
  return (
    <>
      <Row2>
        <EnvCard title={`${bloque.title}: saldo y moroso`} legend={prev ? [{ label: prev.label, color: '#B5D4F4' }, { label: cur.label, color }] : undefined}>
          <BarPair labels={cats.slice(0, 3)} prev={prev ? vals(prev).slice(0, 3) : null} cur={vals(cur).slice(0, 3)} prevLabel={prev?.label ?? null} curLabel={cur.label} color={color} format={money} height={190} />
        </EnvCard>
        <EnvCard title={`${bloque.title}: variación por rango de mora`}>
          {prev ? (
            <VarBars labels={cats.slice(2)} cur={vals(cur).slice(2)} prev={vals(prev).slice(2)} prevLabel={prev.label} curLabel={cur.label} format={money} />
          ) : (
            <BarPair labels={cats.slice(2)} prev={null} cur={vals(cur).slice(2)} prevLabel={null} curLabel={cur.label} color={color} format={money} />
          )}
        </EnvCard>
      </Row2>
      <EnvTable
        rows={[{ label: 'Saldo', a: prev?.saldo ?? null, b: cur.saldo }, { label: 'Sin vencer', a: prev?.sv ?? null, b: cur.sv }, { label: 'Moroso', a: prev?.moroso ?? null, b: cur.moroso }, ...RANGOS.map((r, i) => ({ label: r, a: prev?.b[i] ?? null, b: cur.b[i] ?? 0 }))]}
        cols={[
          { key: 'c', header: 'Concepto', render: (r) => <span className="font-medium text-ink">{r.label}</span>, width: '22%' },
          { key: 'p', header: prev?.label ?? 'Anterior', align: 'right', muted: true, render: (r) => fmtCOP(r.a) },
          { key: 'a', header: cur.label, align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.b)}</span> },
          { key: 'd', header: 'Diferencia', align: 'right', muted: true, render: (r) => (r.a == null ? '—' : fmtCOP(r.b - r.a)) },
          { key: 'v', header: 'Var. %', align: 'right', render: (r) => <VarPill value={r.a == null ? null : varOf(r.b, r.a)} /> },
        ]}
        rowKey={(r) => r.label}
      />
    </>
  )
}

function ComparativosView({ sheet }: { sheet: GerenciaCarteraSheet }) {
  const [bm, setBm] = useState(0)
  const [ba, setBa] = useState(0)
  const bloqueM = sheet.mensual[Math.min(bm, sheet.mensual.length - 1)]
  const bloqueA = sheet.anual[Math.min(ba, sheet.anual.length - 1)]
  if (!sheet.mensual.length && !sheet.anual.length) return <p className="text-sm text-muted-foreground">El libro no trae hojas comparativas.</p>
  return (
    <>
      {sheet.mensual.length > 0 && bloqueM && (
        <section className="flex flex-col gap-3">
          <div className="no-print flex flex-wrap items-end gap-3">
            <FilterField
              label="Comparativo mensual"
              value={String(Math.min(bm, sheet.mensual.length - 1))}
              onChange={(v) => setBm(Number(v))}
              options={sheet.mensual.map((b, i) => ({ value: String(i), label: b.title }))}
            />
          </div>
          <CompKpis bloque={bloqueM} />
          <ComparativoCard bloque={bloqueM} color="#378ADD" />
        </section>
      )}
      {sheet.anual.length > 0 && bloqueA && (
        <section className="flex flex-col gap-3">
          <div className="no-print flex flex-wrap items-end gap-3">
            <FilterField
              label="Comparativo anual"
              value={String(Math.min(ba, sheet.anual.length - 1))}
              onChange={(v) => setBa(Number(v))}
              options={sheet.anual.map((b, i) => ({ value: String(i), label: b.title }))}
            />
          </div>
          <CompKpis bloque={bloqueA} />
          <ComparativoCard bloque={bloqueA} color="#1D9E75" />
        </section>
      )}
    </>
  )
}

function CompKpis({ bloque }: { bloque: GCBloque }) {
  const [prev, cur] = bloque.periodos.length === 1 ? [null, bloque.periodos[0]!] : [bloque.periodos[0]!, bloque.periodos[bloque.periodos.length - 1]!]
  return (
    <KpiRow>
      <KpiStripe tone="blue" label={`Saldo ${cur.label}`} value={money(cur.saldo)} delta={prev ? variation(cur.saldo, prev.saldo) : null} note={prev ? `vs ${prev.label}` : ''} />
      <KpiStripe tone="amber" label={`Moroso ${cur.label}`} value={money(cur.moroso)} delta={prev ? variation(cur.moroso, prev.moroso) : null} note={cur.saldo ? `${fmtPct(cur.moroso / cur.saldo)} del saldo` : ''} />
      <KpiStripe tone="green" label="% morosidad" value={cur.morosidad != null ? fmtPct(cur.morosidad) : '—'} note={prev?.morosidad != null ? `vs ${fmtPct(prev.morosidad)} en ${prev.label}` : ''} />
      <KpiStripe tone="coral" label="Sin vencer" value={money(cur.sv)} delta={prev ? variation(cur.sv, prev.sv) : null} note={cur.saldo ? `${fmtPct(cur.sv / cur.saldo)} del saldo` : ''} />
    </KpiRow>
  )
}

/* ================================================================== */
/* Vista: Detalle                                                      */
/* ================================================================== */

function DetalleView({ rows, topDocs }: { rows: GCRow[]; topDocs: GCTopDoc[] }) {
  const porBod = useMemo(() => aggBy(rows, (r) => r.bod).sort((a, b) => b.sal - a.sal), [rows])
  const bodShort = useMemo(() => {
    const counts = new Map<string, number>()
    for (const b of porBod) counts.set(shortLabel(b.label), (counts.get(shortLabel(b.label)) ?? 0) + 1)
    const m = new Map<string, string>()
    for (const b of porBod) {
      const s = shortLabel(b.label)
      m.set(b.label, (counts.get(s) ?? 0) > 1 ? `${b.label.match(/^\d+/)?.[0] ?? ''} ${s}`.trim() : s)
    }
    return m
  }, [porBod])
  for (const b of porBod) b.short = bodShort.get(b.label) ?? b.short
  const saldo = tot(rows)
  const morosoTotal = mor(rows)

  const docCols: EnvTableCol<GCTopDoc>[] = [
    { key: 'c', header: 'Cliente', render: (r) => <span className="font-medium text-ink">{titleCase(r.cliente)}</span>, width: '26%' },
    { key: 'n', header: 'NIT', muted: true, render: (r) => r.nit || '—' },
    { key: 't', header: 'Documento', muted: true, render: (r) => titleCase(r.t2.split('-').pop() ?? r.t2) },
    { key: 'tc', header: 'Tipo cartera', muted: true, render: (r) => stripCode(r.tc) },
    { key: 'cb', header: 'Cobrador', muted: true, render: (r) => stripCode(r.cob) },
    { key: 'b', header: 'Bodega', muted: true, render: (r) => bodShort.get(r.bod) ?? shortLabel(r.bod) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.sal)}</span> },
    { key: 'm', header: 'Moroso', align: 'right', muted: true, render: (r) => fmtCOP(r.moroso) },
  ]

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay registros con los filtros actuales.</p>

  return (
    <>
      <EnvTable
        rows={porBod}
        cols={agingCols(totAgg(porBod), Math.max(...porBod.map((x) => x.sal), 0))}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(rows.reduce((a, r) => a + r.n, 0)), fmtCOP(saldo), fmtCOP(rows.reduce((a, r) => a + r.sv, 0)), fmtCOP(morosoTotal), saldo ? fmtPct(morosoTotal / saldo) : '—', '100 %', '']}
      />
      <EnvTable
        rows={topDocs}
        cols={docCols}
        rowKey={(r) => `${r.nit}-${r.t2}`}
        foot={`* Los ${topDocs.length} documentos de mayor saldo de la cartera vigente (sin recibos ni notas).`}
      />
    </>
  )
}
