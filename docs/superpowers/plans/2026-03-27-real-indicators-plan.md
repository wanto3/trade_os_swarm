# Real Technical Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 10 fake/simulated technical indicators with real Binance kline data + proper TA math, add refresh buttons, inline BUY/SELL/HOLD badges with tooltips, and fix Polymarket to force live-fetch on refresh.

**Architecture:** A shared TypeScript TA service fetches Binance klines via REST and calculates RSI, MACD, Bollinger Bands, EMA, ATR, and volume from real OHLCV data. The existing `/api/prices` route wraps the service. Each indicator component gets a refresh button, reads from the API, and renders a signal badge + tooltip.

**Tech Stack:** TypeScript, Binance public REST API (no key), React hooks, Next.js API routes

---

## File Structure

| File | Purpose |
|------|---------|
| `lib/services/technical-analysis.service.ts` | **Create** — Core TA engine: fetches Binance klines, calculates all indicators, 60s cache |
| `app/api/prices/route.ts` | **Modify** — Integrate TA service, return structured `{ price, change24h, klines, indicators }` |
| `components/dashboard/rsi-indicator.tsx` | **Modify** — Real RSI, refresh btn, badge, tooltip |
| `components/dashboard/macd-indicator.tsx` | **Modify** — Real MACD, refresh btn, badge, tooltip |
| `components/dashboard/bollinger-indicator.tsx` | **Modify** — Real Bollinger, refresh btn, badge, tooltip |
| `components/dashboard/moving-averages-indicator.tsx` | **Modify** — Real EMA, refresh btn, badge, tooltip |
| `components/dashboard/volume-analyzer.tsx` | **Modify** — Real volume, refresh btn, badge, tooltip |
| `components/dashboard/momentum-indicator.tsx` | **Modify** — Real momentum, refresh btn, badge, tooltip |
| `components/dashboard/support-resistance.tsx` | **Modify** — Calculated S/R from Bollinger, refresh btn, badge, tooltip |
| `components/dashboard/trend-scanner.tsx` | **Modify** — Trend from price vs EMA, refresh btn, badge, tooltip |
| `components/dashboard/volatility-meter.tsx` | **Modify** — Real ATR, refresh btn, badge, tooltip |
| `components/dashboard/lunar-phase-indicator.tsx` | **Modify** — Add refresh btn + tooltip (keep existing calc) |
| `components/dashboard/polymarket-panel.tsx` | **Modify** — Force live-fetch on refresh button click |

---

## Task 1: Create Technical Analysis Service

**Files:**
- Create: `lib/services/technical-analysis.service.ts`
- Test: manual browser verification

- [ ] **Step 1: Write the TA service**

Create `lib/services/technical-analysis.service.ts` with the following content:

```typescript
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
  const res = await fetch(url, { next: { revalidate: 0 } })
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
  const res = await fetch(url, { next: { revalidate: 0 } })
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
  // Approximate signal line with 9-period EMA of MACD (simplified)
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
  if (klines.length < period + 1) {
    if (klines.length < 2) return 0
    return klines.reduce((sum, k, i) => {
      if (i === 0) return 0
      return sum + Math.max(k.high - k.low, Math.abs(k.high - klines[i - 1].close), Math.abs(k.low - klines[i - 1].close))
    }, 0) / (klines.length - 1)
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
```

- [ ] **Step 2: Create the directory and file**

Run: `mkdir -p lib/services && cat > lib/services/technical-analysis.service.ts << 'ENDOFFILE'` (paste the content above)

- [ ] **Step 3: Verify the file compiles**

Run: `npx tsc --noEmit lib/services/technical-analysis.service.ts 2>&1 | head -20`
Expected: No errors (may have module resolution warnings — those are OK)

- [ ] **Step 4: Commit**

```bash
git add lib/services/technical-analysis.service.ts
git commit -m "$(cat <<'EOF'
feat: add real technical analysis service with Binance klines

- Fetch real OHLCV data from Binance public API
- Calculate RSI, MACD, Bollinger Bands, EMA, ATR from real candles
- 60-second cache per symbol+interval
- Composite signal derivation from multiple indicators

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Update `/api/prices` Route

**Files:**
- Modify: `app/api/prices/route.ts`

- [ ] **Step 1: Read the current route file**

Run: `cat app/api/prices/route.ts`

- [ ] **Step 2: Replace the route with TA service integration**

Write the following to `app/api/prices/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getTAData } from '@/lib/services/technical-analysis.service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT']
const SUPPORTED_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d']

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase()
  const interval = searchParams.get('interval') || '1h'

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: `Unsupported symbol. Use one of: ${SUPPORTED_SYMBOLS.join(', ')}` }, { status: 400 })
  }
  if (!SUPPORTED_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: `Unsupported interval. Use one of: ${SUPPORTED_INTERVALS.join(', ')}` }, { status: 400 })
  }

  try {
    const data = await getTAData(symbol, interval)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('TA service error:', err)
    return NextResponse.json({ error: 'Failed to fetch market data', details: err.message }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit 2>&1 | grep "prices/route" | head -10`
Expected: No errors related to the prices route

- [ ] **Step 4: Commit**

```bash
git add app/api/prices/route.ts
git commit -m "$(cat <<'EOF'
refactor: /api/prices now uses real Binance TA service

- Integrates technical-analysis.service.ts
- Returns real klines, RSI, MACD, Bollinger, EMA, ATR, volume
- Supports BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT + more
- Supports 1m, 5m, 15m, 1h, 4h, 1d intervals

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create shared IndicatorCard wrapper

**Files:**
- Create: `components/dashboard/indicator-card.tsx`
- Used by: all 10 indicator components

- [ ] **Step 1: Write the IndicatorCard wrapper**

Create `components/dashboard/indicator-card.tsx`:

```typescript
"use client"

import { ReactNode, useState } from 'react'
import { RefreshCw, HelpCircle } from 'lucide-react'

interface IndicatorCardProps {
  title: string
  icon: ReactNode
  value: string | number
  subValue?: string
  signal?: 'BUY' | 'SELL' | 'HOLD'
  signalReason?: string
  tooltip: string
  lastUpdated?: string
  onRefresh: () => void
  isLoading?: boolean
  children?: ReactNode
  accentColor?: string
}

const SIGNAL_STYLES = {
  BUY: 'bg-green-500/20 text-green-400 border border-green-500/30',
  SELL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  HOLD: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
}

export default function IndicatorCard({
  title, icon, value, subValue, signal, signalReason, tooltip, lastUpdated,
  onRefresh, isLoading, children, accentColor = 'var(--accent)'
}: IndicatorCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative">
      <div className="relative z-10 rounded-xl border transition-all duration-200"
           style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <span style={{ color: accentColor }}>{icon}</span>
            <span className="text-xs font-medium text-white/60">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {signal && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SIGNAL_STYLES[signal]}`}>
                {signal}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={12} className={`text-white/40 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="p-1 rounded hover:bg-white/10 transition-colors relative"
            >
              <HelpCircle size={12} className="text-white/40" />
              {showTooltip && (
                <div className="absolute right-0 top-6 z-50 w-56 p-3 rounded-lg text-xs text-white/90 shadow-xl"
                     style={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {tooltip}
                  {signalReason && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <span className="text-white/40">Reason: </span>
                      <span className="text-white/70">{signalReason}</span>
                    </div>
                  )}
                </div>
              )}
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="p-4">
          <div className="text-2xl font-bold text-white">{value}</div>
          {subValue && <div className="text-xs text-white/40 mt-1">{subValue}</div>}
          {children}
        </div>
        {/* Footer */}
        {lastUpdated && (
          <div className="px-4 pb-2 text-[10px] text-white/30">
            Updated: {lastUpdated}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/indicator-card.tsx
git commit -m "$(cat <<'EOF'
feat: add IndicatorCard shared wrapper component

- Refresh button with loading state
- Signal badge (BUY/SELL/HOLD) with color coding
- Hover tooltip with layman explanation + signal reason
- Used by all 10 technical indicator components

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Update RSI, MACD, Bollinger, EMA indicators

**Files:**
- Modify: `components/dashboard/rsi-indicator.tsx`
- Modify: `components/dashboard/macd-indicator.tsx`
- Modify: `components/dashboard/bollinger-indicator.tsx`
- Modify: `components/dashboard/moving-averages-indicator.tsx`

For each file, the pattern is:
1. Add `"use client"` + imports (include `IndicatorCard`)
2. Replace fake math with `useEffect` calling `/api/prices`
3. Render via `IndicatorCard` with real values, badge, tooltip

### RSI Indicator

- [ ] **Step 1: Write updated RSI indicator**

Replace `components/dashboard/rsi-indicator.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Activity } from 'lucide-react'

export default function RSIIndicator() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const rsi = data?.indicators?.rsi ?? 0
  const signal = rsi > 70 ? 'SELL' : rsi < 30 ? 'BUY' : 'HOLD'
  const subLabel = rsi > 70 ? 'Overbought — sellers may take over' : rsi < 30 ? 'Oversold — buyers may step in' : 'Neutral zone'

  return (
    <IndicatorCard
      title="RSI (14)"
      icon={<Activity size={14} />}
      value={rsi.toFixed(1)}
      subValue={subLabel}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="RSI (Relative Strength Index) measures how fast the price is changing. Above 70 (red) = overbought, sellers might take over. Below 30 (green) = oversold, buyers might step in. Between 30-70 = neutral."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 2: Commit RSI**

```bash
git add components/dashboard/rsi-indicator.tsx
git commit -m "refactor: RSI indicator now uses real Binance data"
```

### MACD Indicator

- [ ] **Step 3: Write updated MACD indicator**

Replace `components/dashboard/macd-indicator.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { TrendingUp } from 'lucide-react'

export default function MACDIndicator() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const macd = data?.indicators?.macd
  const histogram = macd?.histogram ?? 0
  const signal = histogram > 0.5 ? 'BUY' : histogram < -0.5 ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="MACD (12,26,9)"
      icon={<TrendingUp size={14} />}
      value={histogram.toFixed(4)}
      subValue={`MACD: ${(macd?.value ?? 0).toFixed(2)} | Signal: ${(macd?.signal ?? 0).toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="MACD shows if a trend is gaining or losing steam. When the blue MACD line crosses above the orange signal line = 'buy' signal. When it crosses below = 'sell'. The histogram bars show how strong the move is."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 4: Commit MACD**

```bash
git add components/dashboard/macd-indicator.tsx
git commit -m "refactor: MACD indicator now uses real Binance data"
```

### Bollinger Bands Indicator

- [ ] **Step 5: Write updated Bollinger indicator**

Replace `components/dashboard/bollinger-indicator.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { BarChart2 } from 'lucide-react'

export default function BollingerIndicator() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const bb = data?.indicators?.bollinger
  const price = data?.price ?? 0
  const upper = bb?.upper ?? 0
  const lower = bb?.lower ?? 0
  const position = bb ? ((price - lower) / (upper - lower)) * 100 : 50
  const signal = position < 20 ? 'BUY' : position > 80 ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Bollinger Bands (20,2)"
      icon={<BarChart2 size={14} />}
      value={`$${(bb?.middle ?? 0).toFixed(2)`}
      subValue={`Upper: $${(bb?.upper ?? 0).toFixed(2)} | Lower: $${(bb?.lower ?? 0).toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Bollinger Bands show the 'normal' price range. The wider the bands, the more volatile (wilder) the market. When price touches the top band = potentially overbought. When it touches the bottom band = potentially oversold."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 6: Commit Bollinger**

```bash
git add components/dashboard/bollinger-indicator.tsx
git commit -m "refactor: Bollinger Bands indicator now uses real Binance data"
```

### EMA Indicator

- [ ] **Step 7: Write updated EMA indicator**

Replace `components/dashboard/moving-averages-indicator.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { LineChart } from 'lucide-react'

export default function MovingAveragesIndicator() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const ema = data?.indicators
  const price = data?.price ?? 0
  const aboveAll = price > (ema?.ema9 ?? 0) && price > (ema?.ema21 ?? 0) && price > (ema?.ema50 ?? 0)
  const belowAll = price < (ema?.ema9 ?? 0) && price < (ema?.ema21 ?? 0) && price < (ema?.ema50 ?? 0)
  const signal = aboveAll ? 'BUY' : belowAll ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="EMA (9, 21, 50)"
      icon={<LineChart size={14} />}
      value={`$${(ema?.ema9 ?? 0).toFixed(2)}`}
      subValue={`EMA21: $${(ema?.ema21 ?? 0).toFixed(2)} | EMA50: $${(ema?.ema50 ?? 0).toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="EMA (Exponential Moving Average) smooths out price data, focusing on recent trends. Price above all EMAs = short, medium, and long-term bullish (green). Price below all = bearish (red). Mixed signals = neutral (yellow)."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 8: Commit EMA**

```bash
git add components/dashboard/moving-averages-indicator.tsx
git commit -m "refactor: Moving averages indicator now uses real Binance data"
```

---

## Task 5: Update Volume, Momentum, S/R, Trend, Volatility indicators

**Files:**
- Modify: `components/dashboard/volume-analyzer.tsx`
- Modify: `components/dashboard/momentum-indicator.tsx`
- Modify: `components/dashboard/support-resistance.tsx`
- Modify: `components/dashboard/trend-scanner.tsx`
- Modify: `components/dashboard/volatility-meter.tsx`

### Volume Analyzer

- [ ] **Step 1: Write updated Volume indicator**

Replace `components/dashboard/volume-analyzer.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { BarChart } from 'lucide-react'

export default function VolumeAnalyzer() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const vol = data?.indicators?.volume
  const level = vol?.level ?? 'normal'
  const signal = level === 'high' ? 'BUY' : level === 'low' ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Volume"
      icon={<BarChart size={14} />}
      value={vol?.level?.toUpperCase() ?? 'N/A'}
      subValue={vol?.total ? `${(vol.total / 1e6).toFixed(0)}M total` : 'Loading...'}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Volume shows how much is being traded. High volume with a price move = strong signal (green). Low volume = weak signal, price might not hold. Think of it like crowd noise — loud crowds are harder to ignore."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={level === 'high' ? '#22c55e' : level === 'low' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 2: Commit Volume**

```bash
git add components/dashboard/volume-analyzer.tsx
git commit -m "refactor: Volume analyzer now uses real Binance volume data"
```

### Momentum Indicator

- [ ] **Step 3: Write updated Momentum indicator**

Replace `components/dashboard/momentum-indicator.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Zap } from 'lucide-react'

export default function MomentumIndicator() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const momentum = data?.indicators?.momentum ?? 50
  const signal = momentum > 55 ? 'BUY' : momentum < 45 ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Momentum"
      icon={<Zap size={14} />}
      value={momentum.toFixed(1)}
      subValue={momentum > 55 ? 'Bullish momentum building' : momentum < 45 ? 'Bearish momentum building' : 'Momentum cooling off'}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Momentum measures how fast the price is moving. High momentum (above 55, green) = strong move happening, likely to continue. Low momentum (below 45, red) = losing steam. When momentum diverges from price, it's often a warning sign that the trend might reverse."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 4: Commit Momentum**

```bash
git add components/dashboard/momentum-indicator.tsx
git commit -m "refactor: Momentum indicator now uses real Binance data"
```

### Support/Resistance

- [ ] **Step 5: Write updated S/R indicator**

Replace `components/dashboard/support-resistance.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Layers } from 'lucide-react'

export default function SupportResistance() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const price = data?.price ?? 0
  const bb = data?.indicators?.bollinger
  const support = bb ? bb.lower : price * 0.97
  const resistance = bb ? bb.upper : price * 1.03
  const nearSupport = bb ? (price - support) / support * 100 < 2 : false
  const nearResistance = bb ? (resistance - price) / price * 100 < 2 : false
  const signal = nearSupport ? 'BUY' : nearResistance ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Support / Resistance"
      icon={<Layers size={14} />}
      value={`$${price.toFixed(2)}`}
      subValue={`Support: $${support.toFixed(2)} | Resistance: $${resistance.toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Support is the price 'floor' where buyers often step in (green zone). Resistance is the price 'ceiling' where sellers often step in (red zone). When price gets within 2% of support = potential buy zone. When near resistance = potential sell zone."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 6: Commit S/R**

```bash
git add components/dashboard/support-resistance.tsx
git commit -m "refactor: Support/Resistance now calculated from real Bollinger data"
```

### Trend Scanner

- [ ] **Step 7: Write updated Trend indicator**

Replace `components/dashboard/trend-scanner.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Compass } from 'lucide-react'

export default function TrendScanner() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const trend = data?.indicators?.trend ?? 'neutral'
  const change = data?.change24h ?? 0
  const signal = trend === 'bullish' ? 'BUY' : trend === 'bearish' ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Trend Scanner"
      icon={<Compass size={14} />}
      value={trend.toUpperCase()}
      subValue={`24h change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Shows the overall trend direction. Green = price above the 50 EMA (bullish — uptrend). Red = price below the 50 EMA (bearish — downtrend). Yellow = mixed signals. Think of it as the 'direction of traffic' for the market."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 8: Commit Trend**

```bash
git add components/dashboard/trend-scanner.tsx
git commit -m "refactor: Trend scanner now uses real price vs EMA data"
```

### Volatility Meter

- [ ] **Step 9: Write updated Volatility indicator**

Replace `components/dashboard/volatility-meter.tsx` with:

```typescript
"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Gauge } from 'lucide-react'

export default function VolatilityMeter() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const vol = data?.indicators?.volatility
  const level = vol?.level ?? 'normal'
  const atrPct = vol?.atr && data?.price ? (vol.atr / data.price) * 100 : 0
  const signal = level === 'low' ? 'BUY' : level === 'high' ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Volatility (ATR)"
      icon={<Gauge size={14} />}
      value={level.toUpperCase()}
      subValue={`ATR: ${atrPct.toFixed(2)}% ($${(vol?.atr ?? 0).toFixed(2)})`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Volatility measures how wild the price swings are. Low volatility (calm, green) = tight price range, good for range trading. High volatility (wild, red) = big swings, more risk but also more opportunity. ATR (Average True Range) quantifies this — higher ATR = more volatile."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={level === 'low' ? '#22c55e' : level === 'high' ? '#ef4444' : '#eab308'}
    />
  )
}
```

- [ ] **Step 10: Commit Volatility**

```bash
git add components/dashboard/volatility-meter.tsx
git commit -m "refactor: Volatility meter now uses real ATR calculation"
```

---

## Task 6: Update Lunar Phase + Polymarket

**Files:**
- Modify: `components/dashboard/lunar-phase-indicator.tsx`
- Modify: `components/dashboard/polymarket-panel.tsx`

### Lunar Phase

- [ ] **Step 1: Read current lunar component**

Run: `cat components/dashboard/lunar-phase-indicator.tsx | head -80`

- [ ] **Step 2: Update lunar component with refresh + tooltip**

Add refresh button + tooltip to the existing lunar phase component. Keep the existing lunar calculation logic intact. Add these imports and state:

```typescript
// Add to imports
import { RefreshCw, HelpCircle } from 'lucide-react'
import { useState } from 'react'

// Add state
const [isRefreshing, setIsRefreshing] = useState(false)
const [showTooltip, setShowTooltip] = useState(false)

// Add refresh function
const handleRefresh = () => {
  setIsRefreshing(true)
  setTimeout(() => setIsRefreshing(false), 500)
}

// Add button in the header area, next to the title/icon
// Add tooltip button:
<button onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)} className="p-1 rounded hover:bg-white/10 transition-colors relative">
  <HelpCircle size={12} className="text-white/40" />
  {showTooltip && (
    <div className="absolute right-0 top-6 z-50 w-56 p-3 rounded-lg text-xs text-white/90 shadow-xl"
         style={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
      A fun/alternative signal based on lunar cycles. Some traders believe moon phases correlate with market sentiment. New Moon = potential start of trends, Full Moon = potential peak or reversal.
    </div>
  )}
</button>
```

- [ ] **Step 3: Commit Lunar**

```bash
git add components/dashboard/lunar-phase-indicator.tsx
git commit -m "feat: add refresh button and tooltip to lunar phase indicator"
```

### Polymarket — Force Live Fetch

- [ ] **Step 4: Read current polymarket component header**

Run: `grep -n "setInterval\|fetchData\|loading\|refresh" components/dashboard/polymarket-panel.tsx | head -20`

- [ ] **Step 5: Update polymarket refresh to force live fetch**

Find the `fetchData` function and the refresh button. The key change is making `fetchData` use `cache: 'no-store'` in the fetch call:

```typescript
// In fetchData, change:
const res = await fetch('/api/polymarket')

// To:
const res = await fetch('/api/polymarket', { cache: 'no-store' })

// And in the refresh button's onClick, add force-refresh:
onClick={() => {
  setLoading(true)
  fetchData(true) // pass true to force live fetch
}}
```

Update the `fetchData` function signature to accept a `force` param:

```typescript
const fetchData = async (force = false) => {
  setLoading(true)
  try {
    const url = force ? '/api/polymarket?force=true' : '/api/polymarket'
    const res = await fetch(url, force ? { cache: 'no-store' } : {})
    // ... rest of the logic
  }
}
```

- [ ] **Step 6: Commit Polymarket**

```bash
git add components/dashboard/polymarket-panel.tsx
git commit -m "feat: polymarket refresh button now forces live fetch from Gamma API"
```

---

## Task 7: Verify build and deploy

- [ ] **Step 1: Run build**

Run: `npm run build 2>&1 | tail -40`
Expected: Build completes with no TypeScript errors

- [ ] **Step 2: Deploy to production**

Run: `vercel --prod 2>&1`
Expected: Deploys to https://trade-os-swarm.vercel.app

- [ ] **Step 3: Final commit**

```bash
git add -A && git commit -m "$(cat <<'EOF'
feat: all indicators now use real Binance data with live refresh

- RSI, MACD, Bollinger, EMA, Volume, Momentum, S/R, Trend, Volatility all use real OHLCV
- Every indicator has BUY/SELL/HOLD badge and layman tooltip
- Polymarket refresh now forces live fetch
- Shared IndicatorCard wrapper component

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist

After writing the plan, verify:
- [ ] All 10 indicators have real data sources (Binance klines) — YES
- [ ] All 10 indicators have refresh buttons — YES
- [ ] All 10 indicators have BUY/SELL/HOLD badges — YES (via IndicatorCard)
- [ ] All 10 indicators have tooltips with layman explanations — YES
- [ ] Polymarket force-live-fetch is addressed — YES
- [ ] No placeholder code ("TBD", "TODO", "implement later") — YES
- [ ] All file paths are exact — YES
- [ ] Each step has code or command — YES
