/**
 * Parser de hojas RUNT (registro de motos matriculadas por marca).
 *
 * Estructura esperada (ver COMPARATIVO RUNT SEPTIEMBRE 2026.xlsx):
 *
 *    COMPARATIVOS RUNT NACIONAL
 *    A SEPTIEMBRE                                   ← corte del acumulado
 *    MARCA  | 2025   | SHARE | 2026   | SHARE | IND.
 *    YAMAHA | 129146 | 16 %  | 133244 | 13 %  | 3 %
 *    …
 *    TOTAL  | 798580 |       | 1023805
 *
 *    COMPARATIVO RUNT VALLE                         COMPARATIVO SUMOTO
 *    MARCA  | 2025 | SHARE | 2026 | SHARE | IND.   2025 | 2026 | IND.   ← tabla lateral
 *
 * Reglas:
 *  - La hoja debe mencionar "RUNT".
 *  - Cada fila con 2+ años es un encabezado; se divide en tablas por columnas vacías.
 *  - El nombre del mercado sale del título ("RUNT VALLE" → "Valle"). Una tabla titulada
 *    con el nombre de la empresa (config EMPRESA) son las ventas propias.
 *  - SHARE e IND. del Excel se recalculan.
 */
import type { Cell, RawSheet, RuntRow, RuntSheet, RuntTable } from '@/types/report'
import { parseMonthText } from './blockParser'
import { monthLong, norm, titleCase } from '@/lib/format'
import { EMPRESA } from '@/config/negocio'

const isText = (c: Cell): c is string => typeof c === 'string' && c.trim() !== ''
const yearOf = (c: Cell): number | null => {
  if (typeof c === 'number' && Number.isInteger(c) && c >= 1990 && c <= 2100) return c
  if (typeof c === 'string' && /^(19|20)\d{2}$/.test(c.trim())) return Number(c.trim())
  return null
}

export function isRuntSheet(raw: RawSheet): boolean {
  return raw.rows.slice(0, 60).some((r) => r.some((c) => isText(c) && /\bRUNT\b/i.test(c)))
}

interface Segment {
  start: number
  end: number
  labelCol: number
  years: { col: number; year: number }[]
}

export function parseRunt(raw: RawSheet, ctx: { id: string; docIndex: number; fileName: string }): RuntSheet | null {
  const { rows } = raw
  let cutoff: string | null = null
  const markets: RuntTable[] = []
  let own: RuntTable | null = null
  const yearsSeen = new Set<number>()
  const notes: string[] = []
  let docTitle = ''

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (const c of row) {
      if (!isText(c)) continue
      const m = c.trim().match(/^a\s+(?:corte\s+(?:de\s+)?)?([a-záéíóúñ]+)(?:\s+(\d{4}))?$/i)
      const mt = m && parseMonthText(m[1])
      if (mt && !cutoff) cutoff = monthLong(mt.month).toLowerCase()
      if (!docTitle && /\bRUNT\b/i.test(c)) docTitle = c.trim()
    }

    const yearCols = row.map((c, i) => ({ col: i, year: yearOf(c) })).filter((x): x is { col: number; year: number } => x.year !== null)
    if (yearCols.length < 2) continue

    // Dividir el encabezado en tablas separadas por columnas vacías
    const segs: Segment[] = []
    let cur: Segment | null = null
    for (let c = 0; c < row.length; c++) {
      if (row[c] === null) {
        cur = null
        continue
      }
      if (!cur) {
        cur = { start: c, end: c, labelCol: -1, years: [] }
        segs.push(cur)
      }
      cur.end = c
      const y = yearOf(row[c])
      if (y !== null) cur.years.push({ col: c, year: y })
      else if (cur.labelCol < 0 && isText(row[c]) && !/share|ind|part|%|var/i.test(row[c] as string)) cur.labelCol = c
    }
    let lastLabel = -1
    for (const s of segs) {
      if (s.labelCol >= 0) lastLabel = s.labelCol
      else s.labelCol = lastLabel
    }

    for (const s of segs.filter((x) => x.years.length >= 2 && x.labelCol >= 0)) {
      // Título: texto más cercano encima, dentro de las columnas de la tabla
      let title = ''
      for (let t = r - 1; t >= Math.max(0, r - 5) && !title; t--) {
        for (let c = s.start; c <= s.end; c++) {
          const v = rows[t][c]
          if (isText(v) && /(runt|comparativ|ventas|sumoto|mercado)/i.test(v)) {
            title = v.trim()
            break
          }
        }
      }
      const ys = [...s.years].sort((a, b) => a.year - b.year)
      const prevCol = ys[ys.length - 2]
      const curCol = ys[ys.length - 1]
      ys.forEach((y) => yearsSeen.add(y.year))

      const out: RuntRow[] = []
      const totalExcel = { prev: null as number | null, cur: null as number | null }
      let blanks = 0
      for (let rr = r + 1; rr < rows.length && blanks < 2; rr++) {
        const lab = rows[rr][s.labelCol]
        const p = rows[rr][prevCol.col]
        const c = rows[rr][curCol.col]
        if (!isText(lab)) {
          blanks++
          continue
        }
        blanks = 0
        if (rows[rr].filter((x) => yearOf(x) !== null).length >= 2) break // siguiente encabezado
        const prev = typeof p === 'number' ? p : null
        const curV = typeof c === 'number' ? c : null
        if (/^total\b/i.test(lab.trim())) {
          totalExcel.prev = prev
          totalExcel.cur = curV
          break
        }
        if (prev === null && curV === null) continue
        out.push({ marca: lab.replace(/\s+/g, ' ').trim(), prev, cur: curV })
      }
      if (!out.length) continue

      const total = { prev: out.reduce((a, x) => a + (x.prev ?? 0), 0), cur: out.reduce((a, x) => a + (x.cur ?? 0), 0) }
      const isOwn = new RegExp(EMPRESA, 'i').test(title)
      const region = title.match(/runt\s+(.+)$/i)?.[1] ?? title
      const name = isOwn ? titleCase(EMPRESA) : titleCase(region.replace(/^comparativos?\s+/i, '').trim()) || `Mercado ${markets.length + 1}`
      const table: RuntTable = { name, rows: out, totalExcel, total }
      for (const k of ['prev', 'cur'] as const) {
        const ex = totalExcel[k]
        if (ex != null && Math.abs(ex - total[k]) > Math.max(1, Math.abs(ex) * 0.002)) {
          notes.push(`${name}: el TOTAL del Excel (${ex.toLocaleString('es-CO')}) no coincide con la suma de marcas (${total[k].toLocaleString('es-CO')}).`)
        }
      }
      if (isOwn) own = table
      else markets.push(table)
    }
  }

  if (!markets.length) return null
  const years = [...yearsSeen].sort((a, b) => a - b)
  if (own) {
    const ownTable: RuntTable = own
    const valle = markets.find((m) => /valle/i.test(m.name)) ?? markets[markets.length - 1]
    notes.push(`Las ventas de ${ownTable.name} se comparan con el mercado ${valle.name} para calcular su participación.`)
  }
  notes.push('SHARE e IND. del Excel se recalculan a partir de las unidades.')
  return {
    kind: 'runt',
    id: ctx.id,
    name: raw.name.trim(),
    sheetName: raw.name.trim(),
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title: docTitle ? `RUNT ${markets.map((m) => m.name).join(' & ')}` : raw.name.trim(),
    years: [years[years.length - 2] ?? years[0], years[years.length - 1]],
    cutoff,
    markets,
    own,
    notes,
  }
}

/** Mercado regional para comparar las ventas propias (Valle por defecto). */
export const ownMarket = (s: RuntSheet) => s.markets.find((m) => /valle/i.test(m.name)) ?? s.markets[s.markets.length - 1]
export const runtKey = (marca: string) => norm(marca).replace(/[^a-z]/g, '').slice(0, 5)
