// The shaping engine — composed from four independent sub-hooks per the
// rerender-split-combined-hooks rule. Each sub-hook owns a slice of state
// with its own useReducer/useState, so a chat tray pulse update doesn't
// invalidate step choices, and a pill swap doesn't re-render the chat
// messages list.
//
// The top-level useShapingEngine composes them. Cross-slice coordination
// (e.g. "start materializing" both sets phase and seeds an empty actionPlan)
// happens at the composition layer, not inside the sub-hooks.
//
// Consumers should prefer calling the sub-hook they need directly:
//
//   const { phase, setPhase } = usePhase()           // only re-renders on phase change
//   const { personal, setPersonalPill } = usePersonalPills()
//   const { actionPlan, setStepPill, ... } = useStepChoices()
//   const { chat, openChat, ... } = useChatTray()
//
// Reach for useShapingEngine() only at the App root where you need every
// slice at once (phase machine wiring, Claude integration).

import { useCallback, useReducer, useRef, useState } from 'react'
import {
  DEFAULT_PERSONAL,
  DEFAULT_PERSONAL_ORIGINS,
  type ActionPlan,
  type ChatMessage,
  type InpaintingAction,
  type PersonalPillOrigins,
  type PersonalPills,
  type Phase,
  type PillOrigin,
  type Step,
  type StepPillRow,
} from '@/lib/state'

// =============================================================================
// Slice 1 — phase
// =============================================================================
//
// The phase is a pure enum with no dependencies on other state, so it lives
// in its own useState. Components that only care about the phase (e.g. the
// chat tray pulse) subscribe here and skip re-renders for pill changes.

export interface PhaseSlice {
  phase: Phase
  setPhase: (phase: Phase) => void
}

export function usePhase(): PhaseSlice {
  const [phase, setPhaseState] = useState<Phase>('discovery')
  const setPhase = useCallback((next: Phase) => setPhaseState(next), [])
  return { phase, setPhase }
}

// =============================================================================
// Slice 2 — personal pills (duration, mode, budget)
// =============================================================================
//
// Personal pills are a small shape mutated by the metadata row and by chat
// commands like "I'm a beginner". A mini reducer keeps individual setters
// stable and lets the chat tray patch multiple keys in one dispatch.

// The personal slice now carries two parallel shapes: the pill VALUES
// (PersonalPills) and their ORIGINS (PersonalPillOrigins). Origins are updated
// in lockstep with values so a render never sees a stale origin relative to
// a value. Keeping them in the same reducer (rather than two useReducers)
// guarantees atomic updates for the MetadataRow consumer.

interface PersonalState {
  personal: PersonalPills
  origins: PersonalPillOrigins
}

const INITIAL_PERSONAL: PersonalState = {
  personal: DEFAULT_PERSONAL,
  origins: DEFAULT_PERSONAL_ORIGINS,
}

type PersonalAction =
  | {
      type: 'SET'
      key: keyof PersonalPills
      value: string
      origin: PillOrigin
    }
  | {
      type: 'PATCH'
      patch: Partial<PersonalPills>
      origin: PillOrigin
    }
  | { type: 'RESET' }

function personalReducer(
  state: PersonalState,
  action: PersonalAction,
): PersonalState {
  switch (action.type) {
    case 'SET':
      return {
        personal: { ...state.personal, [action.key]: action.value },
        origins: { ...state.origins, [action.key]: action.origin },
      }
    case 'PATCH': {
      const nextOrigins: PersonalPillOrigins = { ...state.origins }
      for (const key of Object.keys(action.patch) as Array<keyof PersonalPills>) {
        nextOrigins[key] = action.origin
      }
      return {
        personal: { ...state.personal, ...action.patch },
        origins: nextOrigins,
      }
    }
    case 'RESET':
      return INITIAL_PERSONAL
  }
}

export interface PersonalPillsSlice {
  personal: PersonalPills
  personalOrigins: PersonalPillOrigins
  /**
   * Student tap from MetadataRow. The only caller today is the user-driven
   * cycle click, so origin is always 'user-confirmed'. If a future caller
   * needs a different origin it should use `applyAiPersonalPills` instead.
   */
  setPersonalPill: <K extends keyof PersonalPills>(
    key: K,
    value: PersonalPills[K],
  ) => void
  patchPersonal: (patch: Partial<PersonalPills>) => void
  /**
   * Applied when a skeleton lands with Claude's proposed difficulty /
   * timeMinutes / etc. Sets the values AND marks their origin as
   * 'ai-picked' so MetadataRow can render the AI badge treatment.
   */
  applyAiPersonalPills: (patch: Partial<PersonalPills>) => void
  resetPersonal: () => void
}

export function usePersonalPills(): PersonalPillsSlice {
  const [{ personal, origins }, dispatch] = useReducer(
    personalReducer,
    INITIAL_PERSONAL,
  )

  const setPersonalPill = useCallback(
    <K extends keyof PersonalPills>(key: K, value: PersonalPills[K]) =>
      dispatch({
        type: 'SET',
        key,
        value: value as string,
        origin: 'user-confirmed',
      }),
    [],
  )
  const patchPersonal = useCallback(
    (patch: Partial<PersonalPills>) =>
      dispatch({ type: 'PATCH', patch, origin: 'user-confirmed' }),
    [],
  )
  const applyAiPersonalPills = useCallback(
    (patch: Partial<PersonalPills>) =>
      dispatch({ type: 'PATCH', patch, origin: 'ai-picked' }),
    [],
  )
  const resetPersonal = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    personal,
    personalOrigins: origins,
    setPersonalPill,
    patchPersonal,
    applyAiPersonalPills,
    resetPersonal,
  }
}

// =============================================================================
// Slice 3 — step choices (the action plan and its inline sculpting state)
// =============================================================================
//
// This is the largest slice. It owns the actionPlan object — title, steps,
// per-step pills, inpainting action, body text, and completion flag. Because
// the action plan is a nested tree, we use useReducer so mutations stay
// explicit and the reducer is testable in isolation.
//
// Selectors are exported as pure functions at the bottom of this module so
// components can read derived values at render time without subscribing to
// the whole tree (per rerender-defer-reads).

interface StepChoicesState {
  actionPlan: ActionPlan | null
  expandedStepId: string | null
}

const INITIAL_CHOICES: StepChoicesState = {
  actionPlan: null,
  expandedStepId: null,
}

type StepChoicesAction =
  | { type: 'SET_PLAN'; plan: ActionPlan | null }
  | { type: 'EXPAND_STEP'; stepId: string | null }
  | {
      type: 'SET_STEP_PILL'
      stepId: string
      decisionType: string
      selected: string
      aiPicked: boolean
    }
  | {
      type: 'START_INPAINTING'
      stepId: string
      action: Exclude<InpaintingAction, null>
    }
  | { type: 'STEP_BODY_CHUNK'; stepId: string; chunk: string }
  | { type: 'STEP_BODY_COMPLETE'; stepId: string }
  | { type: 'INPAINTING_COMPLETE'; stepId: string; newBody: string }
  | { type: 'RESET' }

function mapStep(
  plan: ActionPlan,
  stepId: string,
  transform: (step: Step) => Step,
): ActionPlan {
  return {
    ...plan,
    steps: plan.steps.map((step) => (step.id === stepId ? transform(step) : step)),
  }
}

function stepChoicesReducer(
  state: StepChoicesState,
  action: StepChoicesAction,
): StepChoicesState {
  switch (action.type) {
    case 'SET_PLAN':
      return { ...state, actionPlan: action.plan }

    case 'EXPAND_STEP':
      return { ...state, expandedStepId: action.stepId }

    case 'SET_STEP_PILL': {
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: mapStep(state.actionPlan, action.stepId, (step) => ({
          ...step,
          pills: step.pills.map((pill) =>
            pill.decisionType === action.decisionType
              ? {
                  ...pill,
                  selected: action.selected,
                  aiPicked: action.aiPicked,
                }
              : pill,
          ),
        })),
      }
    }

    case 'START_INPAINTING': {
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: mapStep(state.actionPlan, action.stepId, (step) => ({
          ...step,
          inpainting: action.action,
        })),
      }
    }

    case 'STEP_BODY_CHUNK': {
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: mapStep(state.actionPlan, action.stepId, (step) => ({
          ...step,
          body: step.body + action.chunk,
        })),
      }
    }

    case 'STEP_BODY_COMPLETE': {
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: mapStep(state.actionPlan, action.stepId, (step) => ({
          ...step,
          isComplete: true,
        })),
      }
    }

    case 'INPAINTING_COMPLETE': {
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: mapStep(state.actionPlan, action.stepId, (step) => ({
          ...step,
          body: action.newBody,
          inpainting: null,
        })),
      }
    }

    case 'RESET':
      return INITIAL_CHOICES
  }
}

export interface StepChoicesSlice {
  actionPlan: ActionPlan | null
  expandedStepId: string | null
  setActionPlan: (plan: ActionPlan | null) => void
  expandStep: (stepId: string | null) => void
  setStepPill: (
    stepId: string,
    decisionType: string,
    selected: string,
    aiPicked: boolean,
  ) => void
  startInpainting: (
    stepId: string,
    action: Exclude<InpaintingAction, null>,
  ) => void
  appendStepBodyChunk: (stepId: string, chunk: string) => void
  stepBodyComplete: (stepId: string) => void
  inpaintingComplete: (stepId: string, newBody: string) => void
  resetStepChoices: () => void
}

export function useStepChoices(): StepChoicesSlice {
  const [{ actionPlan, expandedStepId }, dispatch] = useReducer(
    stepChoicesReducer,
    INITIAL_CHOICES,
  )

  const setActionPlan = useCallback(
    (plan: ActionPlan | null) => dispatch({ type: 'SET_PLAN', plan }),
    [],
  )
  const expandStep = useCallback(
    (stepId: string | null) => dispatch({ type: 'EXPAND_STEP', stepId }),
    [],
  )
  const setStepPill = useCallback(
    (stepId: string, decisionType: string, selected: string, aiPicked: boolean) =>
      dispatch({
        type: 'SET_STEP_PILL',
        stepId,
        decisionType,
        selected,
        aiPicked,
      }),
    [],
  )
  const startInpainting = useCallback(
    (stepId: string, action: Exclude<InpaintingAction, null>) =>
      dispatch({ type: 'START_INPAINTING', stepId, action }),
    [],
  )
  const appendStepBodyChunk = useCallback(
    (stepId: string, chunk: string) =>
      dispatch({ type: 'STEP_BODY_CHUNK', stepId, chunk }),
    [],
  )
  const stepBodyComplete = useCallback(
    (stepId: string) => dispatch({ type: 'STEP_BODY_COMPLETE', stepId }),
    [],
  )
  const inpaintingComplete = useCallback(
    (stepId: string, newBody: string) =>
      dispatch({ type: 'INPAINTING_COMPLETE', stepId, newBody }),
    [],
  )
  const resetStepChoices = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    actionPlan,
    expandedStepId,
    setActionPlan,
    expandStep,
    setStepPill,
    startInpainting,
    appendStepBodyChunk,
    stepBodyComplete,
    inpaintingComplete,
    resetStepChoices,
  }
}

// =============================================================================
// Slice 4 — chat tray
// =============================================================================
//
// The chat tray has its own open/closed + pulse + messages state. It's the
// hottest update path during generation (pulse toggles, streaming assistant
// messages), so isolating it here keeps pill and phase components still
// when the tray ticks.

interface ChatTrayState {
  isOpen: boolean
  isPulsing: boolean
  messages: ChatMessage[]
}

const INITIAL_CHAT: ChatTrayState = {
  isOpen: false,
  isPulsing: false,
  messages: [],
}

type ChatTrayAction =
  | { type: 'OPEN' }
  | { type: 'CLOSE' }
  | { type: 'SET_PULSING'; isPulsing: boolean }
  | { type: 'ADD_MESSAGE'; message: ChatMessage }
  | { type: 'RESET' }

function chatTrayReducer(
  state: ChatTrayState,
  action: ChatTrayAction,
): ChatTrayState {
  switch (action.type) {
    case 'OPEN':
      return { ...state, isOpen: true }
    case 'CLOSE':
      return { ...state, isOpen: false }
    case 'SET_PULSING':
      return { ...state, isPulsing: action.isPulsing }
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] }
    case 'RESET':
      return INITIAL_CHAT
  }
}

export interface ChatTraySlice {
  chat: ChatTrayState
  openChat: () => void
  closeChat: () => void
  setChatPulsing: (isPulsing: boolean) => void
  addChatMessage: (message: ChatMessage) => void
  resetChat: () => void
}

export function useChatTray(): ChatTraySlice {
  const [chat, dispatch] = useReducer(chatTrayReducer, INITIAL_CHAT)

  const openChat = useCallback(() => dispatch({ type: 'OPEN' }), [])
  const closeChat = useCallback(() => dispatch({ type: 'CLOSE' }), [])
  const setChatPulsing = useCallback(
    (isPulsing: boolean) => dispatch({ type: 'SET_PULSING', isPulsing }),
    [],
  )
  const addChatMessage = useCallback(
    (message: ChatMessage) => dispatch({ type: 'ADD_MESSAGE', message }),
    [],
  )
  const resetChat = useCallback(() => dispatch({ type: 'RESET' }), [])

  return { chat, openChat, closeChat, setChatPulsing, addChatMessage, resetChat }
}

// =============================================================================
// Slice 5 — transient interaction refs (hover, focus, drag)
// =============================================================================
//
// Per rerender-use-ref-transient-values, these never trigger a re-render.
// Components that care read .current on a lifecycle boundary (pointerenter,
// pointerleave) rather than subscribing. Exposed through useShapingEngine()
// so the App root can pass them to children that need to coordinate.

export interface TransientRefsSlice {
  hoveredStepIdRef: React.MutableRefObject<string | null>
  focusedPillIdRef: React.MutableRefObject<string | null>
  isDraggingRef: React.MutableRefObject<boolean>
}

export function useTransientRefs(): TransientRefsSlice {
  const hoveredStepIdRef = useRef<string | null>(null)
  const focusedPillIdRef = useRef<string | null>(null)
  const isDraggingRef = useRef<boolean>(false)
  return { hoveredStepIdRef, focusedPillIdRef, isDraggingRef }
}

// =============================================================================
// Composition — useShapingEngine composes the slices
// =============================================================================
//
// This is the convenience API for the App root. Most components should NOT
// call this — they should call the specific sub-hook they need. Otherwise
// they subscribe to every slice and re-render on every update.

export interface ShapingEngineApi
  extends PhaseSlice,
    PersonalPillsSlice,
    StepChoicesSlice,
    ChatTraySlice,
    TransientRefsSlice {
  /** Convenience: sets phase to materializing and clears any prior plan. */
  startMaterializing: (intent: string) => void
  /** Convenience: stores the intent text (coarse granularity channel). */
  intent: string
  setIntent: (intent: string) => void
  /** Convenience: resets every slice to initial. */
  reset: () => void
}

export function useShapingEngine(): ShapingEngineApi {
  const phaseSlice = usePhase()
  const personalSlice = usePersonalPills()
  const stepSlice = useStepChoices()
  const chatSlice = useChatTray()
  const refsSlice = useTransientRefs()
  const [intent, setIntentState] = useState('')

  const setIntent = useCallback((next: string) => setIntentState(next), [])

  // Cross-slice coordination lives here. Keep these actions stable with refs
  // to the latest setters so they don't churn on every render.
  const { setPhase } = phaseSlice
  const { setActionPlan, resetStepChoices } = stepSlice
  const { resetChat } = chatSlice
  const { resetPersonal } = personalSlice

  const startMaterializing = useCallback(
    (next: string) => {
      setIntentState(next)
      setActionPlan(null)
      setPhase('materializing')
    },
    [setActionPlan, setPhase],
  )

  const reset = useCallback(() => {
    setIntentState('')
    resetStepChoices()
    resetChat()
    resetPersonal()
    setPhase('discovery')
  }, [resetStepChoices, resetChat, resetPersonal, setPhase])

  return {
    ...phaseSlice,
    ...personalSlice,
    ...stepSlice,
    ...chatSlice,
    ...refsSlice,
    intent,
    setIntent,
    startMaterializing,
    reset,
  }
}

// =============================================================================
// Selectors — derived values, computed during render, no subscriptions
// =============================================================================
//
// These are pure functions, not hooks. Call them in render with the slice
// data you already have. Exported here so all derived logic lives next to
// the slices that feed it, and components don't reinvent their own derivation.

export function selectIsGenerating(phase: Phase): boolean {
  return phase === 'generating' || phase === 'materializing'
}

export function selectStepById(
  plan: ActionPlan | null,
  stepId: string,
): Step | undefined {
  return plan?.steps.find((s) => s.id === stepId)
}

export function selectAllStepsComplete(plan: ActionPlan | null): boolean {
  if (!plan) return false
  return plan.steps.every((s) => s.isComplete)
}

export function selectPillByDecision(
  step: Step,
  decisionType: string,
): StepPillRow | undefined {
  return step.pills.find((p) => p.decisionType === decisionType)
}
