# Trading Recommendation Quality Improvement — Design Spec

**Date:** 2026-04-07
**Goal:** Better accuracy + better edge detection across all market categories
**Scope:** Improve the Polymarket recommendation pipeline (crypto, sports, policy, general)

---

## Problem Statement

The current system produces bad recommendations because:

1. **LLM reasons from shallow, generic evidence** — Google News headlines rarely contain domain-specific signal
2. **Hardcoded biases are noise** — "+1% sports bias", "+3% imminent crypto" have no data backing
3. **Near-certain boost creates false confidence** — markets at 90%+ price get +20 bonus despite being high-risk bets
4. **No structured reasoning** — the LLM is asked to simultaneously guess probability AND recommend direction without thinking through the question first
5. **Safety locks are too permissive** — 10-20 safety score threshold lets low-quality markets through
6. **Safety locks are too restrictive elsewhere** — the 5% minimum edge blocks valid high-liquidity short-term opportunities

**Core issue:** The LLM is asked to "find mispriced markets" but given no framework for HOW to analyze a market domain. It guesses from headlines and produces random-seeming output.

---

## Design: Structured Reasoning Pipeline (Approach 2)

### Overview

Replace the shallow single-prompt LLM with a **thinking-first, evidence-gathering pipeline** that:

1. Identifies the key question drivers
2. Gathers category-specific evidence using targeted search strategies
3. Runs structured reasoning that considers both sides
4. Recommends only when evidence is genuinely strong
5. Shows transparent reasoning so the user can evaluate the trade

---

### Component 1: Category-Specific Evidence Gatherer

**File:** `lib/services/category-research.service.ts` (new)

The current `gatherEvidence()` function uses the same generic question for all categories. This is wrong — sports analysis needs different data than crypto analysis.

**New approach — category-aware search templates:**

```typescript
interface CategoryResearchStrategy {
  // How to break down the question into searchable parts
  extractSearchTerms(question: string, outcomes: string[]): string[]

  // What types of searches to run (in parallel)
  searchQueries(question: string, outcomes: string[]): ResearchQuery[]

  // How to weight/interpret findings
  interpretFindings(findings: WebFinding[]): EvidenceAssessment
}

interface ResearchQuery {
  query: string
  source: 'news' | 'duckduckgo' | 'specialized'
  weight: number  // how important this source is for this category
  timeout: number
}

interface EvidenceAssessment {
  bullishEvidence: Evidence[]
  bearishEvidence: Evidence[]
  neutralEvidence: Evidence[]
  overallSignal: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'none'
  signalStrength: number  // 0-100, how strong the evidence is
  keyInsights: string[]
}
```

**Category strategies:**

**SPORTS (highest volume, most losing trades):**
- Extract team/player names from question
- Search: team form (last 5-10 games), head-to-head record, injury/absentee list, home/away performance
- Separate bullish vs bearish evidence (Team A strong vs Team B strong)
- Weight: recent form > historical head-to-head > home advantage

**CRYPTO:**
- Search: on-chain metrics mentions, ETF/ institutional flow news, macro conditions
- Separate bullish (bull case) vs bearish (bear case)
- Weight: recent news > technical levels > volume

**POLICY:**
- Search: recent statements, legislative progress, expert commentary
- Look for: bills passed, committee votes, public statements, polling data
- Weight: direct statements > indirect signals > speculation

**GENERAL:**
- Current generic approach but with better prompt framing
- Weight: mainstream news consensus > edge opinions

---

### Component 2: Structured Reasoning LLM (replaces current single prompt)

**File:** `lib/services/groq-market-analysis.ts` — redesign the prompt

**Phase 1 — Think (not visible to user, internal reasoning):**
```
You are analyzing a prediction market. Before recommending anything, you must THINK through the question systematically.

MARKET: "{question}"
CURRENT PRICE: {price}% for YES
OUTCOMES: {outcomes}

STEP 1 — IDENTIFY THE KEY QUESTION
What specific event or condition determines the outcome? List the 2-3 most important factors.

STEP 2 — ASSESS CURRENT EVIDENCE
What evidence SUPPORTS the YES outcome? (cite specific findings)
What evidence OPPOSES the YES outcome? (cite specific findings)
Is the evidence mix mostly one-sided or balanced?

STEP 3 — EVALUATE MARKET PRICING
The market prices at {price}%. Is this:
(a) Too high — evidence favors NO
(b) Too low — evidence favors YES
(c) About right — evidence is mixed/balanced

STEP 4 — CALCULATE YOUR ESTIMATE
Based on the above, what probability would you assign?
Your estimate: __%

STEP 5 — RECOMMENDATION
Only if evidence strongly favors one side:
  Direction: YES/NO
  Your estimate: _%
  Edge: (your estimate − market price) as %
  Confidence: HIGH/MEDIUM/LOW

If evidence is mixed or you can't make a strong case either way:
  Direction: SKIP
  Confidence: LOW
  Reasoning: explain why the evidence is balanced or insufficient
```

**Key changes from current prompt:**
- Forces two-sided analysis (bullish AND bearish evidence explicitly)
- Requires identifying the key question before estimating
- No more guessing from thin evidence
- Removes arbitrary edge thresholds — recommendation is based on whether evidence clearly favors one side, not a fixed percentage
- SKIP is the default, not a last resort
- Removes artificial "cite finding #X" requirement — cites whatever evidence is relevant

---

### Component 3: Confidence Calibration Fix

**File:** `lib/services/groq-market-analysis.ts`

**Current (broken):**
- confidence=high + evidence=weak → still recommends (until edge < 5%)
- confidence=low → blocks bet (good)
- No evidence → caps at medium (okay but too permissive)

**New calibration rules:**
1. **SKIP is the default** — if the evidence gathering finds nothing useful, the system MUST skip
2. **Two-sided evidence required** — the analysis must identify specific evidence on BOTH sides to be considered "high" confidence
3. **Evidence quality gates:**
   - HIGH confidence: strong, specific, recent evidence on one side outweighs the other by significant margin
   - MEDIUM confidence: some evidence on one side but not overwhelming
   - LOW confidence: evidence is mixed/balanced, or no evidence found, or evidence is stale/weak
4. **Remove the 5% hard edge lock** — replace with evidence-quality-based gate. A 3% edge with STRONG evidence is better than an 8% edge with weak evidence
5. **Minimum evidence threshold:** require at least 2 relevant findings before allowing any bet recommendation

---

### Component 4: Remove Hardcoded Biases and False Confidence Boosts

**File:** `app/api/polymarket/route.ts`

**Remove:**
- `nearCertainBoost` (+20 points for 90%+ price markets)
- `categoryBias` table (crypto +0.01, sports +0.01, etc.)
- Aggressive time-tier shortcuts (imminent = 0.2% EV threshold)
- Low safety thresholds for short-term markets (safetyMin 10-12 for imminent/closing-soon)

**Replace with:**
- Conservative safety minimums: 40 for all markets (was 10-20)
- EV threshold: 5% minimum for ALL markets (was 0.2% for imminent)
- Only allow "high" conviction label when LLM analysis confirms evidence quality
- Cap conviction score for non-LLM-analyzed markets at 30 (was 40)

---

### Component 5: Filter Quality Improvements

**File:** `app/api/polymarket/route.ts` — `scoreMarket()` function

**Raise entry bar:**
- Minimum liquidity: $1,000 (was $50 for imminent)
- Minimum volume: $10,000 (was $0)
- Remove near-certain markets from default recommendations (90%+ price = only trade with EXTREME confidence + strong evidence)
- EV threshold: minimum 5% for all markets

**Better market categorization:**
- Don't show "closing soon" as a positive signal — being near close doesn't mean the trade is good
- Only show "near certain" if LLM provides specific evidence for why the 90%+ will hold
- Show more long-duration markets with good reasoning (they have time for evidence to accumulate and be researched properly)

---

## Data Flow

```
Gamma API → Raw Markets
    ↓
scoreMarket() — sync filter (liquidity, volume, basic EV)
    ↓
Filtered recommendations (pre-scoring)
    ↓
fastSignalScore() — rank for analysis priority
    ↓
┌─────────────────────────────────────────────────────┐
│ NEW: Category-Aware Evidence Gathering (parallel)  │
│                                                      │
│ For each candidate:                                  │
│   - Classify category (sports/crypto/policy/general)│
│   - Extract search terms from question              │
│   - Run category-specific searches (3-5 parallel)    │
│   - Interpret: bullish vs bearish vs neutral        │
│   - Output: EvidenceAssessment per market           │
└─────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────┐
│ NEW: Structured Reasoning LLM (sequential, 3s)    │
│                                                      │
│ For each candidate with evidence:                    │
│   - Think phase: identify key factors                │
│   - Assess evidence: weigh both sides               │
│   - Estimate probability                            │
│   - Recommend ONLY if strong evidence               │
│   - Output: Reasoning + Estimate + Recommendation  │
└─────────────────────────────────────────────────────┘
    ↓
Merge LLM results with recommendations
    ↓
Sort by: analyzed + HIGH confidence first → conviction score
    ↓
Return to dashboard
```

---

## Files to Change

| File | Change |
|------|--------|
| `lib/services/category-research.service.ts` | **NEW** — category-specific evidence gathering |
| `lib/services/groq-market-analysis.ts` | **REPLACE** — structured reasoning prompt + confidence calibration |
| `app/api/polymarket/route.ts` | **MODIFY** — remove hardcoded biases, raise thresholds, wire new research |
| `components/dashboard/polymarket-section.tsx` | Minor — update display if reasoning format changes |

---

## Success Metrics

- **Fewer trades, better hit rate** — prefer 3 great trades over 10 mediocre ones
- **Transparent reasoning** — every recommendation should have step-by-step reasoning visible
- **Lower false positive rate** — fewer "watch only" rejections, but the ones that pass should be genuinely strong
- **Category balance** — sports trades should have sports-specific reasoning, not generic headlines
- **Conservative default** — SKIP is the safe answer when evidence is unclear

---

## Out of Scope (for this iteration)

- Backtesting infrastructure (stub remains)
- Auto-trader logic changes
- Portfolio tracking / performance analytics
- Additional data sources (YouTube, Instagram)
- Crypto price feed (uses hardcoded fallback — known issue but separate from recommendation quality)
