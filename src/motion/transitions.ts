// Shared-element and FLIP helpers for Motion.
//
// Motion's `layoutId` prop handles shared-element transitions natively: two
// components with the same layoutId will interpolate position, size, and
// crossfade content as one flips to the other. We centralize the ids here so
// the Discovery search input and the docked chat tray input can "be the same
// element" across screens without string duplication.

export const layoutIds = {
  /** Shared input used for Discovery -> Canvas docked chat tray transition. */
  chatInput: 'chat-input',
  /** Shared project header wrapper (badge + title + description) across canvas phases. */
  projectHeader: 'project-header',
  /** Shared project badge from Discovery tile -> Canvas ProjectHeader. */
  projectBadge: 'project-badge',
  /** Shared project title from Discovery tile -> Canvas ProjectHeader. */
  projectTitle: 'project-title',
} as const

export type LayoutId = (typeof layoutIds)[keyof typeof layoutIds]
