// Research finding formatter — DP1.5.F.
//
// Takes an array of ResearchFinding objects (from the research store, scoped
// to a single step) and serializes them into a markdown-ish string for
// injection into the section-generator prompt.
//
// Ordering is deliberate — Firecrawl findings first, then Perplexity,
// then Exa, then Context7. Rationale: Firecrawl is live-page content
// (highest freshness); Perplexity is synthesized with citations; Exa is
// semantic snippets; Context7 is library docs. The section-generator
// prompt tells Claude to prefer Firecrawl when content conflicts, so
// putting it at the top of the context reinforces that.
//
// Truncation limits prevent the prompt from blowing through the 200K
// context window when Firecrawl returns verbose pages. Numbers are tuned
// to keep a typical per-step research block under ~6000 tokens while
// still giving Claude enough detail to ground concrete code examples.

import type { ResearchFinding } from './types'

const TRUNCATE_FIRECRAWL_PER_PAGE = 3000
const TRUNCATE_PERPLEXITY = 2000
const TRUNCATE_EXA_PER_SNIPPET = 500
const TRUNCATE_CONTEXT7_PER_SNIPPET = 800

export function formatFindingsForPrompt(findings: ResearchFinding[]): string {
  if (findings.length === 0) return ''

  const ready = findings.filter((f) => f.status === 'ready' && f.snippets.length > 0)
  if (ready.length === 0) return ''

  const bySource: Record<string, ResearchFinding[]> = {
    firecrawl: [],
    perplexity: [],
    exa: [],
    context7: [],
  }
  for (const f of ready) {
    bySource[f.source]?.push(f)
  }

  const blocks: string[] = []

  // Firecrawl first — live web content, freshness: high. Section generator
  // prompt explicitly tells Claude to prefer this over training knowledge.
  if (bySource.firecrawl.length > 0) {
    blocks.push('## Live web content (Firecrawl — freshness: HIGH, read moments ago)')
    blocks.push('')
    for (const finding of bySource.firecrawl) {
      for (const snippet of finding.snippets) {
        blocks.push(`### ${snippet.title}`)
        if (snippet.url) blocks.push(`Source: ${snippet.url}`)
        blocks.push('')
        blocks.push(truncate(snippet.content, TRUNCATE_FIRECRAWL_PER_PAGE))
        blocks.push('')
      }
    }
  }

  if (bySource.perplexity.length > 0) {
    blocks.push('## Synthesized answer (Perplexity)')
    blocks.push('')
    for (const finding of bySource.perplexity) {
      // Perplexity's primary snippet is the synthesis (no URL). Citations
      // are URL-only snippets with empty content — skip them here; they're
      // already covered by Firecrawl scrapes of the same URLs.
      const synthesis = finding.snippets.find((s) => !s.url && s.content.length > 0)
      if (synthesis) {
        blocks.push(truncate(synthesis.content, TRUNCATE_PERPLEXITY))
        blocks.push('')
      }
      const citationUrls = finding.snippets
        .filter((s) => s.url && s.content.length === 0)
        .slice(0, 5)
        .map((s) => s.url!)
      if (citationUrls.length > 0) {
        blocks.push('Citations:')
        for (const url of citationUrls) blocks.push(`- ${url}`)
        blocks.push('')
      }
    }
  }

  if (bySource.exa.length > 0) {
    blocks.push('## Semantic search (Exa)')
    blocks.push('')
    for (const finding of bySource.exa) {
      for (const snippet of finding.snippets.slice(0, 4)) {
        if (snippet.url) {
          blocks.push(`- **${snippet.title}** (${snippet.url})`)
        } else {
          blocks.push(`- **${snippet.title}**`)
        }
        if (snippet.content) {
          blocks.push(`  ${truncate(snippet.content, TRUNCATE_EXA_PER_SNIPPET)}`)
        }
      }
      blocks.push('')
    }
  }

  if (bySource.context7.length > 0) {
    blocks.push('## Library docs (Context7)')
    blocks.push('')
    for (const finding of bySource.context7) {
      for (const snippet of finding.snippets.slice(0, 3)) {
        blocks.push(`### ${snippet.title}`)
        if (snippet.url) blocks.push(`Source: ${snippet.url}`)
        blocks.push(truncate(snippet.content, TRUNCATE_CONTEXT7_PER_SNIPPET))
        blocks.push('')
      }
    }
  }

  return blocks.join('\n').trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}
