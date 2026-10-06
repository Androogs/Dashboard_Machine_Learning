/**
 * Protección contra errores de renderizado.
 * Si un reporte falla, se muestra un aviso en su lugar y el resto del dashboard sigue funcionando
 * (sin esto, React deja la pantalla en blanco).
 */
import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Texto corto de dónde ocurrió (ej: nombre de la hoja) */
  where?: string
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`[Dashboard] Error en ${this.props.where ?? 'un reporte'}:`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft/70 p-5 text-sm" role="alert">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
        <div>
          <p className="font-semibold text-ink">No se pudo graficar {this.props.where ? `"${this.props.where}"` : 'este reporte'}</p>
          <p className="mt-1 text-muted-foreground">
            La estructura de la hoja no coincide con lo esperado. El resto del dashboard sigue disponible. Detalle técnico: {this.state.error.message}
          </p>
        </div>
      </div>
    )
  }
}
