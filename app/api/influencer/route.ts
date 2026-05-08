import { NextRequest, NextResponse } from 'next/server'
import { callClaudeCode, ClaudeCodeRateLimitError } from '@/lib/services/claude-code-llm.service'

// Channel is configurable via env vars so you can swap influencers without
// a code change. Defaults to ElcaroTrade for backward compat. The handle is
// purely cosmetic (shown in UI); the channel ID is what YouTube needs.
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCsT-PrX_ZgxXngz7kZsKJTw'
const CHANNEL_HANDLE = process.env.YOUTUBE_CHANNEL_HANDLE || 'ElcaroTrade'
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

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
  priceTargets: { price: string; date?: string; type: 'entry' | 'target' | 'stop' | 'support' | 'resistance'; confidence: 'high' | 'low' }[]
  keyDates: { date: string; event: string }[]
  sentiment: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high'
  mentionedAssets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[]
  watchMinutes: { minute: string; topic: string }[]
}

interface VideoForAnalysis {
  videoId: string
  title: string
  description: string
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
    const descSnip = v.description.slice(0, 2500)
    const viewStr = v.viewCount > 0 ? `${(v.viewCount / 1000).toFixed(0)}K views` : ''
    return `=== VIDEO ${i + 1} (id: ${v.videoId}) ===
TITLE: ${v.title}
${viewStr ? `VIEWS: ${viewStr}\n` : ''}CHAPTERS:
${chapters || '  (no chapters)'}
DESCRIPTION:
${descSnip}`
  }).join('\n\n')

  return `You are a crypto trading analyst. Analyze each of the following YouTube videos from @ElcaroTrade and extract structured trading insights for EACH ONE.

Return ONLY a valid JSON ARRAY (no markdown, no code fences) with EXACTLY ${videos.length} entries — one per video, in the same order. Each entry has the following shape:
{
  "videoId": "<id from the VIDEO header>",
  "signal": "BUY" | "HOLD" | "SHORT" | "NEUTRAL",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence summary of the key trading thesis. Max 250 chars. Be specific about what action to take.",
  "keyInsights": ["Specific insight 1", "Specific insight 2", ...],
  "priceTargets": [{"price": "$100K", "date": "Q2 2026", "type": "target", "confidence": "high"}, ...],
  "keyDates": [{"date": "Q2 2026", "event": "Phase 4 prediction"}],
  "sentiment": "bullish" | "bearish" | "neutral",
  "overallScore": 50,
  "riskLevel": "low" | "medium" | "high",
  "mentionedAssets": [{"name": "Bitcoin", "direction": "bullish"}, ...],
  "watchMinutes": [{"minute": "2:36", "topic": "2024 Predictions"}, ...]
}

Rules — GROUND EVERY CLAIM in the actual title/chapters/description text. Do NOT invent prices, dates, or signals that aren't supported by the source. If a field has no signal in the source, return an empty array or "NEUTRAL"/"low" — don't fabricate to fill it out.

- signal: BUY if bullish with clear entries explicitly mentioned, SHORT if bearish with clear exits explicitly mentioned, HOLD if mixed/unclear, NEUTRAL if no trading content (e.g. educational, news, off-topic)
- confidence: "high" ONLY if multiple specific price levels AND dates are explicitly mentioned in the source. "medium" if the directional thesis is clear but specifics are vague. "low" if mostly narrative without numbers.
- summary: Direct about what the influencer ACTUALLY recommends in this video — quote-anchored, not generic. If signal=NEUTRAL, summarize the topic instead.
- keyInsights: 3-5 most important claims FROM THE TEXT with actual numbers. Skip if the description has no numerical claims.
- priceTargets: ONLY specific dollar prices that appear in the source ($109K, $126K, $60K, etc.). Type: "target" for upside levels, "support" for downside floors, "resistance" for ceilings, "entry"/"stop" if explicitly named. Empty array if no prices mentioned.
- keyDates: ONLY dates explicitly mentioned (earnings, halving, policy events, predictions like "Phase 4", "summer 2026"). Empty array if no dates.
- overallScore: -100 (extremely bearish) to +100 (extremely bullish). Anchor on EXPLICIT directional claims and price-target counts/magnitudes. Default to 0 if no clear signal.
- riskLevel: "low" if claims are specific and grounded, "medium" if mixed, "high" if vague or no specifics
- mentionedAssets: ONLY assets actually named (BTC, ETH, gold, oil, S&P, silver). direction from explicit context. Empty array if generic content.
- watchMinutes: Top 3-5 chapter timestamps from the chapters list — pick the ones most relevant to trading decisions. Skip if no chapters provided.

VIDEOS TO ANALYZE:
${videoBlocks}

Return the JSON array now (${videos.length} entries, in order):`
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
  // unavailable — go straight to Groq.
  const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  // 1. Claude Code subprocess (Max sub, primary path)
  if (!IS_SERVERLESS) {
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
 *  code can rely on shape. Missing fields get safe defaults. */
function sanitize(raw: any): TradingAnalysis {
  const validSignals = ['BUY', 'HOLD', 'SHORT', 'NEUTRAL']
  const validConf = ['high', 'medium', 'low']
  const validSent = ['bullish', 'bearish', 'neutral']
  const validRisk = ['low', 'medium', 'high']
  return {
    signal: validSignals.includes(raw.signal) ? raw.signal : 'NEUTRAL',
    confidence: validConf.includes(raw.confidence) ? raw.confidence : 'low',
    summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 300) : '',
    keyInsights: Array.isArray(raw.keyInsights) ? raw.keyInsights.slice(0, 5).map((s: any) => String(s).slice(0, 250)) : [],
    priceTargets: Array.isArray(raw.priceTargets) ? raw.priceTargets.slice(0, 8).filter((p: any) => p && typeof p === 'object') : [],
    keyDates: Array.isArray(raw.keyDates) ? raw.keyDates.slice(0, 6).filter((d: any) => d && typeof d === 'object') : [],
    sentiment: validSent.includes(raw.sentiment) ? raw.sentiment : 'neutral',
    overallScore: typeof raw.overallScore === 'number' ? Math.max(-100, Math.min(100, raw.overallScore)) : 0,
    riskLevel: validRisk.includes(raw.riskLevel) ? raw.riskLevel : 'medium',
    mentionedAssets: Array.isArray(raw.mentionedAssets) ? raw.mentionedAssets.slice(0, 8).filter((a: any) => a && typeof a === 'object') : [],
    watchMinutes: Array.isArray(raw.watchMinutes) ? raw.watchMinutes.slice(0, 5).filter((w: any) => w && typeof w === 'object') : [],
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

    // Build batch input — extract timestamps + view counts in parallel.
    const batchInput: VideoForAnalysis[] = videos.map(({ snippet, statistics, videoId }) => ({
      videoId,
      title: snippet.title,
      description: snippet.description || '',
      timestamps: extractTimestampsFromDescription(snippet.description || ''),
      viewCount: parseInt(statistics.viewCount || '0'),
    }))

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
