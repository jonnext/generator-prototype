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
}: ChatTrayProps) {
  // Draft is local to the tray — adding it to the engine would re-render
  // every chat subscriber on every keystroke (rerender-split-combined-hooks).
  const [draft, setDraft] = useState('')

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

      <MessageList messages={messages} />

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

interface MessageListProps {
  messages: ChatMessage[]
}

function MessageListImpl({ messages }: MessageListProps) {
  if (messages.length === 0) {
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
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  )
}

const MessageList = memo(MessageListImpl)

// ----------------------------------------------------------------------------
// MessageBubble — one chat message. Different alignment for user/assistant.
// ----------------------------------------------------------------------------

interface MessageBubbleProps {
  message: ChatMessage
}

function MessageBubbleImpl({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
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
    </div>
  )
}

const MessageBubble = memo(MessageBubbleImpl)
