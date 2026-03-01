# Crypto Trader OS - Backend API Documentation

## Overview

This backend provides real-time cryptocurrency trading data, technical analysis, trading signals, and position management capabilities.

**Tech Stack:** Next.js 14 App Router with TypeScript

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently no authentication required (for development).

## Rate Limiting

- CoinGecko API: ~50 requests/minute (free tier)
- Internal caching: 30 seconds for price data
- RSS feeds: 5 minute cache

---

## Endpoints

### 1. Prices API

#### Get Current Prices

```
GET /api/prices
```

**Query Parameters:**
- `symbol` (optional) - Get price for specific cryptocurrency (e.g., "BTC", "ETH")

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTC",
      "price": 67432.50,
      "change24h": 2.34,
      "volume24h": 32500000000,
      "marketCap": 1320000000000,
      "timestamp": 1699999999999
    }
  ],
  "timestamp": 1699999999999
}
```

**Supported Cryptocurrencies:**
BTC, ETH, BNB, ADA, SOL, XRP, DOT, DOGE, AVAX, LINK, MATIC, LTC, UNI, XLM, ATOM

---

### 2. Trading Signals API

#### Get Trading Signals

```
GET /api/signals
```

**Query Parameters:**
- `symbol` (optional) - Get signal for specific symbol only

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTC",
      "action": "BUY",
      "confidence": 0.85,
      "reasons": [
        "Strong bullish momentum across multiple indicators",
        "RSI at 45.2 (neutral)",
        "MACD showing bullish crossover"
      ],
      "indicators": [
        {
          "name": "RSI",
          "value": 45.2,
          "signal": "neutral",
          "confidence": 0.8
        }
      ],
      "timestamp": 1699999999999
    }
  ],
  "timestamp": 1699999999999
}
```

**Signal Types:**
- `BUY` - Bullish signal, consider long position
- `SELL` - Bearish signal, consider short position
- `HOLD` - Neutral, wait for confirmation

**Technical Indicators Used:**
- RSI (Relative Strength Index)
- MACD (Moving Average Convergence Divergence)
- Bollinger Bands
- SMA (Simple Moving Average) crossovers

---

### 3. Positions API

#### Get Positions & Portfolio

```
GET /api/positions
```

**Query Parameters:**
- `open=true` - Get only open positions
- `summary=true` - Get portfolio summary

**Response:**
```json
{
  "success": true,
  "data": {
    "positions": [
      {
        "id": "pos-1699999999-abc123",
        "symbol": "BTC",
        "type": "long",
        "entryPrice": 65000,
        "currentPrice": 67500,
        "quantity": 0.5,
        "leverage": 2,
        "marginUsed": 16250,
        "pnl": 1250,
        "pnlPercent": 3.85,
        "timestamp": 1699999999999,
        "status": "open"
      }
    ],
    "portfolio": {
      "totalBalance": 100000,
      "availableMargin": 83750,
      "usedMargin": 16250,
      "totalPnl": 1250,
      "lastUpdate": 1699999999999
    }
  }
}
```

#### Create Position

```
POST /api/positions
```

**Request Body:**
```json
{
  "symbol": "BTC",
  "type": "long",
  "entryPrice": 65000,
  "quantity": 0.5,
  "leverage": 2
}
```

**Response:** Returns the created position

#### Close Position

```
PUT /api/positions
```

**Request Body:**
```json
{
  "action": "close",
  "positionId": "pos-1699999999-abc123",
  "exitPrice": 68000
}
```

#### Reset Portfolio

```
DELETE /api/positions
```

**Warning:** This will reset all positions and balance to default ($100,000).

---

### 4. News API

#### Get Crypto News

```
GET /api/news
```

**Query Parameters:**
- `symbol` (optional) - Filter news for specific cryptocurrency
- `limit` (optional) - Number of articles (default: 20)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "coindesk-0-1699999999",
      "title": "Bitcoin Reaches New All-Time High",
      "description": "Bitcoin has surpassed its previous all-time high...",
      "url": "https://coindesk.com/article/...",
      "source": "coindesk",
      "publishedAt": 1699999999999,
      "sentiment": "positive",
      "relatedSymbols": ["BTC", "ETH"]
    }
  ],
  "timestamp": 1699999999999
}
```

**News Sources:**
- CoinDesk
- Cointelegraph
- CryptoSlate

---

### 5. Position Recommendations API

#### Get Position Sizing Recommendation

```
GET /api/recommendations?symbol=BTC&risk=2
```

**Query Parameters:**
- `symbol` (required) - Cryptocurrency symbol
- `risk` (optional) - Risk % of portfolio (default: 2)

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "BTC",
    "action": "BUY",
    "entryPrice": 67432.50,
    "targetPrice": 72000,
    "stopLoss": 64000,
    "positionSize": 0.15,
    "marginRequired": 5057.44,
    "riskReward": 3,
    "leverage": 2,
    "timestamp": 1699999999999
  }
}
```

**Risk Management:**
- Default 3:1 reward-risk ratio
- Position sizing based on portfolio percentage
- Automatic leverage calculation (max 10x)

---

### 6. Market Sentiment API

#### Get Market Sentiment

```
GET /api/sentiment
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": "bullish",
    "score": 72,
    "factors": {
      "fearAndGreed": 65,
      "trendStrength": 75,
      "volume": 60,
      "volatility": 45
    }
  },
  "timestamp": 1699999999999
}
```

**Sentiment Levels:**
- `bullish` - Score >= 65
- `bearish` - Score <= 35
- `neutral` - Score 36-64

---

## Error Handling

All endpoints return consistent error format:

```json
{
  "success": false,
  "error": "Error message description",
  "timestamp": 1699999999999
}
```

**HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (symbol not found)
- `500` - Internal Server Error

---

## Data Storage

Positions and portfolio data are stored locally in JSON files:
- `/data/portfolio.json` - Portfolio state
- `/data/positions.json` - Position history

Default starting balance: **$100,000**

---

## WebSocket Support (Planned)

Real-time price updates via WebSocket coming soon.

---

## Rate Limit Best Practices

1. Cache responses on the client side
2. Use specific symbol queries when possible
3. Implement exponential backoff for retries
4. Respect the 30-second cache TTL for price data

---

## Technical Indicator Calculations

### RSI (Relative Strength Index)
- Period: 14 candles
- Overbought: >= 70
- Oversold: <= 30

### MACD
- Fast EMA: 12
- Slow EMA: 26
- Signal Line: 9

### Bollinger Bands
- Period: 20
- Standard Deviation: 2

### Support/Resistance
- Lookback period: 20 candles
- Top 3 levels identified

---

## Development

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

API will be available at `http://localhost:3000/api/*`

### Build for Production

```bash
npm run build
npm start
```
