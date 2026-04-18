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

  // Closing-soon markets get a relaxed liquidity floor — time pressure makes lower-liquidity
  // markets actionable when they're about to resolve (you don't need deep order books for a
  // bet you'll hold for 24h). Long-dated markets still need $1K+ to filter out dust.
  const liquidityMin = isClosingSoon ? 300 : 1000
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
    // Time-tiered safety floor: closing-soon markets pass at lower scores because the resolution
    // window is short — even a low-quality market is actionable when it resolves in <48h. This is
    // the main lever for "show more 24h opportunities" without polluting the long-dated lists.
    //   ≤2 days: 25  (imminent — short hold, low risk per pick)
    //   ≤7 days: 33  (closing-soon — medium tolerance)
    //   >7 days: 40  (long-dated — full quality bar)
    const safetyMin = daysToClose <= 2 ? 25 : daysToClose <= 7 ? 33 : 40
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
// Fast cache lives for the full LLM cycle so polling requests don't re-fetch 1500 markets
// every 15s while LLM is still running. The pipeline overwrites the cache when it finishes.
const FAST_CACHE_TTL = 60_000  // 60 seconds

// ── Live LLM pipeline progress, surfaced in stats so the UI can show "Analyzing X of Y" ──
// We expose this on every response (overlaid at read time) so even a cached payload reflects
// the current state of the background pipeline rather than the snapshot from when it was built.
const pipelineProgress = {
  active: false,        // true while either runLLMPipeline or runContinuationAnalysis is in-flight
  total: 0,             // markets selected for the current LLM batch
  completed: 0,         // markets whose verdict has been applied (analyzed or fallback-skipped)
  stage: 'idle' as 'idle' | 'pending' | 'evidence' | 'analyzing' | 'continuation',
  startedAt: 0,
  // Last-cycle quota signal — if Groq throttled us heavily, surface it so the UI can show
  // "Groq throttled — waiting for quota" instead of an indefinite spinner.
  lastFallbackRate: 0,
  quotaStarved: false,
}
function resetPipelineProgress() {
  pipelineProgress.active = false
  pipelineProgress.total = 0
  pipelineProgress.completed = 0
  pipelineProgress.stage = 'idle'
}
function overlayProgress<T extends { stats?: any }>(data: T): T {
  if (!data || !data.stats) return data
  return {
    ...data,
    stats: {
      ...data.stats,
      analyzingNow: pipelineProgress.completed,
      analyzingTotal: pipelineProgress.total,
      pipelineActive: pipelineProgress.active,
      pipelineStage: pipelineProgress.stage,
      quotaStarved: pipelineProgress.quotaStarved,
      fallbackRate: pipelineProgress.lastFallbackRate,
    },
  }
}

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

// Detect picks where the LLM signal is structurally weak even if math says +EV.
// These slip through the EV floor with big-looking edges (24%, 35%) but are unreliable:
//  1) Range-bucket questions (mutually-exclusive count buckets, no real signal per bucket)
//  2) Edge inside the LLM's own uncertainty band (more noise than signal)
//  3) 50% base-rate fallback with no research evidence (LLM admitted it doesn't know)
const RANGE_BUCKET_RE = /\b\d+\s*[-–to]+\s*\d+\s*(tweets|posts|points|kills|wins|games|goals|hours|days|weeks|months|years|comments|likes|views|streams|episodes|listings|followers)\b/i

function hasWeakFoundation(r: TradeRecommendation): boolean {
  // 1. Range-bucket variants — only one bucket can win, no real per-bucket signal
  if (RANGE_BUCKET_RE.test(r.market.question)) return true

  // 2. Claimed edge sits inside LLM's own uncertainty band → noise, not signal
  // Only applies when uncertaintyRange is actually reported (deep path); fast path skips this rule.
  if (typeof r.uncertaintyRange === 'number' && r.uncertaintyRange > r.expectedValue) return true

  // 3. LLM EXPLICITLY reported a ~50/50 base rate AND found no evidence → it admitted it doesn't know.
  // Only triggers when baseRate is set to ~0.5 (deep path), not when it's undefined (fast path doesn't compute it).
  if (typeof r.baseRate === 'number' && Math.abs(r.baseRate - 0.5) < 0.02) {
    const noResearch = !r.research || !r.research.topFindings || r.research.topFindings.length === 0
    if (noResearch && r.expectedValue >= 0.10) return true
  }

  return false
}

// Near-certain markets — odds so extreme the max possible edge is mathematically tiny.
// At 99% YES, even a perfect call is worth ~1¢ per dollar. Not worth Groq analysis budget,
// and not worth a slot in the pending list. Analyzed picks at these odds still pass through
// (the LLM verdict is informative once it exists), but we never *select* them for analysis
// or surface them as pending placeholders.
//
// Threshold tuned to 95/5: a 90% pick still has ~10¢/$ max edge if mispriced, so it deserves
// a chance at LLM analysis. Only the truly extreme >95% (≤5¢/$ max) and <5% picks get blocked.
const NEAR_CERTAIN_HIGH = 0.95
const NEAR_CERTAIN_LOW = 0.05

// Apply an LLM analysis verdict to a recommendation. Used in two places:
//  1. When merging cached quick results into fresh recommendations (cross-cycle persistence)
//  2. When the LLM pipeline finishes a fresh analysis
// Keeping this in one helper guarantees both paths produce identical recommendations.
function applyLLMAnalysisToRec(
  rec: TradeRecommendation,
  analysis: import('@/lib/services/groq-market-analysis').LLMMarketAnalysis,
): void {
  rec.estimatedProbability = analysis.estimatedProbability

  // Auto-correct contradictory LLM direction: 8B sometimes returns direction='yes' while
  // estimating prob LOWER than market price (or vice versa). The math is unambiguous —
  // bet NO when estimated < market, bet YES when estimated > market. Trust the numbers,
  // not the direction label.
  const mathSaysNo = analysis.estimatedProbability < rec.odds
  const effectiveDirection: 'yes' | 'no' | 'skip' =
    analysis.direction === 'skip' ? 'skip' :
    mathSaysNo ? 'no' : 'yes'

  // Direction-aware EV: when betting NO, compute EV for the NO side
  if (effectiveDirection === 'no') {
    const noOdds = 1 - rec.odds
    const noEstimate = 1 - analysis.estimatedProbability
    rec.expectedValue = (noEstimate - noOdds) / (1 - noOdds)
  } else {
    rec.expectedValue = (analysis.estimatedProbability - rec.odds) / (1 - rec.odds)
  }
  rec.reasoning = analysis.reasoning
  rec.confidence = analysis.confidence
  if (typeof analysis.baseRate === 'number') rec.baseRate = analysis.baseRate

  // Conviction scoring (mirrors inline logic in runLLMPipeline)
  const confidenceBase = { high: 88, medium: 62, low: 30 }
  const baseScore = confidenceBase[analysis.confidence] || 30
  const edgeBonus = Math.min(7, Math.round(analysis.edgeSize * 100))
  const evidenceBonus = Math.min(5, (analysis.evidenceCount || 0) * 2)
  rec.convictionScore = Math.min(100, baseScore + edgeBonus + evidenceBonus)
  rec.convictionLabel = getConvictionLabel(rec.convictionScore)
  rec.safetyScore = rec.convictionScore
  if (rec.analysisDepth !== 'deep') rec.analysisDepth = 'quick'

  rec.upside = `Market: ${(rec.odds * 100).toFixed(1)}% → LLM Est: ${(analysis.estimatedProbability * 100).toFixed(1)}% | Edge: ${(analysis.edgeSize * 100).toFixed(1)}%`

  const evidenceTag = analysis.evidenceCount > 0 ? ` [${analysis.evidenceCount} sources]` : ''
  if (!analysis.shouldBet) {
    rec.reasoning = `[⚠️ WATCH ONLY${evidenceTag}] ${analysis.reasoning}`
  } else {
    const confBadge = analysis.confidence === 'high' ? 'HIGH' : analysis.confidence === 'medium' ? 'MED' : 'LOW'
    rec.reasoning = `[${confBadge}${evidenceTag}] ${analysis.reasoning}`
  }

  rec.research = {
    queryUsed: `Evidence-enriched analysis via Groq`,
    topFindings: analysis.evidence,
    sentiment: analysis.direction === 'yes' ? 'bullish' : analysis.direction === 'no' ? 'bearish' : 'neutral',
    keyInsight: analysis.reasoning,
    confidenceLevel: analysis.confidence,
  } as any
}
function isNearCertain(r: TradeRecommendation): boolean {
  return r.odds > NEAR_CERTAIN_HIGH || r.odds < NEAR_CERTAIN_LOW
}

// Build the response payload from scored recommendations
function buildResponseData(
  recommendations: TradeRecommendation[],
  rawMarkets: GammaMarket[],
  llmAnalyzed: boolean,
) {
  // Hot now = closing soon. Analyzed entries must clear EV floors; pending entries pass through
  // so the UI can show them in a separate "awaiting analysis" group.
  // Hot-now = anything closing within 3 days. Show everything (pending + analyzed + watch-only)
  // so users see all time-critical markets; the UI badges communicate the verdict.
  const hotNowOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (!r.market.endDateIso) return false
      if (r.daysToClose > 3) return false
      if (RANGE_BUCKET_RE.test(r.market.question)) return false  // never show range buckets
      if (hasWeakFoundation(r)) return false  // catches deep-analysis weak foundations
      // Pending picks at near-certain odds: never show — max edge is too small to matter
      if (r.analysisDepth === 'pending' && isNearCertain(r)) return false
      // Analyzed picks: show even if shouldBet=false (LLM verdict is itself useful info).
      // Only filter out >90% odds + ≤1% edge (true noise).
      if (r.analysisDepth !== 'pending' && r.odds > 0.90 && r.expectedValue <= 0.01) return false
      return true
    })
    .sort((a, b) => (b.market.volume24hr || 0) - (a.market.volume24hr || 0)))

  const todayOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (!r.market.endDateIso) return false
      if (r.daysToClose > 0.75) return false
      if (RANGE_BUCKET_RE.test(r.market.question)) return false
      if (hasWeakFoundation(r)) return false
      // Pending picks at near-certain odds: hide — analysis can't change the math
      if (r.analysisDepth === 'pending' && isNearCertain(r)) return false
      // Show all today-closing picks; UI badges show verdict for analyzed ones
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
      if (hasWeakFoundation(r)) return false
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
      if (hasWeakFoundation(r)) return false
      return true
    })
    .sort((a, b) => {
      const aReturn = (a.expectedValue * a.convictionScore) / 100
      const bReturn = (b.expectedValue * b.convictionScore) / 100
      return bReturn - aReturn
    }))

  // Main opportunities list. Pending picks always pass through. Analyzed picks pass if they have
  // EV OR they're closing within 3 days (time-critical — show LLM verdict even if "skip").
  // Long-term analyzed picks need real EV to make the cut.
  const allOpportunities = dedupByTopic(recommendations
    .filter(r => {
      if (RANGE_BUCKET_RE.test(r.market.question)) return false  // never show range buckets
      if (hasWeakFoundation(r)) return false                      // never show weak-foundation picks
      // Pending picks at near-certain odds: hide — they crowd out real opportunities
      // and even a perfect LLM call can't produce meaningful edge here
      if (r.analysisDepth === 'pending' && isNearCertain(r)) return false
      if (r.analysisDepth === 'pending') return true              // show pending up-front
      // ALL analyzed picks pass through — keeping them visible prevents the "card disappears
      // when LLM says skip" flicker. The UI badges shouldBet=false picks as ⚠️ WATCH ONLY,
      // so the verdict is communicated without removing the card. Only the truly noisy long-tail
      // (long-dated, deep underdog, no edge) gets filtered.
      if (r.odds < 0.30 && r.expectedValue < MIN_MEANINGFUL_EV && r.daysToClose > 7) return false
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
    // Overlay live pipeline progress so polling clients see fresh "Analyzing X of Y" counters
    // even while serving the same cached opportunities payload.
    if (cachedResponse && cachedResponse.expiry > Date.now()) {
      return Response.json(overlayProgress(cachedResponse.data))
    }
    if (llmPipelineRunning && cachedResponse) {
      return Response.json(overlayProgress(cachedResponse.data))
    }

    // Phase 2: Fetch markets and return fast-scored results (~3s)
    // We deliberately do NOT use endDate-ascending sort — Gamma API returns thousands of
    // expired-but-unresolved markets at the head of that stream (verified empirically:
    // even offset=500 is still in -972h expired sports/election markets). Instead we
    // page volume24hr twice to get 1000 deep on actually-trading markets, where the
    // genuine closing-soon picks live.
    const [volumeRes, volume24Res, volume24Page2Res] = await Promise.all([
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volume24hr&ascending=false&limit=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volume24hr&ascending=false&limit=500&offset=500', { headers: { 'Accept': 'application/json' }, cache: 'no-store' }),
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
    if (volume24Page2Res.ok) {
      const volume24Page2Markets: GammaMarket[] = await volume24Page2Res.json()
      for (const m of volume24Page2Markets) {
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

    // ── Merge any existing analysis results into fast scores ──
    // Deep results (70B + research) take priority; quick results (8B) fill the gaps.
    // Both caches are file-backed and persist across the in-memory cache cycle, so once
    // a market has been analyzed it stays analyzed for the full TTL (15min quick / 30min deep)
    // even if the response cache evicts. This is what lets analyzed picks accumulate over time
    // instead of every cycle starting from scratch.
    const { getQuickResult } = await import('@/lib/services/quick-analysis-cache')
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
        continue
      }
      const quickResult = getQuickResult(rec.market.id)
      if (quickResult) {
        applyLLMAnalysisToRec(rec, quickResult.analysis)
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
      // Seed pipeline progress so a poll between fast-response and selection still shows "active".
      // total/completed start at 0 and get filled in once the LLM stage actually picks markets.
      pipelineProgress.active = true
      pipelineProgress.total = 0
      pipelineProgress.completed = 0
      pipelineProgress.stage = 'pending'
      pipelineProgress.startedAt = Date.now()
      runLLMPipeline(recommendations, rawMarkets).catch(err => {
        console.error('[LLM Pipeline] Error:', err)
        // On error, the continuation pass won't run, so we have to clear progress ourselves
        // — otherwise the UI sticks on "analyzing" forever.
        resetPipelineProgress()
      }).finally(() => {
        llmPipelineRunning = false
        // Don't reset progress on success — the continuation pass takes over and will reset
        // itself when the second batch finishes.
      })
    }

    return Response.json(overlayProgress(fastData))
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

    // Pre-filter: skip markets that waste Groq quota:
    //   - range buckets (get dropped by hasWeakFoundation anyway)
    //   - near-certain markets (<5¢/$ max edge regardless of LLM verdict)
    //   - markets already analyzed in this cycle (deep or quick cache merged earlier)
    //
    // The third filter is what makes batch sizes effective: instead of re-analyzing the same
    // 27 markets every cycle, we only spend quota on new candidates, and the analyzed pool
    // grows monotonically until cache TTL.
    // Pull in the staleness checker so drifted-cached markets get re-queued for analysis.
    // We don't *evict* them from the cache — they keep rendering their existing verdict to
    // the user — we just make sure they're included in this cycle's Groq batch so the verdict
    // gets refreshed in the background. Without this, drifted picks would render the same
    // (now-stale) verdict for the entire 15-minute TTL, never getting updated.
    const { isQuickResultStale } = await import('@/lib/services/quick-analysis-cache')
    const analyzableRecommendations = recommendations.filter(r =>
      !RANGE_BUCKET_RE.test(r.market.question) &&
      !isNearCertain(r) &&
      // Either never-analyzed (pending), OR cached but the cached verdict is stale enough
      // to warrant a refresh. Cached-stale recs already render their cached verdict to the
      // user; re-analyzing them in the background just updates the underlying numbers when
      // the new Groq call lands. Without this second clause, drifted markets would never
      // get refreshed (they'd be excluded as "already analyzed") until TTL fully expired.
      (r.analysisDepth === 'pending' || isQuickResultStale(r.market.id, r.odds))
    )

    const topCandidates = [...analyzableRecommendations]
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
    // Larger batches now that the cross-cycle quick cache prevents duplicate analysis.
    // Each cycle only spends LLM quota on markets without a fresh cached verdict, so we can
    // afford to push more candidates per cycle and accumulate analyzed picks faster.
    const MAX_ANALYSIS = 20  // first batch — bumped from 12
    const CONTINUATION_BATCH = 25  // background expansion — bumped from 15

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

    // Pass 0 (priority): markets closing within 24h get analyzed first.
    // These are time-critical — the user can act on them today, so they need real LLM scoring fast.
    // Claim up to half the budget; remaining slots go to the diversity passes below.
    // We track which questions are closing-soon so the LLM stage can give them their own
    // small-batch (= higher quality) Groq call, separate from the bigger bulk-batch.
    const closingSoonQuestions = new Set<string>()
    const CLOSING_SOON_BUDGET = Math.ceil(MAX_ANALYSIS / 2)
    const closingSoonCandidates = analyzableRecommendations
      .filter(r => r.daysToClose <= 1 && (r.market.volume24hr || 0) > 1000)
      .sort((a, b) => {
        // Sooner first, then higher volume as tiebreaker
        if (Math.abs(a.daysToClose - b.daysToClose) > 0.05) return a.daysToClose - b.daysToClose
        return (b.market.volume24hr || 0) - (a.market.volume24hr || 0)
      })
    for (const rec of closingSoonCandidates) {
      if (selectedForAnalysis.length >= CLOSING_SOON_BUDGET) break
      if (usedQuestions.has(rec.market.question)) continue
      const topic = topicKey(rec.market.question)
      if (usedTopics.has(topic)) continue
      selectedForAnalysis.push(rec)
      usedQuestions.add(rec.market.question)
      usedTopics.add(topic)
      closingSoonQuestions.add(rec.market.question)
      const cat = categorize(rec.market.question)
      categoryCounts[cat as keyof typeof categoryCounts] = (categoryCounts[cat as keyof typeof categoryCounts] || 0) + 1
    }
    console.log(`[LLM Pipeline] Closing-soon (≤24h) priority: ${selectedForAnalysis.length} markets selected`)

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
        const candidates = analyzableRecommendations
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
    const valueCandidates = analyzableRecommendations
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
    const remainingCandidates = analyzableRecommendations
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

    // Now that selection is done, we know how many markets are about to be processed.
    // The UI uses this to render "Analyzing X of Y" rather than a generic spinner.
    pipelineProgress.total = selectedForAnalysis.length
    pipelineProgress.completed = 0
    pipelineProgress.stage = 'evidence'

    // Stage 1: Gather evidence for all selected markets in parallel
    const { gatherEvidenceBatch } = await import('@/lib/services/category-research.service')
    const evidenceMap = await gatherEvidenceBatch(marketsForAnalysis.map(m => m.question))
    console.log(`[Pipeline] Gathered evidence for ${evidenceMap.size} markets`)

    pipelineProgress.stage = 'analyzing'

    // Stage 2: Two-tier multi-batch LLM analysis.
    //
    // Old approach: 1 Groq call per market (20 markets = 20 calls = 429 storm on free tier).
    // New approach: pack many markets into one prompt and ask for an array of verdicts.
    //   - Tier A (closing-soon ≤24h): SMALL batches of 4 → higher reasoning quality per market.
    //     The user acts on these today, so verdict quality matters more than throughput.
    //   - Tier B (everything else): LARGE batches of 12 → minimal API calls for bulk triage.
    //     Total Groq calls drop from 20 to ~2-3 (1 small + 1-2 large), staying well under the
    //     free-tier RPM limit and ending the 429 storm.
    const { analyzeMarketsMultiBatch } = await import('@/lib/services/groq-market-analysis')

    const closingSoonForLLM = marketsForAnalysis.filter(m => closingSoonQuestions.has(m.question))
    const restForLLM = marketsForAnalysis.filter(m => !closingSoonQuestions.has(m.question))

    // Run the two tiers in parallel — they're independent Groq calls and the high-quality tier
    // shouldn't have to wait on the bulk tier.
    const [closingSoonResults, bulkResults] = await Promise.all([
      closingSoonForLLM.length > 0
        ? analyzeMarketsMultiBatch(closingSoonForLLM, evidenceMap, 4, 'llama-3.1-8b-instant')
        : Promise.resolve(new Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>()),
      restForLLM.length > 0
        ? analyzeMarketsMultiBatch(restForLLM, evidenceMap, 12, 'llama-3.1-8b-instant')
        : Promise.resolve(new Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>()),
    ])

    const llmResults = new Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>()
    closingSoonResults.forEach((v, k) => llmResults.set(k, v))
    bulkResults.forEach((v, k) => llmResults.set(k, v))
    console.log(`[Pipeline] Multi-batch: closing-soon=${closingSoonResults.size}/${closingSoonForLLM.length} | bulk=${bulkResults.size}/${restForLLM.length}`)

    console.log(`[Pipeline] LLM results: ${llmResults.size} analyzed. Keys: ${Array.from(llmResults.keys()).map(k => k.substring(0, 40)).join(' | ')}`)
    console.log(`[Pipeline] Selected questions: ${selectedForAnalysis.map(r => r.market.question.substring(0, 40)).join(' | ')}`)

    // Apply LLM analysis results to each recommendation, and persist real verdicts to the
    // cross-cycle quick cache so the same markets don't get re-analyzed next cycle.
    const { setQuickResult, isRateLimitFallback } = await import('@/lib/services/quick-analysis-cache')
    let persistedCount = 0
    let fallbackSkipped = 0
    for (const rec of selectedForAnalysis) {
      // Each iteration counts toward pipeline progress regardless of outcome (matched, skipped,
      // or fallback) — what the UI cares about is "how many of the planned markets remain".
      pipelineProgress.completed++
      const analysis = llmResults.get(rec.market.question)
      if (!analysis) {
        console.log(`[Pipeline] NO MATCH for: "${rec.market.question.substring(0, 50)}"`)
        continue
      }

      // Detect Groq rate-limit / parse-failure fallback shape (no bet, no edge, no evidence).
      // These have no real signal — leave the rec as 'pending' so it gets a real shot next cycle
      // once Groq quota recovers, instead of locking it in as "analyzed" with junk data.
      if (isRateLimitFallback(analysis)) {
        fallbackSkipped++
        continue
      }

      console.log(`[Pipeline] MATCHED: "${rec.market.question.substring(0, 40)}" → conf=${analysis.confidence}, edge=${(analysis.edgeSize*100).toFixed(1)}%`)

      const timeAnalysis = analyzeTimeEdge(rec.market.endDateIso, {
        volumeNum: rec.market.volumeNum,
        liquidityNum: rec.market.liquidityNum,
      } as any)
      rec.timeAnalysis = timeAnalysis

      applyLLMAnalysisToRec(rec, analysis)

      // Persist to cross-cycle cache so subsequent dashboard requests skip re-analysis
      setQuickResult(rec.market.id, rec.market.question, analysis, rec.odds)
      persistedCount++

      const obSignal = obSignals.get(rec.market.id)
      if (obSignal) {
        rec.orderBookSignal = { imbalance: obSignal.imbalance, momentum: obSignal.momentum }
      }
    }
    console.log(`[Pipeline] Persisted ${persistedCount} quick verdicts to cross-cycle cache (${fallbackSkipped} rate-limit fallbacks skipped)`)

    // ── Throttle-aware gating ────────────────────────────────────────────────
    // If Groq's free tier is starving us (>70% fallback rate on the first batch), piling on
    // a 25-market continuation + 15-market 70B deep pass just generates more 429s and burns
    // wall-clock time without producing verdicts. Better to bail out, persist the few real
    // verdicts we got, and let the next polling cycle retry once quota recovers.
    //
    // We expose this on the module so the dashboard can show "Groq throttled — waiting for quota"
    // instead of an indefinite "Analyzing 0 of N" spinner.
    const totalAttempted = selectedForAnalysis.length
    const fallbackRate = totalAttempted > 0 ? fallbackSkipped / totalAttempted : 0
    const quotaStarved = fallbackRate > 0.7 && totalAttempted >= 5
    if (quotaStarved) {
      console.warn(`[Pipeline] Quota starved (${(fallbackRate * 100).toFixed(0)}% fallback rate) — skipping continuation + deep passes this cycle`)
    }

    // Adjust fake scores down for UNANALYZED markets so they never outrank real LLM ones
    // and tag them as 'pending' so the UI can show them in a separate "awaiting analysis" group.
    //
    // CRITICAL: only demote markets that are ALREADY pending. Recs that already have a cached
    // 'quick' or 'deep' verdict from a previous cycle (merged in earlier from the cross-cycle
    // cache) must NOT get reset to pending just because they weren't in *this* cycle's fresh
    // Groq batch. That was the previous bug — it caused analyzed picks to silently revert to
    // "pending" between fetches whenever the LLM didn't re-pick them this round, making the
    // dashboard churn even though the cached verdicts were still valid.
    for (const rec of recommendations) {
      if (rec.analysisDepth === 'pending' && !llmResults.has(rec.market.question)) {
        // Already at the default pending state and no LLM verdict this cycle → leave as pending,
        // but cap fake scores so unanalyzed markets don't outrank real verdicts in the sort.
        rec.convictionScore = Math.min(rec.convictionScore, 30)
        rec.safetyScore = rec.convictionScore
        rec.confidence = 'low'
        if (rec.convictionLabel === 'no-brainer' || rec.convictionLabel === 'high') {
          rec.convictionLabel = 'risky'
        }
        rec.reasoning = `[⚠️ PENDING LLM ANALYSIS] ${rec.reasoning}`
      }
    }

    // Re-sort: LLM-analyzed bet-worthy first, then by conviction.
    //
    // "Analyzed" = anything with a quick or deep verdict (from this cycle's batch OR the
    // cross-cycle cache merged earlier). Previously this checked only `llmResults.has(...)`,
    // which excluded cached verdicts and pushed them down the list every time their market
    // wasn't re-batched — making the visible top picks shuffle each fetch.
    recommendations.sort((a, b) => {
      const aAnalyzed = (a.analysisDepth === 'quick' || a.analysisDepth === 'deep') && a.convictionLabel !== 'risky' ? 1 : 0
      const bAnalyzed = (b.analysisDepth === 'quick' || b.analysisDepth === 'deep') && b.convictionLabel !== 'risky' ? 1 : 0
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
    // Skip when quota-starved — adding more requests during a 429 storm just delays recovery.
    if (!quotaStarved) {
      runContinuationAnalysis(recommendations, rawMarkets, CONTINUATION_BATCH).catch(err =>
        console.error('[Continuation] Failed:', err)
      )
    } else {
      // Reset progress so the UI doesn't sit on the stale "analyzing" state from the first batch.
      resetPipelineProgress()
    }

    // Fire-and-forget: trigger deep analysis if stale — but delay 30s so Groq rate limits
    // have a chance to reset after the fast pass finishes.
    // Also skip entirely if the 8B pass was starved — 70B is even more rate-limited and would
    // spend its whole budget retrying without landing verdicts.
    if (isDeepRunStale() && !quotaStarved) {
      // Only deep-analyze markets where edge actually exists. Skip:
      //   1. Already-deep results (would be a wasted call)
      //   2. Near-certain prices (≤5% or ≥95%) — these are no-brainer / already-resolved priced;
      //      70B can't extract more edge, and the kelly fraction is already saturated to a tiny
      //      sliver where one extra basis point of accuracy doesn't change the bet sizing.
      //   3. Markets the quick pass said had no edge (kellyFraction ≤ 0). If 8B saw a 50/50
      //      market and decided "skip", running 70B over the same evidence almost never flips
      //      it — and we've already burned that quota. Better to spend deep budget on the
      //      handful of picks where 8B *did* find edge and we want a higher-confidence verdict.
      // Then sort by kellyFraction descending so the 15-slot budget goes to the highest-edge
      // picks first (deep analysis is most valuable where stakes are largest).
      const NEAR_CERTAIN_LOW = 0.05
      const NEAR_CERTAIN_HIGH = 0.95
      const deepCandidates = recommendations
        .filter(r => r.analysisDepth !== 'deep')
        .filter(r => r.odds > NEAR_CERTAIN_LOW && r.odds < NEAR_CERTAIN_HIGH)
        .filter(r => r.kellyFraction > 0)
        .sort((a, b) => b.kellyFraction - a.kellyFraction)
        .slice(0, 15)
      const topKelly = deepCandidates[0]?.kellyFraction ?? 0
      const marketsForDeep = deepCandidates.map(r => ({
        id: r.market.id,
        question: r.market.question,
        currentPrice: r.odds,
        outcomes: r.market.outcomes || [],
        endDate: r.market.endDateIso || null,
        volume: r.market.volumeNum || 0,
        liquidity: r.market.liquidityNum || 0,
      }))
      if (marketsForDeep.length === 0) {
        // After filtering, nothing has edge worth deepening. This happens when the quick pass
        // found a market efficient (kelly≤0 across the board) or every pick is already at a
        // near-certain price. Skip the run entirely instead of burning a Groq budget on noise.
        console.log('[Deep Analysis] Skipped — no markets with edge passed the filter (all near-certain or no-edge per quick pass)')
      } else {
        // Bumped 30s → 60s. The continuation 8B pass typically takes 50-60s when not throttled,
        // so the old 30s timer launched 70B mid-continuation, doubling rate-limit contention.
        // 60s gives the 8B continuation room to finish and Groq quota a chance to recover before
        // the heavier 70B model starts hammering.
        setTimeout(() => {
          runDeepAnalysis(marketsForDeep).catch(err =>
            console.error('[Deep Analysis] Background run failed:', err)
          )
        }, 60_000)
        console.log(`[Deep Analysis] Scheduled in 60s — ${marketsForDeep.length} edge-bearing markets queued (top kelly: ${(topKelly * 100).toFixed(1)}%)`)
      }
    } else if (quotaStarved) {
      console.log('[Deep Analysis] Skipped this cycle (quota starved) — will retry next cycle')
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
    // Pick markets that aren't already analyzed (still 'pending') and have meaningful volume.
    // Skip range-bucket markets (Elon tweet variants etc.) — they'd be filtered out anyway.
    // Sort: closing-within-24h markets first (time-critical), then by fast signal score.
    const pending = recommendations
      .filter(r =>
        r.analysisDepth === 'pending' &&
        (r.market.volume24hr || 0) > 5000 &&
        !RANGE_BUCKET_RE.test(r.market.question)
      )
      .sort((a, b) => {
        const aImminent = a.daysToClose <= 1 ? 1 : 0
        const bImminent = b.daysToClose <= 1 ? 1 : 0
        if (aImminent !== bImminent) return bImminent - aImminent  // imminent first
        return fastSignalScore(b) - fastSignalScore(a)
      })
      .slice(0, batchSize)

    if (pending.length === 0) {
      console.log('[Continuation] No pending markets to analyze')
      return
    }

    // Re-seed progress for the continuation phase so the UI shows fresh "Analyzing X of Y"
    // for the second batch instead of the stale completed-totals from the first pass.
    pipelineProgress.active = true
    pipelineProgress.total = pending.length
    pipelineProgress.completed = 0
    pipelineProgress.stage = 'continuation'

    console.log(`[Continuation] Analyzing ${pending.length} additional markets in background...`)

    const { gatherEvidenceBatch } = await import('@/lib/services/category-research.service')
    const { analyzeMarketsMultiBatch } = await import('@/lib/services/groq-market-analysis')

    const marketsForAnalysis = pending.map(rec => ({
      question: rec.market.question,
      currentPrice: rec.odds,
      outcomes: rec.market.outcomes as string[],
      endDate: rec.market.endDateIso,
      volume: rec.market.volumeNum,
      liquidity: rec.market.liquidityNum,
    }))

    const evidenceMap = await gatherEvidenceBatch(marketsForAnalysis.map(m => m.question))
    // Continuation is pure background bulk triage — pack 15 markets per Groq call so a
    // 25-market batch becomes 2 API calls instead of 25. Lower per-market depth is fine here;
    // the closing-soon picks already got their high-quality small-batch pass earlier.
    const llmResults = await analyzeMarketsMultiBatch(marketsForAnalysis, evidenceMap, 15, 'llama-3.1-8b-instant') as Map<string, import('@/lib/services/groq-market-analysis').LLMMarketAnalysis>

    // Apply results to the recommendation objects, persist real verdicts to the
    // cross-cycle cache, and skip rate-limit fallback responses.
    const { setQuickResult, isRateLimitFallback } = await import('@/lib/services/quick-analysis-cache')
    let upgraded = 0
    let fallbackSkipped = 0
    for (const rec of pending) {
      pipelineProgress.completed++
      const analysis = llmResults.get(rec.market.question)
      if (!analysis) continue
      if (isRateLimitFallback(analysis)) {
        fallbackSkipped++
        continue
      }
      applyLLMAnalysisToRec(rec, analysis)
      setQuickResult(rec.market.id, rec.market.question, analysis, rec.odds)
      upgraded++
    }
    console.log(`[Continuation] Persisted ${upgraded} verdicts (${fallbackSkipped} rate-limit fallbacks skipped)`)

    // Refresh cache so next request sees the new analyzed picks
    const llmData = buildResponseData(recommendations, rawMarkets, true)
    cachedResponse = { data: llmData, expiry: Date.now() + RESPONSE_CACHE_TTL }

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
    console.log(`[Continuation] Upgraded ${upgraded}/${pending.length} markets to analyzed in ${elapsed}s — cache refreshed`)
  } catch (e) {
    console.error('[Continuation] Error:', e instanceof Error ? e.message : e)
  } finally {
    continuationRunning = false
    // Pipeline is fully done — clear progress so the UI hides the "Analyzing X of Y" indicator.
    resetPipelineProgress()
  }
}
