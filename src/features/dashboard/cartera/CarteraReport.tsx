/**
 * Tablero del corte de cartera ("TODO CORTE …") con el maquetado del reporte de gerencia:
 * pastillas de vista, banda con logo, KPIs con franja de color, barras + dona y tablas.
 *
 * Responde a las preguntas de cartera:
 *  - Saldos de motos (MT) y de repuestos (RP): total, por bodega/sede y por asesor.
 *  - Negocios de la campaña YO SOY: cuántos quedaron y por qué valor.
 *  - Saldos por financiera: ADDI, BRILLA, CREDIORBE, FINAMIGA, INVERSIONES, PROGRESER, SISTECREDITO.
 *
 * Los filtros (bodega, asesor) aplican a todas las vistas.
 */
import { useMemo, useState } from 'react'
import type { CarteraRow, CarteraSheet } from '@/types/report'
import { FINANCIERAS } from '@/parser/carteraParser'
import { FilterField } from '../blocks'
import { EnvCard, EnvTable, KpiRow, KpiStripe, PillNav, ReportBand, Row2, TrendBar, type EnvTableCol } from '../env/EnvBlocks'
import { BarPair, DonutLegend } from '../env/EnvCharts'
import { fmtCOP, fmtCOPCompact, fmtInt, fmtPct, monthLong, shortLabel } from '@/lib/format'
import { PALETA_TIENDAS } from '@/config/negocio'

const PROPIA = 'Cartera propia / otras'
const money = (v: number) => fmtCOPCompact(v)
const day = (ms: number | null) => (ms == null ? '—' : new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(ms)))

interface Agg {
  label: string
  short: string
  n: number
  saldo: number
}

function agg(rows: CarteraRow[], key: 'bodega' | 'vendedor'): Agg[] {
  const m = new Map<string, Agg>()
  for (const r of rows) {
    const cur = m.get(r[key]) ?? { label: r[key], short: key === 'bodega' ? shortLabel(r[key]) : r[key], n: 0, saldo: 0 }
    cur.n++
    cur.saldo += r.saldo
    m.set(r[key], cur)
  }
  const out = [...m.values()].sort((a, b) => b.saldo - a.saldo)
  // Bodegas distintas pueden compartir nombre corto ("Repuestos Principal" y "Taller Principal" → "Principal"):
  // se les antepone el código de bodega para diferenciarlas.
  const counts = new Map<string, number>()
  for (const x of out) counts.set(x.short, (counts.get(x.short) ?? 0) + 1)
  for (const x of out) {
    if ((counts.get(x.short) ?? 0) > 1) x.short = `${x.label.match(/^\d+/)?.[0] ?? x.label.slice(0, 4)} ${x.short}`
  }
  return out
}

/** "TODO CORTE 03 NOV 2026 CIERRE.xlsx" → "Corte a 3 de noviembre de 2026" (si el nombre lo permite). */
function corteOf(fileName: string): string {
  const m = fileName.match(/corte\s+(\d{1,2})\s+([a-záéíóú]+)\s+(\d{4})/i)
  if (!m) return 'Cierre de cartera'
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  const mi = months.findIndex((x) => m[2].toLowerCase().startsWith(x))
  return mi >= 0 ? `Corte a ${Number(m[1])} de ${monthLong(mi + 1).toLowerCase()} de ${m[3]}` : 'Cierre de cartera'
}

export function CarteraReport({ sheet }: { sheet: CarteraSheet }) {
  const [view, setView] = useState('general')
  const [bodega, setBodega] = useState('ALL')
  const [asesor, setAsesor] = useState('ALL')

  const bodegas = useMemo(() => [...new Set(sheet.rows.map((r) => r.bodega))].sort(), [sheet.rows])
  const asesores = useMemo(() => [...new Set(sheet.rows.map((r) => r.vendedor))].sort(), [sheet.rows])
  const filtered = useMemo(() => sheet.rows.filter((r) => (bodega === 'ALL' || r.bodega === bodega) && (asesor === 'ALL' || r.vendedor === asesor)), [sheet.rows, bodega, asesor])

  const motos = useMemo(() => filtered.filter((r) => r.grupo === 'MT'), [filtered])
  const repuestos = useMemo(() => filtered.filter((r) => r.grupo === 'RP'), [filtered])
  const yoSoy = useMemo(() => filtered.filter((r) => r.yoSoy), [filtered])

  const pills = [
    { id: 'general', label: 'Vista general' },
    { id: 'mt', label: 'Motos (MT)' },
    { id: 'rp', label: 'Repuestos (RP)' },
    { id: 'fin', label: 'Financieras' },
    { id: 'ys', label: 'YO SOY', accent: '#D85A30' },
  ]
  const activeView = pills.some((p) => p.id === view) ? view : 'general'
  const bandTitle: Record<string, string> = {
    general: 'Corte de cartera — Vista general',
    mt: 'Cartera de motos (MT)',
    rp: 'Cartera de repuestos (RP)',
    fin: 'Saldos por financiera',
    ys: 'Campaña YO SOY',
  }

  return (
    <div className="flex flex-col gap-4">
      <PillNav items={pills} active={activeView} onChange={setView} />
      <ReportBand title={bandTitle[activeView]} info={`${fmtInt(filtered.length)} documentos con saldo · ${sheet.fileName}`} badge={corteOf(sheet.fileName)} />

      {(bodegas.length > 1 || asesores.length > 1) && (
        <div className="no-print flex flex-wrap items-end gap-3">
          <FilterField label="Bodega / sede" value={bodega} onChange={setBodega} options={[{ value: 'ALL', label: 'Todas' }, ...bodegas.map((b) => ({ value: b, label: shortLabel(b) }))]} />
          <FilterField label="Asesor" value={asesor} onChange={setAsesor} options={[{ value: 'ALL', label: 'Todos' }, ...asesores.map((a) => ({ value: a, label: a }))]} />
        </div>
      )}

      {activeView === 'general' && <GeneralView rows={filtered} motos={motos} repuestos={repuestos} yoSoy={yoSoy} />}
      {activeView === 'mt' && <GrupoView title="Motos (MT)" rows={motos} />}
      {activeView === 'rp' && <GrupoView title="Repuestos (RP)" rows={repuestos} />}
      {activeView === 'fin' && <FinancierasView rows={filtered} />}
      {activeView === 'ys' && <YoSoyView rows={yoSoy} />}

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
/* Vista general                                                       */
/* ================================================================== */

function GeneralView({ rows, motos, repuestos, yoSoy }: { rows: CarteraRow[]; motos: CarteraRow[]; repuestos: CarteraRow[]; yoSoy: CarteraRow[] }) {
  const sum = (l: CarteraRow[]) => l.reduce((a, r) => a + r.saldo, 0)
  const total = sum(rows)
  const otros = rows.filter((r) => r.grupo === 'OTRO')
  const saldoYS = sum(yoSoy)
  const valorYS = yoSoy.reduce((a, r) => a + r.saldo + (r.aplicado ?? 0), 0)

  const fin = FINANCIERAS.map((f) => ({ label: f, n: rows.filter((r) => r.financiera === f).length, saldo: sum(rows.filter((r) => r.financiera === f)) }))
  const propia = rows.filter((r) => r.financiera === null)
  const finRows = [...fin, { label: PROPIA, n: propia.length, saldo: sum(propia) }]
  const maxFin = Math.max(...finRows.map((x) => x.saldo), 0)

  const grupos = [
    { label: 'Motos (MT)', saldo: sum(motos) },
    { label: 'Repuestos (RP)', saldo: sum(repuestos) },
    { label: 'Otras carteras', saldo: sum(otros) },
  ].filter((g) => g.saldo > 0)

  const finCols: EnvTableCol<{ label: string; n: number; saldo: number }>[] = [
    { key: 'f', header: 'Financiera', render: (r) => <span className="font-medium text-ink">{r.label}</span>, width: '36%' },
    { key: 'n', header: 'Documentos', align: 'right', muted: true, render: (r) => fmtInt(r.n) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.saldo)}</span> },
    { key: 'p', header: 'Part. %', align: 'right', muted: true, render: (r) => fmtPct(total ? r.saldo / total : 0) },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={r.saldo} max={maxFin} /> },
  ]

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Saldo total de cartera" value={money(total)} note={`${fmtInt(rows.length)} documentos`} />
        <KpiStripe tone="green" label="Motos (MT)" value={money(sum(motos))} note={`${fmtInt(motos.length)} documentos`} />
        <KpiStripe tone="amber" label="Repuestos (RP)" value={money(sum(repuestos))} note={`${fmtInt(repuestos.length)} documentos`} />
        <KpiStripe tone="coral" label="Negocios YO SOY" value={fmtInt(yoSoy.length)} note={`saldo ${money(saldoYS)} · valor ${money(valorYS)}`} />
      </KpiRow>

      <Row2>
        <EnvCard title="Saldo por financiera">
          <BarPair
            labels={finRows.map((x) => x.label)}
            prev={null}
            cur={finRows.map((x) => x.saldo)}
            prevLabel={null}
            curLabel="Saldo"
            color="#378ADD"
            format={money}
          />
        </EnvCard>
        <EnvCard title="Distribución de la cartera por grupo">
          <DonutLegend labels={grupos.map((g) => g.label)} values={grupos.map((g) => g.saldo)} colors={PALETA_TIENDAS} format={money} />
        </EnvCard>
      </Row2>

      <EnvTable
        rows={finRows}
        cols={finCols}
        rowKey={(r) => r.label}
        footer={['Total', fmtInt(rows.length), fmtCOP(total), '100 %', '']}
        foot="* Saldos según el tipo de documento de cartera. Los traslados a cartera propia y demás tipos se agrupan en «Cartera propia / otras»."
      />
    </>
  )
}

/* ================================================================== */
/* Vista por grupo (Motos / Repuestos)                                 */
/* ================================================================== */

function GrupoView({ title, rows }: { title: string; rows: CarteraRow[] }) {
  const saldo = rows.reduce((a, r) => a + r.saldo, 0)
  const porBodega = useMemo(() => agg(rows, 'bodega'), [rows])
  const porAsesor = useMemo(() => agg(rows, 'vendedor'), [rows])
  const lider = porAsesor[0]
  const bodegaLider = porBodega[0]
  const maxAse = Math.max(...porAsesor.map((x) => x.saldo), 0)
  const detalle = [...rows].sort((a, b) => b.saldo - a.saldo)

  const aseCols: EnvTableCol<Agg>[] = [
    { key: 'a', header: 'Asesor', render: (r) => <span className="font-medium text-ink">{r.short}</span>, width: '36%' },
    { key: 'n', header: 'Documentos', align: 'right', muted: true, render: (r) => fmtInt(r.n) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.saldo)}</span> },
    { key: 'p', header: 'Part. %', align: 'right', muted: true, render: (r) => fmtPct(saldo ? r.saldo / saldo : 0) },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={r.saldo} max={maxAse} /> },
  ]
  const detCols: EnvTableCol<CarteraRow>[] = [
    { key: 'd', header: 'Documento', render: (r) => <span className="font-medium text-ink">{`${r.prefijo} ${r.numero ?? ''}`.trim()}</span>, width: '12%' },
    { key: 'c', header: 'Cliente', render: (r) => r.cliente, width: '30%' },
    { key: 'b', header: 'Bodega / sede', muted: true, render: (r) => shortLabel(r.bodega) },
    { key: 'a', header: 'Asesor', muted: true, render: (r) => r.vendedor },
    { key: 'i', header: 'Días', align: 'right', muted: true, render: (r) => fmtInt(r.dias) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.saldo)}</span> },
  ]

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay registros de {title.toLowerCase()} con los filtros actuales.</p>

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label={`Saldo ${title}`} value={money(saldo)} note={`${fmtInt(rows.length)} documentos`} />
        <KpiStripe tone="green" label="Bodega con más saldo" value={money(bodegaLider?.saldo ?? 0)} note={bodegaLider?.label ?? '—'} />
        <KpiStripe tone="amber" label="Asesor con más saldo" value={money(lider?.saldo ?? 0)} note={lider?.label ?? '—'} />
        <KpiStripe tone="coral" label="Ticket promedio" value={money(rows.length ? saldo / rows.length : 0)} note="Saldo ÷ documentos" />
      </KpiRow>

      <Row2>
        <EnvCard title="Saldo por bodega / sede">
          <BarPair
            labels={porBodega.slice(0, 12).map((x) => x.short)}
            fullLabels={porBodega.slice(0, 12).map((x) => x.label)}
            prev={null}
            cur={porBodega.slice(0, 12).map((x) => x.saldo)}
            prevLabel={null}
            curLabel="Saldo"
            color="#378ADD"
            format={money}
          />
        </EnvCard>
        <EnvCard title="Distribución por bodega (top 10)">
          <DonutLegend labels={porBodega.slice(0, 10).map((x) => x.short)} values={porBodega.slice(0, 10).map((x) => x.saldo)} colors={PALETA_TIENDAS} format={money} />
        </EnvCard>
      </Row2>

      <Row2>
        <EnvCard title="Saldo por asesor">
          <BarPair
            labels={porAsesor.slice(0, 12).map((x) => x.short)}
            prev={null}
            cur={porAsesor.slice(0, 12).map((x) => x.saldo)}
            prevLabel={null}
            curLabel="Saldo"
            color="#1D9E75"
            format={money}
          />
        </EnvCard>
        <EnvTable rows={porAsesor} cols={aseCols} rowKey={(r) => r.label} footer={['Total', fmtInt(rows.length), fmtCOP(saldo), '100 %', '']} />
      </Row2>

      <EnvTable rows={detalle.slice(0, 100)} cols={detCols} rowKey={(r) => `${r.prefijo}-${r.numero}-${r.cliente.slice(0, 10)}`} footer={['Total', '', '', '', '', fmtCOP(saldo)]} foot={detalle.length > 100 ? `* Se muestran los 100 documentos de mayor saldo de ${fmtInt(detalle.length)}.` : undefined} />
    </>
  )
}

/* ================================================================== */
/* Vista financieras                                                    */
/* ================================================================== */

function FinancierasView({ rows }: { rows: CarteraRow[] }) {
  const sum = (l: CarteraRow[]) => l.reduce((a, r) => a + r.saldo, 0)
  const total = sum(rows)
  const finRows = [
    ...FINANCIERAS.map((f) => {
      const l = rows.filter((r) => r.financiera === f)
      return { label: f, n: l.length, saldo: sum(l) }
    }),
    { label: PROPIA, n: rows.filter((r) => r.financiera === null).length, saldo: sum(rows.filter((r) => r.financiera === null)) },
  ]
  const lider = finRows.filter((x) => x.label !== PROPIA).reduce((a, b) => (b.saldo > a.saldo ? b : a), finRows[0])
  const max = Math.max(...finRows.map((x) => x.saldo), 0)

  const cols: EnvTableCol<{ label: string; n: number; saldo: number }>[] = [
    { key: 'f', header: 'Financiera', render: (r) => <span className="font-medium text-ink">{r.label}</span>, width: '36%' },
    { key: 'n', header: 'Documentos', align: 'right', muted: true, render: (r) => fmtInt(r.n) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.saldo)}</span> },
    { key: 'p', header: 'Part. %', align: 'right', muted: true, render: (r) => fmtPct(total ? r.saldo / total : 0) },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={r.saldo} max={max} /> },
  ]

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Saldo total" value={money(total)} note={`${fmtInt(rows.length)} documentos`} />
        <KpiStripe tone="green" label="Financiera con más saldo" value={money(lider.saldo)} note={lider.label} />
        <KpiStripe tone="amber" label="Cartera propia / otras" value={money(finRows.at(-1)!.saldo)} note={`${fmtInt(finRows.at(-1)!.n)} documentos`} />
        <KpiStripe tone="coral" label="Financieras activas" value={fmtInt(finRows.filter((x) => x.label !== PROPIA && x.n > 0).length)} note={`de ${FINANCIERAS.length} reportadas`} />
      </KpiRow>
      <Row2>
        <EnvCard title="Saldo por financiera">
          <BarPair labels={finRows.map((x) => x.label)} prev={null} cur={finRows.map((x) => x.saldo)} prevLabel={null} curLabel="Saldo" color="#378ADD" format={money} />
        </EnvCard>
        <EnvCard title="Participación por financiera">
          <DonutLegend labels={finRows.map((x) => x.label)} values={finRows.map((x) => x.saldo)} colors={PALETA_TIENDAS} format={money} />
        </EnvCard>
      </Row2>
      <EnvTable rows={finRows} cols={cols} rowKey={(r) => r.label} footer={['Total', fmtInt(rows.length), fmtCOP(total), '100 %', '']} foot="* ADDI, BRILLA, CREDIORBE, FINAMIGA, INVERSIONES, PROGRESER y SISTECREDITO según el tipo de documento (ZAD, ZK, ZE, ZG, ZD/FG/FJ/FI, ZH y ZS)." />
    </>
  )
}

/* ================================================================== */
/* Vista campaña YO SOY                                                 */
/* ================================================================== */

function YoSoyView({ rows }: { rows: CarteraRow[] }) {
  const saldo = rows.reduce((a, r) => a + r.saldo, 0)
  const valor = rows.reduce((a, r) => a + r.saldo + (r.aplicado ?? 0), 0)
  const porAsesor = useMemo(() => agg(rows, 'vendedor'), [rows])
  const detalle = [...rows].sort((a, b) => b.saldo - a.saldo)
  const max = Math.max(...porAsesor.map((x) => x.saldo), 0)

  const cols: EnvTableCol<CarteraRow>[] = [
    { key: 'd', header: 'Documento', render: (r) => <span className="font-medium text-ink">{`${r.prefijo} ${r.numero ?? ''}`.trim()}</span>, width: '12%' },
    { key: 'c', header: 'Cliente', render: (r) => r.cliente, width: '26%' },
    { key: 'b', header: 'Bodega / sede', muted: true, render: (r) => shortLabel(r.bodega) },
    { key: 'a', header: 'Asesor', muted: true, render: (r) => r.vendedor },
    { key: 'v', header: 'Valor negocio', align: 'right', render: (r) => fmtCOP(r.saldo + (r.aplicado ?? 0)) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.saldo)}</span> },
    { key: 'e', header: 'Vence', align: 'right', muted: true, render: (r) => day(r.vencimiento) },
  ]
  const aseCols: EnvTableCol<Agg>[] = [
    { key: 'a', header: 'Asesor', render: (r) => <span className="font-medium text-ink">{r.short}</span>, width: '40%' },
    { key: 'n', header: 'Negocios', align: 'right', muted: true, render: (r) => fmtInt(r.n) },
    { key: 's', header: 'Saldo', align: 'right', render: (r) => <span className="font-semibold">{fmtCOP(r.saldo)}</span> },
    { key: 't', header: 'Tendencia', render: (r) => <TrendBar value={r.saldo} max={max} /> },
  ]

  if (!rows.length) return <p className="text-sm text-muted-foreground">No hay negocios YO SOY pendientes con los filtros actuales.</p>

  return (
    <>
      <KpiRow columns={3}>
        <KpiStripe tone="blue" label="Negocios pendientes" value={fmtInt(rows.length)} note="campaña YO SOY" />
        <KpiStripe tone="green" label="Valor de los negocios" value={money(valor)} note="Saldo + aplicado" />
        <KpiStripe tone="coral" label="Saldo por recaudar" value={money(saldo)} note={`${fmtPct(valor ? saldo / valor : 0)} del valor`} />
      </KpiRow>
      <Row2>
        <EnvTable rows={porAsesor} cols={aseCols} rowKey={(r) => r.label} footer={['Total', fmtInt(rows.length), fmtCOP(saldo), '']} />
        <EnvCard title="Saldo por asesor">
          <BarPair labels={porAsesor.map((x) => x.short)} prev={null} cur={porAsesor.map((x) => x.saldo)} prevLabel={null} curLabel="Saldo" color="#D85A30" format={money} />
        </EnvCard>
      </Row2>
      <EnvTable rows={detalle} cols={cols} rowKey={(r) => `${r.prefijo}-${r.numero}-${r.cliente.slice(0, 10)}`} footer={['Total', '', '', '', fmtCOP(valor), fmtCOP(saldo), '']} foot="* Negocios cuya nota menciona la campaña YO SOY." />
    </>
  )
}
