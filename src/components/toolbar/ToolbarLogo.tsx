// ToolbarLogo — the dark "N" square on the left of the Discovery nav bar.
//
// Pure visual, decorative. aria-hidden because the interactive nav buttons
// carry the screen-reader labels; the logo is chrome, not navigation.
//
// Module-level (rerender-no-inline-components). Memoized because its render
// output only depends on an optional className prop that Toolbar never
// varies at runtime — no re-render pressure should bleed through.

import { memo } from 'react'

export interface ToolbarLogoProps {
  className?: string
}

function ToolbarLogoImpl({ className = '' }: ToolbarLogoProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[#1B1918] ${className}`}
    >
      <span className="font-heading text-base/5 font-bold text-white">N</span>
    </div>
  )
}

export const ToolbarLogo = memo(ToolbarLogoImpl)
