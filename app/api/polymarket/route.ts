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

function scoreMarket(market: GammaMarket): TradeRecommendation | null {
  // Note: negRisk sub-markets are NOT filtered out — they have their own individual pages
  // on Polymarket (e.g., /event/will-connecticut-win-the-2026-ncaa-tournament). Many
  // short-term markets (NCAA, Masters, elections) are negRisk, so blocking them would
  // miss most urgent opportunities.

  if (!market.outcomePrices || !market.outcomes) return null

  let outcomePrices: number[]
  try {
    const parsed = JSON.parse(market.outcomePrices)
    if (!Array.isArray(parsed) || parsed.length < 2) return null
    outcomePrices = parsed.map(Number).filter(p => !isNaN(p) && p > 0 && p < 1)
    if (outcomePrices.length < 2) return null
  } catch {
    return null
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

  // Conservative: minimum $1K liquidity for all markets
  const liquidityMin = 1000
  if (market.liquidityNum < liquidityMin) return null

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

    // Conservative: minimum 5% EV for all markets — no time-tier shortcuts
    const evThreshold = 0.05
    if (evPct < evThreshold || evPct > 50) continue

    const safetyScore = calculateSafetyScore(market, estimatedProb, marketProb, isImminent || isClosingSoon)
    // Conservative: minimum 40 safety score for all markets
    const safetyMin = 40
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

  if (recommendations.length === 0) return null
  // Sort by conviction score first, then EV
  recommendations.sort((a, b) => {
    if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
    return b.expectedValue - a.expectedValue
  })
  return recommendations[0]
}
// ── Global response cache to prevent concurrent LLM pipeline floods ──────────
// The dashboard auto-refreshes frequently, but LLM analysis takes 30-60s.
// Without this, each refresh spawns a new LLM pipeline, flooding the rate limit.
let cachedResponse: { data: any; expiry: number } | null = null
let pipelineRunning = false
const RESPONSE_CACHE_TTL = 90_000  // 90 seconds

export async function GET() {
  try {
    // If we have a fresh cached response, return it immediately
    if (cachedResponse && cachedResponse.expiry > Date.now()) {
      return Response.json(cachedResponse.data)
    }

    // If another pipeline is already running, return stale cache or wait
    if (pipelineRunning && cachedResponse) {
      return Response.json(cachedResponse.data)
    }

    pipelineRunning = true
    // Fetch by volume, volume24hr, AND by endDate (for 24hr coverage)
    const [volumeRes, volume24Res, endDateRes] = await Promise.all([
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volume24hr&ascending=false&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
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
      const rec = scoreMarket(market)
      if (rec) recommendations.push(rec)
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

    // ── LLM-Powered Deep Analysis (Groq Llama 3.3 70B + Web Evidence) ──────
    // 2-stage pipeline: gather evidence via web search, then feed to LLM
    const { analyzeMarketsBatch } = await import('@/lib/services/groq-market-analysis')
    const { fetchOrderBookImbalance, analyzeTimeEdge } = await import('@/lib/services/polymarket-research.service')

    // Pre-fetch order book signals for top-volume candidates (parallel)
    const obSignals = new Map<string, any>()
    await Promise.allSettled(
      topByVolume.map(async (rec) => {
        try {
          const signal = await fetchOrderBookImbalance(rec.market.id)
          if (signal) obSignals.set(rec.market.id, signal)
        } catch { /* skip on error */ }
      })
    )

    // Select top 10 candidates with category diversity for deeper analysis
    const categorize = (q: string): string => {
      const lower = q.toLowerCase()
      if (lower.includes('bitcoin') || lower.includes('btc') || lower.includes('eth') || lower.includes('crypto') || lower.includes('token')) return 'crypto'
      if (lower.includes('win') && (lower.includes('vs') || lower.includes('cup') || lower.includes('game') || lower.includes('match') || lower.includes('series'))) return 'sports'
      if (lower.includes('trump') || lower.includes('biden') || lower.includes('congress') || lower.includes('senate') || lower.includes('election') || lower.includes('president') || lower.includes('governor')) return 'policy'
      return 'general'
    }

    // Build diverse candidate set: top fast-signal scores + ensure category coverage
    const selectedForAnalysis: typeof topCandidates = []
    const usedQuestions = new Set<string>()
    const categoryCounts = { crypto: 0, sports: 0, policy: 0, general: 0 }
    const MAX_ANALYSIS = 10

    // First pass: add top candidates by fast signal score
    for (const rec of topCandidates) {
      if (selectedForAnalysis.length >= MAX_ANALYSIS) break
      if (usedQuestions.has(rec.market.question)) continue
      selectedForAnalysis.push(rec)
      usedQuestions.add(rec.market.question)
      const cat = categorize(rec.market.question)
      categoryCounts[cat as keyof typeof categoryCounts] = (categoryCounts[cat as keyof typeof categoryCounts] || 0) + 1
    }

    // Second pass: ensure at least 1 from each underrepresented category
    for (const cat of ['crypto', 'sports', 'policy'] as const) {
      if (categoryCounts[cat] === 0 && selectedForAnalysis.length < MAX_ANALYSIS) {
        const candidate = recommendations.find(r => 
          categorize(r.market.question) === cat && !usedQuestions.has(r.market.question)
        )
        if (candidate) {
          selectedForAnalysis.push(candidate)
          usedQuestions.add(candidate.market.question)
        }
      }
    }

    // Build MarketForAnalysis array for LLM stage
    const marketsForAnalysis = selectedForAnalysis.map(rec => ({
      question: rec.market.question,
      currentPrice: rec.odds,
      outcomes: rec.market.outcomes as string[],
      endDate: rec.market.endDateIso,
      volume: rec.market.volumeNum,
      liquidity: rec.market.liquidityNum,
    }))

    // Stage 1: Gather evidence for all selected markets in parallel
    const { gatherEvidenceBatch } = await import('@/lib/services/category-research.service')
    const evidenceMap = await gatherEvidenceBatch(marketsForAnalysis.map(m => m.question))
    console.log(`[Pipeline] Gathered evidence for ${evidenceMap.size} markets`)

    // Stage 2: Run structured LLM analysis with pre-gathered evidence
    const llmResults = await analyzeMarketsBatch(marketsForAnalysis, evidenceMap) as Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>

    console.log(`[Pipeline] LLM results: ${llmResults.size} analyzed. Keys: ${Array.from(llmResults.keys()).map(k => k.substring(0, 40)).join(' | ')}`)
    console.log(`[Pipeline] Selected questions: ${selectedForAnalysis.map(r => r.market.question.substring(0, 40)).join(' | ')}`)

    // Apply LLM analysis results to each recommendation
    for (const rec of selectedForAnalysis) {
      const analysis = llmResults.get(rec.market.question)
      if (!analysis) {
        console.log(`[Pipeline] NO MATCH for: "${rec.market.question.substring(0, 50)}"`)
        continue
      }
      console.log(`[Pipeline] MATCHED: "${rec.market.question.substring(0, 40)}" → conf=${analysis.confidence}, edge=${(analysis.edgeSize*100).toFixed(1)}%`)

      const timeAnalysis = analyzeTimeEdge(rec.market.endDateIso, {
        volumeNum: rec.market.volumeNum,
        liquidityNum: rec.market.liquidityNum,
      } as any)

      // Replace fake estimates with real LLM analysis
      rec.estimatedProbability = analysis.estimatedProbability
      rec.expectedValue = (analysis.estimatedProbability - rec.odds) / (1 - rec.odds)
      rec.reasoning = analysis.reasoning
      rec.timeAnalysis = timeAnalysis
      rec.confidence = analysis.confidence

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
      // Only label "high" if LLM confirmed shouldBet=true + confidence=high
      if (analysis.shouldBet && analysis.confidence === 'high' && rec.convictionScore >= 80) {
        rec.convictionLabel = 'high'
      } else if (analysis.shouldBet && analysis.confidence === 'medium' && rec.convictionScore >= 60) {
        rec.convictionLabel = 'consider'
      } else {
        rec.convictionLabel = 'risky'
      }
      rec.safetyScore = rec.convictionScore

      // Update upside string with real data
      rec.upside = `Market: ${(rec.odds * 100).toFixed(1)}% → LLM Est: ${(analysis.estimatedProbability * 100).toFixed(1)}% | Edge: ${(analysis.edgeSize * 100).toFixed(1)}%`

      // Add LLM confidence badge and evidence count to reasoning
      const confidenceBadge = analysis.confidence === 'high' ? '🟢 HIGH CONFIDENCE' : analysis.confidence === 'medium' ? '🟡 MEDIUM' : '🔴 LOW'
      const evidenceTag = analysis.evidenceCount > 0 ? ` [${analysis.evidenceCount} sources]` : ''
      rec.reasoning = `[${confidenceBadge}${evidenceTag}] ${analysis.reasoning}`

      // If LLM says don't bet, mark it clearly
      if (!analysis.shouldBet) {
        rec.convictionLabel = 'risky'
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

    // Return ALL researched opportunities — no artificial conviction cap
    // Research is now synchronous (waits for completion), so every returned opportunity
    // has a full research-backed conviction score. EV > 0 is the only filter.
    const allOpportunities = recommendations.filter(r => {
      // Only filter out negative EV (market is priced fairly or worse than our estimate)
      if (r.expectedValue <= 0) return false
      return true
    })

    // Hot Right Now: ALL markets closing within 3 days, sorted by volume24hr
    // These are the most active trading opportunities RIGHT NOW — show everything regardless of conviction
    const hotNowOpportunities = recommendations
      .filter(r => {
        if (!r.market.endDateIso) return false
        const days = r.daysToClose
        return days <= 3
      })
      .sort((a, b) => (b.market.volume24hr || 0) - (a.market.volume24hr || 0))

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
      longTailOpportunities: allOpportunities.filter(r => r.longTail !== null),
      hotMarkets,
      stats: {
        marketsAnalyzed: rawMarkets.length,
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
      }
    }

    // Cache the response to prevent concurrent pipeline floods
    cachedResponse = { data: responseData, expiry: Date.now() + RESPONSE_CACHE_TTL }
    pipelineRunning = false

    return Response.json(responseData)
  } catch (error) {
    pipelineRunning = false
    console.error('Polymarket API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Polymarket data', opportunities: [], hotNowOpportunities: [], todayOpportunities: [], nearCertainOpportunities: [], closingSoonOpportunities: [], longTailOpportunities: [], hotMarkets: [], stats: null },
      { status: 500 }
    )
  }
}
