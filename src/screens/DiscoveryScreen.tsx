// Discovery screen — the Generator V2 entry point.
//
// 2026-04-27 (round 7): Spotify-style rows extended into a richer
// library feel per Jon's review:
//   • Side padding bumped (px-10 → md:px-16 → lg:px-20) so first/last
//     tiles aren't flush against the viewport edge.
//   • Project rows render in dark mode (cards switch to a dark surface)
//     so they fit the inky browse panel rather than punching white holes.
//   • Multiple themed rows now: Featured Roadmaps, Top Roadmaps,
//     Specialty Tracks, Tool Deep-Dives, Build with Claude (2-row stack),
//     Build on AWS (2-row stack) — feels like a real catalogue.
//   • Browse panel extends to fill the remaining viewport height; the
//     paper ground never reappears below it as you scroll, so the dark
//     "library platform" stays cohesive past every row.
//
// Hero, example pills, wordmark, and floating Generate input unchanged.
// State lift unchanged: input value lives here so example pills and
// tile clicks can populate it. Submission still routes through
// onSearchCardSubmit → App.handleGenerate.

import { useCallback, useMemo, useState } from 'react'
import { CourseTile } from '@/components/discovery/CourseTile'
import { ExamplePromptPills } from '@/components/discovery/ExamplePromptPills'
import { Footer } from '@/components/discovery/Footer'
import { GenerateProjectInput } from '@/components/discovery/GenerateProjectInput'
import { HeroHeadline } from '@/components/discovery/HeroHeadline'
import { ProjectIconCard } from '@/components/discovery/ProjectIconCard'
import { SpotifyRow } from '@/components/discovery/SpotifyRow'
import { Wordmark } from '@/components/discovery/Wordmark'
import { FEATURED_ROADMAP_SLUGS } from '@/data/nextworkSeriesFeatured'
import {
  NEXTWORK_PROJECTS,
  type NextworkProject,
} from '@/data/nextworkProjects'
import {
  projectsByConcept,
  type IndividualProject,
} from '@/data/individualProjects'

export interface DiscoveryScreenProps {
  /**
   * Wired from App.tsx to handleGenerate so both the entry input and any
   * future Toolbar morph route through a single generation path.
   */
  onSearchCardSubmit: (value: string) => void
}

export function DiscoveryScreen({ onSearchCardSubmit }: DiscoveryScreenProps) {
  const [inputValue, setInputValue] = useState('')

  const handlePickPrompt = useCallback((prompt: string) => {
    setInputValue(prompt)
  }, [])

  const handlePickSeries = useCallback((series: NextworkProject) => {
    setInputValue(series.title)
  }, [])

  const handlePickProject = useCallback((project: IndividualProject) => {
    setInputValue(project.title)
  }, [])

  // Featured Roadmaps row — curated slug list resolved to course records.
  const featuredRoadmaps = useMemo(() => {
    const bySlug = new Map(NEXTWORK_PROJECTS.map((p) => [p.id, p]))
    return FEATURED_ROADMAP_SLUGS
      .map((slug) => bySlug.get(slug))
      .filter((s): s is NextworkProject => Boolean(s))
  }, [])

  // Top Roadmaps — every roadmap series NOT already in Featured Roadmaps,
  // so the rows complement rather than duplicate. Memoised against
  // FEATURED_ROADMAP_SLUGS for stable identity.
  const moreRoadmaps = useMemo(() => {
    const featuredSet = new Set<string>(FEATURED_ROADMAP_SLUGS)
    return NEXTWORK_PROJECTS.filter(
      (p) => p.track === 'Roadmaps' && !featuredSet.has(p.id),
    )
  }, [])

  const specialtyTracks = useMemo(
    () => NEXTWORK_PROJECTS.filter((p) => p.track === 'Specialty'),
    [],
  )

  const toolDeepDives = useMemo(
    () => NEXTWORK_PROJECTS.filter((p) => p.track === 'Tools'),
    [],
  )

  const claudeProjects = useMemo(() => projectsByConcept('Claude'), [])

  // Build on AWS — projects whose concepts include "AWS". Excludes the
  // Claude-overlap so a project doesn't appear in both project rows.
  const awsProjects = useMemo(() => {
    const claudeIds = new Set(claudeProjects.map((p) => p.id))
    return projectsByConcept('AWS').filter((p) => !claudeIds.has(p.id))
  }, [claudeProjects])

  return (
    <main className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-paper text-leather">
      {/* Wordmark fixed top-left. z-40 keeps it above the page-flow
          content but below the floating Generate input (z-50). */}
      <div className="pointer-events-none fixed left-7 top-7 z-40">
        <Wordmark width={117} className="text-leather" />
      </div>

      {/* Hero zone — paper ground, hero + example pills.
          Top padding (132px) and inter-element gap (32px) ported verbatim
          from Paper artboard 4LA-0 so the hero sits where Jon designed it. */}
      <div className="flex w-full flex-col items-center pt-[132px]">
        <div className="flex w-full max-w-[1100px] flex-col items-center gap-8 px-10">
          <HeroHeadline />
          <ExamplePromptPills onPick={handlePickPrompt} />
        </div>
      </div>

      {/* Browse panel — dark inky leather tray rising up with the
          asymmetric 112/80 top corners (Paper artboard 4LA-0:
          borderTopLeftRadius 112px, borderTopRightRadius 80px). The
          asymmetry creates the gentle arch you see at the seam between
          the paper hero and the dark catalogue ground. The 60px paper
          gutter above (mt-[60px]) matches the Eyebrow frame's
          paddingTop in the design. `flex-1` makes the panel consume the
          rest of the viewport so paper bg never shows below as the user
          scrolls. Bottom padding leaves room for the floating Generate
          input without the rows disappearing under it. */}
      <section
        aria-label="Browse NextWork projects"
        className="mt-[60px] flex w-full flex-1 flex-col gap-12 rounded-tl-[112px] rounded-tr-[80px] bg-[#1A1918] pb-24 pt-14"
      >
        <h2 className="text-center font-heading text-[18px]/[1.4] font-medium text-white">
          Or browse NextWork projects
        </h2>

        <div className="flex w-full flex-col gap-12">
          <SpotifyRow
            tone="dark"
            title="Featured Roadmaps"
            subtitle="Hand-picked paths to start with"
          >
            {featuredRoadmaps.map((series) => (
              <CourseTile
                key={series.id}
                series={series}
                onSelect={handlePickSeries}
              />
            ))}
          </SpotifyRow>

          <SpotifyRow
            tone="dark"
            title="Top Roadmaps"
            subtitle="More guided journeys across the catalogue"
          >
            {moreRoadmaps.map((series) => (
              <CourseTile
                key={series.id}
                series={series}
                onSelect={handlePickSeries}
              />
            ))}
          </SpotifyRow>

          <SpotifyRow
            tone="dark"
            rows={2}
            title="Build with Claude"
            subtitle="Projects using Claude and Claude Code"
          >
            {claudeProjects.map((project) => (
              <ProjectIconCard
                key={project.id}
                project={project}
                onSelect={handlePickProject}
                tone="dark"
                wide
              />
            ))}
          </SpotifyRow>

          <SpotifyRow
            tone="dark"
            title="Specialty Tracks"
            subtitle="Deep dives into a single discipline"
          >
            {specialtyTracks.map((series) => (
              <CourseTile
                key={series.id}
                series={series}
                onSelect={handlePickSeries}
              />
            ))}
          </SpotifyRow>

          <SpotifyRow
            tone="dark"
            rows={2}
            title="Build on AWS"
            subtitle="Foundational and applied AWS projects"
          >
            {awsProjects.map((project) => (
              <ProjectIconCard
                key={project.id}
                project={project}
                onSelect={handlePickProject}
                tone="dark"
                wide
              />
            ))}
          </SpotifyRow>

          <SpotifyRow
            tone="dark"
            title="Tool Deep-Dives"
            subtitle="One-tool tutorials — Lambda, EKS, Docker, Cursor, more"
          >
            {toolDeepDives.map((series) => (
              <CourseTile
                key={series.id}
                series={series}
                onSelect={handlePickSeries}
              />
            ))}
          </SpotifyRow>
        </div>

        {/* Footer — ported from the marketing site so the prototype reads
            as a complete page concept rather than a single-screen demo.
            Sits inside the dark panel so the leather ground continues
            edge-to-edge with no seam. */}
        <Footer />
      </section>

      <GenerateProjectInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={onSearchCardSubmit}
      />
    </main>
  )
}
