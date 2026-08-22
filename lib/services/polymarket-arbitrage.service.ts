const GAMMA_MARKETS_URL = 'https://gamma-api.polymarket.com/markets'
const CLOB_URL = 'https://clob.polymarket.com'

const DEFAULT_FEE_RATE = 0.07
const DEFAULT_GAS_BUFFER = 0.03
const DEFAULT_EXECUTION_BUFFER_BPS = 10
const MIN_NET_PROFIT = 0.01

export interface OrderLevel {
  price: string | number
  size: string | number
}

export interface BookFill {
  requestedShares: number
  filledShares: number
  fillable: boolean
  cost: number
  averagePrice: number | null
  worstPrice: number | null
  fee: number
}

export interface CompleteSetCalculation {
  requestedShares: number
  fillableShares: number
  fillable: boolean
  yes: BookFill
  no: BookFill
  acquisitionCost: number
  payout: number
  grossProfit: number
  fees: number
  gasBuffer: number
  executionBuffer: number
  netProfit: number
  netReturnPercent: number
  combinedAveragePrice: number | null
}

export interface ArbitrageOpportunity extends CompleteSetCalculation {
  marketId: string
  conditionId: string
  question: string
  outcomes: [string, string]
  tokenIds: [string, string]
  url: string
  endDate: string | null
  volume24hr: number
  liquidity: number
  negRisk: boolean
  bestAskSum: number | null
  feeRate: number
  feeSource: 'live' | 'conservative-fallback'
  status: 'opportunity' | 'near-miss' | 'insufficient-depth'
}

export interface ArbitrageScanResult {
  generatedAt: string
  paperOnly: true
  requestedShares: number
  marketLimit: number
  scannedMarkets: number
  eligibleBinaryMarkets: number
  booksRequested: number
  booksReceived: number
  profitableCount: number
  opportunities: ArbitrageOpportunity[]
  assumptions: {
    minimumNetProfit: number
    gasBuffer: number
    executionBufferBps: number
    fallbackFeeRate: number
  }
  warnings: string[]
}

interface GammaMarket {
  id: string
  conditionId?: string
  question?: string
  outcomes?: string
  clobTokenIds?: string
  endDateIso?: string
  endDate?: string
  slug?: string
  events?: Array<{ slug?: string }>
  volume24hr?: number | string
  liquidityNum?: number | string
  liquidity?: number | string
  negRisk?: boolean
  enableOrderBook?: boolean
}

interface OrderBook {
  market: string
  asset_id: string
  timestamp: string
  asks: OrderLevel[]
  bids: OrderLevel[]
}

interface ClobMarketInfo {
  fd?: {
    r?: number | string
    e?: number | string
    to?: boolean
  }
}

interface Candidate {
  market: GammaMarket
  conditionId: string
  question: string
  outcomes: [string, string]
  tokenIds: [string, string]
  yesBook: OrderBook
  noBook: OrderBook
  preliminary: CompleteSetCalculation
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function normalizeFeeRate(value: unknown): number | null {
  const parsed = finiteNumber(value, Number.NaN)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  if (parsed <= 1) return parsed
  if (parsed <= 10_000) return parsed / 10_000
  return null
}

function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/**
 * Walk the displayed ask book from cheapest to most expensive. This makes the
 * simulation depend on executable depth rather than midpoint or best-ask only.
 */
export function consumeAsks(
  levels: OrderLevel[],
  requestedShares: number,
  feeRate: number,
): BookFill {
  const target = Math.max(0, finiteNumber(requestedShares))
  const normalizedFeeRate = Math.max(0, finiteNumber(feeRate))
  const asks = levels
    .map(level => ({ price: finiteNumber(level.price), size: finiteNumber(level.size) }))
    .filter(level => level.price > 0 && level.price < 1 && level.size > 0)
    .sort((a, b) => a.price - b.price)

  let remaining = target
  let filledShares = 0
  let cost = 0
  let fee = 0
  let worstPrice: number | null = null

  for (const level of asks) {
    if (remaining <= 1e-9) break
    const quantity = Math.min(remaining, level.size)
    filledShares += quantity
    cost += quantity * level.price
    // Current CLOB V2 public fee formula for taker fills.
    fee += quantity * normalizedFeeRate * level.price * (1 - level.price)
    worstPrice = level.price
    remaining -= quantity
  }

  const fillable = target > 0 && remaining <= 1e-9
  return {
    requestedShares: round(target),
    filledShares: round(filledShares),
    fillable,
    cost: round(cost),
    averagePrice: filledShares > 0 ? round(cost / filledShares) : null,
    worstPrice,
    fee: round(fee),
  }
}

export function calculateCompleteSetArbitrage(input: {
  yesAsks: OrderLevel[]
  noAsks: OrderLevel[]
  requestedShares: number
  feeRate: number
  gasBuffer?: number
  executionBufferBps?: number
}): CompleteSetCalculation {
  const requestedShares = Math.max(0, finiteNumber(input.requestedShares))
  const yes = consumeAsks(input.yesAsks, requestedShares, input.feeRate)
  const no = consumeAsks(input.noAsks, requestedShares, input.feeRate)
  const fillableShares = Math.min(yes.filledShares, no.filledShares)
  const fillable = yes.fillable && no.fillable
  const acquisitionCost = yes.cost + no.cost
  const fees = yes.fee + no.fee
  const gasBuffer = Math.max(0, finiteNumber(input.gasBuffer, DEFAULT_GAS_BUFFER))
  const executionBufferBps = Math.max(
    0,
    finiteNumber(input.executionBufferBps, DEFAULT_EXECUTION_BUFFER_BPS),
  )
  const executionBuffer = acquisitionCost * executionBufferBps / 10_000
  const payout = fillable ? requestedShares : 0
  const grossProfit = payout - acquisitionCost
  const netProfit = fillable
    ? grossProfit - fees - gasBuffer - executionBuffer
    : -(acquisitionCost + fees + gasBuffer + executionBuffer)

  return {
    requestedShares: round(requestedShares),
    fillableShares: round(fillableShares),
    fillable,
    yes,
    no,
    acquisitionCost: round(acquisitionCost),
    payout: round(payout),
    grossProfit: round(grossProfit),
    fees: round(fees),
    gasBuffer: round(gasBuffer),
    executionBuffer: round(executionBuffer),
    netProfit: round(netProfit),
    netReturnPercent: acquisitionCost > 0 ? round(netProfit / acquisitionCost * 100, 4) : 0,
    combinedAveragePrice:
      yes.averagePrice !== null && no.averagePrice !== null
        ? round(yes.averagePrice + no.averagePrice)
        : null,
  }
}

import { ProxyAgent } from 'undici';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
    signal: AbortSignal.timeout(15_000),
    // @ts-ignore: dispatcher is available in Node.js 18+ native fetch
    dispatcher,
  })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.json() as Promise<T>
}

async function fetchBooks(tokenIds: string[]): Promise<OrderBook[]> {
  const unique = Array.from(new Set(tokenIds))
  const chunks: string[][] = []
  for (let index = 0; index < unique.length; index += 100) {
    chunks.push(unique.slice(index, index + 100))
  }

  const responses = await Promise.all(chunks.map(chunk =>
    fetchJson<OrderBook[]>(`${CLOB_URL}/books`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk.map(token_id => ({ token_id }))),
    }),
  ))
  return responses.flat()
}

function marketUrl(market: GammaMarket): string {
  const eventSlug = market.events?.find(event => event.slug)?.slug
  const slug = eventSlug || market.slug
  return slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com'
}

export async function scanCompleteSetArbitrage(options?: {
  requestedShares?: number
  marketLimit?: number
}): Promise<ArbitrageScanResult> {
  const requestedShares = Math.min(10_000, Math.max(1, finiteNumber(options?.requestedShares, 10)))
  const marketLimit = Math.min(250, Math.max(10, Math.floor(finiteNumber(options?.marketLimit, 100))))
  const warnings: string[] = []

  const params = new URLSearchParams({
    closed: 'false',
    accepting_orders: 'true',
    order: 'volume24hr',
    ascending: 'false',
    limit: String(marketLimit),
  })
  const markets = await fetchJson<GammaMarket[]>(`${GAMMA_MARKETS_URL}?${params}`)

  const eligible = markets.flatMap(market => {
    const outcomes = parseStringArray(market.outcomes)
    const tokenIds = parseStringArray(market.clobTokenIds)
    const conditionId = market.conditionId
    if (!conditionId || outcomes.length !== 2 || tokenIds.length !== 2) return []
    if (market.enableOrderBook === false) return []
    return [{
      market,
      conditionId,
      question: market.question || 'Untitled market',
      outcomes: outcomes as [string, string],
      tokenIds: tokenIds as [string, string],
    }]
  })

  const tokenIds = eligible.flatMap(item => item.tokenIds)
  const books = await fetchBooks(tokenIds)
  const booksByToken = new Map(books.map(book => [String(book.asset_id), book]))

  const candidates: Candidate[] = []
  for (const item of eligible) {
    const yesBook = booksByToken.get(item.tokenIds[0])
    const noBook = booksByToken.get(item.tokenIds[1])
    if (!yesBook || !noBook) continue
    const preliminary = calculateCompleteSetArbitrage({
      yesAsks: yesBook.asks || [],
      noAsks: noBook.asks || [],
      requestedShares,
      feeRate: DEFAULT_FEE_RATE,
    })
    candidates.push({ ...item, yesBook, noBook, preliminary })
  }

  candidates.sort((a, b) => {
    const aPrice = a.preliminary.combinedAveragePrice ?? Number.POSITIVE_INFINITY
    const bPrice = b.preliminary.combinedAveragePrice ?? Number.POSITIVE_INFINITY
    return aPrice - bPrice
  })

  // Fee lookups are reserved for the closest markets to keep the scanner fast.
  const rankedCandidates = candidates.slice(0, 30)
  const feeLookups = await Promise.allSettled(rankedCandidates.map(candidate =>
    fetchJson<ClobMarketInfo>(`${CLOB_URL}/clob-markets/${candidate.conditionId}`),
  ))

  const opportunities = rankedCandidates.map((candidate, index): ArbitrageOpportunity => {
    const feeLookup = feeLookups[index]
    const liveFeeRate = feeLookup.status === 'fulfilled'
      ? normalizeFeeRate(feeLookup.value.fd?.r)
      : null
    const feeRate = liveFeeRate ?? DEFAULT_FEE_RATE
    const feeSource = liveFeeRate === null ? 'conservative-fallback' : 'live'
    const calculation = calculateCompleteSetArbitrage({
      yesAsks: candidate.yesBook.asks || [],
      noAsks: candidate.noBook.asks || [],
      requestedShares,
      feeRate,
    })
    const bestYes = consumeAsks(candidate.yesBook.asks || [], 1, 0).averagePrice
    const bestNo = consumeAsks(candidate.noBook.asks || [], 1, 0).averagePrice
    const bestAskSum = bestYes !== null && bestNo !== null ? round(bestYes + bestNo) : null
    const status: ArbitrageOpportunity['status'] = !calculation.fillable
      ? 'insufficient-depth'
      : calculation.netProfit >= MIN_NET_PROFIT
        ? 'opportunity'
        : 'near-miss'

    return {
      ...calculation,
      marketId: candidate.market.id,
      conditionId: candidate.conditionId,
      question: candidate.question,
      outcomes: candidate.outcomes,
      tokenIds: candidate.tokenIds,
      url: marketUrl(candidate.market),
      endDate: candidate.market.endDateIso || candidate.market.endDate || null,
      volume24hr: finiteNumber(candidate.market.volume24hr),
      liquidity: finiteNumber(candidate.market.liquidityNum ?? candidate.market.liquidity),
      negRisk: Boolean(candidate.market.negRisk),
      bestAskSum,
      feeRate,
      feeSource,
      status,
    }
  })

  opportunities.sort((a, b) => {
    if (a.fillable !== b.fillable) return a.fillable ? -1 : 1
    return b.netProfit - a.netProfit
  })

  const fallbackFees = opportunities.filter(item => item.feeSource === 'conservative-fallback').length
  if (fallbackFees > 0) {
    warnings.push(`${fallbackFees} displayed markets used the conservative 7% fee-rate fallback.`)
  }
  if (opportunities.every(item => item.status !== 'opportunity')) {
    warnings.push('No net-positive complete-set arbitrage was executable at the requested size in this snapshot.')
  }
  warnings.push('Paper simulation only. Separate order legs are not atomic and displayed liquidity can disappear.')

  return {
    generatedAt: new Date().toISOString(),
    paperOnly: true,
    requestedShares,
    marketLimit,
    scannedMarkets: markets.length,
    eligibleBinaryMarkets: eligible.length,
    booksRequested: tokenIds.length,
    booksReceived: books.length,
    profitableCount: opportunities.filter(item => item.status === 'opportunity').length,
    opportunities,
    assumptions: {
      minimumNetProfit: MIN_NET_PROFIT,
      gasBuffer: DEFAULT_GAS_BUFFER,
      executionBufferBps: DEFAULT_EXECUTION_BUFFER_BPS,
      fallbackFeeRate: DEFAULT_FEE_RATE,
    },
    warnings,
  }
}
