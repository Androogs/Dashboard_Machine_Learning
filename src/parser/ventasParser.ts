/**
 * Base "Ventas mes" del DMS (exportaciones Grd_*.xlsx): una fila por unidad vendida.
 *
 * La hoja trae un preámbulo ("Empresa: Sumoto S.A … Fecha: …"), el título del reporte
 * ("Sheet-Ventas mes") y la fila de cabeceras: id factura, fecha, tipo documento,
 * número, bodega, cliente, vendedor, vin, modelo año, descripcion, Precio+Iva,
 * Utilidad, subgrupo (marca), cond_pago, cant, Financiera…
 *
 * Las notas crédito (NCC/NCD) traen cant y valores en negativo: son devoluciones y
 * se suman con signo para obtener las ventas netas.
 * La marca se toma de la columna "subgrupo" y se canoniza con la tabla MARCAS.
 */
import type { Cell, FormaPago, RawSheet, VentaRow, VentasSheet } from '@/types/report'
import { isExcelDate } from './cells'
import { fmtInt, monthLong, monthShort, norm, titleCase } from '@/lib/format'
import { brandOf } from '@/config/negocio'

const S = (c: Cell): string => (c == null ? '' : isExcelDate(c) ? '' : String(c).replace(/\s+/g, ' ').trim())
const N = (c: Cell): number | null => {
  if (typeof c === 'number' && isFinite(c)) return c
  if (typeof c === 'string' && /^-?\d+(\.\d+)?$/.test(c.trim())) return Number(c.trim())
  return null
}
const ms = (c: Cell): number | null => (isExcelDate(c) ? c.ms : null)

/** Cabeceras mínimas del formato "Ventas mes" (ya normalizadas). */
const REQUIRED = ['id factura', 'fecha', 'tipo documento', 'bodega', 'vendedor', 'descripcion', 'subgrupo', 'cant']

interface Header {
  row: number
  idx: Record<string, number>
}

function findHeader(raw: RawSheet): Header | null {
  for (let r = 0; r < Math.min(15, raw.rows.length); r++) {
    const names = (raw.rows[r] ?? []).map((c) => norm(S(c)))
    if (REQUIRED.every((q) => names.includes(q))) {
      const idx: Record<string, number> = {}
      for (const key of [
        'id factura', 'fecha', 'tipo documento', 'numero', 'bodega', 'cliente', 'vendedor', 'vin',
        'modelo ano', 'descripcion', 'color', 'precio+iva', 'precio_iva', 'utilidad', 'costo_unitario',
        'grupo', 'subgrupo', 'cond_pago', 'cant', 'financiera', 'nota',
      ]) {
        idx[key] = names.indexOf(key)
      }
      return { row: r, idx }
    }
  }
  return null
}

/** Marca a partir de subgrupo (o de la bodega como respaldo). */
const marcaOf = (sub: string, bodega: string): string => brandOf(sub)?.label ?? brandOf(bodega)?.label ?? titleCase(sub || 'Sin marca')

function pagoOf(cond: string, financiera: string): FormaPago {
  const t = norm(cond)
  const f = norm(financiera)
  if (/cuota/.test(t) || (f && !/contado/.test(f))) return 'Crédito'
  if (/contado/.test(t) || /contado/.test(f)) return 'Contado'
  return 'Sin dato'
}

/** "Fecha: martes, 17 de noviembre de 2026, Hora: …" → "17 de noviembre de 2026". */
function generatedAtOf(raw: RawSheet): string | null {
  for (let r = 0; r < Math.min(5, raw.rows.length); r++) {
    for (const c of raw.rows[r] ?? []) {
      const m = S(c).match(/fecha:\s*(?:[a-záéíóú]+,?\s*)?(\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4})/i)
      if (m) return m[1]
    }
  }
  return null
}

function periodoOf(rows: VentaRow[]): string {
  let min = Infinity
  let max = -Infinity
  for (const r of rows) {
    if (r.fecha == null) continue
    if (r.fecha < min) min = r.fecha
    if (r.fecha > max) max = r.fecha
  }
  if (min > max) return ''
  const a = new Date(min)
  const b = new Date(max)
  const ya = a.getUTCFullYear()
  const yb = b.getUTCFullYear()
  const ma = a.getUTCMonth() + 1
  const mb = b.getUTCMonth() + 1
  if (ya === yb && ma === mb) return `${monthLong(ma).toLowerCase()} ${ya}`
  if (ya === yb) return `${monthShort(ma).toLowerCase()} – ${monthShort(mb).toLowerCase()} ${ya}`
  return `${monthShort(ma)} ${ya} – ${monthShort(mb)} ${yb}`
}

export interface VentasResult {
  sheets: VentasSheet[]
  /** Hojas absorbidas por el reporte */
  consumed: string[]
}

export function parseVentasWorkbook(raws: RawSheet[], ctx: { docIndex: number; fileName: string }): VentasResult | null {
  const candidates = raws
    .map((raw) => ({ raw, header: findHeader(raw) }))
    .filter((x): x is { raw: RawSheet; header: Header } => x.header !== null)
    .sort((a, b) => b.raw.rows.length - a.raw.rows.length)
  if (!candidates.length) return null
  const { raw, header } = candidates[0]
  const c = (row: Cell[], k: string) => (header.idx[k] >= 0 ? row[header.idx[k]] : null)

  const rows: VentaRow[] = []
  for (const row of raw.rows.slice(header.row + 1)) {
    const factura = N(c(row, 'id factura'))
    const fecha = ms(c(row, 'fecha'))
    const tipoDoc = S(c(row, 'tipo documento'))
    const cliente = S(c(row, 'cliente'))
    if (factura === null && fecha === null && !tipoDoc && !cliente) continue
    const cant = N(c(row, 'cant')) ?? 1
    const tipo = tipoDoc.split(' ')[0] ?? ''
    const bodega = S(c(row, 'bodega')) || 'Sin bodega'
    const sub = S(c(row, 'subgrupo'))
    rows.push({
      factura,
      numero: N(c(row, 'numero')),
      fecha,
      tipo,
      tipoDoc,
      bodega,
      vendedor: S(c(row, 'vendedor')) ? titleCase(S(c(row, 'vendedor'))) : 'Sin asignar',
      cliente,
      vin: S(c(row, 'vin')),
      modelo: S(c(row, 'modelo ano')) || S(c(row, 'descripcion')),
      marca: marcaOf(sub, bodega),
      precio: N(c(row, 'precio+iva')) ?? N(c(row, 'precio_iva')) ?? 0,
      utilidad: N(c(row, 'utilidad')),
      cant,
      devolucion: cant < 0 || /^nc[cd]/i.test(tipo),
      pago: pagoOf(S(c(row, 'cond_pago')), S(c(row, 'financiera'))),
    })
  }
  if (!rows.length) return null

  const ventas = rows.filter((r) => !r.devolucion)
  const devs = rows.filter((r) => r.devolucion)
  const netas = rows.reduce((a, r) => a + r.cant, 0)
  const notes = [
    `${fmtInt(ventas.length)} ventas y ${fmtInt(devs.length)} devoluciones (notas crédito con cantidad y valores en negativo): las cifras son netas, ${fmtInt(netas)} unidades.`,
  ]

  return {
    sheets: [
      {
        kind: 'ventas',
        id: `d${ctx.docIndex}-s-ventas`,
        name: raw.name.trim(),
        sheetName: raw.name.trim(),
        docIndex: ctx.docIndex,
        fileName: ctx.fileName,
        title: 'Venta de motos',
        generatedAt: generatedAtOf(raw),
        periodo: periodoOf(rows),
        rows,
        notes,
      },
    ],
    consumed: raws.filter((r) => findHeader(r) !== null).map((r) => r.name),
  }
}
