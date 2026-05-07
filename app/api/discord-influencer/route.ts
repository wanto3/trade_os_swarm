/**
 * /api/discord-influencer — paste-or-poll Discord trader influencer feed.
 *
 * Two modes (auto-detected):
 *   1. PASTE MODE (works immediately, no Discord setup): user POSTs raw
 *      text from Discord channel → we run Sonnet analysis → store on disk
 *      → return structured signals.
 *   2. BOT POLL MODE (needs bot invited to Adalyn's server): if both
 *      DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID are set, GET also pulls
 *      the latest 50 messages from the channel and re-analyzes them.
 *
 * Mirrors the YouTube influencer route's contract: returns a TradingAnalysis
 * shape per message-batch so the UI can use the same rendering primitives.
 */

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { callClaudeCode } from '@/lib/services/claude-code-llm.service'

const INFLUENCER_NAME = 'Adalyn'
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || ''
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

const STORE_PATH = path.resolve(process.cwd(), 'data/discord-influencer.json')

interface TradingAnalysis {
  signal: 'BUY' | 'HOLD' | 'SHORT' | 'NEUTRAL'
  confidence: 'high' | 'medium' | 'low'
  summary: string
  keyInsights: string[]
  priceTargets: { price: string; date?: string; type: 'entry' | 'target' | 'stop' | 'support' | 'resistance'; confidence: 'high' | 'low' }[]
  keyDates: { date: string; event: string }[]
  sentiment: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high'
  mentionedAssets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[]
}

interface AnalyzedMessageBatch {
  id: string                 // hash or timestamp-based
  source: 'paste' | 'bot'
  rawText: string            // what was analyzed (preview only — first 500 chars stored)
  messageCount: number       // approximate count of messages in the batch
  analysis: TradingAnalysis
  analyzedAt: number         // unix ms
  /** Latest message timestamp the user/bot says was in the batch — optional */
  latestMessageAt?: number
}

interface DiscordStore {
  influencer: string
  batches: AnalyzedMessageBatch[]   // newest first, capped at 20
}

async function loadStore(): Promise<DiscordStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as DiscordStore
    if (parsed.batches && Array.isArray(parsed.batches)) return parsed
  } catch { /* file missing or corrupt — initialize fresh */ }
  return { influencer: INFLUENCER_NAME, batches: [] }
}

async function saveStore(store: DiscordStore): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2))
  } catch (e) {
    console.warn('[Discord] Failed to save store:', e instanceof Error ? e.message : e)
  }
}

// ─── LLM Analysis ────────────────────────────────────────────────────────────

function buildPrompt(rawText: string, source: 'paste' | 'bot'): string {
  const sourceLabel = source === 'bot' ? 'live Discord channel' : 'Discord messages pasted by the user'
  return `You are a crypto trading analyst. Analyze the following ${sourceLabel} from trader influencer "${INFLUENCER_NAME}" and extract structured trading insights.

Return ONLY valid JSON (no markdown, no code fences) with EXACTLY these fields:
{
  "signal": "BUY" | "HOLD" | "SHORT" | "NEUTRAL",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence summary of the key trading thesis from these messages. Max 250 chars.",
  "keyInsights": ["Specific insight 1", ...],
  "priceTargets": [{"price": "$100K", "date": "Q2 2026", "type": "target", "confidence": "high"}, ...],
  "keyDates": [{"date": "Q2 2026", "event": "Phase 4 prediction"}],
  "sentiment": "bullish" | "bearish" | "neutral",
  "overallScore": 50,
  "riskLevel": "low" | "medium" | "high",
  "mentionedAssets": [{"name": "Bitcoin", "direction": "bullish"}, ...]
}

Rules — GROUND EVERY CLAIM in the actual messages below. Do NOT invent prices, dates, or signals not supported by the text. Empty arrays when no specifics.

- signal: BUY if explicit long/buy entry mentioned, SHORT if explicit short/sell, HOLD if mixed, NEUTRAL if no trading content
- confidence: "high" ONLY if specific price levels AND dates are present, "medium" if directional but vague, "low" otherwise
- summary: Direct about what ${INFLUENCER_NAME} actually says — quote-anchored, not generic
- keyInsights: 3-5 most important claims with actual numbers from the text
- priceTargets: ONLY dollar prices that appear in messages. Empty array if none.
- keyDates: ONLY dates explicitly mentioned. Empty array if none.
- overallScore: -100 (extremely bearish) to +100 (extremely bullish). Default to 0 if no clear signal.
- riskLevel: "low" if specific and grounded, "medium" if mixed, "high" if vague
- mentionedAssets: ONLY assets actually named (BTC, ETH, etc.) with direction from explicit context

DISCORD MESSAGES:
${rawText.slice(0, 6000)}

Return the JSON object now:`
}

async function analyzeWithLLM(rawText: string, source: 'paste' | 'bot'): Promise<TradingAnalysis> {
  const prompt = buildPrompt(rawText, source)
  const errors: string[] = []

  // Detect serverless — go straight to Groq fallback
  const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  // 1. Claude Code subprocess (Max sub, primary)
  if (!IS_SERVERLESS) {
    try {
      const parsed = await callClaudeCode<unknown>({
        prompt,
        model: 'claude-sonnet-4-6',
        timeoutMs: 180_000,
      })
      const sanitized = sanitize(parsed)
      if (sanitized) return sanitized
      errors.push('claude-code returned but failed shape validation')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const safe = msg
        .replace(/sk-ant-oat01-[A-Za-z0-9_\-\s]+/g, 'sk-ant-oat01-***REDACTED***')
        .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/g, 'Bearer ***REDACTED***')
      errors.push(`claude-code: ${safe.slice(0, 200)}`)
    }
  }

  // 2. Groq fallback
  if (GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        method: 'POST',
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 2048,
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'You are a crypto trading analyst. Return ONLY valid JSON.' },
            { role: 'user', content: prompt }
          ]
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || ''
        const clean = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim()
        try {
          const parsed = JSON.parse(clean)
          const sanitized = sanitize(parsed)
          if (sanitized) return sanitized
        } catch (e) {
          errors.push(`groq parse: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`)
        }
      }
    } catch (e) {
      errors.push(`groq: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`)
    }
  }

  console.warn('[Discord] All LLM paths failed, returning neutral fallback. Errors:', errors)
  // Deterministic fallback — empty structured response so UI doesn't break
  return {
    signal: 'NEUTRAL',
    confidence: 'low',
    summary: '[Could not analyze — LLM unavailable. Errors: ' + errors.join('; ').slice(0, 200) + ']',
    keyInsights: [],
    priceTargets: [],
    keyDates: [],
    sentiment: 'neutral',
    overallScore: 0,
    riskLevel: 'high',
    mentionedAssets: [],
  }
}

function sanitize(raw: unknown): TradingAnalysis | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const validSignals = ['BUY', 'HOLD', 'SHORT', 'NEUTRAL']
  const validConf = ['high', 'medium', 'low']
  const validSent = ['bullish', 'bearish', 'neutral']
  const validRisk = ['low', 'medium', 'high']
  return {
    signal: validSignals.includes(r.signal as string) ? r.signal as TradingAnalysis['signal'] : 'NEUTRAL',
    confidence: validConf.includes(r.confidence as string) ? r.confidence as TradingAnalysis['confidence'] : 'low',
    summary: typeof r.summary === 'string' ? r.summary.slice(0, 300) : '',
    keyInsights: Array.isArray(r.keyInsights) ? r.keyInsights.slice(0, 5).map((s: any) => String(s).slice(0, 250)) : [],
    priceTargets: Array.isArray(r.priceTargets) ? r.priceTargets.slice(0, 8).filter((p: any) => p && typeof p === 'object') : [],
    keyDates: Array.isArray(r.keyDates) ? r.keyDates.slice(0, 6).filter((d: any) => d && typeof d === 'object') : [],
    sentiment: validSent.includes(r.sentiment as string) ? r.sentiment as TradingAnalysis['sentiment'] : 'neutral',
    overallScore: typeof r.overallScore === 'number' ? Math.max(-100, Math.min(100, r.overallScore)) : 0,
    riskLevel: validRisk.includes(r.riskLevel as string) ? r.riskLevel as TradingAnalysis['riskLevel'] : 'medium',
    mentionedAssets: Array.isArray(r.mentionedAssets) ? r.mentionedAssets.slice(0, 8).filter((a: any) => a && typeof a === 'object') : [],
  }
}

// ─── Discord Bot Mode (optional, future) ────────────────────────────────────

interface DiscordMessage {
  id: string
  content: string
  timestamp: string
  author?: { username?: string }
}

async function fetchLatestDiscordMessages(): Promise<{ messages: DiscordMessage[]; error?: string }> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
    return { messages: [], error: 'Bot mode not configured (DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID env vars missing)' }
  }
  try {
    const res = await fetch(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages?limit=50`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
    )
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      return { messages: [], error: `Discord API ${res.status}: ${body}` }
    }
    const messages = await res.json() as DiscordMessage[]
    return { messages }
  } catch (e) {
    return { messages: [], error: e instanceof Error ? e.message.slice(0, 200) : 'unknown' }
  }
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

// CORS for the browser-bookmarklet flow. The bookmarklet runs in the user's
// Discord tab (origin: discord.com) and POSTs scraped messages here. Allow
// credentials=false since we don't need cookies for paste-mode.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** GET: returns the latest analyzed batches. If bot mode is configured AND
 *  ?refresh=1 is set, also pulls fresh messages and analyzes them. */
export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get('refresh') === '1'
    const store = await loadStore()
    const botMode = !!(DISCORD_BOT_TOKEN && DISCORD_CHANNEL_ID)

    // Auto-poll bot mode on refresh
    if (botMode && refresh) {
      const fetched = await fetchLatestDiscordMessages()
      if (fetched.messages.length > 0) {
        const text = fetched.messages
          .reverse()  // chronological order
          .map(m => `[${m.timestamp}] ${m.author?.username || '?'}: ${m.content}`)
          .join('\n')
        const analysis = await analyzeWithLLM(text, 'bot')
        const batch: AnalyzedMessageBatch = {
          id: `bot-${Date.now()}`,
          source: 'bot',
          rawText: text.slice(0, 500),
          messageCount: fetched.messages.length,
          analysis,
          analyzedAt: Date.now(),
          latestMessageAt: fetched.messages[fetched.messages.length - 1]?.timestamp
            ? new Date(fetched.messages[fetched.messages.length - 1].timestamp).getTime()
            : undefined,
        }
        store.batches.unshift(batch)
        store.batches = store.batches.slice(0, 20)
        await saveStore(store)
      }
    }

    return NextResponse.json({
      success: true,
      influencer: store.influencer,
      batches: store.batches,
      latest: store.batches[0] || null,
      botMode,
      timestamp: Date.now(),
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

/** POST: paste mode. Body: { text: string }. Analyzes the pasted Discord
 *  text and stores the result. Returns the new batch. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const text = String(body.text || '').trim()
    if (text.length < 20) {
      return NextResponse.json({
        success: false,
        error: 'Message text too short — paste at least 20 chars of recent Discord activity',
      }, { status: 400 })
    }
    if (text.length > 50_000) {
      return NextResponse.json({
        success: false,
        error: 'Pasted text too long (50k char limit)',
      }, { status: 400 })
    }

    const analysis = await analyzeWithLLM(text, 'paste')
    const messageCount = (text.match(/\n/g) || []).length + 1  // rough estimate

    const batch: AnalyzedMessageBatch = {
      id: `paste-${Date.now()}`,
      source: 'paste',
      rawText: text.slice(0, 500),  // preview only
      messageCount,
      analysis,
      analyzedAt: Date.now(),
    }

    const store = await loadStore()
    store.batches.unshift(batch)
    store.batches = store.batches.slice(0, 20)  // keep last 20
    await saveStore(store)

    return NextResponse.json({
      success: true,
      batch,
      totalBatches: store.batches.length,
    }, { headers: CORS_HEADERS })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500, headers: CORS_HEADERS })
  }
}

/** DELETE: clear all analyzed batches. Useful when starting fresh.
 *  Optional ?id=<batchId> deletes a specific batch. */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    const store = await loadStore()
    if (id) {
      store.batches = store.batches.filter(b => b.id !== id)
    } else {
      store.batches = []
    }
    await saveStore(store)
    return NextResponse.json({ success: true, remaining: store.batches.length })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
