/**
 * ESTRUCTURA ESPERADA DE LOS EXCEL (Advance DMS)
 * =====================================================================
 * Este archivo documenta los dos tipos de hoja que el sistema reconoce
 * automáticamente y genera datos de ejemplo para probar el dashboard
 * ("Probar con datos de ejemplo" en la pantalla inicial).
 *
 * ⚠️ Los valores son FICTICIOS. No corresponden a cifras reales de SUMOTO.
 *
 * ---------------------------------------------------------------------
 * TIPO 1 · MATRIZ  (ej: INFORME COMERCIAL MES DE SEPTIEMBRE 2026.xlsx)
 * ---------------------------------------------------------------------
 * Hojas: RESULTADOS MES, MES A MES, COMPARATIVO REPUESTOS, ACUMULADO RPTOS,
 *        RESULTADO MO, MES A MES MO, COMPARATIVO MO, ACUMULADO MANO DE OBRA
 *
 *   Fila   A (dimensión)          B          C           D        E              F
 *   1      (vacío)                INFORME MES A MES   ← título (opcional, puede ocupar varias filas)
 *   5      AGENCIA                META       MOSTRADOR   TALLER   TOTAL VENTAS   CUMPLIMIENTO   META ...
 *   6      SUZUKI  ← 1er grupo    2026-01    2026-01     2026-01  2026-01        %              2026-02 ...
 *   7      102 - ... PRINCIPAL    145000000  107201104   ...                                     ← fila de detalle
 *   ...
 *   15     TOTAL                  ...        ← subtotal del grupo (se recalcula)
 *   16     AKT                    (vacío)    ← encabezado de nuevo grupo
 *   ...
 *   35     TOTAL                  ...        ← último TOTAL = total general
 *
 * Reglas de detección:
 *   - Una fila con ≥2 textos (métricas) seguida de una fila con ≥2 fechas o años (periodos).
 *   - Columnas de periodo pueden ser fechas (mensual) o años numéricos (2025, 2026 → anual).
 *   - Métricas reconocidas (ver src/config/negocio.ts):
 *       META → meta | CUMPLIMIENTO, %, PARTICIPACION → ratio (se recalcula)
 *       COMPARATIVO, DIFERENCIA → derivada (se recalcula) | resto → valor sumable
 *   - Fila con etiqueta y sin valores = encabezado de grupo (marca).
 *   - Filas "TOTAL" = subtotales / total general (solo se usan para control de calidad).
 *
 * ---------------------------------------------------------------------
 * TIPO 2 · BASE PLANA  (ej: BASE REPUESTOS 2026.xlsx, BASE MANO DE OBRA ..., INSUMOS ...)
 * ---------------------------------------------------------------------
 *   Fila 1: "Empresa: Sumoto S.A, Usuario: ..., Fecha: jueves, 1 de octubre de 2026, Hora: 17:10 (Filas: ...)"
 *   Fila 3: "100037 Asi vamos"                  ← nombre del reporte del DMS
 *   Fila 5: Fecha_factura | Bodega | Ventas | Utilidad | Costo | Grupo | Subgrupo | Notas_enca | Vendedor
 *   Fila 6+: un registro por fila
 *   Última fila: =SUBTOTAL(...) → se descarta automáticamente
 *
 * Reglas de detección:
 *   - Cabecera = primera fila (de las 40 primeras) con ≥60 % de celdas en texto y datos debajo.
 *   - Tipo de cada columna: fecha (≥70 % fechas), medida (≥90 % números), categoría
 *     (texto con 2-400 valores distintos), texto libre o identificador.
 *   - Si hay una columna "Bodega" con códigos (102, 203, ...), se crea la dimensión
 *     "Marca (por código de bodega)" usando la regla de src/config/negocio.ts.
 *   - Siempre existe la medida "N.º de registros". En bases de facturas de motos
 *     (traen VIN/chasis/motor) la medida por defecto son las unidades ("cant" →
 *     "Unidades vendidas"), por ejemplo Grd_20261002150704.xlsx.
 *
 * ---------------------------------------------------------------------
 * TIPO 3 · TABLAS POR BLOQUES  (Reporte de gerencia y comparativos armados en Excel)
 * ---------------------------------------------------------------------
 * Ej: INFORME DE VENTAS GERENCIA (VENTA MOTOS, MOTOS COMPARATIVO, COMPARATIVO
 *     REPUESTOS/MO), informe comparativo septiembre, comparativo agosto.
 *
 *  Estilo B · meses en texto sobre años (los meses suelen estar en celdas combinadas):
 *     SEDE      | ENERO       | FEBRERO     | ... | TOTAL       | DIFERENCIA | CRECIMIENTO
 *               | 2025 | 2026 | 2025 | 2026 | ... | 2025 | 2026 |
 *     PRINCIPAL | 110  | 127  | ...
 *
 *  Estilo C · una fila con fechas reales, meses o años (la tabla puede empezar en la columna B):
 *     (B)SUZUKI                                        ← título del bloque = grupo
 *     BODEGA | SEDE                      | sep-25 | sep-26 | INCR/DECR | %
 *     101    | ALMACEN PRINCIPAL PALMIRA | 1421   | 1518   | 97        | 7 %
 *            | SUB TOTAL                 | ...                ← subtotal parcial
 *            | TOTAL SUZUKI              | ...                ← total del grupo
 *
 * Reglas de detección (src/parser/blockParser.ts):
 *   - Encabezados en cualquier fila y columna; varias tablas apiladas por hoja.
 *   - Meses en texto con tolerancia a abreviaturas y errores ("SEPT", "SEPTIEMNBRE").
 *   - Años del encabezado que rompen el patrón se corrigen (ej: "2926" → 2026) y se informa.
 *   - Mismos periodos y elementos distintos → grupos (marcas). Periodos distintos → una
 *     sola serie histórica (si un mismo mes trae cifras distintas gana el bloque más reciente;
 *     un cero nunca pisa un dato real).
 *   - Filas debajo del último TOTAL (ej: "Gerencia", "COMERCIAL") son desglose y no se suman.
 *   - DIFERENCIA, INCR/DECR, CRECIMIENTO, % y PARTICIPACIÓN se recalculan.
 *   - Unidad: si >20 % de valores tiene decimales o la mediana ≥ 100.000 → pesos;
 *     si no → cantidades ("motos" cuando el contexto menciona motos; si no "unid.").
 */
import type { Cell, ParsedWorkbook } from '@/types/report'
import { makeDate } from '@/parser/cells'
import { parseRawSheet } from '@/parser/detect'

/* ------------------------------------------------------------------ */
/* Ejemplo TIPO 1: matriz "MES A MES" (3 meses, 2 marcas)              */
/* ------------------------------------------------------------------ */

const meses = [makeDate(2026, 7, 1), makeDate(2026, 8, 1), makeDate(2026, 9, 1)]
const bloque = ['META ', 'MOSTRADOR', 'TALLER ', 'TOTAL VENTAS ', 'CUMPLIMIENTO']

/** [agencia, meta, mostrador, taller] por mes */
const agencias: Array<[string, string, number, [number, number][]]> = [
  ['SUZUKI', '101 - CL 00 00 00 REPUESTOS AGENCIA NORTE', 120_000_000, [[78_000_000, 36_000_000], [81_500_000, 38_200_000], [90_100_000, 41_000_000]]],
  ['SUZUKI', '104 - CR 00 00 00 REPUESTOS AGENCIA CENTRO', 25_000_000, [[12_300_000, 6_100_000], [11_900_000, 5_700_000], [14_200_000, 6_900_000]]],
  ['SUZUKI', '107 - CL 00 00 00 REPUESTOS AGENCIA SUR', 30_000_000, [[19_800_000, 9_400_000], [21_000_000, 10_100_000], [18_600_000, 9_000_000]]],
  ['AKT', '201 - CR 00 00 00 REPUESTOS AKT OCCIDENTE', 28_000_000, [[10_200_000, 8_800_000], [11_700_000, 9_300_000], [13_900_000, 10_600_000]]],
  ['AKT', '204 - CR 00 00 00 REPUESTOS AKT ORIENTE', 18_000_000, [[6_400_000, 4_900_000], [7_100_000, 5_200_000], [6_000_000, 4_100_000]]],
]

function matrizEjemplo(): Cell[][] {
  const rows: Cell[][] = []
  rows.push([null, 'INFORME MES A MES (EJEMPLO)'])
  rows.push([])
  rows.push(['AGENCIA ', ...meses.flatMap(() => bloque)])
  rows.push(['SUZUKI', ...meses.flatMap((m) => [m, m, m, m, '%'])])
  let grupo = 'SUZUKI'
  const totales: number[][] = []
  const flush = () => {
    const t = meses.flatMap((_, i) => {
      const meta = totales.reduce((a, r) => a + r[i * 4], 0)
      const total = totales.reduce((a, r) => a + r[i * 4 + 3], 0)
      return [meta, totales.reduce((a, r) => a + r[i * 4 + 1], 0), totales.reduce((a, r) => a + r[i * 4 + 2], 0), total, total / meta]
    })
    rows.push(['TOTAL', ...t])
    totales.length = 0
  }
  for (const [g, nombre, meta, vals] of agencias) {
    if (g !== grupo) {
      flush()
      rows.push([g])
      grupo = g
    }
    const flat = vals.flatMap(([mo, ta]) => [meta, mo, ta, mo + ta])
    totales.push(flat)
    rows.push([nombre, ...vals.flatMap(([mo, ta]) => [meta, mo, ta, mo + ta, (mo + ta) / meta])])
  }
  flush()
  return rows
}

/* ------------------------------------------------------------------ */
/* Ejemplo TIPO 2: base plana de repuestos (registros sintéticos)      */
/* ------------------------------------------------------------------ */

/** Generador pseudoaleatorio determinista (siempre produce los mismos datos). */
function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

function baseEjemplo(): Cell[][] {
  const r = rng(42)
  const bodegas = agencias.map((a) => a[1])
  const subgrupos = ['repuestos', 'accesorios', 'lubricantes', 'llantas']
  const vendedores = ['VENDEDOR A', 'VENDEDOR B', 'VENDEDOR C', 'VENDEDOR D']
  const rows: Cell[][] = [
    ['Empresa: Empresa Demo, Usuario: DEMO, Fecha: jueves, 1 de octubre de 2026, Hora: 08:00 (Filas: 900)'],
    [],
    ['100037 Asi vamos (ejemplo)'],
    [],
    ['Fecha_factura', 'Bodega', 'Ventas', 'Utilidad', 'Costo', 'Grupo', 'Subgrupo', 'Notas_enca', 'Vendedor'],
  ]
  for (let i = 0; i < 900; i++) {
    const year = r() < 0.5 ? 2025 : 2026
    const month = 1 + Math.floor(r() * 9)
    const day = 1 + Math.floor(r() * 27)
    const ventas = Math.round((40_000 + r() * 600_000) * (year === 2026 ? 1.1 : 1))
    const margen = 0.25 + r() * 0.2
    rows.push([
      makeDate(year, month, day),
      bodegas[Math.floor(r() * bodegas.length)],
      ventas,
      Math.round(ventas * margen),
      Math.round(ventas * (1 - margen)),
      'repuestos',
      subgrupos[Math.floor(r() * subgrupos.length)],
      'VENTA MOSTRADOR',
      vendedores[Math.floor(r() * vendedores.length)],
    ])
  }
  rows.push([null, null, 0, null, 0]) // fila tipo SUBTOTAL (se descarta)
  return rows
}

/* ------------------------------------------------------------------ */
/* Ejemplo TIPO 3: tabla por bloques en unidades (motos), estilo B      */
/* ------------------------------------------------------------------ */

function bloquesEjemplo(): Cell[][] {
  const r = rng(7)
  const sedes = ['PRINCIPAL', 'CENTRO', 'CERRITO', 'PRADERA', 'FLORIDA']
  const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE']
  const rows: Cell[][] = [['COMPARATIVO DE VENTAS DE MOTOS 2025 - 2026 (EJEMPLO)'], []]
  // Sin celdas combinadas en el ejemplo: el mes se escribe sobre ambos años
  rows.push(['SEDE', ...meses.flatMap((m) => [m, m]), 'TOTAL', 'TOTAL', 'DIFERENCIA', 'CRECIMIENTO'])
  rows.push([null, ...meses.flatMap(() => [2025, 2026]), 2025, 2026])
  const tot = new Array(meses.length * 2).fill(0)
  for (const s of sedes) {
    const base = 10 + Math.floor(r() * 90)
    const vals = meses.flatMap(() => {
      const a = Math.round(base * (0.8 + r() * 0.4))
      return [a, Math.round(a * (0.85 + r() * 0.4))]
    })
    vals.forEach((v, i) => (tot[i] += v))
    const t25 = vals.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
    const t26 = vals.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0)
    rows.push([s, ...vals, t25, t26, t26 - t25, (t26 - t25) / t25])
  }
  const T25 = tot.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
  const T26 = tot.filter((_, i) => i % 2 === 1).reduce((a, b) => a + b, 0)
  rows.push(['TOTAL', ...tot, T25, T26, T26 - T25, (T26 - T25) / T25])
  return rows
}

/* ------------------------------------------------------------------ */

const toRaw = (name: string, rows: Cell[][]) => {
  const width = Math.max(...rows.map((r) => r.length))
  return { name, width, rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? null)) }
}

/** Construye un libro de ejemplo ya procesado con ambos tipos de hoja. */
export function buildSampleWorkbook(): ParsedWorkbook {
  const fileName = 'EJEMPLO SUMOTO DEMO.xlsx'
  const sheets = [
    toRaw('MES A MES (ejemplo)', matrizEjemplo()),
    toRaw('VENTA MOTOS POR SEDE (ejemplo)', bloquesEjemplo()),
    toRaw('BASE REPUESTOS (ejemplo)', baseEjemplo()),
  ].flatMap((raw, i) =>
    parseRawSheet(raw, 0, fileName, i),
  )
  return { docIndex: 0, fileName, fileSize: 0, sheets, parseMs: 0 }
}
