import { useMemo } from 'react';
import { useBudgetStore } from '@/store/useBudgetStore';
import {
  kpiDeMarca, kpiGlobal, formatUnidades, formatPct, semaforoClasses,
} from '@/lib/budgetSelectors';
import type { Semaforo } from '@/types/budget';

function SemaforoBadge({ s }: { s: Semaforo }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${semaforoClasses(s)}`}>
      {s === 'na' ? 'N/A' : s.toUpperCase()}
    </span>
  );
}

function KpiCard({
  title, value, subtitle, delta, tone = 'blue', semaforo,
}: {
  title: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
  tone?: 'blue' | 'green' | 'amber' | 'coral';
  semaforo?: Semaforo;
}) {
  const topBar = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    coral: 'bg-orange-500',
  }[tone];

  const deltaColor = delta == null ? '' : delta >= 0 ? 'text-green-600' : 'text-red-600';
  const arrow = delta == null ? '' : delta >= 0 ? '▲' : '▼';

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className={`h-1 w-full ${topBar}`} />
      <div className="p-4">
        <div className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</div>
        {delta != null && (
          <div className={`mt-0.5 text-xs ${deltaColor}`}>
            {arrow} {(Math.abs(delta) * 100).toFixed(1)} % vs Ago 2026
          </div>
        )}
        {subtitle && !delta && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        {semaforo && <div className="mt-2"><SemaforoBadge s={semaforo} /></div>}
      </div>
    </div>
  );
}

export function BudgetReport() {
  const doc = useBudgetStore((s) => s.doc);
  const global = useMemo(() => (doc ? kpiGlobal(doc) : null), [doc]);
  const marcas = useMemo(
    () => (doc ? doc.resumen?.filas.map((f) => kpiDeMarca(doc, f.marca)!).filter(Boolean) ?? [] : []),
    [doc],
  );

  if (!doc || !global) {
    return <div className="p-8 text-center text-muted-foreground">Sin datos de presupuesto.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="rounded-xl border bg-card p-6">
        <h1 className="text-xl font-semibold text-ink">
          Ejecución presupuestal 2026 — Corte {doc.corte ?? 'N/D'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Presupuesto definitivo vs ventas reales netas (ventas − devoluciones)
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total Sep 2026"
          value={formatUnidades(global.realSep)}
          delta={global.varSepAgo}
          tone="blue"
        />
        <KpiCard
          title="Total Ago 2026"
          value={formatUnidades(global.realAgo)}
          subtitle="Mes anterior"
          tone="green"
        />
        <KpiCard
          title="Cumplimiento Sep"
          value={formatPct(global.pctSep)}
          subtitle={`Meta ${formatUnidades(global.presSep)}`}
          semaforo={global.semaforoSep}
          tone="amber"
        />
        <KpiCard
          title="Mayor crecimiento"
          value={global.mayorCrecimiento ? `+${(global.mayorCrecimiento.var * 100).toFixed(1)} %` : '—'}
          subtitle={global.mayorCrecimiento?.marca}
          tone="coral"
        />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Presupuesto vs Real por marca — Septiembre 2026</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Marca</th>
              <th className="px-4 py-2 text-right">Presupuesto</th>
              <th className="px-4 py-2 text-right">Real</th>
              <th className="px-4 py-2 text-right">% Cumpl.</th>
              <th className="px-4 py-2 text-center">Semáforo</th>
              <th className="px-4 py-2 text-right">Acum. Ene–Sep</th>
              <th className="px-4 py-2 text-right">Acum. %</th>
            </tr>
          </thead>
          <tbody>
            {marcas.map((m) => (
              <tr key={m.marca} className="border-t">
                <td className="px-4 py-2 font-medium">{m.marca}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatUnidades(m.presSep)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatUnidades(m.realSep)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPct(m.pctSep)}</td>
                <td className="px-4 py-2 text-center"><SemaforoBadge s={m.semaforoSep} /></td>
                <td className="px-4 py-2 text-right tabular-nums">{formatUnidades(m.realAcum)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPct(m.pctAcum)}</td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30 font-semibold">
              <td className="px-4 py-2">TOTAL</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatUnidades(global.presSep)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatUnidades(global.realSep)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatPct(global.pctSep)}</td>
              <td className="px-4 py-2 text-center"><SemaforoBadge s={global.semaforoSep} /></td>
              <td className="px-4 py-2 text-right tabular-nums">{formatUnidades(global.realAcum)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{formatPct(global.pctAcum)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {doc.resumen?.notas && doc.resumen.notas.length > 0 && (
        <ul className="space-y-1 px-1 text-[11px] text-muted-foreground">
          {doc.resumen.notas.map((n, i) => <li key={i}>* {n}</li>)}
        </ul>
      )}
    </div>
  );
}
