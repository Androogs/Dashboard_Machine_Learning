// src/lib/budgetParser.ts
import * as XLSX from 'xlsx';
import type {
  BudgetDocument,
  BudgetSheet,
  BudgetSections,
  BudgetResumenMarca,
} from '../types/budget';
import {
  parseCotejoBlock,
  parsePresupuestoBlock,
  parseModeloSedeBlock,
  isSubHeaderRow,
  buildCotejoCell,
} from './budgetParse';

const MARCAS = ['AKT', 'SUZUKI', 'HERO', 'BAJAJ', 'HONDA'] as const;

function sheetToRows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }) as unknown[][];
}

function extractTitulo(rows: unknown[][]): string {
  for (const r of rows) {
    const v = String(r?.[0] ?? '').trim();
    if (v) return v;
  }
  return '';
}

function extractNotas(rows: unknown[][]): string[] {
  const notas: string[] = [];
  for (const r of rows) {
    const v = String(r?.[0] ?? '').trim();
    if (!v) continue;
    if (/^(LEYENDA|Nota:|CRITERIO|Hero Florida|≥|85%|< 85%)/i.test(v)) {
      notas.push(v);
    }
  }
  return notas;
}

function findSection(rows: unknown[][], n: number, from = 0): number {
  const re = new RegExp(`^SECCIÓN\\s+${n}\\b`, 'i');
  for (let i = from; i < rows.length; i++) {
    if (re.test(String(rows[i]?.[0] ?? '').trim())) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Parseo de una hoja de marca
// ---------------------------------------------------------------------------

export function parseMarcaSheet(sheetName: string, ws: XLSX.WorkSheet): BudgetSheet {
  const rows = sheetToRows(ws);
  const titulo = extractTitulo(rows);
  const notas = extractNotas(rows);

  const s1 = findSection(rows, 1);
  const s2 = findSection(rows, 2);
  const s3 = findSection(rows, 3);
  const s4 = findSection(rows, 4);

  const sections: BudgetSections = {
    presupuestoSede: [],
    totalPresupuestoSede: null,
    cotejoSede: [],
    cotejoModelo: [],
    cotejoModeloSede: [],
  };

  if (s1 >= 0) {
    const { rows: pres, total } = parsePresupuestoBlock(rows, s1 + 1);
    sections.presupuestoSede = pres;
    sections.totalPresupuestoSede = total;
  }
  if (s2 >= 0) {
    const { rows: c } = parseCotejoBlock(rows, s2 + 1);
    sections.cotejoSede = c;
  }
  if (s3 >= 0) {
    const { rows: c } = parseCotejoBlock(rows, s3 + 1);
    sections.cotejoModelo = c;
  }
  if (s4 >= 0) {
    const { groups } = parseModeloSedeBlock(rows, s4 + 1);
    sections.cotejoModeloSede = groups;
  }

  return {
    sheetName,
    marca: MARCAS.find((m) => sheetName.toUpperCase().includes(m)) ?? sheetName,
    titulo,
    notas,
    sections,
  };
}

// ---------------------------------------------------------------------------
// Parseo del resumen general
// ---------------------------------------------------------------------------

export function parseResumen(ws: XLSX.WorkSheet): BudgetDocument['resumen'] {
  const rows = sheetToRows(ws);
  const leyenda: string[] = [];
  const notas: string[] = [];
  const filas: BudgetResumenMarca[] = [];
  let total: BudgetResumenMarca | null = null;

  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (/^MARCA/i.test(String(rows[i]?.[0] ?? '').trim())) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return null;

  let i = headerIdx + 1;
  if (isSubHeaderRow(rows[i] ?? [])) i++;

  for (; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const marca = String(row[0] ?? '').trim();
    if (marca === '') break;
    if (/^(LEYENDA|Nota:)/i.test(marca)) break;

    const meses = [];
    for (let m = 0; m < 9; m++) {
      const base = 1 + m * 3;
      meses.push(buildCotejoCell(row[base], row[base + 1], row[base + 2]));
    }
    const acBase = 1 + 9 * 3;
    const acumulado = buildCotejoCell(row[acBase], row[acBase + 1], row[acBase + 2]);
    const item: BudgetResumenMarca = { marca, meses, acumulado };
    if (/^TOTAL/i.test(marca)) total = item;
    else filas.push(item);
  }

  for (; i < rows.length; i++) {
    const v = String(rows[i]?.[0] ?? '').trim();
    if (!v) continue;
    if (/^(≥|85%|< 85%)/i.test(v)) leyenda.push(v);
    else notas.push(v);
  }

  return { filas, total, leyenda, notas };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function parseBudgetFile(file: File): Promise<BudgetDocument> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  const warnings: string[] = [];
  const marcas: BudgetSheet[] = [];
  let resumen: BudgetDocument['resumen'] = null;
  let corte: string | null = null;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const upper = name.trim().toUpperCase();

    if (upper.startsWith('RESUMEN')) {
      resumen = parseResumen(ws);
      const rows = sheetToRows(ws);
      for (const r of rows) {
        const v = String(r?.[0] ?? '');
        const m = v.match(/Corte al (.+)/i);
        if (m) {
          corte = m[1].trim();
          break;
        }
      }
    } else if ((MARCAS as readonly string[]).includes(upper)) {
      marcas.push(parseMarcaSheet(name, ws));
    } else {
      warnings.push(`Hoja ignorada: "${name}"`);
    }
  }

  if (marcas.length === 0) warnings.push('No se encontraron hojas de marca.');
  if (!resumen) warnings.push('No se encontró RESUMEN GENERAL.');

  return { fileName: file.name, corte, marcas, resumen, warnings };
}