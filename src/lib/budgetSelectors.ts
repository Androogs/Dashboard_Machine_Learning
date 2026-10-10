import type { BudgetDocument, Semaforo, BudgetCotejoCell } from '@/types/budget';

export interface KpiMarca {
  marca: string;
  presSep: number;
  realSep: number;
  pctSep: number | null;
  semaforoSep: Semaforo;
  realAgo: number;
  pctAgo: number | null;
  varSepAgo: number | null;
  presAcum: number;
  realAcum: number;
  pctAcum: number | null;
  semaforoAcum: Semaforo;
}

export interface KpiGlobal extends KpiMarca {
  topSedeSep: { sede: string; marca: string; real: number } | null;
  mayorCrecimiento: { marca: string; var: number } | null;
}

const SEP = 8;
const AGO = 7;

function celda(meses: BudgetCotejoCell[], i: number): BudgetCotejoCell {
  return meses[i] ?? { pres: null, real: null, pct: null, semaforo: 'na' };
}

export function kpiDeMarca(doc: BudgetDocument, marca: string): KpiMarca | null {
  const fila = doc.resumen?.filas.find((f) => f.marca === marca);
  if (!fila) return null;
  const sep = celda(fila.meses, SEP);
  const ago = celda(fila.meses, AGO);
  const varSepAgo = ago.real && ago.real !== 0 ? ((sep.real ?? 0) - ago.real) / ago.real : null;
  return {
    marca: fila.marca,
    presSep: sep.pres ?? 0,
    realSep: sep.real ?? 0,
    pctSep: sep.pct,
    semaforoSep: sep.semaforo,
    realAgo: ago.real ?? 0,
    pctAgo: ago.pct,
    varSepAgo,
    presAcum: fila.acumulado.pres ?? 0,
    realAcum: fila.acumulado.real ?? 0,
    pctAcum: fila.acumulado.pct,
    semaforoAcum: fila.acumulado.semaforo,
  };
}

export function kpiGlobal(doc: BudgetDocument): KpiGlobal | null {
  const t = doc.resumen?.total;
  if (!t) return null;
  const sep = celda(t.meses, SEP);
  const ago = celda(t.meses, AGO);
  const varSepAgo = ago.real && ago.real !== 0 ? ((sep.real ?? 0) - ago.real) / ago.real : null;

  let topSedeSep: KpiGlobal['topSedeSep'] = null;
  for (const m of doc.marcas) {
    for (const s of m.sections?.cotejoSede ?? []) {
      const sSep = celda(s.meses, SEP);
      if (sSep.real != null && (!topSedeSep || sSep.real > topSedeSep.real)) {
        topSedeSep = { sede: s.label, marca: m.marca, real: sSep.real };
      }
    }
  }

  let mayorCrecimiento: KpiGlobal['mayorCrecimiento'] = null;
  for (const f of doc.resumen?.filas ?? []) {
    const a = celda(f.meses, AGO);
    const s = celda(f.meses, SEP);
    if (a.real != null && a.real > 0 && s.real != null) {
      const v = (s.real - a.real) / a.real;
      if (!mayorCrecimiento || v > mayorCrecimiento.var) {
        mayorCrecimiento = { marca: f.marca, var: v };
      }
    }
  }

  return {
    marca: 'TOTAL',
    presSep: sep.pres ?? 0,
    realSep: sep.real ?? 0,
    pctSep: sep.pct,
    semaforoSep: sep.semaforo,
    realAgo: ago.real ?? 0,
    pctAgo: ago.pct,
    varSepAgo,
    presAcum: t.acumulado.pres ?? 0,
    realAcum: t.acumulado.real ?? 0,
    pctAcum: t.acumulado.pct,
    semaforoAcum: t.acumulado.semaforo,
    topSedeSep,
    mayorCrecimiento,
  };
}

export function formatUnidades(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
}

export function formatPct(p: number | null | undefined): string {
  if (p == null) return 'N/A';
  return `${(p * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 })} %`;
}

export function semaforoClasses(s: Semaforo): string {
  switch (s) {
    case 'verde': return 'bg-green-100 text-green-800 border-green-300';
    case 'ambar': return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'rojo':  return 'bg-red-100 text-red-800 border-red-300';
    default:      return 'bg-muted text-muted-foreground border-border';
  }
}