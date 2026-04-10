// Desktop-only horizontal filter row for the Discovery screen.
//
// Mobile-first discipline: hidden below the 768px breakpoint (the mobile
// layout has the search input doing the same job). Above 768px the row
// lets the student pivot between "All" and the categories present in the
// seed data.
//
// Stateless — receives the current filter and a setter. Categories are
// derived during render from whatever seed array is passed in, so we never
// drift out of sync with copy-writer's seedProjects.

import { memo } from 'react'
import type { SeedProject } from '@/lib/seedProjects'

export type CategoryFilterValue = string | null

export interface CategoryFilterProps {
  projects: readonly SeedProject[]
  value: CategoryFilterValue
  onChange: (next: CategoryFilterValue) => void
}

function uniqueCategories(projects: readonly SeedProject[]): string[] {
  const set = new Set<string>()
  for (const project of projects) set.add(project.category)
  return [...set]
}

function CategoryFilterImpl({
  projects,
  value,
  onChange,
}: CategoryFilterProps) {
  // Derived during render (rerender-derived-state-no-effect). The seed list
  // is stable across the session, so the cost is negligible.
  const categories = uniqueCategories(projects)

  return (
    <div
      role="radiogroup"
      aria-label="Filter by category"
      className="hidden flex-wrap items-center gap-2 md:flex"
    >
      <FilterPill
        label="All"
        isActive={value === null}
        onClick={() => onChange(null)}
      />
      {categories.map((category) => (
        <FilterPill
          key={category}
          label={category}
          isActive={value === category}
          onClick={() => onChange(category)}
        />
      ))}
    </div>
  )
}

interface FilterPillProps {
  label: string
  isActive: boolean
  onClick: () => void
}

function FilterPill({ label, isActive, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isActive}
      onClick={onClick}
      className={
        isActive
          ? 'font-body rounded-full border border-leather bg-leather px-3 py-1.5 text-xs text-paper'
          : 'font-body rounded-full border border-brand-50 bg-warm-white px-3 py-1.5 text-xs text-brand-500 hover:border-brand-200'
      }
    >
      {label}
    </button>
  )
}

export const CategoryFilter = memo(CategoryFilterImpl)
