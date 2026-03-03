# Recursive Trading Improvement System

## Overview

This system makes your trading app **smarter over time** by learning from its predictions and automatically improving its strategies, indicators, and UI.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    RECURSIVE IMPROVEMENT LOOP                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │ PREDICT │───▶│ TRACK   │───▶│ LEARN   │───▶│ IMPROVE │  │
│  │Market  │    │Outcomes│    │Patterns │    │Strategies│  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│       │              │              │              │         │
│       ▼              ▼              ▼              ▼         │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │Hourly  │    │Auto    │    │Feature │    │AI      │  │
│  │Cron    │    │Scoring │    │Weights │    │Generation│  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                               │
│  Key: Every prediction is tracked → Learn what works → Generate │
│       better strategies → Improve predictions → Repeat          │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. TradingImprovementSystem
**File:** `lib/agents/trading-improvement-system.ts`

Core system that:
- Records all trading predictions
- Tracks prediction accuracy
- Calculates feature importance (which indicators work best)
- Generates new strategies based on performance
- Tracks UI usage patterns for optimization

**Key Methods:**
- `recordPrediction()` - Save a trading prediction
- `recordOutcome()` - Record what actually happened
- `getFeatureAnalysis()` - See which indicators work best
- `getPerformanceReport()` - Get overall system performance

### 2. PredictionTracker
**File:** `lib/agents/prediction-tracker.ts`

Automatically tracks:
- All predictions made by the system
- Price movements after predictions
- Whether predictions were correct
- Max profit/loss for each prediction

### 3. AdaptiveStrategyGenerator
**File:** `lib/agents/adaptive-strategy-generator.ts`

Uses AI to:
- Detect market regime changes (bullish/bearish/ranging)
- Generate new strategies for current conditions
- Create new trading indicators
- Analyze failures and generate corrections

### 4. Cron Jobs (Vercel)
**Files:** `app/api/cron/*/route.ts`

- **Hourly (`/api/cron/market-analysis`)**: Generate predictions, track prices
- **Every 6 hours (`/api/cron/improvement-cycle`)**: Update feature importance
- **Weekly (`/api/cron/strategy-generation`)**: Generate new strategies

## How It Works

### Phase 1: Data Collection

Every time the app makes a trading prediction:

```typescript
// System automatically records:
{
  symbol: "BTC",
  prediction: { action: "LONG", confidence: 75 },
  indicators: [
    { name: "RSI", value: 45, signal: "bullish" },
    { name: "MACD", value: 2.4, signal: "bullish" }
  ],
  timestamp: 1234567890
}
```

### Phase 2: Outcome Tracking

After 4 hours (or when stop loss/take profit hits):

```typescript
{
  outcome: {
    actualMove: +2.3%,    // Price went up 2.3%
    wasCorrect: true,     // Prediction was right
    maxProfit: 2.3,       // Max profit possible
    maxLoss: -0.5         // Max loss if stopped
  }
}
```

### Phase 3: Learning

System calculates for each indicator:

| Indicator | Accuracy | When Used | Profitability |
|-----------|----------|-----------|---------------|
| RSI < 30 | 68% | 152 times | +1.8% avg |
| MACD cross | 54% | 89 times | +0.9% avg |
| EMA trend | 71% | 203 times | +2.1% avg |

### Phase 4: Improvement

System automatically:
1. Increases weight for high-accuracy indicators
2. Decreases weight for low-accuracy ones
3. Generates new strategies combining best indicators
4. Creates new indicators via AI
5. Suggests UI improvements based on usage

## API Endpoints

### Record a prediction
```bash
POST /api/improvement?action=predict
{
  "symbol": "BTC",
  "prediction": { "action": "LONG", "confidence": 75 },
  "indicators": [...],
  "marketContext": { "trend": "bullish" }
}
```

### Get weighted indicators
```bash
GET /api/improvement?action=weighted&symbol=BTC
```
Returns indicators with weights based on historical performance.

### Get feature analysis
```bash
GET /api/improvement?action=analysis
```
Returns which indicators work best.

### Get performance report
```bash
GET /api/improvement?action=report
```
Returns overall system performance and recommendations.

### Get UI optimizations
```bash
GET /api/improvement?action=ui
```
Returns suggestions for UI improvements based on usage patterns.

## State Files

- `data/trading-improvement-state.json` - Main system state
- `data/pending-predictions.json` - Predictions awaiting outcomes
- `data/adaptive-strategies.json` - Generated strategies
- `data/strategy-failures.json` - Failure analysis

## Environment Variables

```env
# Required for cron jobs (Vercel)
CRON_SECRET=your-secret-key

# Required for AI strategy generation
ANTHROPIC_API_KEY=your-key

# App URL for callbacks
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

## Vercel Cron Jobs

The system uses Vercel Cron Jobs for autonomous operation:

```json
{
  "crons": [
    {
      "path": "/api/cron/market-analysis",
      "schedule": "0 * * * *"  // Every hour
    },
    {
      "path": "/api/cron/improvement-cycle",
      "schedule": "0 */6 * * *"  // Every 6 hours
    },
    {
      "path": "/api/cron/strategy-generation",
      "schedule": "0 0 * * 0"  // Weekly
    }
  ]
}
```

## Monitoring

Check system status:
```bash
curl https://your-app.vercel.app/api/improvement?action=state
```

Expected response:
```json
{
  "success": true,
  "data": {
    "state": {
      "predictions": 152,
      "features": [
        { "name": "RSI", "accuracy": 0.68, "predictions": 152 },
        { "name": "MACD", "accuracy": 0.54, "predictions": 89 }
      ],
      "strategies": 5,
      "overallAccuracy": 0.62
    }
  }
}
```

## Key Improvements Over Time

### Week 1
- System collects baseline data
- No improvements yet (need 50+ predictions)

### Week 2-4
- Feature importance scores emerge
- Best/worst indicators identified
- First strategies generated

### Month 2-3
- Strategies refined based on performance
- New indicators created
- UI optimized based on usage

### Month 4+
- System significantly more accurate than baseline
- Auto-generates strategies for market conditions
- Continuous improvement cycle

## Safety Features

1. **Human approval required** for major strategy changes
2. **Rollback support** - all changes tracked in git
3. **Conservative defaults** - low position sizes until proven
4. **Multiple confirmations** required before high-confidence trades

## Future Enhancements

- [ ] Multi-symbol correlation analysis
- [ ] Sentiment analysis integration
- [ ] On-chain data integration
- [ ] Social sentiment tracking
- [ ] News-based signal generation
- [ ] Portfolio-level optimization
- [ ] Risk-adjusted strategy selection
