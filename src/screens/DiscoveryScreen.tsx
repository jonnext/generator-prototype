// Discovery screen — the Generator V2 entry point.
//
// 2026-04-25 (round 4): reverted to the original centred single-column
// shape per Paper frame `31R-0` "Explore Starting Point". The header
// stack (hero, example pills, eyebrow, filter row) is centred above a
// uniform tile grid. An oversized "globe" mask is layered on the grid
// via a CSS radial-gradient at `circle at 50% 110%` — the centre sits
// just below the viewport (behind the floating Generate input), so the
// visible arc bows upward across the lower-mid grid. Tiles inside the
// arc fade toward the paper background; tiles in the upper corners
// stay at full opacity. Pure CSS, static, no shader element.
//
// State lift remains: input value lives here so example pills and tile
// clicks can populate it via setInputValue. Submission still routes
// through onSearchCardSubmit → App.handleGenerate (no change to the
// generation pipeline).

import { useCallback, useState } from 'react'
import { CategoryFilterRow, type ProjectFilter } from '@/components/discovery/CategoryFilterRow'
import { EyebrowLabel } from '@/components/discovery/EyebrowLabel'
import { ExamplePromptPills } from '@/components/discovery/ExamplePromptPills'
import { GenerateProjectInput } from '@/components/discovery/GenerateProjectInput'
import { HeroHeadline } from '@/components/discovery/HeroHeadline'
import { ProjectGrid } from '@/components/discovery/ProjectGrid'
import { Wordmark } from '@/components/discovery/Wordmark'
import type { NextworkProject } from '@/data/nextworkProjects'

// Globe mask — defined once at module scope so the string identity is
// stable across renders.
//
// Geometry: the gradient centre sits at `50% 110%` (just past the
// wrapper's bottom edge), so the visible portion of the radial gradient
// is the upper arc of a very large circle. Alpha controls fade vs full:
//   • 0%–35% radius → fully transparent (tiles invisible — the planet's
//                     "interior" that we don't render)
//   • 35%–60% radius → transition zone (the visible arc cutting through
//                     the grid — this is what reads as the planet edge)
//   • 60%+ radius → fully opaque (tiles at full opacity in the corners)
//
// Both mask-image and -webkit-mask-image are set so Safari renders
// without a vendor flip. The hard alpha contrast makes the arc visible
// against painted-art tiles where a softer fade washes out.
const GLOBE_MASK =
  'radial-gradient(circle at 50% 110%, transparent 0%, transparent 35%, rgba(0,0,0,1) 60%)'

export interface DiscoveryScreenProps {
  /**
   * Wired from App.tsx to handleGenerate so both the entry input and any
   * future Toolbar morph route through a single generation path.
   */
  onSearchCardSubmit: (value: string) => void
}

export function DiscoveryScreen({ onSearchCardSubmit }: DiscoveryScreenProps) {
  const [inputValue, setInputValue] = useState('')
  const [activeFilter, setActiveFilter] = useState<ProjectFilter>('All')

  const handlePickPrompt = useCallback((prompt: string) => {
    setInputValue(prompt)
  }, [])

  const handleSelectProject = useCallback((project: NextworkProject) => {
    setInputValue(project.title)
  }, [])

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-paper text-leather">
      {/* Wordmark fixed top-left. z-40 keeps it above the page-flow
          content but below the floating Generate input (z-50). */}
      <div className="pointer-events-none fixed left-7 top-7 z-40">
        <Wordmark width={117} className="text-leather" />
      </div>

      {/* Page-flow content. The header stack is constrained to a
          readable column width; the project grid is full viewport
          width so the globe mask fills the whole screen as a single
          celestial body rather than a contained widget. */}
      <div className="flex w-full flex-col items-center gap-10 pt-24 pb-48">
        {/* Centred header column */}
        <div className="flex w-full max-w-[1100px] flex-col items-center gap-8 px-8">
          <HeroHeadline />
          <ExamplePromptPills onPick={handlePickPrompt} />
        </div>

        <div className="flex flex-col items-center gap-3.5 px-8">
          <EyebrowLabel />
          <CategoryFilterRow active={activeFilter} onChange={setActiveFilter} />
        </div>

        {/* Globe mask wrapper — full-width. The radial-gradient origin
            at `50% 110%` puts the implicit planet centre 10% past this
            wrapper's bottom edge (visually right behind the floating
            Generate input). Tiles within ~35% of that centre are
            clipped out; tiles in the upper corners stay full opacity.
            Inner padding gives the tiles breathing room from the
            viewport edges so the corners read as a calm border, not
            as bleeding off the page. */}
        <div
          className="w-full px-6"
          style={{
            WebkitMaskImage: GLOBE_MASK,
            maskImage: GLOBE_MASK,
          }}
        >
          <ProjectGrid filter={activeFilter} onSelectProject={handleSelectProject} />
        </div>
      </div>

      <GenerateProjectInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={onSearchCardSubmit}
      />
    </main>
  )
}
