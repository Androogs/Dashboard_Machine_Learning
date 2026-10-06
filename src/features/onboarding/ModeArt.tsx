/**
 * Ilustraciones SVG de las dos opciones de carga.
 * Dibujan una hoja de cálculo esquemática con colores del tema.
 */

const BLUE = 'hsl(223 71% 32%)'
const BLUE_SOFT = 'hsl(221 85% 66%)'
const LINE = 'hsl(220 16% 86%)'
const MUTED = 'hsl(220 18% 93%)'

function Sheet({ x, y, w, h, bars, tabs, label, tone = BLUE }: { x: number; y: number; w: number; h: number; bars: number[]; tabs?: string[]; label?: string; tone?: string }) {
  const rows = 4
  const barW = (w - 40) / bars.length - 6
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill="white" stroke={LINE} />
      <rect x={x} y={y} width={w} height={22} rx={10} fill={MUTED} />
      <rect x={x} y={y + 12} width={w} height={10} fill={MUTED} />
      {label && (
        <text x={x + 12} y={y + 15} fontSize={10} fontWeight={600} fill="hsl(222 47% 25%)" fontFamily="Inter Variable, Inter, sans-serif">
          {label}
        </text>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <line key={i} x1={x + 12} x2={x + w - 12} y1={y + 36 + i * 12} y2={y + 36 + i * 12} stroke={LINE} />
      ))}
      {bars.map((b, i) => (
        <rect
          key={i}
          x={x + 20 + i * (barW + 6)}
          y={y + h - 14 - b}
          width={barW}
          height={b}
          rx={2.5}
          fill={i === bars.length - 1 ? tone : BLUE_SOFT}
          opacity={i === bars.length - 1 ? 1 : 0.55}
        />
      ))}
      {tabs?.map((t, i) => (
        <g key={t}>
          <rect x={x + 10 + i * 64} y={y + h + 6} width={58} height={16} rx={4} fill={i === 0 ? 'white' : MUTED} stroke={LINE} />
          <text x={x + 39 + i * 64} y={y + h + 17} fontSize={8} textAnchor="middle" fill="hsl(220 12% 40%)" fontFamily="Inter Variable, Inter, sans-serif">
            {t}
          </text>
        </g>
      ))}
    </g>
  )
}

export function SingleDocArt() {
  return (
    <svg viewBox="0 0 360 176" className="h-full w-full" aria-hidden>
      <Sheet x={80} y={20} w={200} h={112} bars={[22, 30, 26, 38, 34, 46]} tabs={['Mes a mes', 'Comparativo', 'Acumulado']} label="Informe comercial" />
    </svg>
  )
}

export function TwoDocsArt() {
  return (
    <svg viewBox="0 0 360 176" className="h-full w-full" aria-hidden>
      <Sheet x={30} y={30} w={140} h={112} bars={[24, 32, 28, 40]} label="Documento 1" />
      <Sheet x={190} y={30} w={140} h={112} bars={[20, 26, 30, 30]} label="Documento 2" tone="hsl(220 14% 60%)" />
      <circle cx={180} cy={86} r={15} fill="white" stroke={LINE} />
      <text x={180} y={90} textAnchor="middle" fontSize={11} fontWeight={700} fill={BLUE} fontFamily="Inter Variable, Inter, sans-serif">
        vs
      </text>
    </svg>
  )
}
