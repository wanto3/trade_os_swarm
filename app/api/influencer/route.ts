import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { callClaudeCode, ClaudeCodeRateLimitError } from '@/lib/services/claude-code-llm.service'

// Channel is configurable via env vars so you can swap influencers without
// a code change. Defaults to ElcaroTrade for backward compat. The handle is
// purely cosmetic (shown in UI); the channel ID is what YouTube needs.
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCsT-PrX_ZgxXngz7kZsKJTw'
const CHANNEL_HANDLE = process.env.YOUTUBE_CHANNEL_HANDLE || 'ElcaroTrade'
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

// ─── Transcript fetching (no auth, no third-party deps) ───────────────────
// The original prompt only gave the LLM the video TITLE + chapter list +
// first 2500 chars of description. Influencer videos describe trading ideas
// in the SPOKEN content — exact prices, exact dates, quoted reasoning. None
// of that reached the model, so summaries were generic and dropped specifics
// the user heard repeated multiple times on-screen.
//
// Fix: scrape the watch page for the captionTracks URL embedded in
// `ytInitialPlayerResponse`, fetch the JSON3 transcript, concatenate with
// inline `[m:ss]` markers every 30 seconds for grounding. Transcripts are
// immutable per videoId so we cache to disk forever (a re-uploaded edit
// would get a new videoId from YouTube).
const TRANSCRIPT_CACHE_PATH = path.join(process.cwd(), 'data', 'youtube-transcript-cache.json')
const TRANSCRIPT_MAX_CHARS = 14000  // ~3500 tokens — covers ~45 min audio
interface CachedTranscript { text: string; fetchedAt: number; lang: string; truncated?: boolean }
let transcriptCache: Map<string, CachedTranscript> = new Map()

function loadTranscriptCache(): void {
  try {
    if (!fs.existsSync(TRANSCRIPT_CACHE_PATH)) return
    const raw = fs.readFileSync(TRANSCRIPT_CACHE_PATH, 'utf-8')
    const obj = JSON.parse(raw) as Record<string, CachedTranscript>
    transcriptCache = new Map(Object.entries(obj))
    console.log(`[Transcript] Loaded cache (${transcriptCache.size} videos)`)
  } catch (e) {
    console.warn('[Transcript] cache load failed:', e instanceof Error ? e.message : e)
  }
}

function saveTranscriptCache(): void {
  try {
    const dir = path.dirname(TRANSCRIPT_CACHE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const obj = Object.fromEntries(transcriptCache.entries())
    fs.writeFileSync(TRANSCRIPT_CACHE_PATH, JSON.stringify(obj))
  } catch (e) {
    console.warn('[Transcript] cache save failed:', e instanceof Error ? e.message : e)
  }
}

loadTranscriptCache()

/**
 * Fetch a YouTube video's transcript using the unofficial-but-public
 * timedtext endpoint. Returns empty string on any failure (transcript
 * unavailable, no captions, network error) so the downstream prompt
 * gracefully falls back to title+description.
 *
 * Cached forever per videoId — transcripts are immutable.
 */
async function fetchTranscript(videoId: string): Promise<string> {
  const cached = transcriptCache.get(videoId)
  if (cached) return cached.text

  try {
    // Step 1: fetch the watch page HTML. Server-side fetch from a desktop
    // UA — YouTube returns the same HTML it serves browsers.
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const res = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      console.warn(`[Transcript] watch page ${videoId} returned ${res.status}`)
      return ''
    }
    const html = await res.text()

    // Step 2: pull captionTracks out of the embedded player response. The
    // shape is `"captionTracks":[{"baseUrl":"...","languageCode":"en",...}]`.
    const match = html.match(/"captionTracks":(\[.*?\])/)
    if (!match) {
      // No captions surfaced — could be a private/age-gated video or one
      // where the creator disabled captions. Cache the empty string so we
      // don't retry every dashboard refresh.
      transcriptCache.set(videoId, { text: '', fetchedAt: Date.now(), lang: 'none' })
      saveTranscriptCache()
      return ''
    }

    let tracks: Array<{ baseUrl: string; languageCode?: string; kind?: string }>
    try {
      // YouTube's embedded JSON sometimes contains escape sequences like &
      const cleaned = match[1].replace(/\\u0026/g, '&')
      tracks = JSON.parse(cleaned)
    } catch (e) {
      console.warn(`[Transcript] captionTracks parse failed for ${videoId}:`, e instanceof Error ? e.message : e)
      return ''
    }

    // Prefer manual English captions (kind != 'asr'); fall back to
    // auto-generated English; final fallback is the first available track
    // (some channels only have non-English manual captions).
    const en = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr')
      || tracks.find(t => t.languageCode === 'en')
      || tracks[0]
    if (!en?.baseUrl) return ''

    // Step 3: fetch json3 transcript (cleaner than xml/srv3 formats)
    const transcriptUrl = en.baseUrl + (en.baseUrl.includes('fmt=') ? '' : '&fmt=json3')
    const tres = await fetch(transcriptUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!tres.ok) {
      console.warn(`[Transcript] json3 ${videoId} returned ${tres.status}`)
      return ''
    }
    const tdata = await tres.json() as {
      events?: Array<{ segs?: Array<{ utf8?: string }>; tStartMs?: number }>
    }

    // Step 4: concatenate text segments, inserting `[m:ss]` markers every
    // ~30 seconds so the LLM can cite timestamps when extracting quotes.
    const events = tdata.events || []
    const parts: string[] = []
    let lastMarker = -30_000
    for (const ev of events) {
      const t = ev.tStartMs ?? 0
      const text = (ev.segs || []).map(s => s.utf8 || '').join('').trim()
      if (!text) continue
      if (t - lastMarker >= 30_000) {
        const min = Math.floor(t / 60_000)
        const sec = Math.floor((t % 60_000) / 1000).toString().padStart(2, '0')
        parts.push(`\n[${min}:${sec}] `)
        lastMarker = t
      }
      parts.push(text + ' ')
    }

    let fullText = parts.join('').replace(/\s+\n/g, '\n').trim()
    let truncated = false
    if (fullText.length > TRANSCRIPT_MAX_CHARS) {
      fullText = fullText.slice(0, TRANSCRIPT_MAX_CHARS) + '\n[...transcript truncated]'
      truncated = true
    }

    transcriptCache.set(videoId, {
      text: fullText,
      fetchedAt: Date.now(),
      lang: en.languageCode || 'en',
      truncated,
    })
    saveTranscriptCache()
    return fullText
  } catch (e) {
    console.warn(`[Transcript] ${videoId} failed:`, e instanceof Error ? e.message : e)
    return ''
  }
}

// In-memory cache (per-process). YouTube videos + LLM analysis are expensive
// (~30-60s per uncached call) and the data doesn't change often — new videos
// drop a few times a week. 1h TTL is plenty for a daily-trading flow, and
// the dashboard's explicit ?refresh=1 query param bypasses the cache when
// the user wants the latest videos right now.
let cachedAnalysis: { data: unknown; ts: number } | null = null
const CACHE_TTL_MS = 60 * 60_000  // 1 hour

interface TradingAnalysis {
  signal: 'BUY' | 'HOLD' | 'SHORT' | 'NEUTRAL'
  confidence: 'high' | 'medium' | 'low'
  summary: string
  keyInsights: string[]
  // `quote` is the verbatim transcript phrase that supports this target —
  // makes the price/date traceable so the user can verify against the video
  // instead of trusting the LLM didn't hallucinate.
  priceTargets: { price: string; date?: string; type: 'entry' | 'target' | 'stop' | 'support' | 'resistance'; confidence: 'high' | 'low'; quote?: string; timestamp?: string }[]
  keyDates: { date: string; event: string; quote?: string; timestamp?: string }[]
  sentiment: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high'
  mentionedAssets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[]
  watchMinutes: { minute: string; topic: string }[]
  // Indicates whether the analysis was grounded in the actual video transcript
  // (true) or just title/description (false). UI surfaces this so the user
  // knows whether to trust the specifics.
  transcriptUsed?: boolean
}

interface VideoForAnalysis {
  videoId: string
  title: string
  description: string
  // Verbatim spoken content with [m:ss] timestamp markers every ~30s.
  // Empty string if captions unavailable (rare; most videos have auto-gen).
  transcript: string
  timestamps: { time: string; label: string; seconds: number }[]
  viewCount: number
}

/**
 * Build ONE prompt that asks the LLM to analyze ALL videos in one call.
 * Replaces the previous per-video prompt+call pattern (5 calls per dashboard
 * visit). Sub-call cost: ~1 Opus invocation per dashboard load instead of 5,
 * matching the user's "only burn Opus on dashboard visits" subscription rule.
 */
function buildBatchPrompt(videos: VideoForAnalysis[]): string {
  const videoBlocks = videos.map((v, i) => {
    const chapters = v.timestamps.slice(0, 10).map(t => `  [${t.time}] ${t.label}`).join('\n')
    const descSnip = v.description.slice(0, 1500)
    const viewStr = v.viewCount > 0 ? `${(v.viewCount / 1000).toFixed(0)}K views` : ''
    // Transcript is the PRIMARY source — descriptions are usually generic
    // affiliate-link blobs. If transcript is missing (rare), we fall back
    // to chapters + description.
    const transcriptBlock = v.transcript
      ? `TRANSCRIPT (verbatim — what the influencer ACTUALLY SAID. Quote from this. Timestamps in [m:ss] format every ~30s):
${v.transcript}`
      : 'TRANSCRIPT: (unavailable — analyze title/chapters/description only and mark confidence=low)'
    return `=== VIDEO ${i + 1} (id: ${v.videoId}) ===
TITLE: ${v.title}
${viewStr ? `VIEWS: ${viewStr}\n` : ''}CHAPTERS:
${chapters || '  (no chapters)'}
DESCRIPTION (first 1500 chars only — usually generic boilerplate, NOT your primary source):
${descSnip}

${transcriptBlock}`
  }).join('\n\n')

  return `You are a crypto trading analyst extracting structured insights from YouTube influencer videos. Your job: capture EVERY specific price target and date the influencer mentions, with verbatim quotes for traceability.

Return ONLY a valid JSON ARRAY (no markdown, no code fences) with EXACTLY ${videos.length} entries — one per video, in the same order. Shape:
{
  "videoId": "<id from VIDEO header>",
  "signal": "BUY" | "HOLD" | "SHORT" | "NEUTRAL",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence summary of the key trading thesis. Max 250 chars. Quote the influencer where useful. Lead with the most actionable specific (target/date/level), not generic 'bullish on BTC'.",
  "keyInsights": ["Specific quoted claim 1 with numbers", "Specific quoted claim 2 with numbers", ...],
  "priceTargets": [
    {"price": "$130K", "date": "December 2026", "type": "target", "confidence": "high", "quote": "I think we hit one-thirty by end of December", "timestamp": "12:45"},
    ...
  ],
  "keyDates": [
    {"date": "Q1 2027", "event": "Cycle top", "quote": "the top of this cycle lands in Q1 twenty-twenty-seven", "timestamp": "8:30"},
    ...
  ],
  "sentiment": "bullish" | "bearish" | "neutral",
  "overallScore": 50,
  "riskLevel": "low" | "medium" | "high",
  "mentionedAssets": [{"name": "Bitcoin", "direction": "bullish"}, ...],
  "watchMinutes": [{"minute": "2:36", "topic": "Bitcoin target discussion"}, ...],
  "transcriptUsed": true
}

═══════════════════════════════════════════════════════════════════
PRIMARY DIRECTIVE — EXHAUSTIVE EXTRACTION FROM THE TRANSCRIPT
═══════════════════════════════════════════════════════════════════

The user has watched these videos and confirms the influencer repeats SPECIFIC prices and SPECIFIC dates multiple times. Past summaries dropped those entirely — that's the bug we're fixing.

For each video with a transcript:

1. **priceTargets — capture EVERY dollar amount mentioned**, including:
   - Specific numbers: "$130k", "126 thousand", "one hundred and fifty", "thirty-cent altcoin"
   - Ranges: "between $100k and $120k" → emit BOTH endpoints as separate targets
   - Repeated mentions: if a price comes up 3+ times across the video, that's the influencer's CONVICTION level — mark confidence="high" and include the strongest quote
   - Quote the EXACT phrase from the transcript (10-30 words) so the user can ctrl-F it in the video
   - Include the [m:ss] timestamp from the transcript where each price was said (use the marker immediately preceding the quote)

2. **keyDates — capture EVERY date or timeframe mentioned**, including:
   - Calendar: "December 2026", "end of Q1", "by Christmas", "September 8th"
   - Relative: "in two weeks", "before halving", "after the next FOMC"
   - Phase/cycle: "Phase 4 of the cycle", "this bull cycle top", "next leg up"
   - For each, capture WHAT EVENT the date is tied to (target hit, support break, cycle top, etc.)
   - Quote the verbatim phrase. Include the [m:ss] timestamp.

3. **summary — must lead with the most specific actionable thesis.**
   GOOD: "BTC to $130K by Dec '26, sees $108K support — accumulate dips."
   BAD: "Bitcoin analysis, bullish thesis discussed."

4. **keyInsights — 3-5 most important claims with QUOTED NUMBERS.**
   Each insight should be specific enough that a reader who didn't watch the video knows exactly what was said. Prefer "Sees BTC tagging $109K then pulling back to $95K before next leg" over "discusses BTC price action."

═══════════════════════════════════════════════════════════════════
QUALITY RULES
═══════════════════════════════════════════════════════════════════

- GROUND EVERY CLAIM in the transcript (or chapters/description if no transcript). Do NOT invent prices, dates, or quotes. The "quote" field MUST appear verbatim in the source.
- signal: BUY if directional bullish thesis with entry levels explicitly mentioned, SHORT if directional bearish with exit/short levels, HOLD if mixed/unclear, NEUTRAL if no trading content (educational, off-topic, weather, etc.)
- confidence: "high" ONLY if multiple specific prices AND dates appear in the TRANSCRIPT and the directional call is unambiguous. "medium" if the directional thesis is clear but timeframes are vague. "low" if the analysis came from title/description only (no transcript available) or specifics are missing.
- transcriptUsed: true if a transcript was provided in the VIDEO block above, false otherwise. This is a self-reporting flag — set it honestly.
- overallScore: -100 (extremely bearish) to +100 (extremely bullish). Anchor on the strength of the influencer's directional claims and the count of specific targets supporting that direction. 0 if neutral / NEUTRAL signal.
- riskLevel: "low" if claims are specific and quoted, "medium" if directionally clear but vague on specifics, "high" if mostly vibes.
- mentionedAssets: ONLY assets actually named (BTC, ETH, SOL, XRP, gold, oil, S&P, silver). Direction from explicit context in the transcript.
- watchMinutes: 3-5 key timestamps from the transcript where the most important calls are made — pick ones tied to a priceTarget or keyDate so the user can jump straight to them.

VIDEOS TO ANALYZE:
${videoBlocks}

Return the JSON array now (${videos.length} entries, in order, ONE LINE per nested object is fine):`
}

/**
 * Run batched analysis through Claude Code subprocess (Max-sub, no API
 * key burn) with Groq HTTP fallback only if claude -p fails entirely.
 * Mirrors the polymarket-screening fallback pattern.
 */
async function analyzeBatch(videos: VideoForAnalysis[]): Promise<Map<string, TradingAnalysis>> {
  const results = new Map<string, TradingAnalysis>()
  if (videos.length === 0) return results

  const prompt = buildBatchPrompt(videos)
  const errors: string[] = []

  // Detect serverless (Vercel, AWS Lambda) where claude -p subprocess is
  // unavailable — go straight to Groq. PRIMARY_LLM=groq env override
  // forces Groq-first, useful when Max sub has run out for the month.
  const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  const FORCE_GROQ = process.env.PRIMARY_LLM === 'groq'

  // 1. Claude Code subprocess (Max sub, primary path)
  if (!IS_SERVERLESS && !FORCE_GROQ) {
    try {
      const parsed = await callClaudeCode<unknown>({
        prompt,
        // Sonnet 4.6 — faster than Opus and plenty smart for content
        // summarization. Trading-decision picks still go through Opus
        // in polymarket-screening; this is just describe-the-content work.
        model: 'claude-sonnet-4-6',
        timeoutMs: 240_000,  // 4 min — generous for batched analysis
      })
      const arr = normalizeArray(parsed)
      for (const a of arr) {
        if (a && typeof a === 'object' && a.videoId) {
          results.set(a.videoId as string, sanitize(a))
        }
      }
      if (results.size > 0) return results
      errors.push('Claude subprocess returned but no entries matched videoIds')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Redact any Bearer/OAuth tokens before logging
      const safe = msg
        .replace(/sk-ant-oat01-[A-Za-z0-9_\-\s]+/g, 'sk-ant-oat01-***REDACTED***')
        .replace(/sk-ant-api[0-9]+-[A-Za-z0-9_\-\s]+/g, 'sk-ant-api***REDACTED***')
        .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/g, 'Bearer ***REDACTED***')
      console.warn('[Influencer] claude-code subprocess failed:', safe.slice(0, 300))
      errors.push(`claude-code: ${safe.slice(0, 200)}`)
      if (e instanceof ClaudeCodeRateLimitError) {
        // Rate-limited — fall through to Groq
      }
    }
  }

  // 2. Groq fallback (HTTP, free tier)
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
          max_tokens: 4096,
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'You are a crypto trading analyst. Return ONLY a valid JSON array.' },
            { role: 'user', content: prompt }
          ]
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || ''
        const clean = stripFences(text)
        try {
          const parsed = JSON.parse(clean)
          const arr = normalizeArray(parsed)
          for (const a of arr) {
            if (a && typeof a === 'object' && a.videoId) {
              results.set(a.videoId as string, sanitize(a))
            }
          }
          if (results.size > 0) return results
        } catch (e) {
          errors.push(`groq parse: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`)
        }
      } else {
        const body = (await res.text()).slice(0, 200)
        errors.push(`groq ${res.status}: ${body}`)
      }
    } catch (e) {
      errors.push(`groq: ${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}`)
    }
  }

  console.warn('[Influencer] All LLM paths failed, using fallback. Errors:', errors)
  // Build deterministic fallback from descriptions only — no LLM
  for (const v of videos) {
    results.set(v.videoId, buildFallbackAnalysis(v.title, v.description))
  }
  return results
}

function stripFences(text: string): string {
  return text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim()
}

/** Coerce parsed JSON to an array of analysis objects. Handles common
 *  LLM mishaps: array-shaped, single-object-with-`results`-key, etc. */
function normalizeArray(parsed: unknown): any[] {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.results)) return obj.results
    if (Array.isArray(obj.videos)) return obj.videos
    if (Array.isArray(obj.analyses)) return obj.analyses
  }
  return []
}

/** Validate + clean up an LLM-returned analysis object so downstream
 *  code can rely on shape. Missing fields get safe defaults. Preserves
 *  the optional `quote`/`timestamp` evidence fields so the UI can show
 *  the verbatim phrase the LLM extracted each target/date from. */
function sanitize(raw: any): TradingAnalysis {
  const validSignals = ['BUY', 'HOLD', 'SHORT', 'NEUTRAL']
  const validConf = ['high', 'medium', 'low']
  const validSent = ['bullish', 'bearish', 'neutral']
  const validRisk = ['low', 'medium', 'high']
  const validTargetType = ['entry', 'target', 'stop', 'support', 'resistance']
  return {
    signal: validSignals.includes(raw.signal) ? raw.signal : 'NEUTRAL',
    confidence: validConf.includes(raw.confidence) ? raw.confidence : 'low',
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : '',
    keyInsights: Array.isArray(raw.keyInsights) ? raw.keyInsights.slice(0, 5).map((s: any) => String(s).slice(0, 250)) : [],
    priceTargets: Array.isArray(raw.priceTargets)
      ? raw.priceTargets
          .slice(0, 12)
          .filter((p: any) => p && typeof p === 'object' && typeof p.price === 'string')
          .map((p: any) => ({
            price: String(p.price).slice(0, 30),
            date: p.date ? String(p.date).slice(0, 40) : undefined,
            type: validTargetType.includes(p.type) ? p.type : 'target',
            confidence: p.confidence === 'high' ? 'high' : 'low',
            quote: p.quote ? String(p.quote).slice(0, 240) : undefined,
            timestamp: p.timestamp ? String(p.timestamp).slice(0, 12) : undefined,
          }))
      : [],
    keyDates: Array.isArray(raw.keyDates)
      ? raw.keyDates
          .slice(0, 10)
          .filter((d: any) => d && typeof d === 'object' && typeof d.date === 'string')
          .map((d: any) => ({
            date: String(d.date).slice(0, 50),
            event: typeof d.event === 'string' ? d.event.slice(0, 120) : '',
            quote: d.quote ? String(d.quote).slice(0, 240) : undefined,
            timestamp: d.timestamp ? String(d.timestamp).slice(0, 12) : undefined,
          }))
      : [],
    sentiment: validSent.includes(raw.sentiment) ? raw.sentiment : 'neutral',
    overallScore: typeof raw.overallScore === 'number' ? Math.max(-100, Math.min(100, raw.overallScore)) : 0,
    riskLevel: validRisk.includes(raw.riskLevel) ? raw.riskLevel : 'medium',
    mentionedAssets: Array.isArray(raw.mentionedAssets) ? raw.mentionedAssets.slice(0, 8).filter((a: any) => a && typeof a === 'object') : [],
    watchMinutes: Array.isArray(raw.watchMinutes) ? raw.watchMinutes.slice(0, 5).filter((w: any) => w && typeof w === 'object') : [],
    transcriptUsed: raw.transcriptUsed === true,
  }
}

function buildFallbackAnalysis(title: string, description: string): TradingAnalysis {
  const lower = description.toLowerCase()

  // Extract prices with full value including K/M suffix
  const priceRegex = /\$([0-9,]+(?:\.[0-9]+)?)\s*(k|K|million|M)?/g
  const prices: { price: string; type: 'target' | 'support' | 'resistance'; confidence: 'low' }[] = []
  let match
  const seen = new Set<string>()
  while ((match = priceRegex.exec(description)) !== null) {
    const raw = match[1].replace(',', '')
    const unit = match[2] || ''
    const num = parseFloat(raw)
    let formatted: string
    if (unit.toLowerCase() === 'million' || unit.toLowerCase() === 'm') {
      formatted = `$${(num / 1).toFixed(0)}M`
    } else if (unit.toLowerCase() === 'k') {
      formatted = `$${(num / 1).toFixed(0)}K`
    } else if (num >= 1000) {
      formatted = num >= 1_000_000 ? `$${(num / 1_000_000).toFixed(1)}M` : `$${(num / 1000).toFixed(0)}K`
    } else {
      formatted = `$${num}`
    }
    if (!seen.has(formatted) && num > 10) {
      seen.add(formatted)
      const idx = match.index
      const context = description.slice(Math.max(0, idx - 30), idx + 40).toLowerCase()
      const type: 'target' | 'support' | 'resistance' =
        context.includes('crash') || context.includes('drop') || context.includes('support') || context.includes('bottom') ? 'support' :
        context.includes('resistance') || context.includes('target') || context.includes('pump') || context.includes('high') ? 'target' :
        context.includes('wall') ? 'resistance' : 'target'
      prices.push({ price: formatted, type, confidence: 'low' })
    }
  }

  const timestamps = extractTimestampsFromDescription(description)
  const watchMinutes = timestamps.slice(0, 6).map(t => ({ minute: t.time, topic: t.label }))

  const bullish = /\b(bull(ish)?|long|buy|break(out|above)|pump|surge|uptrend|high|green|breakout|accumulate|call|recover|outperform)\b/gi
  const bearish = /\b(bear(ish)?|short|sell|dump|crash|downtrend|red|rug|pullback|break(ing)? down|liquidation|underperform)\b/gi
  const bullCount = (lower.match(bullish) || []).length
  const bearCount = (lower.match(bearish) || []).length
  const total = bullCount + bearCount
  const sentiment = total > 0 ? (bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'neutral') : 'neutral'
  const score = total > 0 ? Math.round(((bullCount - bearCount) / total) * 100) : 0

  return {
    signal: bullCount > bearCount + 2 ? 'BUY' : bearCount > bullCount + 2 ? 'SHORT' : 'HOLD',
    confidence: 'low',
    summary: title.slice(0, 250),
    keyInsights: extractKeyInsights(description),
    priceTargets: prices.slice(0, 8),
    keyDates: extractKeyDates(description),
    sentiment,
    overallScore: score,
    riskLevel: 'high',
    mentionedAssets: detectAssetsWithDirection(description),
    watchMinutes,
    transcriptUsed: false,
  }
}

function extractKeyDates(description: string): { date: string; event: string }[] {
  const dates: { date: string; event: string }[] = []
  const patterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}(?:st|nd|rd|th)?),?\s*(\d{4})/gi,
    /\b(Q[1-4]\s+\d{4}|Q[1-4]\s*\d{2})/gi,
    /\b(summer|winter|fall|autumn|spring)\s+(\d{4})/gi,
    /\b(Phase\s+\d+):?\s*([^.\n]{5,60})/gi,
    /\b(202[4-9]|203[0-9])\b/g,
  ]
  const seen = new Set<string>()
  for (const pattern of patterns) {
    let match
    pattern.lastIndex = 0
    while ((match = pattern.exec(description)) !== null) {
      let dateStr = match[0]
      let event = ''
      if (match[1] && /Phase/i.test(match[1])) {
        dateStr = match[1]
        event = match[2] || match[1]
      } else if (match[2]) {
        event = match[1]
        dateStr = match[2]
      } else {
        const start = Math.max(0, match.index - 30)
        const end = Math.min(description.length, match.index + match[0].length + 20)
        const snippet = description.slice(start, end)
        const parts = snippet.split(/[,.:\n]/).filter(s => s.trim().length > 3)
        event = parts[parts.length - 1]?.trim().slice(0, 50) || dateStr
      }
      if (!seen.has(dateStr)) {
        seen.add(dateStr)
        dates.push({ date: dateStr.slice(0, 30), event: event.slice(0, 60) })
      }
    }
  }
  return dates.slice(0, 6)
}

function detectAssetsWithDirection(description: string): { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[] {
  const lower = description.toLowerCase()
  const assets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[] = []

  const assetRules: { pattern: RegExp; name: string; bullishTerms: string[]; bearishTerms: string[] }[] = [
    { pattern: /\b(bitcoin|btc|xbt)\b/gi, name: 'Bitcoin', bullishTerms: ['btc pump', 'btc outperform', 'btc to $', 'bitcoin strength', 'bitcoin etf'], bearishTerms: ['btc crash', 'btc dump', 'bitcoin collapsing'] },
    { pattern: /\b(ethereum|eth)\b/gi, name: 'Ethereum', bullishTerms: [], bearishTerms: [] },
    { pattern: /\b(gold|xau)\b/gi, name: 'Gold', bullishTerms: ['gold pump', 'gold to $'], bearishTerms: ['gold trap', 'gold crash', 'gold top', 'gold fell', 'gold crashed'] },
    { pattern: /\b(silver|xag)\b/gi, name: 'Silver', bullishTerms: [], bearishTerms: ['silver crash', 'silver fell'] },
    { pattern: /\b(oil|wti|brent|crude)\b/gi, name: 'Oil', bullishTerms: ['oil shock', 'oil up', 'oil pump'], bearishTerms: [] },
    { pattern: /\b(s&p 500|s&p500|sp500|spy|es1!)\b/gi, name: 'S&P 500', bullishTerms: [], bearishTerms: [] },
  ]
  for (const rule of assetRules) {
    if (rule.pattern.test(lower)) {
      let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral'
      const matches = Array.from(lower.matchAll(new RegExp(rule.pattern.source, 'gi')))
      for (const m of matches) {
        const idx = m.index || 0
        const context = lower.slice(Math.max(0, idx - 80), Math.min(lower.length, idx + 80))
        for (const bt of rule.bullishTerms) {
          if (context.includes(bt)) { direction = 'bullish'; break }
        }
        for (const brt of rule.bearishTerms) {
          if (context.includes(brt)) { direction = 'bearish'; break }
        }
        if (direction !== 'neutral') break
      }
      assets.push({ name: rule.name, direction })
    }
  }
  return assets
}

function extractKeyInsights(description: string): string[] {
  const insights: string[] = []
  const sentences = description.split(/[.!?\n]/).filter(s => s.trim().length > 15)
  for (const sentence of sentences.slice(0, 15)) {
    const clean = sentence.trim()
    if (clean.length > 15 && clean.length < 250) {
      if (/\$\d|%|\d+\s*(percent|jobs|trillion|million|k\b)|Phase\s*\d|Algorithm/i.test(clean)) {
        insights.push(clean.slice(0, 200))
      }
    }
  }
  return insights.slice(0, 5)
}

function extractTimestampsFromDescription(description: string): { time: string; label: string; seconds: number }[] {
  const timestamps: { time: string; label: string; seconds: number }[] = []
  const lines = description.split('\n')
  for (const line of lines) {
    const match = line.match(/^\s*(\d{1,2}:)?(\d{1,2}):(\d{2})\s*[-–]?\s*(.+)/)
    if (match) {
      const hours = match[1] ? parseInt(match[1].replace(':', '')) : 0
      const minutes = parseInt(match[2])
      const seconds = parseInt(match[3])
      const totalSeconds = hours * 3600 + minutes * 60 + seconds
      const label = match[4].trim()
      if (label && totalSeconds < 24 * 3600) {
        timestamps.push({
          time: `${hours > 0 ? hours + ':' : ''}${minutes}:${seconds.toString().padStart(2, '0')}`,
          label,
          seconds: totalSeconds,
        })
      }
    }
  }
  return timestamps.slice(0, 15)
}

async function fetchLatestVideos(): Promise<{ items: any[]; error?: string }> {
  if (!YOUTUBE_API_KEY) {
    return { items: [], error: 'YOUTUBE_API_KEY env var not set on server' }
  }
  // First get the uploads playlist ID for the channel
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${YOUTUBE_API_KEY}`
  )
  if (!channelRes.ok) {
    const body = (await channelRes.text()).slice(0, 300)
    // Redact the API key from the body in case Google echoes it back
    const safe = body.replace(YOUTUBE_API_KEY, '***REDACTED***')
    return {
      items: [],
      error: `YouTube channels API ${channelRes.status}: ${safe}`,
    }
  }
  const channelData = await channelRes.json()
  const uploadsId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsId) {
    return {
      items: [],
      error: `YouTube channel ${CHANNEL_ID} returned no uploads playlist (channelData=${JSON.stringify(channelData).slice(0, 200)})`,
    }
  }

  // Fetch the latest 20 videos so we have headroom to surface trading
  // content even when the channel mixes trading uploads with filler shorts
  // (science/weather/lifestyle). The GET handler picks the best 5 from
  // these — preferring trading-relevant videos, falling back to recency.
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&maxResults=20&playlistId=${uploadsId}&key=${YOUTUBE_API_KEY}`
  )
  if (!playlistRes.ok) {
    const body = (await playlistRes.text()).slice(0, 300)
    const safe = body.replace(YOUTUBE_API_KEY, '***REDACTED***')
    return {
      items: [],
      error: `YouTube playlistItems API ${playlistRes.status}: ${safe}`,
    }
  }
  const playlistData = await playlistRes.json()

  // Filter to only public videos and get their full details
  const publicItems = (playlistData.items || []).filter((item: any) => {
    const status = item.status?.privacyStatus || item.snippet?.thumbnails ? 'public' : 'private'
    return status === 'public' || item.snippet?.thumbnails?.default
  })

  // Get video IDs and fetch statistics
  const videoIds = publicItems.map((item: any) => item.snippet.resourceId?.videoId).filter(Boolean)
  if (videoIds.length === 0) {
    return {
      items: [],
      error: `Playlist returned ${playlistData.items?.length || 0} items, none with public video IDs`,
    }
  }

  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
  )
  const statsData = statsRes.ok ? await statsRes.json() : { items: [] }
  const statsMap = new Map((statsData.items || []).map((item: any) => [item.id, item.statistics]))

  return {
    items: publicItems.map((item: any) => {
      const videoId = item.snippet.resourceId?.videoId
      return {
        snippet: item.snippet,
        statistics: statsMap.get(videoId) || {},
        videoId,
      }
    }),
  }
}

export async function GET(request: NextRequest) {
  try {
    // Cache check — explicit ?refresh=1 bypasses, otherwise serve cached
    // result if within TTL. Bypassing also resets cache so the next caller
    // gets the fresh result (no stampede if multiple clicks).
    const refresh = request.nextUrl.searchParams.get('refresh') === '1'
    const now = Date.now()
    if (!refresh && cachedAnalysis && now - cachedAnalysis.ts < CACHE_TTL_MS) {
      return NextResponse.json({
        ...cachedAnalysis.data as object,
        cacheStatus: 'fresh',
        cacheAgeMs: now - cachedAnalysis.ts,
      })
    }

    const fetchResult = await fetchLatestVideos()
    // Pre-filter: skip obviously non-trading videos (weather, science, vlogs,
    // lifestyle) before burning Sonnet tokens. Channels that mix content
    // benefit; pure-trading channels pass everything through. Keyword
    // signal-detection — anything with a $price, % move, asset name, or
    // trading verb in title or first 500 chars of description scores as
    // potentially trading.
    const TRADING_SIGNALS = /\b(bitcoin|btc|ethereum|eth|crypto|xrp|sol|altcoin|stablecoin|halving|etf|bull(ish)?|bear(ish)?|long|short|buy|sell|breakout|support|resistance|target|entry|stop\s?loss|liquidation|trade|trading|investor|recession|rally|pump|dump|fed|interest rate|cpi|fomc|inflation|earnings|nasdaq|s&p|dow|stock|market|wave|cycle|phase|elliott|fibonacci|fib|trend|chart|ta\b|technical|fundamental|forecast|prediction|outlook|halving|gold|silver|wti|brent)\b/i
    const looksLikeTrading = (item: any): boolean => {
      const title = item.snippet?.title || ''
      const desc = (item.snippet?.description || '').slice(0, 500)
      const blob = `${title}\n${desc}`
      // Negative-signal keywords — pure-non-trading shorts
      const NON_TRADING = /\b(weather|meteorolog|atmosphere|butterfly effect|chaos theory|cooking|recipe|workout|gym|nutrition|skincare|beauty|fashion|gaming(?!.*\bcoin\b)|movie|netflix|tv show)\b/i
      if (NON_TRADING.test(blob) && !TRADING_SIGNALS.test(blob)) return false
      return TRADING_SIGNALS.test(blob)
    }
    // Score: trading-relevant first (preserving recency), then everything else.
    // Take top 8 — 5 we'll definitely analyze, plus 3 buffer for tradingRelevantCount stat.
    const trading = fetchResult.items.filter(looksLikeTrading).slice(0, 5)
    const nonTrading = fetchResult.items.filter((v: any) => !looksLikeTrading(v)).slice(0, 5 - trading.length)
    const selected = [...trading, ...nonTrading]
    fetchResult.items = selected.length > 0 ? selected : fetchResult.items.slice(0, 5)

    if (fetchResult.items.length === 0) {
      // Surface the ACTUAL failure reason — was vague "check YOUTUBE_API_KEY"
      // before, which masked things like quota exhaustion, restricted keys,
      // wrong channel ID, etc.
      const reason = fetchResult.error || 'Unknown reason — fetchLatestVideos returned 0 items with no error'
      console.warn('[Influencer]', reason)
      return NextResponse.json({
        success: false,
        error: reason,
        hint: 'Common causes: (1) YOUTUBE_API_KEY env var missing/wrong on Render. (2) Key has HTTP referer restrictions blocking server-side use — switch to "None" or "IP addresses". (3) YouTube Data API v3 not enabled on your Google Cloud project. (4) Daily quota exhausted (10k units/day on free tier).',
      })
    }
    const videos = fetchResult.items

    // Build batch input — extract timestamps + fetch transcripts in parallel.
    // Transcripts are the PRIMARY source for price/date extraction (description
    // is usually generic boilerplate). Cached forever per videoId on disk, so
    // re-fetches on dashboard refresh are free.
    const transcripts = await Promise.all(
      videos.map((v: any) => fetchTranscript(v.videoId).catch(() => ''))
    )
    const batchInput: VideoForAnalysis[] = videos.map(({ snippet, statistics, videoId }: any, idx: number) => ({
      videoId,
      title: snippet.title,
      description: snippet.description || '',
      transcript: transcripts[idx] || '',
      timestamps: extractTimestampsFromDescription(snippet.description || ''),
      viewCount: parseInt(statistics.viewCount || '0'),
    }))
    const withTranscript = batchInput.filter(v => v.transcript.length > 0).length
    console.log(`[Influencer] Transcripts: ${withTranscript}/${batchInput.length} videos (${Math.round(transcripts.reduce((s, t) => s + (t?.length || 0), 0) / 1000)}KB total)`)

    // Single LLM call analyzing all 5 videos at once (was 5 separate calls).
    const analysisMap = await analyzeBatch(batchInput)

    // Stitch back into the API response shape the UI expects.
    const analyzedVideos = videos.map(({ snippet, statistics, videoId }) => {
      const description = snippet.description || ''
      const timestamps = extractTimestampsFromDescription(description)
      const viewCount = parseInt(statistics.viewCount || '0')
      const analysis = analysisMap.get(videoId) || buildFallbackAnalysis(snippet.title, description)

      let publishedDisplay = ''
      try {
        const d = new Date(snippet.publishedAt)
        publishedDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      } catch { publishedDisplay = 'Recently' }

      return {
        id: videoId,
        title: snippet.title,
        description,
        published: snippet.publishedAt,
        publishedDisplay,
        thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        channelTitle: snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        handle: CHANNEL_HANDLE,
        viewCount,
        likeCount: parseInt(statistics.likeCount || '0'),
        analysis,
        timestamps,
      }
    })

    // Identify trading-relevant videos vs filler content (the channel
    // sometimes posts non-trading shorts — science, lifestyle, etc.).
    // A video is "tradingRelevant" if Sonnet returned a non-NEUTRAL signal
    // OR found at least one price target / mentioned asset / key date.
    // The UI uses this to surface trading content first and dim the rest.
    const taggedVideos = analyzedVideos.map(v => {
      const a = v.analysis
      const tradingRelevant =
        a.signal !== 'NEUTRAL' ||
        a.priceTargets.length > 0 ||
        a.mentionedAssets.length > 0 ||
        a.keyDates.length > 0
      return { ...v, tradingRelevant }
    })

    // Best "latest" is the most recent TRADING-RELEVANT video, falling back
    // to the literal newest if the channel hasn't posted trading content
    // recently. Avoids highlighting a weather short as "the latest pick."
    const latestTrading = taggedVideos.find(v => v.tradingRelevant) || taggedVideos[0]

    const responseData = {
      success: true,
      videos: taggedVideos,
      latest: latestTrading,
      tradingRelevantCount: taggedVideos.filter(v => v.tradingRelevant).length,
      channel: CHANNEL_HANDLE,
      channelUrl: `https://www.youtube.com/@${CHANNEL_HANDLE}`,
      timestamp: Date.now(),
    }
    // Cache the fresh result so subsequent visits within TTL skip the
    // ~30-60s pipeline. Refresh button (?refresh=1) bypasses this cache
    // when the user wants the latest videos right now.
    cachedAnalysis = { data: responseData, ts: Date.now() }
    return NextResponse.json({
      ...responseData,
      cacheStatus: 'cold',
      cacheAgeMs: 0,
    })
  } catch (err) {
    console.error('Influencer API error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}

/**
 * POST /api/influencer
 * Body: { videoId: string, transcript: string }
 *
 * Manual transcript ingestion — escape hatch for when our scraper can't
 * fetch a transcript (YouTube has been hardening against unauthenticated
 * scrapers, so direct timedtext fetches often return empty). The user
 * opens the video on YouTube, clicks "..." → "Show transcript", copies
 * the text, and pastes it here. We cache it under the videoId so the
 * next analysis pass picks it up and uses it as the PRIMARY source for
 * date/price extraction.
 *
 * Pasted transcripts don't need timestamps — just the plain text is fine.
 * The LLM will extract dates/prices without [m:ss] markers, just without
 * clickable jump-to-moment links.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const videoId = String(body.videoId || '').trim()
    const transcript = String(body.transcript || '').trim()
    if (!videoId || videoId.length > 20) {
      return NextResponse.json({ success: false, error: 'Invalid videoId' }, { status: 400 })
    }
    if (!transcript || transcript.length < 100) {
      return NextResponse.json({ success: false, error: 'Transcript must be at least 100 chars' }, { status: 400 })
    }
    // Cap at TRANSCRIPT_MAX_CHARS so a long paste doesn't blow up the prompt
    const capped = transcript.length > TRANSCRIPT_MAX_CHARS
      ? transcript.slice(0, TRANSCRIPT_MAX_CHARS) + '\n[...transcript truncated]'
      : transcript
    transcriptCache.set(videoId, {
      text: capped,
      fetchedAt: Date.now(),
      lang: 'en-manual',
      truncated: transcript.length > TRANSCRIPT_MAX_CHARS,
    })
    saveTranscriptCache()
    // Invalidate the analysis cache so the next GET re-runs the LLM with the
    // freshly-pasted transcript. Wasteful (re-screens all 5 videos for one
    // update) but simple and a transcript paste is a rare action.
    cachedAnalysis = null
    console.log(`[Influencer] Manual transcript stored for ${videoId} (${capped.length} chars). Analysis cache cleared.`)
    return NextResponse.json({
      success: true,
      videoId,
      chars: capped.length,
      truncated: transcript.length > TRANSCRIPT_MAX_CHARS,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

/**
 * DELETE /api/influencer/transcript?videoId=<id>
 * Removes a cached transcript so the next GET tries to re-fetch (or, if
 * the user wants, re-pastes). Used by the UI's "clear pasted transcript"
 * button. Without it, a bad paste would stick forever.
 */
export async function DELETE(request: NextRequest) {
  try {
    const videoId = request.nextUrl.searchParams.get('videoId')
    if (!videoId) {
      return NextResponse.json({ success: false, error: 'missing ?videoId' }, { status: 400 })
    }
    const had = transcriptCache.has(videoId)
    transcriptCache.delete(videoId)
    saveTranscriptCache()
    cachedAnalysis = null
    return NextResponse.json({ success: true, removed: had })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
