import { NextResponse } from 'next/server'
import { getDeepResult, isDeepRunStale, runDeepAnalysis } from '@/lib/services/deep-analysis.service'
import { getConvictionAdjustments } from '@/lib/services/learning-feedback.service'
import { classifyCategory } from '@/lib/services/category-research.service'

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
  analysisDepth?: 'pending' | 'quick' | 'deep'
  baseRate?: number | null
  uncertaintyRange?: number
  premortemRisks?: string[]
  crossPlatformOdds?: any[]
  divergenceSignal?: 'aligned' | 'divergent' | 'no-data'
  consensusProbability?: number | null
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

    // Zero EV threshold here — let all markets pass through to the LLM stage.
    // The LLM provides the real evidence-based estimate; pre-LLM we just have marketProb + 0 bias.
    // The 5% EV filter is applied AFTER the LLM updates the estimate (in the response filter).
    const evThreshold = 0
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
let cachedResponse: { data: any; expiry: number } | null = null
let llmPipelineRunning = false
let continuationRunning = false
const RESPONSE_CACHE_TTL = 90_000  // 90 seconds
const FAST_CACHE_TTL = 15_000  // 15 seconds — fast results expire quickly so LLM results replace them

// Pre-sort candidates by fast signal score
function fastSignalScore(rec: TradeRecommendation): number {
  let score = 0
  if (rec.odds >= 0.50 && rec.odds <= 0.90) score += 30
  else if (rec.odds >= 0.90) score += 5
  else if (rec.odds >= 0.30) score += 15
  if (rec.market.spread <= 0.03) score += 20
  else if (rec.market.spread <= 0.05) score += 10
  if ((rec.market.volume24hr || 0) >= 50000) score += 15
  else if ((rec.market.volume24hr || 0) >= 10000) score += 8
  if (rec.daysToClose <= 1) score += 20
  else if (rec.daysToClose <= 3) score += 12
  else if (rec.daysToClose <= 7) score += 6
  return score
}

// Topic fingerprint for collapsing range-bucket variants of the same event
// e.g. "Will Elon Musk post 260-279 tweets..." and "...280-299 tweets..." → same topic
function topicFingerprint(q: string): string {
  return q.toLowerCase()
    .replace(/[^a-z\s]/g, '')  // strip numbers and punctuation so ranges collapse
    .split(/\s+/)
    .filter(w => w.length > 2 && !['will', 'the', 'this', 'that', 'from', 'for', 'and', 'with', 'how', 'does', 'has', 'have', 'post', 'between', 'more', 'than', 'less'].includes(w))
    .slice(0, 4)
    .join('-')
}

// Keep only the best recommendation per topic — prevents logically-inconsistent
// picks on mutually-exclusive range buckets of the same event.
function dedupByTopic<T extends TradeRecommendation>(recs: T[]): T[] {
  const bestByTopic = new Map<string, T>()
  for (const r of recs) {
    const key = topicFingerprint(r.market.question)
    const existing = bestByTopic.get(key)
    if (!existing) { bestByTopic.set(key, r); continue }
    // Prefer higher conviction, then higher EV, then higher 24h volume
    const better =
      r.convictionScore !== existing.convictionScore ? r.convictionScore > existing.convictionScore :
      r.expectedValue !== existing.expectedValue ? r.expectedValue > existing.expectedValue :
      (r.market.volume24hr || 0) > (existing.market.volume24hr || 0)
    if (better) bestByTopic.set(key, r)
  }
  // Preserve original order from the input (sorted list comes in pre-ranked)
  const kept = new Set(bestByTopic.values())
  return recs.filter(r => kept.has(r))
}

// Minimum EV we trust — anything below this is within model noise
// (8B LLM can't reliably distinguish a 0.1% edge on a 7% market)
const MIN_MEANINGFUL_EV = 0.02

// Build the response payload from scored recommendations
function buildResponseData(
  recommendations: TradeRecommendation[],
  rawMarkets: GammaMarket[],
  llmAnalyzed: boolean,
) {
  // Hot now = closing soon. Analyzed entries must clear EV floors; pending entries pass through
  // so the UI can show them in a separate "awaiting analysis" group.
  const hotNowOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (!r.market.endDateIso) return false
      if (r.daysToClose > 3) return false
      if (r.analysisDepth === 'pending') return true  // let pending through; UI groups them separately
      if (r.expectedValue < MIN_MEANINGFUL_EV) return false
      if (r.odds > 0.90 && r.expectedValue <= 0.01) return false
      return true
    })
    .sort((a, b) => (b.market.volume24hr || 0) - (a.market.volume24hr || 0)))

  const todayOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (!r.market.endDateIso) return false
      if (r.daysToClose > 0.75) return false
      if (r.analysisDepth === 'pending') return true
      if (r.expectedValue < MIN_MEANINGFUL_EV) return false
      return true
    })
    .sort((a, b) => {
      if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
      return (b.market.volume24hr || 0) - (a.market.volume24hr || 0)
    }))

  const nearCertainOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (!r.market.endDateIso) return false
      if (r.odds < 0.90) return false
      if ((r.market.volume24hr || 0) <= 10000) return false
      if (r.market.spread >= 0.05) return false
      if (r.expectedValue < MIN_MEANINGFUL_EV) return false
      return r.daysToClose <= 3
    })
    .sort((a, b) => {
      if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
      return (b.market.volume24hr || 0) - (a.market.volume24hr || 0)
    }))

  // Value plays are genuine recommendations only — pending entries (CV 30) can't qualify here
  const valuePlayOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (r.analysisDepth === 'pending') return false
      if (r.odds < 0.50 || r.odds > 0.90) return false
      if (r.convictionScore < 55) return false
      if (r.expectedValue < MIN_MEANINGFUL_EV) return false  // must have meaningful edge, not noise
      if (r.market.liquidityNum < 5000) return false
      return true
    })
    .sort((a, b) => {
      const aReturn = (a.expectedValue * a.convictionScore) / 100
      const bReturn = (b.expectedValue * b.convictionScore) / 100
      return bReturn - aReturn
    }))

  // Main opportunities list: real positive EV, dedup by topic, drop noise-level edges on low-odds
  const allOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (r.expectedValue <= 0) return false
      // On low-odds markets, require meaningful EV (noise floor); on 30%+ markets a small edge is real
      if (r.odds < 0.30 && r.expectedValue < MIN_MEANINGFUL_EV) return false
      return true
    })
    .sort((a, b) => b.convictionScore - a.convictionScore))

  const hotMarkets: PolymarketMarket[] = rawMarkets
    .filter(m => !m.negRisk && m.liquidityNum > 5000 && m.volumeNum > 50000)
    .slice(0, 30)
    .map(m => {
      let outcomePrices: number[] = []
      try { outcomePrices = JSON.parse(m.outcomePrices || '[]').map(Number) } catch {}
      let outcomes: string[] = []
      try { outcomes = JSON.parse(m.outcomes || '[]') } catch {}
      return {
        id: m.id, question: m.question, outcomes, outcomePrices,
        volumeNum: m.volumeNum, liquidityNum: m.liquidityNum, volume24hr: m.volume24hr || 0,
        bestBid: m.bestBid ? Number(m.bestBid) : null, bestAsk: m.bestAsk ? Number(m.bestAsk) : null,
        spread: m.spread ? Number(m.spread) : 0, endDateIso: m.endDateIso || null,
        slug: m.slug || '', competitive: m.competitive || 0, url: makeMarketUrl(m)
      }
    })

  const mapRec = (rec: TradeRecommendation) => ({
    ...rec,
    closingDate: rec.market.endDateIso ? new Date(rec.market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
    daysToClose: rec.timeAnalysis?.daysToClose ?? 999,
  })

  return {
    success: true,
    timestamp: Date.now(),
    llmAnalyzed,
    opportunities: allOpportunities.map(mapRec),
    hotNowOpportunities: hotNowOpportunities.map(mapRec),
    todayOpportunities: todayOpportunities.map(mapRec),
    nearCertainOpportunities: nearCertainOpportunities.map(mapRec),
    valuePlayOpportunities: valuePlayOpportunities.map(r => ({ ...mapRec(r), returnPerDollar: r.odds > 0 ? ((1 / r.odds) - 1) : 0 })),
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
      closingSoonCount: allOpportunities.filter(r =>
        !r.market.endDateIso || r.timeAnalysis?.tier === 'pending' ||
        r.timeAnalysis?.tier === 'imminent' || r.timeAnalysis?.tier === 'closing-soon' ||
        (r.timeAnalysis?.daysToClose !== undefined && r.timeAnalysis.daysToClose <= 14)
      ).length,
      longTailCount: allOpportunities.filter(r => r.longTail !== null).length,
      todayCount: todayOpportunities.length,
      nearCertainCount: nearCertainOpportunities.length,
      valuePlayCount: valuePlayOpportunities.length,
      highestConviction: allOpportunities[0]?.convictionScore || null,
      avgConviction: allOpportunities.length > 0
        ? Math.round(allOpportunities.reduce((s, r) => s + r.convictionScore, 0) / allOpportunities.length)
        : null,
    }
  }
}

export async function GET() {
  try {
    // Phase 1: Return cached response instantly if available
    if (cachedResponse && cachedResponse.expiry > Date.now()) {
      return Response.json(cachedResponse.data)
    }
    if (llmPipelineRunning && cachedResponse) {
      return Response.json(cachedResponse.data)
    }

    // Phase 2: Fetch markets and return fast-scored results (~3s)
    const [volumeRes, volume24Res, endDateRes] = await Promise.all([
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volume24hr&ascending=false&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=endDate&ascending=true&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
    ])

    if (!volumeRes.ok) throw new Error(`Gamma API error: ${volumeRes.status}`)

    const rawMarkets: GammaMarket[] = await volumeRes.json()
    const existingIds = new Set(rawMarkets.map(m => m.id))

    if (volume24Res.ok) {
      const volume24Markets: GammaMarket[] = await volume24Res.json()
      for (const m of volume24Markets) {
        if (!existingIds.has(m.id)) { rawMarkets.push(m); existingIds.add(m.id) }
      }
    }
    if (endDateRes.ok) {
      const endDateMarkets: GammaMarket[] = await endDateRes.json()
      for (const m of endDateMarkets) {
        if (!existingIds.has(m.id)) { rawMarkets.push(m); existingIds.add(m.id) }
      }
    }

    const now = Date.now()
    const recommendations: TradeRecommendation[] = []

    for (const market of rawMarkets) {
      if (market.endDateIso && new Date(market.endDateIso).getTime() < now) continue
      const rec = scoreMarket(market)
      if (rec) recommendations.push(rec)
    }

    recommendations.sort((a, b) => {
      if (Math.abs(b.convictionScore - a.convictionScore) > 3) return b.convictionScore - a.convictionScore
      return b.expectedValue - a.expectedValue
    })

    // Default every rec to 'pending' — LLM pipeline upgrades analyzed ones to 'quick',
    // deep analysis upgrades matching ones to 'deep'
    for (const rec of recommendations) {
      rec.analysisDepth = 'pending'
    }

    // ── Merge any existing deep analysis results into fast scores ──
    for (const rec of recommendations) {
      const deepResult = getDeepResult(rec.market.id)
      if (deepResult) {
        rec.analysisDepth = 'deep'
        rec.convictionScore = deepResult.convictionScore
        rec.convictionLabel = getConvictionLabel(rec.convictionScore)
        rec.safetyScore = rec.convictionScore
        rec.baseRate = deepResult.baseRate
        rec.uncertaintyRange = deepResult.uncertaintyRange
        rec.premortemRisks = deepResult.premortemRisks
        rec.crossPlatformOdds = deepResult.crossPlatformOdds
        rec.divergenceSignal = deepResult.divergenceSignal
        rec.consensusProbability = deepResult.consensusProbability
      }
    }

    // Return fast-scored results immediately — no LLM wait
    const fastData = buildResponseData(recommendations, rawMarkets, false)
    // Cache fast results briefly (15s) so they're replaced once LLM finishes
    if (!cachedResponse || cachedResponse.expiry <= Date.now()) {
      cachedResponse = { data: fastData, expiry: Date.now() + FAST_CACHE_TTL }
    }

    // Phase 3: Fire LLM analysis in background — updates cache when done
    if (!llmPipelineRunning) {
      llmPipelineRunning = true
      runLLMPipeline(recommendations, rawMarkets).catch(err => {
        console.error('[LLM Pipeline] Error:', err)
      }).finally(() => { llmPipelineRunning = false })
    }

    return Response.json(fastData)
  } catch (error) {
    console.error('Polymarket API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Polymarket data', opportunities: [], hotNowOpportunities: [], todayOpportunities: [], nearCertainOpportunities: [], valuePlayOpportunities: [], closingSoonOpportunities: [], longTailOpportunities: [], hotMarkets: [], stats: null },
      { status: 500 }
    )
  }
}

// ── Background LLM Pipeline ──────────────────────────────────────────────────
// Runs after fast results are returned. Updates the cache with LLM-enhanced results.
async function runLLMPipeline(recommendations: TradeRecommendation[], rawMarkets: GammaMarket[]) {
    const { analyzeMarketsBatch } = await import('@/lib/services/groq-market-analysis')
    const { analyzeTimeEdge } = await import('@/lib/services/polymarket-research.service')

    const obSignals = new Map<string, any>()

    const topCandidates = [...recommendations]
      .sort((a, b) => fastSignalScore(b) - fastSignalScore(a))
      .slice(0, 30)

    // Select top 10 candidates with category diversity for deeper analysis
    const categorize = (q: string): string => {
      const lower = q.toLowerCase()
      if (lower.includes('bitcoin') || lower.includes('btc') || lower.includes('eth') || lower.includes('crypto') || lower.includes('token')) return 'crypto'
      if (lower.includes('win') && (lower.includes('vs') || lower.includes('cup') || lower.includes('game') || lower.includes('match') || lower.includes('series'))) return 'sports'
      if (lower.includes('trump') || lower.includes('biden') || lower.includes('congress') || lower.includes('senate') || lower.includes('election') || lower.includes('president') || lower.includes('governor')) return 'policy'
      return 'general'
    }

    // Build diverse candidate set: top fast-signal scores + ensure category coverage
    // Dedup by topic fingerprint to avoid analyzing 5 variations of the same question
    const selectedForAnalysis: typeof topCandidates = []
    const usedQuestions = new Set<string>()
    const usedTopics = new Set<string>()
    const categoryCounts = { crypto: 0, sports: 0, policy: 0, general: 0 }
    const MAX_ANALYSIS = 12  // first batch — keep small for <15s wait
    const CONTINUATION_BATCH = 15  // additional markets analyzed in background after first batch

    // Topic fingerprint: first 4 meaningful non-numeric words to group similar markets
    // e.g. "Will Elon Musk post 260-279 tweets..." and "...280-299 tweets..." → same topic
    const topicKey = (q: string): string => {
      return q.toLowerCase()
        .replace(/[^a-z\s]/g, '')  // strip numbers and punctuation
        .split(/\s+/)
        .filter(w => w.length > 2 && !['will', 'the', 'this', 'that', 'from', 'for', 'and', 'with', 'how', 'does', 'has', 'have', 'post', 'between', 'more', 'than', 'less'].includes(w))
        .slice(0, 4)
        .join('-')
    }

    // First pass: add top candidates by fast signal score, deduplicated by topic
    // Now favors 50-90% range (where real edge lives) over 90%+ penny picks
    for (const rec of topCandidates) {
      if (selectedForAnalysis.length >= MAX_ANALYSIS) break
      if (usedQuestions.has(rec.market.question)) continue
      const topic = topicKey(rec.market.question)
      if (usedTopics.has(topic)) continue
      selectedForAnalysis.push(rec)
      usedQuestions.add(rec.market.question)
      usedTopics.add(topic)
      const cat = categorize(rec.market.question)
      categoryCounts[cat as keyof typeof categoryCounts] = (categoryCounts[cat as keyof typeof categoryCounts] || 0) + 1
    }

    // Second pass: ensure at least 2 from each underrepresented category for real diversity
    for (const cat of ['crypto', 'sports', 'policy', 'general'] as const) {
      const minPerCat = 2
      const current = categoryCounts[cat] || 0
      if (current < minPerCat && selectedForAnalysis.length < MAX_ANALYSIS) {
        const candidates = recommendations
          .filter(r => categorize(r.market.question) === cat && !usedQuestions.has(r.market.question))
          .slice(0, minPerCat - current)
        for (const candidate of candidates) {
          if (selectedForAnalysis.length >= MAX_ANALYSIS) break
          const topic = topicKey(candidate.market.question)
          if (usedTopics.has(topic)) continue
          selectedForAnalysis.push(candidate)
          usedQuestions.add(candidate.market.question)
          usedTopics.add(topic)
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
        }
      }
    }

    // Third pass: add mid-range "value play" candidates (50-85% odds, high volume)
    // These have bigger return per dollar — the real edge for the portfolio
    const valueCandidates = recommendations
      .filter(r => r.odds >= 0.50 && r.odds <= 0.85 && !usedQuestions.has(r.market.question))
      .sort((a, b) => (b.market.volume24hr || 0) - (a.market.volume24hr || 0))
    for (const rec of valueCandidates) {
      if (selectedForAnalysis.length >= MAX_ANALYSIS) break
      const topic = topicKey(rec.market.question)
      if (usedTopics.has(topic)) continue
      selectedForAnalysis.push(rec)
      usedQuestions.add(rec.market.question)
      usedTopics.add(topic)
    }

    // Fourth pass: fill remaining slots with any unanalyzed markets by volume
    // This maximizes the number of analyzed opportunities shown
    const remainingCandidates = recommendations
      .filter(r => !usedQuestions.has(r.market.question) && (r.market.volume24hr || 0) > 5000)
      .sort((a, b) => (b.market.volume24hr || 0) - (a.market.volume24hr || 0))
    for (const rec of remainingCandidates) {
      if (selectedForAnalysis.length >= MAX_ANALYSIS) break
      const topic = topicKey(rec.market.question)
      if (usedTopics.has(topic)) continue
      selectedForAnalysis.push(rec)
      usedQuestions.add(rec.market.question)
      usedTopics.add(topic)
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
    // Use fast 8B model for quick pass — 70B is reserved for background deep analysis
    const llmResults = await analyzeMarketsBatch(marketsForAnalysis, evidenceMap, 'llama-3.1-8b-instant') as Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>

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

      // Direction-aware EV: when LLM recommends betting NO, compute EV for the NO side
      if (analysis.direction === 'no') {
        const noOdds = 1 - rec.odds
        const noEstimate = 1 - analysis.estimatedProbability
        rec.expectedValue = (noEstimate - noOdds) / (1 - noOdds)
      } else {
        rec.expectedValue = (analysis.estimatedProbability - rec.odds) / (1 - rec.odds)
      }
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
      // Label always follows the score — consistent with deep merge and learning adjustments
      rec.convictionLabel = getConvictionLabel(rec.convictionScore)
      rec.safetyScore = rec.convictionScore
      // Mark as LLM-analyzed (upgraded to 'deep' later if deep analysis results exist)
      if (rec.analysisDepth !== 'deep') rec.analysisDepth = 'quick'

      // Update upside string with real data
      rec.upside = `Market: ${(rec.odds * 100).toFixed(1)}% → LLM Est: ${(analysis.estimatedProbability * 100).toFixed(1)}% | Edge: ${(analysis.edgeSize * 100).toFixed(1)}%`

      // Add LLM confidence badge and evidence count to reasoning
      const evidenceTag = analysis.evidenceCount > 0 ? ` [${analysis.evidenceCount} sources]` : ''

      // Tag reasoning with bet status
      if (!analysis.shouldBet) {
        rec.reasoning = `[⚠️ WATCH ONLY${evidenceTag}] ${analysis.reasoning}`
      } else {
        const confBadge = analysis.confidence === 'high' ? 'HIGH' : analysis.confidence === 'medium' ? 'MED' : 'LOW'
        rec.reasoning = `[${confBadge}${evidenceTag}] ${analysis.reasoning}`
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
    // and tag them as 'pending' so the UI can show them in a separate "awaiting analysis" group
    for (const rec of recommendations) {
      if (!llmResults.has(rec.market.question) && rec.analysisDepth !== 'deep') {
        rec.analysisDepth = 'pending'
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

    // ── Merge Deep Analysis Results ──────────────────────────────────────────
    for (const rec of recommendations) {
      const deepResult = getDeepResult(rec.market.id)
      if (deepResult) {
        rec.analysisDepth = 'deep'
        rec.convictionScore = deepResult.convictionScore
        rec.convictionLabel = getConvictionLabel(rec.convictionScore)
        rec.safetyScore = rec.convictionScore
        rec.baseRate = deepResult.baseRate
        rec.uncertaintyRange = deepResult.uncertaintyRange
        rec.premortemRisks = deepResult.premortemRisks
        rec.crossPlatformOdds = deepResult.crossPlatformOdds
        rec.divergenceSignal = deepResult.divergenceSignal
        rec.consensusProbability = deepResult.consensusProbability
      }
    }

    // ── Apply Learning Adjustments ───────────────────────────────────────────
    const learningAdj = getConvictionAdjustments()
    if (learningAdj.active) {
      for (const rec of recommendations) {
        const category = classifyCategory(rec.market.question)
        const catAdj = learningAdj.byCategoryAdjustment[category] || 0
        const tierAdj = learningAdj.byTierAdjustment[rec.convictionLabel] || 0
        rec.convictionScore = Math.min(100, Math.max(0, rec.convictionScore + catAdj + tierAdj))
        rec.convictionLabel = getConvictionLabel(rec.convictionScore)
      }
    }

    // Build LLM-enhanced response and cache it for 90 seconds
    const llmData = buildResponseData(recommendations, rawMarkets, true)
    cachedResponse = { data: llmData, expiry: Date.now() + RESPONSE_CACHE_TTL }
    console.log(`[LLM Pipeline] Complete (first batch) — cached LLM-enhanced results`)

    // ── Continuation pass: analyze MORE markets in background, refresh cache when done ──
    // This way users see the first 12 quickly, then more analyzed picks come in over ~10-20s.
    runContinuationAnalysis(recommendations, rawMarkets, CONTINUATION_BATCH).catch(err =>
      console.error('[Continuation] Failed:', err)
    )

    // Fire-and-forget: trigger deep analysis if stale — but delay 30s so Groq rate limits
    // have a chance to reset after the fast pass finishes
    if (isDeepRunStale()) {
      const marketsForDeep = recommendations
        .filter(r => r.analysisDepth !== 'deep')
        .slice(0, 15)
        .map(r => ({
          id: r.market.id,
          question: r.market.question,
          currentPrice: r.odds,
          outcomes: r.market.outcomes || [],
          endDate: r.market.endDateIso || null,
          volume: r.market.volumeNum || 0,
          liquidity: r.market.liquidityNum || 0,
        }))
      setTimeout(() => {
        runDeepAnalysis(marketsForDeep).catch(err =>
          console.error('[Deep Analysis] Background run failed:', err)
        )
      }, 30_000)  // 30s delay — let rate limits cool off
      console.log('[Deep Analysis] Scheduled in 30s to avoid Groq rate-limit contention')
    }
}

// Continuation pass: analyze additional markets after the first batch finishes.
// Runs in the background and refreshes the cached response when complete, so the user
// sees more analyzed picks without waiting on the initial request.
async function runContinuationAnalysis(
  recommendations: TradeRecommendation[],
  rawMarkets: GammaMarket[],
  batchSize: number,
) {
  if (continuationRunning) {
    console.log('[Continuation] Already running, skipping')
    return
  }
  continuationRunning = true
  const startMs = Date.now()
  try {
    // Pick markets that aren't already analyzed (still 'pending') and have meaningful volume
    const pending = recommendations
      .filter(r => r.analysisDepth === 'pending' && (r.market.volume24hr || 0) > 5000)
      .sort((a, b) => fastSignalScore(b) - fastSignalScore(a))
      .slice(0, batchSize)

    if (pending.length === 0) {
      console.log('[Continuation] No pending markets to analyze')
      return
    }

    console.log(`[Continuation] Analyzing ${pending.length} additional markets in background...`)

    const { gatherEvidenceBatch } = await import('@/lib/services/category-research.service')
    const { analyzeMarketsBatch } = await import('@/lib/services/groq-market-analysis')

    const marketsForAnalysis = pending.map(rec => ({
      question: rec.market.question,
      currentPrice: rec.odds,
      outcomes: rec.market.outcomes as string[],
      endDate: rec.market.endDateIso,
      volume: rec.market.volumeNum,
      liquidity: rec.market.liquidityNum,
    }))

    const evidenceMap = await gatherEvidenceBatch(marketsForAnalysis.map(m => m.question))
    const llmResults = await analyzeMarketsBatch(marketsForAnalysis, evidenceMap, 'llama-3.1-8b-instant') as Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>

    // Apply results to the recommendation objects
    let upgraded = 0
    for (const rec of pending) {
      const analysis = llmResults.get(rec.market.question)
      if (!analysis) continue
      rec.estimatedProbability = analysis.estimatedProbability
      if (analysis.direction === 'no') {
        const noOdds = 1 - rec.odds
        const noEstimate = 1 - analysis.estimatedProbability
        rec.expectedValue = (noEstimate - noOdds) / (1 - noOdds)
      } else {
        rec.expectedValue = (analysis.estimatedProbability - rec.odds) / (1 - rec.odds)
      }
      rec.reasoning = analysis.reasoning
      rec.confidence = analysis.confidence
      const confidenceBase = { high: 88, medium: 62, low: 30 }
      const baseScore = confidenceBase[analysis.confidence] || 30
      const edgeBonus = Math.min(7, Math.round(analysis.edgeSize * 100))
      const evidenceBonus = Math.min(5, (analysis.evidenceCount || 0) * 2)
      rec.convictionScore = Math.min(100, baseScore + edgeBonus + evidenceBonus)
      rec.convictionLabel = getConvictionLabel(rec.convictionScore)
      rec.safetyScore = rec.convictionScore
      rec.upside = `Market: ${(rec.odds * 100).toFixed(1)}% → LLM Est: ${(analysis.estimatedProbability * 100).toFixed(1)}% | Edge: ${(analysis.edgeSize * 100).toFixed(1)}%`
      rec.analysisDepth = 'quick'
      upgraded++
    }

    // Refresh cache so next request sees the new analyzed picks
    const llmData = buildResponseData(recommendations, rawMarkets, true)
    cachedResponse = { data: llmData, expiry: Date.now() + RESPONSE_CACHE_TTL }

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
    console.log(`[Continuation] Upgraded ${upgraded}/${pending.length} markets to analyzed in ${elapsed}s — cache refreshed`)
  } catch (e) {
    console.error('[Continuation] Error:', e instanceof Error ? e.message : e)
  } finally {
    continuationRunning = false
  }
}
