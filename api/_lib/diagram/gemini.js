// Gemini Nano Banana image generation client, lifted from
// image-generator/app/lib/gemini.ts:24-152 (2026-04-25, DD.A).
//
// Logic verbatim, with two adjustments for the prototype's environment:
//   1. ESM .js (no TypeScript) to match api/_lib/tools/*.js conventions.
//   2. Returns { ok, data?, error?, latencyMs } — the uniform shape used by
//      every other api/_lib adapter — instead of throwing on failure or
//      returning a raw base64 string. Lets the /api/diagram dispatch handler
//      respond consistently to the client.
//
// Models tried in order:
//   - gemini-3-pro-image-preview (Nano Banana Pro — primary, studio quality)
//   - gemini-2.5-flash-image     (Nano Banana — faster fallback)

const MODELS_TO_TRY = [
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
]

/**
 * Generate an architecture diagram image with Gemini.
 *
 * @param {string} prompt — the full image-generation prompt (system + scene).
 * @param {string} [aspectRatio='16:9'] — Gemini-supported aspect ratio.
 * @returns {Promise<{ ok: true, data: { base64: string, mimeType: string, model: string }, latencyMs: number } | { ok: false, error: string, latencyMs: number }>}
 */
export async function generateDiagramImage(prompt, aspectRatio = '16:9') {
  const start = Date.now()
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return {
      ok: false,
      error: 'GEMINI_API_KEY not configured',
      latencyMs: 0,
    }
  }

  let lastError = null

  for (const modelName of MODELS_TO_TRY) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`

      const requestBody = {
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio,
          },
        },
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(requestBody),
      })

      const result = await response.json()

      if (!response.ok) {
        const message = result?.error?.message ?? `HTTP ${response.status}`
        // Retriable: model not available — try the next one.
        if (
          result?.error?.code === 404 ||
          /not found|not supported|not available/i.test(message)
        ) {
          lastError = new Error(`${modelName}: ${message}`)
          continue
        }
        // Non-retriable (rate limit, content policy, auth, etc.) — bail out.
        return {
          ok: false,
          error: `${modelName}: ${message}`,
          latencyMs: Date.now() - start,
        }
      }

      const candidates = result?.candidates ?? []
      if (candidates.length === 0) {
        lastError = new Error(`${modelName}: no candidates returned`)
        continue
      }

      const parts = candidates[0]?.content?.parts ?? []
      const imagePart = parts.find((p) => p?.inlineData?.data)

      if (!imagePart) {
        // Some models emit text-only when they refuse — fall through.
        lastError = new Error(`${modelName}: returned no image part`)
        continue
      }

      return {
        ok: true,
        data: {
          base64: imagePart.inlineData.data,
          mimeType: imagePart.inlineData.mimeType ?? 'image/png',
          model: modelName,
        },
        latencyMs: Date.now() - start,
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      // Network / parse errors — try next model.
      continue
    }
  }

  return {
    ok: false,
    error: `All Gemini image models failed. Last error: ${lastError?.message ?? 'unknown'}`,
    latencyMs: Date.now() - start,
  }
}
