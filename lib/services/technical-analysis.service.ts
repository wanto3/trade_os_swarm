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

async function fetchKlines(symbol: string, interval: string, limit = 100): Promise<Kline[]> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance API error: ${res.status}`)
  const raw: any[][] = await res.json()
  return raw.map(k => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
  }))
}

async function fetchPriceAndChange(symbol: string): Promise<{ price: number; change24h: number }> {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Binance ticker error: ${res.status}`)
  const data = await res.json()
  return {
    price: parseFloat(data.lastPrice),
    change24h: parseFloat(data.priceChangePercent),
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
  let gains = 0, losses = 0
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1]
    if (diff > 0) gains += diff
    else losses += Math.abs(diff)
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

function calculateMACD(prices: number[]): { value: number; signal: number; histogram: number } {
  const ema12 = calculateEMA(prices, 12)
  const ema26 = calculateEMA(prices, 26)
  const macdLine = ema12 - ema26
  // Build array of MACD values for signal line calculation
  const macdValues: number[] = []
  for (let i = 26; i < prices.length; i++) {
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
  if (indicators.rsi < 30) { buyScore += 2 }
  else if (indicators.rsi > 70) { sellScore += 2 }
  else if (indicators.rsi < 40) buyScore += 1
  else if (indicators.rsi > 60) sellScore += 1

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
  if (indicators.momentum > 55) buyScore += 1
  else if (indicators.momentum < 45) sellScore += 1

  if (buyScore > sellScore + 1) {
    return { signal: 'BUY', signalReason: `RSI ${indicators.rsi.toFixed(1)}, MACD ${indicators.macd.histogram >= 0 ? 'bullish' : 'bearish'}, momentum ${indicators.momentum.toFixed(1)}` }
  }
  if (sellScore > buyScore + 1) {
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
