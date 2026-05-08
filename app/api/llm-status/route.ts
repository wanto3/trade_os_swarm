/**
 * /api/llm-status — quick health check on both LLM providers.
 *
 * Pings:
 *   1. Claude Code subprocess (Max sub) — small prompt, ~5-10s if working
 *   2. Groq HTTP API — small prompt, ~1-2s if working
 *
 * Returns availability + latency for each, plus a summary `primary` field
 * indicating which provider would be used right now. UI surfaces this as
 * a "fallback active" banner when Max sub is down.
 *
 * Use cases:
 *   - Verify GROQ_API_KEY is configured + works (one-time setup check)
 *   - Detect when Max subscription rate-limit hits → UI shows degraded mode
 *   - Manual debug when LLM responses look off
 *
 * Cost: 1 small Sonnet call + 1 small Groq call per status check.
 * Don't call this on every dashboard load — call from a "Check LLM"
 * button or manual debug only.
 */

import { NextResponse } from 'next/server'
import { callClaudeCode, ClaudeCodeRateLimitError } from '@/lib/services/claude-code-llm.service'

export const dynamic = 'force-dynamic'

const SMALL_PROMPT = 'Reply with EXACTLY this JSON and nothing else: {"ok":true}'

interface ProviderStatus {
  available: boolean
  latencyMs: number
  error?: string
  /** Tag for the specific failure mode so UI can show the right hint. */
  errorKind?: 'rate-limit' | 'auth' | 'config' | 'network' | 'parse' | 'other'
}

async function checkClaudeCode(): Promise<ProviderStatus> {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return { available: false, latencyMs: 0, error: 'Serverless environment — claude -p subprocess unavailable', errorKind: 'config' }
  }
  const start = Date.now()
  try {
    const result = await callClaudeCode<{ ok?: boolean }>({
      prompt: SMALL_PROMPT,
      model: 'claude-haiku-4-5',  // fastest / cheapest for status checks
      timeoutMs: 30_000,
    })
    const latencyMs = Date.now() - start
    if (result && typeof result === 'object' && result.ok === true) {
      return { available: true, latencyMs }
    }
    return { available: false, latencyMs, error: 'Returned but unexpected shape', errorKind: 'parse' }
  } catch (e) {
    const latencyMs = Date.now() - start
    const msg = e instanceof Error ? e.message : String(e)
    const safe = msg.replace(/sk-ant-oat01-[A-Za-z0-9_\-\s]+/g, 'sk-ant-oat01-***REDACTED***')
                    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/g, 'Bearer ***REDACTED***')
    let errorKind: ProviderStatus['errorKind'] = 'other'
    if (e instanceof ClaudeCodeRateLimitError) errorKind = 'rate-limit'
    else if (/auth|token|unauthorized|invalid_request/i.test(msg)) errorKind = 'auth'
    else if (/timeout|network|econnrefused|enotfound/i.test(msg)) errorKind = 'network'
    return { available: false, latencyMs, error: safe.slice(0, 300), errorKind }
  }
}

async function checkGroq(): Promise<ProviderStatus> {
  const apiKey = process.env.GROQ_API_KEY || ''
  if (!apiKey) {
    return { available: false, latencyMs: 0, error: 'GROQ_API_KEY env var not set', errorKind: 'config' }
  }
  const start = Date.now()
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 32,
        temperature: 0.0,
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON.' },
          { role: 'user', content: SMALL_PROMPT },
        ],
      }),
    })
    const latencyMs = Date.now() - start
    if (res.status === 429) {
      const body = (await res.text()).slice(0, 200)
      return { available: false, latencyMs, error: `429 rate-limited: ${body}`, errorKind: 'rate-limit' }
    }
    if (res.status === 401 || res.status === 403) {
      return { available: false, latencyMs, error: `${res.status} auth: invalid GROQ_API_KEY`, errorKind: 'auth' }
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200)
      return { available: false, latencyMs, error: `${res.status}: ${body}`, errorKind: 'other' }
    }
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    if (text.includes('"ok"') && text.includes('true')) {
      return { available: true, latencyMs }
    }
    return { available: false, latencyMs, error: `unexpected response: ${text.slice(0, 100)}`, errorKind: 'parse' }
  } catch (e) {
    const latencyMs = Date.now() - start
    const msg = e instanceof Error ? e.message : String(e)
    const safe = msg.replace(/gsk_[A-Za-z0-9]+/g, 'gsk_***REDACTED***')
    return { available: false, latencyMs, error: safe.slice(0, 300), errorKind: 'network' }
  }
}

export async function GET() {
  // Run both checks in parallel — total wallclock = max(claude_latency, groq_latency)
  // instead of sum(...). Status check should feel quick.
  const [claudeCode, groq] = await Promise.all([checkClaudeCode(), checkGroq()])

  // Determine which provider would be used right now per the same logic
  // baked into the LLM call sites (PRIMARY_LLM env override + serverless check).
  const FORCE_GROQ = process.env.PRIMARY_LLM === 'groq'
  let primary: 'claude-code' | 'groq' | 'none' = 'none'
  let mode: 'normal' | 'forced-groq' | 'fallback-active' | 'all-down' = 'normal'
  if (FORCE_GROQ) {
    primary = groq.available ? 'groq' : 'none'
    mode = groq.available ? 'forced-groq' : 'all-down'
  } else if (claudeCode.available) {
    primary = 'claude-code'
    mode = 'normal'
  } else if (groq.available) {
    primary = 'groq'
    mode = 'fallback-active'
  } else {
    primary = 'none'
    mode = 'all-down'
  }

  return NextResponse.json({
    success: true,
    timestamp: Date.now(),
    primary,
    mode,
    primaryLlmEnvOverride: FORCE_GROQ,
    providers: {
      'claude-code': claudeCode,
      groq,
    },
    hint: mode === 'all-down'
      ? 'Both providers down. Check CLAUDE_CODE_OAUTH_TOKEN and GROQ_API_KEY env vars on Render.'
      : mode === 'fallback-active'
        ? 'Max subscription unavailable, Groq fallback active. System will continue working but with Llama 3.3 70B instead of Sonnet/Opus.'
        : mode === 'forced-groq'
          ? 'PRIMARY_LLM=groq env override active. Remove that env var to use Max sub again.'
          : 'All systems normal — Max sub active.',
  })
}
