// Toolbar — the persistent bottom-docked pill (Round 5 ideal flow entry point).
//
// This is the architectural long pole of the post-Saturday-critique rework.
// The critique (Jon, April 11):
//
//   "That generate text box should be the bottom pill, which is the bottom
//    toolbar. So it should contextually change to a text input, which is
//    what we had on the previous prototype version. Because that's the main
//    anchor component... in the current app in NextWork."
//
// Visual model — one persistent pill mounted at App root outside the phase
// swap, docked fixed-bottom, max-width 720px, centered. Two contextual
// states driven by the phase machine:
//
//   Discovery phase (collapsed):
//     full nav bar — N logo, four nav items (Ask / Projects / Docs /
//     Generate), JN avatar. "Projects" is the active item. Tapping
//     "Generate" expands the shell into ToolbarInput (a real text input
//     with layoutId="chatInput" continuity so the morph into ChatTray
//     still works downstream). Paper frame HV-0 is the source of truth
//     for the nav bar dimensions (w-180 h-13 rounded-3xl).
//
//   Canvas phase (collapsed):
//     shows current intent as ellipsized prompt text + "Chat" button. Tap
//     to expand into ChatTray (now repurposed as the Canvas expanded
//     drawer — the bottom dock itself lives here in Toolbar).
//
// The pill <-> expanded form morph uses layoutId="toolbarInput". The
// inner composer reuses layoutId="chatInput" so the legacy Discovery ->
// Canvas shared-element handoff stays correct.
//
// Architectural notes:
//
//  - Always mounted at App root (see App.tsx). Never unmounted on phase
//    change so the pulse animation, draft state, and layoutId anchor
//    survive Discovery <-> Canvas transitions.
//  - Phase mapping is deliberately permissive: anything that is NOT
//    'discovery' is treated as Canvas mode. Team C will add a 'build'
//    phase later and this file must keep working without edits — the
//    selector below is the ONE place that maps phase -> mode, so Team C
//    only has to decide whether 'build' counts as Canvas-mode (it does).
//  - Expansion state is local UI, not global. Lives in a ref-style useState
//    tuple here rather than the shaping engine, because no other component
//    needs to read it (rerender-split-combined-hooks).
//
// Accessibility:
//  - Discovery collapsed state is a nav bar of <button> elements. The
//    "Projects" button carries aria-current="page"; the "Generate"
//    button carries aria-expanded reflecting the morph state + a full
//    aria-label describing the expansion affordance.
//  - Enter or Space on the Generate button expands; Escape on the
//    expanded form collapses without submitting.
//  - The expanded ToolbarInput autofocuses its input on open.
//  - The N logo and JN avatar are aria-hidden chrome — the interactive
//    affordances are the nav buttons.
//
// Rules honored:
//  - rerender-no-inline-components: every sub-component is module-level.
//  - rerender-split-combined-hooks: expansion is its own useState, chat
//    tray open state stays in the engine.
//  - rerender-use-ref-transient-values: focus / click-outside tracking
//    uses refs, not state.
//  - bundle-barrel-imports: import from 'motion/react', never 'motion'.
//  - rendering-activity: we don't unmount on phase change — visibility
//    is driven by opacity + pointer-events so internal state survives.

import { AnimatePresence, motion } from 'motion/react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ChatMessage, Phase } from '@/lib/state'
import { layoutIds } from '@/motion/transitions'
import { sharedElement, trayOpen } from '@/motion/springs'
import { ToolbarInput } from '@/components/toolbar/ToolbarInput'
import { NavItems } from '@/components/toolbar/NavItems'
import { ToolbarLogo } from '@/components/toolbar/ToolbarLogo'
import { ToolbarAvatar } from '@/components/toolbar/ToolbarAvatar'
import { ChatTray } from '@/components/ChatTray'

// ----------------------------------------------------------------------------
// Phase -> mode selector
// ----------------------------------------------------------------------------
//
// 'discovery' -> discovery mode (generate-a-new-project shape)
// everything else -> canvas mode (chat/refine shape)
//
// Team C will add 'build' to the Phase union; that string will fall through
// this function and be treated as canvas mode (correct — the toolbar on the
// Build phase should still be a chat affordance, not a generate prompt).

type ToolbarMode = 'discovery' | 'canvas'

function selectToolbarMode(phase: Phase): ToolbarMode {
  return phase === 'discovery' ? 'discovery' : 'canvas'
}

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

export interface ToolbarProps {
  /** Current phase from the shaping engine. Drives the contextual mode. */
  phase: Phase
  /** Current intent text (shown as ellipsized prompt in Canvas mode). */
  intent: string
  /** Whether a Claude stream is in flight — drives the pulse + chat interrupt routing. */
  isGenerating: boolean
  /** Research fan-out play-by-play label. When non-null, displayed in place
   *  of the "Writing…" chip during the materializing phase's research step. */
  researchStatus?: string | null

  /** Discovery mode submit handler — same path DiscoveryScreen used to call. */
  onGenerate: (value: string) => void

  /** Chat tray slice — forwarded to the embedded ChatTray in Canvas mode. */
  chatMessages: ChatMessage[]
  isChatOpen: boolean
  onOpenChat: () => void
  onCloseChat: () => void
  onChatSend: (text: string, isInterrupt: boolean) => void
}

// ----------------------------------------------------------------------------
// Toolbar
// ----------------------------------------------------------------------------

function ToolbarImpl({
  phase,
  intent,
  isGenerating,
  researchStatus,
  onGenerate,
  chatMessages,
  isChatOpen,
  onOpenChat,
  onCloseChat,
  onChatSend,
}: ToolbarProps) {
  const mode = selectToolbarMode(phase)

  // Local expansion state for Discovery mode. In Canvas mode we delegate
  // "expanded" to the chat tray's isOpen — the ChatTray component is the
  // expanded form, so there's no separate local flag to track.
  //
  // Split from the chat tray state per rerender-split-combined-hooks: a
  // chat message tick should not re-render toolbar expansion, and vice
  // versa.
  const [isDiscoveryExpanded, setDiscoveryExpanded] = useState(false)

  // Derived in render (rerender-derived-state-no-effect): the "effective"
  // expansion flag is only true when we're actually in Discovery mode AND
  // the student has expanded the pill. No effect needed to sync the two —
  // leaving Discovery naturally nulls the derived value the next render.
  const isDiscoveryExpandedEffective = mode === 'discovery' && isDiscoveryExpanded

  // Click-outside dismisser for Discovery expanded mode. Uses a ref to
  // avoid re-subscribing on every render (rerender-use-ref-transient-values).
  const shellRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isDiscoveryExpanded) return
    const handler = (event: PointerEvent) => {
      const node = shellRef.current
      if (!node) return
      if (node.contains(event.target as Node)) return
      setDiscoveryExpanded(false)
    }
    // pointerdown catches the dismiss intent before focus/blur fires.
    window.addEventListener('pointerdown', handler)
    return () => window.removeEventListener('pointerdown', handler)
  }, [isDiscoveryExpanded])

  const handleExpandDiscovery = useCallback(() => {
    setDiscoveryExpanded(true)
  }, [])

  const handleCollapseDiscovery = useCallback(() => {
    setDiscoveryExpanded(false)
  }, [])

  const handleSubmit = useCallback(
    (value: string) => {
      // Collapse before handing off so the Discovery -> Canvas transition
      // starts from the compact pill state. onGenerate fires the existing
      // startMaterializing + runGeneration path in App.tsx.
      setDiscoveryExpanded(false)
      onGenerate(value)
    },
    [onGenerate],
  )

  // Canvas-mode tap handler — delegates to onOpenChat (the engine's
  // openChat action) so ChatTray becomes visible as the expanded drawer.
  const handleOpenCanvasChat = useCallback(() => {
    onOpenChat()
  }, [onOpenChat])

  // The pulse class is applied to the OUTER shared layoutId wrapper so the
  // shadow ring tracks the pill across expansion morphs. We only pulse
  // when we're collapsed (open state has its own focus affordance) and
  // generating. Mirrors the existing ChatTray line 112 pattern.
  const pulseClass =
    isGenerating && !isDiscoveryExpandedEffective && !isChatOpen ? 'chat-tray-pulse' : ''

  // The wrapper is ALWAYS rendered (rendering-activity pattern). We toggle
  // visibility via opacity + pointer-events so draft text and focus refs
  // survive phase transitions. aria-hidden matches the visible flag.
  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-5"
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={trayOpen}
    >
      <div ref={shellRef} className="pointer-events-auto w-full max-w-[720px]">
        {mode === 'discovery' ? (
          <DiscoveryToolbar
            isExpanded={isDiscoveryExpandedEffective}
            onExpand={handleExpandDiscovery}
            onCollapse={handleCollapseDiscovery}
            onSubmit={handleSubmit}
            pulseClass={pulseClass}
          />
        ) : (
          <CanvasToolbar
            intent={intent}
            isGenerating={isGenerating}
            isChatOpen={isChatOpen}
            pulseClass={pulseClass}
            chatMessages={chatMessages}
            researchStatus={researchStatus}
            onOpenChat={handleOpenCanvasChat}
            onCloseChat={onCloseChat}
            onChatSend={onChatSend}
          />
        )}
      </div>
    </motion.div>
  )
}

export const Toolbar = memo(ToolbarImpl)

// ----------------------------------------------------------------------------
// DiscoveryToolbar — the nav bar OR the expanded ToolbarInput
// ----------------------------------------------------------------------------
//
// We AnimatePresence-swap between the collapsed nav bar (N logo + NavItems +
// JN avatar) and the expanded input so Motion can run the shared-element
// morph via layoutId="toolbarInput" on both. Both branches wear the same
// layoutId on their outer shell so Motion treats them as one morphing
// element — corners, size, and position interpolate across the swap.
//
// The collapsed branch is NOT a button — it's a motion.div with three
// interactive children (nav items) inside. That's deliberate: pressing
// the Generate nav item fires expansion, not pressing the shell. This
// differs from the old pill (where the whole shell was a button) but
// is correct for a nav bar semantically.

interface DiscoveryToolbarProps {
  isExpanded: boolean
  onExpand: () => void
  onCollapse: () => void
  onSubmit: (value: string) => void
  pulseClass: string
}

// Shell classes shared by both the collapsed nav bar and the expanded input.
// Keeping them identical gives the layoutId morph a stable target box —
// Motion only needs to interpolate content crossfade, not dimensions.
// Matches Paper frame HV-0: w-180 h-13 rounded-3xl bg-white with border
// and shadow. Width capped by the parent w-full max-w-[720px] wrapper.
const DISCOVERY_SHELL_CLASS =
  'flex w-full h-13 items-center justify-between rounded-3xl border border-solid border-[#E5DEDA] bg-white py-1.5 px-3.5 [box-shadow:#1B191814_0px_12px_16px_-4px,#1B191808_0px_4px_6px_-2px]'

function DiscoveryToolbarImpl({
  isExpanded,
  onExpand,
  onCollapse,
  onSubmit,
  pulseClass,
}: DiscoveryToolbarProps) {
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {isExpanded ? (
        <ToolbarInput
          key="expanded"
          onSubmit={onSubmit}
          onCancel={onCollapse}
          pulseClass={pulseClass}
        />
      ) : (
        <motion.div
          key="collapsed"
          layoutId={layoutIds.toolbarInput}
          transition={sharedElement}
          layout
          className={`${DISCOVERY_SHELL_CLASS} ${pulseClass}`}
        >
          <ToolbarLogo />
          <NavItems
            activeItem="projects"
            onGenerateActivate={onExpand}
            isGenerateExpanded={isExpanded}
          />
          <ToolbarAvatar />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

const DiscoveryToolbar = memo(DiscoveryToolbarImpl)

// ----------------------------------------------------------------------------
// CanvasToolbar — collapsed prompt-reflection pill OR ChatTray expanded
// ----------------------------------------------------------------------------
//
// In Canvas mode the "expanded" state IS ChatTray (the repurposed sheet).
// When isChatOpen is false we show a compact pill that reflects the
// current intent and offers a Chat affordance. When it's true we defer
// entirely to ChatTray which handles its own list + composer.
//
// ChatTray owns layoutId="chatInput" for the composer morph continuity.
// Toolbar's outer pill owns layoutId="toolbarInput" for the pill <->
// expanded-shell morph. The two layoutIds don't collide — one is the
// shell, one is the inner input.

interface CanvasToolbarProps {
  intent: string
  isGenerating: boolean
  isChatOpen: boolean
  pulseClass: string
  chatMessages: ChatMessage[]
  researchStatus?: string | null
  onOpenChat: () => void
  onCloseChat: () => void
  onChatSend: (text: string, isInterrupt: boolean) => void
}

function CanvasToolbarImpl({
  intent,
  isGenerating,
  isChatOpen,
  pulseClass,
  chatMessages,
  researchStatus,
  onOpenChat,
  onCloseChat,
  onChatSend,
}: CanvasToolbarProps) {
  // Show a sensible fallback string when we're on the canvas but haven't
  // streamed an intent yet (edge case — should basically never render).
  const promptLabel = intent.trim().length > 0
    ? intent
    : 'Ask for a change, or tell me more about what you are building…'

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {isChatOpen ? (
        <motion.div
          key="canvas-expanded"
          layoutId={layoutIds.toolbarInput}
          transition={sharedElement}
          layout
        >
          <ChatTray
            messages={chatMessages}
            isOpen={isChatOpen}
            isGenerating={isGenerating}
            onClose={onCloseChat}
            onSend={onChatSend}
          />
        </motion.div>
      ) : (
        <motion.button
          key="canvas-collapsed"
          type="button"
          layoutId={layoutIds.toolbarInput}
          transition={sharedElement}
          layout
          onClick={onOpenChat}
          aria-expanded={false}
          aria-label={
            isGenerating
              ? 'Open chat to interrupt generation'
              : 'Open chat to refine this project'
          }
          className={`flex w-full min-h-[56px] items-center gap-3 rounded-2xl border border-brand-50 bg-warm-white pl-5 pr-1.5 py-1.5 text-left shadow-[var(--shadow-toolbar)] transition-colors hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 ${pulseClass}`}
        >
          <span className="font-body flex-1 truncate text-sm text-brand-400">
            {researchStatus
              ? `${researchStatus}…`
              : isGenerating
                ? 'Writing… tap to interrupt'
                : promptLabel}
          </span>
          <span className="font-heading inline-flex min-h-[44px] items-center rounded-xl bg-leather px-5 text-sm text-paper">
            Chat
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}

const CanvasToolbar = memo(CanvasToolbarImpl)
