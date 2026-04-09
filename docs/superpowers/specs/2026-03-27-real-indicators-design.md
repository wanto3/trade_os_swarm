# Real Technical Indicators + Polymarket Live Refresh

## Context

The current technical indicators (RSI, MACD, Bollinger Bands, etc.) are completely fake — they use `price * random_math` instead of real OHLCV candlestick data. Polymarket works and has a refresh button but doesn't force live fetches. The goal is: real market data, working refresh buttons, and layman explanations on all indicators.

## Approach

**Data Source**: Hybrid — Binance public klines API (no API key needed) + real TA calculations.

**Scope**: All 10 indicators + Polymarket refresh.

## Architecture

### 1. Shared TA Service (`lib/services/technical-analysis.service.ts`)

A singleton service that:
- Fetches real Binance klines via REST: `https://api.binance.com/api/v3/klines?symbol={SYMBOL}&interval={INTERVAL}&limit={LIMIT}`
- Calculates RSI, MACD, Bollinger Bands, EMA, ATR, Volume metrics from actual OHLCV data
- Caches results per symbol+interval for 60 seconds (via Map with timestamps)
- Returns structured `{ value, signal, rawData }` per indicator

**Supported symbols**: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, and any top-20 Binance pair.

**Intervals**: 1m, 5m, 15m, 1h, 4h, 1d (component selects which it needs).

### 2. API Route (`app/api/prices/route.ts`)

- Accepts `symbol`, `interval`, `indicators` query params
- Calls TA service, returns `{ price, change24h, klines, indicators: { rsi, macd, bollinger, ema9, ema21, ema50, atr, volume, trend } }`
- Rate limited: max 1 request per symbol per 5 seconds per client (in-memory)

### 3. Component Updates

Each indicator component:
- **Refresh button** in card header (calls `fetchData()`)
- **Inline BUY/SELL/HOLD badge** with color (green/red/yellow)
- **Tooltip** with layman explanation
- Reads from TA service via `/api/prices` or direct service call

**Polymarket**: Refresh button bypasses cache, always fetches live from Gamma API.

### 4. Indicator Calculations

| Indicator | Method |
|-----------|--------|
| RSI (14) | Standard Wilder RSI on close prices |
| MACD (12,26,9) | EMA(12) - EMA(26), signal = EMA(9) of MACD |
| Bollinger Bands (20,2) | SMA(20) ± 2*stdDev |
| EMA9, EMA21, EMA50 | Standard EMA |
| ATR (14) | Average True Range |
| Volume | Sum/average of volume candles |
| Trend | Compare price vs EMA50 |
| Momentum | RSI-based momentum |

### 5. Error Handling

- Binance API fails → return stale cached data with `stale: true` flag
- Insufficient klines for calculation → return partial with `insufficientData: true`
- Network error → show last known good values with warning badge

## Components

- `components/dashboard/rsi-indicator.tsx` — Real RSI with badge + tooltip
- `components/dashboard/macd-indicator.tsx` — Real MACD with badge + tooltip
- `components/dashboard/bollinger-indicator.tsx` — Real Bollinger with badge + tooltip
- `components/dashboard/moving-averages-indicator.tsx` — Real EMA with badge + tooltip
- `components/dashboard/volume-analyzer.tsx` — Real volume with badge + tooltip
- `components/dashboard/momentum-indicator.tsx` — Real momentum with badge + tooltip
- `components/dashboard/support-resistance.tsx` — Calculated from Bollinger with badge + tooltip
- `components/dashboard/trend-scanner.tsx` — Price vs EMA with badge + tooltip
- `components/dashboard/volatility-meter.tsx` — Real ATR with badge + tooltip
- `components/dashboard/lunar-phase-indicator.tsx` — Keep existing (already works), add refresh + tooltip
- `components/dashboard/polymarket-panel.tsx` — Force-live refresh

## Layman Tooltips

| Indicator | Tooltip |
|-----------|---------|
| RSI | "Measures if a crypto is overbought (above 70, red) or oversold (below 30, green). Above 70 means sellers might take over soon." |
| MACD | "Shows if a trend is gaining or losing steam. When the blue line crosses above orange, it often means 'buy'. When it crosses below, 'sell'." |
| Bollinger Bands | "The wider the bands, the more volatile the market. When price touches the top band, it might be overbought. Bottom band = oversold." |
| EMA | "Like a moving average but gives more weight to recent prices. If price is above all EMAs, short-term to long-term, that's bullish." |
| Volume | "How much is being traded. High volume with a price move = strong signal. Low volume = price might not hold." |
| Momentum | "How fast is the price changing? High momentum = strong move happening. Diverging from price = warning sign." |
| Support/Resistance | "Support = a price floor where buyers often step in. Resistance = a ceiling where sellers often step in." |
| Trend | "Green = price above the 50 EMA (bullish). Red = price below (bearish). Yellow = neutral." |
| Volatility | "How wild the price swings are. High volatility = bigger potential moves (and bigger risk)." |
| Lunar | "A fun/alternative signal based on lunar cycles. Some traders believe moon phases correlate with market sentiment." |
| Polymarket | "Live prediction market odds from Polymarket. Shows where traders are putting money on outcomes." |

## Badge Signal Logic

| Indicator | BUY (green) | SELL (red) | HOLD (yellow) |
|-----------|-------------|------------|---------------|
| RSI | < 30 | > 70 | 30-70 |
| MACD | MACD > Signal | MACD < Signal | Cross-over zone |
| Bollinger | Near lower band | Near upper band | Mid-range |
| EMA | Price > all EMAs | Price < all EMAs | Mixed |
| Momentum | > 55 | < 45 | 45-55 |
| Trend | Bullish | Bearish | Neutral |
| Volatility | < 1% (calm) | > 3% (wild) | 1-3% |
