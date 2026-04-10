// ChatTray — the coarse-granularity chat surface for the Canvas.
//
// Two visual states, one component:
//   1. docked: a 64px bar anchored to the bottom of the canvas. Shows a
//      placeholder, acts as the shared-element morph target for the
//      Discovery SearchInput (same layoutId), and pulses during the
//      generating phase.
//   2. open: a tall sheet that fills most of the viewport. Shows the
//      message list + a full-width composer input.
//
// Critical interruptibility rule from the plan:
//   "Messages can interrupt mid-stream generation — the state machine
//    must NOT gate chat input behind generating flag."
//
// We follow this rule by keeping the composer input unconditionally
// enabled. The parent (App / I8) handles AbortController wiring when
// onSend fires while isGenerating is true. The tray passes an
// `isInterrupt` boolean so the parent knows to cancel + merge context.
//
// Activity notes:
//   The plan called for React 19 <Activity> for mount-stable show/hide.
//   Since 19.0 stable doesn't export Activity, we use the equivalent
//   pattern: the tray is ALWAYS mounted, and state is preserved across
//   open/close transitions. The visual open/close uses Motion's layout
//   animations, not unmount.
//
// Per rerender-no-inline-components all subcomponents are module-level.
// Per rendering-conditional-render we use ternaries for phase branches.

import { motion, AnimatePresence } from 'motion/react'
import {
  memo,
  useCallback,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import type { ChatMessage } from '@/lib/state'
import { layoutIds } from '@/motion/transitions'
import { sharedElement, trayOpen } from '@/motion/springs'

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------

export interface ChatTrayProps {
  /** Conversation history — owned by the engine's ChatTraySlice. */
  messages: ChatMessage[]
  /** Whether the tray is visually expanded. Docked when false. */
  isOpen: boolean
  /** True whenever a Claude stream is in flight. Drives the pulse and
      tells the parent whether a send should trigger an interrupt. */
  isGenerating: boolean
  /** True when the canvas is active (i.e. phase !== 'discovery'). When
      false, the tray stays mounted but fades out so its draft, messages,
      and layoutId anchor survive back-navigation to Discovery. */
  isVisible: boolean
  /** Open/close callbacks — the tray doesn't own its open state so the
      parent can also trigger opens (e.g. from a step card nudge). */
  onOpen: () => void
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
  isVisible,
  onOpen,
  onClose,
  onSend,
}: ChatTrayProps) {
  // Composer text is local to the tray — adding it to the engine would
  // re-render every chat subscriber on every keystroke.
  const [draft, setDraft] = useState('')

  // Input ref lets the tray focus the composer when the student taps the
  // docked bar to open — transient value, not reactive.
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDockTap = useCallback(() => {
    onOpen()
    // Focus on the next frame so the open animation has mounted the input.
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [onOpen])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const trimmed = draft.trim()
      if (!trimmed) return
      // isInterrupt is computed from isGenerating at the moment of send,
      // not cached earlier. This ensures a student who sends right as
      // generation finishes still gets routed correctly.
      onSend(trimmed, isGenerating)
      setDraft('')
    },
    [draft, isGenerating, onSend],
  )

  // Pulse class is the one exception to springs-only — see index.css
  // keyframes. We only apply it while generating AND the tray is not
  // expanded (the expanded state already draws focus; double-signaling
  // with the pulse looks noisy).
  const pulseClass = isGenerating && !isOpen ? 'chat-tray-pulse' : ''

  // The tray is mounted at App root so it survives phase transitions.
  // When the canvas isn't active (phase === 'discovery') we fade it out
  // rather than unmounting, so draft/messages/layoutId anchors persist
  // and the Discovery -> Canvas shared-element morph has a stable target.
  // aria-hidden + pointer-events-none ensure it's inert during Discovery.
  return (
    <motion.div
      // Positioned fixed at the bottom of the canvas. When open, we expand
      // upward via the sheet height in the child motion.div, not by moving
      // the positioning anchor — keeps the shared element layoutId stable.
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4"
      initial={false}
      animate={{
        opacity: isVisible ? 1 : 0,
        y: isVisible ? 0 : 24,
        pointerEvents: isVisible ? 'auto' : 'none',
      }}
      transition={trayOpen}
      aria-hidden={!isVisible}
    >
      <motion.div
        layoutId={layoutIds.chatInput}
        transition={sharedElement}
        layout
        className={`pointer-events-auto flex w-full max-w-[720px] flex-col overflow-hidden rounded-2xl border border-brand-50 bg-warm-white shadow-[var(--shadow-card)] ${pulseClass}`}
      >
        {/* Message list — only visible when open. We render it always so
            the open transition doesn't have a first-mount jank, and gate
            visibility via a conditional render inside Motion. */}
        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              key="list"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={trayOpen}
              className="flex flex-col gap-3 overflow-hidden"
            >
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
                  className="font-body text-xs text-brand-400 hover:text-leather"
                  aria-label="Close chat"
                >
                  Close
                </button>
              </div>
              <MessageList messages={messages} />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Composer — always rendered. In docked state it acts as a tap
            target that opens the tray. In open state it's a real form.
            Switching between the two uses separate elements so the
            transient focus state of the input doesn't survive a
            wrapper-node swap. */}
        {isOpen ? (
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 px-4 py-3"
          >
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
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
              className="font-heading rounded-xl bg-leather px-3 py-1.5 text-xs text-paper disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGenerating ? 'Interrupt' : 'Send'}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={handleDockTap}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <span className="font-body text-sm text-brand-400">
              {isGenerating
                ? 'Writing… tap to interrupt'
                : 'Ask for a change, or tell me more about what you are building…'}
            </span>
            <span className="font-heading rounded-xl bg-leather px-3 py-1.5 text-xs text-paper">
              Chat
            </span>
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}

export const ChatTray = memo(ChatTrayImpl)

// ----------------------------------------------------------------------------
// MessageList — module-level so rerender-no-inline-components is honored.
// Renders a bubble per message. Memoized so a chat pulse tick doesn't
// re-render the whole transcript.
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
