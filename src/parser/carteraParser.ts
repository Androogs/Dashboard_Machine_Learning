/**
 * Corte de cartera a partir del libro "TODO CORTE … CIERRE.xlsx".
 *
 * El libro trae una hoja maestra (normalmente "TODO", o "Sheet" con más columnas)
 * con una fila por documento de cartera y, opcionalmente, pestañas auxiliares
 * (MT, RP, Z, YO SOY, RECOBRO AKT) que son subconjuntos o están vacías.
 *
 * Clasificación de cada fila:
 *  - Grupo:     MT (motos, prefijo MTE…) · RP (repuestos, prefijo RPE… o FR, o tipo con REPUESTO) · OTRO
 *  - Financiera: según el tipo de documento (ZAD→ADDI, ZK→BRILLA, ZE→CREDIORBE,
 *    ZG→FINAMIGA, ZD/FG/FJ/FI→INVERSIONES, ZH→PROGRESER, ZS→SISTECREDITO).
 *    Los traslados a cartera propia no cuentan como financiera.
 *  - YO SOY:    la nota/concepto menciona la campaña "YO SOY".
 */
import type { CarteraGroup, CarteraRow, CarteraSheet, Cell, Financiera, RawSheet } from '@/types/report'
import { isExcelDate } from './cells'
import { norm, titleCase } from '@/lib/format'

const S = (c: Cell): string => (c == null ? '' : isExcelDate(c) ? '' : String(c).replace(/\s+/g, ' ').trim())
const N = (c: Cell): number | null => {
  if (typeof c === 'number' && isFinite(c)) return c
  if (typeof c === 'string' && /^-?\d+(\.\d+)?$/.test(c.trim())) return Number(c.trim())
  return null
}
const ms = (c: Cell): number | null => (isExcelDate(c) ? c.ms : null)

export const FINANCIERAS: Financiera[] = ['ADDI', 'BRILLA', 'CREDIORBE', 'FINAMIGA', 'INVERSIONES', 'PROGRESER', 'SISTECREDITO']

/** Cabeceras mínimas del formato de cartera (ya normalizadas). */
const REQUIRED = ['numero', 'nit', 'razon_social', 'tipo', 'prefijo', 'saldo', 'bodega', 'vendedor']

/** Pestañas auxiliares del corte: son subconjuntos de TODO (o vienen vacías). */
export const CARTERA_AUX = /^(sheet\d*|mt|rp|z|yo soy|recobro akt)$/i

interface Header { row: number; idx: Record<string, number> }

function findHeader(raw: RawSheet): Header | null {
  for (let r = 0; r < Math.min(15, raw.rows.length); r++) {
    const names = (raw.rows[r] ?? []).map((c) => norm(S(c)))
    if (REQUIRED.every((q) => names.includes(q))) {
      const idx: Record<string, number> = {}
      for (const key of ['numero', 'nit', 'razon_social', 'tipo', 'prefijo', 'concepto', 'fecha', 'vencimiento', 'dias', 'saldo', 'aplicado', 'doc ref', 'bodega', 'vendedor', 'notas']) {
        idx[key] = names.indexOf(key)
      }
      return { row: r, idx }
    }
  }
  return null
}

function grupoOf(tipo: string, prefijo: string): CarteraGroup {
  const t = norm(`${tipo} ${prefijo}`)
  if (/\bmte[a-z0-9]*\b/.test(norm(prefijo)) || /motos/.test(t)) return 'MT'
  if (/^rpe/.test(norm(prefijo)) || norm(prefijo) === 'fr' || /repuesto|cartera repuestos/.test(t)) return 'RP'
  return 'OTRO'
}

function financieraOf(tipo: string): Financiera | null {
  const t = norm(tipo)
  // Traslados a cartera propia: la deuda ya no es de la financiera
  if (/trasl?a?do|traspaso/.test(t) && /propi/.test(t)) return null
  if (/addi/.test(t)) return 'ADDI'
  if (/brilla/.test(t)) return 'BRILLA'
  if (/crediorbe/.test(t)) return 'CREDIORBE'
  if (/finamiga/.test(t)) return 'FINAMIGA'
  if (/sistecredito/.test(t)) return 'SISTECREDITO'
  if (/pro?greser|pregreser/.test(t)) return 'PROGRESER'
  if (/inversiones|invermo|avalada/.test(t)) return 'INVERSIONES'
  return null
}

const SIN_BODEGA = 'Sin bodega'
const SIN_ASESOR = 'Sin asignar'

export interface CarteraResult {
  sheets: CarteraSheet[]
  /** Hojas absorbidas por el reporte (fuente + pestañas auxiliares con la misma estructura o vacías) */
  consumed: string[]
}

export function parseCarteraWorkbook(raws: RawSheet[], ctx: { docIndex: number; fileName: string }): CarteraResult | null {
  // Candidatas: hojas con la firma de columnas de cartera; preferimos la llamada TODO, luego la más larga
  const candidates = raws
    .map((raw) => ({ raw, header: findHeader(raw) }))
    .filter((x): x is { raw: RawSheet; header: Header } => x.header !== null)
    .sort((a, b) => {
      const at = norm(a.raw.name) === 'todo' ? 0 : 1
      const bt = norm(b.raw.name) === 'todo' ? 0 : 1
      return at - bt || b.raw.rows.length - a.raw.rows.length
    })
  if (!candidates.length) return null
  const { raw, header } = candidates[0]
  const c = (row: Cell[], k: string) => (header.idx[k] >= 0 ? row[header.idx[k]] : null)

  const rows: CarteraRow[] = []
  for (const row of raw.rows.slice(header.row + 1)) {
    const numero = N(c(row, 'numero'))
    const cliente = S(c(row, 'razon_social'))
    if (numero === null && !cliente) continue
    const tipo = S(c(row, 'tipo'))
    const prefijo = S(c(row, 'prefijo'))
    const concepto = S(c(row, 'concepto'))
    const nota = S(c(row, 'notas')).slice(0, 220)
    rows.push({
      numero,
      nit: S(c(row, 'nit')),
      cliente,
      tipo,
      prefijo,
      concepto,
      fecha: ms(c(row, 'fecha')),
      vencimiento: ms(c(row, 'vencimiento')),
      dias: N(c(row, 'dias')),
      saldo: N(c(row, 'saldo')) ?? 0,
      aplicado: N(c(row, 'aplicado')),
      bodega: S(c(row, 'bodega')) || SIN_BODEGA,
      vendedor: S(c(row, 'vendedor')) ? titleCase(S(c(row, 'vendedor'))) : SIN_ASESOR,
      grupo: grupoOf(tipo, prefijo),
      financiera: financieraOf(tipo),
      yoSoy: /yo\s*soy/i.test(`${concepto} ${nota}`),
      nota,
    })
  }
  if (!rows.length) return null

  const notes: string[] = []
  const saldoMT = rows.filter((r) => r.grupo === 'MT').reduce((a, r) => a + r.saldo, 0)
  const saldoRP = rows.filter((r) => r.grupo === 'RP').reduce((a, r) => a + r.saldo, 0)
  const total = rows.reduce((a, r) => a + r.saldo, 0)
  notes.push(
    `Cartera con saldo total de $ ${total.toLocaleString('es-CO', { maximumFractionDigits: 0 })}: motos $ ${saldoMT.toLocaleString('es-CO', { maximumFractionDigits: 0 })} y repuestos $ ${saldoRP.toLocaleString('es-CO', { maximumFractionDigits: 0 })}.`,
  )

  // Se consumen la hoja fuente, las demás hojas con la misma firma (Sheet, MT…)
  // y las pestañas auxiliares vacías del corte (RP, Z, YO SOY, RECOBRO AKT)
  const consumed = raws
    .filter((r) => r === raw || findHeader(r) !== null || (r.rows.length === 0 && CARTERA_AUX.test(r.name.trim())))
    .map((r) => r.name)

  return {
    sheets: [
      {
        kind: 'cartera',
        id: `d${ctx.docIndex}-s-cartera`,
        name: raw.name.trim(),
        sheetName: raw.name.trim(),
        docIndex: ctx.docIndex,
        fileName: ctx.fileName,
        title: 'Corte de cartera',
        sourceSheet: raw.name.trim(),
        rows,
        notes,
      },
    ],
    consumed,
  }
}
