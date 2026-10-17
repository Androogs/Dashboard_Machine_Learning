/**
 * Parser de hojas "ASI VAMOS" consolidadas por marca (una hoja por marca).
 *
 * Cada hoja del Excel tiene esta estructura:
 *   fila 0: cabeceras (FECHA_CORTE, MES, DIAS_HABILES, ..., MARCA, ASESOR, ..., RAD_META, RAD_A_HOY, ..., DA_TOTAL, ...)
 *   fila 1+: una fila por asesor con los valores de esa marca
 *
 * Se detecta por la presencia de columnas clave (FECHA_CORTE, MES, MARCA, ASESOR, RAD_META, RAD_A_HOY).
 * La hoja "CONTROL" se excluye por nombre.
 */
import type { Cell, RawSheet } from '@/types/report'
import type { AsiVamosMeta, AsiVamosRow, AsiVamosConsolidadoSheet } from '@/types/report'
import { norm } from '@/lib/format'

const N = (c: Cell): number => (typeof c === 'number' && isFinite(c) ? c : 0)
const S = (c: Cell): string => (typeof c === 'string' ? c.trim() : c != null ? String(c).trim() : '')

/** Nombres de columnas esperados (índice → clave). */
const COLS: Record<string, string> = {
  fecha_corte: 'fechaCorte',
  mes: 'mes',
  dias_habiles: 'diasHabiles',
  dias_avance: 'diasAvance',
  marca: 'marca',
  coordinador: 'coordinador',
  asesor: 'asesor',
  jefe_comercial: 'jefeComercial',
  rad_meta: 'metaVentas',
  rad_debe_llevar: 'debeLlevar',
  rad_a_hoy: 'aHoy',
  rad_vitrina: 'vitrina',
  rad_pauta: 'pauta',
  rad_organico: 'organico',
  rad_volante: 'volante',
  rad_otro: 'otro',
  rad_dif_meta_vs_a_hoy: 'difMetaVsAHoy',
  cot_meta: 'metaCoti',
  cot_debe_llevar: 'debeLlevarCoti',
  cot_a_hoy: 'aHoyCoti',
  cot_vitrina: 'vitrinaCoti',
  cot_pauta: 'pautaCoti',
  cot_organico: 'organicoCoti',
  cot_volante: 'volanteCoti',
  cot_otro: 'otroCoti',
  cot_dif_meta_vs_a_hoy: 'difMetaVsAHoyCoti',
  da_total: 'total',
  da_alta: 'alta',
  da_media: 'media',
  da_baja: 'baja',
  pct_cumpl_rads: 'cumplimientoRads',
  pct_cumpl_coti: 'cumplimientoCoti',
  pct_efectividad: 'efectividad',
  seg_pendiente: 'seguimientoPendiente',
  seg_realizado: 'seguimientoRealizado',
  neg_creados: 'negCreados',
  archivo_fuente: 'archivoFuente',
}

/** Columnas mínimas para reconocer la hoja como ASI VAMOS consolidada por marca. */
const REQUIRED_COLS = ['fecha_corte', 'mes', 'marca', 'asesor', 'rad_meta', 'rad_a_hoy']

/** Convierte serial de Excel a fecha ISO o null. */
function serialToDate(c: Cell): string | null {
  if (typeof c !== 'number' || !isFinite(c)) return null
  const ms = (c - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Detecta si el encabezado (fila 0) tiene la estructura ASI VAMOS consolidada. */
function isAsiVamosConsolidadaHeader(header: Cell[]): boolean {
  const names = header.map((c) => norm(S(c)))
  return REQUIRED_COLS.every((col) => names.some((n) => n === col))
}

/** Construye un mapa de nombre de columna → índice a partir de la fila de cabecera. */
function buildColMap(header: Cell[]): Record<string, number> {
  const map: Record<string, number> = {}
  header.forEach((c, i) => {
    const name = norm(S(c))
    if (COLS[name]) map[COLS[name]] = i
  })
  return map
}

function readMetaFromRow0(header: Cell[], dataRow1: Cell[]): AsiVamosMeta {
  const colMap = buildColMap(header)
  const mesVal = dataRow1[colMap['mes']]
  const diasHabilesVal = dataRow1[colMap['diasHabiles']]
  const diasAvanceVal = dataRow1[colMap['diasAvance']]
  const fechaCorteVal = dataRow1[colMap['fechaCorte']]
  return {
    mes: typeof mesVal === 'number' ? mesVal : null,
    diasHabiles: typeof diasHabilesVal === 'number' ? diasHabilesVal : null,
    avance: typeof diasAvanceVal === 'number' ? diasAvanceVal : null,
    inicio: null,
    fin: null,
    hoy: serialToDate(fechaCorteVal),
    festivos: null,
  }
}

function parseRow(r: Cell[], colMap: Record<string, number>): AsiVamosRow | null {
  const get = (key: string) => r[colMap[key]]
  const asesor = S(get('asesor'))
  if (!asesor || /^(total|gran total|subtotal)\b/i.test(norm(asesor))) return null
  return {
    asesor,
    jefeComercial: S(get('jefeComercial')),
    metaVentas: N(get('metaVentas')),
    debeLlevar: N(get('debeLlevar')),
    aHoy: N(get('aHoy')),
    vitrina: N(get('vitrina')),
    pauta: N(get('pauta')),
    organico: N(get('organico')),
    volante: N(get('volante')),
    otro: N(get('otro')),
    difMetaVsAHoy: N(get('difMetaVsAHoy')),
    metaCoti: N(get('metaCoti')),
    debeLlevarCoti: N(get('debeLlevarCoti')),
    aHoyCoti: N(get('aHoyCoti')),
    vitrinaCoti: N(get('vitrinaCoti')),
    pautaCoti: N(get('pautaCoti')),
    organicoCoti: N(get('organicoCoti')),
    volanteCoti: N(get('volanteCoti')),
    otroCoti: N(get('otroCoti')),
    difMetaVsAHoyCoti: N(get('difMetaVsAHoyCoti')),
    total: N(get('total')),
    alta: N(get('alta')),
    media: N(get('media')),
    baja: N(get('baja')),
    cumplimientoRads: N(get('cumplimientoRads')),
    cumplimientoCoti: N(get('cumplimientoCoti')),
    efectividad: N(get('efectividad')),
    seguimientoPendiente: N(get('seguimientoPendiente')),
    seguimientoRealizado: N(get('seguimientoRealizado')),
    negCreados: N(get('negCreados')),
  }
}

/** Detecta y parsea una hoja de marca ASI VAMOS consolidada. Devuelve null si no aplica. */
export function parseAsiVamosMarcaSheet(
  raw: RawSheet,
): { kind: 'asiVamosMarca'; brand: string; meta: AsiVamosMeta; rows: AsiVamosRow[]; title: string; notes: string[] } | null {
  const rows = raw.rows
  if (!rows || rows.length < 2) return null

  const header = rows[0]
  if (!isAsiVamosConsolidadaHeader(header)) return null

  const sheetName = raw.name.trim()
  if (/^control$/i.test(norm(sheetName))) return null

  const colMap = buildColMap(header)
  const meta = readMetaFromRow0(header, rows[1])

  const brand = S(header[colMap['marca']]) || sheetName
  const parsed: AsiVamosRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = parseRow(rows[i], colMap)
    if (row) parsed.push(row)
  }
  if (parsed.length === 0) return null

  const totalRads = parsed.reduce((a, r) => a + r.aHoy, 0)
  const totalMeta = parsed.reduce((a, r) => a + r.metaVentas, 0)
  const notes: string[] = [`${parsed.length} asesor(es), radicaciones a hoy ${totalRads} de meta ${totalMeta}.`]
  if (meta.mes != null) notes.push(`Corte: mes ${meta.mes}`)

  return {
    kind: 'asiVamosMarca',
    brand,
    meta,
    rows: parsed,
    title: sheetName,
    notes,
  }
}

/**
 * Consolida varias hojas asiVamosMarca del mismo libro en una sola AsiVamosConsolidadoSheet.
 * Se llama desde parseWorkbook tras detectar todas las hojas.
 */
export function consolidateAsiVamosMarcaSheets(
  marcaSheets: {
    kind: 'asiVamosMarca'
    id: string
    name: string
    docIndex: number
    fileName: string
    title: string
    meta: AsiVamosMeta
    brand: string
    rows: AsiVamosRow[]
    notes: string[]
  }[],
  ctx: { id: string; docIndex: number; fileName: string },
): AsiVamosConsolidadoSheet | null {
  if (marcaSheets.length === 0) return null

  const brands: string[] = []
  const brandData: Record<string, AsiVamosRow[]> = {}
  const meta = marcaSheets[0].meta
  const notes: string[] = []

  for (const s of marcaSheets) {
    brands.push(s.brand)
    brandData[s.brand] = s.rows
    notes.push(`Marca ${s.brand}: ${s.rows.length} asesores.`)
  }

  const totalAsesores = marcaSheets.reduce((a, s) => a + s.rows.length, 0)
  notes.push(`${marcaSheets.length} marca(s), ${totalAsesores} asesor(es) en total.`)

  return {
    kind: 'asivamosConsolidado',
    id: ctx.id,
    name: ctx.fileName,
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title: 'ASI VAMOS Consolidado por Marca',
    sheetName: undefined,
    meta,
    brands,
    brandData,
    notes,
  }
}
