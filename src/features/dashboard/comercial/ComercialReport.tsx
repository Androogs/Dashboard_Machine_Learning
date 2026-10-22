/**
 * Tablero de gestión comercial (libro "Así vamos" compilado).
 *
 * Estructura (ver dashboard_sumoto_botones_marcas.html):
 *   Pastillas: Vista general + una por marca (o por sede, según "Tablas de esta hoja")
 *   Encabezado con logo · secciones: General, Pedidos, Negocios creados, Data activa,
 *   Seguimiento, Activa rojos y Así vamos (metas).
 * Cada sección: KPIs con franja de color, gráficas y tabla por asesor.
 */
import { useMemo, useState, type ReactNode } from 'react'
import type { ComercialCount, ComercialSheet } from '@/types/report'
import { fmtInt, fmtPct, monthLong } from '@/lib/format'
import { colorOf } from '@/config/negocio'
import { cn } from '@/lib/utils'
import { EnvCard, EnvTable, KpiRow, KpiStripe, PillNav, ReportBand, Row2, TrendBar, type EnvTableCol } from '../env/EnvBlocks'
import { DonutLegend } from '../env/EnvCharts'
import { HBars } from './ComercialCharts'
import { AsiVamosView } from './AsiVamosView'

const C = { azul: '#378ADD', verde: '#1D9E75', ambar: '#BA7517', coral: '#D85A30', claro: '#B5D4F4', violeta: '#7F77DD', gris: '#888780' }
const ORIGENES = ['Vitrina', 'Pauta', 'Orgánico', 'Volante', 'Otros']
const ORIGEN_COLOR = [C.azul, C.verde, C.coral, C.ambar, C.violeta]
const PRIORIDADES = ['Alta', 'Media', 'Baja']
const PRIORIDAD_COLOR = [C.verde, C.ambar, C.claro]

type Section = 'general' | 'pedidos' | 'creados' | 'activos' | 'seguimiento' | 'rojos' | 'asivamos'
/** El reporte principal es la hoja ASI VAMOS; las secciones del CRM son complementarias. */
const SECTIONS: { id: Section; label: string; crm?: boolean }[] = [
  { id: 'asivamos', label: 'Así vamos' },
  { id: 'general', label: 'Resumen CRM', crm: true },
  { id: 'pedidos', label: 'Pedidos', crm: true },
  { id: 'creados', label: 'Negocios creados', crm: true },
  { id: 'activos', label: 'Data activa CRM', crm: true },
  { id: 'seguimiento', label: 'Seguimiento', crm: true },
  { id: 'rojos', label: 'Activa rojos', crm: true },
]

const sum = (l: { n: number }[]) => l.reduce((a, x) => a + x.n, 0)
/** Notas que se refieren a las hojas del CRM (el resto son del Así vamos) */
const isCrmNote = (n: string) => /^(Negocios creados del mes|[\d.]+ registros no traen vitrina|Los totales recalculados)|la hoja base suma/.test(n)

/** Pivote asesor × categoría a partir de los conteos. */
function byAdvisor(list: ComercialCount[], cats: string[]) {
  const map = new Map<string, Record<string, number>>()
  for (const x of list) {
    const r = map.get(x.asesor) ?? Object.fromEntries([...cats, '__total'].map((c) => [c, 0]))
    if (cats.length) r[x.cat] = (r[x.cat] ?? 0) + x.n
    r.__total += x.n
    map.set(x.asesor, r)
  }
  return [...map.entries()].map(([n, v]) => ({ n, ...v } as { n: string } & Record<string, number>)).sort((a, b) => b.__total - a.__total)
}
const byCat = (list: ComercialCount[], cats: string[]) => cats.map((c) => list.filter((x) => x.cat === c).reduce((a, x) => a + x.n, 0))

export function ComercialReport({ sheet }: { sheet: ComercialSheet }) {
  const key = sheet.groupBy
  const [group, setGroup] = useState<string>('')
  const [section, setSection] = useState<Section>('asivamos')
  const sections = SECTIONS.filter((x) => !x.crm || sheet.hasCrm)

  // Grupos (marcas o sedes) ordenados por actividad total
  const groups = useMemo(() => {
    const act = new Map<string, number>()
    const add = (g: string, n: number) => act.set(g, (act.get(g) ?? 0) + n)
    // Primero pesa el Así vamos (meta y radicadas); el CRM solo desempata
    for (const r of sheet.asiVamos) add(r[key], (r.metaVentas + r.aHoy) * 1000)
    for (const l of [sheet.pedidos, sheet.creados, sheet.activos, sheet.seguimiento, sheet.rojos]) for (const x of l) add(x[key], x.n)
    return [...act.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g)
  }, [sheet, key])

  const f = <T extends { marca: string; sede: string }>(l: T[]) => (group ? l.filter((x) => x[key] === group) : l)
  const d = {
    pedidos: f(sheet.pedidos),
    creados: f(sheet.creados),
    activos: f(sheet.activos),
    seguimiento: f(sheet.seguimiento),
    rojos: f(sheet.rojos),
    asi: f(sheet.asiVamos),
  }
  const m = sheet.meta
  const hoy = m.hoy ? new Date(`${m.hoy}T12:00:00`) : null
  const corte = hoy ? `${hoy.getDate()} de ${monthLong(hoy.getMonth() + 1).toLowerCase()} de ${hoy.getFullYear()}` : 'fecha no indicada'
  const bandTitle = `${section === 'asivamos' ? 'Así vamos' : 'Tablero de gestión comercial'}${group ? ` — ${group}` : key === 'marca' ? ' — Todas las marcas' : ' — Todas las sedes'}`
  const bandInfo = `Corte del archivo compilado, mes ${m.mes ?? '—'}, avance día ${m.avance ?? '—'} de ${m.diasHabiles ?? '—'}, al ${corte}`

  const pills = [{ id: '', label: 'Vista general' }, ...groups.map((g) => ({ id: g, label: g }))]
  const color = group ? colorOf(group, C.azul) : C.azul

  return (
    <div className="flex flex-col gap-4">
      <PillNav items={pills} active={group} onChange={setGroup} />
      <ReportBand title={bandTitle} info={bandInfo} badge={m.avance && m.diasHabiles ? `Avance día ${m.avance} de ${m.diasHabiles}` : key === 'marca' ? 'Por marca' : 'Por sede'} />

      {sections.length > 1 && (
      <nav className="no-print flex flex-wrap gap-1 border-b pb-2" aria-label="Secciones del tablero">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSection(s.id)}
            aria-pressed={section === s.id}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              section === s.id ? 'bg-[#1a2b5e]/[0.08] text-[#1a2b5e]' : 'text-muted-foreground hover:bg-secondary hover:text-ink',
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>
      )}

      {section === 'general' && <General sheet={sheet} d={d} group={group} groups={groups} keyBy={key} color={color} />}
      {section === 'pedidos' && <Pedidos list={d.pedidos} />}
      {section === 'creados' && <Creados list={d.creados} />}
      {section === 'activos' && <Activos list={d.activos} />}
      {section === 'seguimiento' && <Simple list={d.seguimiento} label="Seguimientos" color={C.azul} source="td SEGUIMIENTO" />}
      {section === 'rojos' && <Simple list={d.rojos} label="Registros activa rojos" color={C.coral} source="td ACTIVA ROJOS" extra='El valor "SD" se conserva como categoría del archivo.' />}
      {section === 'asivamos' && <AsiVamosView rows={d.asi} all={sheet.asiVamos} meta={m} color={color} group={group} groups={groups} keyBy={key} />}

      <ul className="space-y-0.5 px-1 text-[10.5px] text-muted-foreground">
        {section !== 'asivamos' && <li>* Conteos recalculados desde las hojas base del CRM (PEDIDO, CREADOS, ACTIVOS, SEGUIMIENTO, ACTIVA ROJOS) con la marca y la sede de la columna VITRINA / PUNTO DE VENTA.</li>}
        {sheet.notes
          .filter((n) => (section === 'asivamos') !== isCrmNote(n))
          .map((n) => (
            <li key={n}>* {n}</li>
          ))}
      </ul>
    </div>
  )
}

type D = {
  pedidos: ComercialCount[]
  creados: ComercialCount[]
  activos: ComercialCount[]
  seguimiento: ComercialCount[]
  rojos: ComercialCount[]
  asi: ComercialSheet['asiVamos']
}

/* ================================================================== */
/* General                                                             */
/* ================================================================== */

function General({ sheet, d, group, groups, keyBy, color }: { sheet: ComercialSheet; d: D; group: string; groups: string[]; keyBy: 'marca' | 'sede'; color: string }) {
  const ped = byCat(d.pedidos, ['Cartera', 'Facturado'])
  const act = byCat(d.activos, PRIORIDADES)
  const org = byCat(d.creados, ORIGENES)
  const pedRows = byAdvisor(d.pedidos, ['Cartera', 'Facturado'])
  const segRows = byAdvisor(d.seguimiento, [])
  const totPed = sum(d.pedidos)

  // Resumen por grupo (solo en la vista general sin filtro)
  const resumen = groups.map((g) => {
    const by = <T extends { marca: string; sede: string }>(l: T[]) => l.filter((x) => x[keyBy] === g)
    const asi = by(sheet.asiVamos)
    return {
      g,
      pedidos: sum(by(sheet.pedidos)),
      creados: sum(by(sheet.creados)),
      activos: sum(by(sheet.activos)),
      seguimiento: sum(by(sheet.seguimiento)),
      rojos: sum(by(sheet.rojos)),
      aHoy: asi.reduce((a, r) => a + r.aHoy, 0),
      meta: asi.reduce((a, r) => a + r.metaVentas, 0),
    }
  })
  const totalRes = resumen.reduce(
    (a, r) => ({ pedidos: a.pedidos + r.pedidos, creados: a.creados + r.creados, activos: a.activos + r.activos, seguimiento: a.seguimiento + r.seguimiento, rojos: a.rojos + r.rojos, aHoy: a.aHoy + r.aHoy, meta: a.meta + r.meta }),
    { pedidos: 0, creados: 0, activos: 0, seguimiento: 0, rojos: 0, aHoy: 0, meta: 0 },
  )

  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Pedidos (total general)" value={fmtInt(totPed)} note={`${fmtInt(ped[0])} cartera, ${fmtInt(ped[1])} facturado`} />
        <KpiStripe tone="green" label="Negocios creados" value={fmtInt(sum(d.creados))} note="Pivot de creados" />
        <KpiStripe tone="amber" label="Data activa" value={fmtInt(sum(d.activos))} note={`${fmtInt(act[0])} alta, ${fmtInt(act[1])} media, ${fmtInt(act[2])} baja`} />
        <KpiStripe tone="coral" label="Seguimientos" value={fmtInt(sum(d.seguimiento))} note="Registros contabilizados" />
      </KpiRow>
      <Row2>
        <EnvCard title="Pedidos por asesor y resultado">
          <Empty when={!pedRows.length}>
            <HBars
              labels={pedRows.map((r) => r.n)}
              series={[
                { label: 'Cartera', data: pedRows.map((r) => r.Cartera), color: C.claro },
                { label: 'Facturado', data: pedRows.map((r) => r.Facturado), color: C.verde },
              ]}
            />
          </Empty>
        </EnvCard>
        <EnvCard title="Negocios creados por origen">
          <Empty when={!sum(d.creados)}>
            <DonutLegend labels={ORIGENES} values={org} colors={ORIGEN_COLOR} format={(v) => `${fmtInt(v)} negocios`} />
          </Empty>
        </EnvCard>
        <EnvCard title="Clasificación de data activa">
          <Empty when={!sum(d.activos)}>
            <DonutLegend labels={PRIORIDADES} values={act} colors={PRIORIDAD_COLOR} format={(v) => `${fmtInt(v)} registros`} />
          </Empty>
        </EnvCard>
        <EnvCard title="Seguimiento por asesor">
          <Empty when={!segRows.length}>
            <HBars labels={segRows.map((r) => r.n)} series={[{ label: 'Seguimientos', data: segRows.map((r) => r.__total), color }]} />
          </Empty>
        </EnvCard>
      </Row2>
      <PedidoTable rows={pedRows} foot='Fuente: hoja "TD PEDIDO" del archivo compilado (recalculada desde PEDIDO).' />

      {!group && groups.length > 1 && (
        <EnvTable
          rows={resumen}
          rowKey={(r) => r.g}
          cols={[
            { key: 'g', header: keyBy === 'marca' ? 'Marca' : 'Sede', render: (r) => <span className="font-semibold text-ink">{r.g}</span> },
            { key: 'p', header: 'Pedidos', align: 'right', render: (r) => fmtInt(r.pedidos) },
            { key: 'c', header: 'Neg. creados', align: 'right', render: (r) => fmtInt(r.creados) },
            { key: 'a', header: 'Data activa', align: 'right', render: (r) => fmtInt(r.activos) },
            { key: 's', header: 'Seguimientos', align: 'right', render: (r) => fmtInt(r.seguimiento) },
            { key: 'r', header: 'Activa rojos', align: 'right', render: (r) => fmtInt(r.rojos) },
            { key: 'h', header: 'Radicadas a hoy', align: 'right', render: (r) => fmtInt(r.aHoy) },
            { key: 'm', header: 'Meta ventas', align: 'right', muted: true, render: (r) => fmtInt(r.meta) },
          ]}
          footer={['Total', fmtInt(totalRes.pedidos), fmtInt(totalRes.creados), fmtInt(totalRes.activos), fmtInt(totalRes.seguimiento), fmtInt(totalRes.rojos), fmtInt(totalRes.aHoy), fmtInt(totalRes.meta)]}
          foot={`* Resumen por ${keyBy === 'marca' ? 'marca' : 'sede'}. Radicadas y meta provienen de la hoja ASI VAMOS; el resto, de las hojas del CRM.`}
        />
      )}
    </>
  )
}

/* ================================================================== */
/* Secciones                                                           */
/* ================================================================== */

function PedidoTable({ rows, foot }: { rows: ReturnType<typeof byAdvisor>; foot: string }) {
  const tot = rows.reduce((a, r) => a + r.__total, 0)
  const max = Math.max(0, ...rows.map((r) => r.__total))
  const cols: EnvTableCol<(typeof rows)[number]>[] = [
    { key: 'n', header: 'Asesor', render: (r) => <span className="font-medium text-ink">{r.n}</span> },
    { key: 'c', header: 'Cartera', align: 'right', render: (r) => fmtInt(r.Cartera) },
    { key: 'f', header: 'Facturado', align: 'right', render: (r) => fmtInt(r.Facturado) },
    { key: 't', header: 'Total', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.__total)}</span> },
    { key: 'p', header: 'Part.%', align: 'right', muted: true, render: (r) => fmtPct(tot ? r.__total / tot : 0) },
    { key: 'b', header: 'Tendencia', render: (r) => <TrendBar value={r.__total} max={max} color={C.verde} /> },
  ]
  return (
    <EnvTable
      rows={rows}
      cols={cols}
      rowKey={(r) => r.n}
      footer={['Total', fmtInt(rows.reduce((a, r) => a + r.Cartera, 0)), fmtInt(rows.reduce((a, r) => a + r.Facturado, 0)), fmtInt(tot), '100 %', '']}
      foot={foot}
    />
  )
}

function Pedidos({ list }: { list: ComercialCount[] }) {
  const rows = byAdvisor(list, ['Cartera', 'Facturado'])
  const [cart, fact] = byCat(list, ['Cartera', 'Facturado'])
  const tot = cart + fact
  return (
    <>
      <p className="px-1 text-[12px] text-muted-foreground">Conteo por asesor, según la tabla dinámica TD PEDIDO (resultado cartera o facturado, sin anulados).</p>
      <KpiRow columns={3}>
        <KpiStripe tone="blue" label="Pedidos" value={fmtInt(tot)} note="Total general" />
        <KpiStripe tone="green" label="Facturado" value={fmtInt(fact)} note={`${fmtPct(tot ? fact / tot : 0)} de los pedidos`} />
        <KpiStripe tone="amber" label="Cartera" value={fmtInt(cart)} note={`${fmtPct(tot ? cart / tot : 0)} de los pedidos`} />
      </KpiRow>
      <EnvCard title="Pedidos por asesor y resultado">
        <Empty when={!rows.length}>
          <HBars
            stacked
            labels={rows.map((r) => r.n)}
            series={[
              { label: 'Cartera', data: rows.map((r) => r.Cartera), color: C.claro },
              { label: 'Facturado', data: rows.map((r) => r.Facturado), color: C.verde },
            ]}
          />
        </Empty>
      </EnvCard>
      <PedidoTable rows={rows} foot='Fuente: hoja "TD PEDIDO" (recalculada desde PEDIDO).' />
    </>
  )
}

function Creados({ list }: { list: ComercialCount[] }) {
  const rows = byAdvisor(list, ORIGENES)
  const tot = byCat(list, ORIGENES)
  const total = sum(list)
  const max = Math.max(0, ...rows.map((r) => r.__total))
  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Negocios creados" value={fmtInt(total)} note="Total general del pivote" />
        <KpiStripe tone="green" label="Vitrina" value={fmtInt(tot[0])} note={`Origen, ${fmtPct(total ? tot[0] / total : 0)}`} />
        <KpiStripe tone="amber" label="Pauta" value={fmtInt(tot[1])} note={`Origen, ${fmtPct(total ? tot[1] / total : 0)}`} />
        <KpiStripe tone="coral" label="Orgánico" value={fmtInt(tot[2])} note={`Origen, ${fmtPct(total ? tot[2] / total : 0)}`} />
      </KpiRow>
      <Row2>
        <EnvCard title="Negocios creados por asesor">
          <Empty when={!rows.length}>
            <HBars labels={rows.map((r) => r.n)} series={[{ label: 'Negocios', data: rows.map((r) => r.__total), color: C.verde }]} />
          </Empty>
        </EnvCard>
        <EnvCard title="Origen de los negocios">
          <Empty when={!total}>
            <DonutLegend labels={ORIGENES} values={tot} colors={ORIGEN_COLOR} format={(v) => `${fmtInt(v)} negocios`} />
          </Empty>
        </EnvCard>
      </Row2>
      <EnvTable
        rows={rows}
        rowKey={(r) => r.n}
        cols={[
          { key: 'n', header: 'Asesor', render: (r) => <span className="font-medium text-ink">{r.n}</span> },
          ...ORIGENES.map((o) => ({ key: o, header: o, align: 'right' as const, render: (r: (typeof rows)[number]) => fmtInt(r[o]) })),
          { key: 't', header: 'Total', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.__total)}</span> },
          { key: 'p', header: 'Part.%', align: 'right', muted: true, render: (r) => fmtPct(total ? r.__total / total : 0) },
          { key: 'b', header: 'Tendencia', render: (r) => <TrendBar value={r.__total} max={max} color={C.verde} /> },
        ]}
        footer={['Total', ...tot.map(fmtInt), fmtInt(total), '100 %', '']}
        foot='Fuente: hoja "td CREADOS" (recalculada desde CREADOS, mes del Así vamos). Los conteos corresponden a los valores visibles del pivote.'
      />
    </>
  )
}

function Activos({ list }: { list: ComercialCount[] }) {
  const rows = byAdvisor(list, PRIORIDADES)
  const tot = byCat(list, PRIORIDADES)
  const total = sum(list)
  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label="Total data activa" value={fmtInt(total)} />
        <KpiStripe tone="green" label="Prioridad alta" value={fmtInt(tot[0])} note={fmtPct(total ? tot[0] / total : 0)} />
        <KpiStripe tone="amber" label="Prioridad media" value={fmtInt(tot[1])} note={fmtPct(total ? tot[1] / total : 0)} />
        <KpiStripe tone="coral" label="Prioridad baja" value={fmtInt(tot[2])} note={fmtPct(total ? tot[2] / total : 0)} />
      </KpiRow>
      <EnvCard title="Data activa por asesor y prioridad">
        <Empty when={!rows.length}>
          <HBars stacked labels={rows.map((r) => r.n)} series={PRIORIDADES.map((p, i) => ({ label: p, data: rows.map((r) => r[p]), color: PRIORIDAD_COLOR[i] }))} />
        </Empty>
      </EnvCard>
      <EnvTable
        rows={rows}
        rowKey={(r) => r.n}
        cols={[
          { key: 'n', header: 'Asesor', render: (r) => <span className="font-medium text-ink">{r.n}</span> },
          ...PRIORIDADES.map((p) => ({ key: p, header: p, align: 'right' as const, render: (r: (typeof rows)[number]) => fmtInt(r[p]) })),
          { key: 't', header: 'Total', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.__total)}</span> },
          { key: 'a', header: '% alta', align: 'right', muted: true, render: (r) => fmtPct(r.__total ? r.Alta / r.__total : 0) },
        ]}
        footer={['Total', ...tot.map(fmtInt), fmtInt(total), fmtPct(total ? tot[0] / total : 0)]}
        foot='Fuente: hoja "td ACTIVOS" (recalculada desde ACTIVOS, columna INTENCIÓN DE COMPRA).'
      />
    </>
  )
}

function Simple({ list, label, color, source, extra }: { list: ComercialCount[]; label: string; color: string; source: string; extra?: string }) {
  const rows = byAdvisor(list, [])
  const total = sum(list)
  const max = Math.max(0, ...rows.map((r) => r.__total))
  return (
    <>
      <KpiRow columns={3}>
        <KpiStripe tone="blue" label={label} value={fmtInt(total)} note="Total general" />
        <KpiStripe tone="green" label="Asesores con registros" value={fmtInt(rows.length)} />
        <KpiStripe tone="amber" label="Mayor volumen" value={rows[0] ? fmtInt(rows[0].__total) : '—'} note={rows[0] ? `${rows[0].n}, ${fmtPct(total ? rows[0].__total / total : 0)} del total` : ''} />
      </KpiRow>
      <EnvCard title={`${label} por asesor`}>
        <Empty when={!rows.length}>
          <HBars labels={rows.map((r) => r.n)} series={[{ label, data: rows.map((r) => r.__total), color }]} />
        </Empty>
      </EnvCard>
      <EnvTable
        rows={rows}
        rowKey={(r) => r.n}
        cols={[
          { key: 'n', header: 'Asesor', render: (r) => <span className="font-medium text-ink">{r.n}</span> },
          { key: 'v', header: 'Registros', align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.__total)}</span> },
          { key: 'p', header: 'Part.%', align: 'right', muted: true, render: (r) => fmtPct(total ? r.__total / total : 0) },
          { key: 'b', header: 'Tendencia', render: (r) => <TrendBar value={r.__total} max={max} color={color} /> },
        ]}
        footer={['Total', fmtInt(total), '100 %', '']}
        foot={`Fuente: hoja "${source}".${extra ? ` ${extra}` : ''}`}
      />
    </>
  )
}

function Empty({ when, children }: { when: boolean; children: ReactNode }) {
  if (when) return <p className="flex h-[180px] items-center justify-center text-[12px] text-muted-foreground">Sin registros para este filtro en el archivo.</p>
  return <>{children}</>
}
