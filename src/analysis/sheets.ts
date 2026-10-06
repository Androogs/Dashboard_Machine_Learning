/**
 * Agrupa los reportes por HOJA de Excel para la navegación lateral.
 * Una hoja puede contener varias tablas (ej: VENTA MOTOS → "Sede" y "Marca");
 * en la navegación aparece una sola vez y sus tablas se eligen dentro de la hoja.
 */
import type { Report } from '@/types/report'

export interface SheetTable {
  id: string
  label: string
  report: Report
}

export interface SheetEntry {
  id: string
  title: string
  docIndex: number
  fileName: string
  tables: SheetTable[]
}

const origin = (id: string) => id.split('~')[0].split('-b')[0]
const isGeneric = (n: string) => /^(sheet|hoja)\s*\d*$/i.test(n.trim())

export function groupBySheet(reports: Report[]): SheetEntry[] {
  const out: SheetEntry[] = []
  for (const r of reports) {
    const s = r.mode === 'single' ? r.sheet : r.a
    const key = origin(r.id)
    let entry = out.find((e) => e.id === key)
    if (!entry) {
      const raw = s.sheetName ?? s.name
      const title = s.kind === 'runt' ? s.title : isGeneric(raw) ? r.title : raw
      entry = { id: key, title, docIndex: s.docIndex, fileName: s.fileName, tables: [] }
      out.push(entry)
    }
    const label = s.kind === 'matrix' ? s.tableLabel ?? s.dimensionLabel : s.kind === 'flat' ? s.tableLabel ?? 'Registros' : 'Mercado'
    entry.tables.push({ id: r.id, label: `Por ${label.toLowerCase()}`, report: r })
  }
  return out.sort((a, b) => a.docIndex - b.docIndex)
}
