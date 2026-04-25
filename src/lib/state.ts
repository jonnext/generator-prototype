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
import type { ContentBlock } from './contentBlock'

// Re-export the ContentBlock union and its constituent types so consumers
// only need to import from '@/lib/state', matching the existing pattern.
// The shapes themselves live in contentBlock.ts to keep the file focused.
export type {
  ContentBlock,
  TextSpan,
  InlineMark,
  ListItem,
  ListVariant,
  CalloutVariant,
  ParagraphBlock,
  HeadingBlock,
  ListBlock,
  CodeBlock,
  CalloutBlock,
} from './contentBlock'

// DP1.5.D — re-export research finding types. Slices that own ResearchFinding
// objects (the research store) import from '@/lib/state' for consistency
// with other slice types. The canonical shapes live in research/types.ts.
export type {
  ResearchFinding,
  ResearchSnippet,
  ResearchSource,
  ResearchFindingStatus,
  ResearchSignificance,
  SurfacedAs,
} from './research/types'

// -----------------------------------------------------------------------------
// Domain enums and primitive types
// -----------------------------------------------------------------------------

/**
 * Phase machine — DP1 collapse.
 *
 * Before DP1 the enum had 7 states tracking a one-shot generative pipeline
 * (discovery → materializing → sculpting → focused → build → generating →
 * complete). The dynamic-pathway pivot removed the "Build then stream step
 * bodies" moment — learning is now continuous. The canvas has one primary
 * learning state that replaces sculpting + build + generating + complete.
 */
export type Phase =
  | 'discovery'
  | 'materializing'
  | 'learning'
  | 'focused'

export type DurationId = '15min' | '30min' | '1hr' | '2hr'
export type BudgetId = 'free-tier' | 'budget-ok' | 'production'

export interface PersonalPills {
  duration: DurationId
  mode: ModeId
  budget: BudgetId
}

/** A single pill row on a step. Picks among options; "randomize" means AI picked. */
export interface StepPillRow {
  /** Key matches a PillDefinition in ActionPlan.pillDefinitions. */
  decisionType: string
  /** The option the student (or AI) selected. Null before any choice. */
  selected: string | null
  /** Whether the selection came from the "I don't know" Randomize action. */
  aiPicked: boolean
}

/**
 * DP1.7.D — modular generation lifecycle state.
 *
 *  - 'pending'    — step has not been generated yet. Initial state for every
 *                   step on a fresh skeleton; only step 1 leaves it on submit.
 *                   StepCard renders a deferred / faded heading-only treatment.
 *  - 'generating' — Phase B (initial step 1 fire) or triggerNextStep (step 2-N
 *                   commit) is mid-flight. StepCard renders shimmer below the
 *                   heading.
 *  - 'ready'      — blocks landed. Sculpt-driven regen keeps status 'ready' and
 *                   just swaps the blocks array beneath; the lifecycle field
 *                   tracks first-fill, not freshness.
 */
export type StepGenerationStatus = 'pending' | 'generating' | 'ready'

export interface Step {
  /** Stable UUID. Positional labels (STEP 01) render from array index, not id. */
  id: string
  heading: string
  /** Pill rows attached to this step, e.g. container-service, deployment-method. */
  pills: StepPillRow[]
  /**
   * Student progress marker. DP1 leaves this untouched (no producer sets true)
   * so it's future-proofed for DP3 when living-doc validations complete a step.
   */
  isComplete: boolean
  /**
   * DP1.5 — section-generator-produced content blocks for this step.
   *
   * Undefined while Phase B has not yet populated the step (StepCard renders
   * a shimmer placeholder). Set via useStepChoices.setStepBlocks as each
   * Phase B pass resolves — Pass 1 lands with Stage 1 research context,
   * Pass 2 refreshes with Stage 1+2 (Firecrawl) context for freshness.
   *
   * REMOVE_STEP in useShapingEngine drops the step from the array, so
   * blocks are cleaned up implicitly — no separate pruning needed here.
   */
  blocks?: ContentBlock[]
  /**
   * DP1.7 — modular generation lifecycle. Step 1 auto-fires through 'generating' →
   * 'ready' on initial submit. Steps 2-N start 'pending' and only advance when the
   * student commits via the Continue CTA (or alt trigger) which calls
   * triggerNextStep in App.tsx. Sculpt-driven regen (DP1.5.I) keeps status 'ready'
   * — it just swaps the blocks array.
   */
  generationStatus?: StepGenerationStatus
}

/**
 * PillDefinition — the Claude-generated structure describing a single decision.
 *
 * Produced by the skeleton agent (see buildActionPlanPrompt) and carried on
 * ActionPlan.pillDefinitions, keyed by decisionType. Multiple steps referencing
 * the same decisionType share one definition.
 *
 * Replaces the previous hardcoded lookup into copy.ts:researchComparisons +
 * rationales so pills work for any project prompt, not just the 12 known AWS
 * slugs.
 */
export interface PillDefinition {
  decisionType: string
  /** Prompt question shown above the options, e.g. "Which container service?". */
  question: string
  /** Option names the student picks from. Exactly 3 entries. */
  options: string[]
  /** Which option AI defaults to when the student picks "I don't know". */
  picked: string
  /** 1-2 sentence rationale shown after "I don't know" resolves. */
  rationale: string
}

/**
 * DP1.6 — Phase D architecture diagram lifecycle.
 *
 *  - 'idle'        — no diagram run has been kicked off yet for this plan.
 *  - 'generating'  — Phase D is in flight (Gemini Pro can take 20-25s).
 *  - 'ready'       — diagramUrl is populated with a data: URL.
 *  - 'failed'      — Gemini call failed (missing key, content policy, etc.);
 *                    canvas should render nothing for the slot (graceful
 *                    degradation, no error UI).
 *
 * Treated as 'idle' when undefined — the reducer doesn't seed it, and a fresh
 * SET_PLAN naturally clears it because the new plan object has the field
 * unset until Phase D's SET_DIAGRAM action populates it.
 */
export type DiagramStatus = 'idle' | 'generating' | 'ready' | 'failed'

export interface ActionPlan {
  title: string
  description: string
  badge: string
  steps: Step[]
  /**
   * Per-decisionType definitions produced by the skeleton agent. Consumers
   * look up a pill's display shape here rather than from hardcoded copy.
   * May be empty when legacy code constructs an ActionPlan without the
   * richer skeleton data (e.g. tests) — consumers handle missing entries
   * with graceful placeholder copy.
   */
  pillDefinitions: Record<string, PillDefinition>
  /**
   * DP1.6 — Phase D architecture diagram (Gemini Nano Banana Pro). Hangs at
   * the project level (one diagram per ActionPlan), not per-step. Populated
   * fire-and-forget from runSkeleton after Phase A lands; rendered above
   * MetadataRow on the canvas with a multi-state shimmer during the wait.
   */
  diagramUrl?: string
  diagramStatus?: DiagramStatus
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
