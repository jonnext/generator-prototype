// Research debug panel — dev-only surface for tuning the prefetch + cache.
//
// Students never see this. Visibility is gated on:
//   - localStorage.RESEARCH_DEBUG === '1'
//   - OR ?debug=1 query param
//
// When neither is set, the component returns null and no bundle-time cost
// accrues at render time beyond the flag check. Styling is intentionally
// minimal — this is an instrument panel, not a feature.

import { useEffect, useState } from 'react'
import { useResearchCacheStatus } from '@/hooks/useResearchCache'
import { deriveMetrics, type DerivedMetrics } from '@/lib/researchMetrics'

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.localStorage?.getItem('RESEARCH_DEBUG') === '1') return true
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') === '1') return true
  } catch {
    // localStorage access can throw in some sandboxed contexts; treat as off.
  }
  return false
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ResearchDebugPanel() {
  const [enabled] = useState(isDebugEnabled)
  const entry = useResearchCacheStatus()
  const [derived, setDerived] = useState<DerivedMetrics>(() => deriveMetrics())

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      setDerived(deriveMetrics())
    }, 500)
    return () => window.clearInterval(id)
  }, [enabled])

  if (!enabled) return null

  const statusColor =
    entry.status === 'ready'
      ? '#34d399'
      : entry.status === 'warming'
        ? '#fbbf24'
        : entry.status === 'error'
          ? '#f87171'
          : '#9ca3af'

  const elapsed =
    entry.status === 'warming'
      ? Date.now() - entry.startedAt
      : entry.status === 'ready'
        ? entry.resolvedAt - entry.startedAt
        : entry.status === 'error'
          ? entry.failedAt - entry.startedAt
          : 0

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 9999,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.4,
        background: 'rgba(17, 24, 39, 0.92)',
        color: '#e5e7eb',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        padding: '8px 10px',
        minWidth: 220,
        maxWidth: 320,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          fontWeight: 600,
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          fontSize: 10,
          color: '#9ca3af',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
          }}
        />
        research · {entry.status}
        {elapsed > 0 ? (
          <span style={{ marginLeft: 'auto', color: '#6b7280' }}>
            {formatDuration(elapsed)}
          </span>
        ) : null}
      </div>

      {entry.status === 'warming' || entry.status === 'ready' || entry.status === 'error' ? (
        <div
          style={{
            fontSize: 10,
            color: '#9ca3af',
            marginBottom: 6,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={entry.intent}
        >
          {entry.intent.slice(0, 50)}
          {entry.intent.length > 50 ? '…' : ''}
        </div>
      ) : null}

      {entry.status === 'ready' ? (
        <div style={{ fontSize: 10, color: '#d1d5db' }}>
          <div>
            exa{' '}
            {entry.data.exa.ok
              ? `✓ ${formatDuration(entry.data.exa.latencyMs)}`
              : '✗'}{' '}
            · pplx{' '}
            {entry.data.perplexity.ok
              ? `✓ ${formatDuration(entry.data.perplexity.latencyMs)}`
              : '✗'}{' '}
            · fc{' '}
            {entry.data.firecrawl.ok
              ? `✓ ${formatDuration(entry.data.firecrawl.latencyMs)}`
              : '✗'}
          </div>
        </div>
      ) : null}

      {entry.status === 'error' ? (
        <div style={{ fontSize: 10, color: '#fca5a5' }}>
          {entry.error.slice(0, 80)}
        </div>
      ) : null}

      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          marginTop: 6,
          paddingTop: 4,
          fontSize: 10,
          color: '#6b7280',
          display: 'flex',
          gap: 8,
        }}
      >
        <span>runs {derived.totalRuns}</span>
        <span>hit {derived.cacheHits}</span>
        <span>miss {derived.cacheMisses}</span>
        <span>err {derived.errorCount}</span>
      </div>
    </div>
  )
}
