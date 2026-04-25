// HighwayScreen — the focused-step reading column (2X8-0 fidelity).
//
// Sibling to CanvasScreen in App.tsx's AnimatePresence, chosen when
// phase === 'focused'. Composition:
//
//   HighwayHeader       — sticky top bar (← Shape, STEP pill, title, dots)
//   HighwayContent      — 680px reading column (section label, H1, body,
//                         checklist, terminal blocks, action chips)
//   HighwayDock         — fixed bottom dock (prev | ask input | next)
//
// HighwayScreen is passed an ActionPlan and a focusedStepId and derives
// everything else from those. Prev/Next nav computes adjacent stepIds from
// the plan's step array and calls onFocusStep with the new id — the reducer
// does the phase bookkeeping, this component stays presentational.
//
// Chunk B: no morph — the switch from CanvasScreen is a cut. Chunk C adds
// layoutId-based morphing. Keep the structure here unchanged when Chunk C
// lands; the layoutIds are already wired into HighwayHeader + HighwayContent.

import { memo, useCallback, useMemo } from 'react'
import { HighwayHeader } from '@/components/highway/HighwayHeader'
import { HighwayContent } from '@/components/highway/HighwayContent'
import { HighwayDock } from '@/components/highway/HighwayDock'
import type { ActionPlan } from '@/lib/state'

export interface HighwayScreenProps {
  actionPlan: ActionPlan
  focusedStepId: string
  /** Optional project total minutes (from the skeleton's timeMinutes). */
  totalMinutes?: number
  onFocusStep: (stepId: string) => void
  onExit: () => void
  /** Chunk D wires this through dispatchStepChat. */
  onAskStep: (stepId: string, message: string) => void
  /** Pill pick — (stepId, decisionType, selected, aiPicked). Raw engine setter. */
  setStepPill: (
    stepId: string,
    decisionType: string,
    selected: string,
    aiPicked: boolean,
  ) => void
}

function HighwayScreenImpl({
  actionPlan,
  focusedStepId,
  totalMinutes,
  onFocusStep,
  onExit,
  onAskStep,
  setStepPill,
}: HighwayScreenProps) {
  const { step, stepIndex, prevStepId, nextStepId, prevStepLabel, nextStepLabel } =
    useMemo(() => {
      const index = actionPlan.steps.findIndex((s) => s.id === focusedStepId)
      const safeIndex = index < 0 ? 0 : index
      const resolvedStep = actionPlan.steps[safeIndex] ?? actionPlan.steps[0]
      const prev = safeIndex > 0 ? actionPlan.steps[safeIndex - 1] : null
      const next =
        safeIndex < actionPlan.steps.length - 1
          ? actionPlan.steps[safeIndex + 1]
          : null
      return {
        step: resolvedStep,
        stepIndex: safeIndex,
        prevStepId: prev?.id ?? null,
        nextStepId: next?.id ?? null,
        prevStepLabel: prev?.heading ?? null,
        nextStepLabel: next?.heading ?? null,
      }
    }, [actionPlan, focusedStepId])

  const handlePrev = useCallback(() => {
    if (prevStepId) onFocusStep(prevStepId)
  }, [prevStepId, onFocusStep])

  const handleNext = useCallback(() => {
    if (nextStepId) onFocusStep(nextStepId)
  }, [nextStepId, onFocusStep])

  const handleAsk = useCallback(
    (message: string) => onAskStep(step.id, message),
    [onAskStep, step.id],
  )

  // Step-scoped pill handlers — same wrapper pattern as CanvasScreen.
  const handlePickPill = useCallback(
    (decisionType: string, selected: string) => {
      setStepPill(step.id, decisionType, selected, false)
    },
    [setStepPill, step.id],
  )

  const handleRandomizePill = useCallback(
    (decisionType: string) => {
      // RP1: read Claude's pick from the plan's pillDefinitions rather
      // than hardcoded copy.rationales. Fallback to the decisionType slug
      // so state stays valid if the definition is missing.
      const picked =
        actionPlan.pillDefinitions[decisionType]?.picked ?? decisionType
      setStepPill(step.id, decisionType, picked, true)
    },
    [actionPlan.pillDefinitions, setStepPill, step.id],
  )

  // Resolve ALL unresolved pills at once — the step-level "I don't know,
  // help me here" action. Loops through pills and AI-picks any that the
  // student hasn't chosen yet.
  const handleRandomizeAll = useCallback(() => {
    for (const pill of step.pills) {
      if (pill.selected === null) {
        const picked =
          actionPlan.pillDefinitions[pill.decisionType]?.picked ?? pill.decisionType
        setStepPill(step.id, pill.decisionType, picked, true)
      }
    }
  }, [step.pills, step.id, actionPlan.pillDefinitions, setStepPill])

  // Use first word of heading as the step "topic" for the ask-input
  // placeholder — cheap heuristic until Chunk D parses sectionLabel via
  // the shared parser. Good enough: "Choose a container runtime…" → "Choose".
  const stepTopic = step.heading.split(/\s+/)[0]?.toLowerCase() ?? 'this step'

  return (
    <div className="relative min-h-dvh w-full bg-paper text-leather">
      <HighwayHeader
        planTitle={actionPlan.title}
        stepIndex={stepIndex}
        totalSteps={actionPlan.steps.length}
        totalMinutes={totalMinutes}
        onExit={onExit}
      />
      <HighwayContent
        step={step}
        stepIndex={stepIndex}
        pillDefinitions={actionPlan.pillDefinitions}
        onAskAboutStep={() => {
          // Focus the ask input via native form focus.
          const input = document.querySelector<HTMLInputElement>(
            'input[aria-label^="Ask about"]',
          )
          input?.focus()
        }}
        onPickPill={handlePickPill}
        onRandomizePill={handleRandomizePill}
        onRandomizeAll={handleRandomizeAll}
      />
      <HighwayDock
        stepTopic={stepTopic}
        stepIndex={stepIndex}
        totalSteps={actionPlan.steps.length}
        prevStepLabel={prevStepLabel}
        nextStepLabel={nextStepLabel}
        onPrev={handlePrev}
        onNext={handleNext}
        onExit={onExit}
        onAsk={handleAsk}
      />
    </div>
  )
}

export const HighwayScreen = memo(HighwayScreenImpl)
