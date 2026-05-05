/**
 * /api/polymarket/fast — Instant market scores, no LLM blocking
 *
 * Returns raw-scored Polymarket opportunities in < 500ms.
 * LLM analysis is pushed asynchronously via /api/polymarket/stream (SSE).
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface FastMarket {
  id: string
  question: string
  outcomes: string[]
  outcomePrices: number[]
  volumeNum: number
  liquidityNum: number
  volume24hr: number
  spread: number
  endDateIso: string | null
  slug: string | null
  eventSlug: string | null
  competitive: number
  bestBid: number | null
  bestAsk: number | null
  url: string
}

interface FastOpportunity {
  id: string
  question: string
  category: string
  outcome: string
  outcomeIndex: number
  odds: number
  safetyScore: number
  estimatedProbability: number
  expectedValue: number
  marketImpliedProb: number
  riskLevel: 'low' | 'medium' | 'high'
  maxBet: number
  kellyFraction: number
  halfKellyBet: number
  recommendedBet: number
  timeTier: string
  daysToClose: number
  closingDate: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  upside: string
  market: FastMarket
  // LLM fields start as null — filled by stream endpoint
  llmEstimate: number | null
  llmConfidence: 'high' | 'medium' | 'low' | null
  llmDirection: 'yes' | 'no' | 'skip' | null
  llmShouldBet: boolean | null
  llmReasoning: string | null
  llmEdge: number | null
  llmModel: string | null
  llmLatencyMs: number | null
  updatedAt: number | null
  convictionScore?: number
  convictionLabel?: 'no-brainer' | 'high' | 'consider' | 'risky'
}

function fastScore(m: FastMarket, price: number): number {
  let score = 0
  if (m.liquidityNum >= 100000) score += 30
  else if (m.liquidityNum >= 50000) score += 25
  else if (m.liquidityNum >= 25000) score += 20
  else if (m.liquidityNum >= 10000) score += 15
  else if (m.liquidityNum >= 5000) score += 10

  if ((m.volume24hr || 0) >= 50000) score += 15
  else if ((m.volume24hr || 0) >= 10000) score += 8

  if (m.spread <= 0.03) score += 20
  else if (m.spread <= 0.05) score += 10
  else if (m.spread <= 0.10) score += 5

  if (m.endDateIso) {
    const days = Math.max(0, Math.ceil((new Date(m.endDateIso).getTime() - Date.now()) / 86400000))
    if (days <= 1) score += 20
    else if (days <= 3) score += 12
    else if (days <= 7) score += 6
  } else {
    score += 20
  }

  if (price >= 0.90) score += 10
  else if (price >= 0.75) score += 5
  else if (price >= 0.10) score += 2

  if (m.competitive >= 0.8) score += 10
  else if (m.competitive >= 0.6) score += 5

  return score
}

function classifyCategory(question: string): string {
  const q = question.toLowerCase()
  if (/\b(fed|rate|tariff|election|presid|congress|senate|law|pass|bill|legislation|executive order|veto)\b/.test(q)) return 'policy'
  if (/\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|trump|meme|coin|etf|on-chain)\b/.test(q)) return 'crypto'
  if (/\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs|spread|margin|over\/under|\+[0-9]+\.[0-9]+|-[0-9]+\.[0-9]+|first half|second half)\b/.test(q)) return 'sports'
  return 'general'
}

function getTimeTier(endDateIso: string | null): { tier: string; daysToClose: number } {
  if (!endDateIso) return { tier: 'pending', daysToClose: 9999 }
  const days = Math.max(0, Math.ceil((new Date(endDateIso).getTime() - Date.now()) / 86400000))
  if (days <= 1) return { tier: 'imminent', daysToClose: days }
  if (days <= 7) return { tier: 'closing-soon', daysToClose: days }
  if (days <= 30) return { tier: 'medium', daysToClose: days }
  return { tier: 'long', daysToClose: days }
}

function makeMarketUrl(m: FastMarket): string {
  const eventSlug = m.eventSlug
  const slug = m.slug

  // Only use slugs if they're valid strings (not null, undefined, "n-a", "undefined", etc.)
  const validEventSlug = eventSlug && slug && typeof eventSlug === 'string' && !['n-a', 'undefined', 'null', ''].includes(eventSlug) && !['n-a', 'undefined', 'null', ''].includes(slug)
  const validSlug = slug && typeof slug === 'string' && !['n-a', 'undefined', 'null', ''].includes(slug)

  if (validEventSlug) return `https://polymarket.com/event/${eventSlug}/${slug}`
  if (validSlug) return `https://polymarket.com/event/${slug}`
  return `https://polymarket.com/event/${m.id}`
}

function calculateKelly(price: number, estimate: number): number {
  if (price >= 0.99 || price <= 0.01) return 0
  const decimal = (1 / price) - 1
  if (decimal <= 0) return 0
  const kelly = (decimal * estimate - (1 - estimate)) / decimal
  return Math.max(0, Math.min(kelly, 0.10))
}

export async function GET() {
  const start = Date.now()
  const now = Date.now()
  const bankroll = 1000

  try {
    const [volumeRes, volume24Res] = await Promise.all([
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=500', {
        headers: { 'Accept': 'application/json' }, cache: 'no-store'
      }),
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volume24hr&ascending=false&limit=500', {
        headers: { 'Accept': 'application/json' }, cache: 'no-store'
      }),
    ])

    if (!volumeRes.ok) throw new Error(`Gamma API ${volumeRes.status}`)

    const rawMarkets: any[] = await volumeRes.json()
    const existingIds = new Set(rawMarkets.map((m: any) => m.id))

    if (volume24Res.ok) {
      const vol24: any[] = await volume24Res.json()
      for (const m of vol24) {
        if (!existingIds.has(m.id)) {
          rawMarkets.push(m)
          existingIds.add(m.id)
        }
      }
    }

    const opportunities: FastOpportunity[] = []

    for (const m of rawMarkets) {
      if (m.negRisk) continue
      if (!m.outcomePrices || !m.outcomes) continue
      if (m.liquidityNum < 5000) continue
      if (m.endDateIso && new Date(m.endDateIso).getTime() < now) continue

      let outcomePrices: number[]
      try {
        outcomePrices = JSON.parse(m.outcomePrices).map(Number).filter((p: number) => !isNaN(p) && p > 0 && p < 1)
        if (outcomePrices.length < 2) continue
      } catch { continue }

      let outcomes: string[]
      try {
        outcomes = JSON.parse(m.outcomes)
      } catch {
        outcomes = ['Yes', 'No']
      }

      const spread = m.spread ? parseFloat(m.spread) : 0.02
      const bestBid = m.bestBid ? parseFloat(m.bestBid) : null
      const bestAsk = m.bestAsk ? parseFloat(m.bestAsk) : null
      const { tier, daysToClose } = getTimeTier(m.endDateIso || null)
      const category = classifyCategory(m.question)

      // Score only outcome index 0 (first outcome) per market
      // The LLM via SSE determines direction — don't show both sides before analysis
      const i = 0
      const price = outcomePrices[0]
      if (price < 0.01 || price > 0.99) continue

      const score = fastScore(m as FastMarket, price)
      // Remove per-market score filter — show all liquid markets
      // UI filters (anyEdge=40, highReturn=5%, etc.) handle user-facing filtering
      // LLM analysis further qualifies opportunities

      const confidence: 'high' | 'medium' | 'low' =
        score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'

      const riskLevel: 'low' | 'medium' | 'high' =
        m.liquidityNum >= 50000 ? 'low' : m.liquidityNum >= 10000 ? 'medium' : 'high'

      const maxBet = Math.min(Math.floor(m.liquidityNum * 0.005 / price), 100)
      const kelly = calculateKelly(price, price) // raw estimate = market price for fast endpoint

      const market: FastMarket = {
        id: m.id,
        question: m.question,
        outcomes,
        outcomePrices,
        volumeNum: m.volumeNum || 0,
        liquidityNum: m.liquidityNum || 0,
        volume24hr: m.volume24hr || 0,
        spread,
        endDateIso: m.endDateIso || null,
        slug: m.slug || null,
        eventSlug: m.events?.[0]?.slug || null,
        competitive: m.competitive || 0,
        bestBid,
        bestAsk,
        url: makeMarketUrl(m as FastMarket),
      }

      const closingDate = m.endDateIso
        ? new Date(m.endDateIso).getTime()
        : now + 365 * 24 * 60 * 60 * 1000

      opportunities.push({
        id: `${m.id}-${i}`,
        question: m.question,
        category,
        outcome: outcomes[i] || 'Yes',
        outcomeIndex: i,
        odds: price,
        safetyScore: score,
        estimatedProbability: price,
        expectedValue: 0,
        marketImpliedProb: price,
        riskLevel,
        maxBet,
        kellyFraction: kelly,
        halfKellyBet: bankroll * kelly / 2,
        recommendedBet: 0,
        timeTier: tier,
        daysToClose,
        closingDate,
        confidence,
        reasoning: `[PENDING LLM] Fast score: ${score} | ${category} | ${tier}`,
        upside: `Market: ${(price * 100).toFixed(1)}% | Pending LLM analysis`,
        market,
        llmEstimate: null,
        llmConfidence: null,
        llmDirection: null,
        llmShouldBet: null,
        llmReasoning: null,
        llmEdge: null,
        llmModel: null,
        llmLatencyMs: null,
        updatedAt: null,
        convictionScore: score,
        convictionLabel: score >= 90 ? 'no-brainer' : score >= 75 ? 'high' : score >= 55 ? 'consider' : 'risky',
      })
    }

    // Sort by fast score, then by volume
    opportunities.sort((a, b) => {
      if (Math.abs(b.safetyScore - a.safetyScore) > 5) return b.safetyScore - a.safetyScore
      return b.market.volumeNum - a.market.volumeNum
    })

    const elapsed = Date.now() - start

    return NextResponse.json({
      success: true,
      timestamp: now,
      elapsedMs: elapsed,
      totalMarkets: rawMarkets.length,
      opportunitiesFound: opportunities.length,
      opportunities: opportunities.slice(0, 100),
    })
  } catch (error) {
    console.error('[/api/polymarket/fast]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch markets', opportunities: [] },
      { status: 500 }
    )
  }
}
