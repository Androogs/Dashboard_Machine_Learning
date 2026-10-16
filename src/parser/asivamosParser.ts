/**
 * Parser de la hoja "ASI VAMOS" (resumen por asesor comercial del DMS).
 *
 * Estructura esperada:
 *   fila 0: meta (MES, ..., inicio serial, festivos)
 *   fila 1: meta (DÍAS HÁBILES, ..., fin serial)
 *   fila 2: meta (AVANCE, ..., hoy serial)
 *   fila 3: vacía
 *   fila 4: etiquetas de sección (RADICADAS / COTIZACIONES / DATA ACTIVA)
 *   fila 5: cabeceras de columnas
 *   fila 6+: una fila por asesor
 *
 * Las columnas 11..19 (cotizaciones) y 21..23 (data activa) se leen por índice
 * para evitar depender de nombres exactos de cabecera.
 */
import type { Cell, RawSheet } from '@/types/report'
import type { AsiVamosMeta, AsiVamosRow, AsiVamosSheet } from '@/types/report'
import { norm } from '@/lib/format'

const N = (c: Cell): number => (typeof c === 'number' && isFinite(c) ? c : 0)
const S = (c: Cell): string => (typeof c === 'string' ? c.trim() : c != null ? String(c).trim() : '')

/** Convierte un número de serie de Excel a fecha ISO (YYYY-MM-DD) o null. */
function serialToDate(c: Cell): string | null {
  if (typeof c !== 'number' || !isFinite(c)) return null
  // Excel serial: días transcurridos desde 1899-12-30
  const ms = (c - 25569) * 86400 * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readMeta(rows: Cell[][]): AsiVamosMeta {
  const r0 = rows[0] ?? []
  const r1 = rows[1] ?? []
  const r2 = rows[2] ?? []
  return {
    mes: typeof r0[1] === 'number' ? r0[1] : null,
    diasHabiles: typeof r1[1] === 'number' ? r1[1] : null,
    avance: typeof r2[1] === 'number' ? r2[1] : null,
    inicio: serialToDate(r0[4]),
    fin: serialToDate(r1[4]),
    hoy: serialToDate(r2[4]),
    festivos: typeof r0[5] === 'number' ? r0[5] : null,
  }
}

/** Cabecera esperada en la fila 5 (índices de columna). */
const IDX = {
  asesor: 0,
  jefe: 1,
  metaVentas: 2,
  debeLlevar: 3,
  aHoy: 4,
  vitrina: 5,
  pauta: 6,
  organico: 7,
  volante: 8,
  otro: 9,
  difRads: 10,
  metaCoti: 11,
  debeLlevarCoti: 12,
  aHoyCoti: 13,
  vitrinaCoti: 14,
  pautaCoti: 15,
  organicoCoti: 16,
  volanteCoti: 17,
  otroCoti: 18,
  difCoti: 19,
  total: 20,
  alta: 21,
  media: 22,
  baja: 23,
  cumRads: 24,
  cumCoti: 25,
  efectividad: 26,
  pendiente: 27,
  realizado: 28,
  negCreados: 29,
}

function parseRow(r: Cell[]): AsiVamosRow | null {
  const asesor = S(r[IDX.asesor])
  if (!asesor || /^(total|gran total|subtotal)\b/i.test(norm(asesor))) return null
  return {
    asesor,
    jefeComercial: S(r[IDX.jefe]),
    metaVentas: N(r[IDX.metaVentas]),
    debeLlevar: N(r[IDX.debeLlevar]),
    aHoy: N(r[IDX.aHoy]),
    vitrina: N(r[IDX.vitrina]),
    pauta: N(r[IDX.pauta]),
    organico: N(r[IDX.organico]),
    volante: N(r[IDX.volante]),
    otro: N(r[IDX.otro]),
    difMetaVsAHoy: N(r[IDX.difRads]),
    metaCoti: N(r[IDX.metaCoti]),
    debeLlevarCoti: N(r[IDX.debeLlevarCoti]),
    aHoyCoti: N(r[IDX.aHoyCoti]),
    vitrinaCoti: N(r[IDX.vitrinaCoti]),
    pautaCoti: N(r[IDX.pautaCoti]),
    organicoCoti: N(r[IDX.organicoCoti]),
    volanteCoti: N(r[IDX.volanteCoti]),
    otroCoti: N(r[IDX.otroCoti]),
    difMetaVsAHoyCoti: N(r[IDX.difCoti]),
    total: N(r[IDX.total]),
    alta: N(r[IDX.alta]),
    media: N(r[IDX.media]),
    baja: N(r[IDX.baja]),
    cumplimientoRads: N(r[IDX.cumRads]),
    cumplimientoCoti: N(r[IDX.cumCoti]),
    efectividad: N(r[IDX.efectividad]),
    seguimientoPendiente: N(r[IDX.pendiente]),
    seguimientoRealizado: N(r[IDX.realizado]),
    negCreados: N(r[IDX.negCreados]),
  }
}

export function parseAsiVamos(raw: RawSheet, ctx: { id: string; docIndex: number; fileName: string }): AsiVamosSheet | null {
  const rows = raw.rows
  if (!rows || rows.length < 7) return null

  const meta = readMeta(rows)
  const dataRows = rows.slice(6)
  const parsed: AsiVamosRow[] = []
  for (const r of dataRows) {
    const row = parseRow(r)
    if (row) parsed.push(row)
  }
  if (parsed.length === 0) return null

  const title = raw.name.trim()
  const notes: string[] = []
  const totalRads = parsed.reduce((a, r) => a + r.aHoy, 0)
  const totalMeta = parsed.reduce((a, r) => a + r.metaVentas, 0)
  notes.push(`${parsed.length} asesor(es), radicaciones a hoy ${totalRads} de meta ${totalMeta}.`)
  if (meta.mes != null) notes.push(`Corte: mes ${meta.mes}`)

  return {
    kind: 'asivamos',
    id: ctx.id,
    name: raw.name.trim(),
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title,
    sheetName: undefined,
    meta,
    notes,
    rows: parsed,
  }
}
