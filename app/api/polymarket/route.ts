import { NextResponse } from 'next/server'

// Force dynamic rendering — never cache Polymarket data
export const dynamic = 'force-dynamic'

export interface PolymarketMarket {
  id: string
  question: string
  outcomes: string[]
  outcomePrices: number[]
  volumeNum: number
  liquidityNum: number
  volume24hr: number
  bestBid: number | null
  bestAsk: number | null
  spread: number
  endDateIso: string | null
  slug: string
  competitive: number
  url: string
}

export interface TradeRecommendation {
  market: PolymarketMarket
  outcome: string
  odds: number
  estimatedProbability: number
  marketImpliedProb: number
  expectedValue: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  upside: string
  riskLevel: 'low' | 'medium' | 'high'
  maxBet: number
  safetyScore: number
  recommendedBet: number
  kellyFraction: number
  halfKellyBet: number
  closingDate: number
  daysToClose: number
  convictionScore: number
  convictionLabel: ConvictionLabel
  convictionBreakdown: ConvictionBreakdown
  research: ResearchSummary | null
  longTail: LongTailAnalysis | null
  timeAnalysis: TimeAnalysis
  orderBookSignal?: { imbalance: number; momentum: 'up' | 'down' | 'neutral' } | null
  // LLM-emitted direction. 'skip' means the model declined to bet (low conf,
  // edge too small, direction-estimate inconsistent, or LLM dropped this market
  // from the batch). Tracked separately from expectedValue so the opportunities
  // filter can exclude skip-picks even when the side prob ≥ 50%, which
  // previously caused "85% YES, EV=0" cards to leak into the dashboard.
  llmDirection?: 'yes' | 'no' | 'skip'
}

// ── New: Conviction & Research Types ────────────────────────────────────────

export type ConvictionLabel = 'no-brainer' | 'high' | 'consider' | 'risky'
export type LongTailFlag = 'near-certain' | 'near-impossible' | 'contrarian' | 'opportunity-alert' | null
export type TimeTier = 'pending' | 'imminent' | 'closing-soon' | 'medium' | 'long'

export interface ResearchSummary {
  queryUsed: string
  topFindings: string[]
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed'
  keyInsight: string
  confidenceLevel: 'high' | 'medium' | 'low'
}

export interface LongTailAnalysis {
  flag: LongTailFlag
  reasoning: string
  researchEvidence: string
  alternativeOutcome?: string
  estimatedAlternativeProb?: number
  alternativeEV?: number
}

export interface TimeAnalysis {
  tier: TimeTier
  daysToClose: number
  closingSoonFactors: string[]
  resolutionUncertainty: 'low' | 'medium' | 'high'
}

export interface ConvictionBreakdown {
  score: number
  label: ConvictionLabel
  factors: {
    marketQuality: number
    timeEdge: number
    researchAlignment: number
    evRationality: number
    orderBookImbalance?: number
    nearCertainBoost?: number
    liquidityMomentum?: number
  }
}

interface GammaMarket {
  id: string
  question: string
  outcomes?: string
  outcomePrices?: string
  volumeNum: number
  liquidityNum: number
  volume24hr?: number
  bestBid?: string | null
  bestAsk?: string | null
  spread?: string
  endDateIso?: string
  slug?: string
  competitive?: number
  negRisk?: boolean
  events?: { slug: string }[]
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!,.\/\\#\$%\^&\*;:\{\}=\[\]'"`()~@\+]+/g, '')
    // Fix merged year ranges: "2025–26" → "202526" in slug → "2025-26"
    .replace(/202([4-9])[\u2010-\u2015](\d{2})/g, '202$1-$2')
    .replace(/202([4-9])202(\d{2})/g, '202$1-$2')
    // Replace non-ASCII characters
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2018\u2019\u201c\u201d]/g, '-')
    .replace(/[$]+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 115)
}

function makeMarketUrl(market: GammaMarket): string {
  // Use /event/{parent_slug}/{market_slug} when market has a parent event
  // This works for both negRisk sub-markets and regular sub-markets (e.g. Iran ceasefire, FIFA winner)
  if (market.events && market.events.length > 0 && market.events[0].slug && market.slug) {
    return `https://polymarket.com/event/${market.events[0].slug}/${market.slug}`
  }
  // Standalone markets: use market.slug directly
  if (market.slug) {
    return `https://polymarket.com/event/${market.slug}`
  }
  // Last resort: question-based slug
  const slug = slugify(market.question)
  return `https://polymarket.com/event/${slug}`
}

function calculateSafetyScore(market: GammaMarket, estimatedProb: number, marketProb: number, isShortTerm: boolean = false): number {
  let score = 0

  // Near-certain/near-impossible: give base score for short-term markets
  // These still have trading value — near-certain outcomes are MORE likely to hold with less time
  if (marketProb < 0.0005 || marketProb > 0.9995) {
    if (isShortTerm) {
      // Short-term near-certain: score on liquidity and volume only
      const liq = market.liquidityNum
      score = liq >= 100000 ? 50 : liq >= 50000 ? 40 : liq >= 25000 ? 30 : liq >= 10000 ? 20 : 10
      const vol = market.volumeNum
      score += vol >= 500000 ? 10 : vol >= 100000 ? 7 : vol >= 50000 ? 4 : 0
      return Math.min(100, score)
    }
    return 0
  }

  const liq = market.liquidityNum
  if (liq >= 100000) score += 30
  else if (liq >= 50000) score += 25
  else if (liq >= 25000) score += 20
  else if (liq >= 10000) score += 15
  else if (liq >= 5000) score += 10
  else if (liq >= 1000) score += 5

  // Use effective spread relative to the specific outcome price to avoid inflating scores for extreme-priced outcomes
  const effectiveSpread = marketProb > 0 ? (market.spread ? parseFloat(market.spread) : 0.02) / marketProb : 0.02
  if (effectiveSpread <= 0.03) score += 20
  else if (effectiveSpread <= 0.05) score += 15
  else if (effectiveSpread <= 0.10) score += 10
  else if (effectiveSpread <= 0.20) score += 5

  const vol = market.volumeNum
  if (vol >= 1000000) score += 20
  else if (vol >= 500000) score += 15
  else if (vol >= 100000) score += 10
  else if (vol >= 50000) score += 7
  else if (vol >= 10000) score += 4

  const ev = (estimatedProb - marketProb) / (1 - marketProb)
  const evPct = ev * 100
  if (evPct >= 5 && evPct <= 15) score += 20
  else if (evPct > 15 && evPct <= 25) score += 15
  else if (evPct > 25 && evPct <= 40) score += 8
  else if (evPct >= 3 && evPct < 5) score += 10
  else if (evPct > 40) score += 2

  if (market.competitive && market.competitive >= 0.8) score += 10
  else if (market.competitive && market.competitive >= 0.6) score += 7
  else if (market.competitive && market.competitive >= 0.4) score += 4

  return Math.min(100, score)
}

const REASONING_TEMPLATES = {
  crypto: {
    yes: [
      'Strong on-chain metrics and institutional flows support this outcome.',
      'Price action shows sustained momentum with volume confirmation.',
      'Key technical levels holding, smart money positioning bullish.',
    ],
    no: [
      'Technical and on-chain signals point to headwinds for this outcome.',
      'Weak volume and rejection at resistance suggest downside risk.',
      'Funding rates and positioning indicate limited upside.',
    ],
  },
  sports: {
    yes: [
      'Form guide and matchup analysis favor this outcome.',
      'Rest/weather/home advantage provides statistical edge.',
      'Key matchup stats favor this side.',
    ],
    no: [
      'Head-to-head record and form suggest this side is undervalued.',
      'Injury/absentee list affects outcome probability.',
      'Away form and fatigue factor work against this outcome.',
    ],
  },
  policy: {
    yes: [
      'Policy signals and executive commentary favor this trajectory.',
      'Historical precedent and institutional consensus support this.',
      'Economic data releases align with this outcome.',
    ],
    no: [
      'Recent statements and policy direction contradict this market.',
      'Opposition signaling and political dynamics suggest this is unlikely.',
      'Economic reality and market pricing diverge from this narrative.',
    ],
  },
  general: {
    yes: [
      'Market appears to underprice this outcome based on available evidence.',
      'Crowd sentiment vs fundamentals suggest mispricing here.',
      'Base rate analysis favors this outcome with modest confidence.',
    ],
    no: [
      'Available information suggests the market overprices this outcome.',
      'Contrarian analysis identifies this as a value position.',
      'Historical resolution patterns favor the opposite outcome.',
    ],
  },
}

function classifyMarket(question: string): keyof typeof REASONING_TEMPLATES {
  const q = question.toLowerCase()
  // Check policy first — political keywords are most specific and avoid false positives from generic terms like "win"
  if (/\b(fed|rate|tariff|election|presid(ent|ential)|congress|law|pass|convicted|inflation|jobs|nomination)\b/.test(q)) return 'policy'
  // Crypto next
  if (/\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|trump|meme|coin)\b/.test(q)) return 'crypto'
  // Sports — use sport-specific keywords; "win" is excluded to avoid false positives on "win nomination", "win election"
  if (/\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs)\b/.test(q)) return 'sports'
  return 'general'
}

function pickReasoning(question: string, outcomeIndex: number, estimatedProb: number): string {
  const category = classifyMarket(question)
  const templates = REASONING_TEMPLATES[category]
  const key = outcomeIndex === 0 ? 'yes' : 'no'
  const options = templates[key]
  const probPct = estimatedProb * 100
  const idx = probPct >= 70 ? 0 : probPct >= 55 ? 1 : 2
  return options[idx % options.length]
}

// Delegated to polymarket-research.service.ts
function estimateTrueProbability(marketPrice: number, category: string): number {
  const categoryBias: Record<string, number> = {
    crypto: 0.01,
    sports: 0.01,
    policy: -0.02,
    general: 0.0,
  }
  const bias = categoryBias[category] || 0
  return Math.min(0.97, Math.max(0.03, marketPrice + bias))
}

function calculateKellyBet(bankroll: number, estimatedProb: number, marketProb: number): { kellyFraction: number; halfKelly: number; quarterKelly: number } {
  const decimalOdds = (1 / marketProb) - 1
  if (decimalOdds <= 0 || estimatedProb <= 0) return { kellyFraction: 0, halfKelly: 0, quarterKelly: 0 }
  const q = 1 - estimatedProb
  const kelly = (decimalOdds * estimatedProb - q) / decimalOdds
  const positiveKelly = Math.max(0, kelly)
  // Cap Kelly at 10% of bankroll to avoid overbetting
  const cappedKelly = Math.min(positiveKelly, 0.10)
  return {
    kellyFraction: cappedKelly,
    halfKelly: bankroll * cappedKelly / 2,
    quarterKelly: bankroll * cappedKelly / 4
  }
}

function getConvictionLabel(score: number): ConvictionLabel {
  if (score >= 90) return 'no-brainer'
  if (score >= 75) return 'high'
  if (score >= 55) return 'consider'
  return 'risky'
}

function scoreMarket(market: GammaMarket): TradeRecommendation[] {
  // Note: negRisk sub-markets are NOT filtered out — they have their own individual pages
  // on Polymarket (e.g., /event/will-connecticut-win-the-2026-ncaa-tournament). Many
  // short-term markets (NCAA, Masters, elections) are negRisk, so blocking them would
  // miss most urgent opportunities.

  if (!market.outcomePrices || !market.outcomes) return []

  let outcomePrices: number[]
  try {
    const parsed = JSON.parse(market.outcomePrices)
    if (!Array.isArray(parsed) || parsed.length < 2) return []
    outcomePrices = parsed.map(Number).filter(p => !isNaN(p) && p > 0 && p < 1)
    if (outcomePrices.length < 2) return []
  } catch {
    return []
  }

  // Determine time tier early so it can be used for liquidity and price checks
  const hasNoDate = !market.endDateIso
  const daysToClose = hasNoDate
    ? 0
    : Math.max(0, Math.ceil((new Date(market.endDateIso!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
  const isImminent = daysToClose <= 1 || hasNoDate
  const isClosingSoon = daysToClose <= 7 || hasNoDate

  let outcomes: string[]
  try {
    outcomes = JSON.parse(market.outcomes)
  } catch {
    outcomes = ['Yes', 'No']
  }

  // Lower minimum liquidity to capture niche markets (esports, smaller news
  // events, prop bets). The LLM analysis is the real quality gate.
  const liquidityMin = 500
  if (market.liquidityNum < liquidityMin) return []

  // Widen price range to capture near-certain (0.999+) and near-impossible (0.001+) outcomes
  // These are valid trading opportunities — especially for short-term markets
  const minPrice = 0.001
  const maxPrice = 0.999

  const category = classifyMarket(market.question)
  const recommendations: TradeRecommendation[] = []

  for (let i = 0; i < Math.min(outcomePrices.length, 2); i++) {
    const marketProb = outcomePrices[i]
    if (marketProb < minPrice || marketProb > maxPrice) continue

    // No hardcoded bias — LLM provides evidence-based estimate via the research pipeline
    const bias = 0
    const estimatedProb = Math.min(0.999, Math.max(0.001, marketProb + bias))
    const ev = (estimatedProb - marketProb) / (1 - marketProb)
    const evPct = ev * 100

    // Zero EV threshold here — let all markets pass through to the LLM stage.
    // The LLM provides the real evidence-based estimate; pre-LLM we just have marketProb + 0 bias.
    // The 5% EV filter is applied AFTER the LLM updates the estimate (in the response filter).
    const evThreshold = 0
    if (evPct < evThreshold || evPct > 50) continue

    const safetyScore = calculateSafetyScore(market, estimatedProb, marketProb, isImminent || isClosingSoon)
    // Lower safety floor so smaller-volume markets (esports, niche news)
    // make it through to LLM analysis. The LLM is the real quality gate;
    // safetyScore here is just structural (liquidity/spread/volume).
    const safetyMin = 25
    if (safetyScore < safetyMin) continue

    // ── Conviction fields (Task 3: basic wiring; Task 4 adds async deep research) ──
    const convictionScore = safetyScore
    const convictionLabel = getConvictionLabel(convictionScore)

    // Build conviction breakdown with the four factors
    const spread = market.spread ? parseFloat(market.spread) : 0.02
    const effectiveSpread = marketProb > 0 ? spread / marketProb : 0.02
    const liqScore = market.liquidityNum >= 100000 ? 100 : market.liquidityNum >= 50000 ? 85 : market.liquidityNum >= 25000 ? 70 : market.liquidityNum >= 10000 ? 55 : market.liquidityNum >= 5000 ? 40 : 25
    const volScore = market.volumeNum >= 1000000 ? 100 : market.volumeNum >= 500000 ? 85 : market.volumeNum >= 100000 ? 70 : market.volumeNum >= 50000 ? 55 : 40
    const sprScore = effectiveSpread <= 0.03 ? 100 : effectiveSpread <= 0.05 ? 85 : effectiveSpread <= 0.10 ? 70 : 40
    const marketQuality = liqScore * 0.4 + volScore * 0.3 + sprScore * 0.3

    // Time analysis
    let tier: TimeTier
    if (hasNoDate) {
      tier = 'pending'
    } else if (daysToClose <= 1) {
      tier = 'imminent'
    } else if (daysToClose <= 7) {
      tier = 'closing-soon'
    } else if (daysToClose <= 30) {
      tier = 'medium'
    } else {
      tier = 'long'
    }
    const closingSoonFactors: string[] = []
    if (hasNoDate) {
      closingSoonFactors.push('No set end date — resolution timing uncertain')
    } else if (tier === 'imminent') {
      closingSoonFactors.push('Resolution within 24 hours — maximum time pressure')
      closingSoonFactors.push('Minimal room for new information to shift probability')
    } else if (tier === 'closing-soon') {
      closingSoonFactors.push('Resolution within 7 days — high time urgency')
    } else if (tier === 'medium') {
      closingSoonFactors.push('Resolution within 30 days — moderate uncertainty window')
    } else {
      closingSoonFactors.push('Long-duration market — significant uncertainty remains')
    }
    const resolutionUncertainty: 'low' | 'medium' | 'high' =
      hasNoDate || tier === 'imminent' ? 'low' : tier === 'closing-soon' || tier === 'medium' ? 'medium' : 'high'
    const timeEdge = hasNoDate ? 95 : tier === 'imminent' ? 95 : tier === 'closing-soon' ? 75 : tier === 'medium' ? 55 : 35

    const researchAlignment = 50 // neutral baseline — research is null for now (Task 4 adds async research)
    const evRationalityScore = evPct >= 3 && evPct <= 25 ? 100 : evPct > 25 && evPct <= 40 ? 70 : evPct > 40 && evPct <= 50 ? 40 : evPct >= 1 && evPct < 3 ? 50 : 20

    const convictionBreakdown: ConvictionBreakdown = {
      score: convictionScore,
      label: convictionLabel,
      factors: {
        marketQuality: Math.round(marketQuality),
        timeEdge: Math.round(timeEdge),
        researchAlignment: Math.round(researchAlignment),
        evRationality: Math.round(evRationalityScore),
      },
    }

    const timeAnalysis: TimeAnalysis = {
      tier,
      daysToClose,
      closingSoonFactors,
      resolutionUncertainty,
    }

    const { kellyFraction } = calculateKellyBet(1000, estimatedProb, marketProb)

    const confidence: 'high' | 'medium' | 'low' =
      safetyScore >= 70 ? 'high' : safetyScore >= 55 ? 'medium' : 'low'

    const riskLevel: 'low' | 'medium' | 'high' =
      market.liquidityNum >= 50000 ? 'low' : market.liquidityNum >= 10000 ? 'medium' : 'high'

    const maxBet = Math.min(Math.floor(market.liquidityNum * 0.005 / marketProb), 100)
    const reasoning = pickReasoning(market.question, i, estimatedProb)
    const url = makeMarketUrl(market)

    const upside = `Market: ${(marketProb * 100).toFixed(1)}% → Est: ${(estimatedProb * 100).toFixed(1)}% | EV: ${evPct > 0 ? '+' : ''}${evPct.toFixed(1)}%`

    recommendations.push({
      market: {
        id: market.id,
        question: market.question,
        outcomes,
        outcomePrices,
        volumeNum: market.volumeNum,
        liquidityNum: market.liquidityNum,
        volume24hr: market.volume24hr || 0,
        bestBid: market.bestBid ? Number(market.bestBid) : null,
        bestAsk: market.bestAsk ? Number(market.bestAsk) : null,
        spread: market.spread ? Number(market.spread) : 0,
        endDateIso: market.endDateIso || null,
        slug: market.slug || '',
        competitive: market.competitive || 0,
        url
      },
      outcome: outcomes[i] || (i === 0 ? 'Yes' : 'No'),
      odds: marketProb,
      estimatedProbability: estimatedProb,
      marketImpliedProb: marketProb,
      expectedValue: ev,
      confidence,
      reasoning,
      upside,
      riskLevel,
      maxBet,
      safetyScore,
      recommendedBet: 0,
      kellyFraction,
      halfKellyBet: 0,
      closingDate: market.endDateIso ? new Date(market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
      daysToClose,
      convictionScore,
      convictionLabel,
      convictionBreakdown,
      research: null,    // Task 4 adds async deep research
      longTail: null,     // Task 4 adds async long-tail detection
      timeAnalysis,
    })
  }

  // Return BOTH sides (YES and NO recs) of every market so the LLM analysis
  // pipeline can route the bet to whichever side it recommends. The route's
  // downstream apply loop sets EV=0 on the wrong-side rec.
  return recommendations
}
// ── Global response cache to prevent concurrent LLM pipeline floods ──────────
// The dashboard auto-refreshes frequently, but LLM analysis takes 30-60s.
// Without this, each refresh spawns a new LLM pipeline, flooding the rate limit.
// Stale-while-revalidate cache. `freshExpiry` is the green-zone (5min): data
// returned without question. After that we enter the stale zone — return the
// last-known data immediately AND kick off a background refresh so the next
// request gets fresh data. Dashboard never waits more than the initial cold-
// load (which the instrumentation pre-warm already covered on server boot).
let cachedResponse: { data: any; freshExpiry: number; staleExpiry: number } | null = null
let inflightPipeline: Promise<any> | null = null
const FRESH_TTL = 5 * 60_000   // 5 min — return without revalidation
const STALE_TTL = 60 * 60_000  // 1 hour — return stale + background refresh

// Disk-backed cache so server restarts inherit the previous analysis.
// First dashboard visit after `npm run dev` is instant from disk; pre-warm
// then refreshes the cache in the background.
import * as fs from 'fs'
import * as path from 'path'
const DISK_CACHE_PATH = path.join(process.cwd(), 'data', 'polymarket-analyzed-cache.json')

function loadDiskCache(): void {
  try {
    if (!fs.existsSync(DISK_CACHE_PATH)) return
    const raw = fs.readFileSync(DISK_CACHE_PATH, 'utf-8')
    const stored = JSON.parse(raw) as { data: unknown; savedAt: number }
    if (!stored.data || !stored.savedAt) return
    const ageMs = Date.now() - stored.savedAt
    // Treat disk cache as STALE on load — fresh dashboard visit gets it
    // immediately, instrumentation pre-warm refreshes the in-memory copy.
    cachedResponse = {
      data: stored.data,
      freshExpiry: Date.now(),                 // already expired-fresh
      staleExpiry: Date.now() + STALE_TTL,     // valid as stale for 1h
    }
    const ageMin = (ageMs / 60_000).toFixed(1)
    console.log(`[Cache] Loaded disk-cached analysis (${ageMin}min old) — first dashboard visit will be instant`)
  } catch (e) {
    console.warn('[Cache] Failed to load disk cache:', e instanceof Error ? e.message : e)
  }
}

function saveDiskCache(data: unknown): void {
  try {
    const dir = path.dirname(DISK_CACHE_PATH)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(DISK_CACHE_PATH, JSON.stringify({ data, savedAt: Date.now() }))
  } catch (e) {
    console.warn('[Cache] Failed to save disk cache:', e instanceof Error ? e.message : e)
  }
}

// Hydrate from disk at module load (once per Node process)
loadDiskCache()

export async function GET() {
  const now = Date.now()

  // FRESH: return immediately, no work
  if (cachedResponse && now < cachedResponse.freshExpiry) {
    return Response.json({
      ...cachedResponse.data,
      cacheStatus: 'fresh',
      analysisInProgress: false,
    })
  }

  // STALE: return last-known data immediately, kick off background refresh
  if (cachedResponse && now < cachedResponse.staleExpiry) {
    const wasIdle = !inflightPipeline
    if (wasIdle) {
      // Background refresh — fire and forget. Errors logged but don't propagate.
      runFullPipeline()
        .then((data) => {
          cachedResponse = {
            data,
            freshExpiry: Date.now() + FRESH_TTL,
            staleExpiry: Date.now() + STALE_TTL,
          }
          inflightPipeline = null
          console.log('[Pipeline] Background refresh complete')
        })
        .catch((e) => {
          console.warn('[Pipeline] Background refresh failed (stale data still served):', e instanceof Error ? e.message : e)
          inflightPipeline = null
        })
      inflightPipeline = Promise.resolve()
    }
    return Response.json({
      ...cachedResponse.data,
      cacheStatus: 'stale-revalidating',
      analysisInProgress: true,  // background refresh running
    })
  }

  // COLD: no cache at all — must wait. If a pipeline is already running,
  // share that promise rather than starting a parallel one.
  if (inflightPipeline) {
    try {
      const data = await inflightPipeline
      return Response.json(data)
    } catch {
      // fall through
    }
  }

  inflightPipeline = runFullPipeline()
    .then((data) => {
      cachedResponse = {
        data,
        freshExpiry: Date.now() + FRESH_TTL,
        staleExpiry: Date.now() + STALE_TTL,
      }
      inflightPipeline = null
      return data
    })
    .catch((e) => {
      inflightPipeline = null
      throw e
    })

  try {
    const data = await inflightPipeline
    return Response.json(data)
  } catch (error) {
    console.error('Polymarket API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Polymarket data', opportunities: [], hotNowOpportunities: [], todayOpportunities: [], nearCertainOpportunities: [], closingSoonOpportunities: [], longTailOpportunities: [], hotMarkets: [], stats: null },
      { status: 500 }
    )
  }
}

/**
 * Full Polymarket pipeline — fetch markets, score, run LLM screening, build
 * response. Refactored out of GET so SWR can call it as a fire-and-forget
 * background task.
 */
async function runFullPipeline(): Promise<any> {
  try {

    // Lazy resolution check: settle any positions that have closed since last visit.
    // Runs in parallel with market fetch so it doesn't slow the response.
    const resolutionPromise = (async () => {
      try {
        const { runResolutionOnly } = await import('@/lib/services/polymarket-auto-trader')
        const r = await runResolutionOnly()
        if (r.resolved > 0) {
          console.log(`[Pipeline] Lazy resolution: resolved=${r.resolved} positions`)
        }
      } catch (e) {
        console.error('[Pipeline] Lazy resolution failed:', e)
      }
    })()

    // Fetch by volume, volume24hr, AND by endDate (for 24hr coverage)
    const [volumeRes, volume24Res, endDateRes] = await Promise.all([
      // Top-1000 by various sorts — earlier 500 was missing lower-volume but
      // legitimate categories (esports LCK matches, niche events, smaller
      // political races). 1000 captures the long tail.
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=1000', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volume24hr&ascending=false&limit=1000', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=endDate&ascending=true&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
    ])

    if (!volumeRes.ok) {
      throw new Error(`Gamma API error: ${volumeRes.status}`)
    }

    // Merge markets from all three queries, deduplicated by id
    const rawMarkets: GammaMarket[] = await volumeRes.json()
    const existingIds = new Set(rawMarkets.map(m => m.id))

    if (volume24Res.ok) {
      const volume24Markets: GammaMarket[] = await volume24Res.json()
      for (const m of volume24Markets) {
        if (!existingIds.has(m.id)) {
          rawMarkets.push(m)
          existingIds.add(m.id)
        }
      }
    }

    // Merge endDate-sorted markets (captures low/zero-volume markets closing soon)
    if (endDateRes.ok) {
      const endDateMarkets: GammaMarket[] = await endDateRes.json()
      for (const m of endDateMarkets) {
        if (!existingIds.has(m.id)) {
          rawMarkets.push(m)
          existingIds.add(m.id)
        }
      }
    }

    const now = Date.now()

    const recommendations: TradeRecommendation[] = []

    for (const market of rawMarkets) {
      // Skip markets past their end date — these have resolved
      if (market.endDateIso && new Date(market.endDateIso).getTime() < now) {
        continue
      }
      const recs = scoreMarket(market)
      for (const rec of recs) recommendations.push(rec)
    }

    recommendations.sort((a, b) => {
      if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
      return b.expectedValue - a.expectedValue
    })

    // Pre-sort candidates by fast signal score so batch processing prioritizes best opportunities
    // Fast score = near-certain bonus + spread quality + volume momentum (no network calls needed)
    const fastSignalScore = (rec: TradeRecommendation): number => {
      let score = 0
      if (rec.odds >= 0.90) score += 30
      else if (rec.odds >= 0.75) score += 15
      if (rec.market.spread <= 0.03) score += 20
      else if (rec.market.spread <= 0.05) score += 10
      if ((rec.market.volume24hr || 0) >= 50000) score += 15
      else if ((rec.market.volume24hr || 0) >= 10000) score += 8
      if (rec.daysToClose <= 1) score += 20
      else if (rec.daysToClose <= 3) score += 12
      else if (rec.daysToClose <= 7) score += 6
      return score
    }

    // Background research: fire async immediately so response is instant
    // Pre-sort candidates by fast signals so the best ones get researched first
    const topCandidates = recommendations
      .sort((a, b) => fastSignalScore(b) - fastSignalScore(a))
      .slice(0, 30)

    const topByVolume = recommendations
      .sort((a, b) => (b.market.volumeNum - a.market.volumeNum))
      .slice(0, 10)

    // ── Phase 1: Batched one-shot screening (all markets in ONE Groq call) ──
    // This is ~10s for 20 markets vs ~60s for sequential per-market calls.
    // Phase 2 (per-market deep-dive with Opus) is opt-in via a separate
    // endpoint and runs only on user click. DPS classification + skip
    // for low-DPS domains still applies.
    const { screenMarketsBatch, toScreeningInputs } = await import('@/lib/services/polymarket-screening.service')
    const { scoreDomainPredictability, recommendModel } = await import('@/lib/services/dps.service')
    const polymarketResearchModule = await import('@/lib/services/polymarket-research.service')
    const fetchOrderBookImbalance = (polymarketResearchModule as Record<string, unknown>).fetchOrderBookImbalance as ((id: string) => Promise<{ imbalance: number; momentum: 'up' | 'down' | 'neutral' } | null>) | undefined
    const { analyzeTimeEdge } = polymarketResearchModule

    // Pre-fetch order book signals for top-volume candidates (parallel).
    // Function may not exist in the deprecated research service — handled gracefully.
    const obSignals = new Map<string, { imbalance: number; momentum: 'up' | 'down' | 'neutral' }>()
    if (typeof fetchOrderBookImbalance === 'function') {
      await Promise.allSettled(
        topByVolume.map(async (rec) => {
          try {
            const signal = await fetchOrderBookImbalance(rec.market.id)
            if (signal) obSignals.set(rec.market.id, signal)
          } catch { /* skip on error */ }
        })
      )
    }

    // DPS-prioritized candidate selection: high-DPS first (politics, esports, box-office,
    // crypto-milestones), medium-DPS to fill, skip low-DPS. Per-category cap (8) ensures
    // diversity so we don't analyze 30 politics markets and zero crypto-milestones.
    // 40 markets per analysis batch — surfaces more diverse opportunities.
    // With parallel batches, wall time stays manageable (~40s cold).
    const MAX_ANALYSIS = 40
    const CATEGORY_CAP = 8

    // DPS info per market (cached in a side-Map keyed by question).
    const dpsInfo = new Map<string, { tier: 'high' | 'medium' | 'low'; category: string }>()
    for (const rec of recommendations) {
      const dps = scoreDomainPredictability(rec.market.question)
      dpsInfo.set(rec.market.question, { tier: dps.tier, category: dps.category })
    }

    // Time-tiered selection: user trades closing-soon markets daily, so the
    // 2-day window gets top priority. Longer-term markets fall under stricter
    // DPS gating to keep analysis budget focused.
    //
    //   Tier 1 (closing in ≤48h): up to T1_MAX, high+medium DPS
    //   Tier 2 (closing in ≤7d):  fill remaining, high+medium DPS, per-cat cap
    //   Tier 3 (closing later):   high DPS only
    const T1_MAX = 30  // 2-day window — generous slot count
    const T1_DAYS = 2
    const T2_DAYS = 7

    const sortByFast = (arr: TradeRecommendation[]) =>
      arr.slice().sort((a, b) => fastSignalScore(b) - fastSignalScore(a))

    // Bracket-event dedup: keep at most 1 rec per parent event slug (e.g.
    // "elon-musk-of-tweets-april-28-may-5" splits into 30+ price-bracket
    // sub-markets — we pick the highest fast-signal one and skip the rest).
    // Falls back to the question itself when slug is missing.
    const dedupeByEvent = (arr: TradeRecommendation[]): TradeRecommendation[] => {
      const seen = new Set<string>()
      const out: TradeRecommendation[] = []
      for (const r of sortByFast(arr)) {
        // The parent event slug is in the part of the URL before the trailing
        // sub-market slug. Strip the last segment to get the event.
        const m = r.market.url.match(/\/event\/([^/]+)/)
        const key = m ? m[1] : r.market.question.split(/\d/)[0].trim()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(r)
      }
      return out
    }

    // Price-range filter: focus the analysis budget on the "meaty middle"
    // where mispricing creates real EV. Loosened to 5-95% for closing-soon
    // markets (≤2d) — short-window markets often have asymmetric pricing at
    // 92-95% where small edges compound fast since resolution is imminent.
    // Longer-term markets stay 10-90% (extreme prices over months are rarely
    // mispriced enough to overcome lockup cost).
    const inMeatyMiddleClosingSoon = (r: TradeRecommendation) => r.odds >= 0.05 && r.odds <= 0.95
    const inMeatyMiddleLonger      = (r: TradeRecommendation) => r.odds >= 0.10 && r.odds <= 0.90

    const t1 = dedupeByEvent(recommendations.filter(r => r.daysToClose <= T1_DAYS && inMeatyMiddleClosingSoon(r)))
    const t2 = dedupeByEvent(recommendations.filter(r => r.daysToClose > T1_DAYS && r.daysToClose <= T2_DAYS && inMeatyMiddleClosingSoon(r)))
    const t3 = dedupeByEvent(recommendations.filter(r => r.daysToClose > T2_DAYS && inMeatyMiddleLonger(r)))

    const selectedForAnalysis: TradeRecommendation[] = []
    const usedQuestions = new Set<string>()
    const categoryFill: Record<string, number> = {}
    const tierFill = { t1: 0, t2: 0, t3: 0 }

    // Helper: round-robin pick across DPS categories within a tier so we don't
    // end up with 20 'general' picks and 0 esports. Trader insight: lower-
    // volume markets often have more edge because they're less efficient.
    type Tier = 't1' | 't2' | 't3'
    const roundRobinPick = (
      candidates: TradeRecommendation[],
      tierLabel: Tier,
      remainingBudget: () => number,
      acceptDpsTier: (t: 'high' | 'medium' | 'low') => boolean
    ) => {
      // Group by DPS category, each group still in fast-signal order
      const byCategory = new Map<string, TradeRecommendation[]>()
      for (const rec of candidates) {
        if (usedQuestions.has(rec.market.question)) continue
        const dps = dpsInfo.get(rec.market.question)
        if (!dps || !acceptDpsTier(dps.tier)) continue
        const cat = dps.category
        if (!byCategory.has(cat)) byCategory.set(cat, [])
        byCategory.get(cat)!.push(rec)
      }
      // Sort categories by their best fast-signal candidate (so we hit busier
      // categories first within the round but every category gets a turn)
      const cats = Array.from(byCategory.keys())
      // Round-robin: pull one from each category, then rotate
      while (remainingBudget() > 0) {
        let added = false
        for (const cat of cats) {
          if (remainingBudget() <= 0) break
          if ((categoryFill[cat] || 0) >= CATEGORY_CAP) continue
          const arr = byCategory.get(cat)!
          let cand: TradeRecommendation | undefined
          while (arr.length > 0) {
            const next = arr.shift()!
            if (!usedQuestions.has(next.market.question)) {
              cand = next
              break
            }
          }
          if (!cand) continue
          selectedForAnalysis.push(cand)
          usedQuestions.add(cand.market.question)
          categoryFill[cat] = (categoryFill[cat] || 0) + 1
          tierFill[tierLabel]++
          added = true
        }
        if (!added) break
      }
    }

    // Pass 1: tier-1 (≤2d) — high+medium DPS, skip low-DPS noise.
    roundRobinPick(t1, 't1', () => Math.max(0, T1_MAX - selectedForAnalysis.length),
      (tier) => tier !== 'low')

    // Pass 2: tier-2 (≤7d) — high or medium DPS
    roundRobinPick(t2, 't2', () => Math.max(0, MAX_ANALYSIS - selectedForAnalysis.length),
      (tier) => tier !== 'low')

    // Pass 3: tier-3 (longer-term) — high DPS only
    roundRobinPick(t3, 't3', () => Math.max(0, MAX_ANALYSIS - selectedForAnalysis.length),
      (tier) => tier === 'high')

    console.log(
      `[Pipeline] Selected ${selectedForAnalysis.length} markets for LLM analysis ` +
      `(≤24h: ${tierFill.t1}, ≤7d: ${tierFill.t2}, longer: ${tierFill.t3}). ` +
      `Categories: ${JSON.stringify(categoryFill)}`
    )

    // Build MarketForAnalysis array for LLM stage
    const marketsForAnalysis = selectedForAnalysis.map(rec => ({
      question: rec.market.question,
      currentPrice: rec.odds,
      outcomes: rec.market.outcomes as string[],
      endDate: rec.market.endDateIso,
      volume: rec.market.volumeNum,
      liquidity: rec.market.liquidityNum,
    }))

    // Evidence gathering (Google News + DDG per market) was a leftover from
    // the older Groq Llama path — Llama needed concrete evidence in the prompt
    // to reason well. Opus 4.7 reasons effectively from training-data knowledge
    // alone, and the per-market evidence fetch was costing 5-10s of wall time
    // for marginal benefit. Skip it. (To re-enable: import gatherEvidenceBatch
    // and pass evidenceMap to toScreeningInputs below.)
    const evidenceMap = new Map<string, import('@/lib/services/category-research.service').CategoryEvidence>()

    // Stage 2: BATCHED screening — ONE LLM call analyzes all selected markets.
    // Default: Claude Opus 4.7 via `claude -p` subprocess on Max sub.
    // Slow (~60-120s for 25 markets) but deepest reasoning. Auto-fallback
    // chain on failure: Opus → Sonnet → Haiku → Groq so we never end up
    // with 0 results.
    // Override with SCREENING_MODEL=sonnet | haiku | groq for faster paths.
    const marketIds = selectedForAnalysis.map(rec => rec.market.id)
    const screeningInputs = toScreeningInputs(marketsForAnalysis, marketIds, evidenceMap)
    const screeningModel = (process.env.SCREENING_MODEL as 'opus' | 'sonnet' | 'haiku' | 'groq') || 'opus'
    const screeningResults = await screenMarketsBatch(screeningInputs, screeningModel)

    // Build llmResults keyed by question (downstream code expects this shape).
    // Map marketId → analysis, then question → analysis via selectedForAnalysis.
    const llmResults = new Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>()
    for (const rec of selectedForAnalysis) {
      const a = screeningResults.get(rec.market.id)
      if (a) llmResults.set(rec.market.question, a)
    }
    // Build a synthetic edgeResults so downstream loop (DPS tagging) still works.
    // Tag every analysis with the screening model name so the UI shows which
    // brain handled it (OPUS 4.7 / SONNET 4.6 / GROQ 70B).
    const screeningTag =
      screeningModel === 'opus' ? 'OPUS 4.7'
        : screeningModel === 'sonnet' ? 'SONNET 4.6'
        : screeningModel === 'haiku' ? 'HAIKU 4.5'
        : 'GROQ 70B'
    const edgeResults = new Map<string, { analysis: import('@/lib/services/groq-market-analysis').LLMMarketAnalysis; modelUsed: string; dps: ReturnType<typeof scoreDomainPredictability>; dpsMultiplierApplied: number }>()
    for (const rec of selectedForAnalysis) {
      const a = llmResults.get(rec.market.question)
      if (!a) continue
      const dps = scoreDomainPredictability(rec.market.question)
      const mult = dps.tier === 'high' ? 1.0 : dps.tier === 'medium' ? 0.85 : 0.5
      edgeResults.set(rec.market.question, { analysis: a, modelUsed: screeningTag, dps, dpsMultiplierApplied: mult })
    }
    // Apply DPS multiplier to confidence (cap medium-DPS high-conf to medium)
    for (const r of Array.from(edgeResults.values())) {
      if (r.dpsMultiplierApplied < 1.0 && r.analysis.confidence === 'high') {
        r.analysis.confidence = 'medium'
      }
    }
    console.log(`[Pipeline] Batch screening returned ${llmResults.size}/${selectedForAnalysis.length} assessments`)

    // Apply LLM analysis to BOTH sides (YES and NO recs) of every analyzed
    // market. The selection step dedups by question so only one rec per market
    // is sent to the LLM, but downstream filters look at every rec — so we
    // must update both sides here. Side-aware logic below assigns positive EV
    // to the matching-direction rec and 0 to the wrong-side rec.
    for (const rec of recommendations) {
      const analysis = llmResults.get(rec.market.question)
      if (!analysis) continue
      // Log once per question (skip the NO-side dupe log)
      if (rec.outcome === 'Yes' || rec.outcome === '1') {
        console.log(`[Pipeline] MATCHED: "${rec.market.question.substring(0, 40)}" → conf=${analysis.confidence}, edge=${(analysis.edgeSize*100).toFixed(1)}%`)
      }

      const timeAnalysis = analyzeTimeEdge(rec.market.endDateIso, {
        volumeNum: rec.market.volumeNum,
        liquidityNum: rec.market.liquidityNum,
      } as any)

      // Side-aware estimate: detect which side this rec represents by checking
      // the outcome's INDEX in the market's outcomes array — works for
      // 'Yes'/'No' AND team-name markets (e.g. "Hanwha Life Esports" vs
      // "DN SOOPers"). Index 0 = YES-equivalent / first outcome.
      const outcomeIdx = rec.market.outcomes.indexOf(rec.outcome)
      const isYesSide = outcomeIdx === 0 || rec.outcome === 'Yes' || rec.outcome === '1'
      rec.estimatedProbability = isYesSide
        ? analysis.estimatedProbability
        : 1 - analysis.estimatedProbability

      // Side-aware EV: only the rec whose outcome MATCHES the LLM direction
      // gets positive EV. The opposite-side rec sits at 0. 'skip' = abstain.
      // Edge case: even matching direction can produce negative EV when the
      // market over-prices the favorable side (e.g. LLM says NO is 99% likely
      // but market prices NO at 99.7% — paying more than expected value).
      // Floor at 0 so the display stays sane and bets aren't recommended.
      const matchesDirection =
        (analysis.direction === 'yes' && isYesSide) ||
        (analysis.direction === 'no' && !isYesSide)
      if (matchesDirection) {
        const rawEv = (rec.estimatedProbability - rec.odds) / (1 - rec.odds)
        rec.expectedValue = Math.max(0, rawEv)
      } else {
        rec.expectedValue = 0
      }
      rec.reasoning = analysis.reasoning
      rec.timeAnalysis = timeAnalysis
      rec.confidence = analysis.confidence
      rec.llmDirection = analysis.direction

      // Recalculate Kelly with the LLM-informed estimate. The original
      // scoreMarket Kelly used estimatedProb=marketProb (zero bias) so all
      // pre-LLM Kellys are 0. Now that we have a real estimate, compute Kelly
      // on the actual edge so the dashboard's bet-size hint is meaningful.
      if (matchesDirection && rec.expectedValue > 0) {
        const { kellyFraction } = calculateKellyBet(1000, rec.estimatedProbability, rec.odds)
        rec.kellyFraction = kellyFraction
      }

      // ── Improved CV Scoring ──
      // Higher base scores so high-confidence trades can reach 90+
      // Evidence bonus rewards trades backed by real web evidence
      const confidenceBase = { high: 88, medium: 62, low: 30 }
      const baseScore = confidenceBase[analysis.confidence] || 30

      // Edge bonus: +1 per 1% edge, max +7
      const edgeBonus = Math.min(7, Math.round(analysis.edgeSize * 100))

      // Evidence bonus: +2 per piece of evidence cited, max +5
      const evidenceBonus = Math.min(5, (analysis.evidenceCount || 0) * 2)

      rec.convictionScore = Math.min(100, baseScore + edgeBonus + evidenceBonus)
      // Label matches conviction SCORE band so the card color reflects the
      // displayed number. shouldBet=false caps the band at "consider" so a
      // skip recommendation can't show as a green-bg "high" card.
      const score = rec.convictionScore
      if (score >= 90 && analysis.shouldBet) rec.convictionLabel = 'no-brainer'
      else if (score >= 75 && analysis.shouldBet) rec.convictionLabel = 'high'
      else if (score >= 55) rec.convictionLabel = 'consider'
      else rec.convictionLabel = 'risky'
      rec.safetyScore = rec.convictionScore

      // Update upside string with real data
      rec.upside = `Market: ${(rec.odds * 100).toFixed(1)}% → LLM Est: ${(analysis.estimatedProbability * 100).toFixed(1)}% | Edge: ${(analysis.edgeSize * 100).toFixed(1)}%`

      // Add LLM confidence badge and evidence count to reasoning
      const confidenceBadge = analysis.confidence === 'high' ? '🟢 HIGH CONFIDENCE' : analysis.confidence === 'medium' ? '🟡 MEDIUM' : '🔴 LOW'
      const evidenceTag = analysis.evidenceCount > 0 ? ` [${analysis.evidenceCount} sources]` : ''
      rec.reasoning = `[${confidenceBadge}${evidenceTag}] ${analysis.reasoning}`

      // If LLM says don't bet, tag the reasoning as WATCH-ONLY but keep the
      // conviction label in step with the score (no longer auto-collapsing
      // to 'risky' regardless of how strong the analysis was).
      if (!analysis.shouldBet) {
        rec.reasoning = `[⚠️ WATCH ONLY${evidenceTag}] ${analysis.reasoning}`
      }

      // Store evidence in research field
      rec.research = {
        queryUsed: `Evidence-enriched analysis via Groq Llama 3.3 70B`,
        topFindings: analysis.evidence,
        sentiment: analysis.direction === 'yes' ? 'bullish' : analysis.direction === 'no' ? 'bearish' : 'neutral',
        keyInsight: analysis.reasoning,
        confidenceLevel: analysis.confidence,
      } as any

      const obSignal = obSignals.get(rec.market.id)
      if (obSignal) {
        rec.orderBookSignal = { imbalance: obSignal.imbalance, momentum: obSignal.momentum }
      }

      // Tag reasoning with model + DPS info, apply DPS conviction multiplier
      const edgeR = edgeResults.get(rec.market.question)
      if (edgeR) {
        rec.reasoning = `[${edgeR.modelUsed.toUpperCase()} | DPS:${edgeR.dps.tier}/${edgeR.dps.category}] ${rec.reasoning}`
        // DPS multiplier caps low-DPS conviction so noisy domains can't dominate
        rec.convictionScore = Math.round(rec.convictionScore * edgeR.dpsMultiplierApplied)
        rec.safetyScore = rec.convictionScore
      }
    }

    // Adjust fake scores down for UNANALYZED markets so they never outrank real LLM ones
    for (const rec of recommendations) {
      if (!llmResults.has(rec.market.question)) {
        rec.convictionScore = Math.min(rec.convictionScore, 30) // cap unanalyzed at 30
        rec.safetyScore = rec.convictionScore
        rec.confidence = 'low' // ensure the UI badge turns grey/low
        if (rec.convictionLabel === 'no-brainer' || rec.convictionLabel === 'high') {
          rec.convictionLabel = 'risky'
        }
        rec.reasoning = `[⚠️ PENDING LLM ANALYSIS] ${rec.reasoning}`
      }
    }

    // Re-sort: LLM-analyzed bet-worthy first, then by conviction
    recommendations.sort((a, b) => {
      // Prioritize LLM-analyzed opportunities that aren't "WATCH ONLY"
      const aAnalyzed = llmResults.has(a.market.question) && a.convictionLabel !== 'risky' ? 1 : 0
      const bAnalyzed = llmResults.has(b.market.question) && b.convictionLabel !== 'risky' ? 1 : 0
      if (aAnalyzed !== bAnalyzed) return bAnalyzed - aAnalyzed

      // Then by conviction score
      if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
      return b.expectedValue - a.expectedValue
    })

    // Opportunities filter — never recommend a side that Opus thinks will
    // LOSE, and never surface picks the LLM explicitly skipped.
    //   1. Positive-EV picks (real mispricing edges) — must NOT be skip.
    //   2. High-win-probability picks (Opus says THIS side wins ≥50%) — must
    //      ALSO not be skip, otherwise we leak "85% YES, EV=0" cards where
    //      the model actually declined to bet (low confidence, edge below
    //      threshold, or direction-estimate inconsistent → forced skip).
    // Below 50% = Opus thinks this side loses → exclude regardless of how
    // close-to-resolution the market is.
    const filteredRecs = recommendations.filter(r => {
      // Hard exclude: model explicitly skipped (low conf / tiny edge /
      // inconsistent / dropped from batch). EV is 0 for these by construction
      // and surfacing them as "opportunities" is misleading.
      if (r.llmDirection === 'skip') return false
      if (r.expectedValue > 0) return true
      const wasAnalyzed = llmResults.has(r.market.question)
      const opusBacksThisSide = r.estimatedProbability >= 0.50
      return wasAnalyzed && opusBacksThisSide
    })

    // Audit log: how many analyzed markets ended in 'skip' vs actionable.
    // Spike here = prompt or model issue (e.g. Opus returning 'low' conf on
    // everything). Stable low rate = healthy.
    const skipCount = Array.from(llmResults.values()).filter(a => a.direction === 'skip').length
    const totalAnalyzed = llmResults.size
    if (totalAnalyzed > 0) {
      const skipPct = (skipCount / totalAnalyzed * 100).toFixed(0)
      console.log(`[Pipeline] LLM skip rate: ${skipCount}/${totalAnalyzed} (${skipPct}%) — high values mean low confidence or tiny edges`)
    }

    // Dedupe pass 1: both YES and NO recs of the SAME market collapse to the
    // one with higher EV. Was showing every market twice in the opportunities
    // list (once per outcome), which felt repetitive.
    const byQuestion = new Map<string, TradeRecommendation>()
    for (const r of filteredRecs) {
      const existing = byQuestion.get(r.market.question)
      if (!existing || r.expectedValue > existing.expectedValue) {
        byQuestion.set(r.market.question, r)
      }
    }

    // Dedupe pass 2: bracket variants of the same parent event — keep TOP 3
    // highest-EV brackets per event. User wants more closing-today coverage,
    // and bracket markets often have multiple genuinely different prop bets
    // (BTC>$76K vs >$78K vs >$80K thresholds, soccer O/U lines, etc.).
    const PER_EVENT_LIMIT = 3
    const eventGroups = new Map<string, TradeRecommendation[]>()
    for (const r of Array.from(byQuestion.values())) {
      const m = r.market.url.match(/\/event\/([^/]+)/)
      const eventKey = m ? m[1] : r.market.question
      if (!eventGroups.has(eventKey)) eventGroups.set(eventKey, [])
      eventGroups.get(eventKey)!.push(r)
    }
    const allOpportunities: TradeRecommendation[] = []
    for (const [, group] of Array.from(eventGroups.entries())) {
      group.sort((a, b) => b.expectedValue - a.expectedValue)
      allOpportunities.push(...group.slice(0, PER_EVENT_LIMIT))
    }

    // Hot Right Now: ALL markets closing within 3 days, sorted by volume24hr
    // These are the most active trading opportunities RIGHT NOW — show everything regardless of conviction
    const hotNowOpportunities = recommendations
      .filter(r => {
        if (!r.market.endDateIso) return false
        const days = r.daysToClose
        return days <= 3
      })
      .sort((a, b) => (b.market.volume24hr || 0) - (a.market.volume24hr || 0))

    // Closing-Today Analyzed: every market that (a) closes within 24h AND
    // (b) was actually run through Opus 4.7. Sorted by EV descending so the
    // best 24h picks float to top, even if EV < threshold for "opportunities".
    // Shows the user what Opus thinks of TODAY's markets, period.
    const closingTodayAnalyzed = recommendations
      .filter(r => {
        if (!r.market.endDateIso) return false
        if (r.daysToClose > 1) return false
        return llmResults.has(r.market.question)
      })
      .sort((a, b) => b.expectedValue - a.expectedValue)

    // Top 24hr Picks: markets closing within ~18 hours (same-day resolution), sorted by conviction
    const todayOpportunities = recommendations
      .filter(r => {
        if (!r.market.endDateIso) return false
        return r.daysToClose <= 0.75 // ~18 hours
      })
      .sort((a, b) => {
        if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
        return (b.market.volume24hr || 0) - (a.market.volume24hr || 0)
      })

    // Near-Certain Opportunities: high-price markets with good liquidity, closing within 3 days
    // These are the highest-accuracy positions — price >= 90%, volume24hr > $10K, spread < 5%
    const nearCertainOpportunities = recommendations
      .filter(r => {
        if (!r.market.endDateIso) return false
        if (r.odds < 0.90) return false
        if ((r.market.volume24hr || 0) <= 10000) return false
        if (r.market.spread >= 0.05) return false
        return r.daysToClose <= 3
      })
      .sort((a, b) => {
        if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
        return (b.market.volume24hr || 0) - (a.market.volume24hr || 0)
      })

    const hotMarkets: PolymarketMarket[] = rawMarkets
      .filter(m => !m.negRisk && m.liquidityNum > 5000 && m.volumeNum > 50000)
      .slice(0, 30)
      .map(m => {
        let outcomePrices: number[] = []
        try { outcomePrices = JSON.parse(m.outcomePrices || '[]').map(Number) } catch {}
        let outcomes: string[] = []
        try { outcomes = JSON.parse(m.outcomes || '[]') } catch {}
        return {
          id: m.id,
          question: m.question,
          outcomes,
          outcomePrices,
          volumeNum: m.volumeNum,
          liquidityNum: m.liquidityNum,
          volume24hr: m.volume24hr || 0,
          bestBid: m.bestBid ? Number(m.bestBid) : null,
          bestAsk: m.bestAsk ? Number(m.bestAsk) : null,
          spread: m.spread ? Number(m.spread) : 0,
          endDateIso: m.endDateIso || null,
          slug: m.slug || '',
          competitive: m.competitive || 0,
          url: makeMarketUrl(m)
        }
      })

    const responseData = {
      success: true,
      timestamp: Date.now(),
      opportunities: allOpportunities.map(rec => ({
        ...rec,
        closingDate: rec.market.endDateIso ? new Date(rec.market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
        daysToClose: rec.timeAnalysis?.daysToClose ?? 999,
      })),
      // Hot Right Now: markets closing within 3 days, sorted by volume24hr
      hotNowOpportunities: hotNowOpportunities.map(rec => ({
        ...rec,
        closingDate: rec.market.endDateIso ? new Date(rec.market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
        daysToClose: rec.timeAnalysis?.daysToClose ?? 999,
      })),
      // Top 24hr Picks: same-day resolution markets (closing within ~18 hours)
      todayOpportunities: todayOpportunities.map(rec => ({
        ...rec,
        closingDate: rec.market.endDateIso ? new Date(rec.market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
        daysToClose: rec.timeAnalysis?.daysToClose ?? 999,
      })),
      // Near-Certain Opportunities: price >= 90%, volume24hr > $10K, closing within 3 days
      nearCertainOpportunities: nearCertainOpportunities.map(rec => ({
        ...rec,
        closingDate: rec.market.endDateIso ? new Date(rec.market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
        daysToClose: rec.timeAnalysis?.daysToClose ?? 999,
      })),
      // Include pending (no-date) and up to 14-day markets in closing-soon grouping
      closingSoonOpportunities: allOpportunities.filter(r =>
        !r.market.endDateIso ||
        r.timeAnalysis?.tier === 'pending' ||
        r.timeAnalysis?.tier === 'imminent' || r.timeAnalysis?.tier === 'closing-soon' ||
        (r.timeAnalysis?.daysToClose !== undefined && r.timeAnalysis.daysToClose <= 14)
      ),
      // Closing-Today Analyzed: every ≤24h market that Opus actually analyzed,
      // sorted by EV. Includes WATCH-ONLY picks so the user sees what Opus
      // thinks of TODAY's markets even when EV is below the bet threshold.
      closingTodayAnalyzed: closingTodayAnalyzed.map(rec => ({
        ...rec,
        closingDate: rec.market.endDateIso ? new Date(rec.market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
        daysToClose: rec.timeAnalysis?.daysToClose ?? 999,
      })),
      longTailOpportunities: allOpportunities.filter(r => r.longTail !== null),
      hotMarkets,
      stats: {
        marketsAnalyzed: rawMarkets.length,
        // Diagnostic counts so the UI can show "Analyzed N markets, found M opportunities"
        marketsScreened: selectedForAnalysis.length,
        screeningModelUsed: screeningTag,
        opportunitiesFound: allOpportunities.length,
        // Count pending (no-date) and up to 14-day markets as closing-soon
        closingSoonCount: allOpportunities.filter(r =>
          !r.market.endDateIso ||
          r.timeAnalysis?.tier === 'pending' ||
          r.timeAnalysis?.tier === 'imminent' || r.timeAnalysis?.tier === 'closing-soon' ||
          (r.timeAnalysis?.daysToClose !== undefined && r.timeAnalysis.daysToClose <= 14)
        ).length,
        longTailCount: allOpportunities.filter(r => r.longTail !== null).length,
        todayCount: todayOpportunities.length,
        nearCertainCount: nearCertainOpportunities.length,
        highestConviction: allOpportunities[0]?.convictionScore || null,
        avgConviction: allOpportunities.length > 0
          ? Math.round(allOpportunities.reduce((s, r) => s + r.convictionScore, 0) / allOpportunities.length)
          : null,
      },
      analyzedAt: Date.now(),
    }

    // Persist to disk so server restarts can serve the previous analysis
    // immediately while the new run completes in the background.
    saveDiskCache(responseData)

    // Return the response data — the SWR layer in GET wraps caching.
    return responseData
  } catch (error) {
    console.error('[Pipeline] error:', error)
    throw error
  }
}
