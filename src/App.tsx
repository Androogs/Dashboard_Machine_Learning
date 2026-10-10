/**
 * Componente raíz: enruta según el paso del flujo guardado en el store.
 */
import { useAppStore } from '@/store/useAppStore'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { UploadStep } from '@/features/onboarding/UploadStep'
import { ProcessingScreen } from '@/features/processing/ProcessingScreen'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { ReviewStep } from '@/features/review/ReviewStep'

export default function App() {
  const step = useAppStore((s) => s.step)

  return (
    <TooltipProvider delayDuration={200}>
      {step === 'onboarding' && <Onboarding />}
      {step === 'upload' && <UploadStep />}
      {step === 'processing' && <ProcessingScreen />}
      {step === 'review' && <ReviewStep />}
      {step === 'dashboard' && <Dashboard />}
    </TooltipProvider>
  )
}
