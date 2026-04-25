// HighwayContent — the 680px shaping column for the focused step.
//
// Composes: SectionLabel → display H1 → shaping placeholder → pill decision
// rows (StepPill + ResearchCard) → two action chips: "I don't know, help me
// here" (resolves all pills) + "Ask about this step" (focuses dock input).
//
// This is a SHAPING surface, not a content display. The student drills into
// Highway to make decisions (pick pills, compare options, refine via chat).
// Body content is production's section-generator's job — it arrives after
// Build, not here.

import { motion } from 'motion/react'
import { memo, useCallback, useMemo, useState } from 'react'
import { layoutIds } from '@/motion/transitions'
import { focusMorph } from '@/motion/springs'
import { SectionLabel } from './SectionLabel'
import { StepPill } from '@/components/canvas/StepPill'
import { ResearchCard } from '@/components/canvas/ResearchCard'
import type { PillDefinition, Step } from '@/lib/state'

export interface HighwayContentProps {
  step: Step
  /** 0-based focused step index (for SectionLabel "STEP 02"). */
  stepIndex: number
  /**
   * Plan-level pill definitions keyed by decisionType. Carries the Claude-
   * generated question + options + rationale. Replaces the previous
   * hardcoded lookup into copy.ts:researchComparisons (RP1).
   */
  pillDefinitions: Record<string, PillDefinition>
  /** Focus the dock ask input. */
  onAskAboutStep: () => void
  /** Step-scoped pill pick — decisionType + selected value. */
  onPickPill: (decisionType: string, selected: string) => void
  /** Step-scoped randomize — resolves one pill's "I don't know" to AI pick. */
  onRandomizePill: (decisionType: string) => void
  /** Resolve ALL unresolved pills at once — the step-level "help me" action. */
  onRandomizeAll: () => void
}

function HighwayContentImpl({
  step,
  stepIndex,
  pillDefinitions,
  onAskAboutStep,
  onPickPill,
  onRandomizePill,
  onRandomizeAll,
}: HighwayContentProps) {
  const humanStepIndex = stepIndex + 1

  // Local "reopen the pill row" state — same pattern as StepCard. Tracks
  // which decisionType's chip the student has tapped to edit again.
  const [reopenedDecision, setReopenedDecision] = useState<string | null>(null)

  const handlePick = useCallback(
    (decisionType: string, selected: string) => {
      setReopenedDecision(null)
      onPickPill(decisionType, selected)
    },
    [onPickPill],
  )

  const handleRandomize = useCallback(
    (decisionType: string) => {
      setReopenedDecision(null)
      onRandomizePill(decisionType)
    },
    [onRandomizePill],
  )

  const handleReopen = useCallback((decisionType: string) => {
    setReopenedDecision(decisionType)
  }, [])

  // Derive pill option lists from the plan's pillDefinitions — same
  // memoization pattern as StepCard so a chat tray pulse doesn't re-walk
  // the map.
  const pillOptionsByDecision = useMemo(() => {
    const map: Record<string, { id: string; label: string }[]> = {}
    for (const pill of step.pills) {
      const definition = pillDefinitions[pill.decisionType]
      map[pill.decisionType] = definition
        ? definition.options.map((name) => ({ id: name, label: name }))
        : []
    }
    return map
  }, [step.pills, pillDefinitions])

  // Show "help me" chip when there are unresolved pills to resolve.
  const hasUnresolvedPills = step.pills.some((p) => p.selected === null)

  return (
    <main className="mx-auto flex w-full max-w-[680px] flex-col gap-8 px-4 pt-16 pb-40">
      <SectionLabel
        stepIndex={humanStepIndex}
        sectionLabel={null}
      />
      <motion.h1
        layoutId={layoutIds.stepHeading(step.id)}
        transition={focusMorph}
        className="type-display-l text-leather"
      >
        {step.heading}
      </motion.h1>

      <p className="font-body text-[17px] leading-[26px] text-brand-400">
        Pick your preferences — we'll fill in the details when you build.
      </p>

      {/* Pill decision rows — one per decision this step attaches. */}
      {step.pills.length > 0 ? (
        <div className="flex flex-col gap-3 border-t border-brand-50 pt-4">
          {step.pills.map((pill) => {
            const definition = pillDefinitions[pill.decisionType]
            const question = definition?.question ?? 'Pick one:'
            const isOpen = reopenedDecision === pill.decisionType
            return (
              <div
                key={pill.decisionType}
                className="flex w-full flex-col gap-2"
              >
                <StepPill
                  row={pill}
                  question={question}
                  options={pillOptionsByDecision[pill.decisionType] ?? []}
                  onPick={handlePick}
                  onRandomize={handleRandomize}
                  onReopen={handleReopen}
                  isOpen={isOpen}
                  rationale={definition?.rationale}
                />
                <ResearchCard
                  decisionType={pill.decisionType}
                  currentSelection={pill.selected}
                />
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Shaping actions — the two things a student can do on this surface. */}
      <ShapingActions
        onRandomizeAll={onRandomizeAll}
        onAskAboutStep={onAskAboutStep}
        hasUnresolvedPills={hasUnresolvedPills}
      />
    </main>
  )
}

export const HighwayContent = memo(HighwayContentImpl)

// ----------------------------------------------------------------------------
// ShapingActions — module-level per rerender-no-inline-components.
// Two chips: "I don't know, help me here" (primary) + "Ask about this step".
// ----------------------------------------------------------------------------

interface ShapingActionsProps {
  onRandomizeAll: () => void
  onAskAboutStep: () => void
  hasUnresolvedPills: boolean
}

function ShapingActionsImpl({
  onRandomizeAll,
  onAskAboutStep,
  hasUnresolvedPills,
}: ShapingActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-brand-50 pt-4">
      {hasUnresolvedPills ? (
        <button
          type="button"
          onClick={onRandomizeAll}
          className="font-body inline-flex h-8 items-center rounded-full border border-dashed border-brand-200 bg-transparent px-4 text-sm text-brand-500 hover:border-brand-300 hover:text-leather focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
        >
          I don't know, help me here
        </button>
      ) : null}
      <button
        type="button"
        onClick={onAskAboutStep}
        className="font-body inline-flex h-8 items-center rounded-full bg-leather px-4 text-sm text-paper hover:bg-leather/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        Ask about this step
      </button>
    </div>
  )
}

const ShapingActions = memo(ShapingActionsImpl)
