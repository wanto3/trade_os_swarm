/**
 * LLM provider preference — runtime swap without a Render restart.
 *
 * The screening service has a built-in fallback chain controlled via
 * env vars (SCREENING_MODEL, PRIMARY_LLM). This service adds a
 * disk-backed override on top: the user can switch the preferred model
 * from the dashboard, and the next screening run picks it up. Useful
 * when the Max subscription is rate-limited and the user wants to
 * jump straight to Groq or Anthropic API without changing env vars
 * (which require a redeploy on Render).
 *
 * Storage: data/llm-preference.json. Wiped on Render redeploys but
 * the env-var SCREENING_MODEL fallback takes over until the user sets
 * it again from the UI.
 */

import { promises as fs } from 'fs'
import path from 'path'

const STORE_PATH = path.resolve(process.cwd(), 'data/llm-preference.json')

export type LLMPreference =
  | 'opus' | 'sonnet' | 'haiku'                                       // Max-sub subprocess
  | 'anthropic-opus' | 'anthropic-sonnet' | 'anthropic-haiku'         // Pay-per-token API
  | 'groq'                                                            // Free Groq Llama

interface StoredPreference {
  model: LLMPreference
  setAt: number
}

export async function loadPreferredModel(): Promise<LLMPreference | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as StoredPreference
    return parsed.model || null
  } catch {
    return null
  }
}

export async function savePreferredModel(model: LLMPreference): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
    await fs.writeFile(STORE_PATH, JSON.stringify({ model, setAt: Date.now() }, null, 2))
  } catch (e) {
    console.warn('[LLMPreference] save failed:', e instanceof Error ? e.message : e)
    throw e
  }
}

export async function clearPreferredModel(): Promise<void> {
  try {
    await fs.unlink(STORE_PATH)
  } catch {
    // missing file is fine
  }
}

/**
 * Surface which providers are actually usable on this server. The UI
 * grays out the ones not configured so users know why a tier isn't
 * available.
 */
export interface ProviderAvailability {
  maxSub: boolean
  anthropicApi: boolean
  groq: boolean
}

export function getProviderAvailability(): ProviderAvailability {
  const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  return {
    // Max sub (claude -p subprocess) is unavailable on serverless even
    // if OAuth would otherwise work — no claude binary on lambda.
    maxSub: !IS_SERVERLESS,
    anthropicApi: !!process.env.ANTHROPIC_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
  }
}
