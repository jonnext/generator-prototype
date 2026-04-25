// MetadataRow — the persistent "medium granularity" pill row.
//
// Three pills: Duration, Mode, Budget. Each is always visible, always
// clickable, regardless of phase. The row subscribes only to the
// PersonalPills slice via usePersonalPills() so pill swaps don't re-render
// the step cards above them.
//
// Per rerender-no-inline-components the pill subcomponent is module level.
// Per rendering-conditional-render we use ternaries for the active state.
// Motion's `layout` prop handles FLIP when pill labels change width.

import { motion } from 'motion/react'
import { memo, useCallback, type ReactElement } from 'react'
import { metadataPillVariants } from '@/motion/choreography'
import { layoutShift } from '@/motion/springs'
import type {
  BudgetId,
  DurationId,
  PersonalPillOrigins,
  PersonalPills,
  PillOrigin,
} from '@/lib/state'
import { modes, type ModeId } from '@/lib/copy'

// ----------------------------------------------------------------------------
// Option tables (medium-granularity defaults — not student-tunable per-step)
// ----------------------------------------------------------------------------

interface PillOption<T extends string> {
  id: T
  label: string
}

const durationOptions: PillOption<DurationId>[] = [
  { id: '15min', label: '15 min' },
  { id: '30min', label: '30 min' },
  { id: '1hr', label: '1 hr' },
  { id: '2hr', label: '2 hr' },
]

const budgetOptions: PillOption<BudgetId>[] = [
  { id: 'free-tier', label: 'Free tier' },
  { id: 'budget-ok', label: 'Budget ok' },
  { id: 'production', label: 'Production' },
]

const modeOptions: PillOption<ModeId>[] = modes.map((mode) => ({
  id: mode.id,
  label: mode.name,
}))

// ----------------------------------------------------------------------------
// Row component
// ----------------------------------------------------------------------------

export interface MetadataRowProps {
  personal: PersonalPills
  origins: PersonalPillOrigins
  onChange: <K extends keyof PersonalPills>(key: K, value: PersonalPills[K]) => void
}

function MetadataRowImpl({ personal, origins, onChange }: MetadataRowProps) {
  const handleDuration = useCallback(
    (next: DurationId) => onChange('duration', next),
    [onChange],
  )
  const handleMode = useCallback(
    (next: ModeId) => onChange('mode', next),
    [onChange],
  )
  const handleBudget = useCallback(
    (next: BudgetId) => onChange('budget', next),
    [onChange],
  )

  return (
    <div
      role="group"
      aria-label="Project parameters"
      className="flex w-full flex-wrap items-center gap-2"
    >
      <MetaPill<DurationId>
        name="Duration"
        options={durationOptions}
        value={personal.duration}
        origin={origins.duration}
        onSelect={handleDuration}
      />
      <MetaPill<ModeId>
        name="Mode"
        options={modeOptions}
        value={personal.mode}
        origin={origins.mode}
        onSelect={handleMode}
      />
      <MetaPill<BudgetId>
        name="Budget"
        options={budgetOptions}
        value={personal.budget}
        origin={origins.budget}
        onSelect={handleBudget}
      />
    </div>
  )
}

export const MetadataRow = memo(MetadataRowImpl)

// ----------------------------------------------------------------------------
// MetaPill — one pill with an inline option cycle on click
// ----------------------------------------------------------------------------
//
// The cycle pattern is deliberate: clicking advances to the next option
// without opening a menu. This keeps medium-granularity controls at
// "one-tap interaction" so students can experiment without a modal.

interface MetaPillProps<T extends string> {
  name: string
  options: PillOption<T>[]
  value: T
  origin: PillOrigin
  onSelect: (next: T) => void
}

// Per-origin class maps. Module-level constants so the MetaPill render body
// stays declarative and the three visual states read as a ternary lookup
// rather than nested conditionals. Follows rendering-conditional-render.
//
// 294-0 direction: capsule pills with a subtle border, SMALL-CAPS label + value
// in regular case side-by-side. Taller (h-9) than the previous compact pill so
// the editorial feel reads at display scale.
const PILL_SHELL_CLASSES: Record<PillOrigin, string> = {
  default:
    'inline-flex h-9 items-center gap-2 rounded-full border border-dashed border-brand-200 bg-warm-white/60 px-4 italic hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
  'ai-picked':
    'inline-flex h-9 items-center gap-2 rounded-full border border-brand-100 bg-warm-white px-4 hover:border-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
  'user-confirmed':
    'inline-flex h-9 items-center gap-2 rounded-full border border-brand-50 bg-warm-white px-4 hover:border-brand-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200',
}

// aria-label suffix keeps origin provenance available to assistive tech so
// students using screen readers hear "Duration: 30 min (Claude proposed)"
// instead of a generic value read.
const PILL_ARIA_SUFFIX: Record<PillOrigin, string> = {
  default: '(default, tap to pick)',
  'ai-picked': '(Claude proposed, tap to change)',
  'user-confirmed': '(you picked, tap to cycle)',
}

function MetaPillImpl<T extends string>({
  name,
  options,
  value,
  origin,
  onSelect,
}: MetaPillProps<T>) {
  const currentIndex = options.findIndex((opt) => opt.id === value)
  const current = options[currentIndex] ?? options[0]

  const handleCycle = useCallback(() => {
    const nextIndex = (currentIndex + 1) % options.length
    onSelect(options[nextIndex].id)
  }, [currentIndex, options, onSelect])

  // Three render branches for the three origins. Name color is slightly muted
  // on 'default' to reinforce the hint treatment; 'ai-picked' shows a small
  // "AI" badge between name and value; 'user-confirmed' is the existing
  // solid chip with no badge.
  return (
    <motion.button
      type="button"
      layout
      onClick={handleCycle}
      transition={layoutShift}
      variants={metadataPillVariants}
      initial="initial"
      animate="settled"
      className={PILL_SHELL_CLASSES[origin]}
      aria-label={`${name}: ${current.label}. ${PILL_ARIA_SUFFIX[origin]}`}
    >
      <span className="type-label-s text-brand-400">
        {name}
      </span>
      {origin === 'ai-picked' ? (
        <span
          aria-hidden
          className="font-body inline-flex items-center rounded-full bg-brand-25 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-brand-500"
        >
          AI
        </span>
      ) : null}
      <span
        className={
          origin === 'default'
            ? 'font-heading text-sm text-brand-400'
            : 'font-heading text-sm text-leather'
        }
      >
        {current.label}
      </span>
    </motion.button>
  )
}

// Generics + memo: React.memo's type signature widens generics by default,
// so we cast to preserve the type parameter call-site-first. ReactElement
// is the explicit return type instead of relying on ReturnType inference,
// which can break under noImplicitAny in strict mode.
const MetaPill = memo(MetaPillImpl) as <T extends string>(
  props: MetaPillProps<T>,
) => ReactElement
