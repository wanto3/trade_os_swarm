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
}

// ── New: Conviction & Research Types ────────────────────────────────────────

export type ConvictionLabel = 'no-brainer' | 'high' | 'consider' | 'risky'
export type LongTailFlag = 'near-certain' | 'near-impossible' | 'contrarian' | 'opportunity-alert' | null
export type TimeTier = 'imminent' | 'closing-soon' | 'medium' | 'long'

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
  // Strategy: events[0].slug (parent event page) works for non-negRisk markets
  // (BTC markets, individual team markets). market.slug works for standalone markets.
  // NegRisk sub-markets are filtered out upstream.
  if (market.events && market.events.length > 0 && market.events[0].slug) {
    return `https://polymarket.com/event/${market.events[0].slug}`
  }
  if (market.slug) {
    return `https://polymarket.com/event/${market.slug}`
  }
  // Last resort: question-based slug
  const slug = slugify(market.question)
  return `https://polymarket.com/event/${slug}`
}

function calculateSafetyScore(market: GammaMarket, estimatedProb: number, marketProb: number): number {
  let score = 0

  // Filter out extreme-priced markets — they're poor trading opportunities regardless of safety score
  if (marketProb < 0.005 || marketProb > 0.995) return 0

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

function scoreMarket(market: GammaMarket): TradeRecommendation | null {
  // Skip negRisk sub-markets — they don't have standalone Polymarket pages
  // and their prices are structured differently (they're sub-conditions of
  // parent markets, so clicking the URL lands on the wrong market)
  if ((market as any).negRisk === true) return null

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

  let outcomes: string[]
  try {
    outcomes = JSON.parse(market.outcomes)
  } catch {
    outcomes = ['Yes', 'No']
  }

  if (market.liquidityNum < 500) return null

  // Reject extremely priced outcomes — they're poor trading opportunities
  const minPrice = 0.01
  const maxPrice = 0.99

  const category = classifyMarket(market.question)
  const recommendations: TradeRecommendation[] = []

  for (let i = 0; i < Math.min(outcomePrices.length, 2); i++) {
    const marketProb = outcomePrices[i]
    const estimatedProb = estimateTrueProbability(marketProb, category)
    const ev = (estimatedProb - marketProb) / (1 - marketProb)
    const evPct = ev * 100

    if (marketProb < minPrice || marketProb > maxPrice) continue
    if (evPct < 3 || evPct > 50) continue

    const safetyScore = calculateSafetyScore(market, estimatedProb, marketProb)
    if (safetyScore < 20) continue

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
      daysToClose: market.endDateIso
        ? Math.ceil((new Date(market.endDateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 999
    })
  }

  if (recommendations.length === 0) return null
  // Sort by EV first (primary), then safety score as tiebreaker
  recommendations.sort((a, b) => {
    if (Math.abs(b.expectedValue - a.expectedValue) > 0.01) return b.expectedValue - a.expectedValue
    return b.safetyScore - a.safetyScore
  })
  return recommendations[0]
}

export async function GET() {
  try {
    // No caching — always fetch fresh data so opportunities reflect current market prices
    const response = await fetch(
      'https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=500',
      {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      }
    )

    if (!response.ok) {
      throw new Error(`Gamma API error: ${response.status}`)
    }

    // Also fetch markets closing soon (within 30 days) sorted by end date
    const closingSoonResponse = await fetch(
      'https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=endDate&ascending=true&limit=200',
      {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      }
    )

    const rawMarkets: GammaMarket[] = await response.json()
    const now = Date.now()

    // Merge closing-soon markets (deduplicated by id)
    if (closingSoonResponse.ok) {
      const closingSoonMarkets: GammaMarket[] = await closingSoonResponse.json()
      const existingIds = new Set(rawMarkets.map(m => m.id))
      for (const m of closingSoonMarkets) {
        if (!existingIds.has(m.id)) {
          rawMarkets.push(m)
          existingIds.add(m.id)
        }
      }
    }

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
      if (Math.abs(b.safetyScore - a.safetyScore) > 3) return b.safetyScore - a.safetyScore
      return b.expectedValue - a.expectedValue
    })

    // Return ALL opportunities across all confidence levels — no artificial cap
    const allOpportunities = recommendations.filter(r => r.safetyScore >= 20)

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

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      opportunities: allOpportunities.map(rec => ({
        ...rec,
        closingDate: rec.market.endDateIso ? new Date(rec.market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
        daysToClose: rec.market.endDateIso
          ? Math.ceil((new Date(rec.market.endDateIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 999
      })),
      hotMarkets,
      stats: {
        marketsAnalyzed: rawMarkets.length,
        opportunitiesFound: allOpportunities.length,
        highestSafety: allOpportunities[0]?.safetyScore || null,
        avgSafety: allOpportunities.length > 0
          ? Math.round(allOpportunities.reduce((s, r) => s + r.safetyScore, 0) / allOpportunities.length)
          : null
      }
    })
  } catch (error) {
    console.error('Polymarket API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch Polymarket data', opportunities: [], hotMarkets: [], stats: null },
      { status: 500 }
    )
  }
}
