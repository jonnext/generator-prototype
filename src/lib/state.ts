// Central domain types for the generator v2 shaping engine.
//
// One engine, three granularities (plan):
//   - Coarse  -> chat tray messages
//   - Medium  -> personal pills (duration, mode, budget)
//   - Fine    -> step-level pill choices + inpainting actions
//
// State lives in four independent sub-hooks in src/hooks/useShapingEngine.ts
// per rerender-split-combined-hooks. This file owns the types only — no
// reducer, no default state aside from the personal pill seed, so the type
// shape can be imported anywhere without dragging in React or reducer logic.

import type { ModeId } from './copy'

// -----------------------------------------------------------------------------
// Domain enums and primitive types
// -----------------------------------------------------------------------------

export type Phase =
  | 'discovery'
  | 'materializing'
  | 'sculpting'
  | 'build'
  | 'generating'
  | 'complete'

export type DurationId = '15min' | '30min' | '1hr' | '2hr'
export type BudgetId = 'free-tier' | 'budget-ok' | 'production'

export interface PersonalPills {
  duration: DurationId
  mode: ModeId
  budget: BudgetId
}

/** A single pill row on a step. Picks among options; "randomize" means AI picked. */
export interface StepPillRow {
  /** Key matches researchComparisons / rationales in copy.ts. */
  decisionType: string
  /** The option the student (or AI) selected. Null before any choice. */
  selected: string | null
  /** Whether the selection came from the "I don't know" Randomize action. */
  aiPicked: boolean
}

export type InpaintingAction =
  | 'simplify'
  | 'extend'
  | 'rewrite'
  | 'regenerate'
  | null

export interface Step {
  id: string
  heading: string
  /** Body paragraph — populated during generating phase, empty during sculpting. */
  body: string
  /** Pill rows attached to this step, e.g. container-service, deployment-method. */
  pills: StepPillRow[]
  /** Transient: which inpainting action is running on this step right now. */
  inpainting: InpaintingAction
  /** True once the body has finished streaming in. */
  isComplete: boolean
}

export interface ActionPlan {
  title: string
  description: string
  badge: string
  steps: Step[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

// -----------------------------------------------------------------------------
// Seed values
// -----------------------------------------------------------------------------

export const DEFAULT_PERSONAL: PersonalPills = {
  duration: '30min',
  mode: 'intermediate',
  budget: 'free-tier',
}

// -----------------------------------------------------------------------------
// Pill origin tracking (Gap #1 — close the "illusion of user choice")
// -----------------------------------------------------------------------------
//
// Personal pills always have a value (the engine seeds defaults so the UI
// can render a complete row immediately). But students cannot tell whether a
// pill is an engine default, an AI-proposed value from the skeleton call, or
// something they confirmed. PillOrigin tracks that provenance as a parallel
// slice so MetadataRow can render three distinct visual states without
// inflating the existing PersonalPills shape.
//
// 'default'        — engine seed (student has not interacted, Claude has not
//                    weighed in yet). Renders as dotted hint.
// 'ai-picked'      — Claude proposed this via the skeleton's difficulty /
//                    timeMinutes fields. Renders with an "AI" badge.
// 'user-confirmed' — the student tapped the pill to commit a value. Renders
//                    as the current solid chip.
export type PillOrigin = 'default' | 'ai-picked' | 'user-confirmed'

export interface PersonalPillOrigins {
  duration: PillOrigin
  mode: PillOrigin
  budget: PillOrigin
}

export const DEFAULT_PERSONAL_ORIGINS: PersonalPillOrigins = {
  duration: 'default',
  mode: 'default',
  budget: 'default',
}
