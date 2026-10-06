/**
 * Tema compartido de gráficas (Recharts y Chart.js).
 * Cambia aquí la paleta de series.
 */
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, Legend, LinearScale, LineElement, PointElement, Tooltip, Filler, BarController, LineController, DoughnutController } from 'chart.js'

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler, BarController, LineController, DoughnutController)
ChartJS.defaults.font.family = '"Inter Variable", Inter, system-ui, sans-serif'
ChartJS.defaults.font.size = 11
ChartJS.defaults.color = 'hsl(220 12% 44%)'

export const C = {
  primary: 'hsl(223 71% 32%)',
  primaryMid: 'hsl(222 70% 50%)',
  primarySoft: 'hsl(221 85% 70%)',
  compare: 'hsl(220 15% 72%)',
  target: 'hsl(32 92% 44%)',
  positive: 'hsl(158 72% 32%)',
  negative: 'hsl(4 74% 49%)',
  warning: 'hsl(36 92% 48%)',
  grid: 'hsl(220 16% 92%)',
  axis: 'hsl(220 12% 50%)',
}

/** Paleta categórica (marcas, grupos, segmentos) */
export const PALETTE = ['hsl(223 71% 32%)', 'hsl(199 80% 44%)', 'hsl(168 60% 38%)', 'hsl(36 92% 50%)', 'hsl(262 50% 56%)', 'hsl(340 62% 54%)', 'hsl(220 12% 60%)', 'hsl(95 45% 45%)']

/** Colores para años en gráficas año a año: el más reciente en azul fuerte */
export const yearColor = (i: number, total: number) => (i === total - 1 ? C.primary : i === total - 2 ? C.compare : PALETTE[(i + 3) % PALETTE.length])

export const axisTick = { fontSize: 11, fill: C.axis }
