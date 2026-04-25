// Shared-element and FLIP helpers for Motion.
//
// Motion's `layoutId` prop handles shared-element transitions natively: two
// components with the same layoutId will interpolate position, size, and
// crossfade content as one flips to the other. We centralize the ids here so
// the Discovery search input and the docked chat tray input can "be the same
// element" across screens without string duplication.

export const layoutIds = {
  /** Shared input used for Discovery -> Canvas docked chat tray transition.
   *  Carried from SearchInput (legacy) -> ToolbarInput (expanded Discovery
   *  state) -> ChatTray composer (expanded Canvas state) so Motion treats
   *  them as one morphing element across phase changes. */
  chatInput: 'chat-input',
  /** Shared toolbar pill <-> expanded ToolbarInput morph target. The pill
   *  collapses into this layoutId and the expanded input takes it over so
   *  Motion interpolates corners, size, and position between the two. */
  toolbarInput: 'toolbar-input',
  /** Shared project header wrapper (badge + title + description) across canvas phases. */
  projectHeader: 'project-header',
  /** Shared project badge from Discovery tile -> Canvas ProjectHeader. */
  projectBadge: 'project-badge',
  /** Shared project title from Discovery tile -> Canvas ProjectHeader. */
  projectTitle: 'project-title',
  /** Dark status pill top-left. Morphs from "● SKETCHING YOUR PROJECT" on
   *  canvas to "● STEP 2 OF 5" inside Highway during the Shape->Highway
   *  transition (Chunk C). Single shared element, content swaps via crossfade. */
  statusPill: 'status-pill',
  /** Per-step shared heading text node. Row H3 on canvas flies to the serif
   *  H1 at the top of Highway's reading column during focus entry. One id
   *  per step; factory function below keyed by step id. */
  stepHeading: (stepId: string) => `step-heading-${stepId}`,
  /** Per-step step number "01"/"02"/.../"05" shared across row prefix and
   *  Highway section label. Gives the morph a second shared element to
   *  rhyme with the heading's flight. */
  stepNumber: (stepId: string) => `step-number-${stepId}`,
} as const

// LayoutId is widened to string because some entries are factory functions
// (stepHeading / stepNumber) that produce per-step ids at call time.
export type LayoutId = string
