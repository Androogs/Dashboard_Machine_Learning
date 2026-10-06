import type { ReactNode } from 'react'

export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo_sumoto.png"
        alt="SUMOTO S.A."
        className="h-14 w-auto object-contain"
      />
    </div>
  )
}

export function AppHeader({ right, sticky = false }: { right?: ReactNode; sticky?: boolean }) {
  return (
    <header className={`no-print z-30 border-b bg-card/85 backdrop-blur ${sticky? 'sticky top-0' : ''}`}>
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-4 px-5">
        <BrandMark />
        {right}
      </div>
    </header>
  )
}