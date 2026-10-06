/**
 * Entorno RUNT Nacional & Valle (formato del reporte de gerencia):
 * KPIs de mercado, donas de participación, volumen por marca año vs año,
 * tabla de shares y, si el archivo trae ventas propias, participación de Sumoto en el Valle.
 */
import type { RuntSheet, RuntTable } from '@/types/report'
import { ownMarket, runtKey } from '@/parser/runtParser'
import { fmtInt, fmtPct, titleCase } from '@/lib/format'
import { PALETA_RUNT, colorOf } from '@/config/negocio'
import { COLOR_COMPARACION } from '@/config/negocio'
import { EnvCard, EnvTable, KpiRow, KpiStripe, ReportBand, Row2, VarPill, varOf, type EnvTableCol } from './EnvBlocks'
import { BarPair, DonutLegend } from './EnvCharts'

const RUNT_COLOR = '#E05A1E'
const units = (v: number | null | undefined) => (v == null ? '—' : `${fmtInt(v)} uds`)

export function RuntReport({ sheet }: { sheet: RuntSheet }) {
  const [y0, y1] = sheet.years.map(String)
  const markets = sheet.markets
  const cut = sheet.cutoff ? `a ${sheet.cutoff} ${y1}` : y1
  const bestGrowth = (m: RuntTable) => [...m.rows].filter((r) => (r.prev ?? 0) > 0 && r.cur != null && !/^(resto|otras?|otros)$/i.test(r.marca.trim())).sort((a, b) => varOf(b.cur, b.prev)! - varOf(a.cur, a.prev)!)[0]
  const own = sheet.own
  const ownMk = own ? ownMarket(sheet) : null

  return (
    <div className="flex flex-col gap-4">
      <ReportBand title={`${sheet.title} — ${titleCase(cut)}`} info={`Acumulado enero – ${sheet.cutoff ?? ''} ${y1} vs ${y0}`.replace('  ', ' ')} badge={`Fuente RUNT, ${cut}`} />

      <KpiRow>
        {markets.slice(0, 2).map((m, i) => (
          <KpiStripe key={m.name} tone={i === 0 ? 'blue' : 'green'} label={`Total ${m.name} ${y1}`} value={fmtInt(m.total.cur)} delta={varOf(m.total.cur, m.total.prev)} note={`vs ${y0}`} />
        ))}
        {markets.slice(0, 2).map((m, i) => {
          const b = bestGrowth(m)
          return <KpiStripe key={`g-${m.name}`} tone={i === 0 ? 'amber' : 'coral'} label={`Mayor crec. ${m.name}`} value={b ? `+${fmtPct(varOf(b.cur, b.prev))}` : '—'} note={b?.marca} />
        })}
      </KpiRow>

      <Row2>
        {markets.slice(0, 2).map((m) => {
          const rows = m.rows.filter((r) => r.cur != null)
          return (
            <EnvCard key={m.name} title={`RUNT ${m.name} — Participación de mercado ${y1}`}>
              <DonutLegend
                labels={rows.map((r) => r.marca)}
                values={rows.map((r) => r.cur ?? 0)}
                colors={PALETA_RUNT}
                format={units}
                extra={(i) => {
                  const v = varOf(rows[i].cur, rows[i].prev)
                  const s0 = m.total.prev ? (rows[i].prev ?? 0) / m.total.prev : null
                  return [v != null ? `Var. vs ${y0}: ${v >= 0 ? '+' : ''}${fmtPct(v)}` : '', s0 != null ? `Share ${y0}: ${fmtPct(s0)}` : ''].filter(Boolean).join(' · ')
                }}
              />
            </EnvCard>
          )
        })}
      </Row2>

      {markets.map((m) => (
        <EnvCard
          key={`bar-${m.name}`}
          title={`RUNT ${m.name} — Volumen acumulado ${sheet.cutoff ? `enero–${sheet.cutoff}` : ''} (${y0} vs ${y1})`}
          legend={[
            { label: y0, color: COLOR_COMPARACION },
            { label: y1, color: RUNT_COLOR },
          ]}
        >
          <BarPair labels={m.rows.map((r) => r.marca)} prev={m.rows.map((r) => r.prev)} cur={m.rows.map((r) => r.cur)} prevLabel={y0} curLabel={y1} color={RUNT_COLOR} format={units} height={210} />
        </EnvCard>
      ))}

      <MarketTable sheet={sheet} />

      {own && ownMk && <OwnShare sheet={sheet} />}

      <ul className="space-y-0.5 px-1 text-[10.5px] text-muted-foreground">
        <li>* Fuente: RUNT. Acumulado {sheet.cutoff ? `enero–${sheet.cutoff}` : ''} {y1}. Share = participación de la marca sobre el total del mercado.</li>
        {sheet.notes.map((n) => (
          <li key={n}>* {n}</li>
        ))}
      </ul>
    </div>
  )
}

/** Tabla de marcas con shares por mercado (Nacional y Valle lado a lado). */
function MarketTable({ sheet }: { sheet: RuntSheet }) {
  const [y0, y1] = sheet.years.map(String)
  const markets = sheet.markets.slice(0, 2)
  const brands: string[] = []
  for (const m of markets) for (const r of m.rows) if (!brands.some((b) => runtKey(b) === runtKey(r.marca))) brands.push(r.marca)
  const find = (m: RuntTable, b: string) => m.rows.find((r) => runtKey(r.marca) === runtKey(b))
  type Row = { marca: string }
  const cols: EnvTableCol<Row>[] = [
    { key: 'm', header: 'Marca', render: (r) => <span className="font-semibold text-ink">{r.marca}</span>, width: '13%' },
    ...markets.flatMap<EnvTableCol<Row>>((m) => [
      { key: `${m.name}0`, header: `${short(m.name)} ${y0}`, align: 'right', muted: true, render: (r) => fmtInt(find(m, r.marca)?.prev) },
      { key: `${m.name}s0`, header: 'Share', align: 'right', muted: true, render: (r) => share(find(m, r.marca)?.prev, m.total.prev) },
      { key: `${m.name}1`, header: `${short(m.name)} ${y1}`, align: 'right', render: (r) => <span className="font-semibold">{fmtInt(find(m, r.marca)?.cur)}</span> },
      { key: `${m.name}s1`, header: 'Share', align: 'right', render: (r) => share(find(m, r.marca)?.cur, m.total.cur) },
      { key: `${m.name}v`, header: 'Var.%', align: 'right', render: (r) => <VarPill value={varOf(find(m, r.marca)?.cur ?? null, find(m, r.marca)?.prev ?? null)} /> },
    ]),
  ]
  const footer = [
    'TOTAL',
    ...markets.flatMap((m) => [fmtInt(m.total.prev), '100 %', fmtInt(m.total.cur), '100 %', <VarPill key={m.name} value={varOf(m.total.cur, m.total.prev)} />]),
  ]
  return <EnvTable rows={brands.map((marca) => ({ marca }))} cols={cols} footer={footer} rowKey={(r) => r.marca} foot={`* Nac = Nacional. Share recalculado sobre el total de cada mercado.`} />
}

/** Participación de las ventas propias (Sumoto) en el mercado regional. */
function OwnShare({ sheet }: { sheet: RuntSheet }) {
  const [y0, y1] = sheet.years.map(String)
  const own = sheet.own!
  const mk = ownMarket(sheet)
  const rows = own.rows
    .map((r) => {
      const m = mk.rows.find((x) => runtKey(x.marca) === runtKey(r.marca))
      return { marca: r.marca, cur: r.cur, prev: r.prev, mCur: m?.cur ?? null, mPrev: m?.prev ?? null }
    })
    .sort((a, b) => (b.cur ?? 0) - (a.cur ?? 0))
  const tot = { cur: own.total.cur, prev: own.total.prev, mCur: rows.reduce((a, r) => a + (r.mCur ?? 0), 0), mPrev: rows.reduce((a, r) => a + (r.mPrev ?? 0), 0) }
  const shareAll = mk.total.cur ? own.total.cur / mk.total.cur : null
  const shareAllPrev = mk.total.prev ? own.total.prev / mk.total.prev : null
  type R = (typeof rows)[number]
  const cols: EnvTableCol<R>[] = [
    { key: 'm', header: 'Marca', render: (r) => <span className="font-semibold text-ink">{r.marca}</span> },
    { key: 'p', header: `${own.name} ${y0}`, align: 'right', muted: true, render: (r) => fmtInt(r.prev) },
    { key: 'c', header: `${own.name} ${y1}`, align: 'right', render: (r) => <span className="font-semibold">{fmtInt(r.cur)}</span> },
    { key: 'v', header: 'Var.%', align: 'right', render: (r) => <VarPill value={varOf(r.cur, r.prev)} /> },
    { key: 'mk', header: `${mk.name} ${y1}`, align: 'right', muted: true, render: (r) => fmtInt(r.mCur) },
    { key: 's0', header: `Part. ${y0}`, align: 'right', muted: true, render: (r) => share(r.prev, r.mPrev) },
    { key: 's1', header: `Part. ${y1}`, align: 'right', render: (r) => <span className="font-semibold">{share(r.cur, r.mCur)}</span> },
  ]
  return (
    <>
      <KpiRow>
        <KpiStripe tone="blue" label={`Ventas ${own.name} ${y1}`} value={fmtInt(own.total.cur)} delta={varOf(own.total.cur, own.total.prev)} note={`vs ${y0}`} />
        <KpiStripe tone="green" label={`Part. ${own.name} en ${mk.name} ${y1}`} value={fmtPct(shareAll)} note={`${y0}: ${fmtPct(shareAllPrev)} del mercado`} />
        <KpiStripe tone="amber" label={`Mercado ${mk.name} (marcas ${own.name})`} value={fmtInt(tot.mCur)} delta={varOf(tot.mCur, tot.mPrev)} note={`vs ${y0}`} />
        <KpiStripe tone="coral" label={`Part. en sus marcas ${y1}`} value={fmtPct(tot.mCur ? tot.cur / tot.mCur : null)} note={`${y0}: ${fmtPct(tot.mPrev ? tot.prev / tot.mPrev : null)}`} />
      </KpiRow>
      <EnvCard
        title={`${own.name} vs mercado ${mk.name} — ${y1} por marca`}
        legend={[
          { label: `Mercado ${mk.name}`, color: COLOR_COMPARACION },
          { label: own.name, color: '#1a2b5e' },
        ]}
      >
        <BarPair
          labels={rows.map((r) => r.marca)}
          prev={rows.map((r) => r.mCur)}
          cur={rows.map((r) => r.cur)}
          prevLabel={`Mercado ${mk.name}`}
          curLabel={own.name}
          color={rows.map((r) => colorOf(r.marca, '#1a2b5e'))}
          format={units}
          height={210}
        />
      </EnvCard>
      <EnvTable
        rows={rows}
        cols={cols}
        rowKey={(r) => r.marca}
        footer={['TOTAL', fmtInt(tot.prev), fmtInt(tot.cur), <VarPill key="v" value={varOf(tot.cur, tot.prev)} />, fmtInt(tot.mCur), share(tot.prev, tot.mPrev), share(tot.cur, tot.mCur)]}
        foot={`* Part. = ventas ${own.name} / matrículas RUNT ${mk.name} de la misma marca. Sobre el mercado total ${mk.name}: ${fmtPct(shareAll)}.`}
      />
    </>
  )
}

const share = (v: number | null | undefined, tot: number | null | undefined) => (v == null || !tot ? '—' : fmtPct(v / tot))
const short = (name: string) => (/nacional/i.test(name) ? 'Nac' : name)
