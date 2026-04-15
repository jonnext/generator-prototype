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
} as const

export type LayoutId = (typeof layoutIds)[keyof typeof layoutIds]
