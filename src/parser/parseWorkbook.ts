/**
 * Orquestador del parseo: lee el libro y decide, hoja por hoja,
 * si es una MATRIZ (informe consolidado) o una base PLANA (registros).
 * Es código puro (sin DOM) para poder ejecutarse en un Web Worker o en Node.
 */
import type { ParsedWorkbook } from '@/types/report'
import { readWorkbook } from './readWorkbook'
import { parseRawSheet } from './detect'
import { HOJAS_CONFIDENCIALES, HOJAS_NO_PROCESAR } from '@/config/negocio'
import { parseBudgetExecutionWorkbook } from './budgetExecutionParser'
import { consolidateAsiVamosMarcaSheets } from './asivamosConsolidadoParser'
import { parseComercialWorkbook } from './comercialParser'
import { CARTERA_AUX, parseCarteraWorkbook } from './carteraParser'
import { norm } from '@/lib/format'

export { parseRawSheet }

export type ProgressFn = (step: string, pct: number) => void

export function parseWorkbook(buf: ArrayBuffer, docIndex: number, fileName: string, onProgress?: ProgressFn): ParsedWorkbook {
  const t0 = Date.now()
  onProgress?.('Leyendo hojas del archivo', 15)
  // En un libro "TODO CORTE …" las pestañas auxiliares (MT, RP, Z, YO SOY, RECOBRO AKT, Sheet)
  // son subconjuntos de TODO o vienen vacías; se omiten porque una puede superar el millón de filas.
  const raws = readWorkbook(buf, {
    skip: (n, all) =>
      HOJAS_NO_PROCESAR.test(n) || (all.some((x) => norm(x) === 'todo') && CARTERA_AUX.test(n.trim()) && norm(n) !== 'todo'),
  })
  const budgetReports = parseBudgetExecutionWorkbook(raws, { docIndex, fileName })
  if (budgetReports) {
    onProgress?.('Interpretando tablas de ejecución presupuestal', 80)
    onProgress?.('Reporte presupuestal listo', 100)
    return { docIndex, fileName, fileSize: buf.byteLength, sheets: budgetReports, parseMs: Date.now() - t0 }
  }
  onProgress?.(`Detectando estructura de ${raws.length} hoja(s)`, 55)
  const sheets = raws.flatMap((raw, i) => {
    const s = parseRawSheet(raw, docIndex, fileName, i)
    onProgress?.(`Hoja "${raw.name.trim()}" lista`, 55 + Math.round(((i + 1) / raws.length) * 40))
    return s
  })
  // Si alguna tabla del archivo es de motos, las demás tablas de cantidades también se rotulan "motos"
  if (sheets.some((s) => s.kind === 'matrix' && s.unit.label === 'motos')) {
    for (const s of sheets) {
      if (s.kind === 'matrix' && s.unit.kind === 'units' && s.unit.label !== 'motos' && !HOJAS_CONFIDENCIALES.test(s.name) && !/^ejecucion de financieras\b/i.test(s.name.trim())) {
        s.unit = { kind: 'units', label: 'motos' }
        const m = s.metrics.find((x) => x.label === 'Unidades')
        if (m) m.label = 'Motos vendidas'
        for (const c of s.columns) if (c.metricLabel === 'Unidades') c.metricLabel = 'Motos vendidas'
      }
    }
  }
  // Consolidar hojas ASI VAMOS por marca (BAJAJ, HONDA, SUZUKI, etc.) del mismo libro
  // en un solo reporte AsiVamosConsolidadoSheet con pestañas por marca.
  const marcaSheets = sheets.filter((s): s is Extract<typeof sheets[number], { kind: 'asiVamosMarca' }> => s.kind === 'asiVamosMarca')
  if (marcaSheets.length > 1) {
    const consolidated = consolidateAsiVamosMarcaSheets(marcaSheets, { id: `d${docIndex}-s-consolidado`, docIndex, fileName })
    if (consolidated) {
      const otherSheets = sheets.filter((s) => s.kind !== 'asiVamosMarca')
      sheets.length = 0
      sheets.push(...otherSheets, consolidated)
    }
  }
  // Libro "Así vamos" compilado (ASI VAMOS + hojas del CRM + tablas dinámicas):
  // se arma el tablero comercial (por sede y por marca) y reemplaza a ASI VAMOS y a las tablas td.
  onProgress?.('Armando tablero comercial', 97)
  const comercial = parseComercialWorkbook(raws, { docIndex, fileName })
  if (comercial) {
    const consumed = new Set(comercial.consumed.map((n) => norm(n)))
    const rest = sheets.filter((s) => !consumed.has(norm(('sheetName' in s && s.sheetName) || s.name)))
    sheets.length = 0
    sheets.push(...comercial.sheets, ...rest)
  }
  // Libro "TODO CORTE …" (cartera con saldo por documento): se arma el tablero de cartera
  // y se absorben la hoja fuente y las pestañas auxiliares con la misma estructura.
  const cartera = parseCarteraWorkbook(raws, { docIndex, fileName })
  if (cartera) {
    const consumed = new Set(cartera.consumed.map((n) => norm(n)))
    const rest = sheets.filter((s) => !consumed.has(norm(('sheetName' in s && s.sheetName) || s.name)))
    sheets.length = 0
    sheets.push(...cartera.sheets, ...rest)
  }
  return { docIndex, fileName, fileSize: buf.byteLength, sheets, parseMs: Date.now() - t0 }
}
