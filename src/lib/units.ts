/**
 * Formateadores según la unidad de medida (pesos o cantidades).
 * Todo el dashboard formatea valores a través de estas funciones para que
 * un reporte de motos diga "3.410 motos" y uno de repuestos "$ 460,0 M".
 */
import type { UnitInfo } from '@/types/report'
import { fmtCOP, fmtCOPCompact, fmtCompact, fmtInt } from './format'

export interface ValueFormat {
  /** KPIs, tooltips e insights: "$ 460,0 M" / "3.410 motos" */
  compact: (v: number | null | undefined) => string
  /** Tablas: "$ 460.036.633" / "3.410" */
  full: (v: number | null | undefined) => string
  /** Ejes de gráficas */
  axis: (v: number) => string
  unit: UnitInfo
}

const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 })

export function valueFormat(unit: UnitInfo): ValueFormat {
  if (unit.kind === 'money') return { compact: fmtCOPCompact, full: fmtCOP, axis: fmtCompact, unit }
  const fmtQty = (v: number | null | undefined) => (v == null || !isFinite(v) ? '—' : Number.isInteger(v) ? fmtInt(v) : nf1.format(v))
  return {
    compact: (v) => (v == null || !isFinite(v) ? '—' : unit.label ? `${fmtQty(v)} ${unit.label}` : fmtQty(v)),
    full: fmtQty,
    axis: fmtCompact,
    unit,
  }
}

export const MONEY: UnitInfo = { kind: 'money', label: '' }

/**
 * Detecta si un conjunto de valores son pesos o cantidades.
 * Criterio: si más del 20 % tiene decimales o la mediana supera 100.000 → pesos.
 * Si no, son cantidades. El sufijo es "motos" cuando el contexto (hoja, título o
 * archivo) menciona motos/motocicletas; si no, "unid.".
 */
export function detectUnit(values: number[], context: string): UnitInfo {
  const vals = values.filter((v) => v != null && isFinite(v) && v !== 0)
  if (!vals.length) return { kind: 'units', label: unitLabelFor(context) }
  const decimals = vals.filter((v) => Math.abs(v - Math.round(v)) > 1e-6).length / vals.length
  const sorted = vals.map(Math.abs).sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (decimals > 0.2 || median >= 100_000 || /\$|pesos|valor|repuesto|mano de obra|ingreso|costo|utilidad|gasto/i.test(context) && median >= 1000) {
    return MONEY
  }
  return { kind: 'units', label: unitLabelFor(context) }
}

export const unitLabelFor = (context: string) => (/moto/i.test(context) ? 'motos' : 'unid.')
