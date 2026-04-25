// Research metrics — tiny in-memory ring buffer for tuning.
//
// Not for students. Zero production UI surface. Read from devtools via
// `window.__RESEARCH_METRICS__` or rendered by <ResearchDebugPanel/> when
// the dev flag is set (localStorage.RESEARCH_DEBUG === '1' or ?debug=1).
//
// Derived metrics (p50/p95 latency, cache hit rate) are computed on read
// rather than stored — keeps the recorder a one-line append.

export type ResearchMetricKind =
  | 'start'
  | 'tool_done'
  | 'done'
  | 'abort'
  | 'consumed'

export interface ResearchMetric {
  kind: ResearchMetricKind
  intent: string
  sessionId: string
  t: number
  tool?: string
  latencyMs?: number
  ok?: boolean
  error?: string
}

const BUFFER_SIZE = 50
const buffer: ResearchMetric[] = []

export function recordResearchMetric(metric: ResearchMetric): void {
  buffer.push(metric)
  if (buffer.length > BUFFER_SIZE) {
    buffer.shift()
  }

  if (
    typeof window !== 'undefined' &&
    window.localStorage?.getItem('RESEARCH_DEBUG') === '1'
  ) {
    const latency =
      typeof metric.latencyMs === 'number' ? ` ${metric.latencyMs}ms` : ''
    const ok =
      metric.ok === false ? ' FAIL' : metric.ok === true ? ' ok' : ''
    // eslint-disable-next-line no-console
    console.debug(
      `[research] ${metric.kind}${ok}${latency} — ${metric.intent.slice(0, 40)}`,
      metric,
    )
  }
}

export function getResearchMetrics(): readonly ResearchMetric[] {
  return buffer
}

export interface DerivedMetrics {
  toolLatency: Record<string, { p50: number; p95: number; count: number }>
  cacheHits: number
  cacheMisses: number
  errorCount: number
  totalRuns: number
}

export function deriveMetrics(): DerivedMetrics {
  const byTool = new Map<string, number[]>()
  let cacheHits = 0
  let cacheMisses = 0
  let errorCount = 0
  let totalRuns = 0

  for (const m of buffer) {
    if (m.kind === 'tool_done' && m.tool && typeof m.latencyMs === 'number') {
      const arr = byTool.get(m.tool) ?? []
      arr.push(m.latencyMs)
      byTool.set(m.tool, arr)
    }
    if (m.kind === 'start') totalRuns += 1
    if (m.kind === 'done' && m.ok === false) errorCount += 1
    if (m.kind === 'consumed') {
      if ((m.latencyMs ?? 0) < 50) cacheHits += 1
      else cacheMisses += 1
    }
  }

  const toolLatency: DerivedMetrics['toolLatency'] = {}
  for (const [tool, values] of byTool) {
    const sorted = [...values].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    toolLatency[tool] = { p50, p95, count: sorted.length }
  }

  return { toolLatency, cacheHits, cacheMisses, errorCount, totalRuns }
}

// Expose the ring buffer + derived view on window for devtools inspection.
// Gated on typeof window so SSR/build steps don't explode.
if (typeof window !== 'undefined') {
  interface ResearchMetricsWindow {
    __RESEARCH_METRICS__?: {
      buffer: readonly ResearchMetric[]
      derived: () => DerivedMetrics
    }
  }
  ;(window as Window & ResearchMetricsWindow).__RESEARCH_METRICS__ = {
    get buffer() {
      return getResearchMetrics()
    },
    derived: deriveMetrics,
  }
}
