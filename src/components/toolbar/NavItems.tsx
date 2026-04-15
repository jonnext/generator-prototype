// NavItems — the four middle nav affordances of the Discovery nav bar.
//
// Four sibling <button type="button"> elements. The active item (default
// "projects") wears an aria-current="page" and is wrapped in a filled pill
// per Paper frame HV-0. The "generate" item is the one that fires the
// Toolbar's expansion into ToolbarInput.
//
// Keyboard semantics:
//  - Native <button> already handles Enter + Space correctly. We still
//    attach onKeyDown for belt-and-braces (some assistive devices emit
//    synthetic Enter events ahead of click).
//
// Accessibility:
//  - aria-current="page" on the active item (screen readers announce it).
//  - aria-expanded is set on the generate item from the parent (Toolbar
//    passes isExpanded down).
//  - All buttons keyboard-focusable with visible focus ring via focus-visible.
//
// Props are stable callbacks from Toolbar (useCallback) and derived state;
// the module-level memo on NavItems prevents a re-render each time the
// Toolbar shell re-runs (rerender-no-inline-components).

import { memo, useCallback, type KeyboardEvent } from 'react'

export type NavItemName = 'ask' | 'projects' | 'docs' | 'generate'

export interface NavItemsProps {
  /** Which nav item is visually "active". v1 is hard-coded by the parent to 'projects'. */
  activeItem: NavItemName
  /** Fired when Generate is clicked or Enter/Space pressed on it. */
  onGenerateActivate: () => void
  /** aria-expanded value for the Generate button — true when the bar is morphed into the input. */
  isGenerateExpanded: boolean
}

// Dev-only soft-log for v1 stubs so Jon can see clicks in the console
// during design review without shipping noise to prod.
function stubLog(name: NavItemName) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info(`[NavItems] "${name}" is not wired yet — v1 stub`)
  }
}

function NavItemsImpl({ activeItem, onGenerateActivate, isGenerateExpanded }: NavItemsProps) {
  // v1 stubs — module-level handlers would be cleaner but each one needs to
  // close over its own name for the log, so we wrap in useCallback inside
  // the component. These callbacks are stable across re-renders because
  // stubLog doesn't touch props or state.
  const handleAsk = useCallback(() => stubLog('ask'), [])
  const handleProjects = useCallback(() => stubLog('projects'), [])
  const handleDocs = useCallback(() => stubLog('docs'), [])

  const handleGenerateKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onGenerateActivate()
      }
    },
    [onGenerateActivate],
  )

  return (
    <div className="flex items-center gap-7">
      <button
        type="button"
        onClick={handleAsk}
        aria-current={activeItem === 'ask' ? 'page' : undefined}
        className="font-body cursor-pointer text-[13px]/4 text-[#6C615C] transition-colors hover:text-[#1B1918] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Ask
      </button>

      <button
        type="button"
        onClick={handleProjects}
        aria-current={activeItem === 'projects' ? 'page' : undefined}
        className={
          activeItem === 'projects'
            ? 'cursor-pointer rounded-md bg-[#F0E9E6] px-2.5 py-1.5 font-body text-[13px]/4 font-medium text-[#1B1918] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
            : 'font-body cursor-pointer text-[13px]/4 text-[#6C615C] transition-colors hover:text-[#1B1918] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918] focus-visible:ring-offset-2 focus-visible:ring-offset-white'
        }
      >
        Projects
      </button>

      <button
        type="button"
        onClick={handleDocs}
        aria-current={activeItem === 'docs' ? 'page' : undefined}
        className="font-body cursor-pointer text-[13px]/4 text-[#6C615C] transition-colors hover:text-[#1B1918] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Docs
      </button>

      <button
        type="button"
        onClick={onGenerateActivate}
        onKeyDown={handleGenerateKeyDown}
        aria-expanded={isGenerateExpanded}
        aria-label="Generate a new project — opens text input"
        className="font-body cursor-pointer text-[13px]/4 font-medium text-[#1B1918] transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B1918] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
      >
        Generate
      </button>
    </div>
  )
}

export const NavItems = memo(NavItemsImpl)
