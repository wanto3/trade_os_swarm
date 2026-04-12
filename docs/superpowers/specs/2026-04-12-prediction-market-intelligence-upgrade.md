# Prediction Market Intelligence Upgrade

## Summary

Upgrade the prediction market analysis system across 5 areas: enhanced LLM reasoning, expanded evidence sources, two-pass speed architecture, daily portfolio tracking with auto-resolution, and auto-learning feedback loop. Goal: increase prediction accuracy without sacrificing dashboard load speed.

## 1. Enhanced LLM Reasoning (Structured Reasoning Pipeline)

### Current State
- Single Groq/Llama 3.3 70B call with basic prompt
- Asks for probability estimate, confidence, direction
- No structured reasoning framework

### Proposed Changes
Rebuild the LLM prompt in `groq-market-analysis.ts` with a 4-stage structured reasoning pipeline, all within a single API call:

**Stage 1: Reference Class Forecasting**
- Prompt the model to identify the reference class for this market type
- "What is the base rate for this type of event?"
- Examples: incumbent re-election rates, championship odds by seed, crypto price move frequencies
- Forces anchoring on historical frequencies before adjusting

**Stage 2: Decomposition**
- Break the market question into 2-4 sub-questions
- Each sub-question gets a mini-probability estimate
- Combines sub-estimates into a composite probability
- Example: "Will BTC hit $100K?" -> trajectory trend? macro catalysts? historical move frequency?

**Stage 3: Pre-mortem Analysis**
- "Assume your prediction was wrong. What happened?"
- Forces serious consideration of opposing case
- Reduces overconfidence bias (a known LLM weakness in probability estimation)

**Stage 4: Calibrated Final Estimate**
- After all three stages, produce final probability
- Include explicit uncertainty range (e.g., "65% +/- 10%")
- Narrow range = higher conviction, wide range = lower conviction
- The uncertainty range feeds into conviction scoring

### Output Schema Changes
```typescript
interface EnhancedAnalysis {
  // Existing fields
  estimatedProbability: number;
  confidence: 'high' | 'medium' | 'low';
  direction: 'yes' | 'no' | 'skip';
  reasoning: string;

  // New fields
  baseRate: number | null;           // Reference class base rate
  subQuestions: string[];            // Decomposition questions
  uncertaintyRange: number;          // +/- percentage (e.g., 0.10 = 10%)
  premortemRisks: string[];          // Key risks from pre-mortem
  reasoningChain: {                  // Structured reasoning trace
    referenceClass: string;
    decomposition: string;
    premortem: string;
    finalJudgment: string;
  };
}
```

## 2. Evidence Source Expansion

### Current Sources
- Google News RSS
- DuckDuckGo search
- Category-aware keyword dictionaries

### New Sources (Background Deep Pass)

**Cross-Platform Odds (all categories)**
- Metaculus API: community prediction aggregates (free, public API)
- Kalshi public market data: regulated prediction market odds
- Purpose: probability anchoring — divergence between platforms is a strong signal
- Implementation: new `cross-platform-odds.service.ts`

**Domain-Specific Data**
- Sports: public stats/standings APIs for team performance context
- Politics: polling aggregator scraping (RealClearPolitics-style) for election markets
- Crypto: leverage existing on-chain/whale data already in the app
- Implementation: extend `category-research.service.ts` with domain-specific fetchers

**Evidence Tagging**
- Every evidence item gets tagged with its source type
- Tags: `news`, `search`, `cross-platform-odds`, `domain-stats`, `polling`, `on-chain`
- Stored alongside the prediction for auto-learning correlation analysis

## 3. Two-Pass Speed Architecture

### Fast Pass (Page Load)
- Triggered on dashboard load or manual refresh
- Uses existing pipeline: Gamma API -> basic scoring -> Google News + DDG -> quick LLM
- Cached for 90 seconds (existing behavior)
- Target latency: 5-10 seconds (no regression from current speed)

### Deep Pass (Background Scheduler)
- Runs every 10-15 minutes via a background interval or cron-style API route
- Fetches cross-platform odds, domain-specific data
- Runs enhanced structured reasoning prompt with all evidence
- Stores results in a deep analysis cache
- When fast pass runs, it merges any available deep analysis results

### API Structure
- `GET /api/polymarket` — returns fast pass results, merges cached deep analysis if available
- `POST /api/polymarket/deep` — triggers deep analysis run (called by scheduler)
- `GET /api/polymarket/deep/status` — returns last deep analysis timestamp and stats

### UI Indicators
- Market cards show analysis depth badge: "Quick" vs "Deep"
- Deep-analyzed cards show additional fields: base rate, uncertainty range, cross-platform odds
- Subtle animation/transition when a card upgrades from quick to deep analysis

## 4. Daily Portfolio Tracker

### User Flow
1. User browses recommendation cards on dashboard
2. Clicks "Add to Portfolio" button on any card — one click, no modal
3. Card moves/copies to "Today's Portfolio" section
4. Optional: "Add All Top Picks" button for bulk add
5. Next day: fresh portfolio. Previous day's picks visible in history.

### Data Model
```typescript
interface PortfolioEntry {
  id: string;
  marketId: string;
  question: string;
  side: 'yes' | 'no';
  entryOdds: number;
  convictionScore: number;
  convictionLabel: string;
  evidenceSources: string[];     // Tagged sources used
  analysisDepth: 'quick' | 'deep';
  category: string;
  addedAt: string;               // ISO timestamp
  date: string;                  // YYYY-MM-DD (portfolio day)

  // Resolution (filled by auto-resolver)
  resolved: boolean;
  outcome: 'win' | 'loss' | null;
  resolvedAt: string | null;
  resolutionPrice: number | null; // Final odds at resolution
}

interface DailyPortfolio {
  date: string;                  // YYYY-MM-DD
  entries: PortfolioEntry[];
  stats: {
    total: number;
    resolved: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number | null;       // null if < 1 resolved
  };
}
```

### Storage
- JSON file: `data/portfolio-history.json`
- Array of DailyPortfolio objects
- Consistent with existing `portfolio.json` / `positions.json` pattern

### API Routes
- `POST /api/portfolio/add` — add a market to today's portfolio
- `DELETE /api/portfolio/remove` — remove from today's portfolio
- `GET /api/portfolio/today` — get today's entries
- `GET /api/portfolio/history` — get all historical portfolios
- `POST /api/portfolio/resolve` — trigger resolution check (also runs on scheduler)

## 5. Auto-Learning Feedback Loop

### Data Collection
- Every portfolio entry records: conviction score, category, evidence sources used, analysis depth, estimated probability, market odds at entry
- On resolution: actual outcome (win/loss), resolution price

### Accuracy Metrics (calculated after 20+ resolved trades)
- **Win rate by conviction tier**: no-brainer / high / consider / risky
- **Win rate by category**: sports / crypto / policy / general
- **Win rate by evidence sources**: which source combinations correlate with accuracy
- **Calibration curve**: predicted probability vs actual outcome rate (in buckets: 50-60%, 60-70%, etc.)
- **Analysis depth impact**: quick vs deep analysis win rate comparison

### Feedback Into Scoring
- Conviction score adjustment based on historical accuracy per category
- Example: if sports conviction 75+ historically wins only 50%, apply a -10 adjustment to sports conviction scores
- Evidence source weighting: sources that correlate with accuracy get priority in display
- Minimum threshold: no adjustments until 20-30 trades resolve (avoid overfitting to small samples)

### Implementation
- New service: `learning-feedback.service.ts`
- Reads `portfolio-history.json` for resolved trades
- Computes accuracy metrics
- Exports adjustment factors consumed by `polymarket-research.service.ts`
- Recalculates on each deep pass run

### Dashboard Display
- New "Performance" section or tab showing:
  - Overall win rate with trend
  - Win rate by category (bar chart)
  - Calibration curve (line chart)
  - Best/worst performing evidence source combinations
  - Total trades tracked, resolved, pending

## Implementation Order

1. **Enhanced LLM Reasoning** — modify `groq-market-analysis.ts` prompt
2. **Two-Pass Architecture** — add deep analysis route and scheduler
3. **Evidence Source Expansion** — add cross-platform odds and domain services
4. **Daily Portfolio Tracker** — UI + API + storage
5. **Auto-Learning Feedback Loop** — service + dashboard stats

## Scalability & Performance Constraints

### Data Growth Strategy
- **Portfolio history**: Rolling window — keep full detail for last 90 days, compress older entries to summary stats only (win rate, category, source breakdown). Prevents `portfolio-history.json` from growing unbounded.
- **Deep analysis cache**: TTL-based eviction. Deep results expire after 30 minutes. Only the latest deep pass is stored per market, not a history of all passes.
- **Evidence cache**: 5-minute TTL (existing), no growth concern.

### Processing Guardrails
- **Deep pass concurrency**: Process markets in batches of 5 with 3s delay between batches (respects Groq rate limits, prevents CPU spikes)
- **Cross-platform odds**: Cache for 15 minutes. These don't change fast enough to warrant more frequent fetching.
- **Learning recalculation**: Only runs when new resolutions are detected, not on every deep pass. Cached until next resolution event.
- **LLM prompt size**: Structured reasoning stages add ~300 tokens to the prompt. Total prompt stays under 2K tokens — well within Llama 3.3 70B context. Evidence is summarized, not passed raw.

### Dashboard Performance
- **Lazy load deep analysis fields**: Cards render immediately with fast pass data. Deep analysis fields (base rate, uncertainty range, cross-platform odds) load asynchronously.
- **Portfolio history pagination**: History view loads 7 days at a time, not the full history.
- **Stats computation**: Pre-computed on write (when resolutions happen), not on read. Dashboard reads cached stats.

## Non-Goals
- Multi-LLM consensus (deferred until API access available)
- Real money auto-trading
- Twitter/X scraping (API access complexity, defer to later phase)
- Mobile-specific UI optimizations
