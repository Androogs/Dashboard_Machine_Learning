/**
 * Reporte "ASI VAMOS": resumen por asesor comercial.
 * Reproduce los dos paneles de las imágenes de referencia:
 */
import type { AsiVamosSheet } from '@/types/report'
import { fmtInt, fmtPct, variation } from '@/lib/format'
import { C } from '@/features/dashboard/charts/theme'
import { ChartCard, Grid, KpiCard, ReportHeader } from './blocks'
import { MultiSeriesChart } from './charts/MultiSeriesChart'
import { DonutChart } from './charts/DonutChart'

const CANALES = [
  { key: 'vitrina', label: 'Vitrina', coti: 'vitrinaCoti' },
  { key: 'pauta', label: 'Pauta', coti: 'pautaCoti' },
  { key: 'organico', label: 'Organico', coti: 'organicoCoti' },
  { key: 'volante', label: 'Volante', coti: 'volanteCoti' },
  { key: 'otro', label: 'Otro', coti: 'otroCoti' },
] as const

export function AsiVamosReport({ sheet }: { sheet: AsiVamosSheet }) {
  const rows = sheet.rows

  // Agregados globales
  const totalMeta = rows.reduce((a, r) => a + r.metaVentas, 0)
  const totalDebeLlevar = rows.reduce((a, r) => a + r.debeLlevar, 0)
  const totalAHoy = rows.reduce((a, r) => a + r.aHoy, 0)
  const totalDebeLlevarCoti = rows.reduce((a, r) => a + r.debeLlevarCoti, 0)
  const totalAHoyCoti = rows.reduce((a, r) => a + r.aHoyCoti, 0)
  const totalCumplimientoRads = rows.reduce((a, r) => a + r.cumplimientoRads, 0) / rows.length
  const totalEfectividad = rows.reduce((a, r) => a + r.efectividad, 0) / rows.length
  const totalPendiente = rows.reduce((a, r) => a + r.seguimientoPendiente, 0)
  const totalRealizado = rows.reduce((a, r) => a + r.seguimientoRealizado, 0)

  const f = (v: number) => fmtInt(v)
  const fInt = (v: number) => fmtInt(v)

  // Evolución A HOY vs DEBE LLEVAR por asesor (líneas)
  const evoData = rows.map((r) => ({
    label: r.asesor,
    aHoy: r.aHoy,
    debeLlevar: r.debeLlevar,
  }))

  // Atribución por canales: Radicaciones vs Cotizaciones (A HOY)
  const canalRows = CANALES.map((c) => ({
    label: c.label,
    rads: rows.reduce((a, r) => a + (r as any)[c.key], 0),
    coti: rows.reduce((a, r) => a + (r as any)[c.coti], 0),
  }))

  // Rendimiento por asesor: % cumplimiento radicaciones
  const perfData = rows
    .map((r) => ({
      label: r.asesor,
      cumplimiento: r.cumplimientoRads,
      aHoy: r.aHoy,
      debeLlevar: r.debeLlevar,
    }))
    .sort((a, b) => b.cumplimiento - a.cumplimiento)

  // Calidad de data activa
  const totalData = rows.reduce((a, r) => a + r.total, 0)
  const alta = rows.reduce((a, r) => a + r.alta, 0)
  const media = rows.reduce((a, r) => a + r.media, 0)
  const baja = rows.reduce((a, r) => a + r.baja, 0)

  const corteLabel =
    sheet.meta.mes != null
      ? `Mes ${sheet.meta.mes} ${sheet.meta.inicio ? `del ${sheet.meta.inicio}` : ''}`
      : 'Corte'

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <ReportHeader title="ASÍ VAMOS" subtitle="Resumen Ejecutivo" tags={null} />

        <Grid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            emphasis
            label="RADICACIONES TOTALES (A HOY)"
            value={f(totalAHoy)}
            sub={`${variation(totalAHoy, totalDebeLlevar) != null ? fmtPct(variation(totalAHoy, totalDebeLlevar)) : '—'} vs debe llevar`}
          />
          <KpiCard
            label="COTIZACIONES TOTALES (A HOY)"
            value={f(totalAHoyCoti)}
            sub={`${variation(totalAHoyCoti, totalDebeLlevarCoti) != null ? fmtPct(variation(totalAHoyCoti, totalDebeLlevarCoti)) : '—'} vs debe llevar`}
          />
          <KpiCard label="EFECTIVIDAD GLOBAL %" value={fmtPct(totalEfectividad)} sub="Promedio asesores" />
          <KpiCard label="SEGUIMIENTOS PENDIENTES" value={fInt(totalPendiente)} sub={`Realizados ${fInt(totalRealizado)}`} />
        </Grid>

        <ChartCard title="EVOLUCIÓN DE RADICACIONES (A HOY VS DEBE LLEVAR)" description={`Por asesor · ${corteLabel}`}>
          <MultiSeriesChart
            data={evoData}
            xKey="label"
            series={[
              { key: 'aHoy', name: 'A hoy', color: C.primary },
              { key: 'debeLlevar', name: 'Debe llevar', color: C.compare },
            ]}
            variant="lines"
            format={fInt}
          />
        </ChartCard>
      </section>

      <section className="flex flex-col gap-4">
        <ReportHeader title="ANÁLISIS DE CAUSAS" tags={null} />

        <Grid className="lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" title="ATRIBUCIÓN POR CANALES" description="Radicaciones vs Cotizaciones (A Hoy)">
            <MultiSeriesChart
              data={canalRows}
              xKey="label"
              series={[
                { key: 'rads', name: 'Radicaciones', color: C.primary },
                { key: 'coti', name: 'Cotizaciones', color: C.compare },
              ]}
              variant="bars"
              format={fInt}
            />
          </ChartCard>

          <ChartCard title="RENDIMIENTO POR ASESOR (Top 5)" description="% Cumplimiento radicaciones">
            <MultiSeriesChart
              data={perfData.slice(0, 5)}
              xKey="label"
              series={[
                { key: 'cumplimiento', name: '% Cumplimiento', color: C.primary },
              ]}
              variant="bars"
              horizontal
              format={(v) => fmtPct(v)}
              height={300}
            />
          </ChartCard>

          <ChartCard title="CALIDAD DE DATA ACTIVA" description="Clientes por nivel">
            <DonutChart
              items={[
                { label: 'Alta', value: alta },
                { label: 'Media', value: media },
                { label: 'Baja', value: baja },
              ]}
              centerLabel="Total data activa"
              centerValue={fInt(totalData)}
              format={fInt}
            />
          </ChartCard>
        </Grid>

        {/* Tabla detalle por asesor */}
        <section className="mt-2">
          <h3 className="text-base font-semibold text-ink">Detalle por asesor</h3>
          <div className="overflow-hidden rounded-xl border bg-card shadow-card">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b bg-secondary/60">
                  <th className="text-left px-4 py-2 text-muted-foreground font-medium">Asesor</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">Meta</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">Debe llevar</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">A hoy</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">% Cumpl.</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">Efectividad</th>
                  <th className="text-right px-4 py-2 text-muted-foreground font-medium">Pendientes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.asesor} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2 font-medium text-ink">{r.asesor}</td>
                    <td className="px-4 py-2 tabular text-right text-ink">{f(r.metaVentas)}</td>
                    <td className="px-4 py-2 tabular text-right text-ink">{f(r.debeLlevar)}</td>
                    <td className="px-4 py-2 tabular text-right text-ink">{f(r.aHoy)}</td>
                    <td className="px-4 py-2 tabular text-right">{fmtPct(r.cumplimientoRads)}</td>
                    <td className="px-4 py-2 tabular text-right">{fmtPct(r.efectividad)}</td>
                    <td className="px-4 py-2 tabular text-right">{fInt(r.seguimientoPendiente)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-secondary/50 font-semibold text-ink">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 tabular text-right">{f(totalMeta)}</td>
                  <td className="px-4 py-3 tabular text-right">{f(totalDebeLlevar)}</td>
                  <td className="px-4 py-3 tabular text-right">{f(totalAHoy)}</td>
                  <td className="px-4 py-3 tabular text-right">{fmtPct(totalCumplimientoRads)}</td>
                  <td className="px-4 py-3 tabular text-right">{fmtPct(totalEfectividad)}</td>
                  <td className="px-4 py-3 tabular text-right">{fInt(totalPendiente)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  )
}
