/**
 * Cross-Platform Arbitrage Service
 *
 * Scans, matches, and analyzes executable arbitrage and divergence opportunities
 * between Polymarket (crypto/USDC) and Kalshi (CFTC-regulated/USD).
 *
 * Core Concept:
 * When both venues host binary contracts for the exact same event with $1.00 payout:
 *   - Combo A: Buy Polymarket YES ask + Buy Kalshi NO ask
 *   - Combo B: Buy Kalshi YES ask + Buy Polymarket NO ask
 * If combined cost + fees + buffers < $1.00, a riskless payout lock is possible.
 */

import { ProxyAgent } from 'undici'

export interface CrossVenueLeg {
  venue: 'polymarket' | 'kalshi'
  marketId: string
  title: string
  url: string
  outcome: 'Yes' | 'No'
  askPrice: number | null
  askSize: number | null
  feeRate: number
  rules: string | null
  closeTime: string | null
}

export interface CrossPlatformArbitrageOpportunity {
  id: string
  titleSimilarity: number
  eventTitle: string
  polymarket: {
    id: string
    title: string
    url: string
    yesAsk: number | null
    noAsk: number | null
    yesAskSize: number | null
    noAskSize: number | null
    volume24h: number
    closeTime: string | null
  }
  kalshi: {
    ticker: string
    title: string
    url: string
    yesAsk: number | null
    noAsk: number | null
    yesAskSize: number | null
    noAskSize: number | null
    volume24h: number
    closeTime: string | null
    rules: string | null
  }
  metaculus?: {
    probability: number
    url: string
  } | null

  bestCombination: {
    name: 'polymarket-yes + kalshi-no' | 'kalshi-yes + polymarket-no'
    leg1: CrossVenueLeg
    leg2: CrossVenueLeg
    combinedUnitCost: number
    grossProfitPerShare: number
    requestedShares: number
    fillableShares: number
    totalCost: number
    totalFees: number
    transferBuffer: number
    payout: number
    netProfit: number
    netReturnPercent: number
    fillable: boolean
  }

  divergence: {
    polyYesProb: number | null
    kalshiYesProb: number | null
    spreadPercent: number
    favoredSide: 'polymarket-cheaper-yes' | 'kalshi-cheaper-yes' | 'balanced'
  }

  closeTimeDiffHours: number
  status: 'opportunity' | 'near-miss' | 'divergence' | 'insufficient-depth'
  recommendedAction: string
  riskNotes: string[]
}

export interface CrossPlatformScanResult {
  generatedAt: string
  paperOnly: true
  requestedShares: number
  polymarketScanned: number
  kalshiScanned: number
  candidatesFound: number
  profitableCount: number
  divergenceCount: number
  opportunities: CrossPlatformArbitrageOpportunity[]
  assumptions: {
    polyFeeRate: number
    kalshiFeeRate: number
    transferBuffer: number
    minSimilarity: number
  }
  warnings: string[]
}

export interface ScanOptions {
  requestedShares?: number
  marketLimit?: number
  minSimilarity?: number
  transferBuffer?: number
}

// ---------------------------------------------------------------------------
// Network Helpers (with ProxyAgent fallback)
// ---------------------------------------------------------------------------

const POLYMARKET_GAMMA_URL = 'https://gamma-api.polymarket.com/markets'
const POLYMARKET_CLOB_URL = 'https://clob.polymarket.com/books'
const KALSHI_URL = 'https://external-api.kalshi.com/trade-api/v2/markets'

const DEFAULT_POLY_FEE = 0.02 // 2.0% conservative taker fee
const DEFAULT_KALSHI_FEE = 0.02 // 2.0% conservative taker fee
const DEFAULT_TRANSFER_BUFFER = 0.05 // $0.05 per trade buffer for cross-chain / fiat transfers

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
    // @ts-ignore
    dispatcher,
  })

  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`)
  }
  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Polymarket Fetching & Parsing
// ---------------------------------------------------------------------------

interface GammaMarket {
  id?: string
  conditionId?: string
  question?: string
  outcomes?: string | string[]
  clobTokenIds?: string | string[]
  slug?: string
  events?: Array<{ slug?: string }>
  endDate?: string
  endDateIso?: string
  volume24hr?: string | number
  description?: string
  enableOrderBook?: boolean
}

interface PolymarketBook {
  asset_id: string
  asks?: Array<{ price: string | number; size: string | number }>
}

function parseArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validPrice(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed !== null && parsed > 0 && parsed < 1 ? parsed : null
}

function cheapestAsk(book: PolymarketBook | undefined): { price: number; size: number } | null {
  const levels = (book?.asks ?? [])
    .map(level => ({ price: validPrice(level.price), size: numberOrNull(level.size) }))
    .filter((level): level is { price: number; size: number } =>
      level.price !== null && level.size !== null && level.size > 0)
    .sort((a, b) => a.price - b.price)
  return levels[0] ?? null
}

interface InternalPolyMarket {
  id: string
  title: string
  url: string
  yesAsk: number | null
  noAsk: number | null
  yesAskSize: number | null
  noAskSize: number | null
  volume24h: number
  closeTime: string | null
  description: string | null
}

async function fetchPolymarketData(limit: number): Promise<InternalPolyMarket[]> {
  const params = new URLSearchParams({
    closed: 'false',
    accepting_orders: 'true',
    order: 'volume24hr',
    ascending: 'false',
    limit: String(limit),
  })

  const gamma = await fetchJson<GammaMarket[]>(`${POLYMARKET_GAMMA_URL}?${params}`)

  const binary = gamma.flatMap(market => {
    const outcomes = parseArray(market.outcomes)
    const tokens = parseArray(market.clobTokenIds)
    if (!market.id || !market.question || outcomes.length !== 2 || tokens.length !== 2 || market.enableOrderBook === false) {
      return []
    }
    return [{ market, tokens, outcomes }]
  })

  // Fetch CLOB orderbooks in chunks of 100 tokens
  const tokenChunks: string[][] = []
  const allTokens = binary.flatMap(item => item.tokens)
  for (let i = 0; i < allTokens.length; i += 100) {
    tokenChunks.push(allTokens.slice(i, i + 100))
  }

  const bookRequests = tokenChunks.map(chunk =>
    fetchJson<PolymarketBook[]>(POLYMARKET_CLOB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(token_id => ({ token_id }))),
    }).catch(() => [])
  )

  const bookResults = await Promise.allSettled(bookRequests)
  const books = bookResults.flatMap(res => res.status === 'fulfilled' ? res.value : [])
  const byToken = new Map(books.map(b => [String(b.asset_id), b]))

  return binary.map(({ market, tokens }) => {
    const yes = cheapestAsk(byToken.get(tokens[0]))
    const no = cheapestAsk(byToken.get(tokens[1]))
    const slug = market.events?.find(e => e.slug)?.slug ?? market.slug

    return {
      id: String(market.id),
      title: market.question!,
      url: slug ? `https://polymarket.com/event/${encodeURIComponent(slug)}` : 'https://polymarket.com',
      yesAsk: yes?.price ?? null,
      noAsk: no?.price ?? null,
      yesAskSize: yes?.size ?? null,
      noAskSize: no?.size ?? null,
      volume24h: numberOrNull(market.volume24hr) ?? 0,
      closeTime: market.endDateIso ?? market.endDate ?? null,
      description: market.description ?? null,
    }
  })
}

// ---------------------------------------------------------------------------
// Kalshi Fetching & Parsing
// ---------------------------------------------------------------------------

interface KalshiMarketResponse {
  ticker?: string
  title?: string
  yes_sub_title?: string
  no_sub_title?: string
  market_type?: string
  status?: string
  yes_ask_dollars?: string
  no_ask_dollars?: string
  yes_ask_size_fp?: string
  no_ask_size_fp?: string
  volume_24h_fp?: string
  close_time?: string
  updated_time?: string
  rules_primary?: string
}

interface InternalKalshiMarket {
  ticker: string
  title: string
  url: string
  yesAsk: number | null
  noAsk: number | null
  yesAskSize: number | null
  noAskSize: number | null
  volume24h: number
  closeTime: string | null
  rules: string | null
}

async function fetchKalshiData(limit: number): Promise<InternalKalshiMarket[]> {
  const params = new URLSearchParams({
    status: 'open',
    mve_filter: 'exclude',
    limit: String(Math.max(limit, 200)),
  })

  const data = await fetchJson<{ markets?: KalshiMarketResponse[] }>(`${KALSHI_URL}?${params}`)

  return (data.markets ?? [])
    .filter(m => m.ticker && m.title && (!m.market_type || m.market_type === 'binary'))
    .map(m => ({
      ticker: m.ticker!,
      title: m.title!,
      url: `https://kalshi.com/markets/${encodeURIComponent(m.ticker!)}`,
      yesAsk: validPrice(m.yes_ask_dollars),
      noAsk: validPrice(m.no_ask_dollars),
      yesAskSize: numberOrNull(m.yes_ask_size_fp),
      noAskSize: numberOrNull(m.no_ask_size_fp),
      volume24h: numberOrNull(m.volume_24h_fp) ?? 0,
      closeTime: m.close_time ?? null,
      rules: m.rules_primary ?? null,
    }))
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Advanced Question Similarity & Semantic Matching
// ---------------------------------------------------------------------------

const SYNONYMS: Record<string, string> = {
  fed: 'federal reserve',
  potus: 'president',
  presidential: 'president',
  pres: 'president',
  gop: 'republican',
  dem: 'democrat',
  dems: 'democrat',
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
  cut: 'cuts',
  hike: 'hikes',
  us: 'united states',
  usa: 'united states',
}

const STOPWORDS = new Set([
  'will', 'the', 'and', 'for', 'be', 'in', 'on', 'at', 'by', 'to', 'of', 'a', 'an', 'is', 'before', 'after'
])

function extractNumbersAndYears(text: string): Set<string> {
  const matches = text.toLowerCase().match(/\b(?:\d{4}|\$?\d+(?:\.\d+)?(?:k|m|b|%)?)\b/g)
  return new Set(matches ?? [])
}

function normalizeTitleTokens(title: string): string[] {
  let cleaned = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  const words = cleaned.split(/\s+/).filter(w => w.length > 1)

  return words.map(w => SYNONYMS[w] || w).filter(w => !STOPWORDS.has(w))
}

export function computeCrossVenueSimilarity(titleA: string, titleB: string): number {
  const numsA = extractNumbersAndYears(titleA)
  const numsB = extractNumbersAndYears(titleB)

  // Critical safeguard: If both questions specify numbers/years/prices and they conflict,
  // it is almost certainly a different threshold contract (e.g. BTC > 100k vs BTC > 90k)
  if (numsA.size > 0 && numsB.size > 0) {
    let hasMatchingNumber = false
    numsA.forEach(n => {
      if (numsB.has(n)) hasMatchingNumber = true
    })
    // If neither shares any number, penalize heavily
    if (!hasMatchingNumber) {
      return 0.1
    }
  }

  const tokensA = new Set(normalizeTitleTokens(titleA))
  const tokensB = new Set(normalizeTitleTokens(titleB))

  if (tokensA.size === 0 || tokensB.size === 0) return 0

  let overlap = 0
  tokensA.forEach(token => {
    if (tokensB.has(token)) overlap++
  })

  // Jaccard similarity coefficient
  const unionSet = new Set<string>()
  tokensA.forEach(t => unionSet.add(t))
  tokensB.forEach(t => unionSet.add(t))
  const unionSize = unionSet.size || 1
  const jaccard = overlap / unionSize

  // Inclusion overlap (subset check)
  const minSize = Math.min(tokensA.size, tokensB.size)
  const inclusion = overlap / minSize

  return (jaccard * 0.6) + (inclusion * 0.4)
}

// ---------------------------------------------------------------------------
// Opportunity Evaluator
// ---------------------------------------------------------------------------

function evaluatePair(
  poly: InternalPolyMarket,
  kalshi: InternalKalshiMarket,
  requestedShares: number,
  polyFeeRate: number,
  kalshiFeeRate: number,
  transferBuffer: number,
  similarity: number
): CrossPlatformArbitrageOpportunity | null {
  // Option 1: Polymarket YES + Kalshi NO
  const pairA_UnitCost = (poly.yesAsk !== null && kalshi.noAsk !== null)
    ? poly.yesAsk + kalshi.noAsk
    : null

  // Option 2: Kalshi YES + Polymarket NO
  const pairB_UnitCost = (kalshi.yesAsk !== null && poly.noAsk !== null)
    ? kalshi.yesAsk + poly.noAsk
    : null

  if (pairA_UnitCost === null && pairB_UnitCost === null) {
    return null
  }

  // Pick the cheaper pair
  const isPairACheaper = (pairA_UnitCost ?? Infinity) <= (pairB_UnitCost ?? Infinity)
  const chosenName = isPairACheaper ? 'polymarket-yes + kalshi-no' : 'kalshi-yes + polymarket-no'
  const combinedUnitCost = isPairACheaper ? pairA_UnitCost! : pairB_UnitCost!

  const leg1: CrossVenueLeg = isPairACheaper
    ? {
        venue: 'polymarket',
        marketId: poly.id,
        title: poly.title,
        url: poly.url,
        outcome: 'Yes',
        askPrice: poly.yesAsk,
        askSize: poly.yesAskSize,
        feeRate: polyFeeRate,
        rules: poly.description,
        closeTime: poly.closeTime,
      }
    : {
        venue: 'kalshi',
        marketId: kalshi.ticker,
        title: kalshi.title,
        url: kalshi.url,
        outcome: 'Yes',
        askPrice: kalshi.yesAsk,
        askSize: kalshi.yesAskSize,
        feeRate: kalshiFeeRate,
        rules: kalshi.rules,
        closeTime: kalshi.closeTime,
      }

  const leg2: CrossVenueLeg = isPairACheaper
    ? {
        venue: 'kalshi',
        marketId: kalshi.ticker,
        title: kalshi.title,
        url: kalshi.url,
        outcome: 'No',
        askPrice: kalshi.noAsk,
        askSize: kalshi.noAskSize,
        feeRate: kalshiFeeRate,
        rules: kalshi.rules,
        closeTime: kalshi.closeTime,
      }
    : {
        venue: 'polymarket',
        marketId: poly.id,
        title: poly.title,
        url: poly.url,
        outcome: 'No',
        askPrice: poly.noAsk,
        askSize: poly.noAskSize,
        feeRate: polyFeeRate,
        rules: poly.description,
        closeTime: poly.closeTime,
      }

  // Available depth
  const availableLeg1 = leg1.askSize ?? requestedShares
  const availableLeg2 = leg2.askSize ?? requestedShares
  const fillableShares = Math.min(requestedShares, availableLeg1, availableLeg2)
  const isFillable = fillableShares >= requestedShares

  // Costs and Returns
  const totalCost = (combinedUnitCost * fillableShares)
  const totalFees = (leg1.askPrice! * fillableShares * leg1.feeRate) + (leg2.askPrice! * fillableShares * leg2.feeRate)
  const payout = 1.00 * fillableShares
  const grossProfit = payout - totalCost
  const netProfit = grossProfit - totalFees - transferBuffer
  const netReturnPercent = totalCost > 0 ? (netProfit / totalCost) * 100 : 0

  // Divergence Calculation
  const polyYesProb = poly.yesAsk
  const kalshiYesProb = kalshi.yesAsk
  let spreadPercent = 0
  let favoredSide: 'polymarket-cheaper-yes' | 'kalshi-cheaper-yes' | 'balanced' = 'balanced'

  if (polyYesProb !== null && kalshiYesProb !== null) {
    spreadPercent = Math.abs(polyYesProb - kalshiYesProb) * 100
    if (polyYesProb < kalshiYesProb - 0.03) {
      favoredSide = 'polymarket-cheaper-yes'
    } else if (kalshiYesProb < polyYesProb - 0.03) {
      favoredSide = 'kalshi-cheaper-yes'
    }
  }

  // Close time delta
  let closeTimeDiffHours = 0
  if (poly.closeTime && kalshi.closeTime) {
    const tPoly = Date.parse(poly.closeTime)
    const tKalshi = Date.parse(kalshi.closeTime)
    if (Number.isFinite(tPoly) && Number.isFinite(tKalshi)) {
      closeTimeDiffHours = Math.abs(tPoly - tKalshi) / (1000 * 60 * 60)
    }
  }

  // Status classification
  let status: CrossPlatformArbitrageOpportunity['status'] = 'divergence'
  if (netProfit > 0 && isFillable) {
    status = 'opportunity'
  } else if (combinedUnitCost <= 1.02) {
    status = 'near-miss'
  } else if (!isFillable) {
    status = 'insufficient-depth'
  } else if (spreadPercent >= 8) {
    status = 'divergence'
  }

  // Recommended Action
  let recommendedAction = ''
  if (status === 'opportunity') {
    recommendedAction = `Guaranteed Cross-Venue Arb: Buy ${fillableShares} ${leg1.outcome} on ${leg1.venue.toUpperCase()} ($${leg1.askPrice?.toFixed(3)}) + Buy ${fillableShares} ${leg2.outcome} on ${leg2.venue.toUpperCase()} ($${leg2.askPrice?.toFixed(3)}). Payout is $${payout.toFixed(2)} with net profit +$${netProfit.toFixed(2)} (+${netReturnPercent.toFixed(1)}%).`
  } else if (status === 'near-miss') {
    recommendedAction = `Near-Miss Arb: Combined unit cost is $${combinedUnitCost.toFixed(3)} (close to $1.00). Watch for spread compression or limit orders on either side.`
  } else if (favoredSide === 'polymarket-cheaper-yes') {
    recommendedAction = `Divergence Opportunity: Polymarket prices YES at $${polyYesProb?.toFixed(2)} while Kalshi prices YES at $${kalshiYesProb?.toFixed(2)} (${spreadPercent.toFixed(1)}% spread). YES is significantly discounted on Polymarket.`
  } else if (favoredSide === 'kalshi-cheaper-yes') {
    recommendedAction = `Divergence Opportunity: Kalshi prices YES at $${kalshiYesProb?.toFixed(2)} while Polymarket prices YES at $${polyYesProb?.toFixed(2)} (${spreadPercent.toFixed(1)}% spread). YES is significantly discounted on Kalshi.`
  } else {
    recommendedAction = `Monitor: Both markets are broadly aligned (spread: ${spreadPercent.toFixed(1)}%). Look for liquidity gaps.`
  }

  // Risk Checklist
  const riskNotes: string[] = []
  if (closeTimeDiffHours > 24) {
    riskNotes.push(`Time divergence: Expiration dates differ by ${closeTimeDiffHours.toFixed(1)} hours. Verify event milestone.`)
  }
  riskNotes.push('Rule Check: Polymarket settles via UMA oracle; Kalshi settles via official government/AP records.')
  if (totalFees > 0) {
    riskNotes.push(`Fee drag: Includes $${totalFees.toFixed(3)} estimated taker fees + $${transferBuffer.toFixed(2)} capital transfer buffer.`)
  }

  return {
    id: `${poly.id}__${kalshi.ticker}`,
    titleSimilarity: similarity,
    eventTitle: poly.title,
    polymarket: poly,
    kalshi,
    bestCombination: {
      name: chosenName,
      leg1,
      leg2,
      combinedUnitCost,
      grossProfitPerShare: 1.00 - combinedUnitCost,
      requestedShares,
      fillableShares,
      totalCost,
      totalFees,
      transferBuffer,
      payout,
      netProfit,
      netReturnPercent,
      fillable: isFillable,
    },
    divergence: {
      polyYesProb,
      kalshiYesProb,
      spreadPercent,
      favoredSide,
    },
    closeTimeDiffHours,
    status,
    recommendedAction,
    riskNotes,
  }
}

// ---------------------------------------------------------------------------
// Main Scanner Function
// ---------------------------------------------------------------------------

export async function scanCrossPlatformArbitrage(
  options: ScanOptions = {}
): Promise<CrossPlatformScanResult> {
  const requestedShares = options.requestedShares ?? 10
  const marketLimit = options.marketLimit ?? 100
  const minSimilarity = options.minSimilarity ?? 0.60
  const transferBuffer = options.transferBuffer ?? DEFAULT_TRANSFER_BUFFER

  const warnings: string[] = [
    'Cross-platform execution involves two different jurisdictions: Polymarket (Polygon USDC) and Kalshi (CFTC USD).',
    'Settlement sources may differ. Always double-check resolution definitions before executing cross-venue strategies.',
  ]

  let polyMarkets: InternalPolyMarket[] = []
  let kalshiMarkets: InternalKalshiMarket[] = []

  const [polyResult, kalshiResult] = await Promise.allSettled([
    fetchPolymarketData(marketLimit),
    fetchKalshiData(marketLimit),
  ])

  if (polyResult.status === 'fulfilled') {
    polyMarkets = polyResult.value
  } else {
    warnings.push(`Polymarket feed failed: ${polyResult.reason instanceof Error ? polyResult.reason.message : 'Unknown error'}`)
  }

  if (kalshiResult.status === 'fulfilled') {
    kalshiMarkets = kalshiResult.value
  } else {
    warnings.push(`Kalshi feed failed: ${kalshiResult.reason instanceof Error ? kalshiResult.reason.message : 'Unknown error'}`)
  }

  const opportunities: CrossPlatformArbitrageOpportunity[] = []

  // Pairwise similarity comparison
  for (const p of polyMarkets) {
    for (const k of kalshiMarkets) {
      const similarity = computeCrossVenueSimilarity(p.title, k.title)
      if (similarity < minSimilarity) continue

      const opp = evaluatePair(
        p,
        k,
        requestedShares,
        DEFAULT_POLY_FEE,
        DEFAULT_KALSHI_FEE,
        transferBuffer,
        similarity
      )

      if (opp) {
        opportunities.push(opp)
      }
    }
  }

  // Sort opportunities:
  // 1. Profitable complete-set arb first (by net profit desc)
  // 2. Near-miss arb (by unit cost asc)
  // 3. Highest divergence %
  opportunities.sort((a, b) => {
    if (a.status === 'opportunity' && b.status !== 'opportunity') return -1
    if (b.status === 'opportunity' && a.status !== 'opportunity') return 1
    if (a.status === 'opportunity' && b.status === 'opportunity') {
      return b.bestCombination.netProfit - a.bestCombination.netProfit
    }
    if (a.status === 'near-miss' && b.status !== 'near-miss') return -1
    if (b.status === 'near-miss' && a.status !== 'near-miss') return 1
    if (a.status === 'near-miss' && b.status === 'near-miss') {
      return a.bestCombination.combinedUnitCost - b.bestCombination.combinedUnitCost
    }
    return b.divergence.spreadPercent - a.divergence.spreadPercent
  })

  const profitableCount = opportunities.filter(o => o.status === 'opportunity').length
  const divergenceCount = opportunities.filter(o => o.status === 'divergence' && o.divergence.spreadPercent >= 8).length

  return {
    generatedAt: new Date().toISOString(),
    paperOnly: true,
    requestedShares,
    polymarketScanned: polyMarkets.length,
    kalshiScanned: kalshiMarkets.length,
    candidatesFound: opportunities.length,
    profitableCount,
    divergenceCount,
    opportunities,
    assumptions: {
      polyFeeRate: DEFAULT_POLY_FEE,
      kalshiFeeRate: DEFAULT_KALSHI_FEE,
      transferBuffer,
      minSimilarity,
    },
    warnings,
  }
}
