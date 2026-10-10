// src/types/budget.ts

/** Modo de carga del dashboard */
export type LoadMode = 'sales' | 'budget';

/** Semáforo de cumplimiento */
export type Semaforo = 'verde' | 'ambar' | 'rojo' | 'na';

/** Meses del año (0-indexed para arrays, pero guardamos label) */
export const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
] as const;
export type Mes = typeof MESES[number];

/** Una fila de la Sección 1: presupuesto 12 meses por sede */
export interface BudgetRowSede {
  sede: string;
  /** 12 valores, uno por mes */
  presupuesto: (number | null)[];
  total2026: number | null;
}

/** Celda de cotejo mensual: PRES / REAL / % */
export interface BudgetCotejoCell {
  pres: number | null;
  real: number | null;
  /** % cumplimiento ya calculado en el Excel; null si N/A */
  pct: number | null;
  semaforo: Semaforo;
}

/** Fila de cotejo mensual (Sección 2 por sede, Sección 3 por modelo) */
export interface BudgetCotejoRow {
  /** Nombre de sede o modelo según la sección */
  label: string;
  /** 9 celdas (Ene–Sep) + acumulado */
  meses: BudgetCotejoCell[];
  acumulado: BudgetCotejoCell;
}

/** Sección 4: cotejo modelo × sede, agrupado por sede */
export interface BudgetModeloSedeGroup {
  sede: string;
  rows: BudgetCotejoRow[];
  /** Fila TOTAL de la sede (si existe) */
  total: BudgetCotejoRow | null;
}

/** Las 4 secciones apiladas de cada hoja de marca */
export interface BudgetSections {
  /** Sección 1: presupuesto 12 meses por sede */
  presupuestoSede: BudgetRowSede[];
  totalPresupuestoSede: BudgetRowSede | null;

  /** Sección 2: cotejo Ene–Sep por sede */
  cotejoSede: BudgetCotejoRow[];

  /** Sección 3: cotejo Ene–Sep por modelo */
  cotejoModelo: BudgetCotejoRow[];

  /** Sección 4: cotejo modelo × sede, agrupado por sede */
  cotejoModeloSede: BudgetModeloSedeGroup[];
}

/** Una hoja de marca (AKT, SUZUKI, ...) o el resumen general */
export interface BudgetSheet {
  /** Nombre de la hoja tal cual en el Excel */
  sheetName: string;
  /** Marca: 'AKT' | 'SUZUKI' | ... | 'RESUMEN GENERAL' */
  marca: string;
  /** Título completo de la hoja */
  titulo: string;
  /** Notas al pie detectadas (inconsistencias, criterios de control, leyenda) */
  notas: string[];
  /** Solo para hojas de marca; el resumen general tiene otra forma */
  sections: BudgetSections | null;
}

/** Resumen general: una fila por marca + total */
export interface BudgetResumenMarca {
  marca: string;
  meses: BudgetCotejoCell[];   // 9 meses Ene–Sep
  acumulado: BudgetCotejoCell;
}

/** Documento completo parseado */
export interface BudgetDocument {
  fileName: string;
  /** Fecha de corte detectada en el encabezado */
  corte: string | null;
  /** Hojas de marca (5) */
  marcas: BudgetSheet[];
  /** Resumen general */
  resumen: {
    filas: BudgetResumenMarca[];
    total: BudgetResumenMarca | null;
    leyenda: string[];
    notas: string[];
  } | null;
  /** Advertencias del parser (celdas no parseables, secciones faltantes, etc.) */
  warnings: string[];
}