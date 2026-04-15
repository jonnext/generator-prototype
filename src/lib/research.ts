// Research client — fetches /api/research (Exa + Perplexity + Firecrawl fan-out).
//
// The endpoint returns structured per-tool results with latency metadata. The
// outline prompt injection consumes this shape via formatResearchForPrompt to
// give Claude cited primitives when shaping the skeleton.

export type ResearchMode = 'full' | 'exa-only'

export interface ExaResult {
  title: string | null
  url: string | null
  snippet: string | null
  publishedDate: string | null
  author: string | null
}

export interface FirecrawlResult {
  title: string | null
  url: string | null
  snippet: string | null
}

export interface ToolResult<T> {
  ok: boolean
  data?: T
  error?: string
  latencyMs: number
}

export interface ResearchResponse {
  mode: ResearchMode
  prompt: string
  totalLatencyMs?: number
  exa: ToolResult<{ results: ExaResult[] }>
  perplexity: ToolResult<{ synthesis: string; citations: string[] }>
  firecrawl: ToolResult<{ results: FirecrawlResult[] }>
  errors: Array<{ tool: string; error: string }>
}

export async function fetchResearch(
  prompt: string,
  opts: { mode?: ResearchMode; sessionId?: string; signal?: AbortSignal } = {},
): Promise<ResearchResponse> {
  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      prompt,
      sessionId: opts.sessionId ?? 'anonymous',
      mode: opts.mode ?? 'full',
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Research call failed: ${response.status} ${body}`)
  }

  return (await response.json()) as ResearchResponse
}

// Format research results as a plain-text block for injection into Claude's
// system prompt. Compact, dedup-free (Exa and Firecrawl URLs may overlap and
// that's fine — the redundancy is signal). Truncation keeps the context under
// ~3k tokens even when all three tools return maximum payloads.

export function formatResearchForPrompt(research: ResearchResponse): string {
  const blocks: string[] = []

  if (research.exa.ok && research.exa.data?.results?.length) {
    blocks.push('## Semantic search (Exa)')
    for (const r of research.exa.data.results.slice(0, 5)) {
      if (!r.url) continue
      blocks.push(`- **${r.title ?? 'Untitled'}** (${r.url})`)
      if (r.snippet) blocks.push(`  ${truncate(r.snippet, 400)}`)
    }
    blocks.push('')
  }

  if (research.perplexity.ok && research.perplexity.data?.synthesis) {
    blocks.push('## Synthesised answer (Perplexity)')
    blocks.push(truncate(research.perplexity.data.synthesis, 1600))
    if (research.perplexity.data.citations?.length) {
      blocks.push('')
      blocks.push('Citations:')
      for (const c of research.perplexity.data.citations.slice(0, 8)) {
        blocks.push(`- ${c}`)
      }
    }
    blocks.push('')
  }

  if (research.firecrawl.ok && research.firecrawl.data?.results?.length) {
    blocks.push('## Web search results (Firecrawl)')
    for (const r of research.firecrawl.data.results.slice(0, 5)) {
      if (!r.url) continue
      blocks.push(`- **${r.title ?? 'Untitled'}** (${r.url})`)
      if (r.snippet) blocks.push(`  ${truncate(r.snippet, 300)}`)
    }
    blocks.push('')
  }

  if (blocks.length === 0) {
    return ''
  }

  return blocks.join('\n')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max).trimEnd() + '…'
}
