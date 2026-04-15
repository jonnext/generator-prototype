// Discovery screen — the Generator v2 entry point.
//
// Post-critique Paper frame `HV-0` "nextwork-starting point" replaces the
// previous CommunityTile grid layout. The entire content area is now a
// single fixed-position <SearchCard> that docks above the Toolbar nav bar
// (Team B). The screen itself just provides the paper-colored viewport
// background and the aria-landmark — SearchCard handles positioning.
//
// The old CommunityTile/CategoryFilter/EmptySearchPrompt components still
// live on disk (Jon or Team C may reintroduce them later) but are no
// longer imported anywhere in the active render path.
//
// Per rerender-no-inline-components the SearchCard is a module-level
// component. Per rendering-conditional-render we have no conditionals
// in this file at all — the shape is static.

import { SearchCard } from '@/components/discovery/SearchCard'

export interface DiscoveryScreenProps {
  /**
   * Called when the student presses Enter in the SearchCard's "I want to
   * learn…" input with a non-empty value. Team C (Thread 3) wires this
   * from App.tsx to the same `handleGenerate` the Toolbar uses so both
   * entry points route through a single generation path.
   */
  onSearchCardSubmit: (value: string) => void
}

export function DiscoveryScreen({ onSearchCardSubmit }: DiscoveryScreenProps) {
  return (
    <main className="min-h-dvh w-full bg-paper text-leather">
      <SearchCard onSubmit={onSearchCardSubmit} />
    </main>
  )
}
