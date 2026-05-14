/**
 * Direct Anthropic API provider — the natural fallback when the Max
 * subscription's claude-code subprocess path goes away (sub expires,
 * Render IP gets blocked from OAuth, etc.).
 *
 * Activated by setting ANTHROPIC_API_KEY in the env. When set, the
 * screening pipeline can include 'anthropic' in its provider chain
 * and it gets used like any other tier. Pricing: pay-per-token, so
 * the user explicitly opts in by adding the key — there's no risk of
 * accidental charges.
 *
 * Mirrors the callClaudeCode() interface exactly so the screening
 * service can swap between the two paths without changing call sites.
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_API_VERSION = '2023-06-01'

export type AnthropicModel =
  | 'claude-opus-4-7'
  | 'claude-sonnet-4-6'
  | 'claude-haiku-4-5'

interface AnthropicCallOptions {
  prompt: string
  model: AnthropicModel
  timeoutMs?: number
  systemPrompt?: string
  maxTokens?: number
}

export class AnthropicAPIRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnthropicAPIRateLimitError'
  }
}

const DEFAULT_SYSTEM_PROMPT =
  'You are a JSON-only responder. Reply with a single valid JSON object that matches the schema implied by the user prompt. No prose, no markdown fences, no explanation outside the JSON.'

/**
 * Strip the markdown fence wrap that some models add around JSON.
 */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

/**
 * Returns true when the Anthropic API key is set on the server — the
 * screening service uses this as a feature flag to decide whether to
 * include the 'anthropic' tier in its fallback chain.
 */
export function isAnthropicAPIAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function callAnthropicAPI<T = unknown>(opts: AnthropicCallOptions): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY env var not set — Anthropic API path unavailable')
  }
  const timeoutMs = opts.timeoutMs ?? 120_000
  const systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  const maxTokens = opts.maxTokens ?? 4096

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: opts.prompt }],
      }),
      signal: ac.signal,
    })

    if (res.status === 429) {
      const body = (await res.text()).slice(0, 200)
      throw new AnthropicAPIRateLimitError(`Anthropic API rate-limited: ${body}`)
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 400)
      throw new Error(`Anthropic API ${res.status}: ${body}`)
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>
      stop_reason?: string
    }
    const textBlock = (data.content || []).find(b => b.type === 'text')
    const raw = textBlock?.text || ''
    if (!raw) {
      throw new Error(`Anthropic API returned no text content (stop_reason=${data.stop_reason})`)
    }

    const cleaned = stripMarkdownFences(raw)
    try {
      return JSON.parse(cleaned) as T
    } catch (e) {
      throw new Error(`Anthropic API JSON parse failed: ${e instanceof Error ? e.message.slice(0, 150) : 'unknown'} — preview: ${cleaned.slice(0, 200)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}
