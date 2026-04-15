import { runExa } from './tools/exa.js'
import { runPerplexity } from './tools/perplexity.js'
import { runFirecrawl } from './tools/firecrawl.js'

export async function runResearch(prompt, opts = {}) {
  const { mode = 'full' } = opts

  if (mode === 'exa-only') {
    const exa = await runExa(prompt)
    return {
      mode,
      prompt,
      exa,
      perplexity: { ok: false, error: 'skipped (exa-only mode)', latencyMs: 0 },
      firecrawl: { ok: false, error: 'skipped (exa-only mode)', latencyMs: 0 },
      errors: exa.ok ? [] : [{ tool: 'exa', error: exa.error }],
    }
  }

  const started = Date.now()
  const settled = await Promise.allSettled([
    runExa(prompt),
    runPerplexity(prompt),
    runFirecrawl(prompt),
  ])

  const [exaRes, pplxRes, fcRes] = settled
  const exa = exaRes.status === 'fulfilled' ? exaRes.value : { ok: false, error: String(exaRes.reason), latencyMs: 0 }
  const perplexity = pplxRes.status === 'fulfilled' ? pplxRes.value : { ok: false, error: String(pplxRes.reason), latencyMs: 0 }
  const firecrawl = fcRes.status === 'fulfilled' ? fcRes.value : { ok: false, error: String(fcRes.reason), latencyMs: 0 }

  const errors = []
  if (!exa.ok) errors.push({ tool: 'exa', error: exa.error })
  if (!perplexity.ok) errors.push({ tool: 'perplexity', error: perplexity.error })
  if (!firecrawl.ok) errors.push({ tool: 'firecrawl', error: firecrawl.error })

  return {
    mode,
    prompt,
    totalLatencyMs: Date.now() - started,
    exa,
    perplexity,
    firecrawl,
    errors,
  }
}
