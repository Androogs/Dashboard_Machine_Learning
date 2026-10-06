/**
 * Formato de una medida de base plana: pesos si es dinero; cantidades con
 * sufijo ("410 motos") si es un conteo/cantidad; número simple en otro caso.
 */
import type { FlatColumn, FlatSheet } from '@/types/report'
import { MONEY, valueFormat, type ValueFormat } from '@/lib/units'
import { isQuantity } from './flat'

export function flatFormat(s: FlatSheet, m: FlatColumn): ValueFormat {
  if (m.measureKind === 'money') return valueFormat(MONEY)
  return valueFormat({ kind: 'units', label: isQuantity(m) ? s.unitLabel : '' })
}
