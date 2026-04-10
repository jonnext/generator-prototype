import { useSyncExternalStore } from 'react'

// Hook: subscribes to the user's prefers-reduced-motion system setting.
// useSyncExternalStore avoids any useEffect ceremony and stays SSR-safe
// (getServerSnapshot returns false so we default to motion enabled on first
// paint — the real value kicks in on hydration if it differs).

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(notify: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', notify)
  return () => mql.removeEventListener('change', notify)
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia(QUERY).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
