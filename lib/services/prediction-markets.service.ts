/** Public, read-only market data. Prices here are quotes, not forecasts or fills. */
export type PredictionVenue = 'polymarket' | 'kalshi'

export interface PredictionMarket {
  id: string
  venue: PredictionVenue
  title: string
  outcomes: [string, string]
  url: string
  yesAsk: number | null
  noAsk: number | null
  yesAskSize: number | null
  noAskSize: number | null
  volume24h: number
  closeTime: string | null
  updatedAt: string | null
  rules: string | null
  quoteSource: 'orderbook' | 'market-summary'
}

export interface CrossVenueCandidate {
  polymarket: PredictionMarket
  kalshi: PredictionMarket
  titleSimilarity: number
  closeTimeDifferenceHours: number
  bestOppositeAskSum: number | null
  cheaperPair: 'polymarket-yes + kalshi-no' | 'kalshi-yes + polymarket-no' | null
  verifiedArbitrage: false
}

export interface PredictionMarketSnapshot {
  generatedAt: string
  paperOnly: true
  markets: PredictionMarket[]
  crossVenueCandidates: CrossVenueCandidate[]
  sources: Record<PredictionVenue, { ok: boolean; count: number; error: string | null }>
  modelAvailable: boolean
  warnings: string[]
}

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
  timestamp?: string
  asks?: Array<{ price: string | number; size: string | number }>
}

interface KalshiMarket {
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

const POLYMARKET_URL = 'https://gamma-api.polymarket.com/markets'
const POLYMARKET_CLOB = 'https://clob.polymarket.com/books'
const KALSHI_URL = 'https://external-api.kalshi.com/trade-api/v2/markets'
const CACHE_MS = 30_000
let cached: { value: PredictionMarketSnapshot; expires: number } | null = null
let pending: Promise<PredictionMarketSnapshot> | null = null

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function validPrice(value: unknown): number | null {
  const parsed = numberOrNull(value)
  return parsed !== null && parsed > 0 && parsed < 1 ? parsed : null
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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<T>
}

function cheapestAsk(book: PolymarketBook | undefined): { price: number; size: number } | null {
  const levels = (book?.asks ?? [])
    .map(level => ({ price: validPrice(level.price), size: numberOrNull(level.size) }))
    .filter((level): level is { price: number; size: number } =>
      level.price !== null && level.size !== null && level.size > 0)
    .sort((a, b) => a.price - b.price)
  return levels[0] ?? null
}

export async function fetchPolymarketMarkets(limit = 80): Promise<PredictionMarket[]> {
  const params = new URLSearchParams({
    closed: 'false', accepting_orders: 'true', order: 'volume24hr',
    ascending: 'false', limit: String(limit),
  })
  const gamma = await fetchJson<GammaMarket[]>(`${POLYMARKET_URL}?${params}`)
  const binary = gamma.flatMap(market => {
    const outcomes = parseArray(market.outcomes)
    const tokens = parseArray(market.clobTokenIds)
    if (!market.id || !market.question || outcomes.length !== 2 || tokens.length !== 2 || market.enableOrderBook === false) return []
    return [{ market, tokens, outcomes: outcomes as [string, string] }]
  })
  const bookRequests = Array.from({ length: Math.ceil(binary.length * 2 / 100) }, (_, index) =>
    binary.flatMap(item => item.tokens).slice(index * 100, (index + 1) * 100),
  ).map(chunk => fetchJson<PolymarketBook[]>(POLYMARKET_CLOB, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chunk.map(token_id => ({ token_id }))),
  }))
  // A single CLOB chunk can fail or time out while Gamma market metadata is
  // still healthy. Keep the venue visible and leave only the affected asks
  // blank instead of dropping every Polymarket market from the dashboard.
  const bookResults = await Promise.allSettled(bookRequests)
  const books = bookResults.flatMap(result => result.status === 'fulfilled' ? result.value : [])
  const byToken = new Map(books.map(book => [String(book.asset_id), book]))
  return binary.map(({ market, tokens, outcomes }): PredictionMarket => {
    const yes = cheapestAsk(byToken.get(tokens[0]))
    const no = cheapestAsk(byToken.get(tokens[1]))
    const slug = market.events?.find(event => event.slug)?.slug ?? market.slug
    return {
      id: String(market.id), venue: 'polymarket', title: market.question!,
      outcomes,
      url: slug ? `https://polymarket.com/event/${encodeURIComponent(slug)}` : 'https://polymarket.com',
      yesAsk: yes?.price ?? null, noAsk: no?.price ?? null,
      yesAskSize: yes?.size ?? null, noAskSize: no?.size ?? null,
      volume24h: numberOrNull(market.volume24hr) ?? 0,
      closeTime: market.endDateIso ?? market.endDate ?? null,
      updatedAt: null, rules: market.description ?? null, quoteSource: 'orderbook',
    }
  })
}

export async function fetchKalshiMarkets(limit = 80): Promise<PredictionMarket[]> {
  const params = new URLSearchParams({ status: 'open', mve_filter: 'exclude', limit: '1000' })
  const data = await fetchJson<{ markets?: KalshiMarket[] }>(`${KALSHI_URL}?${params}`)
  return (data.markets ?? [])
    .filter(market => market.ticker && market.title && (!market.market_type || market.market_type === 'binary'))
    .map((market): PredictionMarket => ({
      id: market.ticker!, venue: 'kalshi', title: market.title!,
      outcomes: ['Yes', 'No'],
      url: `https://kalshi.com/markets/${encodeURIComponent(market.ticker!)}`,
      yesAsk: validPrice(market.yes_ask_dollars), noAsk: validPrice(market.no_ask_dollars),
      yesAskSize: numberOrNull(market.yes_ask_size_fp), noAskSize: numberOrNull(market.no_ask_size_fp),
      volume24h: numberOrNull(market.volume_24h_fp) ?? 0,
      closeTime: market.close_time ?? null, updatedAt: market.updated_time ?? null,
      rules: market.rules_primary ?? null, quoteSource: 'market-summary',
    }))
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, limit)
}

function normalizedTokens(title: string): Set<string> {
  return new Set(title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter(token => token.length > 2 && !['will', 'the', 'and', 'for'].includes(token)))
}

export function titleSimilarity(a: string, b: string): number {
  const left = normalizedTokens(a)
  const right = normalizedTokens(b)
  if (!left.size || !right.size) return 0
  const overlap = Array.from(left).filter(token => right.has(token)).length
  return overlap / Math.max(left.size, right.size)
}

/** A watchlist only. Different settlement rules prevent an automatic arb claim. */
export function findCrossVenueCandidates(markets: PredictionMarket[]): CrossVenueCandidate[] {
  const poly = markets.filter(market => market.venue === 'polymarket')
  const kalshi = markets.filter(market => market.venue === 'kalshi')
  const candidates: CrossVenueCandidate[] = []
  for (const p of poly) for (const k of kalshi) {
    const similarity = titleSimilarity(p.title, k.title)
    if (similarity < 0.85 || !p.closeTime || !k.closeTime) continue
    const closeDifference = Math.abs(Date.parse(p.closeTime) - Date.parse(k.closeTime)) / 3_600_000
    if (!Number.isFinite(closeDifference) || closeDifference > 24) continue
    const pairs: Array<{ sum: number; name: CrossVenueCandidate['cheaperPair'] }> = []
    if (p.yesAsk !== null && k.noAsk !== null) pairs.push({ sum: p.yesAsk + k.noAsk, name: 'polymarket-yes + kalshi-no' })
    if (k.yesAsk !== null && p.noAsk !== null) pairs.push({ sum: k.yesAsk + p.noAsk, name: 'kalshi-yes + polymarket-no' })
    pairs.sort((a, b) => a.sum - b.sum)
    candidates.push({ polymarket: p, kalshi: k, titleSimilarity: similarity,
      closeTimeDifferenceHours: closeDifference, bestOppositeAskSum: pairs[0]?.sum ?? null,
      cheaperPair: pairs[0]?.name ?? null, verifiedArbitrage: false })
  }
  return candidates.sort((a, b) => (a.bestOppositeAskSum ?? Infinity) - (b.bestOppositeAskSum ?? Infinity)).slice(0, 12)
}

async function buildSnapshot(): Promise<PredictionMarketSnapshot> {
  const results = await Promise.allSettled([fetchPolymarketMarkets(), fetchKalshiMarkets()])
  const venues: PredictionVenue[] = ['polymarket', 'kalshi']
  const sources = {} as PredictionMarketSnapshot['sources']
  const markets: PredictionMarket[] = []
  results.forEach((result, index) => {
    const venue = venues[index]
    if (result.status === 'fulfilled') {
      markets.push(...result.value)
      sources[venue] = { ok: true, count: result.value.length, error: null }
    } else {
      sources[venue] = { ok: false, count: 0, error: result.reason instanceof Error ? result.reason.message : 'Source unavailable' }
    }
  })
  const warnings = [
    'Quotes are snapshots, not guaranteed fills. Kalshi uses summary top-of-book; Polymarket uses CLOB asks.',
    'Cross-venue matches are comparison candidates only. Different rules, resolution, fees, and timing can cause losses.',
  ]
  if (!process.env.GROQ_API_KEY) warnings.push('Model research is unavailable until GROQ_API_KEY is configured. No probability estimate will be fabricated.')
  return {
    generatedAt: new Date().toISOString(), paperOnly: true, markets,
    crossVenueCandidates: findCrossVenueCandidates(markets), sources,
    modelAvailable: Boolean(process.env.GROQ_API_KEY), warnings,
  }
}

export async function getPredictionMarketSnapshot(): Promise<PredictionMarketSnapshot> {
  if (cached && cached.expires > Date.now()) return cached.value
  if (!pending) pending = buildSnapshot().then(value => {
    cached = { value, expires: Date.now() + CACHE_MS }
    return value
  }).finally(() => { pending = null })
  return pending
}
