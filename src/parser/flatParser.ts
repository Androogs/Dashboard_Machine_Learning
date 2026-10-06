/**
 * Parser de hojas PLANAS (bases exportadas por Advance DMS).
 *
 * Estructura típica:
 *   fila 1: "Empresa: Sumoto S.A, Usuario: ..., Fecha: jueves, 1 de octubre de 2026, Hora: 17:27 (Filas: 7,952)"
 *   fila 3: "100037 Asi vamos"            ← nombre del reporte del DMS
 *   fila 5: Fecha_factura | Bodega | Ventas | Utilidad | Costo | ...   ← cabeceras
 *   fila 6+: un registro por fila
 *   última: fila de SUBTOTAL (solo números) → se descarta
 *
 * Las columnas se tipifican automáticamente (fecha, medida, categoría, texto, id).
 */
import type { Cell, FlatColumn, FlatColumnType, FlatSheet, RawSheet } from '@/types/report'
import { isExcelDate } from './cells'
import { COLUMNAS_DINERO, COLUMNAS_ID, DIMENSION_MARCA_DERIVADA, MARCA_POR_PREFIJO_BODEGA } from '@/config/negocio'
import { norm } from '@/lib/format'

/** Nombre de la medida sintética de conteo */
export const COLUMNA_CONTEO = 'N.º de registros'

const isText = (c: Cell): c is string => typeof c === 'string' && c.trim() !== ''

/** Encuentra la fila de cabeceras: la primera con mayoría de textos y datos debajo. */
export function findFlatHeader(rows: Cell[][], width: number): number {
  const limit = Math.min(rows.length - 1, 40)
  let best = -1
  let bestScore = 0
  for (let r = 0; r < limit; r++) {
    const row = rows[r]
    const filled = row.filter((c) => c !== null).length
    const texts = row.filter(isText).length
    if (texts < 2 || texts < filled * 0.8) continue
    const nextFilled = (rows[r + 1] ?? []).filter((c) => c !== null).length
    if (nextFilled < 2) continue
    // Preferir filas anchas (las cabeceras reales cubren casi todo el ancho)
    const score = texts / Math.max(width, 1)
    if (score >= 0.6) return r
    if (score > bestScore) {
      bestScore = score
      best = r
    }
  }
  return best
}

/** Extrae nombre del reporte y fecha de generación del preámbulo, sin exponer datos de usuario. */
function readPreamble(rows: Cell[][], headerRow: number) {
  let title = ''
  let generatedAt: string | null = null
  for (let r = 0; r < headerRow; r++) {
    for (const c of rows[r]) {
      if (!isText(c)) continue
      const s = c.trim()
      const m = s.match(/Fecha:\s*([^,]+,\s*)?([^,]+?),\s*Hora:\s*([\d:]+)/i)
      if (m) generatedAt = `${m[2].trim()} ${m[3]}`
      else if (!/^empresa:/i.test(s) && !title) title = s
    }
  }
  return { title, generatedAt }
}

function classify(name: string, values: Cell[]): { type: FlatColumnType; distinct: number; filled: number; measureKind?: 'money' | 'number' } {
  let filled = 0
  let nums = 0
  let dates = 0
  const set = new Set<string>()
  for (const v of values) {
    if (v === null) continue
    filled++
    if (typeof v === 'number') nums++
    else if (isExcelDate(v)) dates++
    if (set.size < 5000) set.add(isExcelDate(v) ? String(v.ms) : String(v))
  }
  const distinct = set.size
  const n = norm(name)
  if (filled === 0) return { type: 'empty', distinct, filled }
  if (dates >= filled * 0.7) return { type: 'date', distinct, filled }
  if (nums >= filled * 0.9) {
    if (/%|porc/.test(n)) return { type: 'ratio', distinct, filled }
    if (COLUMNAS_ID.test(n)) return { type: 'id', distinct, filled }
    if (COLUMNAS_DINERO.test(n)) return { type: 'measure', distinct, filled, measureKind: 'money' }
    return { type: 'number', distinct, filled, measureKind: 'number' }
  }
  if (distinct >= 2 && distinct <= 400 && (distinct <= filled * 0.5 || filled < 40)) return { type: 'category', distinct, filled }
  return { type: 'text', distinct, filled }
}

export function parseFlat(raw: RawSheet, headerRow: number, ctx: { id: string; docIndex: number; fileName: string }): FlatSheet {
  const { rows, width } = raw
  const head = rows[headerRow]

  // Nombres de columna únicos
  const seen = new Map<string, number>()
  const names: string[] = []
  for (let c = 0; c < width; c++) {
    const h = head[c]
    let name = isText(h) ? h.trim() : h != null ? String(h) : `Columna ${c + 1}`
    const k = norm(name)
    const count = seen.get(k) ?? 0
    seen.set(k, count + 1)
    if (count > 0) name = `${name} (${count + 1})`
    names.push(name)
  }

  // Filas de datos (sin vacías ni filas de subtotal compuestas solo por números)
  let body = rows.slice(headerRow + 1).filter((r) => r.some((c) => c !== null))
  const withText = body.filter((r) => r.some((c) => isText(c) || isExcelDate(c))).length
  if (withText >= body.length * 0.5) body = body.filter((r) => r.some((c) => isText(c) || isExcelDate(c)))

  // En bases de vehículos (traen VIN/chasis), "cant" son las unidades vendidas
  const vehicleBase = names.some((n) => /^(vin|chasis|motor)$/i.test(n))
  if (vehicleBase) names.forEach((n, i) => /^(cant|cantidad)$/i.test(n) && !names.includes('Unidades vendidas') && (names[i] = 'Unidades vendidas'))

  const columns: FlatColumn[] = []
  const data: FlatSheet['data'] = {}

  for (let c = 0; c < width; c++) {
    const values = body.map((r) => r[c] ?? null)
    const info = classify(names[c], values)
    columns.push({ name: names[c], ...info })

    if (info.type === 'date') {
      data[names[c]] = values.map((v) => (isExcelDate(v) ? v.ms : null))
    } else if (info.type === 'measure' || info.type === 'number') {
      data[names[c]] = values.map((v) => (typeof v === 'number' ? v : null))
    } else if (info.type === 'category') {
      data[names[c]] = values.map((v) => (v === null ? null : isExcelDate(v) ? String(v.ms) : String(v).replace(/\s+/g, ' ').trim()))
    }
  }

  addDerivedBrand(columns, data)

  // Medida sintética: conteo de registros. Garantiza que toda base tenga al menos una medida
  // y en bases de facturas de motos equivale a unidades vendidas.
  data[COLUMNA_CONTEO] = new Array(body.length).fill(1)
  columns.push({ name: COLUMNA_CONTEO, type: 'measure', distinct: 1, filled: body.length, measureKind: 'number', derived: true })

  const pre = readPreamble(rows, headerRow)
  const vehicle = columns.some((c) => /^(vin|chasis|motor)$/i.test(c.name))
  return {
    kind: 'flat',
    id: ctx.id,
    name: raw.name.trim(),
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title: pre.title,
    unitLabel: vehicle || /moto/i.test(`${pre.title} ${ctx.fileName} ${raw.name}`) ? 'motos' : 'unid.',
    generatedAt: pre.generatedAt,
    headerRow,
    rowCount: body.length,
    columns,
    data,
  }
}

/**
 * Si existe una columna de bodega con códigos numéricos ("102 - ..."),
 * crea la dimensión "Marca (por código de bodega)". Ver SUPUESTO en config/negocio.ts.
 */
function addDerivedBrand(columns: FlatColumn[], data: FlatSheet['data']) {
  const bodega = columns.find((c) => c.type === 'category' && /bodega|agencia/i.test(c.name))
  if (!bodega) return
  const src = data[bodega.name] as (string | null)[]
  let hits = 0
  const out = src.map((v) => {
    const m = v?.match(/^(\d)\d{2}\b/)
    const brand = m ? MARCA_POR_PREFIJO_BODEGA[m[1]] : undefined
    if (brand) hits++
    return brand ?? (v ? 'OTRAS' : null)
  })
  const filled = src.filter(Boolean).length
  if (filled === 0 || hits < filled * 0.8) return
  data[DIMENSION_MARCA_DERIVADA] = out
  columns.push({ name: DIMENSION_MARCA_DERIVADA, type: 'category', distinct: new Set(out.filter(Boolean)).size, filled, derived: true })
}
