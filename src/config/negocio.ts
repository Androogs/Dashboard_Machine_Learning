/**
 * REGLAS DE NEGOCIO CONFIGURABLES
 * ------------------------------------------------------------------
 * Este archivo concentra las palabras clave que usa el parser para
 * reconocer columnas y métricas de los reportes de Advance DMS.
 * Ajusta aquí sin tocar la lógica del parser.
 */

/** Umbrales de cumplimiento de meta (razón real/meta). */
export const UMBRALES_CUMPLIMIENTO = {
  /** ≥ este valor: cumple (verde) */
  cumple: 1,
  /** ≥ este valor y < cumple: en riesgo (ámbar). Por debajo: crítico (rojo) */
  riesgo: 0.8,
}

/** Variación mínima (en valor absoluto) para destacar un cambio en los insights. */
export const VARIACION_RELEVANTE = 0.1

/** Diferencia tolerada entre los totales del Excel y los recalculados (0,5 %). */
export const TOLERANCIA_TOTALES = 0.005



/* ---------------- Hojas tipo matriz (Informe comercial) ---------------- */

/** Expresiones para clasificar las cabeceras de métricas. */
export const METRICAS = {
  meta: /^(meta|presupuesto|objetivo|ppto)\b/i,
  ratio: /(cumplimiento|participacion|porcentaje|^%$|%)/i,
  derivada: /(comparativo|diferencia|variacion|desviacion)/i,
  /** Encabezados de tablas dinámicas de Excel ("Suma de cant", "Cuenta de...") */
  agregada: /^(suma de|cuenta de|promedio de|max de|min de)\b/i,
  principal: [/total ventas/i, /total mo/i, /^total/i, /ventas/i, /acumulado/i],
}

/** Filas que representan totales dentro de la matriz. */
export const FILA_TOTAL = /^(total|gran total|subtotal)\b/i

/* ---------------- Hojas planas (bases del DMS) ---------------- */

/** Columnas que nunca se suman (identificadores, códigos, contadores técnicos). */
export const COLUMNAS_ID =
  /^(id|id_.*|.*_id|id1|numero|nro|nit|codigo|renglon|sw|orden ant|origen|pre\/nro|ano|año|modelo|dias|faltan|facs|ejec|pend|cre|cop|ctot|obj|km|t_o|clase_operacion|iva|iva3|iva4|placa|vin|telefono|celular)$/i

/** Columnas monetarias (se formatean en pesos). */
export const COLUMNAS_DINERO =
  /(venta|valor|total|utilidad|costo|precio|neto|subtotal|descuento|iva|ingreso|margen)/i

/** Prioridad de medida por defecto. */
export const PRIORIDAD_MEDIDA = [/^ventas$/i,/^precio\+iva$/i,/precio.?iva/i,/valor_subtotal/i,/^total neto$/i,/valor_total/i,/^total$/i,/valor/i,/utilidad/i,]
/** Prioridad de dimensión por defecto. */
export const PRIORIDAD_DIMENSION = [/bodega|agencia|sede|sucursal/i,/^marca$/i,/^(sub)?grupo$/i,/vendedor|asesor/i,/motivo|tipo|estado/i,
]
/** Prioridad de columna de fecha. */
export const PRIORIDAD_FECHA = [/fecha_factura/i, /fecha.*fact/i, /^fecha$/i, /fecha/i]

/** Columnas de utilidad y de ventas para calcular margen (si ambas existen). */
export const COLUMNA_UTILIDAD = /^utilidad$|^valor utilidad$|^utilidad_tot$/i

/**
 * SUPUESTO: marca según el primer dígito del código de bodega.
 * Se dedujo del Informe Comercial (1xx Suzuki, 2xx AKT, 3xx Bajaj,
 * 4xx Hero, 5xx Honda). Valídalo con el área comercial y ajústalo aquí.
 */
export const MARCA_POR_PREFIJO_BODEGA: Record<string, string> = {
  '1': 'SUZUKI',
  '2': 'AKT',
  '3': 'BAJAJ',
  '4': 'HERO',
  '5': 'HONDA',
}

/** Nombre de la dimensión derivada que se crea con la regla anterior. */
export const DIMENSION_MARCA_DERIVADA = 'Marca (por código de bodega)'

/* ---------------- Selección de hojas ---------------- */

/**
 * Hojas que NO se procesan por su tamaño y porque no aportan al dashboard comercial.
 * Pagarés pendientes se procesa cuando viene acotada y queda desmarcada por confidencialidad.
 */
export const HOJAS_NO_PROCESAR = /^terceros\b/i

/**
 * Hojas que se procesan pero quedan DESMARCADAS por defecto en la revisión de hojas:
 * estados financieros, contabilidad, datos de socios o terceros. Puedes marcarlas manualmente.
 */
export const HOJAS_CONFIDENCIALES =
  /(terceros|pagar[eé]s? pendientes|socio|reparto|mayor|pcga|balance|revelaciones|estado de|flujo|patri|paraflujo|indice|revisoria|requerimiento|gasto|presupuesto|fiscal|rentabilidad|analisis ingresos|caratula|^hoja\d*$|anulacion)/i

/* ---------------- Marcas y colores (paleta del reporte de gerencia) ---------------- */

/** Nombre de la empresa: identifica la tabla de ventas propias en el reporte RUNT. */
export const EMPRESA = 'SUMOTO'

/**
 * Marcas conocidas: se usan para nombrar grupos cuando una tabla separa las marcas
 * solo con filas TOTAL (ej: MOTOS COMPARATIVO), y para asignar colores.
 * La clave es el texto a buscar en los nombres de sedes/agencias.
 */
export const MARCAS: { key: RegExp; label: string; color: string }[] = [
  { key: /suzuki/i, label: 'Suzuki', color: '#378ADD' },
  { key: /\bakt\b/i, label: 'AKT', color: '#1D9E75' },
  { key: /\bhero\b/i, label: 'Hero', color: '#D85A30' },
  { key: /bajaj/i, label: 'Bajaj', color: '#BA7517' },
  { key: /honda/i, label: 'Honda', color: '#7F77DD' },
  { key: /fratel+[iy]/i, label: 'Fratelly', color: '#888780' },
  { key: /yamaha/i, label: 'Yamaha', color: '#1a2b5e' },
  { key: /victory/i, label: 'Victory', color: '#9B59B6' },
  { key: /\btvs\b/i, label: 'TVS', color: '#0F6E56' },
  { key: /auteco/i, label: 'Auteco', color: '#2e3d7a' },
]

/** Color del año/periodo de comparación (barras "2025") */
export const COLOR_COMPARACION = '#B5D4F4'
/** Paleta para donas por tienda (top 10) */
export const PALETA_TIENDAS = ['#185FA5', '#1D9E75', '#D85A30', '#BA7517', '#7F77DD', '#0F6E56', '#993C1D', '#2e3d7a', '#639922', '#5F5E5A']
/** Paleta del reporte RUNT */
export const PALETA_RUNT = ['#1a2b5e', '#E05A1E', '#1D9E75', '#378ADD', '#BA7517', '#D85A30', '#7F77DD', '#9B59B6', '#888780', '#0F6E56', '#639922', '#5F5E5A', '#993C1D', '#2e3d7a']

export const brandOf = (text: string) => MARCAS.find((m) => m.key.test(text))
export const colorOf = (text: string, fallback = '#378ADD') => brandOf(text)?.color ?? fallback

/* ---------------- Tablero comercial (Así vamos compilado) ---------------- */

/**
 * SUPUESTO: marca de asesores cuyo bloque no tiene título en la hoja ASI VAMOS y que no
 * aparecen en las hojas del CRM. Jenny y Victoria se toman como Honda porque en el reporte
 * "ASI VAMOS HONDA Y HERO" su bloque cerraba con "TOTAL HONDA". Ajusta aquí si cambia.
 */
export const MARCA_POR_ASESOR: Record<string, string> = {
  JENNY: 'Honda',
  VICTORIA: 'Honda',
}

/**
 * Jefe comercial por sede/marca del tablero Así vamos (dato del usuario):
 *   Katherine Cuevas Morales → Suzuki (Palmira Principal, Centro, Florida, Candelaria, Pradera)
 *   Diana Mercedes           → Suzuki Cali
 *   Felipe Benítez           → Honda, Auteco y Bajaj
 *   Miller Solarte           → AKT
 * Se evalúan en orden; gana la primera regla que cumpla. Ajusta aquí si cambian.
 */
export const JEFES_COMERCIALES: { jefe: string; sede?: RegExp; marca?: RegExp }[] = [
  { jefe: 'Miller Solarte', marca: /^akt$/i },
  { jefe: 'Felipe Benítez', marca: /^(honda|auteco|bajaj)$/i },
  { jefe: 'Diana Mercedes', sede: /\bcali\b/i },
  { jefe: 'Katherine Cuevas Morales', marca: /^suzuki$/i },
]

/** Nombre del jefe comercial para una sede/marca; '' si no está mapeado. */
export function jefeComercial(sede: string, marca: string): string {
  for (const r of JEFES_COMERCIALES) {
    if (r.sede && r.sede.test(sede)) return r.jefe
    if (r.marca && r.marca.test(marca)) return r.jefe
  }
  return ''
}

/* ---------------- Segmentos de la cartera auxiliar (informe de gerencia) ---------------- */

/**
 * Segmentación del saldo MOROSO por responsable, según el código del "Tipo 2"
 * de documento (regla dada por la jefatura de cartera para el cobrador 001,
 * grupo 15 – Auxiliar de cartera; aplica a cualquier cobrador filtrado):
 *   A — Auxiliar de cartera Ana (financieras): FG, FJ, FOG, FP, FPA, FR, FB
 *   B — Contabilidad:                          FORA, FORAS, FI, FPI
 *   C — Cajeras:                               RP* (RPE1…RPE22, RPEN) y SE* (SEE…)
 * El código se toma del primer token del "Tipo 2" ("RPE10 - …" → rpe10).
 * Lo que no cae en ninguna lista queda "Sin asignar" (hoy: FP1, FORAZ, FV);
 * para adscribirlo, agrega su código al segmento correspondiente.
 */
export const SEGMENTOS_CARTERA: { id: 'A' | 'B' | 'C'; nombre: string; detalle: string; color: string; match: RegExp }[] = [
  { id: 'A', nombre: 'Financieras (Ana)', detalle: 'FG, FJ, FOG, FP, FPA, FR, FB', color: '#378ADD', match: /^(fg|fj|fog|fp|fpa|fr|fb)\b/ },
  { id: 'B', nombre: 'Contabilidad', detalle: 'FORA, FORAS, FI, FPI', color: '#BA7517', match: /^(fora|foras|fi|fpi)\b/ },
  { id: 'C', nombre: 'Cajeras', detalle: 'RP* (RPE…, RPEN) y SE* (SEE…)', color: '#1D9E75', match: /^(rp|se)/ },
]

/** Grupo para los tipos de documento que no caen en ningún segmento. */
export const SEG_SIN_ASIGNAR = { id: 'otros', nombre: 'Sin asignar', color: '#888780' }

/**
 * Adscripción sugerida de los tipos "Sin asignar" (se muestra solo como nota;
 * si la jefatura la aprueba, muévelos a SEGMENTOS_CARTERA).
 */
export const SUGERENCIA_SEGMENTO: Record<string, string> = {
  fp1: 'Contabilidad (B)',
  foraz: 'Contabilidad (B)',
  fv: 'Financieras (A)',
}
