/**
 * Reporte "ASI VAMOS Consolidado por Marca".
 * Cabecera con pestañas: Vista general + una pestaña por marca (Suzuki, Hero, AKT, Bajaj, Honda, ...).
 * Al hacer click en una marca se muestra su reporte ASI VAMOS (asesores de esa marca).
 * La primera tarjeta de radicación muestra la meta esperada (RAD_META).
 */
import { useState } from 'react'
import type { AsiVamosConsolidadoSheet } from '@/types/report'
import { fmtInt, fmtPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { C } from '@/features/dashboard/charts/theme'
import { ChartCard, Grid, KpiCard, ReportHeader } from './blocks'
import { MultiSeriesChart } from './charts/MultiSeriesChart'
import { DonutChart } from './charts/DonutChart'

const CHIP_STYLE = 'rounded-md px-3 py-1.5 text-xs font-medium transition-colors border'

export function AsiVamosConsolidadoReport({ sheet }: { sheet: AsiVamosConsolidadoSheet }) {
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null) // null = Vista general

  const brands = sheet.brands
  const brandData = sheet.brandData
  const meta = sheet.meta

  // ── Aggregados "Vista general" ──────────────────────────────────────────
  const allRows = brands.flatMap((b) => brandData[b])
  const totalMeta = allRows.reduce((a, r) => a + r.metaVentas, 0)
  const totalAHoy = allRows.reduce((a, r) => a + r.aHoy, 0)
  const totalAHoyCoti = allRows.reduce((a, r) => a + r.aHoyCoti, 0)
  const totalPendiente = allRows.reduce((a, r) => a + r.seguimientoPendiente, 0)
  const totalRealizado = allRows.reduce((a, r) => a + r.seguimientoRealizado, 0)
  const totalEfectividad = allRows.length ? allRows.reduce((a, r) => a + r.efectividad, 0) / allRows.length : 0
  const totalCumplimientoRads = allRows.length ? allRows.reduce((a, r) => a + r.cumplimientoRads, 0) / allRows.length : 0

  // ── Datos de la marca seleccionada ──────────────────────────────────────
  const brandRows = selectedBrand ? brandData[selectedBrand] ?? [] : []
  const brandMeta = brandRows.reduce((a, r) => a + r.metaVentas, 0)
  const brandDebeLlevar = brandRows.reduce((a, r) => a + r.debeLlevar, 0)
  const brandAHoy = brandRows.reduce((a, r) => a + r.aHoy, 0)
  const brandAHoyCoti = brandRows.reduce((a, r) => a + r.aHoyCoti, 0)
  const brandPendiente = brandRows.reduce((a, r) => a + r.seguimientoPendiente, 0)
  const brandEfectividad = brandRows.length ? brandRows.reduce((a, r) => a + r.efectividad, 0) / brandRows.length : 0

  const f = (v: number) => fmtInt(v)

  const corteLabel =
    meta.mes != null
      ? `Mes ${meta.mes}${meta.hoy ? ` (corte ${meta.hoy})` : ''}`
      : 'Sin corte'

  const isGeneral = selectedBrand === null
  const titleBrand = isGeneral ? 'Todas las marcas' : selectedBrand

  return (
    <div className="flex flex-col gap-6">
      {/* ================= CABECERA CON PESTAÑAS POR MARCA ================= */}
      <section className="flex flex-col gap-4">
        <ReportHeader
          title="ASI VAMOS — Consolidado por Marca"
          subtitle={`Corte ${corteLabel} · ${brands.length} marca(s) · ${allRows.length} asesor(es)`}
          tags={null}
        />

        <div className="no-print flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedBrand(null)}
            aria-pressed={isGeneral}
            className={cn(
              CHIP_STYLE,
              isGeneral
                ? 'border-[#1a2b5e] bg-[#1a2b5e] text-white'
                : 'bg-card text-ink/80 hover:border-[#1a2b5e]/50',
            )}
          >
            Vista general
          </button>
          {brands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setSelectedBrand(b)}
              aria-pressed={selectedBrand === b}
              className={cn(
                CHIP_STYLE,
                selectedBrand === b
                  ? 'border-[#1a2b5e] bg-[#1a2b5e] text-white'
                  : 'bg-card text-ink/80 hover:border-[#1a2b5e]/50',
              )}
            >
              {b}
            </button>
          ))}
        </div>

        {/* ================= KPIs ================= */}
        <Grid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard emphasis label="RAD_META (Cantidad esperada)" value={f(isGeneral ? totalMeta : brandMeta)} />
          <KpiCard label="RAD_A_HOY (Radicaciones)" value={f(isGeneral ? totalAHoy : brandAHoy)} sub={`vs meta ${f(isGeneral ? totalMeta : brandMeta)}`} />
          <KpiCard label="COTIZACIONES (A Hoy)" value={f(isGeneral ? totalAHoyCoti : brandAHoyCoti)} />
          <KpiCard label="SEGUIMIENTO PENDIENTE" value={f(isGeneral ? totalPendiente : brandPendiente)} sub={`Realizados ${f(isGeneral ? totalRealizado : 0)}`} />
        </Grid>

        {/* ================= Gráficas ================= */}
        <Grid className="lg:grid-cols-3">
          <ChartCard className="lg:col-span-2" title="RADICACIONES: META vs A HOY por asesor" description={titleBrand}>
            <MultiSeriesChart
              data={brandRows.map((r) => ({ label: r.asesor, meta: r.metaVentas, aHoy: r.aHoy }))}
              xKey="label"
              series={[
                { key: 'meta', name: 'Meta (esperada)', color: C.primary },
                { key: 'aHoy', name: 'A hoy', color: C.compare },
              ]}
              variant="bars"
              format={f}
            />
          </ChartCard>

          <ChartCard title="CALIDAD DE DATA ACTIVA" description="Clientes por nivel">
            <DonutChart
              items={[
                { label: 'Alta', value: brandRows.reduce((a, r) => a + r.alta, 0) },
                { label: 'Media', value: brandRows.reduce((a, r) => a + r.media, 0) },
                { label: 'Baja', value: brandRows.reduce((a, r) => a + r.baja, 0) },
              ]}
              centerLabel="Total data activa"
              centerValue={f(brandRows.reduce((a, r) => a + r.total, 0))}
              format={f}
            />
          </ChartCard>
        </Grid>

        {/* ================= Tabla detalle por asesor ================= */}
        <section className="mt-2">
          <h3 className="text-base font-semibold text-ink">Detalle por asesor — {titleBrand}</h3>
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
                {brandRows.map((r) => (
                  <tr key={r.asesor} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-4 py-2 font-medium text-ink">{r.asesor}</td>
                    <td className="px-4 py-2 tabular text-right text-ink">{f(r.metaVentas)}</td>
                    <td className="px-4 py-2 tabular text-right text-ink">{f(r.debeLlevar)}</td>
                    <td className="px-4 py-2 tabular text-right text-ink">{f(r.aHoy)}</td>
                    <td className="px-4 py-2 tabular text-right">{fmtPct(r.cumplimientoRads)}</td>
                    <td className="px-4 py-2 tabular text-right">{fmtPct(r.efectividad)}</td>
                    <td className="px-4 py-2 tabular text-right">{f(r.seguimientoPendiente)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-secondary/50 font-semibold text-ink">
                  <td className="px-4 py-3">Total {titleBrand}</td>
                  <td className="px-4 py-3 tabular text-right">{f(brandMeta)}</td>
                  <td className="px-4 py-3 tabular text-right">{f(brandDebeLlevar)}</td>
                  <td className="px-4 py-3 tabular text-right">{f(brandAHoy)}</td>
                  <td className="px-4 py-3 tabular text-right">{fmtPct(totalCumplimientoRads)}</td>
                  <td className="px-4 py-3 tabular text-right">{fmtPct(isGeneral ? totalEfectividad : brandEfectividad)}</td>
                  <td className="px-4 py-3 tabular text-right">{f(brandPendiente)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  )
}
