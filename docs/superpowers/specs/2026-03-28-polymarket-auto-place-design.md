# Polymarket AI Auto-Place + Performance Monitor

**Date:** 2026-03-28
**Status:** Draft

## Overview

The AI continuously monitors Polymarket for high conviction opportunities, automatically places paper trades based on configured settings, auto-resolves them when markets close, and tracks full performance analytics. This is a paper trading evaluation system to test whether the AI's conviction scoring produces profitable trade recommendations over time.

---

## Configuration Panel

A settings section in the Polymarket panel (collapsible, non-intrusive by default):

| Setting | Default | Description |
|---|---|---|
| **Auto-Trading** | OFF | Master enable/disable toggle |
| **Confidence Filter** | HIGH only | Only HIGH conviction, or allow MEDIUM |
| **Kelly Mode** | Quarter Kelly | Quarter / Half / Full Kelly sizing |
| **Max Open Positions** | 5 | Cap on simultaneous open paper trades |
| **Max Bet Size** | 10% of bankroll | Per-trade cap |
| **Starting Bankroll** | $1,000 | Separate from crypto portfolio |

---

## Architecture

### 1. PolymarketPortfolio Service
**File:** `lib/services/polymarket-portfolio.service.ts`

Tracks Polymarket paper positions. Separate from the existing `portfolio.service.ts` (crypto trading).

**Data model:**
```typescript
interface PolymarketPosition {
  id: string
  marketId: string
  question: string
  outcome: 'Yes' | 'No'
  entryPrice: number          // what you paid per share
  quantity: number             // number of shares
  cost: number                 // total cost (entryPrice * quantity)
  potentialPayout: number      // if correct: (1 - entryPrice) * quantity
  confidence: 'high' | 'medium' | 'low'
  safetyScore: number
  estimatedProbability: number
  marketImpliedProb: number
  category: 'crypto' | 'sports' | 'policy' | 'general'
  placedAt: number             // timestamp
  resolvedAt?: number          // when market resolved
  status: 'open' | 'won' | 'lost'
  resolution?: 'yes' | 'no' | 'invalid'
  pnl?: number                 // positive = profit, negative = loss
  pnlPercent?: number
  url: string
}

interface PolymarketPortfolio {
  bankroll: number
  startingBankroll: number
  totalPnl: number
  totalTrades: number
  wonTrades: number
  lostTrades: number
  positions: PolymarketPosition[]
  lastUpdate: number
}
```

**Persistence:** `data/polymarket-positions.json`

**Key functions:**
- `createPosition(rec: TradeRecommendation, kellyMode)` — applies Kelly sizing + guardrails, creates position
- `getPositions(openOnly?: boolean)` — fetch open or all positions
- `resolvePosition(positionId, resolution)` — mark as won/lost, calculate P&L
- `getPortfolio()` — current bankroll state
- `resetPortfolio()` — clear all positions, reset bankroll

**Guardrail enforcement:**
- Check `openPositions.length < maxOpenPositions` before placing
- Check `betSize <= maxBetSizePercent * bankroll` before placing
- Check `dailyPnlDrop < dailyLossLimit` (5% pause threshold)
- Check market not already placed (by `marketId`)

### 2. PolymarketAutoTrader Service
**File:** `lib/services/polymarket-auto-trader.ts`

Orchestrates the full auto-trading loop.

**Polling interval:** Every 15 minutes (configurable)

**On each poll:**
1. Load current config and open positions
2. If auto-trading is paused, skip placement
3. Fetch fresh HIGH conviction opportunities from Polymarket API
4. Filter out markets already placed (by `marketId`)
5. For each eligible opportunity:
   - Calculate Kelly bet size based on selected mode
   - Apply guardrails (max position, max bet size)
   - Create paper position via `PolymarketPortfolio`
6. Log placement with timestamp

**Auto-resolution job** (same 15-min poll):
1. Fetch closed Polymarket markets from Gamma API
2. For each open paper position:
   - If market has closed (check `endDateIso` vs now):
     - Fetch resolution from Gamma API (`closed=true`, match `question_id`)
     - Determine WIN/LOSS/INVALID
     - Call `resolvePosition()`
     - Record performance metrics
3. Flag any position open > 90 days for manual review

### 3. API Routes
**File:** `app/api/polymarket/route.ts` (extend existing)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/polymarket` | Existing: fetch opportunities |
| GET | `/api/polymarket/positions` | Open + closed paper positions |
| GET | `/api/polymarket/analytics` | Full performance stats |
| GET | `/api/polymarket/config` | Auto-trader settings |
| PUT | `/api/polymarket/config` | Update auto-trader settings |
| POST | `/api/polymarket/place` | Internal: place a paper trade |

**GET /api/polymarket/analytics response:**
```typescript
{
  totalTrades: number
  wonTrades: number
  lostTrades: number
  winRate: number              // percentage
  totalPnl: number
  roi: number                  // percentage
  evAccuracy: number           // % of trades where actual outcome beat market price
  avgHoldTimeDays: number
  bestTrade: PolymarketPosition | null
  worstTrade: PolymarketPosition | null
  profitByCategory: {
    crypto: number
    sports: number
    policy: number
    general: number
  }
  equityCurve: Array<{ date: string; value: number }>  // daily bankroll snapshots
  evAccuracyTrades: number      // count of trades used for EV accuracy calc
}
```

### 4. Auto-Improvement Integration
**File:** `lib/auto-improvement.ts` (extend)

The existing auto-improvement scheduler runs every 30 minutes. The PolymarketAutoTrader runs on its own independent 15-minute interval to keep Polymarket polling responsive. This avoids coupling the Polymarket system's timing to the general auto-improvement cycle.

---

## UI Changes

### Location: `components/dashboard/polymarket-section.tsx`

**1. Settings Panel** (top, collapsible)
- Toggle switch for auto-trading
- Kelly mode selector (quarter/half/full)
- Confidence filter (HIGH only / HIGH+MEDIUM)
- Max open positions input
- Max bet size slider (% of bankroll)
- Starting bankroll input
- Status indicator: "Auto-Trading Active" (green) / "Paused" (gray) with last trade time

**2. Paper Trades Tab**
Table of all positions (open + closed) with:
- Market question (truncated, link to Polymarket)
- Outcome (Yes/No badge)
- Entry price / quantity
- Cost and potential payout
- Status badge: OPEN (blue) / WON (green) / LOST (red)
- P&L column (only shown when resolved)
- Days held
- Sort controls: **multi-key sorting supported** — e.g., sort by Highest Profit THEN Highest Conviction. Available sort fields: Profit, Conviction, Safety Score, EV, Closing Soon, Date Placed.

**3. Performance Tab**
Full analytics dashboard:
- **Top stats row:** Win Rate, Total P&L, ROI %, EV Accuracy
- **Equity Curve chart:** Line chart of bankroll over time (using existing charting approach)
- **Profit by Category:** Bar chart or breakdown (crypto/sports/policy/general)
- **Trade History table:** All resolved trades with outcome
- **Best/Worst Trade cards:** Highest profit and lowest profit (or biggest loss)

**4. Performance Tab Sort Controls**
- Available sort fields: Highest Profit, Highest Conviction, Highest EV, Closing Soon, Date Placed, Safety Score, Category
- **Multi-key sorting:** Click first sort field, then hold Shift + click additional fields to add secondary/tertiary sort keys. Show active sort keys as chips below the sort bar.
- Default sort: Date Placed (newest first)

---

## Sort & Filter Behavior

### Sort Options (both Paper Trades tab and Performance tab)
| Sort Key | Direction | Description |
|---|---|---|
| Highest Profit | Desc | By P&L (resolved) or potential payout (open) |
| Highest Conviction | Desc | By confidence level (HIGH > MEDIUM > LOW) |
| Highest Safety Score | Desc | By numeric safety score 0-100 |
| Highest EV | Desc | By expected value percentage |
| Closing Soon | Asc | By days to market close |
| Date Placed | Desc | Most recent first |
| Category | Asc | crypto > general > policy > sports |

### Multi-Key Sort UX
- First click on a sort option sets it as primary
- Shift+click adds a secondary sort key (shown as "Profit → Conviction")
- Third Shift+click adds tertiary sort key
- Clicking the same key again toggles direction
- Clear all button resets to default

---

## Error Handling

- **API failure:** Log error, skip this cycle, retry next interval. Never leave the system in a broken state.
- **Market already closed at placement:** Check `endDateIso` before placing. Skip if closing within 1 day.
- **Gamma API rate limit:** Add exponential backoff (1s, 2s, 4s) up to 3 retries.
- **Invalid resolution:** Mark position as INVALID with P&L = 0 (no win/loss counted).
- **Position exceeds bankroll:** Cap at available bankroll, log the adjustment.

---

## Risk & Safety

- Paper trading only — no real money involved in this phase
- Clear visual distinction between "paper trade" and any future "live trade" state
- All placements logged with timestamp for full audit trail
- Daily loss limit (5% bankroll drop) pauses new placements but doesn't close existing positions
- 90-day unresolved position flagging for manual review

---

## Out of Scope (Phase 2)

- Real money execution via browser automation
- Notification system (email/Slack when trade placed)
- Comparison with manual trades (leaderboard)
- Backtesting against historical opportunities
