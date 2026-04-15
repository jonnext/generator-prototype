// ToolbarAvatar — the "JN" circle on the right of the Discovery nav bar.
//
// Pure visual, decorative. aria-hidden because this v1 is a static stub
// with no menu / no profile route. When we wire the real account menu
// later we'll promote it to a <button> with its own label.
//
// Module-level (rerender-no-inline-components).

import { memo } from 'react'

export interface ToolbarAvatarProps {
  className?: string
}

function ToolbarAvatarImpl({ className = '' }: ToolbarAvatarProps) {
  return (
    <div
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-[#F0E9E6] ${className}`}
    >
      <span className="font-heading text-xs/4 font-medium text-[#6C615C]">JN</span>
    </div>
  )
}

export const ToolbarAvatar = memo(ToolbarAvatarImpl)
