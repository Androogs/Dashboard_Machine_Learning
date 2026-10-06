/**
 * Tipos del modelo de datos.
 *
 * Flujo:  Excel (ArrayBuffer)
 *   → parser/readWorkbook  → RawSheet (matriz de celdas normalizadas)
 *   → parser/detect         → ParsedSheet (MatrixSheet | FlatSheet | EmptySheet)
 *   → analysis/*            → modelos listos para gráficas, KPIs, tablas e insights
 */

/* ------------------------------------------------------------------ */
/* Celdas crudas                                                       */
/* ------------------------------------------------------------------ */

/** Fecha leída de Excel, ya convertida sin desfases de zona horaria. */
export interface ExcelDate {
  kind: 'date'
  y: number
  m: number // 1-12
  d: number
  /** Milisegundos UTC (para ordenar/agrupar) */
  ms: number
}

export type Cell = string | number | boolean | null | ExcelDate

export interface RawSheet {
  name: string
  rows: Cell[][]
  /** Ancho máximo de columnas con datos */
  width: number
}

/* ------------------------------------------------------------------ */
/* Periodos                                                            */
/* ------------------------------------------------------------------ */

export interface Period {
  /** "2026-09" (mensual) o "2026" (anual) */
  key: string
  year: number
  /** null cuando el periodo es anual */
  month: number | null
  label: string
}

/* ------------------------------------------------------------------ */
/* Hoja tipo MATRIZ (Informe comercial: agencias × periodos/métricas)  */
/* ------------------------------------------------------------------ */

/**
 * Rol de cada métrica de columna:
 * - value:   valor sumable (TOTAL VENTAS, MOSTRADOR, TALLER, TOTAL MO, ACUMULADO)
 * - target:  meta/presupuesto
 * - ratio:   porcentaje calculado en Excel (CUMPLIMIENTO, %, PARTICIPACION)
 * - derived: diferencia calculada en Excel (COMPARATIVO, DIFERENCIA)
 *
 * Los ratios y derivados del Excel NO se usan para los cálculos: el sistema
 * recalcula todo desde los valores base para evitar errores de fórmulas.
 */
export type MetricRole = 'value' | 'target' | 'ratio' | 'derived'

export interface MatrixColumn {
  index: number
  metricKey: string
  metricLabel: string
  role: MetricRole
  period: Period | null
}

export interface MetricInfo {
  key: string
  label: string
  role: MetricRole
  /** Periodos disponibles para esta métrica (ordenados) */
  periods: Period[]
}

export type MatrixRowType = 'item' | 'subtotal' | 'grandtotal'

export interface MatrixRow {
  label: string
  group: string
  type: MatrixRowType
  /** Valores alineados con MatrixSheet.columns (mismo orden) */
  values: (number | null)[]
  /** Subtotal parcial (ej: "SUB TOTAL" antes del "TOTAL SUZUKI"): no se usa en el control de calidad */
  partial?: boolean
}

/**
 * Unidad de medida de los valores:
 * - money: pesos colombianos ($ 460,0 M)
 * - units: cantidades (3.410 motos / 25 unid.)
 */
export interface UnitInfo {
  kind: 'money' | 'units'
  /** Sufijo para cantidades: "motos", "unid." */
  label: string
}

export interface MatrixSheet {
  kind: 'matrix'
  /**
   * informe: Informe comercial (fila de métricas + fila de periodos)
   * bloques: tablas comparativas (encabezado con fechas o meses sobre años, varias tablas por hoja)
   */
  source: 'informe' | 'bloques'
  unit: UnitInfo
  /** Notas de interpretación que se muestran en el reporte (supuestos, columnas omitidas, etc.) */
  notes: string[]
  /** Nombre real de la hoja en Excel (una hoja puede contener varias tablas) */
  sheetName?: string
  /** Nombre corto de la tabla dentro de la hoja (ej: "Sede", "Marca") */
  tableLabel?: string
  id: string
  name: string
  docIndex: number
  fileName: string
  title: string
  dimensionLabel: string
  columns: MatrixColumn[]
  metrics: MetricInfo[]
  groups: string[]
  rows: MatrixRow[]
}

/* ------------------------------------------------------------------ */
/* Hoja tipo PLANA (bases del DMS: un registro por fila)               */
/* ------------------------------------------------------------------ */

export type FlatColumnType = 'date' | 'measure' | 'number' | 'category' | 'text' | 'id' | 'ratio' | 'empty'

export interface FlatColumn {
  name: string
  type: FlatColumnType
  distinct: number
  filled: number
  /** Medida monetaria (pesos) o conteo/numérica */
  measureKind?: 'money' | 'number'
  /** true si la columna fue creada por el sistema (no viene en el Excel) */
  derived?: boolean
}

export interface FlatSheet {
  kind: 'flat'
  sheetName?: string
  tableLabel?: string
  id: string
  name: string
  docIndex: number
  fileName: string
  /** Nombre del reporte detectado en el preámbulo (ej: "100037 Asi vamos") */
  title: string
  /** Sufijo para medidas de cantidad: "motos" o "unid." */
  unitLabel: string
  /** Fecha de generación del reporte, si aparece en el preámbulo */
  generatedAt: string | null
  headerRow: number
  rowCount: number
  columns: FlatColumn[]
  /**
   * Datos por columna (solo date/measure/number/category).
   * - date → milisegundos UTC (number) o null
   * - measure/number → number o null
   * - category → string o null
   */
  data: Record<string, (number | string | null)[]>
}

export interface EmptySheet {
  kind: 'empty'
  id: string
  name: string
  docIndex: number
  fileName: string
  reason: string
  /** true si la hoja se omitió a propósito (ej: hojas contables muy grandes) */
  skipped?: boolean
}

/* ------------------------------------------------------------------ */
/* Hoja RUNT (participación de mercado por marca: Nacional, Valle…)    */
/* ------------------------------------------------------------------ */

export interface RuntRow {
  marca: string
  prev: number | null
  cur: number | null
}

export interface RuntTable {
  /** "Nacional", "Valle", … (o "Sumoto" para las ventas propias) */
  name: string
  rows: RuntRow[]
  /** Total del Excel (si existe) y total recalculado */
  totalExcel: { prev: number | null; cur: number | null }
  total: { prev: number; cur: number }
}

export interface RuntSheet {
  kind: 'runt'
  id: string
  name: string
  sheetName?: string
  docIndex: number
  fileName: string
  title: string
  /** Años comparados: [anterior, actual] */
  years: [number, number]
  /** Corte del acumulado (ej: "septiembre"), si aparece en la hoja */
  cutoff: string | null
  /** Mercados (Nacional, Valle…) */
  markets: RuntTable[]
  /** Ventas propias por marca (tabla "COMPARATIVO SUMOTO"), si existe */
  own: RuntTable | null
  notes: string[]
}

export type ParsedSheet = MatrixSheet | FlatSheet | RuntSheet | EmptySheet

export interface ParsedWorkbook {
  docIndex: number
  fileName: string
  fileSize: number
  sheets: ParsedSheet[]
  parseMs: number
}

/* ------------------------------------------------------------------ */
/* Reportes (lo que muestra el dashboard)                              */
/* ------------------------------------------------------------------ */

/**
 * Un reporte es una "página" del dashboard:
 * - single: una hoja analizada sola (comparativa intra-archivo)
 * - pair:   la misma hoja en Documento 1 vs Documento 2
 */
export type Report =
  | { id: string; mode: 'single'; title: string; sheet: MatrixSheet | FlatSheet | RuntSheet }
  | { id: string; mode: 'pair'; title: string; a: MatrixSheet | FlatSheet; b: MatrixSheet | FlatSheet }

export type InsightType = 'hallazgo' | 'riesgo' | 'oportunidad' | 'calidad'

export interface Insight {
  type: InsightType
  title: string
  detail: string
  /** Mayor = más relevante (se usa para ordenar el resumen ejecutivo) */
  weight: number
  reportId?: string
  reportTitle?: string
}

export type UploadMode = 'single' | 'compare'

/* ------------------------------------------------------------------ */
/* Filtro de período (control global del dashboard)                    */
/* ------------------------------------------------------------------ */

/**
 * Cómo se compara el rango actual contra otro:
 * - none:   sin comparación.
 * - year:   año anterior, mismo rango.
 * - month:  mes anterior, mismo tamaño de rango.
 * - custom: rango personalizado definido por el usuario.
 */
export type CompareMode = 'none' | 'year' | 'month' | 'custom'

/**
 * Modo de filtro, derivado de from/to:
 * - mes:     from === to, ambos "YYYY-MM".
 * - acum:    from === "YYYY-01", to === "YYYY-MM" (mismo año).
 * - periodo: from === to, ambos "YYYY" (año completo).
 * - rango:   cualquier otra combinación.
 */
export type FilterMode = 'mes' | 'acum' | 'periodo' | 'rango'

/**
 * Filtro de período aplicado a un reporte.
 *
 * - `from` y `to` son claves del tipo que usa `Period.key`:
 *   "YYYY-MM" (mensual) o "YYYY" (anual).
 * - `customFrom` y `customTo` solo se usan cuando `compare === 'custom'`.
 */
export interface PeriodFilter {
  from: string
  to: string
  compare: CompareMode
  customFrom?: string
  customTo?: string
}
