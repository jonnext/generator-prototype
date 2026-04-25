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
  type ContentBlock,
  type DiagramStatus,
  type PersonalPillOrigins,
  type PersonalPills,
  type Phase,
  type PillOrigin,
  type ResearchFinding,
  type Step,
  type StepGenerationStatus,
  type StepPillRow,
  type SurfacedAs,
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
  | { type: 'APPEND_STEP'; step: Step }
  | { type: 'REMOVE_STEP'; stepId: string }
  | { type: 'INSERT_STEP_AFTER'; afterStepId: string; step: Step }
  | { type: 'SET_STEP_BLOCKS'; stepId: string; blocks: ContentBlock[] }
  | { type: 'SET_STEP_GENERATION_STATUS'; stepId: string; status: StepGenerationStatus }
  | { type: 'SET_DIAGRAM'; url?: string; status: DiagramStatus }
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

    case 'APPEND_STEP': {
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: {
          ...state.actionPlan,
          steps: [...state.actionPlan.steps, action.step],
        },
      }
    }

    case 'REMOVE_STEP': {
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: {
          ...state.actionPlan,
          steps: state.actionPlan.steps.filter((s) => s.id !== action.stepId),
        },
        expandedStepId:
          state.expandedStepId === action.stepId ? null : state.expandedStepId,
      }
    }

    case 'INSERT_STEP_AFTER': {
      if (!state.actionPlan) return state
      const idx = state.actionPlan.steps.findIndex(
        (s) => s.id === action.afterStepId,
      )
      if (idx === -1) return state
      const next = [...state.actionPlan.steps]
      next.splice(idx + 1, 0, action.step)
      return {
        ...state,
        actionPlan: { ...state.actionPlan, steps: next },
      }
    }

    case 'SET_STEP_BLOCKS': {
      // DP1.5 — Phase B populates step.blocks as section-generator passes
      // resolve. Pass 1 writes Stage-1-informed blocks; Pass 2 overwrites with
      // the Firecrawl-refreshed set. No merge — each pass produces the full
      // block array for the step, and the crossfade lives in the renderer.
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: mapStep(state.actionPlan, action.stepId, (step) => ({
          ...step,
          blocks: action.blocks,
        })),
      }
    }

    case 'SET_STEP_GENERATION_STATUS': {
      // DP1.7.D — modular generation lifecycle. Producers: Phase B step-1-only
      // mode (initial submit) and triggerNextStep (Continue CTA / pending alt
      // trigger). Sculpt-driven block refresh (DP1.5.I) does NOT call this —
      // status stays 'ready' across sculpt passes; only first-fill flips it.
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: mapStep(state.actionPlan, action.stepId, (step) => ({
          ...step,
          generationStatus: action.status,
        })),
      }
    }

    case 'SET_DIAGRAM': {
      // DP1.6 — Phase D writes diagram lifecycle onto the active plan. Status
      // transitions roughly idle → generating → ready (with url) | failed.
      // Cleared implicitly when SET_PLAN replaces the whole plan on a fresh
      // submit — no separate reset needed.
      if (!state.actionPlan) return state
      return {
        ...state,
        actionPlan: {
          ...state.actionPlan,
          diagramStatus: action.status,
          diagramUrl: action.url ?? state.actionPlan.diagramUrl,
        },
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
  appendStep: (step: Step) => void
  removeStep: (stepId: string) => void
  insertStepAfter: (afterStepId: string, step: Step) => void
  /**
   * DP1.5 — replace a step's content blocks. Phase B calls this after each
   * section-generator pass resolves (Pass 1 with Stage 1 research, Pass 2
   * with Stage 1+2 after Firecrawl returns). Fully replaces the prior blocks
   * array; callers that want a crossfade handle that in the renderer.
   */
  setStepBlocks: (stepId: string, blocks: ContentBlock[]) => void
  /**
   * DP1.7.D — flip a single step's generation lifecycle state. Called by
   * Phase B (step 1 'pending' → 'generating' → 'ready') and triggerNextStep
   * (steps 2-N when the Continue CTA fires). Sculpt regen path stays out of
   * this — it doesn't touch the lifecycle field.
   */
  setStepGenerationStatus: (stepId: string, status: StepGenerationStatus) => void
  /**
   * DP1.6 — Phase D diagram lifecycle. Pass status alone to flip state
   * (e.g. setDiagram('generating')); pass url + status: 'ready' when the
   * Gemini call resolves. No-op if there's no active actionPlan.
   */
  setDiagram: (status: DiagramStatus, url?: string) => void
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
  const appendStep = useCallback(
    (step: Step) => dispatch({ type: 'APPEND_STEP', step }),
    [],
  )
  const removeStep = useCallback(
    (stepId: string) => dispatch({ type: 'REMOVE_STEP', stepId }),
    [],
  )
  const insertStepAfter = useCallback(
    (afterStepId: string, step: Step) =>
      dispatch({ type: 'INSERT_STEP_AFTER', afterStepId, step }),
    [],
  )
  const setStepBlocks = useCallback(
    (stepId: string, blocks: ContentBlock[]) =>
      dispatch({ type: 'SET_STEP_BLOCKS', stepId, blocks }),
    [],
  )
  const setStepGenerationStatus = useCallback(
    (stepId: string, status: StepGenerationStatus) =>
      dispatch({ type: 'SET_STEP_GENERATION_STATUS', stepId, status }),
    [],
  )
  const setDiagram = useCallback(
    (status: DiagramStatus, url?: string) =>
      dispatch({ type: 'SET_DIAGRAM', status, url }),
    [],
  )
  const resetStepChoices = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    actionPlan,
    expandedStepId,
    setActionPlan,
    expandStep,
    setStepPill,
    appendStep,
    removeStep,
    insertStepAfter,
    setStepBlocks,
    setStepGenerationStatus,
    setDiagram,
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
// Slice 5b — focus (Highway drill-in state + per-step chat history)
// =============================================================================
//
// When the student taps "Refine Step →" on a collapsed step row, phase flips
// to 'focused' and focusedStepId carries the target step's id. Highway reads
// these to render its reading column. ExitFocus flips phase back to sculpting
// and clears the id. Prev/next traversal is caller-computed (needs the plan's
// step order) so this slice stays pure.
//
// stepChats persists per-step conversation history so re-entering step 02
// remembers previous Highway-scope refinement turns. Chunk D wires the chat
// dispatcher through this.

interface FocusState {
  focusedStepId: string | null
  stepChats: Record<string, ChatMessage[]>
}

const INITIAL_FOCUS: FocusState = {
  focusedStepId: null,
  stepChats: {},
}

type FocusAction =
  | { type: 'FOCUS_STEP'; stepId: string | null }
  | { type: 'ADD_STEP_MESSAGE'; stepId: string; message: ChatMessage }
  | { type: 'CLEAN_REMOVED_STEP'; stepId: string }
  | { type: 'RESET' }

function focusReducer(state: FocusState, action: FocusAction): FocusState {
  switch (action.type) {
    case 'FOCUS_STEP':
      return { ...state, focusedStepId: action.stepId }
    case 'ADD_STEP_MESSAGE': {
      const prev = state.stepChats[action.stepId] ?? []
      return {
        ...state,
        stepChats: {
          ...state.stepChats,
          [action.stepId]: [...prev, action.message],
        },
      }
    }
    case 'CLEAN_REMOVED_STEP': {
      const { [action.stepId]: _, ...rest } = state.stepChats
      return {
        ...state,
        focusedStepId:
          state.focusedStepId === action.stepId ? null : state.focusedStepId,
        stepChats: rest,
      }
    }
    case 'RESET':
      return INITIAL_FOCUS
  }
}

export interface FocusSlice {
  focusedStepId: string | null
  stepChats: Record<string, ChatMessage[]>
  /** Enter or exit Highway for a specific step id (pass null to exit). */
  focusStep: (stepId: string | null) => void
  /** Convenience wrapper — clears focusedStepId. */
  exitFocus: () => void
  /** Append a step-scoped chat message. Chunk D wires the dispatcher. */
  addStepMessage: (stepId: string, message: ChatMessage) => void
  /** Cleanup focusedStepId + stepChats when a step is removed from the plan. */
  cleanRemovedStep: (stepId: string) => void
  resetFocus: () => void
}

export function useFocus(): FocusSlice {
  const [{ focusedStepId, stepChats }, dispatch] = useReducer(
    focusReducer,
    INITIAL_FOCUS,
  )

  const focusStep = useCallback(
    (stepId: string | null) => dispatch({ type: 'FOCUS_STEP', stepId }),
    [],
  )
  const exitFocus = useCallback(
    () => dispatch({ type: 'FOCUS_STEP', stepId: null }),
    [],
  )
  const addStepMessage = useCallback(
    (stepId: string, message: ChatMessage) =>
      dispatch({ type: 'ADD_STEP_MESSAGE', stepId, message }),
    [],
  )
  const cleanRemovedStep = useCallback(
    (stepId: string) => dispatch({ type: 'CLEAN_REMOVED_STEP', stepId }),
    [],
  )
  const resetFocus = useCallback(() => dispatch({ type: 'RESET' }), [])

  return { focusedStepId, stepChats, focusStep, exitFocus, addStepMessage, cleanRemovedStep, resetFocus }
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
// Slice 6 — research store (DP1.5.D)
// =============================================================================
//
// Phase R (the active research layer introduced in DP1.5) streams findings
// from Exa + Perplexity + Firecrawl + Context7 into this slice as the
// orchestrator works. Consumers that need findings for a specific step read
// via the selectFindingsByStep selector rather than subscribing to the
// whole findings dictionary — findings keyed by id give O(1) upsert without
// needing a separate per-step index.
//
// We intentionally DON'T store findingsByStep as a denormalized index. The
// index is derived from findings[*].relatedStepIds at render time via the
// selector, so we avoid dual-updates that could desync. For the prototype's
// finding volume (tens per session, not thousands) the linear scan is
// cheap — render-time filtering costs nothing compared to an O(n) reducer
// that has to keep a secondary map in lockstep.
//
// PRUNE_STALE_FOR_STEP is the cross-slice cleanup point called from
// handleRemoveStep — it either drops findings orphaned by the removed step
// or just filters the step id from multi-step findings' relatedStepIds so
// they no longer surface on that row without destroying the finding data.

interface ResearchStoreState {
  findings: Record<string, ResearchFinding>
}

const INITIAL_RESEARCH: ResearchStoreState = {
  findings: {},
}

type ResearchStoreAction =
  | { type: 'ADD_FINDING'; finding: ResearchFinding }
  | { type: 'MARK_SURFACED'; findingId: string; surfacedAs: SurfacedAs }
  | { type: 'FLAG_BRANCH_CANDIDATE'; findingId: string }
  | { type: 'PRUNE_STALE_FOR_STEP'; stepId: string }
  | { type: 'RESET' }

function researchStoreReducer(
  state: ResearchStoreState,
  action: ResearchStoreAction,
): ResearchStoreState {
  switch (action.type) {
    case 'ADD_FINDING':
      // Upsert by id. Orchestrator dedup happens upstream (sliding window)
      // so a same-id re-ADD here is intentional — e.g. a pending finding
      // landing as ready, or a finding being re-scoped to a new step.
      return {
        findings: {
          ...state.findings,
          [action.finding.id]: action.finding,
        },
      }

    case 'MARK_SURFACED': {
      const existing = state.findings[action.findingId]
      if (!existing) return state
      return {
        findings: {
          ...state.findings,
          [action.findingId]: { ...existing, surfacedAs: action.surfacedAs },
        },
      }
    }

    case 'FLAG_BRANCH_CANDIDATE': {
      const existing = state.findings[action.findingId]
      if (!existing) return state
      return {
        findings: {
          ...state.findings,
          [action.findingId]: { ...existing, significance: 'branch-candidate' },
        },
      }
    }

    case 'PRUNE_STALE_FOR_STEP': {
      // For each finding that touched this step: if it was only about this
      // step, drop it. If it spans multiple steps, just peel this step id
      // off the relatedStepIds array so the remaining steps keep their
      // context. Rationale: research about "containers" might legitimately
      // serve step 2 AND step 4; removing step 2 shouldn't blow away the
      // step 4 context.
      let mutated = false
      const next: Record<string, ResearchFinding> = {}
      for (const [id, finding] of Object.entries(state.findings)) {
        if (!finding.relatedStepIds.includes(action.stepId)) {
          next[id] = finding
          continue
        }
        mutated = true
        const filtered = finding.relatedStepIds.filter(
          (s) => s !== action.stepId,
        )
        if (filtered.length === 0) continue
        next[id] = { ...finding, relatedStepIds: filtered }
      }
      return mutated ? { findings: next } : state
    }

    case 'RESET':
      return INITIAL_RESEARCH
  }
}

export interface ResearchStoreSlice {
  findings: Record<string, ResearchFinding>
  /**
   * Upsert a finding into the store. Called by the research orchestrator
   * (DP1.5.E) as adapter calls resolve — one addFinding per Exa call, one
   * per Perplexity call, one per Firecrawl scrape, etc.
   */
  addFinding: (finding: ResearchFinding) => void
  /**
   * Record that a finding has been rendered in the UI, so the renderer
   * doesn't re-promote it. Called by StepCard after rendering a research
   * snippet into block context, by BranchChip after showing a branch
   * candidate, and by StepPill after surfacing a finding as pill context.
   */
  markFindingSurfaced: (findingId: string, surfacedAs: SurfacedAs) => void
  /**
   * Promote a finding to branch-candidate significance — DP1.5.J's
   * orchestrator heuristic calls this when Firecrawl/Perplexity surface
   * content that contradicts the current pill choice or step framing.
   */
  flagBranchCandidate: (findingId: string) => void
  /**
   * Cross-slice cleanup entry point called from handleRemoveStep when a
   * step is deleted. Drops orphaned findings and filters multi-step
   * findings so the removed step id no longer appears in relatedStepIds.
   */
  pruneStaleForStep: (stepId: string) => void
  resetResearch: () => void
}

export function useResearchStore(): ResearchStoreSlice {
  const [{ findings }, dispatch] = useReducer(
    researchStoreReducer,
    INITIAL_RESEARCH,
  )

  const addFinding = useCallback(
    (finding: ResearchFinding) => dispatch({ type: 'ADD_FINDING', finding }),
    [],
  )
  const markFindingSurfaced = useCallback(
    (findingId: string, surfacedAs: SurfacedAs) =>
      dispatch({ type: 'MARK_SURFACED', findingId, surfacedAs }),
    [],
  )
  const flagBranchCandidate = useCallback(
    (findingId: string) =>
      dispatch({ type: 'FLAG_BRANCH_CANDIDATE', findingId }),
    [],
  )
  const pruneStaleForStep = useCallback(
    (stepId: string) => dispatch({ type: 'PRUNE_STALE_FOR_STEP', stepId }),
    [],
  )
  const resetResearch = useCallback(() => dispatch({ type: 'RESET' }), [])

  return {
    findings,
    addFinding,
    markFindingSurfaced,
    flagBranchCandidate,
    pruneStaleForStep,
    resetResearch,
  }
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
    FocusSlice,
    TransientRefsSlice,
    ResearchStoreSlice {
  /** Convenience: sets phase to materializing and clears any prior plan. */
  startMaterializing: (intent: string) => void
  /** Convenience: stores the intent text (coarse granularity channel). */
  intent: string
  setIntent: (intent: string) => void
  /** Convenience: resets every slice to initial. */
  reset: () => void
  /** Cross-slice step removal: removes from plan + cleans focus/stepChats. */
  handleRemoveStep: (stepId: string) => void
  /**
   * Enter Highway for a step — flips phase to 'focused' and sets focusedStepId
   * in one dispatch. Used by StepCard's Refine chip and by useFocusNavigation's
   * keyboard handlers. Caller is responsible for derived validation (e.g. the
   * stepId must exist in the current plan).
   */
  enterFocus: (stepId: string) => void
  /**
   * Exit Highway — flips phase back to whichever pre-focus phase was active
   * (sculpting or complete). Clears focusedStepId. Intentionally does NOT
   * auto-advance to build; Done-on-last-step calls this with sculpting.
   */
  leaveFocus: () => void
}

export function useShapingEngine(): ShapingEngineApi {
  const phaseSlice = usePhase()
  const personalSlice = usePersonalPills()
  const stepSlice = useStepChoices()
  const chatSlice = useChatTray()
  const focusSlice = useFocus()
  const refsSlice = useTransientRefs()
  const researchSlice = useResearchStore()
  const [intent, setIntentState] = useState('')

  const setIntent = useCallback((next: string) => setIntentState(next), [])

  // Cross-slice coordination lives here. Keep these actions stable with refs
  // to the latest setters so they don't churn on every render.
  const { phase, setPhase } = phaseSlice
  const { setActionPlan, removeStep, resetStepChoices } = stepSlice
  const { resetChat } = chatSlice
  const { focusStep, cleanRemovedStep, resetFocus } = focusSlice
  const { resetPersonal } = personalSlice
  const { pruneStaleForStep, resetResearch } = researchSlice

  const handleRemoveStep = useCallback(
    (stepId: string) => {
      removeStep(stepId)
      cleanRemovedStep(stepId)
      // DP1.5.D — drop or filter any research findings that reference this
      // step so a re-added step id doesn't inherit stale findings.
      pruneStaleForStep(stepId)
    },
    [removeStep, cleanRemovedStep, pruneStaleForStep],
  )

  // Remember which phase we came from so leaveFocus restores correctly. Using
  // a ref avoids a useState that would re-render on every focus entry. The
  // ref is populated inside enterFocus and read by leaveFocus.
  const prevFocusPhaseRef = useRef<Phase>('learning')

  const enterFocus = useCallback(
    (stepId: string) => {
      prevFocusPhaseRef.current = phase === 'focused' ? 'learning' : phase
      focusStep(stepId)
      setPhase('focused')
    },
    [focusStep, setPhase, phase],
  )

  const leaveFocus = useCallback(() => {
    focusStep(null)
    setPhase(prevFocusPhaseRef.current)
  }, [focusStep, setPhase])

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
    resetFocus()
    resetResearch()
    setPhase('discovery')
  }, [
    resetStepChoices,
    resetChat,
    resetPersonal,
    resetFocus,
    resetResearch,
    setPhase,
  ])

  return {
    ...phaseSlice,
    ...personalSlice,
    ...stepSlice,
    ...chatSlice,
    ...focusSlice,
    ...refsSlice,
    ...researchSlice,
    intent,
    setIntent,
    handleRemoveStep,
    enterFocus,
    leaveFocus,
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

/**
 * Returns true when the engine is in the initial materialization flash
 * (skeleton generation in flight). DP1: `generating` phase is gone — step
 * bodies no longer stream — so this collapses to `materializing` only.
 * Consumers use this to show the "writing…" status in the Toolbar.
 */
export function selectIsGenerating(phase: Phase): boolean {
  return phase === 'materializing'
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

/**
 * DP1.5.D — derived view of findings scoped to a single step id, newest
 * first. Linear scan of the findings dictionary; fine for the prototype's
 * per-session volume (tens of findings, not thousands). Components that
 * need per-step research should call this in render rather than indexing
 * in the reducer — render-time filtering is cheaper than maintaining a
 * secondary map in lockstep.
 */
export function selectFindingsByStep(
  findings: Record<string, ResearchFinding>,
  stepId: string,
): ResearchFinding[] {
  const matches: ResearchFinding[] = []
  for (const finding of Object.values(findings)) {
    if (finding.relatedStepIds.includes(stepId)) matches.push(finding)
  }
  return matches.sort((a, b) => b.timestamp - a.timestamp)
}

/**
 * DP1.5.J — findings flagged as branch candidates for a given step, newest
 * first. DP1.5.J's BranchChip component reads this to decide whether to
 * render a chip at the top of a StepCard.
 */
export function selectBranchCandidatesByStep(
  findings: Record<string, ResearchFinding>,
  stepId: string,
): ResearchFinding[] {
  return selectFindingsByStep(findings, stepId).filter(
    (f) => f.significance === 'branch-candidate' && f.surfacedAs !== 'chip',
  )
}
