// ExplorePathPill — the tiny dark pill sitting in the top-right of the
// SearchCard. Purely visual for v1 (no click handler, no state). Lifted
// verbatim from Paper frame `HV-0` "nextwork-starting point".
//
// Kept at module level per rerender-no-inline-components so its identity
// is stable across SearchCard re-renders.

export function ExplorePathPill() {
  return (
    <div className="flex justify-end">
      <div className="flex h-6.5 items-center rounded-[13px] bg-[#1B1918] px-3">
        <span className="text-[11px]/3.5 font-medium text-white">
          Explore your path
        </span>
      </div>
    </div>
  )
}
