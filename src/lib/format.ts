/**
 * Utilidades de formato numérico y de texto (locale es-CO).
 * Todas las cifras monetarias se reportan en pesos colombianos.
 */

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MONTHS_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export const monthShort = (m: number) => MONTHS_SHORT[(m - 1 + 12) % 12]
export const monthLong = (m: number) => MONTHS_LONG[(m - 1 + 12) % 12]

const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Número entero con separador de miles: 1.234.567 */
export const fmtInt = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : nf0.format(n))

/** Pesos completos: $ 1.234.567 */
export const fmtCOP = (n: number | null | undefined) => (n == null || !isFinite(n) ? '—' : `$ ${nf0.format(n)}`)

/**
 * Pesos compactos expresados en millones (convención financiera local):
 * 460.036.633 → "$ 460,0 M"; 3.519.101.211 → "$ 3.519,1 M"; 845.000 → "$ 845 mil"
 */
export function fmtCOPCompact(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}$ ${nf1.format(abs / 1e6)} M`
  if (abs >= 1e3) return `${sign}$ ${nf0.format(abs / 1e3)} mil`
  return `${sign}$ ${nf0.format(abs)}`
}

/** Número compacto sin signo de pesos (para ejes de gráficas). */
export function fmtCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${nf1.format(n / 1e9)} MM`
  if (abs >= 1e6) return `${nf0.format(n / 1e6)} M`
  if (abs >= 1e3) return `${nf0.format(n / 1e3)} k`
  return nf0.format(n)
}

/** Porcentaje a partir de razón: 0.1534 → "15,3 %" */
export const fmtPct = (r: number | null | undefined, digits = 1) =>
  r == null || !isFinite(r)
    ? '—'
    : `${new Intl.NumberFormat('es-CO', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(r * 100)} %`

/** Variación con signo: +15,3 % / -10,0 % */
export const fmtVar = (r: number | null | undefined, digits = 1) =>
  r == null || !isFinite(r) ? '—' : `${r > 0 ? '+' : ''}${fmtPct(r, digits)}`

/** Tipo de medida para decidir el formato. */
export type MeasureKind = 'money' | 'count' | 'number'

/** Formatea un valor según el tipo de medida. */
export function fmtByKind(n: number | null | undefined, kind: MeasureKind, compact = true) {
  if (kind === 'money') return compact ? fmtCOPCompact(n) : fmtCOP(n)
  return fmtInt(n)
}

/** Variación relativa segura: (actual - base) / |base|. Devuelve null si la base es 0 o no existe. */
export function variation(current: number | null | undefined, base: number | null | undefined): number | null {
  if (current == null || base == null || !isFinite(current) || !isFinite(base) || base === 0) return null
  return (current - base) / Math.abs(base)
}

/** Capitaliza: "REPUESTOS SUZUKI CENTRO" → "Repuestos Suzuki Centro" (mantiene siglas). */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (['akt', 'mo', 'dms'].includes(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/**
 * Etiqueta corta para nombres de bodega/agencia del DMS.
 * "102 - CL 30 33 80 REPUESTOS PRINCIPAL" → "102 Principal"
 * "503  CALLE 9 18 34 TALLER HONDA"       → "503 Honda"
 * Si no reconoce el patrón, recorta a 26 caracteres.
 */
export function shortLabel(raw: string): string {
  const s = String(raw ?? '').replace(/\s+/g, ' ').trim()
  const m = s.match(/^(\d{2,4})\b.*?\b(REPUESTOS|TALLER)\b\s*(.*)$/i)
  if (m) {
    const rest = m[3].trim()
    return `${m[1]} ${rest ? titleCase(rest) : titleCase(m[2])}`
  }
  // "116 - CL 6 28 61 SUZUKI CALI" → "116 Suzuki Cali" (se quita la dirección)
  const addr = s.match(/^(\d{2,4})\s*-?\s+((?:CL|CR|CRA|KR|CALLE|CARRERA|AV|AVENIDA|DG|TV|TR)\.?\s?\d.*)$/i)
  if (addr) {
    const tokens = addr[2].split(' ')
    let k = 0
    while (k < tokens.length && (/^(CL|CR|CRA|KR|CALLE|CARRERA|AV|AVENIDA|DG|TV|TR|LC|LOCAL|NO|N°|#)\.?$/i.test(tokens[k]) || /\d/.test(tokens[k]) || tokens[k].length <= 1)) k++
    const name = tokens.slice(k).join(' ')
    if (name) {
      const out = `${addr[1]} ${titleCase(name)}`
      return out.length > 26 ? `${out.slice(0, 25)}…` : out
    }
  }
  // "101 - ALMACEN PRINCIPAL PALMIRA" → "101 Almacen Principal Palmira" (recortado)
  const c = s.match(/^(\d{1,5})\s*-\s*(.+)$/)
  if (c) {
    const out = `${c[1]} ${titleCase(c[2])}`
    return out.length > 26 ? `${out.slice(0, 25)}…` : out
  }
  return s.length > 26 ? `${s.slice(0, 25)}…` : s
}

/** Normaliza texto para comparar cabeceras/nombres: sin tildes, minúsculas, espacios simples. */
export function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Plural simple en español: "AGENCIA" → "agencias", "BODEGA" → "bodegas", "MES" → "meses". */
export function plural(w: string): string {
  const x = w.toLowerCase().trim() || 'elemento'
  if (!/[a-zñ]$/.test(x) || x.includes(' ')) return 'filas'
  return /s$/.test(x) ? x : /[aeiou]$/.test(x) ? `${x}s` : `${x}es`
}

/** Tamaño de archivo legible. */
export function fmtBytes(b: number): string {
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(b / 1024))} KB`
}
