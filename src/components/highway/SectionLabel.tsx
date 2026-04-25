// SectionLabel — "STEP 02 · Runtime & cluster" rendered in accent-clay.
//
// Paired with HighwayContent's H1 to give students a small editorial anchor
// before the serif display heading. The STEP 02 token is always present;
// the subtitle (here the decision's short label) is optional and hidden when
// sectionLabel is null.

import { memo } from 'react'

export interface SectionLabelProps {
  stepIndex: number
  /** Short section label (e.g. "Runtime & cluster") — nullable. */
  sectionLabel: string | null
}

function SectionLabelImpl({ stepIndex, sectionLabel }: SectionLabelProps) {
  const stepToken = `STEP ${stepIndex.toString().padStart(2, '0')}`
  return (
    <div className="flex items-center gap-3">
      <span
        className="type-label-m"
        style={{ color: 'var(--accent-clay)' }}
      >
        {stepToken}
      </span>
      {sectionLabel ? (
        <span className="font-body text-sm text-brand-400">{sectionLabel}</span>
      ) : null}
    </div>
  )
}

export const SectionLabel = memo(SectionLabelImpl)
