// useFocusNavigation — keyboard handlers for Highway focused-step state.
//
// ESC → exit focus.
// ArrowLeft / ArrowRight → previous / next step.
//
// Handlers are no-ops unless `enabled` is true (i.e. phase === 'focused').
// Also skipped when the active element is an input/textarea so typing in
// the HighwayDock's ask input doesn't trigger navigation.
//
// Mounted at App root so the key listeners survive phase transitions.

import { useEffect } from 'react'

export interface UseFocusNavigationArgs {
  enabled: boolean
  onExit: () => void
  onPrev: () => void
  onNext: () => void
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return false
}

export function useFocusNavigation({
  enabled,
  onExit,
  onPrev,
  onNext,
}: UseFocusNavigationArgs): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onExit()
        return
      }
      // Don't hijack arrow keys while typing.
      if (isTextEntryTarget(event.target)) return
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        onPrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        onNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onExit, onPrev, onNext])
}
