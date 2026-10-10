// src/lib/budgetParse.ts
import type {
  BudgetCotejoCell,
  BudgetCotejoRow,
  BudgetModeloSedeGroup,
  BudgetRowSede,
  Semaforo,
} from '../types/budget';

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------

/** Convierte un valor de celda a number | null. Maneja '', '-', 'N/A', '%'. */
export function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === 'N/A' || s.toUpperCase() === 'NA') return null;
  const cleaned = s.replace(/[%,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Calcula el semáforo a partir del % de cumplimiento. */
export function calcSemaforo(pct: number | null): Semaforo {
  if (pct == null) return 'na';
  if (pct >= 1) return 'verde';
  if (pct >= 0.85) return 'ambar';
  return 'rojo';
}

/**
 * Construye una celda de cotejo a partir de PRES, REAL, %.
 * Si el % viene vacío o el PRES es 0, calcula el % manualmente
 * (o lo deja null si no es calculable).
 */
export function buildCotejoCell(
  presRaw: unknown,
  realRaw: unknown,
  pctRaw: unknown,
): BudgetCotejoCell {
  const pres = toNumber(presRaw);
  const real = toNumber(realRaw);
  let pct = toNumber(pctRaw);

  if (pct == null && pres != null && real != null) {
    pct = pres === 0 ? null : real / pres;
  }
  if (pct === 0 && (pres == null || pres === 0)) pct = null;

  return { pres, real, pct, semaforo: calcSemaforo(pct) };
}

// ---------------------------------------------------------------------------
// Detección de secciones
// ---------------------------------------------------------------------------

const RE_SECCION = /^SECCIÓN\s+(\d)/i;
const RE_SEDE_HEADER = /^►\s*SEDE:\s*(.+)$/i;

/** Indica si una fila parece ser el encabezado de meses de una sección de cotejo. */
export function isCotejoHeaderRow(row: unknown[]): boolean {
  const a = String(row[0] ?? '').trim().toUpperCase();
  if (a !== 'SEDE' && a !== 'MODELO') return false;
  return row.some((c) => /ENERO/i.test(String(c ?? '')));
}

/** Indica si la fila siguiente es la de PRES/REAL/%CUMPL. */
export function isSubHeaderRow(row: unknown[]): boolean {
  const joined = row.map((c) => String(c ?? '').toUpperCase()).join('|');
  return joined.includes('PRES') && joined.includes('REAL');
}

// ---------------------------------------------------------------------------
// Parseo de una sección de cotejo (S2, S3)
// ---------------------------------------------------------------------------

/**
 * Parsea un bloque de filas de cotejo.
 * `startIdx` debe apuntar a la fila de encabezado (SEDE/MODELO + meses).
 */
export function parseCotejoBlock(
  rows: unknown[][],
  startIdx: number,
): { rows: BudgetCotejoRow[]; nextIdx: number } {
  const out: BudgetCotejoRow[] = [];
  let i = startIdx;

  if (isCotejoHeaderRow(rows[i] ?? [])) i++;
  if (isSubHeaderRow(rows[i] ?? [])) i++;

  for (; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const label = String(row[0] ?? '').trim();

    if (label === '') break;
    if (RE_SECCION.test(label)) break;
    if (RE_SEDE_HEADER.test(label)) break;
    if (isCotejoHeaderRow(row) || isSubHeaderRow(row)) continue;

    const meses: BudgetCotejoCell[] = [];
    for (let m = 0; m < 9; m++) {
      const base = 1 + m * 3;
      meses.push(buildCotejoCell(row[base], row[base + 1], row[base + 2]));
    }
    const acBase = 1 + 9 * 3;
    const acumulado = buildCotejoCell(row[acBase], row[acBase + 1], row[acBase + 2]);

    out.push({ label, meses, acumulado });
  }

  return { rows: out, nextIdx: i };
}

// ---------------------------------------------------------------------------
// Parseo de la Sección 1 (presupuesto 12 meses)
// ---------------------------------------------------------------------------

export function parsePresupuestoBlock(
  rows: unknown[][],
  startIdx: number,
): { rows: BudgetRowSede[]; total: BudgetRowSede | null; nextIdx: number } {
  const out: BudgetRowSede[] = [];
  let total: BudgetRowSede | null = null;
  let i = startIdx;

  if (/^SEDE/i.test(String(rows[i]?.[0] ?? ''))) i++;

  for (; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const sede = String(row[0] ?? '').trim();
    if (sede === '') break;
    if (RE_SECCION.test(sede)) break;

    const presupuesto: (number | null)[] = [];
    for (let m = 0; m < 12; m++) presupuesto.push(toNumber(row[1 + m]));
    const total2026 = toNumber(row[13]);

    const item: BudgetRowSede = { sede, presupuesto, total2026 };
    if (/^TOTAL/i.test(sede)) total = item;
    else out.push(item);
  }

  return { rows: out, total, nextIdx: i };
}

// ---------------------------------------------------------------------------
// Parseo de la Sección 4 (modelo × sede, agrupado por ► SEDE)
// ---------------------------------------------------------------------------

export function parseModeloSedeBlock(
  rows: unknown[][],
  startIdx: number,
): { groups: BudgetModeloSedeGroup[]; nextIdx: number } {
  const groups: BudgetModeloSedeGroup[] = [];
  let i = startIdx;
  let current: BudgetModeloSedeGroup | null = null;

  for (; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const first = String(row[0] ?? '').trim();

    if (first === '') continue;

    const sedeMatch = first.match(RE_SEDE_HEADER);
    if (sedeMatch) {
      if (current) groups.push(current);
      current = { sede: sedeMatch[1].trim(), rows: [], total: null };
      continue;
    }

    if (!current) continue;
    if (isCotejoHeaderRow(row) || isSubHeaderRow(row)) continue;

    const meses: BudgetCotejoCell[] = [];
    for (let m = 0; m < 9; m++) {
      const base = 1 + m * 3;
      meses.push(buildCotejoCell(row[base], row[base + 1], row[base + 2]));
    }
    const acBase = 1 + 9 * 3;
    const acumulado = buildCotejoCell(row[acBase], row[acBase + 1], row[acBase + 2]);
    const item: BudgetCotejoRow = { label: first, meses, acumulado };

    if (/^TOTAL/i.test(first)) current.total = item;
    else current.rows.push(item);
  }

  if (current) groups.push(current);
  return { groups, nextIdx: i };
}