// lib/services/technical-analysis.service.ts

interface Kline {
  openTime: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closeTime: number
}

interface TAIndicators {
  rsi: number
  macd: { value: number; signal: number; histogram: number }
  bollinger: { upper: number; middle: number; lower: number }
  ema9: number
  ema21: number
  ema50: number
  atr: number
  volume: { total: number; avg: number; level: 'high' | 'normal' | 'low' }
  momentum: number
  trend: 'bullish' | 'bearish' | 'neutral'
  volatility: { atr: number; level: 'high' | 'normal' | 'low' }
  signal: 'BUY' | 'SELL' | 'HOLD'
  signalReason: string
}

interface TAResult {
  symbol: string
  interval: string
  price: number
  change24h: number
  klines: Kline[]
  indicators: TAIndicators
  stale?: boolean
  timestamp: number
}

// In-memory cache: key = "symbol:interval", value = { data, expiry }
const cache = new Map<string, { data: TAResult; expiry: number }>()
const CACHE_TTL = 60_000 // 60 seconds

// CryptoCompare Kline response type
interface CryptoCompareKline {
  time: number
  open: number
  high: number
  low: number
  close: number
  volumefrom: number
  volumeto: number
}

// Symbol mapping: our format -> CryptoCompare fsym, CoinGecko id
const SYMBOL_MAP: Record<string, { cc: string; cg: string }> = {
  BTCUSDT: { cc: 'BTC', cg: 'bitcoin' },
  ETHUSDT: { cc: 'ETH', cg: 'ethereum' },
  BNBUSDT: { cc: 'BNB', cg: 'binancecoin' },
  SOLUSDT: { cc: 'SOL', cg: 'solana' },
  XRPUSDT: { cc: 'XRP', cg: 'ripple' },
  ADAUSDT: { cc: 'ADA', cg: 'cardano' },
  DOGEUSDT: { cc: 'DOGE', cg: 'dogecoin' },
  MATICUSDT: { cc: 'MATIC', cg: 'matic-network' },
}

// Map our interval format to CryptoCompare aggregate parameter
const INTERVAL_MAP: Record<string, { cc: string; limit: number }> = {
  '1m': { cc: 'minute', limit: 100 },
  '5m': { cc: 'minute', limit: 100 },
  '15m': { cc: 'minute', limit: 100 },
  '1h': { cc: 'hour', limit: 100 },
  '4h': { cc: 'hour', limit: 100 },
  '1d': { cc: 'day', limit: 100 },
}

// Signal thresholds
const RSI_OVERSOLD = 30
const RSI_OVERBOUGHT = 70
const RSI_WEAK_BUY = 40
const RSI_WEAK_SELL = 60
const MOMENTUM_BULL = 55
const MOMENTUM_BEAR = 45
const SIGNAL_MARGIN = 2 // buyScore must exceed sellScore by this much

/**
 * Fetch OHLC klines for `symbol` with a fallback chain:
 *   1. CryptoCompare  — primary, free, reliable shape
 *   2. Coinbase       — fallback when CryptoCompare returns an error
 *                       shape (rate-limited / IP-blocked from Render)
 *
 * Binance is intentionally NOT in the chain — its API returns HTTP 403
 * from data-center IPs (Render, AWS, etc.) due to geo / abuse policy.
 *
 * Bug history: production `/api/prices?symbol=BTCUSDT` started returning
 * `Cannot read properties of undefined (reading 'map')` because the old
 * code only checked `res.ok` (HTTP status) before accessing
 * `json.Data.Data` — CryptoCompare returns HTTP 200 with
 * `{"Response":"Error",...}` when rate-limited, so `json.Data` was
 * undefined and the .map() crashed. Two-layer fix: validate
 * `json.Response === 'Success'` before parsing, AND fall back to
 * Coinbase when the primary source fails.
 */
async function fetchKlines(symbol: string, interval: string, _limit = 100): Promise<Kline[]> {
  const cfg = SYMBOL_MAP[symbol]
  if (!cfg) throw new Error(`Unknown symbol: ${symbol}`)
  const intCfg = INTERVAL_MAP[interval] || INTERVAL_MAP['1h']
  const errors: string[] = []

  // 1. CryptoCompare
  try {
    const url = `https://min-api.cryptocompare.com/data/v2/histo${intCfg.cc}?fsym=${cfg.cc}&tsym=USDT&limit=${intCfg.limit}&aggregate=1`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { Response?: string; Message?: string; Data?: { Data?: CryptoCompareKline[] } }
      // Validate API-level success — CryptoCompare returns HTTP 200 + a
      // {"Response":"Error"} envelope when rate-limited or IP-blocked.
      if (json.Response !== 'Success') {
        throw new Error(`API error: ${json.Message || 'no message'}`)
      }
      const arr = json.Data?.Data
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('empty Data.Data array')
      }
      return arr.map(k => ({
        openTime: k.time * 1000,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volumefrom,
        closeTime: (k.time + (intCfg.cc === 'hour' ? 3600 : intCfg.cc === 'minute' ? 60 : 86400)) * 1000,
      }))
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    errors.push(`CryptoCompare: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2. Coinbase fallback
  // Granularity in seconds: 60, 300, 900, 3600, 21600, 86400
  const cbGranularity: Record<string, number> = {
    '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 21600, '1d': 86400,
  }
  try {
    const gran = cbGranularity[interval] || 3600
    const url = `https://api.exchange.coinbase.com/products/${cfg.cc}-USD/candles?granularity=${gran}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'trade-os-swarm/1.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Coinbase returns array of [time, low, high, open, close, volume]
      const arr = await res.json() as Array<[number, number, number, number, number, number]>
      if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('empty candles array')
      }
      // Coinbase returns newest first; reverse to oldest-first to match
      // the downstream indicator code's expectation.
      const klines = arr.reverse().map(c => ({
        openTime: c[0] * 1000,
        open: c[3],
        high: c[2],
        low: c[1],
        close: c[4],
        volume: c[5],
        closeTime: (c[0] + gran) * 1000,
      }))
      return klines
    } finally {
      clearTimeout(timeout)
    }
  } catch (e) {
    errors.push(`Coinbase: ${e instanceof Error ? e.message : String(e)}`)
  }

  // Both sources failed — surface the chain so callers can see what
  // broke instead of getting an opaque ".map of undefined".
  throw new Error(`All kline sources failed: ${errors.join(' · ')}`)
}

async function fetchPriceAndChange(symbol: string): Promise<{ price: number; change24h: number }> {
  const cfg = SYMBOL_MAP[symbol]
  if (!cfg) throw new Error(`Unknown symbol: ${symbol}`)

  // Try Binance first — much higher free-tier rate limits, faster, no auth needed.
  // Production (Render) shares IPs with other free instances and CoinGecko's
  // rate limit (~10-30 calls/min) gets exhausted quickly.
  try {
    const binanceUrl = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5_000)
    const res = await fetch(binanceUrl, { signal: controller.signal })
    clearTimeout(timeout)
    if (res.ok) {
      const data = await res.json() as { lastPrice: string; priceChangePercent: string }
      return {
        price: parseFloat(data.lastPrice),
        change24h: parseFloat(data.priceChangePercent),
      }
    }
    // fall through to CoinGecko on non-200
  } catch {
    // Network/timeout — fall through to CoinGecko
  }

  // Fallback: CoinGecko (rate-limited, but still useful for symbols Binance doesn't list)
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cfg.cg}&vs_currencies=usd&include_24hr_change=true`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`CoinGecko API error: ${res.status}`)
    const data = await res.json() as Record<string, { usd: number; usd_24h_change: number }>
    const coinData = data[cfg.cg]
    if (!coinData) throw new Error(`No data for ${symbol}`)
    return {
      price: coinData.usd,
      change24h: coinData.usd_24h_change,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function calculateEMA(prices: number[], period: number): number {
  const k = 2 / (period + 1)
  let ema = prices[0]
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k)
  }
  return ema
}

function calculateRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50

  // First: compute all price changes
  const changes: number[] = []
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1])
  }

  // Separate gains and losses
  const gains: number[] = changes.map(c => (c > 0 ? c : 0))
  const losses: number[] = changes.map(c => (c < 0 ? Math.abs(c) : 0))

  // First average: simple mean
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period

  // Wilder smoothing for remaining periods
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period
  }

  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function calculateMACD(prices: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)
  const macdLine = ema12 - ema26
  // Build array of MACD values for signal line calculation
  // Limit to last 20 to reduce O(n²) complexity (~800 steps vs ~2800 for 100 candles)
  const macdValues: number[] = []
  const limit = Math.min(20, prices.length - 26)
  for (let i = prices.length - limit; i < prices.length; i++) {
    const e12 = calculateEMA(prices.slice(0, i + 1), 12)
    const e26 = calculateEMA(prices.slice(0, i + 1), 26)
    macdValues.push(e12 - e26)
  }
  const signalLine = macdValues.length > 0 ? calculateEMA(macdValues, 9) : macdLine * 0.8
  return {
    value: macdLine,
    signal: signalLine,
    histogram: macdLine - signalLine,
  }
}

function calculateBollinger(prices: number[], period = 20, stdDevMultiplier = 2): { upper: number; middle: number; lower: number } {
  const slice = prices.slice(-period)
  const sma = slice.reduce((a, b) => a + b, 0) / slice.length
  const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / slice.length
  const stdDev = Math.sqrt(variance)
  return {
    upper: sma + stdDevMultiplier * stdDev,
    middle: sma,
    lower: sma - stdDevMultiplier * stdDev,
  }
}

function calculateATR(klines: Kline[], period = 14): number {
  if (klines.length < 2) return 0
  if (klines.length < period + 1) {
    let trSum = 0
    for (let i = 1; i < klines.length; i++) {
      trSum += Math.max(
        klines[i].high - klines[i].low,
        Math.abs(klines[i].high - klines[i - 1].close),
        Math.abs(klines[i].low - klines[i - 1].close)
      )
    }
    return trSum / (klines.length - 1)
  }
  let trSum = 0
  for (let i = klines.length - period; i < klines.length; i++) {
    const tr = Math.max(
      klines[i].high - klines[i].low,
      Math.abs(klines[i].high - klines[i - 1].close),
      Math.abs(klines[i].low - klines[i - 1].close)
    )
    trSum += tr
  }
  return trSum / period
}

function deriveSignal(indicators: Omit<TAIndicators, 'signal' | 'signalReason'>, price: number): { signal: TAIndicators['signal']; signalReason: string } {
  let buyScore = 0, sellScore = 0

  // RSI
  if (indicators.rsi < RSI_OVERSOLD) { buyScore += 2 }
  else if (indicators.rsi > RSI_OVERBOUGHT) { sellScore += 2 }
  else if (indicators.rsi < RSI_WEAK_BUY) buyScore += 1
  else if (indicators.rsi > RSI_WEAK_SELL) sellScore += 1

  // MACD
  if (indicators.macd.histogram > 0) buyScore += 1.5
  else if (indicators.macd.histogram < 0) sellScore += 1.5

  // Price vs Bollinger
  if (price < indicators.bollinger.lower) buyScore += 1
  else if (price > indicators.bollinger.upper) sellScore += 1

  // Price vs EMAs
  if (price > indicators.ema9 && price > indicators.ema21 && price > indicators.ema50) buyScore += 1
  else if (price < indicators.ema9 && price < indicators.ema21 && price < indicators.ema50) sellScore += 1

  // Momentum
  if (indicators.momentum > MOMENTUM_BULL) buyScore += 1
  else if (indicators.momentum < MOMENTUM_BEAR) sellScore += 1

  if (buyScore > sellScore + SIGNAL_MARGIN) {
    return { signal: 'BUY', signalReason: `RSI ${indicators.rsi.toFixed(1)}, MACD ${indicators.macd.histogram >= 0 ? 'bullish' : 'bearish'}, momentum ${indicators.momentum.toFixed(1)}` }
  }
  if (sellScore > buyScore + SIGNAL_MARGIN) {
    return { signal: 'SELL', signalReason: `RSI ${indicators.rsi.toFixed(1)}, MACD ${indicators.macd.histogram >= 0 ? 'bullish' : 'bearish'}, momentum ${indicators.momentum.toFixed(1)}` }
  }
  return { signal: 'HOLD', signalReason: `Mixed signals — RSI ${indicators.rsi.toFixed(1)}, MACD flat` }
}

export async function getTAData(symbol: string, interval = '1h'): Promise<TAResult> {
  const cacheKey = `${symbol}:${interval}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiry > Date.now()) {
    return cached.data
  }

  try {
    const [klines, { price, change24h }] = await Promise.all([
      fetchKlines(symbol, interval, 100),
      fetchPriceAndChange(symbol),
    ])

    const closes = klines.map(k => k.close)
    const ema9 = calculateEMA(closes, 9)
    const ema21 = calculateEMA(closes, 21)
    const ema50 = calculateEMA(closes, 50)
    const rsi = calculateRSI(closes, 14)
    const macd = calculateMACD(closes)
    const bollinger = calculateBollinger(closes)
    const atr = calculateATR(klines, 14)
    const volumes = klines.map(k => k.volume)
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length
    const latestVolume = volumes[volumes.length - 1]
    const volumeLevel: 'high' | 'normal' | 'low' =
      latestVolume > avgVolume * 1.5 ? 'high' : latestVolume < avgVolume * 0.5 ? 'low' : 'normal'
    const momentumRSI = calculateRSI(closes, 10)
    const trend: 'bullish' | 'bearish' | 'neutral' =
      price > ema50 ? 'bullish' : price < ema50 ? 'bearish' : 'neutral'
    const atrPercent = (atr / price) * 100
    const volatilityLevel: 'high' | 'normal' | 'low' =
      atrPercent > 3 ? 'high' : atrPercent < 1 ? 'low' : 'normal'

    const rawIndicators = { rsi, macd, bollinger, ema9, ema21, ema50, atr, volume: { total: volumes.reduce((a, b) => a + b, 0), avg: avgVolume, level: volumeLevel }, momentum: momentumRSI, trend, volatility: { atr, level: volatilityLevel } }
    const { signal, signalReason } = deriveSignal(rawIndicators, price)

    const result: TAResult = {
      symbol,
      interval,
      price,
      change24h,
      klines,
      indicators: { ...rawIndicators, signal, signalReason },
      timestamp: Date.now(),
    }

    cache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL })
    return result
  } catch (err) {
    // Return stale cache if available, otherwise throw
    if (cached) {
      return { ...cached.data, stale: true }
    }
    throw err
  }
}
