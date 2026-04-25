// Context7 adapter — DP1.5.C.
//
// Context7 (https://context7.com) provides live library/API documentation
// via REST. The contract is: given a library identifier or a free-text
// query mentioning a library, return current docs snippets (method
// signatures, usage examples, release notes).
//
// As of DP1.5.C the REST API is not fully public and we don't have a
// client library, so this adapter gracefully fails with a clear reason
// when CONTEXT7_API_KEY is absent. When keys are provisioned, the TODO
// block at the bottom is where the actual API call goes. Per the plan's
// "flag, don't block" pragma, this is ship-able as-is: the orchestrator
// treats a failed finding as absence, not an error.

export async function runContext7(query) {
  const start = Date.now()
  const apiKey = process.env.CONTEXT7_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: 'CONTEXT7_API_KEY not configured (adapter stubbed — see api/_lib/tools/context7.js TODO)',
      latencyMs: 0,
    }
  }

  if (typeof query !== 'string' || query.length === 0) {
    return { ok: false, error: 'query must be a non-empty string', latencyMs: 0 }
  }

  try {
    // TODO(DP1.5.C follow-up): wire actual Context7 REST call.
    //
    // Expected shape (two-step flow, per Context7's MCP spec):
    //   1. resolve-library-id: map free-text "React hooks" → "/react/docs"
    //   2. query-docs: fetch current docs snippets for that library id
    //
    // Until the REST surface is confirmed we return ok:false with a note so
    // the orchestrator doesn't block the entire research pipeline on a
    // missing tool.
    return {
      ok: false,
      error: 'Context7 REST surface not yet wired — adapter stub in place',
      latencyMs: Date.now() - start,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    }
  }
}
