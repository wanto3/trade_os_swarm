import type { TradeRecommendation } from '@/app/api/polymarket/route'
import {
  ensureInitialized,
  getConfig,
  getPositions,
  getOpenPositionByMarketId,
  createPosition,
  resolvePosition,
} from './polymarket-portfolio.service'

const POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

let lastPollTime = 0
let intervalHandle: NodeJS.Timeout | null = null

async function fetchOpportunities(): Promise<TradeRecommendation[]> {
  try {
    const res = await fetch(
      'https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=500',
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) throw new Error(`Gamma API error: ${res.status}`)
    const rawMarkets: any[] = await res.json()

    const now = Date.now()
    const recommendations: TradeRecommendation[] = []

    for (const market of rawMarkets) {
      if ((market as any).negRisk === true) continue
      if (!market.outcomePrices || !market.outcomes) continue
      if (market.liquidityNum < 500) continue

      let outcomePrices: number[]
      try {
        const parsed = JSON.parse(market.outcomePrices)
        outcomePrices = parsed.map(Number).filter((p: number) => !isNaN(p) && p > 0 && p < 1)
        if (outcomePrices.length < 2) continue
      } catch { continue }

      let outcomes: string[]
      try {
        outcomes = JSON.parse(market.outcomes)
      } catch {
        outcomes = ['Yes', 'No']
      }

      if (market.endDateIso && new Date(market.endDateIso).getTime() < now) continue

      const url = market.events?.[0]?.slug
        ? `https://polymarket.com/event/${market.events[0].slug}`
        : market.slug
          ? `https://polymarket.com/event/${market.slug}`
          : `https://polymarket.com/event/${market.id}`

      const q = (market.question || '').toLowerCase()
      let category = 'general'
      if (/\b(fed|rate|tariff|election|presid(ent|ential)|congress|law|pass|convicted|inflation|jobs|nomination)\b/.test(q)) category = 'policy'
      else if (/\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|trump|meme|coin)\b/.test(q)) category = 'crypto'
      else if (/\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs)\b/.test(q)) category = 'sports'

      const categoryBias: Record<string, number> = { crypto: 0.02, sports: 0.01, policy: -0.03, general: 0.0 }
      const bias = categoryBias[category] || 0
      const randomFuzz = (Math.random() - 0.5) * 0.06

      for (let i = 0; i < Math.min(outcomePrices.length, 2); i++) {
        const marketProb = outcomePrices[i]
        if (marketProb < 0.01 || marketProb > 0.99) continue

        const estimatedProb = Math.min(0.94, Math.max(0.06, marketProb + bias + randomFuzz))
        const ev = (estimatedProb - marketProb) / (1 - marketProb)
        const evPct = ev * 100
        if (evPct < 3 || evPct > 50) continue

        // Safety score (simplified)
        let safetyScore = 0
        const liq = market.liquidityNum || 0
        if (liq >= 100000) safetyScore += 30
        else if (liq >= 50000) safetyScore += 25
        else if (liq >= 25000) safetyScore += 20
        else if (liq >= 10000) safetyScore += 15
        else if (liq >= 5000) safetyScore += 10
        else safetyScore += 5

        const vol = market.volumeNum || 0
        if (vol >= 1000000) safetyScore += 20
        else if (vol >= 500000) safetyScore += 15
        else if (vol >= 100000) safetyScore += 10
        else safetyScore += 5

        if (evPct >= 3 && evPct <= 15) safetyScore += 20
        else if (evPct > 15 && evPct <= 25) safetyScore += 15
        else safetyScore += 8

        if ((market.competitive || 0) >= 0.6) safetyScore += 10

        safetyScore = Math.min(100, safetyScore)
        if (safetyScore < 70) continue // HIGH conviction only

        const confidence: 'high' | 'medium' | 'low' = safetyScore >= 70 ? 'high' : safetyScore >= 55 ? 'medium' : 'low'
        const daysToClose = market.endDateIso
          ? Math.ceil((new Date(market.endDateIso).getTime() - now) / (1000 * 60 * 60 * 24))
          : 999

        const rec: TradeRecommendation = {
          market: {
            id: market.id,
            question: market.question,
            outcomes,
            outcomePrices,
            volumeNum: market.volumeNum || 0,
            liquidityNum: market.liquidityNum || 0,
            volume24hr: market.volume24hr || 0,
            bestBid: market.bestBid ? Number(market.bestBid) : null,
            bestAsk: market.bestAsk ? Number(market.bestBid) : null,
            spread: market.spread ? Number(market.spread) : 0,
            endDateIso: market.endDateIso || null,
            slug: market.slug || '',
            competitive: market.competitive || 0,
            url,
          },
          outcome: outcomes[i] || (i === 0 ? 'Yes' : 'No'),
          odds: marketProb,
          estimatedProbability: estimatedProb,
          marketImpliedProb: marketProb,
          expectedValue: ev,
          confidence,
          reasoning: '',
          upside: '',
          riskLevel: liq >= 50000 ? 'low' : liq >= 10000 ? 'medium' : 'high',
          maxBet: Math.min(Math.floor((liq * 0.005) / marketProb), 100),
          safetyScore,
          recommendedBet: 0,
          kellyFraction: 0,
          halfKellyBet: 0,
          closingDate: market.endDateIso ? new Date(market.endDateIso).getTime() : now + 365 * 24 * 60 * 60 * 1000,
          daysToClose,
        }

        recommendations.push(rec)
      }
    }

    // Sort by safety score desc, then EV desc
    recommendations.sort((a, b) => {
      if (Math.abs(b.safetyScore - a.safetyScore) > 3) return b.safetyScore - a.safetyScore
      return b.expectedValue - a.expectedValue
    })

    return recommendations
  } catch (error) {
    console.error('[PolymarketAutoTrader] Failed to fetch opportunities:', error)
    return []
  }
}

async function fetchClosedMarkets(marketIds: string[]): Promise<Map<string, 'yes' | 'no' | 'invalid'>> {
  const results = new Map<string, 'yes' | 'no' | 'invalid'>()
  if (marketIds.length === 0) return results

  // Fetch closed markets from Gamma API
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?closed=true&accepting_orders=false&limit=200`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return results
    const markets: any[] = await res.json()

    const marketIdSet = new Set(marketIds)
    for (const m of markets) {
      if (marketIdSet.has(m.id)) {
        // Determine resolution
        const resolution = (m.resolution || '').toLowerCase()
        const outcomes = m.outcomes ? JSON.parse(m.outcomes) : ['Yes', 'No']
        const outcomePrices = m.outcomePrices ? JSON.parse(m.outcomePrices) : []

        let resolvedAs: 'yes' | 'no' | 'invalid' = 'invalid'
        if (resolution === outcomes[0]?.toLowerCase() || resolution === 'yes' || resolution === '1') {
          resolvedAs = 'yes'
        } else if (resolution === outcomes[1]?.toLowerCase() || resolution === 'no' || resolution === '0') {
          resolvedAs = 'no'
        } else if (resolution && resolution !== '') {
          // Try to match by outcome string
          const idx = outcomes.findIndex((o: string) => o.toLowerCase() === resolution.toLowerCase())
          resolvedAs = idx === 0 ? 'yes' : idx === 1 ? 'no' : 'invalid'
        } else {
          // Fall back to highest price outcome
          if (outcomePrices.length >= 2) {
            resolvedAs = outcomePrices[0] > outcomePrices[1] ? 'yes' : 'no'
          }
        }

        results.set(m.id, resolvedAs)
      }
    }
  } catch (error) {
    console.error('[PolymarketAutoTrader] Failed to fetch closed markets:', error)
  }

  return results
}

async function runPollCycle(): Promise<{ placed: number; resolved: number; errors: string[] }> {
  const result: { placed: number; resolved: number; errors: string[] } = { placed: 0, resolved: 0, errors: [] }

  try {
    await ensureInitialized()
    const cfg = getConfig()

    if (cfg.enabled) {
      // ── Placement Phase ──
      const opportunities = await fetchOpportunities()
      const openPositions = getPositions(true)

      for (const rec of opportunities) {
        if (cfg.confidenceFilter === 'high' && rec.confidence !== 'high') continue

        // Skip if already placed
        if (openPositions.some(p => p.marketId === rec.market.id)) continue

        const position = createPosition(rec)
        if (position) result.placed++
      }
    }

    // ── Resolution Phase ──
    const openPositions = getPositions(true)
    if (openPositions.length > 0) {
      const marketIds = openPositions.map(p => p.marketId)
      const resolutions = await fetchClosedMarkets(marketIds)

      for (const pos of openPositions) {
        const now = Date.now()

        // Flag stale positions (> 90 days) for manual review
        const age = now - pos.placedAt
        if (age > 90 * 24 * 60 * 60 * 1000) {
          console.log(`[PolymarketAutoTrader] Stale position flagged: ${pos.question} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`)
        }

        // Try to resolve from closed markets
        const resolution = resolutions.get(pos.marketId)
        if (resolution) {
          resolvePosition(pos.id, resolution as 'yes' | 'no' | 'invalid')
          result.resolved++
        }
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    console.error('[PolymarketAutoTrader] Poll cycle error:', error)
  }

  return result
}

export function startAutoTrader(): void {
  if (intervalHandle) {
    console.log('[PolymarketAutoTrader] Already running')
    return
  }

  // Run immediately on start
  runPollCycle().then(r => {
    console.log(`[PolymarketAutoTrader] Initial poll: placed=${r.placed}, resolved=${r.resolved}`)
  })

  intervalHandle = setInterval(async () => {
    const r = await runPollCycle()
    console.log(`[PolymarketAutoTrader] Poll cycle: placed=${r.placed}, resolved=${r.resolved}`)
  }, POLL_INTERVAL_MS)

  console.log(`[PolymarketAutoTrader] Started (poll interval: ${POLL_INTERVAL_MS / 1000 / 60} min)`)
}

export function stopAutoTrader(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log('[PolymarketAutoTrader] Stopped')
  }
}

export async function triggerPollCycle(): Promise<{ placed: number; resolved: number; errors: string[] }> {
  return runPollCycle()
}

export function isAutoTraderRunning(): boolean {
  return intervalHandle !== null
}
