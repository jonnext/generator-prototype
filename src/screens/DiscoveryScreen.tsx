// Discovery screen — the Generator v2 entry point.
//
// Layout: single-column, mobile first. One unified search input at the top,
// then the Community Projects grid below. When the student types, the grid
// filters in real time; when nothing matches, an EmptySearchPrompt shows
// the Generate CTA. Pressing Generate (or submitting the input with empty
// results) transitions to the Canvas screen.
//
// Per rerender-use-deferred-value, the filter computation runs on the
// deferred query so the input stays snappy while the list catches up. Per
// rerender-no-inline-components, every component is declared at module level.

import { motion } from 'motion/react'
import { useCallback, useDeferredValue, useMemo, useState, useTransition } from 'react'
import { seedProjects, type SeedProject } from '@/lib/seedProjects'
import {
  CategoryFilter,
  type CategoryFilterValue,
} from '@/components/discovery/CategoryFilter'
import { CommunityTile } from '@/components/discovery/CommunityTile'
import { EmptySearchPrompt } from '@/components/discovery/EmptySearchPrompt'
import { SearchInput } from '@/components/discovery/SearchInput'
import { staggerParentVariants, stepCardVariants } from '@/motion/choreography'

export interface DiscoveryScreenProps {
  /** Called when the student submits a Generate intent (typed or empty-state). */
  onGenerate: (intent: string) => void
  /** Called when the student picks a community tile instead of generating. */
  onPickCommunity: (project: SeedProject) => void
}

function matches(
  project: SeedProject,
  query: string,
  category: CategoryFilterValue,
): boolean {
  if (category !== null && project.category !== category) return false
  if (query === '') return true
  const haystack =
    `${project.title} ${project.description} ${project.category}`.toLowerCase()
  return haystack.includes(query)
}

export function DiscoveryScreen({
  onGenerate,
  onPickCommunity,
}: DiscoveryScreenProps) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<CategoryFilterValue>(null)
  const [isPending, startTransition] = useTransition()

  // Defer the query used for filtering so typing stays at 60fps. The input
  // always reflects `query`; the grid reads `deferredQuery` and lags behind
  // when the list is heavy.
  const deferredQuery = useDeferredValue(query)
  const normalized = deferredQuery.trim().toLowerCase()
  const isStale = query !== deferredQuery

  // Filtering is cheap for 8 seeds today, but will grow — memo keeps the
  // array identity stable across re-renders so memoized tiles don't re-render.
  // Split from the useDeferredValue computation per rerender-split-combined-hooks:
  // category changes trigger an instant filter, query changes are deferred.
  const filtered = useMemo(
    () => seedProjects.filter((project) => matches(project, normalized, category)),
    [normalized, category],
  )

  const handleSubmit = useCallback(
    (value: string) => {
      // Wrap the phase transition in startTransition so the pending flag
      // drives the button's "Generating..." label without a separate
      // useState ceremony (rendering-usetransition-loading).
      startTransition(() => {
        onGenerate(value)
      })
    },
    [onGenerate],
  )

  const handlePickCommunity = useCallback(
    (project: SeedProject) => {
      startTransition(() => {
        onPickCommunity(project)
      })
    },
    [onPickCommunity],
  )

  return (
    <main className="min-h-dvh w-full bg-paper text-leather">
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-10 md:py-16">
        <header className="flex flex-col gap-3">
          <span className="font-body text-xs uppercase tracking-[0.12em] text-brand-400">
            NextWork Generator
          </span>
          <h1 className="font-heading text-3xl leading-tight tracking-tight text-leather md:text-4xl">
            What do you want to build today?
          </h1>
          <p className="font-body max-w-prose text-sm text-brand-500 md:text-base">
            Type an idea and we will sketch the outline together. Or pick one
            of the community projects below to start from a working shape.
          </p>
        </header>

        <SearchInput
          value={query}
          onChange={setQuery}
          onSubmit={handleSubmit}
          isSubmitting={isPending}
        />

        <CategoryFilter
          projects={seedProjects}
          value={category}
          onChange={setCategory}
        />

        <section
          aria-labelledby="community-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex items-baseline justify-between">
            <h2
              id="community-heading"
              className="font-heading text-sm uppercase tracking-[0.12em] text-brand-400"
            >
              {normalized === '' ? 'Recommended' : 'Matching community projects'}
            </h2>
            {filtered.length > 0 ? (
              <span className="font-body text-xs text-brand-400">
                {filtered.length} project{filtered.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          {filtered.length === 0 ? (
            <EmptySearchPrompt
              query={query}
              onGenerate={handleSubmit}
              isGenerating={isPending}
            />
          ) : (
            <motion.div
              variants={staggerParentVariants}
              initial="hidden"
              animate="visible"
              className={`grid grid-cols-1 gap-4 md:grid-cols-2 transition-opacity duration-150 ${isStale ? 'opacity-70' : 'opacity-100'}`}
            >
              {filtered.map((project) => (
                <motion.div key={project.id} variants={stepCardVariants} layout>
                  <CommunityTile
                    project={project}
                    onSelect={handlePickCommunity}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </section>
      </div>
    </main>
  )
}
