// BlockShimmer — DP1.5.G.
//
// Placeholder displayed while Phase B is generating a step's blocks
// (step.blocks === undefined). Three faux block rows — a paragraph-ish
// line, a short heading-ish line, a bullet-list-ish set — that signal
// "content incoming" without pretending to be real content.
//
// motion-safe:animate-pulse keeps the shimmer subtle and disables it for
// users with prefers-reduced-motion. DP1.5.H will layer on a smoother
// crossfade when real blocks arrive.

import { memo } from 'react'

function BlockShimmerImpl() {
  return (
    <div
      aria-hidden
      className="flex flex-col gap-3 motion-safe:animate-pulse"
    >
      {/* Opening paragraph line */}
      <div className="flex flex-col gap-1.5">
        <div className="h-3 w-full rounded bg-brand-50/80" />
        <div className="h-3 w-[90%] rounded bg-brand-50/80" />
        <div className="h-3 w-[70%] rounded bg-brand-50/80" />
      </div>
      {/* Task list header — shorter */}
      <div className="h-3 w-[45%] rounded bg-brand-50/70" />
      {/* Three list items */}
      <div className="flex flex-col gap-2 pl-4">
        <div className="h-2.5 w-[80%] rounded bg-brand-50/60" />
        <div className="h-2.5 w-[65%] rounded bg-brand-50/60" />
        <div className="h-2.5 w-[72%] rounded bg-brand-50/60" />
      </div>
    </div>
  )
}

export const BlockShimmer = memo(BlockShimmerImpl)
