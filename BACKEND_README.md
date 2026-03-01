# Crypto Trader OS - Backend API

A real-time cryptocurrency trading backend built with Node.js, Express, and WebSocket support.

## Features

- **Real-time Price Updates** - WebSocket streaming of live crypto prices
- **Trading Signals** - Technical analysis-based buy/sell signals
- **Position Management** - Create, track, and close trading positions
- **Portfolio Tracking** - Real-time P&L calculation and margin management
- **Market Sentiment** - Overall market sentiment analysis
- **News Feed** - Crypto news with sentiment analysis

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Real-time**: WebSocket (ws)
- **External APIs**: CoinGecko (optional API key), RSS to JSON

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Environment variables:
```env
# API Keys (optional - works without keys)
COINGECKO_API_KEY=

# Server Configuration
PORT=3000
WS_PORT=3001

# Position Calculator Defaults
ACCOUNT_BALANCE=10000
MAX_RISK_PER_TRADE=2
MAX_LEVERAGE=10
MIN_RISK_REWARD=2

# Update Intervals (milliseconds)
PRICE_UPDATE_INTERVAL=5000
SIGNAL_UPDATE_INTERVAL=30000

# Supported Symbols (comma-separated)
SUPPORTED_SYMBOLS=BTC,ETH,SOL,ADA,DOT
```

### 3. Run Development Server

```bash
npm run dev
```

The server will start on:
- **REST API**: http://localhost:3000
- **WebSocket**: ws://localhost:3001

### 4. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage
```

## API Endpoints

### Health Check

```
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": 1699999999999
}
```

### Get Prices

```
GET /api/prices?symbols=BTC,ETH,SOL
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTC",
      "price": 67500.50,
      "change24h": 2.34,
      "volume24h": 32500000000,
      "marketCap": 1320000000000,
      "timestamp": 1699999999999
    }
  ],
  "timestamp": 1699999999999
}
```

### Get Trading Signal

```
GET /api/signals/:symbol
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "BTC",
    "action": "BUY",
    "confidence": 85,
    "reasons": [
      "SMA-20 shows bullish momentum",
      "RSI indicates oversold conditions"
    ],
    "indicators": [
      {
        "name": "SMA-20",
        "value": 67000,
        "signal": "bullish",
        "confidence": 2.5
      },
      {
        "name": "RSI",
        "value": 28,
        "signal": "bullish",
        "confidence": 22
      }
    ],
    "timestamp": 1699999999999
  }
}
```

### Calculate Position

```
POST /api/position/calculate
```

**Request Body:**
```json
{
  "symbol": "BTC",
  "action": "BUY",
  "currentPrice": 67500,
  "stopLossPercent": 2,
  "targetPercent": 5
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "BTC",
    "action": "BUY",
    "entryPrice": 67500,
    "targetPrice": 70875,
    "stopLoss": 66150,
    "positionSize": 0.15,
    "marginRequired": 5062.5,
    "riskReward": 2.5,
    "leverage": 1,
    "timestamp": 1699999999999
  }
}
```

### Get Portfolio

```
GET /api/portfolio
```

**Response:**
```json
{
  "success": true,
  "data": {
    "portfolio": {
      "totalBalance": 10000,
      "availableMargin": 4937.5,
      "usedMargin": 5062.5,
      "totalPnl": 125,
      "lastUpdate": 1699999999999
    },
    "positions": [
      {
        "id": "pos-1699999999-abc123",
        "symbol": "BTC",
        "type": "long",
        "entryPrice": 67000,
        "currentPrice": 67500,
        "quantity": 0.15,
        "leverage": 1,
        "marginUsed": 5062.5,
        "pnl": 75,
        "pnlPercent": 0.75,
        "timestamp": 1699999999999,
        "status": "open"
      }
    ]
  }
}
```

### Create Position

```
POST /api/positions
```

**Request Body:**
```json
{
  "symbol": "BTC",
  "type": "long",
  "entryPrice": 67500,
  "quantity": 0.1,
  "leverage": 2
}
```

### Close Position

```
PUT /api/positions/:id
```

**Request Body:**
```json
{
  "action": "close",
  "exitPrice": 68000
}
```

### Reset Portfolio

```
DELETE /api/portfolio
```

**Warning:** This resets all positions and balance to defaults.

### Get News

```
GET /api/news?symbol=BTC&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "coindesk-0-1699999999",
      "title": "Bitcoin Reaches New High",
      "description": "Bitcoin has surpassed...",
      "url": "https://coindesk.com/...",
      "source": "coindesk",
      "publishedAt": 1699999999999,
      "sentiment": "positive",
      "relatedSymbols": ["BTC", "ETH"]
    }
  ],
  "timestamp": 1699999999999
}
```

### Get Market Sentiment

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
  }
}
```

### Get Configuration

```
GET /api/config
```

**Response:**
```json
{
  "success": true,
  "data": {
    "maxLeverage": 10,
    "maxRiskPerTrade": 2,
    "minRiskReward": 2,
    "supportedSymbols": ["BTC", "ETH", "SOL", "ADA", "DOT"],
    "accountBalance": 10000
  }
}
```

## WebSocket API

### Connection

```
ws://localhost:3001
```

### Message Types

#### Price Update

```json
{
  "type": "price",
  "data": {
    "symbol": "BTC",
    "price": 67500.50,
    "change24h": 2.34,
    "volume24h": 32500000000,
    "marketCap": 1320000000000,
    "timestamp": 1699999999999
  }
}
```

#### Trading Signal

```json
{
  "type": "signal",
  "data": {
    "symbol": "BTC",
    "action": "BUY",
    "confidence": 85,
    "reasons": ["..."],
    "timestamp": 1699999999999
  }
}
```

#### Market Sentiment

```json
{
  "type": "sentiment",
  "data": {
    "overall": "bullish",
    "score": 72,
    "factors": {...}
  }
}
```

## Technical Indicators

The following indicators are calculated:

- **SMA (Simple Moving Average)** - 20 period
- **RSI (Relative Strength Index)** - 14 period
- **MACD** - 12/26/9 periods
- **Bollinger Bands** - 20 period, 2 std dev

## Data Storage

Positions and portfolio data are stored in:
- `/data/portfolio.json` - Portfolio state
- `/data/positions.json` - Position history

## Architecture

```
src/
├── server.ts              # Express server & API routes
├── services/
│   ├── cryptoDataService.ts    # Price data & signals
│   ├── positionCalculator.ts   # Position sizing logic
│   ├── websocketService.ts     # WebSocket server
│   ├── newsService.ts          # News aggregation
│   ├── portfolioService.ts     # Portfolio management
│   └── sentimentService.ts     # Market sentiment
├── types/
│   └── index.ts          # TypeScript types
└── tests/
    ├── cryptoDataService.test.ts
    ├── positionCalculator.test.ts
    └── apiIntegration.test.ts
```

## Error Handling

All API responses follow this format:

**Success:**
```json
{
  "success": true,
  "data": {...},
  "timestamp": 1699999999999
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message",
  "timestamp": 1699999999999
}
```

## Rate Limiting

- Price updates: Every 5 seconds (configurable)
- Signal generation: 10% chance per update
- News cache: 5 minutes

## Deployment

### Build

```bash
npm run build
```

### Production Start

```bash
npm start
```

### Environment Variables for Production

Set all environment variables before starting the server.

## License

MIT
