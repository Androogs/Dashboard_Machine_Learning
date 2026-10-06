/**
 * Parser de TABLAS POR BLOQUES (reportes armados a mano en Excel).
 *
 * Reconoce tres estilos de encabezado, en cualquier columna de inicio y con
 * varias tablas apiladas en la misma hoja:
 *
 *  B) Meses en texto sobre años (dos filas; los meses suelen estar en celdas combinadas)
 *        SEDE      | ENERO       | FEBRERO     | ... | TOTAL       | DIFERENCIA | CRECIMIENTO
 *                  | 2025 | 2026 | 2025 | 2026 | ... | 2025 | 2026 |
 *        PRINCIPAL | 110  | 127  | ...
 *
 *  C) Una sola fila con fechas reales de Excel, meses en texto o años
 *        BODEGA | SEDE                      | sep-25 | sep-26 | INCR/DECR | %
 *        101    | ALMACEN PRINCIPAL PALMIRA | 1421   | 1518   | 97        | 7 %
 *
 *  Cada bloque puede tener un título encima ("SUZUKI", "COMPARATIVO DE VENTAS 2025-2026").
 *
 * Reglas de unión de bloques de la misma dimensión (SEDE, ASESOR, MODELO…):
 *  - Mismos periodos y elementos distintos  → GRUPOS (ej: un bloque por marca)
 *  - Periodos distintos o mismos elementos  → se UNEN en una sola serie histórica
 *
 * Las columnas de diferencia, crecimiento, % y participación se omiten: el
 * sistema las recalcula desde las cantidades.
 */
import type { Cell, MatrixColumn, MatrixRow, MatrixSheet, MetricInfo, MetricRole, Period } from '@/types/report'
import { isExcelDate } from './cells'
import { monthShort, norm, titleCase } from '@/lib/format'
import { detectUnit } from '@/lib/units'
import { brandOf } from '@/config/negocio'
import type { RawSheet } from '@/types/report'

/* ------------------------------------------------------------------ */
/* Meses y años                                                        */
/* ------------------------------------------------------------------ */

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

/** "ENERO", "Sept", "SEPTIEMNBRE" (typo), "ene-26", "MARZO 2026" → { month, year } */
export function parseMonthText(s: string): { month: number; year: number | null } | null {
  const n = norm(s).replace(/[._\-/]/g, ' ').replace(/\s+/g, ' ').trim()
  const m = n.match(/^([a-z]+)(?:\s+de)?(?:\s*(\d{4}|\d{2}))?$/)
  if (!m) return null
  const word = m[1]
  let month = 0
  MONTHS.forEach((full, i) => {
    if (month) return
    if (word === full || (word.length >= 3 && full.startsWith(word)) || (word === 'set' && i === 8)) month = i + 1
    else if (word.length >= 6 && lev(word, full) <= 2) month = i + 1
  })
  if (!month) return null
  const y = m[2] ? (m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2])) : null
  return { month, year: y }
}

const yearOf = (c: Cell): number | null => {
  if (typeof c === 'number' && Number.isInteger(c) && c >= 1990 && c <= 2100) return c
  if (typeof c === 'string' && /^(19|20)\d{2}$/.test(c.trim())) return Number(c.trim())
  return null
}
const monthly = (y: number, m: number): Period => ({ key: `${y}-${String(m).padStart(2, '0')}`, year: y, month: m, label: `${monthShort(m)} ${y}` })
const annual = (y: number): Period => ({ key: String(y), year: y, month: null, label: String(y) })
const isText = (c: Cell): c is string => typeof c === 'string' && c.trim() !== ''

/* ------------------------------------------------------------------ */
/* Clasificación de columnas de texto                                  */
/* ------------------------------------------------------------------ */

type TextRole = MetricRole | 'total' | 'skip'

function classifyText(label: string): TextRole {
  const n = norm(label)
  if (/^(total|totales)\b/.test(n)) return 'total'
  if (/(%|particip|cumpl|porc|crecim)/.test(n)) return 'ratio'
  if (/(dif|incr|decr|aumen|dismi|inc ?\/ ?(dec|aumen)|variac|desv)/.test(n)) return 'derived'
  if (/^(meta|presupuesto|objetivo|ppto)\b/.test(n)) return 'target'
  if (/^(notas?|observ)/.test(n)) return 'skip'
  return 'value'
}

/* ------------------------------------------------------------------ */
/* Detección de encabezados                                            */
/* ------------------------------------------------------------------ */

interface ColSpec {
  index: number
  /** Etiqueta de métrica; '' = métrica principal (valor por periodo) */
  metric: string
  role: MetricRole
  period: Period | null
}

interface Header {
  start: number
  end: number
  specs: ColSpec[]
  labelCols: number[]
  dimLabel: string
  inferredYear: boolean
  badDates: number
  /** Correcciones aplicadas al encabezado (ej: año 2926 → 2026) */
  fixes: string[]
}

function detectHeader(rows: Cell[][], r: number, width: number, yearHint: number): Header | null {
  const row = rows[r]
  if (!row) return null
  const next = rows[r + 1] ?? []
  const monthCols: number[] = []
  for (let c = 0; c < width; c++) if (isText(row[c]) && parseMonthText(row[c] as string)) monthCols.push(c)
  const yearNext = [] as number[]
  for (let c = 0; c < width; c++) if (yearOf(next[c]) !== null) yearNext.push(c)

  /* ---------- Estilo B: meses (o métricas) arriba, años abajo ---------- */
  const alignedYears = yearNext.filter((c) => monthCols.includes(c) || (row[c] === null && monthCols.some((m) => m < c)))
  if (monthCols.length >= 2 && alignedYears.length >= 2 && hasNumbersBelow(rows, r + 2, yearNext)) {
    const specs: ColSpec[] = []
    const fixes: string[] = []
    const years = fixYears(row, next, width, fixes)
    let lastTop: string | null = null
    for (let c = 0; c < width; c++) {
      const top = isText(row[c]) ? (row[c] as string) : lastTop
      if (isText(row[c])) lastTop = row[c] as string
      const yr = years[c]
      if (!top || yr === null) continue
      const mt = parseMonthText(top)
      if (mt) {
        specs.push({ index: c, metric: '', role: 'value', period: monthly(mt.year ?? yr, mt.month) })
        continue
      }
      const role = classifyText(top)
      if (role === 'total') specs.push({ index: c, metric: 'Total', role: 'value', period: annual(yr) })
      else if (role === 'value' || role === 'target') specs.push({ index: c, metric: top.replace(/\b(19|20)\d{2}\b/g, '').trim(), role, period: annual(yr) })
    }
    return finish(rows, r, r + 1, specs, width, false, 0, fixes)
  }

  /* ---------- Estilo C: una fila con fechas, meses o años ---------- */
  const dateCols: number[] = []
  let badDates = 0
  for (let c = 0; c < width; c++) {
    const v = row[c]
    if (isExcelDate(v)) {
      if (v.y >= 1990) dateCols.push(c)
      else badDates++
    }
  }
  const yearCols: number[] = []
  for (let c = 0; c < width; c++) if (yearOf(row[c]) !== null) yearCols.push(c)
  const numericNonYear = row.some((v, c) => typeof v === 'number' && !yearCols.includes(c))
  const periodCols = [...new Set([...dateCols, ...monthCols, ...(numericNonYear ? [] : yearCols)])].sort((a, b) => a - b)
  if (periodCols.length < 2) return null
  const first = periodCols[0]
  const filledAfter = row.slice(first).filter((v) => v !== null).length
  if (periodCols.length < filledAfter * 0.5) return null
  if (!row.slice(0, first).some(isText) && !hasLabelsBelow(rows, r + 1, first)) return null
  if (!hasNumbersBelow(rows, r + 1, periodCols)) return null

  let inferred = false
  const specs: ColSpec[] = []
  for (let c = first; c < width; c++) {
    const v = row[c]
    if (v === null) continue
    if (isExcelDate(v)) {
      if (v.y >= 1990) specs.push({ index: c, metric: '', role: 'value', period: monthly(v.y, v.m) })
      continue
    }
    const y = numericNonYear ? null : yearOf(v)
    if (y !== null) {
      specs.push({ index: c, metric: '', role: 'value', period: annual(y) })
      continue
    }
    if (!isText(v)) continue
    const mt = parseMonthText(v)
    if (mt) {
      if (mt.year === null) inferred = true
      specs.push({ index: c, metric: '', role: 'value', period: monthly(mt.year ?? yearHint, mt.month) })
      continue
    }
    const role = classifyText(v)
    const yInText = v.match(/\b((?:19|20)\d{2})\b/)
    if ((role === 'total' || role === 'value' || role === 'target') && yInText) {
      specs.push({ index: c, metric: role === 'total' ? 'Total' : v.replace(yInText[0], '').trim(), role: role === 'target' ? 'target' : 'value', period: annual(Number(yInText[1])) })
    }
  }
  return finish(rows, r, r, specs, width, inferred, badDates, [])
}

/**
 * Corrige años del encabezado tipo B con el patrón mayoritario.
 * Ej: si casi todos los meses tienen [2025, 2026] y AGOSTO tiene [2025, 2926]
 * o SEPT-DIC tienen [2024, 2025] (encabezado sin actualizar), se usa [2025, 2026].
 */
function fixYears(row: Cell[], next: Cell[], width: number, fixes: string[]): (number | null)[] {
  const years = Array.from({ length: width }, (_, c) => yearOf(next[c]))
  // Grupos de columnas consecutivas con el mismo mes arriba
  const groups: { month: string; cols: number[] }[] = []
  let cur: { month: string; cols: number[] } | null = null
  for (let c = 0; c < width; c++) {
    const t = isText(row[c]) ? (row[c] as string) : null
    const isMonth = t && parseMonthText(t)
    if (isMonth && (!cur || cur.month !== t || !cur.cols.length || cur.cols[cur.cols.length - 1] !== c - 1)) {
      cur = { month: t!, cols: [] }
      groups.push(cur)
    }
    if (isMonth && cur && cur.month === t) cur.cols.push(c)
    else if (!isMonth) cur = null
  }
  const sig = (g: { cols: number[] }) => g.cols.map((c) => years[c] ?? '?').join('/')
  const counts = new Map<string, number>()
  for (const g of groups) counts.set(sig(g), (counts.get(sig(g)) ?? 0) + 1)
  const [best, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0]
  if (!best || n < Math.max(3, groups.length * 0.5) || best.includes('?')) return years
  const pattern = best.split('/').map(Number)
  for (const g of groups) {
    if (sig(g) === best || g.cols.length !== pattern.length) continue
    const before = sig(g)
    g.cols.forEach((c, i) => (years[c] = pattern[i]))
    fixes.push(`${titleCase(g.month)}: años ${before.split('/').join(' / ')} → ${best.split('/').join(' / ')}`)
  }
  return years
}

function finish(rows: Cell[][], start: number, end: number, specs: ColSpec[], _width: number, inferredYear: boolean, badDates: number, fixes: string[]): Header | null {
  const periodSpecs = specs.filter((s) => s.period)
  if (periodSpecs.length < 2) return null
  const firstData = Math.min(...specs.map((s) => s.index))
  const labelCols = Array.from({ length: firstData }, (_, i) => i)
  // Etiqueta de la dimensión: último texto de las columnas de etiqueta en las filas de encabezado
  let dimLabel = ''
  for (let r = start; r <= end; r++) for (const c of labelCols) if (isText(rows[r][c]) && !parseMonthText(rows[r][c] as string)) dimLabel = rows[r][c] as string
  dimLabel = dimLabel.split('/')[0].trim() || 'Elemento'
  return { start, end, specs, labelCols, dimLabel, inferredYear, badDates, fixes }
}

function hasNumbersBelow(rows: Cell[][], from: number, cols: number[]): boolean {
  for (let r = from; r < Math.min(rows.length, from + 4); r++) if (cols.some((c) => typeof rows[r]?.[c] === 'number')) return true
  return false
}
function hasLabelsBelow(rows: Cell[][], from: number, before: number): boolean {
  for (let r = from; r < Math.min(rows.length, from + 4); r++) if (rows[r]?.slice(0, before).some((v) => v !== null)) return true
  return false
}

/* ------------------------------------------------------------------ */
/* Lectura de bloques                                                  */
/* ------------------------------------------------------------------ */

interface BlockRow {
  label: string
  kind: 'item' | 'total'
  partial: boolean
  values: Map<number, number | null> // índice de spec → valor
}

interface Block {
  title: string
  header: Header
  rows: BlockRow[]
  /** Filas posteriores al total final (desgloses tipo "de los cuales…"): no se suman */
  memo: string[]
}

const TOTAL_RE = /\b(sub\s*total|total(es)?|gran total)\b/i

/** Une las columnas de etiqueta: código + nombre ("101 - ALMACEN PRINCIPAL"), sin NIT ni repetidos. */
function rowLabel(row: Cell[], labelCols: number[]): string {
  const parts: string[] = []
  for (const c of labelCols) {
    const v = row[c]
    if (v === null || isExcelDate(v)) continue
    const s = String(v).replace(/\s+/g, ' ').trim()
    if (!s || parts.some((p) => norm(p) === norm(s))) continue
    parts.push(s)
  }
  if (parts.length >= 2) {
    // NIT u otros identificadores largos en la columna de código: se omiten
    if (/^\d{6,}(-\d)?$/.test(parts[0])) parts.shift()
    else if (/^\d{1,5}$/.test(parts[0])) return `${parts[0]} - ${parts.slice(1).join(' ')}`
  }
  return parts.join(' - ')
}

function readBlocks(raw: RawSheet, yearHint: number): Block[] {
  const { rows, width } = raw
  const blocks: Block[] = []
  let r = 0
  let prevEnd = -1
  while (r < rows.length) {
    const h = detectHeader(rows, r, width, yearHint)
    if (!h) {
      r++
      continue
    }
    // Título: fila de texto más cercana encima del encabezado (máx. 4 filas, sin invadir el bloque anterior)
    let title = ''
    for (let t = h.start - 1; t > prevEnd && t >= h.start - 4; t--) {
      const txt = rows[t].find(isText)
      if (txt && !rows[t].some((v) => typeof v === 'number')) {
        title = (txt as string).replace(/\s+/g, ' ').trim()
        break
      }
    }
    const out: BlockRow[] = []
    let rr = h.end + 1
    let lastData = h.end
    for (; rr < rows.length; rr++) {
      if (detectHeader(rows, rr, width, yearHint)) break
      const row = rows[rr]
      const label = rowLabel(row, h.labelCols)
      const values = new Map<number, number | null>()
      let has = false
      h.specs.forEach((s, i) => {
        const v = row[s.index]
        const n = typeof v === 'number' && isFinite(v) ? v : null
        if (n !== null) has = true
        values.set(i, n)
      })
      if (!has) continue // filas vacías, títulos o elementos sin datos
      lastData = rr
      if (!label) continue
      out.push({ label, kind: TOTAL_RE.test(label) ? 'total' : 'item', partial: false, values })
    }
    // Filas después del último total = desglose informativo (ej: "Gerencia", "COMERCIAL" bajo el TOTAL)
    const lastTotal = out.map((x) => x.kind).lastIndexOf('total')
    const memo = lastTotal >= 0 ? out.splice(lastTotal + 1).map((x) => x.label) : []
    // Solo el último total del bloque es el total final; los anteriores son parciales
    const totals = out.filter((x) => x.kind === 'total')
    totals.slice(0, -1).forEach((t) => (t.partial = true))
    if (out.some((x) => x.kind === 'item')) blocks.push({ title, header: h, rows: out, memo })
    prevEnd = lastData
    r = Math.max(rr, h.end + 1)
  }
  return blocks
}

/* ------------------------------------------------------------------ */
/* Grupos deducidos de filas TOTAL                                     */
/* ------------------------------------------------------------------ */

interface SegRow {
  row: BlockRow
  group: string
  type: MatrixRow['type']
  partial?: boolean
}

/**
 * Deduce grupos (marcas) en una tabla que solo los separa con filas TOTAL:
 *  - Un TOTAL igual a la suma de las filas desde el último corte cierra un grupo.
 *  - Un TOTAL igual a la suma de varios grupos anteriores + filas nuevas los une
 *    (ej: "GRAN TOTAL" de Suzuki = sedes Suzuki + Roosevelth).
 *  - El último TOTAL que abarca todos los grupos es el total general.
 *  - Un TOTAL que no cuadra con nada es parcial y se ignora.
 * Devuelve null si no se obtienen al menos 2 grupos.
 */
function segmentByTotals(b: Block): { rows: SegRow[]; groups: string[] } | null {
  const totals = b.rows.filter((x) => x.kind === 'total')
  if (totals.length < 2) return null
  const matches = (items: BlockRow[], t: BlockRow) => {
    let checked = 0
    for (const [i, tv] of t.values) {
      if (tv == null || tv === 0) continue
      const sum = items.reduce((a, x) => a + (x.values.get(i) ?? 0), 0)
      if (Math.abs(sum - tv) > Math.max(1, Math.abs(tv) * 0.005)) return false
      checked++
    }
    return checked > 0
  }
  const segs: { items: BlockRow[]; total: BlockRow | null }[] = []
  let pending: BlockRow[] = []
  const partial = new Set<BlockRow>()
  let grand: BlockRow | null = null
  const lastTotal = totals[totals.length - 1]
  for (const x of b.rows) {
    if (x.kind === 'item') {
      pending.push(x)
      continue
    }
    if (pending.length && matches(pending, x)) {
      segs.push({ items: pending, total: x })
      pending = []
      continue
    }
    let merged = false
    for (let k = segs.length - 1; k >= 0; k--) {
      const cand = [...segs.slice(k).flatMap((sg) => sg.items), ...pending]
      if (!matches(cand, x)) continue
      if (k === 0 && x === lastTotal && segs.length + (pending.length ? 1 : 0) >= 2) {
        if (pending.length) segs.push({ items: pending, total: null })
        pending = []
        grand = x
      } else {
        segs.slice(k).forEach((sg) => sg.total && partial.add(sg.total))
        const union = { items: cand, total: x }
        segs.splice(k, segs.length - k, union)
        pending = []
      }
      merged = true
      break
    }
    if (!merged) partial.add(x)
  }
  if (pending.length) segs.push({ items: pending, total: null })
  if (segs.length < 2) return null

  // Nombre del grupo: la marca más mencionada en las sedes (o en su TOTAL)
  const names: string[] = []
  segs.forEach((sg, i) => {
    const count = new Map<string, number>()
    for (const it of [...sg.items, ...(sg.total ? [sg.total] : [])]) {
      const br = brandOf(it.label)
      if (br) count.set(br.label, (count.get(br.label) ?? 0) + 1)
    }
    let name = [...count.entries()].sort((a, c) => c[1] - a[1])[0]?.[0] ?? `Grupo ${i + 1}`
    if (names.includes(name)) name = `${name} (${i + 1})`
    names.push(name)
  })
  const groupOf = new Map<BlockRow, string>()
  segs.forEach((sg, i) => {
    sg.items.forEach((it) => groupOf.set(it, names[i]))
    if (sg.total) groupOf.set(sg.total, names[i])
  })
  const rows: SegRow[] = []
  for (const x of b.rows) {
    if (x.kind === 'item') rows.push({ row: x, group: groupOf.get(x) ?? names[names.length - 1], type: 'item' })
    else if (x === grand) rows.push({ row: x, group: '', type: 'grandtotal' })
    else if (partial.has(x) || !groupOf.has(x)) continue
    else rows.push({ row: x, group: groupOf.get(x)!, type: 'subtotal' })
  }
  return { rows, groups: names }
}

/* ------------------------------------------------------------------ */
/* Construcción de MatrixSheet                                         */
/* ------------------------------------------------------------------ */

const specKey = (s: ColSpec) => `${s.role}|${norm(s.metric)}|${s.period?.key ?? ''}`
const periodSig = (b: Block) =>
  b.header.specs
    .map((s) => specKey(s))
    .sort()
    .join(',')

function jaccard(a: Set<string>, b: Set<string>) {
  const inter = [...a].filter((x) => b.has(x)).length
  const uni = new Set([...a, ...b]).size
  return uni ? inter / uni : 0
}

export function parseBlocks(raw: RawSheet, ctx: { id: string; docIndex: number; fileName: string }): MatrixSheet[] {
  const ctxText = `${raw.name} ${ctx.fileName}`
  const yearsInCtx = [...ctxText.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]))
  const yearHint = yearsInCtx.length ? Math.max(...yearsInCtx) : new Date().getFullYear()
  const blocks = readBlocks(raw, yearHint)
  if (!blocks.length) return []

  // Agrupar bloques por dimensión (SEDE, ASESOR, MODELO, …)
  const byDim = new Map<string, Block[]>()
  for (const b of blocks) {
    const k = norm(b.header.dimLabel)
    byDim.set(k, [...(byDim.get(k) ?? []), b])
  }

  const out: MatrixSheet[] = []
  let k = 0
  for (const [, list] of byDim) {
    const dimLabel = titleCase(list[0].header.dimLabel)
    const sameSig = list.every((b) => periodSig(b) === periodSig(list[0]))
    const labelSets = list.map((b) => new Set(b.rows.filter((x) => x.kind === 'item').map((x) => norm(x.label))))
    let overlap = 0
    let pairs = 0
    for (let i = 0; i < labelSets.length; i++)
      for (let j = i + 1; j < labelSets.length; j++) {
        overlap += jaccard(labelSets[i], labelSets[j])
        pairs++
      }
    let groupMode = list.length >= 2 && sameSig && (pairs ? overlap / pairs : 0) < 0.3
    // Una sola tabla cuyas marcas solo se separan con filas TOTAL (ej: MOTOS COMPARATIVO)
    const seg = list.length === 1 ? segmentByTotals(list[0]) : null

    // Columnas unificadas (solo valores y metas: diferencias y % se recalculan)
    const keyed = new Map<string, ColSpec>()
    for (const b of list) for (const s of b.header.specs) if ((s.role === 'value' || s.role === 'target') && s.period && !keyed.has(specKey(s))) keyed.set(specKey(s), s)
    const specs = [...keyed.entries()].sort(([, a], [, b]) => (a.metric === b.metric ? (a.period!.key < b.period!.key ? -1 : 1) : a.metric === '' ? -1 : b.metric === '' ? 1 : a.metric.localeCompare(b.metric)))
    const colOf = new Map(specs.map(([key], i) => [key, i]))

    const allValues: number[] = []
    const rowsOut: MatrixRow[] = []
    const groups: string[] = []
    let conflicts = 0

    if (seg) {
      groupMode = true
      groups.push(...seg.groups)
      for (const x of seg.rows) {
        const values: (number | null)[] = new Array(specs.length).fill(null)
        list[0].header.specs.forEach((sp, i) => {
          const ci = colOf.get(specKey(sp))
          if (ci !== undefined) values[ci] = x.row.values.get(i) ?? null
        })
        if (x.type === 'item') values.forEach((v, i) => v != null && specs[i][1].role === 'value' && allValues.push(v))
        rowsOut.push({ label: x.row.label, group: x.group, type: x.type, values, partial: x.partial })
      }
    } else if (groupMode) {
      list.forEach((b, bi) => {
        let g = brandOf(b.title)?.label ?? (b.title || `Bloque ${bi + 1}`)
        if (groups.includes(g)) g = `${g} (${bi + 1})`
        groups.push(g)
        // Totales del bloque: "TOTAL <GRUPO>" es el subtotal del grupo; un total posterior sin el
        // nombre del grupo (ej: "TOTAL SUMOTO S.A." dentro del bloque FRATELI) es el total general.
        const totals = b.rows.filter((x) => x.kind === 'total')
        const named = totals.find((t) => b.title && norm(t.label).includes(norm(b.title)))
        const typeOf = (x: BlockRow): { type: MatrixRow['type']; partial?: boolean; group: string } => {
          if (x.kind === 'item') return { type: 'item', group: g }
          if (named) {
            if (x === named) return { type: 'subtotal', group: g }
            return totals.indexOf(x) > totals.indexOf(named) ? { type: 'grandtotal', group: '' } : { type: 'subtotal', partial: true, group: g }
          }
          return { type: 'subtotal', partial: x.partial, group: g }
        }
        for (const x of b.rows) {
          const values: (number | null)[] = new Array(specs.length).fill(null)
          b.header.specs.forEach((s, i) => {
            const ci = colOf.get(specKey(s))
            if (ci !== undefined) values[ci] = x.values.get(i) ?? null
          })
          if (x.kind === 'item') values.forEach((v, i) => v != null && specs[i][1].role === 'value' && allValues.push(v))
          const t = typeOf(x)
          rowsOut.push({ label: x.label, group: t.group, type: t.type, values, partial: t.partial })
        }
      })
    } else {
      groups.push('General')
      const merged = new Map<string, MatrixRow>()
      for (const b of list) {
        for (const x of b.rows) {
          if (x.kind === 'total' && x.partial) continue
          const key = x.kind === 'total' ? '__total__' : norm(x.label)
          let row = merged.get(key)
          if (!row) {
            row = { label: x.kind === 'total' ? 'TOTAL' : x.label, group: x.kind === 'total' ? '' : 'General', type: x.kind === 'total' ? 'grandtotal' : 'item', values: new Array(specs.length).fill(null) }
            merged.set(key, row)
            rowsOut.push(row)
          }
          b.header.specs.forEach((s, i) => {
            const ci = colOf.get(specKey(s))
            const v = x.values.get(i) ?? null
            if (ci === undefined || v === null) return
            // Reglas de unión: un cero no pisa un dato real; si ambos tienen datos distintos,
            // gana el bloque más reciente (más abajo en la hoja) y se registra el conflicto.
            const cur = row!.values[ci]
            if (cur === null || cur === 0) row!.values[ci] = v
            else if (v !== 0 && Math.abs(cur - v) > 1e-6) {
              row!.values[ci] = v
              conflicts++
            }
          })
        }
      }
      for (const r of rowsOut) if (r.type === 'item') r.values.forEach((v, i) => v != null && specs[i][1].role === 'value' && allValues.push(v))
    }

    // Etiquetas repetidas entre grupos (ej: "Gerencia" en SUZUKI y en HERO): se agrega el grupo
    if (groupMode) {
      const count = new Map<string, number>()
      for (const r of rowsOut) if (r.type === 'item') count.set(norm(r.label), (count.get(norm(r.label)) ?? 0) + 1)
      for (const r of rowsOut) if (r.type === 'item' && (count.get(norm(r.label)) ?? 0) > 1) r.label = `${r.label} (${r.group})`
    }
    const titles = list.map((b) => b.title).filter((t) => t && !(groupMode && groups.includes(t)))
    const unit = detectUnit(allValues, `${raw.name} ${titles.join(' ')} ${ctx.fileName}`)
    const mainLabel = unit.kind === 'units' ? (unit.label === 'motos' ? 'Motos vendidas' : 'Unidades') : 'Valor'

    const columns: MatrixColumn[] = specs.map(([, s], i) => {
      const label = s.metric || mainLabel
      const clean = label.replace(/\s+/g, ' ').trim()
      return { index: i, metricKey: norm(clean), metricLabel: clean, role: s.role, period: s.period }
    })
    const metricMap = new Map<string, MetricInfo>()
    for (const c of columns) {
      const m = metricMap.get(c.metricKey) ?? { key: c.metricKey, label: c.metricLabel, role: c.role, periods: [] }
      if (c.period && !m.periods.some((p) => p.key === c.period!.key)) m.periods.push(c.period)
      metricMap.set(c.metricKey, m)
    }
    for (const m of metricMap.values()) m.periods.sort((a, b) => a.key.localeCompare(b.key))

    const notes: string[] = []
    if (list.some((b) => b.header.inferredYear)) notes.push(`Los meses sin año se asumieron del ${yearHint} (tomado del nombre de la hoja o del archivo).`)
    const fixes = [...new Set(list.flatMap((b) => b.header.fixes))]
    if (fixes.length) notes.push(`Se corrigieron años del encabezado que no seguían el patrón de la tabla: ${fixes.join('; ')}.`)
    if (list.some((b) => b.header.badDates)) notes.push('Se ignoraron columnas con fechas inválidas en el encabezado (anteriores a 1990).')
    if (conflicts) notes.push(`${conflicts} celda(s) tenían cifras distintas para el mismo periodo en bloques diferentes; se usó la del bloque más reciente (más abajo en la hoja).`)
    if (seg) notes.push(`Los grupos (${groups.join(', ')}) se dedujeron de las filas TOTAL de la tabla; el nombre de cada grupo sale de los nombres de sus sedes.`)
    if (list.length > 1) notes.push(groupMode ? `Se unieron ${list.length} bloques como grupos (${groups.join(', ')}).` : `Se unieron ${list.length} bloques en una sola serie histórica.`)
    const memo = [...new Set(list.flatMap((b) => b.memo))]
    if (memo.length) notes.push(`No se sumaron las filas que aparecen debajo del total (desglose informativo): ${memo.join(', ')}.`)
    // Encabezado con un solo mes por año (ej: sep-25 vs sep-26): puede ser el mes o el acumulado del año
    const monthsPerYear = new Map<number, Set<number>>()
    for (const [, sp] of specs) if (sp.period?.month) monthsPerYear.set(sp.period.year, (monthsPerYear.get(sp.period.year) ?? new Set()).add(sp.period.month))
    if (monthsPerYear.size >= 2 && [...monthsPerYear.values()].every((m) => m.size === 1)) {
      const m = [...monthsPerYear.values()][0].values().next().value as number
      notes.push(`El encabezado solo trae ${monthShort(m)} de cada año. Si las cifras son acumuladas (enero a ${monthShort(m).toLowerCase()}), interprétalas como acumulado del año y no como el mes aislado.`)
    }
    notes.push('Diferencias, crecimientos y porcentajes del Excel se recalculan a partir de las cantidades.')

    const multi = byDim.size > 1
    out.push({
      kind: 'matrix',
      source: 'bloques',
      unit,
      notes,
      id: `${ctx.id}-b${k++}`,
      name: multi ? `${raw.name.trim()} - ${dimLabel}` : raw.name.trim(),
      docIndex: ctx.docIndex,
      fileName: ctx.fileName,
      title: titles[0] ?? raw.name.trim(),
      dimensionLabel: dimLabel,
      columns,
      metrics: [...metricMap.values()],
      groups,
      rows: rowsOut,
    })
  }
  return out.filter((s) => s.rows.some((r) => r.type === 'item') && s.metrics.some((m) => m.role === 'value' && m.periods.length >= 1))
}
