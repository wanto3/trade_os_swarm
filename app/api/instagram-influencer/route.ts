/**
 * /api/instagram-influencer — paste-or-scrape Instagram trader influencer feed.
 *
 * Mirrors the Discord influencer pattern (paste mode + bookmarklet) since
 * Instagram doesn't have a public read API for arbitrary profiles either.
 *
 * Two modes:
 *   1. PASTE MODE: user POSTs raw IG post text → Sonnet analyzes → batch
 *      stored on disk → returns structured trading signals.
 *   2. BOOKMARKLET MODE: companion JS bookmark scrapes visible posts from
 *      the user's logged-in instagram.com session and POSTs them here.
 *
 * Note: there's an older /api/instagram route that uses a local gstack
 * binary to scrape — that's local-dev only and pre-dates this LLM-analysis
 * pipeline. New flow is paste/bookmarklet driven, no server-side scraping.
 */

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { callClaudeCode } from '@/lib/services/claude-code-llm.service'

const INFLUENCER_NAME = process.env.INSTAGRAM_INFLUENCER_NAME || 'Trader Influencer'
const INFLUENCER_HANDLE = process.env.INSTAGRAM_INFLUENCER_HANDLE || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

const STORE_PATH = path.resolve(process.cwd(), 'data/instagram-influencer.json')

interface TradingAnalysis {
  signal: 'BUY' | 'HOLD' | 'SHORT' | 'NEUTRAL'
  confidence: 'high' | 'medium' | 'low'
  summary: string
  keyInsights: string[]
  priceTargets: { price: string; date?: string; type: string; confidence: string }[]
  keyDates: { date: string; event: string }[]
  sentiment: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high'
  mentionedAssets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[]
}

interface AnalyzedPostBatch {
  id: string
  source: 'paste' | 'bookmarklet'
  rawText: string
  postCount: number
  analysis: TradingAnalysis
  analyzedAt: number
}

interface InstagramStore {
  influencer: string
  handle: string
  batches: AnalyzedPostBatch[]
}

async function loadStore(): Promise<InstagramStore> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as InstagramStore
    if (parsed.batches && Array.isArray(parsed.batches)) return parsed
  } catch { /* file missing or corrupt */ }
  return { influencer: INFLUENCER_NAME, handle: INFLUENCER_HANDLE, batches: [] }
}

async function saveStore(store: InstagramStore): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2))
  } catch (e) {
    console.warn('[IG] Failed to save store:', e instanceof Error ? e.message : e)
  }
}

function buildPrompt(rawText: string, source: 'paste' | 'bookmarklet'): string {
  const sourceLabel = source === 'bookmarklet' ? "scraped from the user's logged-in browser session" : 'pasted by the user'
  const handleLabel = INFLUENCER_HANDLE ? `@${INFLUENCER_HANDLE}` : INFLUENCER_NAME
  return `You are a crypto trading analyst. Analyze the following Instagram posts (captions + hashtags) from trader influencer ${handleLabel}, ${sourceLabel}, and extract structured trading insights.

Return ONLY valid JSON (no markdown, no code fences) with EXACTLY these fields:
{
  "signal": "BUY" | "HOLD" | "SHORT" | "NEUTRAL",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence summary of the key trading thesis from these posts. Max 250 chars.",
  "keyInsights": ["Specific insight 1", ...],
  "priceTargets": [{"price": "$100K", "date": "Q2 2026", "type": "target", "confidence": "high"}, ...],
  "keyDates": [{"date": "Q2 2026", "event": "Phase 4 prediction"}],
  "sentiment": "bullish" | "bearish" | "neutral",
  "overallScore": 50,
  "riskLevel": "low" | "medium" | "high",
  "mentionedAssets": [{"name": "Bitcoin", "direction": "bullish"}, ...]
}

Rules — GROUND EVERY CLAIM in the actual posts below. Do NOT invent prices, dates, or signals not supported by the text. Empty arrays when no specifics. Instagram captions are often short and emoji-heavy — extract the trading signal from the text + hashtag context, ignoring emoji noise.

- signal: BUY if explicit long/buy entry, SHORT if explicit short/sell, HOLD if mixed, NEUTRAL if no trading content (lifestyle/motivational/promotional posts)
- confidence: "high" ONLY if specific price levels AND dates are present, "medium" if directional but vague, "low" otherwise
- summary: Direct about what ${handleLabel} actually says — quote-anchored, not generic
- keyInsights: 3-5 most important claims with actual numbers from the text
- priceTargets: ONLY dollar prices that appear in posts. Empty array if none.
- keyDates: ONLY dates explicitly mentioned. Empty array if none.
- overallScore: -100 (extremely bearish) to +100 (extremely bullish). Default to 0 if no clear signal.
- riskLevel: "low" if specific and grounded, "medium" if mixed, "high" if vague
- mentionedAssets: ONLY assets actually named (BTC, ETH, etc.) with direction from explicit context
- IMPORTANT: Instagram has lots of motivational/lifestyle content — return signal=NEUTRAL on non-trading posts rather than fabricating signals

INSTAGRAM POSTS:
${rawText.slice(0, 6000)}

Return the JSON object now:`
}

async function analyzeWithLLM(rawText: string, source: 'paste' | 'bookmarklet'): Promise<TradingAnalysis> {
  const prompt = buildPrompt(rawText, source)
  const errors: string[] = []
  const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

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

  if (GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
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
        } catch (e) { errors.push(`groq parse: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`) }
      }
    } catch (e) { errors.push(`groq: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`) }
  }

  console.warn('[IG] All LLM paths failed, returning neutral fallback. Errors:', errors)
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

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET() {
  try {
    const store = await loadStore()
    return NextResponse.json({
      success: true,
      influencer: store.influencer,
      handle: store.handle,
      batches: store.batches,
      latest: store.batches[0] || null,
      timestamp: Date.now(),
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

/** POST: paste OR bookmarklet body { text, source? }. Analyzes pasted IG
 *  content, stores result. Source defaults to 'paste'. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const text = String(body.text || '').trim()
    const source: 'paste' | 'bookmarklet' = body.source === 'bookmarklet' ? 'bookmarklet' : 'paste'
    if (text.length < 20) {
      return NextResponse.json({
        success: false,
        error: 'Text too short — paste at least 20 chars of recent IG content',
      }, { status: 400, headers: CORS_HEADERS })
    }
    if (text.length > 50_000) {
      return NextResponse.json({
        success: false,
        error: 'Text too long (50k char limit)',
      }, { status: 400, headers: CORS_HEADERS })
    }

    const analysis = await analyzeWithLLM(text, source)
    // Rough post count: count blocks separated by 2+ newlines or "..." separators
    const postCount = Math.max(1, text.split(/\n\s*\n|---+/).filter(s => s.trim().length > 10).length)

    const batch: AnalyzedPostBatch = {
      id: `${source}-${Date.now()}`,
      source,
      rawText: text.slice(0, 500),
      postCount,
      analysis,
      analyzedAt: Date.now(),
    }

    const store = await loadStore()
    store.batches.unshift(batch)
    store.batches = store.batches.slice(0, 20)
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
