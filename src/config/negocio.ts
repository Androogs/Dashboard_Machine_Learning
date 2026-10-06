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
 * Hojas que NO se procesan (muy grandes y sin valor para el dashboard comercial).
 * Se listan en la revisión como "omitidas". Ej: TERCEROS 2026 (≈180.000 filas con NIT).
 */
export const HOJAS_NO_PROCESAR = /^(terceros|pagar[eé]s pendientes)\b/i

/**
 * Hojas que se procesan pero quedan DESMARCADAS por defecto en la revisión de hojas:
 * estados financieros, contabilidad, datos de socios o terceros. Puedes marcarlas manualmente.
 */
export const HOJAS_CONFIDENCIALES =
  /(terceros|socio|reparto|mayor|pcga|balance|revelaciones|estado de|flujo|patri|paraflujo|indice|revisoria|requerimiento|gasto|presupuesto|fiscal|rentabilidad|analisis ingresos|caratula|^hoja\d*$|anulacion)/i

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
]

/** Color del año/periodo de comparación (barras "2025") */
export const COLOR_COMPARACION = '#B5D4F4'
/** Paleta para donas por tienda (top 10) */
export const PALETA_TIENDAS = ['#185FA5', '#1D9E75', '#D85A30', '#BA7517', '#7F77DD', '#0F6E56', '#993C1D', '#2e3d7a', '#639922', '#5F5E5A']
/** Paleta del reporte RUNT */
export const PALETA_RUNT = ['#1a2b5e', '#E05A1E', '#1D9E75', '#378ADD', '#BA7517', '#D85A30', '#7F77DD', '#9B59B6', '#888780', '#0F6E56', '#639922', '#5F5E5A', '#993C1D', '#2e3d7a']

export const brandOf = (text: string) => MARCAS.find((m) => m.key.test(text))
export const colorOf = (text: string, fallback = '#378ADD') => brandOf(text)?.color ?? fallback
