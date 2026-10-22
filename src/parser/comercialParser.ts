/**
 * Tablero comercial a partir del libro "Así vamos" COMPILADO (ej: compilado.xlsx).
 *
 * El libro trae:
 *   - ASI VAMOS: metas y avance por asesor, en bloques (Suzuki, Digital, Sumoto Cali, Hero…)
 *   - Hojas base del CRM: PEDIDO, CREADOS, ACTIVOS, SEGUIMIENTO, ACTIVA ROJOS
 *     (un registro por fila, con la columna VITRINA / PUNTO DE VENTA = "SUZUKI PRINCIPAL", "HERO PALMIRA"…)
 *   - Tablas dinámicas: TD PEDIDO, td CREADOS, td ACTIVOS, td SEGUIMIENTO, td ACTIVA ROJOS
 *
 * Las tablas dinámicas solo traen totales por asesor, así que los conteos se recalculan
 * desde las hojas base (que sí traen marca y sede en VITRINA) aplicando los mismos filtros
 * de las tablas dinámicas, y los totales se comparan contra ellas:
 *   - Pedidos:    RESULTADO = CARTERA o FACTURADO, sin ESTADO "Anulado"
 *   - Creados:    MES = mes del Así vamos, con asesor
 *   - Activos, Seguimiento, Activa rojos: todos los registros con asesor
 */
import type { Cell, ComercialAsiVamosRow, ComercialCheck, ComercialCount, ComercialSheet, RawSheet } from '@/types/report'
import { isExcelDate } from './cells'
import { norm, titleCase } from '@/lib/format'
import { MARCA_POR_ASESOR, brandOf } from '@/config/negocio'

const S = (c: Cell): string => (c == null ? '' : isExcelDate(c) ? '' : String(c).replace(/\t/g, ' ').replace(/\s+/g, ' ').trim())
const N = (c: Cell): number => {
  if (typeof c === 'number' && isFinite(c)) return c
  if (typeof c === 'string' && /^-?\d+(\.\d+)?$/.test(c.trim())) return Number(c.trim())
  return 0
}

const fmtN = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 })

const findSheet = (raws: RawSheet[], re: RegExp) => raws.find((r) => re.test(norm(r.name)))

/** Fila de cabecera (dentro de las primeras 40) que contiene todas las columnas pedidas. */
function header(raw: RawSheet, required: string[]): { row: number; col: (name: string) => number } | null {
  for (let r = 0; r < Math.min(40, raw.rows.length); r++) {
    const names = (raw.rows[r] ?? []).map((c) => norm(S(c)))
    if (required.every((q) => names.includes(q))) {
      return { row: r, col: (name: string) => names.indexOf(norm(name)) }
    }
  }
  return null
}

/** Marca y sede a partir de la vitrina: "SUZUKI PRINCIPAL" → { Suzuki, Suzuki Principal } */
function fromVitrina(v: string): { marca: string; sede: string } | null {
  const t = v.trim()
  if (!t || /^(sd|-|n\/?a)$/i.test(t)) return null
  const brand = brandOf(t)
  return { marca: brand?.label ?? titleCase(t.split(' ')[0]), sede: titleCase(t) }
}

const SIN = 'Sin asignar'

interface RawRecord {
  asesor: string
  vitrina: string
  cat: string
}

/** Agrega registros en conteos por asesor/marca/sede/categoría, resolviendo vitrinas vacías. */
function aggregate(records: RawRecord[], fallback: Map<string, string>): ComercialCount[] {
  const map = new Map<string, ComercialCount>()
  for (const r of records) {
    const v = fromVitrina(r.vitrina) ?? fromVitrina(fallback.get(r.asesor) ?? '')
    const marca = v?.marca ?? SIN
    const sede = v?.sede ?? SIN
    const key = `${r.asesor}|${marca}|${sede}|${r.cat}`
    const cur = map.get(key)
    if (cur) cur.n++
    else map.set(key, { asesor: r.asesor, marca, sede, cat: r.cat, n: 1 })
  }
  return [...map.values()]
}

/** Total general de una tabla dinámica: el mayor número de las filas "Total general". */
function pivotTotal(raw: RawSheet | undefined): number | null {
  if (!raw) return null
  let best: number | null = null
  for (const row of raw.rows) {
    if (!row.some((c) => typeof c === 'string' && /^total general$/i.test(c.trim()))) continue
    for (const c of row) if (typeof c === 'number' && (best === null || c > best)) best = c
  }
  return best
}

const PRIORIDAD: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' }
const ORIGEN: Record<string, string> = { vitrina: 'Vitrina', pauta: 'Pauta', organico: 'Orgánico', volante: 'Volante', otros: 'Otros', otro: 'Otros' }

export interface ComercialResult {
  sheets: ComercialSheet[]
  /** Hojas que quedan incluidas en el tablero (ASI VAMOS y tablas dinámicas) */
  consumed: string[]
}

export function parseComercialWorkbook(raws: RawSheet[], ctx: { docIndex: number; fileName: string }): ComercialResult | null {
  const asi = findSheet(raws, /^asi vamos$/)
  const shPedido = findSheet(raws, /^pedido$/)
  const shCreados = findSheet(raws, /^creados$/)
  const shActivos = findSheet(raws, /^activos$/)
  const shSeg = findSheet(raws, /^seguimiento$/)
  const shRojos = findSheet(raws, /^activa rojos$/)
  if (!asi) return null
  const crmCount = [shPedido, shCreados, shActivos, shSeg, shRojos].filter(Boolean).length
  // Así vamos con varios bloques (Suzuki, Digital, Sumoto Cali, Hero…): se usa aunque no vengan las hojas del CRM
  const headerCount = asi.rows.filter((r) => norm(S(r[2])) === 'meta ventas').length
  if (crmCount < 3 && headerCount < 2) return null
  const hasCrm = crmCount >= 3

  const notes: string[] = []

  /* ---------- Parámetros del Así vamos ---------- */
  const meta = { mes: null as number | null, diasHabiles: null as number | null, avance: null as number | null, hoy: null as string | null }
  for (const row of asi.rows.slice(0, 6)) {
    const a = norm(S(row[0]))
    if (a === 'mes' && meta.mes === null) meta.mes = N(row[1]) || null
    if (a === 'dias habiles' && meta.diasHabiles === null) meta.diasHabiles = N(row[1]) || null
    if (a === 'avance' && meta.avance === null) meta.avance = N(row[1]) || null
    for (let c = 0; c < row.length - 1; c++) {
      const v = row[c + 1]
      if (norm(S(row[c])) === 'hoy' && isExcelDate(v) && !meta.hoy) meta.hoy = `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}`
    }
  }

  /* ---------- Registros base ---------- */
  const rec: Record<'pedidos' | 'creados' | 'activos' | 'seguimiento' | 'rojos', RawRecord[]> = { pedidos: [], creados: [], activos: [], seguimiento: [], rojos: [] }

  if (shPedido) {
    const h = header(shPedido, ['punto de venta', 'resultado', 'estado'])
    if (h) {
      const cA = h.col('asesor2') >= 0 ? h.col('asesor2') : h.col('asesor')
      const cV = h.col('punto de venta')
      const cR = h.col('resultado')
      const cE = h.col('estado')
      for (const row of shPedido.rows.slice(h.row + 1)) {
        const res = norm(S(row[cR]))
        if (res !== 'cartera' && res !== 'facturado') continue
        if (norm(S(row[cE])) === 'anulado') continue
        const asesor = S(row[cA]).toUpperCase()
        if (!asesor) continue
        rec.pedidos.push({ asesor, vitrina: S(row[cV]), cat: titleCase(res) })
      }
    }
  }
  if (shCreados) {
    const h = header(shCreados, ['agrupacion', 'asesor', 'mes', 'vitrina'])
    if (h) {
      const [cA, cV, cM, cG] = [h.col('asesor'), h.col('vitrina'), h.col('mes'), h.col('agrupacion')]
      const months = shCreados.rows.slice(h.row + 1).map((r) => N(r[cM])).filter(Boolean)
      const mes = meta.mes ?? (months.length ? Math.max(...months) : null)
      for (const row of shCreados.rows.slice(h.row + 1)) {
        if (mes !== null && N(row[cM]) !== mes) continue
        const asesor = S(row[cA]).toUpperCase()
        if (!asesor) continue
        rec.creados.push({ asesor, vitrina: S(row[cV]), cat: ORIGEN[norm(S(row[cG]))] ?? (S(row[cG]) ? titleCase(S(row[cG])) : 'Otros') })
      }
      if (mes !== null) notes.push(`Negocios creados del mes ${mes} (mismo filtro de la tabla dinámica td CREADOS).`)
    }
  }
  const simple = (raw: RawSheet | undefined, key: 'activos' | 'seguimiento' | 'rojos', catCol?: string) => {
    if (!raw) return
    const h = header(raw, ['asesor', 'vitrina'])
    if (!h) return
    const cA = h.col('asesor')
    const cV = h.col('vitrina')
    const cC = catCol ? h.col(catCol) : -1
    for (const row of raw.rows.slice(h.row + 1)) {
      const asesor = S(row[cA]).toUpperCase()
      if (!asesor) continue
      const cat = cC >= 0 ? PRIORIDAD[norm(S(row[cC]))] ?? 'Sin prioridad' : ''
      rec[key].push({ asesor, vitrina: S(row[cV]), cat })
    }
  }
  simple(shActivos, 'activos', 'intencion de compra')
  simple(shSeg, 'seguimiento')
  simple(shRojos, 'rojos')

  // Vitrina predominante por asesor (para registros sin vitrina)
  const vitCount = new Map<string, Map<string, number>>()
  for (const list of Object.values(rec)) {
    for (const r of list) {
      if (!fromVitrina(r.vitrina)) continue
      const m = vitCount.get(r.asesor) ?? new Map<string, number>()
      m.set(r.vitrina, (m.get(r.vitrina) ?? 0) + 1)
      vitCount.set(r.asesor, m)
    }
  }
  const fallback = new Map<string, string>()
  for (const [a, m] of vitCount) fallback.set(a, [...m.entries()].sort((x, y) => y[1] - x[1])[0][0])
  const blanks = Object.values(rec).flat().filter((r) => !fromVitrina(r.vitrina))
  const resolved = blanks.filter((r) => fallback.has(r.asesor)).length
  if (blanks.length) {
    notes.push(
      `${blanks.length.toLocaleString('es-CO')} registros no traen vitrina: ${resolved.toLocaleString('es-CO')} se asignaron a la vitrina donde más registra el asesor${blanks.length - resolved ? ` y ${(blanks.length - resolved).toLocaleString('es-CO')} quedan "Sin asignar"` : ''}.`,
    )
  }

  /* ---------- Así vamos por bloques ---------- */
  const brandVotes = (name: string) => {
    const m = vitCount.get(name.toUpperCase())
    if (!m) return null
    const votes = new Map<string, number>()
    for (const [v, n] of m) {
      const b = fromVitrina(v)?.marca
      if (b) votes.set(b, (votes.get(b) ?? 0) + n)
    }
    return [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const asiRows: ComercialAsiVamosRow[] = []
  let pendingTitle: string | null = null
  interface AsiBlock {
    title: string
    bHeader: string
    rows: { r: Cell[] }[]
  }
  let block: AsiBlock | null = null
  const blocks: (AsiBlock & { section: number })[] = []
  let section = 0
  const grandTotals: { section: number; meta: number; aHoy: number }[] = []
  for (const row of asi.rows) {
    const a = S(row[0])
    const c2 = norm(S(row[2]))
    if (c2 === 'radicadas') {
      pendingTitle = a || null
      continue
    }
    if (c2 === 'meta ventas') {
      const t = pendingTitle ?? (norm(a) !== 'asesor' ? a : '')
      const nb = { title: t, bHeader: norm(S(row[1])), rows: [], section }
      blocks.push(nb)
      block = nb
      pendingTitle = null
      continue
    }
    if (/^(mes|dias habiles|avance)$/.test(norm(a))) {
      if (block) section++
      block = null
      continue
    }
    // Fila "TOTAL GENERAL" (o "TOTAL GENRAL") de cada sección: se guarda para el control
    if (/^total gen/.test(norm(a)) && typeof row[4] === 'number') {
      grandTotals.push({ section, meta: N(row[2]), aHoy: N(row[4]) })
      continue
    }
    if (!block || !a || /^(total|gran total|subtotal)\b/i.test(norm(a))) continue
    if (typeof row[2] !== 'number' && !/^\d/.test(S(row[2]))) continue
    block.rows.push({ r: row })
  }
  const usedConfig: string[] = []
  const brandVitrinas = new Map<string, number>()
  for (const m of vitCount.values()) for (const [v, n] of m) brandVitrinas.set(v, (brandVitrinas.get(v) ?? 0) + n)
  for (const b of blocks) {
    const titleBrand = brandOf(b.title)?.label
    const votes = new Map<string, number>()
    for (const { r } of b.rows) {
      const v = brandVotes(S(r[0]))
      if (v) votes.set(v, (votes.get(v) ?? 0) + 1)
    }
    const voted = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]
    const fileBrand = b.section === 0 ? brandOf(ctx.fileName)?.label : undefined
    for (const { r } of b.rows) {
      const asesor = S(r[0]).toUpperCase()
      let marca = titleBrand ?? voted ?? MARCA_POR_ASESOR[asesor] ?? fileBrand ?? SIN
      if (!titleBrand && !voted && MARCA_POR_ASESOR[asesor]) usedConfig.push(asesor)
      // Sede: columna B si es una sede (PRINCIPAL, CALI…); si no, la vitrina del asesor en esa marca
      const bVal = S(r[1])
      let sede = ''
      const sedeLike = /sede/.test(b.bHeader) || [...(vitCount.get(asesor)?.keys() ?? [])].some((v) => norm(v).endsWith(norm(bVal)))
      if (bVal && sedeLike) sede = titleCase(`${marca} ${bVal}`)
      else {
        // Vitrina del asesor en esa marca; si no tiene registros, la vitrina principal de la marca
        const own = [...(vitCount.get(asesor)?.entries() ?? [])].filter(([k]) => fromVitrina(k)?.marca === marca).sort((x, y) => y[1] - x[1])[0]?.[0]
        const brandMain = [...brandVitrinas.entries()].filter(([k]) => fromVitrina(k)?.marca === marca).sort((x, y) => y[1] - x[1])[0]?.[0]
        sede = own ? titleCase(own) : brandMain ? titleCase(brandMain) : `${marca} (sin sede)`
      }
      if (marca === SIN) sede = SIN
      asiRows.push({
        asesor,
        marca,
        sede,
        bloque: b.title ? titleCase(b.title) : marca,
        metaVentas: N(r[2]),
        aHoy: N(r[4]),
        canales: { vitrina: N(r[5]), pauta: N(r[6]), organico: N(r[7]), volante: N(r[8]), otro: N(r[9]) },
        metaCoti: N(r[11]),
        aHoyCoti: N(r[13]),
        canalesCoti: { vitrina: N(r[14]), pauta: N(r[15]), organico: N(r[16]), volante: N(r[17]), otro: N(r[18]) },
        dataActiva: N(r[20]),
        alta: N(r[21]),
        media: N(r[22]),
        baja: N(r[23]),
        segPendiente: N(r[27]),
        segRealizado: N(r[28]),
        negCreados: N(r[29]),
      })
    }
  }
  // Control: el TOTAL GENERAL de cada sección vs la suma de sus asesores
  for (const gt of grandTotals) {
    const rowsSec = blocks.filter((x) => x.section === gt.section).flatMap((x) => x.rows)
    const meta = rowsSec.reduce((acc, { r }) => acc + N(r[2]), 0)
    const aHoy = rowsSec.reduce((acc, { r }) => acc + N(r[4]), 0)
    if (Math.abs(meta - gt.meta) > 0.5 || Math.abs(aHoy - gt.aHoy) > 0.5) {
      notes.push(`ASI VAMOS: el TOTAL GENERAL del archivo dice meta ${fmtN(gt.meta)} y ${fmtN(gt.aHoy)} radicadas a hoy, pero sus asesores suman meta ${fmtN(meta)} y ${fmtN(aHoy)} radicadas. El tablero usa la suma de los asesores.`)
    }
  }
  // Control: canales de radicadas que no suman las radicadas a hoy (ej: VITRINA repite el total)
  const off = asiRows.filter((r) => {
    const c = r.canales
    return Math.abs(c.vitrina + c.pauta + c.organico + c.volante + c.otro - r.aHoy) > 0.5
  })
  if (off.length) {
    const brands = [...new Set(off.map((r) => r.marca))].join(', ')
    notes.push(`En ${off.length} asesor(es) (${brands}) los canales de radicadas (vitrina, pauta, orgánico, volante, otro) no suman las radicadas a hoy; la gráfica de canales los muestra tal como vienen.`)
  }
  if (usedConfig.length) {
    notes.push(`La marca de ${[...new Set(usedConfig)].join(', ')} se tomó de MARCA_POR_ASESOR (src/config/negocio.ts) porque su bloque no tiene título en el Así vamos.`)
  }

  /* ---------- Conteos y controles ---------- */
  const data = {
    pedidos: aggregate(rec.pedidos, fallback),
    creados: aggregate(rec.creados, fallback),
    activos: aggregate(rec.activos, fallback),
    seguimiento: aggregate(rec.seguimiento, fallback),
    rojos: aggregate(rec.rojos, fallback),
  }
  const total = (l: ComercialCount[]) => l.reduce((a, x) => a + x.n, 0)
  const td = (re: RegExp) => findSheet(raws, re)
  const checks: ComercialCheck[] = [
    { label: 'Pedidos', hoja: 'TD PEDIDO', calculado: total(data.pedidos), tablaDinamica: pivotTotal(td(/^td pedido$/)) },
    { label: 'Negocios creados', hoja: 'td CREADOS', calculado: total(data.creados), tablaDinamica: pivotTotal(td(/^td creados$/)) },
    { label: 'Data activa', hoja: 'td ACTIVOS', calculado: total(data.activos), tablaDinamica: pivotTotal(td(/^td activos$/)) },
    { label: 'Seguimientos', hoja: 'td SEGUIMIENTO', calculado: total(data.seguimiento), tablaDinamica: pivotTotal(td(/^td seguimiento$/)) },
    { label: 'Activa rojos', hoja: 'td ACTIVA ROJOS', calculado: total(data.rojos), tablaDinamica: pivotTotal(td(/^td activa rojos$/)) },
  ]
  for (const c of checks) {
    if (c.tablaDinamica !== null && c.tablaDinamica !== c.calculado) {
      notes.push(`${c.label}: la hoja base suma ${c.calculado.toLocaleString('es-CO')} y la tabla dinámica ${c.hoja} dice ${c.tablaDinamica.toLocaleString('es-CO')}. Puede que la tabla dinámica no esté actualizada.`)
    }
  }
  if (checks.every((c) => c.tablaDinamica === null || c.tablaDinamica === c.calculado)) {
    notes.push('Los totales recalculados desde las hojas base coinciden con las tablas dinámicas del archivo.')
  }

  const consumed = [asi.name, ...raws.filter((r) => /^td /.test(norm(r.name))).map((r) => r.name)]
  const base = {
    kind: 'comercial' as const,
    name: asi.name.trim(),
    sheetName: asi.name.trim(),
    docIndex: ctx.docIndex,
    fileName: ctx.fileName,
    title: asi.name.trim(),
    meta,
    ...data,
    asiVamos: asiRows,
    hasCrm,
    checks: hasCrm ? checks : [],
    notes: hasCrm ? notes : notes.filter((n) => !/^(Negocios creados del mes|[\d.]+ registros no traen vitrina|Los totales recalculados)|la hoja base suma/.test(n)),
  }
  const id = `d${ctx.docIndex}-s-comercial`
  return {
    sheets: [
      { ...base, id: `${id}-b0`, tableLabel: 'Sede', groupBy: 'sede' },
      { ...base, id: `${id}-b1`, tableLabel: 'Marca', groupBy: 'marca' },
    ],
    consumed,
  }
}
