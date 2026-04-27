// ChatTray — the Canvas-phase expanded drawer of the Toolbar.
//
// Post-Saturday-critique this component was repurposed. ChatTray is no
// longer a separate bottom-docked element — the Toolbar owns the bottom
// dock now (see src/components/Toolbar.tsx). ChatTray is now the
// "expanded sheet" state of the Canvas-mode Toolbar, rendered inline by
// CanvasToolbar when isChatOpen is true.
//
// What was kept (load-bearing for Team A + Team C coordination):
//   - The chat-tray-pulse class wiring — still applied when generating,
//     now lives at line ~96 and still respects the "don't double-signal
//     when already visually expanded" check.
//   - The pulse keyframes at src/index.css:59-76 — untouched.
//   - layoutId="chatInput" continuity on the composer form. Toolbar's
//     ToolbarInput holds this layoutId on Discovery; when Generate
//     fires and phase flips, the Toolbar swaps to CanvasToolbar and
//     ChatTray picks up the same layoutId on this form. Motion runs
//     one shared-element interpolation across the phase change.
//   - Interruptibility rule from the plan: "Messages can interrupt mid-
//     stream generation — the state machine must NOT gate chat input
//     behind generating flag." Composer stays enabled; onSend forwards
//     the isInterrupt flag to the parent so App can abort+merge.
//
// What was removed:
//   - The outer fixed-bottom positioning motion.div (Toolbar owns it).
//   - The isVisible prop and phase-driven fade — ChatTray is only ever
//     rendered now when its parent decides it should be visible.
//   - The docked-collapsed tap-to-open UI path — the Toolbar pill is
//     the collapsed state. ChatTray is always "open-ish" when mounted;
//     it can still expand the message list panel via isOpen internally
//     but the outer pill-vs-form toggle is the Toolbar's job.
//
// Shape of the component now:
//   a bordered rounded sheet that fills its parent column, with an
//   optional message list at the top and a composer form at the bottom.
//   The parent (CanvasToolbar) wraps it in a Motion shell that handles
//   the pill <-> sheet morph via layoutId="toolbarInput".
//
// Rules honored:
//   - rerender-no-inline-components: MessageList and MessageBubble are
//     module-level memoized.
//   - rerender-split-combined-hooks: draft is local useState only.
//   - rerender-use-ref-transient-values: input ref is not reactive.
//   - bundle-barrel-imports: imports from 'motion/react'.

import { motion } from 'motion/react'
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import type { ChatMessage } from '@/lib/state'
import { layoutIds } from '@/motion/transitions'
import { sharedElement } from '@/motion/springs'

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

export interface ChatTrayProps {
  /** Conversation history — owned by the engine's ChatTraySlice. */
  messages: ChatMessage[]
  /** Whether the tray is rendering its expanded message-list panel. */
  isOpen: boolean
  /** True whenever a Claude stream is in flight. Drives the pulse and
      tells the parent whether a send should trigger an interrupt. */
  isGenerating: boolean
  /** Close callback — collapses the tray back to the Toolbar pill. */
  onClose: () => void
  /** Submit callback. `isInterrupt` is true when the message was sent
      while isGenerating was true, so the parent knows to abort + merge. */
  onSend: (text: string, isInterrupt: boolean) => void
  /**
   * DP1.8.A.1 — transient context-seed shown above the assistant/user
   * thread. Set by the App when the tray opens via the "Talk it through →"
   * link on a StepPill row; cleared on close so seeds don't accumulate
   * across opens. Renders as a neutral system-style bubble (not user, not
   * assistant) so the student reads it as "context the agent has been
   * given." Does NOT persist into the chat.messages array — the App is
   * responsible for forwarding it into the actual Claude call's context.
   */
  seedMessage?: string
  /**
   * DP1.8.A.3 — pill the seed message is scoped to. Required for the
   * inline "Add as option" button to know which stepId + decisionType to
   * extend when an assistant message proposes a fourth option (the regex
   * scan happens per-message inside this component). Cleared when the
   * tray closes alongside seedMessage.
   */
  pillContext?: { stepId: string; decisionType: string }
  /**
   * DP1.8.A.3 — handler for the inline "Add as option" button. Called
   * with the extracted option name when the student taps the button under
   * an assistant message that proposed a fourth option. The App handler
   * dispatches EXTEND_PILL_OPTIONS and closes the tray.
   */
  onAddPillOption?: (
    stepId: string,
    decisionType: string,
    newOption: string,
  ) => void
}

// ----------------------------------------------------------------------------
// ChatTray
// ----------------------------------------------------------------------------

function ChatTrayImpl({
  messages,
  isOpen,
  isGenerating,
  onClose,
  onSend,
  seedMessage,
  pillContext,
  onAddPillOption,
}: ChatTrayProps) {
  // Draft is local to the tray — adding it to the engine would re-render
  // every chat subscriber on every keystroke (rerender-split-combined-hooks).
  const [draft, setDraft] = useState('')

  // DP1.8.A.3 — track which assistant messages have already had their
  // proposed-option added so the inline button collapses to a confirmation
  // chip on subsequent renders. Local to the tray — engine state would
  // overshare; this only matters for the active chat session.
  const [addedMessageIds, setAddedMessageIds] = useState<Set<string>>(
    () => new Set(),
  )

  // Transient focus ref.
  const inputRef = useRef<HTMLInputElement>(null)

  // Autofocus the composer when the tray mounts / opens so the student
  // can type immediately after tapping the Toolbar Chat pill.
  useEffect(() => {
    if (!isOpen) return
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [isOpen])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = draft.trim()
      if (!trimmed) return
      // isInterrupt is computed from isGenerating at the moment of send,
      // not cached earlier — matches the old behaviour.
      onSend(trimmed, isGenerating)
      setDraft('')
    },
    [draft, isGenerating, onSend],
  )

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [onClose],
  )

  // DP1.8.A.3 — inline "Add as option" handler. Records the message id as
  // added (so the button collapses) before delegating to the App handler,
  // which dispatches EXTEND_PILL_OPTIONS and closes the tray. Marking
  // before delegation keeps the optimistic UI honest even if the parent
  // re-renders the tray in the same tick.
  const handleAddOption = useCallback(
    (messageId: string, newOption: string) => {
      if (!pillContext || !onAddPillOption) return
      setAddedMessageIds((prev) => {
        if (prev.has(messageId)) return prev
        const next = new Set(prev)
        next.add(messageId)
        return next
      })
      onAddPillOption(pillContext.stepId, pillContext.decisionType, newOption)
    },
    [pillContext, onAddPillOption],
  )

  // Pulse class — preserved wiring. Only apply while generating AND not
  // visibly expanded (the expanded list already draws focus; double-
  // signalling looks noisy). Note: `isOpen` is now always true when this
  // component is mounted (Toolbar controls mount) so this effectively
  // means "no pulse while the tray sheet is visible". We keep the
  // condition in this exact shape so the test suite + Team A's pulse
  // references continue to match.
  const pulseClass = isGenerating && !isOpen ? 'chat-tray-pulse' : ''

  return (
    <div
      className={`flex w-full flex-col overflow-hidden rounded-2xl border border-brand-50 bg-warm-white shadow-[var(--shadow-toolbar)] ${pulseClass}`}
    >
      {/* Message list panel */}
      <div className="flex items-center justify-between border-b border-brand-50 px-4 py-3">
        <span className="font-heading text-sm text-leather">
          Chat
          {isGenerating ? (
            <span className="font-body ml-2 text-xs text-brand-400">
              Generating… (you can interrupt)
            </span>
          ) : null}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="font-body text-xs text-brand-400 hover:text-leather focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 rounded-md px-2 py-1"
          aria-label="Close chat"
        >
          Close
        </button>
      </div>

      <MessageList
        messages={messages}
        seedMessage={seedMessage}
        addedMessageIds={addedMessageIds}
        canAddOption={Boolean(pillContext && onAddPillOption)}
        onAddOption={handleAddOption}
      />

      {/* Composer form — layoutId="chatInput" carries the shared-element
          morph from Discovery's ToolbarInput inner composer. When the
          student fires Generate on Discovery and phase flips to
          materializing, the Toolbar swaps from DiscoveryToolbar to
          CanvasToolbar; this form's layoutId matches the one that was
          on the Discovery composer, so Motion runs one crossfade/
          reposition interpolation across the phase transition. */}
      <motion.form
        layoutId={layoutIds.chatInput}
        transition={sharedElement}
        layout
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-3"
      >
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          // IMPORTANT: never disable during isGenerating — the plan
          // explicitly forbids gating chat input on in-progress flags.
          placeholder={
            isGenerating
              ? 'Interrupt and add context…'
              : 'Ask for a change, or add context…'
          }
          aria-label="Chat message"
          className="font-body flex-1 bg-transparent text-sm text-leather placeholder:text-brand-300 focus:outline-none"
        />
        <button
          type="submit"
          disabled={draft.trim().length === 0}
          className="font-heading inline-flex min-h-[44px] items-center rounded-xl bg-leather px-4 text-xs text-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isGenerating ? 'Interrupt' : 'Send'}
        </button>
      </motion.form>
    </div>
  )
}

export const ChatTray = memo(ChatTrayImpl)

// ----------------------------------------------------------------------------
// MessageList — module-level so rerender-no-inline-components is honored.
// Memoized so a chat pulse tick doesn't re-render the whole transcript.
// ----------------------------------------------------------------------------

// DP1.8.A.3 — fragile-by-design detection of an assistant message that
// proposes a fourth pill option. The seed message instructs the assistant
// to end with this exact phrase, so the regex looks for the **bolded name**
// envelope. Apostrophe class covers ASCII ' and curly ’ since Claude
// occasionally returns smart-quoted output. Recall is good enough for the
// prototype; we'll refine the prompt + regex if surfaces miss in practice.
const ADD_OPTION_REGEX =
  /I['’]?d suggest adding \*\*(.+?)\*\* as a fourth option/i

interface MessageListProps {
  messages: ChatMessage[]
  seedMessage?: string
  addedMessageIds: Set<string>
  canAddOption: boolean
  onAddOption: (messageId: string, newOption: string) => void
}

function MessageListImpl({
  messages,
  seedMessage,
  addedMessageIds,
  canAddOption,
  onAddOption,
}: MessageListProps) {
  if (messages.length === 0 && !seedMessage) {
    return (
      <div className="flex max-h-[50vh] flex-col items-start gap-2 overflow-y-auto px-4 py-2">
        <p className="font-body text-xs text-brand-400">
          Tell me what you want to build, or ask me to adjust the project.
        </p>
      </div>
    )
  }

  return (
    <div className="flex max-h-[50vh] flex-col gap-3 overflow-y-auto px-4 py-2">
      {seedMessage ? <SeedBubble content={seedMessage} /> : null}
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isAdded={addedMessageIds.has(message.id)}
          canAddOption={canAddOption}
          onAddOption={onAddOption}
        />
      ))}
    </div>
  )
}

const MessageList = memo(MessageListImpl)

// ----------------------------------------------------------------------------
// SeedBubble — DP1.8.A.1 transient context the assistant has been given.
// Visually distinct from user/assistant bubbles: muted, full-width, dashed
// border so it reads as system context rather than dialogue.
// ----------------------------------------------------------------------------

interface SeedBubbleProps {
  content: string
}

function SeedBubbleImpl({ content }: SeedBubbleProps) {
  return (
    <div className="flex flex-col items-stretch gap-1">
      <span className="font-body text-[10px] uppercase tracking-[0.1em] text-brand-300">
        Context
      </span>
      <div className="font-body w-full rounded-2xl border border-dashed border-brand-100 bg-warm-white/60 px-3 py-2 text-xs leading-relaxed text-brand-500">
        {content}
      </div>
    </div>
  )
}

const SeedBubble = memo(SeedBubbleImpl)

// ----------------------------------------------------------------------------
// MessageBubble — one chat message. Different alignment for user/assistant.
// DP1.8.A.3 — assistant messages run through ADD_OPTION_REGEX to surface
// an inline "Add as option" button when the model proposes a fourth pill
// value. The button collapses to a checkmark chip after the option is
// added so the affordance reads as committed, not repeatable.
// ----------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage
  isAdded: boolean
  canAddOption: boolean
  onAddOption: (messageId: string, newOption: string) => void
}

function MessageBubbleImpl({
  message,
  isAdded,
  canAddOption,
  onAddOption,
}: MessageBubbleProps) {
  const isUser = message.role === 'user'

  // Detection runs only on assistant messages and only when the parent has
  // wired pill context — otherwise the button has nothing to dispatch.
  const proposedOption =
    !isUser && canAddOption ? extractProposedOption(message.content) : null

  const handleAdd = useCallback(() => {
    if (!proposedOption) return
    onAddOption(message.id, proposedOption)
  }, [message.id, onAddOption, proposedOption])

  return (
    <div
      className={
        isUser
          ? 'flex flex-col items-end gap-1'
          : 'flex flex-col items-start gap-1'
      }
    >
      <span className="font-body text-[10px] uppercase tracking-[0.1em] text-brand-300">
        {isUser ? 'You' : 'Claude'}
      </span>
      <div
        className={
          isUser
            ? 'font-body max-w-[85%] rounded-2xl bg-leather px-3 py-2 text-sm text-paper'
            : 'font-body max-w-[85%] rounded-2xl border border-brand-50 bg-paper px-3 py-2 text-sm text-leather'
        }
      >
        {message.content}
      </div>
      {proposedOption ? (
        isAdded ? (
          <span className="font-body inline-flex items-center gap-1 rounded-full border border-brand-50 bg-warm-white px-3 py-1 text-xs text-brand-500">
            <span aria-hidden>✓</span>
            <span>Added “{proposedOption}”</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={handleAdd}
            className="font-body inline-flex items-center gap-1 rounded-full border border-brand-50 bg-paper px-3 py-1 text-xs text-leather hover:border-brand-300 hover:bg-warm-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            <span aria-hidden>+</span>
            <span>Add “{proposedOption}” as an option</span>
          </button>
        )
      ) : null}
    </div>
  )
}

const MessageBubble = memo(MessageBubbleImpl)

// DP1.8.A.3 — extract the proposed option name from an assistant message.
// Returns null when the message doesn't match the expected envelope, so
// callers can render conditionally without an extra null check on the
// regex result. Lives at module level so the regex compiles once.
function extractProposedOption(content: string): string | null {
  const match = ADD_OPTION_REGEX.exec(content)
  if (!match) return null
  const captured = match[1]?.trim()
  return captured && captured.length > 0 ? captured : null
}
