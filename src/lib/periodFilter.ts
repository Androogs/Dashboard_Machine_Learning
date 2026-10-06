/**
 * Resolución del filtro de período (rango actual + comparación).
 *
 * Traduce un `PeriodFilter` ("2026-01" → "2026-09" + comparación) a listas
 * concretas de `Period` que existen en un reporte. No sabe nada de negocio:
 * solo cruza claves de período ("YYYY-MM" o "YYYY") contra lo disponible.
 *
 * Reglas:
 *  - Si `from` y `to` no existen en el reporte, se ajusta al período más cercano
 *    disponible (nunca se devuelve vacío por un borde desalineado).
 *  - Si el rango ajustado queda vacío (no hay ningún período en el rango),
 *    `empty = true` y `applicable = false`.
 *  - `compare === 'none'` → sin comparación (`comparePeriods = []`).
 *  - `compare === 'year'` → mismo rango, un año antes.
 *  - `compare === 'month'` → mismo tamaño de rango, desplazado un mes.
 *  - `compare === 'custom'` → usa `customFrom` / `customTo`.
 */
import type { Period, PeriodFilter, FilterMode, CompareMode } from '@/types/report'
import { monthLong, monthShort } from '@/lib/format'

export interface ResolvedFilter {
  /** Períodos que entran en el rango actual (ordenados asc). */
  current: Period[]
  /** Períodos que entran en el rango de comparación (ordenados asc). */
  compare: Period[]
  /** Modo derivado del rango. */
  mode: FilterMode
  /** Etiqueta del rango actual ("Enero – Septiembre 2026"). */
  curLabel: string
  /** Etiqueta del rango de comparación ("Enero – Septiembre 2025"), o null. */
  prevLabel: string | null
  /** Rango completo para mostrar en el reporte ("Ene – Sep 2026 vs 2025"). */
  rangeLabel: string
  /** "Acumulado a septiembre 2026" o "Septiembre 2026". */
  badge: string
  /** true si el rango no tiene ningún período disponible (no hay datos). */
  empty: boolean
  /** true si el filtro no aplica a este reporte (sin períodos mensuales y el filtro es mensual). */
  applicable: boolean
}

/* ------------------------------------------------------------------ */

/** "2026-09" → { y: 2026, m: 9 }. "2026" → { y: 2026, m: null }. */
function parseKey(key: string): { y: number; m: number | null } | null {
  const s = String(key ?? '').trim()
  const mm = s.match(/^(\d{4})-(\d{1,2})$/)
  if (mm) {
    const y = Number(mm[1])
    const m = Number(mm[2])
    if (y >= 1900 && y <= 2200 && m >= 1 && m <= 12) return { y, m }
    return null
  }
  const yyyy = s.match(/^(\d{4})$/)
  if (yyyy) {
    const y = Number(yyyy[1])
    if (y >= 1900 && y <= 2200) return { y, m: null }
    return null
  }
  return null
}

const keyOf = (y: number, m: number | null) => (m == null ? String(y) : `${y}-${String(m).padStart(2, '0')}`)

/** Desplaza un año hacia atrás manteniendo el mes. */
const prevYearKey = (key: string): string | null => {
  const p = parseKey(key)
  return p ? keyOf(p.y - 1, p.m) : null
}

/** Desplaza un mes hacia atrás. Si el rango es anual, devuelve el año anterior. */
const prevMonthKey = (key: string): string | null => {
  const p = parseKey(key)
  if (!p) return null
  if (p.m == null) return keyOf(p.y - 1, null)
  return p.m === 1 ? keyOf(p.y - 1, 12) : keyOf(p.y, p.m - 1)
}

/**
 * Deriva el modo a partir del rango:
 *  - mes: from === to, ambos "YYYY-MM"
 *  - acum: from === "YYYY-01" y to === "YYYY-MM" del mismo año
 *  - periodo: from === to, ambos "YYYY"
 *  - rango: cualquier otra combinación
 */
export function modeOf(from: string, to: string): FilterMode {
  const f = parseKey(from)
  const t = parseKey(to)
  if (!f || !t) return 'rango'
  if (f.m == null && t.m == null && f.y === t.y) return 'periodo'
  if (f.m != null && t.m != null && f.y === t.y && f.m === t.m) return 'mes'
  if (f.m === 1 && t.m != null && f.y === t.y) return 'acum'
  return 'rango'
}

/** Etiqueta humana de un rango de períodos. */
function labelFor(periods: Period[], fallback: string): string {
  if (!periods.length) return fallback
  const first = periods[0]
  const last = periods[periods.length - 1]
  // Mismo mes y año → "Septiembre 2026"
  if (first.year === last.year && first.month != null && first.month === last.month) {
    return `${monthLong(first.month)} ${first.year}`
  }
  // Mismo año, varios meses → "Enero – Septiembre 2026"
  if (first.year === last.year && first.month != null && last.month != null) {
    return `${monthLong(first.month)} – ${monthLong(last.month)} ${first.year}`
  }
  // Año completo (un solo período anual) → "2026"
  if (first.year === last.year && first.month == null) return String(first.year)
  // Cross-año o mezcla → "Sep 2025 – Sep 2026"
  const a = first.month ? `${monthShort(first.month)} ${first.year}` : String(first.year)
  const b = last.month ? `${monthShort(last.month)} ${last.year}` : String(last.year)
  return `${a} – ${b}`
}

/**
 * Filtra los períodos disponibles a los que caen entre `from` y `to` (inclusive).
 * `available` debe venir ordenado asc.
 */
function slicePeriods(available: Period[], from: string, to: string): Period[] {
  const f = parseKey(from)
  const t = parseKey(to)
  if (!f || !t) return []
  const fk = keyOf(f.y, f.m)
  const tk = keyOf(t.y, t.m)
  // Si el orden viene invertido, lo corregimos.
  const [lo, hi] = fk <= tk ? [fk, tk] : [tk, fk]
  return available.filter((p) => {
    const pk = parseKey(p.key)
    if (!pk) return false
    const k = keyOf(pk.y, pk.m)
    return k >= lo && k <= hi
  })
}

/**
 * Resuelve un `PeriodFilter` contra la lista de períodos disponibles de un reporte.
 *
 * `available` debe incluir tanto períodos mensuales ("YYYY-MM") como anuales ("YYYY").
 * La función decide qué subset aplica según el tipo de rango.
 */
export function resolveFilter(filter: PeriodFilter, available: Period[]): ResolvedFilter {
  // Orden ascendente por clave (funciona tanto para mensual como anual).
  const avail = [...available].sort((a, b) => a.key.localeCompare(b.key))
  const monthly = avail.some((p) => p.month != null)

  const mode = modeOf(filter.from, filter.to)

  // Si el filtro es mensual y la tabla no tiene períodos mensuales → no aplica.
  const wantsMonthly = mode !== 'periodo' && parseKey(filter.from)?.m != null
  if (wantsMonthly && !monthly) {
    return {
      current: [],
      compare: [],
      mode,
      curLabel: '',
      prevLabel: null,
      rangeLabel: '',
      badge: '',
      empty: false,
      applicable: false,
    }
  }

  const current = slicePeriods(avail, filter.from, filter.to)
  const empty = current.length === 0

  const curLabel = labelFor(current, filter.from === filter.to ? filter.from : `${filter.from} – ${filter.to}`)

  // Rango de comparación
  let compare: Period[] = []
  let prevLabel: string | null = null
  const cmp: CompareMode = filter.compare

  if (cmp !== 'none' && current.length > 0) {
    let cFrom: string | null = null
    let cTo: string | null = null
    if (cmp === 'year') {
      cFrom = prevYearKey(filter.from)
      cTo = prevYearKey(filter.to)
    } else if (cmp === 'month') {
      cFrom = prevMonthKey(filter.from)
      cTo = prevMonthKey(filter.to)
    } else if (cmp === 'custom') {
      cFrom = filter.customFrom ?? null
      cTo = filter.customTo ?? null
    }
    if (cFrom && cTo) {
      compare = slicePeriods(avail, cFrom, cTo)
      if (compare.length) prevLabel = labelFor(compare, cFrom === cTo ? cFrom : `${cFrom} – ${cTo}`)
    }
  }

  const rangeLabel = prevLabel ? `${curLabel} vs ${prevLabel}` : curLabel

  // Badge corto: "Acumulado a septiembre 2026", "Septiembre 2026", "Año 2026" o "Ene – Sep 2026"
  let badge: string
  if (mode === 'acum') {
    const last = current[current.length - 1]
    badge = last?.month ? `Acumulado a ${monthLong(last.month).toLowerCase()} ${last.year}` : `Acumulado ${curLabel}`
  } else if (mode === 'mes') {
    badge = `Mes de ${curLabel.toLowerCase()}`
  } else if (mode === 'periodo') {
    badge = `Año ${current[0]?.year ?? filter.to}`
  } else {
    badge = curLabel
  }

  return {
    current,
    compare,
    mode,
    curLabel,
    prevLabel,
    rangeLabel,
    badge,
    empty,
    applicable: true,
  }
}

/**
 * Construye un filtro por defecto equivalente a lo que hoy hacen `defaultEnvConfig`
 * y compañía: último período con datos y comparación contra el año anterior.
 *
 * Se usa cuando `periodFilter === null`.
 */
export function defaultFilterFrom(
  latestKey: string,
  opts: { monthly: boolean; hasPrevYear: boolean; defaultMode?: FilterMode } = { monthly: true, hasPrevYear: true },
): PeriodFilter {
  const p = parseKey(latestKey)
  if (!p) return { from: latestKey, to: latestKey, compare: 'none' }
  const mode: FilterMode = opts.defaultMode ?? (p.m == null ? 'periodo' : opts.hasPrevYear ? 'acum' : 'mes')
  if (mode === 'acum') {
    return {
      from: keyOf(p.y, 1),
      to: keyOf(p.y, p.m ?? 12),
      compare: opts.hasPrevYear ? 'year' : 'none',
    }
  }
  if (mode === 'mes') {
    return {
      from: keyOf(p.y, p.m ?? 12),
      to: keyOf(p.y, p.m ?? 12),
      compare: opts.hasPrevYear ? 'year' : 'month',
    }
  }
  return { from: latestKey, to: latestKey, compare: 'none' }
}

/** Lista de claves disponibles como opciones de un selector, ordenadas asc. */
export function filterOptions(available: Period[]): { value: string; label: string }[] {
  return [...available]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((p) => ({ value: p.key, label: p.label }))
}

/** ¿El filtro tiene un rango válido (from <= to)? */
export function isValidFilter(f: PeriodFilter): boolean {
  const a = parseKey(f.from)
  const b = parseKey(f.to)
  if (!a || !b) return false
  const ak = keyOf(a.y, a.m)
  const bk = keyOf(b.y, b.m)
  return ak <= bk
}
