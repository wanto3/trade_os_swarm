import { NextRequest, NextResponse } from 'next/server'
import { ProxyAgent } from 'undici'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export interface RebalancingOutcome {
  id: string
  title: string
  price: number
  bestBid: number | null
  bestAsk: number | null
  volume24hr: number
}

export interface RebalancingOpportunity {
  id: string
  title: string
  slug: string
  url: string
  negRisk: boolean
  outcomeCount: number
  volume24hr: number
  liquidity: number
  priceSum: number
  askSum: number | null
  bidSum: number | null
  diffFromDollar: number
  type: 'mint-and-sell' | 'buy-all-discount' | 'overpriced-basket' | 'discounted-basket' | 'balanced'
  headline: string
  explanation: string
  actionGuidance: string
  profitPercent: number
  outcomes: RebalancingOutcome[]
}

export interface RebalancingResponse {
  generatedAt: string
  eventsScanned: number
  opportunitiesFound: number
  mintAndSellCount: number
  buyAllCount: number
  opportunities: RebalancingOpportunity[]
}

const GAMMA_EVENTS_URL = 'https://gamma-api.polymarket.com/events'

async function fetchJson<T>(url: string): Promise<T> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

  const response = await fetch(url, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
    // @ts-ignore
    dispatcher,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`)
  }
  return response.json() as Promise<T>
}

export async function GET(request: NextRequest) {
  const limit = Math.min(100, Math.max(10, Number(request.nextUrl.searchParams.get('limit') || 40)))

  try {
    const params = new URLSearchParams({
      closed: 'false',
      order: 'volume24hr',
      ascending: 'false',
      limit: String(limit),
    })

    const rawEvents = await fetchJson<any[]>(`${GAMMA_EVENTS_URL}?${params}`)

    const opportunities: RebalancingOpportunity[] = []

    for (const event of rawEvents) {
      // Look for multi-candidate events (negRisk true or events with multiple binary submarkets)
      const markets = event.markets ?? []
      if (markets.length < 2) continue

      // Filter to events that have mutually exclusive sub-markets (typically negRisk: true or candidate selections)
      // If negRisk is false, only include if outcome count is between 2 and 15 (to avoid non-mutually exclusive 300-player prop lists)
      if (!event.negRisk && markets.length > 20) continue

      let priceSum = 0
      let askSum = 0
      let bidSum = 0
      let validAsksCount = 0
      let validBidsCount = 0
      let totalVolume = 0

      const parsedOutcomes: RebalancingOutcome[] = []

      for (const m of markets) {
        let price = 0
        try {
          const prices = JSON.parse(m.outcomePrices || '[]')
          price = Number(prices[0] || 0)
        } catch {}

        priceSum += price
        totalVolume += Number(m.volume24hr || 0)

        const bestAsk = m.bestAsk !== undefined && m.bestAsk !== null && m.bestAsk !== '' ? Number(m.bestAsk) : null
        const bestBid = m.bestBid !== undefined && m.bestBid !== null && m.bestBid !== '' ? Number(m.bestBid) : null

        if (bestAsk !== null && bestAsk > 0 && bestAsk <= 1) {
          askSum += bestAsk
          validAsksCount++
        }
        if (bestBid !== null && bestBid > 0 && bestBid <= 1) {
          bidSum += bestBid
          validBidsCount++
        }

        parsedOutcomes.push({
          id: String(m.id),
          title: m.groupItemTitle || m.question?.replace(event.title, '').trim() || m.question || 'Outcome',
          price,
          bestBid,
          bestAsk,
          volume24hr: Number(m.volume24hr || 0),
        })
      }

      // Sort outcomes by price desc
      parsedOutcomes.sort((a, b) => b.price - a.price)

      const hasAllAsks = validAsksCount === markets.length
      const hasAllBids = validBidsCount === markets.length

      const diffFromDollar = priceSum - 1.00

      let type: RebalancingOpportunity['type'] = 'balanced'
      let headline = 'Fairly Balanced Basket'
      let explanation = 'The combined market price is close to the theoretical $1.00 fair value.'
      let actionGuidance = 'Spread is tight. Monitor for breaking news or liquidity sweeps.'
      let profitPercent = 0

      // Scenario 1: Mint & Sell Arbitrage (Bid Sum > $1.00)
      if (hasAllBids && bidSum > 1.01) {
        type = 'mint-and-sell'
        profitPercent = (bidSum - 1.00) * 100
        headline = `Mint & Sell Arb: +${profitPercent.toFixed(1)}% Instant Profit`
        explanation = `Buyers are bidding a combined $${bidSum.toFixed(3)} across all outcomes. Since 1 complete set costs exactly $1.00 USDC to mint, you can mint and instantly sell into existing bids.`
        actionGuidance = `1. Deposit $1.00 USDC to split/mint all ${markets.length} outcome shares.\n2. Immediately sell each share to current highest bidders for $${bidSum.toFixed(3)}.\n3. Pocket the +$${(bidSum - 1).toFixed(3)} difference instantly.`
      }
      // Scenario 2: Buy All Discount (Ask Sum < $1.00)
      else if (hasAllAsks && askSum < 0.985 && askSum > 0.3) {
        type = 'buy-all-discount'
        profitPercent = ((1.00 - askSum) / askSum) * 100
        headline = `Discounted Complete Set: +${profitPercent.toFixed(1)}% Guaranteed Return`
        explanation = `The total cost to purchase 1 share of every candidate is only $${askSum.toFixed(3)}. Because exactly one candidate MUST win and redeem for $1.00, buying every candidate guarantees a profit upon resolution.`
        actionGuidance = `1. Buy 1 share of all ${markets.length} outcomes for a total outlay of $${askSum.toFixed(3)}.\n2. Hold until event resolution.\n3. Collect guaranteed $1.00 payout (+${profitPercent.toFixed(1)}% net gain).`
      }
      // Scenario 3: Overpriced Basket (Hype Distortion)
      else if (priceSum > 1.04) {
        type = 'overpriced-basket'
        profitPercent = (priceSum - 1.00) * 100
        headline = `Overpriced Hype Basket: +${profitPercent.toFixed(1)}% Total Premium`
        explanation = `Combined market prices equal $${priceSum.toFixed(3)} (fair value is $1.00). Retail hype has inflated multiple candidates simultaneously. Selling/shorting long-shots has a statistical mathematical edge.`
        actionGuidance = `Look for low-probability candidates with inflated prices to sell NO or short.`
      }
      // Scenario 4: Underpriced Basket
      else if (priceSum < 0.96 && priceSum > 0.5) {
        type = 'discounted-basket'
        profitPercent = (1.00 - priceSum) * 100
        headline = `Underpriced Basket: -${profitPercent.toFixed(1)}% Total Discount`
        explanation = `Combined market prices equal $${priceSum.toFixed(3)}. The crowd is underpricing the entire field relative to the guaranteed $1.00 payout.`
        actionGuidance = `Consider accumulating discounted candidates or placing limit bids across the field.`
      }

      opportunities.push({
        id: String(event.id || event.slug),
        title: event.title,
        slug: event.slug,
        url: `https://polymarket.com/event/${encodeURIComponent(event.slug)}`,
        negRisk: Boolean(event.negRisk),
        outcomeCount: markets.length,
        volume24hr: totalVolume,
        liquidity: Number(event.liquidity || 0),
        priceSum: Number(priceSum.toFixed(4)),
        askSum: hasAllAsks ? Number(askSum.toFixed(4)) : null,
        bidSum: hasAllBids ? Number(bidSum.toFixed(4)) : null,
        diffFromDollar: Number(diffFromDollar.toFixed(4)),
        type,
        headline,
        explanation,
        actionGuidance,
        profitPercent: Number(profitPercent.toFixed(2)),
        outcomes: parsedOutcomes.slice(0, 8),
      })
    }

    // Rank opportunities:
    // 1. Executable arbitrage first (mint-and-sell or buy-all-discount)
    // 2. High distortion (overpriced / underpriced)
    // 3. Volume
    opportunities.sort((a, b) => {
      const isArbA = a.type === 'mint-and-sell' || a.type === 'buy-all-discount'
      const isArbB = b.type === 'mint-and-sell' || b.type === 'buy-all-discount'
      if (isArbA && !isArbB) return -1
      if (!isArbA && isArbB) return 1
      if (isArbA && isArbB) return b.profitPercent - a.profitPercent
      return Math.abs(b.diffFromDollar) - Math.abs(a.diffFromDollar)
    })

    const mintAndSellCount = opportunities.filter(o => o.type === 'mint-and-sell').length
    const buyAllCount = opportunities.filter(o => o.type === 'buy-all-discount').length

    const responseData: RebalancingResponse = {
      generatedAt: new Date().toISOString(),
      eventsScanned: rawEvents.length,
      opportunitiesFound: opportunities.length,
      mintAndSellCount,
      buyAllCount,
      opportunities,
    }

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[RebalancingAPI] Scan failed:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to scan rebalancing events',
        opportunities: [],
      },
      { status: 502 }
    )
  }
}
