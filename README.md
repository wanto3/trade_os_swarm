# Crypto Trading OS

Real-time cryptocurrency trading guidance application with technical indicators, position management, and live updates.

## Features

- Real-time crypto price updates
- Technical indicator calculations (SMA, RSI, Momentum)
- Trading signal generation (BUY/SELL/HOLD)
- Position size calculator with risk management
- Portfolio tracking with P&L calculations
- Market sentiment analysis
- Crypto news feed with sentiment detection
- REST API for data access
- Next.js App Router for unified frontend/backend

## Architecture

**Tech Stack:**
- **Frontend**: Next.js 14 with App Router, React, Tailwind CSS
- **Backend**: Next.js API Routes (no separate server needed)
- **Language**: TypeScript
- **Data Storage**: JSON file-based persistence
- **Testing**: Vitest

This unified architecture allows the frontend and backend to run on a single server with simplified deployment.

## Installation

```bash
npm install
```

## Configuration

Create a `.env.local` file for environment variables:

```env
# Optional: Account balance for position calculator
ACCOUNT_BALANCE=10000
MAX_RISK_PER_TRADE=2
MAX_LEVERAGE=10
MIN_RISK_REWARD=2
```

## Running the Application

### Development
```bash
npm run dev
```

The application will run on http://localhost:3000

### Production Build
```bash
npm run build
npm start
```

## API Endpoints

All endpoints return JSON with this format:
```json
{
  "success": true,
  "data": {...},
  "timestamp": 1699999999999
}
```

### Health Check
```
GET /api/health
```

### Prices
```
GET /api/prices?symbols=BTC,ETH,SOL
```

### Trading Signals
```
GET /api/signals?symbol=BTC
```

### Position Management
```
GET    /api/positions         # Get all positions
POST   /api/positions         # Create position
PUT    /api/positions         # Close position
DELETE /api/positions         # Reset portfolio
```

### Portfolio
```
GET    /api/portfolio         # Get portfolio state
DELETE /api/portfolio         # Reset portfolio
```

### Position Calculator
```
POST /api/position/calculate
{
  "symbol": "BTC",
  "currentPrice": 67500,
  "stopLossPercent": 2,
  "targetPercent": 5
}
```

### Market Sentiment
```
GET /api/sentiment
```

### News
```
GET /api/news?symbol=BTC&limit=10
```

### Configuration
```
GET /api/config
```

## Project Structure

```
crytpo_trader_OS/
├── app/
│   ├── api/                 # Next.js API Routes
│   │   ├── health/
│   │   ├── prices/
│   │   ├── signals/
│   │   ├── positions/
│   │   ├── portfolio/
│   │   ├── news/
│   │   ├── sentiment/
│   │   ├── config/
│   │   └── position/calculate/
│   ├── page.tsx             # Main dashboard
│   └── layout.tsx           # Root layout
├── components/
│   ├── dashboard/           # Dashboard components
│   └── ui/                 # UI components
├── lib/
│   ├── services/            # Business logic services
│   │   ├── crypto-data.service.ts
│   │   ├── position-calculator.service.ts
│   │   ├── portfolio.service.ts
│   │   ├── news.service.ts
│   │   └── sentiment.service.ts
│   ├── types.ts             # Shared types
│   └── utils.ts             # Utilities
├── src/
│   ├── types/               # Legacy types (will be merged)
│   └── tests/               # Test files
├── data/                    # Persistent data storage
│   ├── portfolio.json
│   └── positions.json
└── package.json
```

## Technical Indicators

- **SMA-20**: Simple Moving Average over 20 periods
- **RSI**: Relative Strength Index (14 period)
- **Momentum-5**: 5-period momentum indicator

## Position Sizing

The position calculator uses:
- Risk-based position sizing (default 2% of account)
- Configurable max leverage (default 10x)
- Minimum risk-reward ratio validation (default 2:1)
- Automatic margin calculation

## Data Storage

Portfolio and positions are stored in `/data/` directory:
- `portfolio.json` - Account balance, margin, P&L
- `positions.json` - All position records

Default starting balance: **$10,000**

## Testing

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
npm run type-check       # TypeScript check
```

## Deployment

This app can be deployed to any platform that supports Next.js:
- Vercel (recommended)
- Netlify
- AWS Amplify
- Self-hosted Node.js

```bash
npm run build
```

The build output is optimized for production with automatic code splitting and API route optimization.

## License

MIT
