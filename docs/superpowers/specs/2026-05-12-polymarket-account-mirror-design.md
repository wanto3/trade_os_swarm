# Polymarket Account Mirror + Algo Audit — Design Spec

**Date:** 2026-05-12
**Owner:** wanto3
**Status:** Approved (brainstorm), pending implementation plan

## Problem

The dashboard currently shows a synthetic $1000 paper bankroll and zero
positions because:

1. **Render free tier has ephemeral disk.** Every deploy wipes
   `data/polymarket-portfolio.json` so the user's paper-trade history
   resets to the hardcoded $1000 default.
2. **The user trades real money on Polymarket** but the dashboard has no
   visibility into that account — there's no way to evaluate whether the
   algorithm's recommendations actually win.

Net effect: we ship algorithm improvements (fabrication clamps,
direction labels, win-probability ranking) but can't measure if they
helped, because every deploy resets the slate and the dashboard never
saw the user's real activity in the first place.

## Goal

Connect the dashboard to the user's real Polymarket account in
**read-only** mode. Use it as the source of truth for portfolio value
and W/L outcomes, so:

- Disk wipes stop mattering — on-chain history is durable, the
  dashboard becomes a stateless lens
- The algorithm's recommendations can be cross-referenced against
  the user's actual positions and resolved outcomes to compute real
  hit rates per category × confidence × DPS tier

## Non-Goals

- **Auto-placing real-money bets.** Requires API keys + Polymarket CLOB
  signing + proxy wallet auth — much higher complexity, real-money
  risk, and a different security model. Out of scope. Paper-trade
  placement stays as-is for testing.
- **Multi-account / multi-user support.** Single-user app, single
  address.
- **Reconstructing pre-spec history.** Algo audit (Phase B) only works
  for picks made AFTER the recommendation-logging system ships. We
  don't retroactively reconstruct what the algo would have picked.

## Architecture Overview

Two phases, shippable independently:

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE A: Read-only Portfolio Mirror                         │
│                                                              │
│  User pastes 0x address  →  data/polymarket-account.json   │
│                                                              │
│  Dashboard load          →  GET data-api.polymarket.com/*  │
│                          →  cache 5min                      │
│                          →  render real positions + value  │
│                                                              │
│  💼 "Portfolio" tab replaces "Paper Trades" when address    │
│     is set. Toggle back to paper mode for sandbox testing.  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PHASE B: Algo Audit (GitHub-as-DB)                          │
│                                                              │
│  Every full pipeline run   →  snapshot top recs to disk     │
│                            →  PUT GitHub Contents API       │
│                                  (separate orphan branch)   │
│                                                              │
│  On dashboard load         →  pull last 14 days of          │
│                                snapshots from raw github    │
│                            →  fuzzy-match user's real       │
│                                positions to algo recs       │
│                            →  compute hit rate per          │
│                                category × confidence        │
│                            →  surface on Decision Card +    │
│                                new "Algo Performance" panel │
└─────────────────────────────────────────────────────────────┘
```

## Phase A: Read-only Portfolio Mirror

### Account Configuration

**New file:** `data/polymarket-account.json`

```json
{
  "address": "0x...",
  "displayName": "optional handle from polymarket profile",
  "addedAt": 1747000000000
}
```

**New endpoint:** `POST /api/polymarket/account`

```typescript
// Body: { address: string }
// Validates: matches /^0x[a-fA-F0-9]{40}$/, returns 400 otherwise
// Side effect: writes to data/polymarket-account.json, clears cached
//              portfolio data so next GET pulls fresh
// Response: { success: true, address }
```

**New endpoint:** `DELETE /api/polymarket/account`

```typescript
// Removes the saved address — reverts to paper-trade mode
```

### Data Fetching

**New service:** `lib/services/polymarket-live-portfolio.service.ts`

Wraps three public Polymarket Data API endpoints:

```typescript
interface LivePosition {
  conditionId: string
  asset: string
  slug: string
  eventSlug?: string
  outcome: string         // 'Yes'/'No' or team name
  outcomeIndex: number
  size: number            // share count
  avgPrice: number        // entry price (0..1)
  curPrice: number        // current price (0..1)
  initialValue: number    // = size * avgPrice (USDC paid)
  currentValue: number    // = size * curPrice (USDC mark-to-market)
  cashPnl: number         // currentValue - initialValue
  percentPnl: number      // cashPnl / initialValue
  totalBought: number
  redeemable: boolean
  // Earliest trade timestamp for this conditionId, derived from the
  // activity feed. Used as the cutoff anchor for algo cross-reference
  // (the algo had to have recommended this BEFORE the user placed it
  // for the match to make sense). Positions are aggregated so they
  // don't carry a single timestamp natively — we backfill from
  // activity[].timestamp.
  firstBuyTimestamp?: number
  // Resolution state, from on-chain UMA settle
  resolved?: boolean
  winningOutcome?: string
}

interface LiveActivity {
  type: 'TRADE' | 'REWARD' | 'CONVERSION' | 'MERGE' | 'SPLIT' | 'REDEEM'
  timestamp: number
  conditionId: string
  side: 'BUY' | 'SELL'
  outcome: string
  price: number
  size: number
  question: string
  // Plus market metadata that's helpful for the audit lookup
}

interface LiveValue {
  value: number          // current portfolio USDC value
  cashPnl: number        // all-time realized + unrealized
}

export async function fetchLivePortfolio(address: string): Promise<{
  positions: LivePosition[]
  activity: LiveActivity[]
  value: LiveValue
  fetchedAt: number
}>
```

Each fetch hits:

```
GET https://data-api.polymarket.com/positions?user={addr}&sizeThreshold=0.1&limit=200
GET https://data-api.polymarket.com/activity?user={addr}&type=TRADE&limit=300
GET https://data-api.polymarket.com/value?user={addr}
```

Cached in-memory + on-disk (`data/polymarket-account-cache.json`) with
a 5-min TTL. Manual refresh via existing dashboard refresh button or a
`?refresh=1` query parameter on the position endpoint.

### Endpoint Changes

**Modify:** `GET /api/polymarket/positions`

Current behavior: returns paper portfolio from
`data/polymarket-portfolio.json`.

New behavior:
1. If `data/polymarket-account.json` exists AND user hasn't explicitly
   enabled paper-mode override → return live portfolio data, mapped to
   the existing `PolymarketPosition[]` + `PolymarketPortfolio` shape
   that the UI already understands
2. Else → existing paper-trade behavior

The mapping function `liveToPaperShape(live)` builds the
`PolymarketPortfolio` from `LiveValue.value` (bankroll) plus the
`LivePosition[]` translated 1:1.

**New endpoint:** `GET /api/polymarket/account`

Returns the saved address (or 404 if none) so the UI can render the
"set address" prompt vs the configured state.

### UI Changes

**Rename tab conditionally:** "Paper Trades" → "💼 Portfolio" when an
address is set. The body of that tab gets a header strip:

```
┌─────────────────────────────────────────────────────────────┐
│ 💼 Portfolio  ·  0x12...ab34  [edit]  [paper mode]         │
│ Real bankroll: $47.32  ·  PnL: +$12.40 (+35.6%)  · 5 open  │
└─────────────────────────────────────────────────────────────┘
```

**New component:** `components/dashboard/account-setup.tsx`

Shown when no address is configured. Single input + save button + a
"how to find your address" hint:

> "Find your Polymarket address: open polymarket.com → click your
> avatar → 'Profile'. The `0x...` shown is your address. Paste it
> below — read-only, we never need your private key or funds."

After saving, swaps in the portfolio panel.

Existing position cards render as-is — same `PolymarketPosition` shape,
just real data underneath. Won / lost / open status pulls from the
live position resolution.

### Caching + Rate Limits

- 5-min in-memory + disk cache per address. Polymarket Data API has no
  documented hard rate limit but is courtesy-throttled — 5 min is
  plenty for a single-user dashboard.
- `?refresh=1` query parameter forces a refetch (wired to the existing
  dashboard refresh button).
- On network failure, serve stale cache + show a "live data stale"
  badge instead of breaking the page.

### Error Handling

- 400 from Polymarket → "Invalid Polymarket address. Did you copy the
  full 0x address from your profile?"
- 5xx / network error → serve stale cache if any, otherwise show error
  state with retry button
- Empty positions / activity (new account) → "No positions yet —
  place a bet on polymarket.com and refresh"

## Phase B: Algo Audit (GitHub-as-DB)

### Why Persistence Matters

Algo audit needs to know "what did the model recommend on day X" so
when a position resolves we can ask "was this an algo pick?". The
recommendations live in `data/polymarket-analyzed-cache.json` which
is on Render's ephemeral disk — wiped on every deploy. We need a
durable record.

### GitHub-as-DB

**Setup:**

1. New private repo (`wanto3/trade-os-algo-history`, or any name).
   Distinct from the main app repo so commits don't trigger Render
   redeploys.
2. `GITHUB_ALGO_HISTORY_TOKEN` env var on Render — fine-grained PAT
   scoped to write access on that single repo.
3. `GITHUB_ALGO_HISTORY_REPO` env var — owner/repo string.

**Recording (write path):**

After every full pipeline run (in `runFullPipeline()` in
`app/api/polymarket/route.ts`), capture a snapshot:

```typescript
interface DailyAlgoSnapshot {
  date: string  // 'YYYY-MM-DD'
  runAt: number
  recs: Array<{
    marketId: string
    marketSlug: string
    question: string
    outcomes: string[]
    outcomePrices: number[]
    yesPrice: number
    llmDirection: 'yes' | 'no' | 'skip' | null
    llmConfidence: 'high' | 'medium' | 'low' | null
    llmEstimate: number | null
    edgeSize: number | null
    aiEdge?: 'strong' | 'user' | 'weak'
    dpsCategory?: string
    dpsTier?: 'high' | 'medium' | 'low'
    reasoning: string  // first 300 chars
    plainSummary?: string
    reasoningAgainst?: string
    endDateIso?: string
  }>
}
```

Written to `algo-history/YYYY-MM-DD.json` in the history repo via the
GitHub Contents API (`PUT /repos/{owner}/{repo}/contents/{path}`).
**Throttled:** at most one commit per 12h per date — within-day
re-runs UPSERT the file (replace, single SHA) so we don't churn the
commit log.

**Reading (read path):**

On dashboard load, fetch the last 14 days of files from the history
repo. If the repo is **private**, fetch via the Contents API with the
PAT (`GET /repos/{owner}/{repo}/contents/algo-history/{date}.json`,
base64-decode the `content` field). If **public**, the raw endpoint
avoids the API and rate limits:

```
https://raw.githubusercontent.com/{owner}/{repo}/main/algo-history/2026-05-12.json
```

Default to **public repo** for v1 — algo recommendations don't expose
trading positions or personal info, just market-side predictions.
Trivial to switch to private later.

Cached in-memory for 30 min — recs from 7 days ago don't change on a
5-min timescale.

### Cross-Reference Matching

For each real position from `liveToPaperShape(live)`:

```typescript
function matchPositionToAlgo(
  position: LivePosition,
  history: DailyAlgoSnapshot[],
): AlgoMatch | null {
  // Window: algo recs from up to 7 days BEFORE the position's first
  // buy timestamp (recs after the user already placed the trade
  // don't qualify as having "recommended" it). Fall back to "last 7
  // days from now" if firstBuyTimestamp wasn't backfilled — the
  // wider window can produce false positives but is the safe default
  // when we lack the precise trade time.
  const anchor = position.firstBuyTimestamp ?? Date.now()
  const lowerBound = anchor - 7 * 24 * 3600_000
  const upperBound = anchor
  for (const snap of history) {
    if (snap.runAt < lowerBound || snap.runAt > upperBound) continue
    for (const rec of snap.recs) {
      // Match by marketSlug primarily (deterministic, on-chain)
      if (rec.marketSlug === position.slug ||
          rec.marketId === position.conditionId) {
        // Confirm the side matches what the algo recommended
        const algoSide = rec.llmDirection === 'yes'
          ? rec.outcomes[0]
          : rec.llmDirection === 'no' ? rec.outcomes[1] : null
        if (algoSide && algoSide === position.outcome) {
          return {
            matched: true,
            rec,
            snapshotDate: snap.date,
            sameSide: true,
          }
        }
        // Match found but user took the OTHER side
        return { matched: true, rec, snapshotDate: snap.date, sameSide: false }
      }
    }
  }
  return null
}
```

**No fuzzy text matching.** Polymarket slugs and conditionIds are
stable and deterministic — that's the reliable join key.

### UI Surface

**Per-position chip:** each live position card gets a small badge:

- `🤖 from algo (DPS:high, medium conf)` — algo recommended this exact
  side, you took it
- `🤖 algo said other side` — algo had a different side; user
  independently overrode
- `👤 independent` — no algo rec exists for this market in the
  history window

**New panel:** "📊 Algo Performance" — collapsible section in the
Portfolio tab. Aggregates:

```
ALGO HIT RATE (last 30 days)
─────────────────────────────────────────────────
By confidence:
  high      5W / 3L   62.5%   ($+18.40)
  medium    8W / 6L   57.1%   ($+12.20)
  low       3W / 5L   37.5%   ($-4.80)

By category:
  crypto    6W / 1L   85.7%   ($+22.10)
  sports    4W / 5L   44.4%   ($-2.00)
  esports   2W / 6L   25.0%   ($-8.60)   ← worst category

By AI edge tier:
  AI Strong   9W / 4L   69.2%   ($+18.10)
  User Edge   3W / 5L   37.5%   ($-4.40)
  Limited     1W / 5L   16.7%   ($-7.20)
```

Only counts positions where `matched === true && sameSide === true` —
i.e. you actually followed the algo's recommendation. Independent picks
get their own row at the bottom.

**Decision Card update:** the "Track" footer (designed in the
smarter-decision-ux spec) is now populated from real audit data
instead of paper-trade aggregates.

## File Structure

```
Create:
  app/api/polymarket/account/route.ts
    GET, POST, DELETE for address management

  app/api/polymarket/algo-history/route.ts
    GET only — returns last N days of saved snapshots, cached.

  lib/services/polymarket-live-portfolio.service.ts
    fetchLivePortfolio(), liveToPaperShape() mapper.

  lib/services/algo-history.service.ts
    persistDailySnapshot(), loadRecentHistory(),
    matchPositionToAlgo() — GitHub-as-DB CRUD.

  components/dashboard/account-setup.tsx
    First-run prompt to paste address.

  components/dashboard/algo-performance.tsx
    The aggregated hit-rate panel.

Modify:
  app/api/polymarket/positions/route.ts
    Branch: live mode if address set, else paper.

  app/api/polymarket/route.ts (runFullPipeline)
    Call persistDailySnapshot() after computing recommendations.

  components/dashboard/polymarket-section.tsx
    Render account-setup OR portfolio header strip;
    add the algo-performance panel.

  lib/services/polymarket-portfolio.service.ts
    Add `getEffectivePortfolio()` that returns live data when address
    is set, paper data otherwise.
```

## Phasing

**Phase A — Read-only portfolio mirror** (ships first, standalone value):

1. Account config endpoints + state file
2. Polymarket Data API service + 5-min cache
3. UI: account-setup component + portfolio header strip
4. Modify positions route to branch live vs paper
5. Verify on prod with real wallet address

After Phase A ships, real bankroll + real positions are visible.
Disk-wipes stop mattering for portfolio data.

**Phase B — Algo audit** (after Phase A is verified):

6. Set up history repo + env vars
7. `algo-history.service.ts` with persist + load helpers
8. Wire persistDailySnapshot() into runFullPipeline()
9. Cross-reference matcher
10. Algo-performance panel UI
11. Decision-card track footer pulls real hit-rate

Phase B starts producing useful data after ~1 week of accumulated
snapshots. Until then the audit panel shows "Building history —
N days of recommendations recorded so far."

## Out of Scope / Future

- Auto-place actual Polymarket bets via CLOB API (separate spec when
  the algo's hit rate proves out)
- Real-time WebSocket subscription to position changes (current 5-min
  polling is fine for the trading cadence)
- Cross-account view if the user has multiple wallets
- Tax-lot accounting (FIFO/LIFO realization) — Polymarket already
  surfaces cash PnL, no need to recompute

## Open Questions

None outstanding — answered in brainstorm:

- Read vs auto-place → **Read-only** (B, not C)
- Persistence layer → **GitHub-as-DB** (separate orphan repo)
- Address storage → **`data/polymarket-account.json`** (simple)
- Multi-account → **No** (single user)
