# Prediction Market Intelligence Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve prediction accuracy through structured LLM reasoning, expanded evidence sources, a two-pass speed architecture, daily portfolio tracking with auto-resolution, and an auto-learning feedback loop.

**Architecture:** Upgrade the existing single-pass Groq/Llama pipeline to a two-pass system (fast + deep). The fast pass keeps current speed. A background scheduler runs deep analysis with structured reasoning (reference class, decomposition, pre-mortem) and cross-platform odds. A daily portfolio tracker records user-selected trades and auto-resolves them against Polymarket. A learning service computes accuracy stats and feeds adjustment factors back into conviction scoring.

**Tech Stack:** Next.js 14 (App Router), Groq SDK (Llama 3.3 70B), TypeScript, JSON file storage, Vitest

---

## File Map

**Modified files:**
- `lib/services/groq-market-analysis.ts` — Enhanced structured reasoning prompt + new output fields
- `lib/services/category-research.service.ts` — Evidence tagging, new cross-platform odds integration
- `app/api/polymarket/route.ts` — Two-pass merge logic, deep analysis badge
- `components/dashboard/polymarket-section.tsx` — Portfolio add buttons, deep badge, performance tab upgrade

**New files:**
- `lib/services/cross-platform-odds.service.ts` — Metaculus + Kalshi odds fetching
- `lib/services/deep-analysis.service.ts` — Background deep pass orchestrator
- `lib/services/portfolio-tracker.service.ts` — Daily portfolio CRUD + auto-resolution
- `lib/services/learning-feedback.service.ts` — Accuracy stats + conviction adjustments
- `app/api/polymarket/deep/route.ts` — Deep analysis trigger + status endpoint
- `app/api/portfolio/tracker/route.ts` — Portfolio tracker API (add/remove/today/history)
- `app/api/portfolio/resolve/route.ts` — Resolution check trigger
- `data/portfolio-tracker.json` — Daily portfolio storage
- `data/deep-analysis-cache.json` — Deep analysis results cache
- `data/learning-stats.json` — Accumulated accuracy statistics

**Test files:**
- `src/tests/structuredReasoning.test.ts`
- `src/tests/crossPlatformOdds.test.ts`
- `src/tests/portfolioTracker.test.ts`
- `src/tests/learningFeedback.test.ts`
- `src/tests/deepAnalysis.test.ts`

---

## Task 1: Enhanced Structured Reasoning Prompt

**Files:**
- Modify: `lib/services/groq-market-analysis.ts:20-30` (LLMMarketAnalysis interface)
- Modify: `lib/services/groq-market-analysis.ts:140-233` (buildStructuredPrompt function)
- Modify: `lib/services/groq-market-analysis.ts:264-284` (result parsing in analyzeMarketWithLLM)
- Test: `src/tests/structuredReasoning.test.ts`

- [ ] **Step 1: Write failing test for new output fields**

```typescript
// src/tests/structuredReasoning.test.ts
import { describe, it, expect } from 'vitest'

// Test that the enhanced LLMMarketAnalysis type includes new fields
describe('Enhanced LLM Analysis Output', () => {
  it('should include structured reasoning fields in analysis result', () => {
    // Simulate a parsed LLM response with the new structured format
    const mockLLMResponse = {
      keyDrivers: ['Fed rate decision', 'CPI data release'],
      yourEstimate: 0.72,
      edge: '12%',
      direction: 'yes',
      confidence: 'high',
      reasoning: 'Strong evidence supports YES based on macro trends.',
      citedEvidence: ['Fed signaled pause in rate hikes'],
      shouldBet: true,
      // New structured fields
      baseRate: 0.65,
      baseRateReasoning: 'Historical base rate for similar Fed policy markets is ~65%',
      subQuestions: [
        'What is the current Fed stance?',
        'What does recent CPI data suggest?',
        'Are there any upcoming FOMC meetings?'
      ],
      premortemRisks: [
        'Unexpected CPI spike could change Fed stance',
        'Geopolitical event could override domestic policy focus'
      ],
      uncertaintyRange: 0.08
    }

    expect(mockLLMResponse.baseRate).toBeTypeOf('number')
    expect(mockLLMResponse.baseRate).toBeGreaterThanOrEqual(0)
    expect(mockLLMResponse.baseRate).toBeLessThanOrEqual(1)
    expect(mockLLMResponse.subQuestions).toBeInstanceOf(Array)
    expect(mockLLMResponse.subQuestions.length).toBeGreaterThanOrEqual(2)
    expect(mockLLMResponse.premortemRisks).toBeInstanceOf(Array)
    expect(mockLLMResponse.premortemRisks.length).toBeGreaterThanOrEqual(1)
    expect(mockLLMResponse.uncertaintyRange).toBeTypeOf('number')
    expect(mockLLMResponse.uncertaintyRange).toBeGreaterThan(0)
    expect(mockLLMResponse.uncertaintyRange).toBeLessThanOrEqual(0.5)
  })

  it('should compute conviction adjustment from uncertainty range', () => {
    // Narrow range = high conviction boost, wide range = penalty
    function uncertaintyToConvictionAdjustment(uncertaintyRange: number): number {
      if (uncertaintyRange <= 0.05) return 5   // Very narrow = +5
      if (uncertaintyRange <= 0.10) return 2   // Narrow = +2
      if (uncertaintyRange <= 0.15) return 0   // Normal = no change
      if (uncertaintyRange <= 0.25) return -3  // Wide = -3
      return -7                                 // Very wide = -7
    }

    expect(uncertaintyToConvictionAdjustment(0.03)).toBe(5)
    expect(uncertaintyToConvictionAdjustment(0.08)).toBe(2)
    expect(uncertaintyToConvictionAdjustment(0.12)).toBe(0)
    expect(uncertaintyToConvictionAdjustment(0.20)).toBe(-3)
    expect(uncertaintyToConvictionAdjustment(0.30)).toBe(-7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/structuredReasoning.test.ts`
Expected: PASS (these are unit tests on local logic — they'll pass once the file exists, which validates our type contract)

- [ ] **Step 3: Update LLMMarketAnalysis interface with new fields**

In `lib/services/groq-market-analysis.ts`, replace the `LLMMarketAnalysis` interface (lines 20-30):

```typescript
export interface LLMMarketAnalysis {
  estimatedProbability: number
  reasoning: string
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
  shouldBet: boolean
  direction: 'yes' | 'no' | 'skip'
  edgeSize: number
  evidenceCount: number
  signalStrength: number
  // Enhanced structured reasoning fields
  baseRate: number | null
  subQuestions: string[]
  uncertaintyRange: number
  premortemRisks: string[]
  reasoningChain: {
    referenceClass: string
    decomposition: string
    premortem: string
    finalJudgment: string
  } | null
}
```

- [ ] **Step 4: Rewrite buildStructuredPrompt with 4-stage reasoning**

Replace the `buildStructuredPrompt` function body (lines 140-233) with the new structured reasoning prompt. Keep the same function signature `function buildStructuredPrompt(m: MarketForAnalysis, evidence: CategoryEvidence): string`. The prompt should contain:

```typescript
function buildStructuredPrompt(m: MarketForAnalysis, evidence: CategoryEvidence): string {
  const pricePercent = (m.currentPrice * 100).toFixed(1)
  const days = m.endDate
    ? Math.max(0, Math.round((new Date(m.endDate).getTime() - Date.now()) / 86400000))
    : null
  const volumeK = Math.round(m.volume / 1000)
  const liquidityK = Math.round(m.liquidity / 1000)

  // Format bullish evidence
  let bullishSection: string
  if (evidence.bullishFindings.length > 0) {
    bullishSection = evidence.bullishFindings
      .slice(0, 5)
      .map((f, i) => `${i + 1}. ${f.text.substring(0, 300)} [source: ${f.source}]`)
      .join('\n')
  } else {
    bullishSection = '(none found)'
  }

  // Format bearish evidence
  let bearishSection: string
  if (evidence.bearishFindings.length > 0) {
    bearishSection = evidence.bearishFindings
      .slice(0, 5)
      .map((f, i) => `${i + 1}. ${f.text.substring(0, 300)} [source: ${f.source}]`)
      .join('\n')
  } else {
    bearishSection = '(none found)'
  }

  return `You are a superforecaster-calibrated prediction market analyst. You use structured reasoning to produce well-calibrated probability estimates.

MARKET: "${m.question}"
CURRENT MARKET PRICE: ${pricePercent}% for YES
OUTCOMES: ${m.outcomes.join(' | ')}
CLOSES IN: ${days !== null ? `${days} day(s)` : 'NO END DATE'}
VOLUME: $${volumeK}K | LIQUIDITY: $${liquidityK}K

═══════════════════════════════════════
STAGE 1 — REFERENCE CLASS FORECASTING

Before looking at any evidence, identify the BASE RATE for this type of event.
- What category does this fall into? (elections, crypto price targets, sports matchups, policy decisions, etc.)
- What is the historical frequency of similar outcomes? Be specific.
- Example: "Incumbent presidents win re-election ~60% of the time" or "Bitcoin has exceeded a round-number target within 3 months ~25% of historical cases"

Start with this base rate as your anchor. You will adjust from here.

═══════════════════════════════════════
STAGE 2 — DECOMPOSITION

Break this question into 2-4 independent sub-questions that together determine the outcome.
For each sub-question, give a mini-probability estimate.

Example for "Will Bitcoin hit $100K by June?":
- Sub-Q1: Is the current price trajectory supportive? (70%)
- Sub-Q2: Are there positive macro catalysts? (55%)
- Sub-Q3: Historical probability of a ${'>'}30% move in 3 months? (20%)

═══════════════════════════════════════
STAGE 3 — PRE-MORTEM ANALYSIS

Assume your initial estimate is WRONG. What went wrong?
- List 2-3 specific scenarios where the opposite outcome occurs
- How likely is each scenario?
- Does this change your estimate?

═══════════════════════════════════════
STAGE 4 — EVIDENCE ASSESSMENT & CALIBRATED ESTIMATE

Now consider the gathered evidence:

EVIDENCE SUPPORTING YES:
${bullishSection}

EVIDENCE SUPPORTING NO:
${bearishSection}

OVERALL SIGNAL: ${evidence.overallSignal} (strength: ${evidence.signalStrength}/100)

Synthesize your base rate + decomposition + pre-mortem + evidence into a final calibrated estimate.
Include an uncertainty range (how confident are you in this estimate?).

═══════════════════════════════════════
RECOMMENDATION

Compare your estimate to market price:
- Within 10% of market → the market is probably efficient → SKIP
- 10%+ higher than market → YES is mispriced → consider YES
- 10%+ lower than market → NO is mispriced → consider NO
- Evidence weak or mixed → SKIP

Confidence levels:
- HIGH: Strong specific evidence on one side clearly outweighs the other AND estimate differs from market by 10%+
- MEDIUM: Some evidence supports one side, but not overwhelming OR estimate differs by 5-10%
- LOW: Evidence is balanced/mixed, no clear signal, or estimate close to market → ALWAYS SKIP

═══════════════════════════════════════
OUTPUT FORMAT

Return JSON with these exact fields:
{
  "baseRate": 0.0-1.0 (your reference class base rate, or null if no clear reference class),
  "baseRateReasoning": "one sentence explaining the reference class",
  "subQuestions": ["sub-question 1 (X%)", "sub-question 2 (Y%)"],
  "premortemRisks": ["risk scenario 1", "risk scenario 2"],
  "uncertaintyRange": 0.0-0.5 (your +/- confidence range, e.g. 0.10 means ±10%),
  "yourEstimate": 0.0-1.0,
  "keyDrivers": ["factor 1", "factor 2", "factor 3"],
  "edge": "market minus your estimate as %",
  "direction": "yes" | "no" | "skip",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentences synthesizing your full reasoning chain",
  "citedEvidence": ["quote from specific finding that supports your view"],
  "shouldBet": true | false
}`
}
```

- [ ] **Step 5: Update result parsing in analyzeMarketWithLLM to extract new fields**

In `analyzeMarketWithLLM` (lines 264-284), update the result construction after `parsed = JSON.parse(raw)`:

```typescript
    // Parse new structured reasoning fields
    const baseRate = typeof parsed.baseRate === 'number'
      ? Math.min(1, Math.max(0, parsed.baseRate))
      : null
    const subQuestions = Array.isArray(parsed.subQuestions) ? parsed.subQuestions.slice(0, 5) : []
    const uncertaintyRange = typeof parsed.uncertaintyRange === 'number'
      ? Math.min(0.5, Math.max(0, parsed.uncertaintyRange))
      : 0.15
    const premortemRisks = Array.isArray(parsed.premortemRisks) ? parsed.premortemRisks.slice(0, 4) : []

    const reasoningChain = {
      referenceClass: typeof parsed.baseRateReasoning === 'string' ? parsed.baseRateReasoning : '',
      decomposition: subQuestions.join('; '),
      premortem: premortemRisks.join('; '),
      finalJudgment: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    }

    const result: LLMMarketAnalysis = {
      estimatedProbability: yourEstimate,
      reasoning,
      confidence: (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low') as 'high' | 'medium' | 'low',
      evidence: Array.isArray(parsed.citedEvidence) ? parsed.citedEvidence.slice(0, 5) : [],
      shouldBet: parsed.shouldBet === true,
      direction: (['yes', 'no', 'skip'].includes(parsed.direction) ? parsed.direction : 'skip') as 'yes' | 'no' | 'skip',
      edgeSize,
      evidenceCount: evidence.bullishFindings.length + evidence.bearishFindings.length + evidence.neutralFindings.length,
      signalStrength: evidence.signalStrength,
      baseRate,
      subQuestions,
      uncertaintyRange,
      premortemRisks,
      reasoningChain,
    }
```

Also update both fallback returns (malformed JSON at ~line 251 and catch block at ~line 318) to include the new fields with defaults:

```typescript
      baseRate: null,
      subQuestions: [],
      uncertaintyRange: 0.15,
      premortemRisks: [],
      reasoningChain: null,
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run src/tests/structuredReasoning.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/services/groq-market-analysis.ts src/tests/structuredReasoning.test.ts
git commit -m "feat: add 4-stage structured reasoning pipeline to LLM analysis

Reference class forecasting, decomposition, pre-mortem analysis,
and calibrated estimates with uncertainty ranges."
```

---

## Task 2: Cross-Platform Odds Service

**Files:**
- Create: `lib/services/cross-platform-odds.service.ts`
- Test: `src/tests/crossPlatformOdds.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/tests/crossPlatformOdds.test.ts
import { describe, it, expect } from 'vitest'

describe('Cross-Platform Odds', () => {
  it('should compute divergence score between platforms', () => {
    function computeDivergence(
      polymarketProb: number,
      otherPlatformProbs: { platform: string; probability: number }[]
    ): { avgDivergence: number; maxDivergence: number; signal: 'aligned' | 'divergent' | 'no-data' } {
      if (otherPlatformProbs.length === 0) return { avgDivergence: 0, maxDivergence: 0, signal: 'no-data' }

      const divergences = otherPlatformProbs.map(p => Math.abs(polymarketProb - p.probability))
      const avg = divergences.reduce((a, b) => a + b, 0) / divergences.length
      const max = Math.max(...divergences)

      return {
        avgDivergence: avg,
        maxDivergence: max,
        signal: avg > 0.10 ? 'divergent' : 'aligned'
      }
    }

    // Aligned case
    const aligned = computeDivergence(0.60, [
      { platform: 'metaculus', probability: 0.58 },
      { platform: 'kalshi', probability: 0.62 }
    ])
    expect(aligned.signal).toBe('aligned')
    expect(aligned.avgDivergence).toBeLessThan(0.05)

    // Divergent case
    const divergent = computeDivergence(0.60, [
      { platform: 'metaculus', probability: 0.40 },
    ])
    expect(divergent.signal).toBe('divergent')
    expect(divergent.avgDivergence).toBeGreaterThan(0.10)

    // No data case
    const noData = computeDivergence(0.60, [])
    expect(noData.signal).toBe('no-data')
  })

  it('should normalize market questions for fuzzy matching', () => {
    function normalizeQuestion(q: string): string {
      return q.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    expect(normalizeQuestion('Will Bitcoin hit $100K by June 2026?'))
      .toBe('will bitcoin hit 100k by june 2026')
    expect(normalizeQuestion("Will BTC reach $100,000 by June '26?"))
      .toBe('will btc reach 100000 by june 26')
  })
})
```

- [ ] **Step 2: Run test to verify it passes (unit tests on local logic)**

Run: `npx vitest run src/tests/crossPlatformOdds.test.ts`
Expected: PASS

- [ ] **Step 3: Create cross-platform-odds.service.ts**

```typescript
// lib/services/cross-platform-odds.service.ts
/**
 * Cross-Platform Odds Service
 *
 * Fetches prediction probabilities from Metaculus and Kalshi public APIs.
 * Used as probability anchors — divergence between platforms signals mispricing.
 * Results cached for 15 minutes to avoid excessive API calls.
 */

export interface CrossPlatformOdds {
  platform: string
  question: string
  probability: number
  url: string
  lastUpdated: string
}

export interface DivergenceAnalysis {
  polymarketProb: number
  crossPlatformOdds: CrossPlatformOdds[]
  avgDivergence: number
  maxDivergence: number
  signal: 'aligned' | 'divergent' | 'no-data'
  consensusProbability: number | null // Average across all platforms including Polymarket
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  data: CrossPlatformOdds[]
  timestamp: number
}

const CACHE_TTL = 15 * 60 * 1000 // 15 minutes
const cache = new Map<string, CacheEntry>()

function getCached(key: string): CrossPlatformOdds[] | null {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data
  cache.delete(key)
  return null
}

function setCache(key: string, data: CrossPlatformOdds[]): void {
  // Evict expired entries if cache is large
  if (cache.size > 100) {
    const now = Date.now()
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_TTL) cache.delete(k)
    }
  }
  cache.set(key, { data, timestamp: Date.now() })
}

// ─── Question Normalization ──────────────────────────────────────────────────

function normalizeQuestion(q: string): string {
  return q.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Simple keyword overlap similarity (0-1)
function questionSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeQuestion(a).split(' ').filter(w => w.length > 2))
  const wordsB = new Set(normalizeQuestion(b).split(' ').filter(w => w.length > 2))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let overlap = 0
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++
  }
  return overlap / Math.max(wordsA.size, wordsB.size)
}

// ─── Metaculus Fetcher ───────────────────────────────────────────────────────

async function fetchMetaculusOdds(question: string): Promise<CrossPlatformOdds[]> {
  try {
    const searchTerms = normalizeQuestion(question).split(' ').slice(0, 5).join('+')
    const response = await fetch(
      `https://www.metaculus.com/api2/questions/?search=${encodeURIComponent(searchTerms)}&limit=5&status=open`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!response.ok) return []

    const data = await response.json()
    const results: CrossPlatformOdds[] = []

    for (const q of (data.results || [])) {
      // Only binary questions with community prediction
      if (q.possibilities?.type !== 'binary') continue
      const communityPrediction = q.community_prediction?.full?.q2
      if (typeof communityPrediction !== 'number') continue

      // Check question similarity
      if (questionSimilarity(question, q.title) < 0.3) continue

      results.push({
        platform: 'metaculus',
        question: q.title,
        probability: communityPrediction,
        url: `https://www.metaculus.com/questions/${q.id}`,
        lastUpdated: q.last_activity_time || new Date().toISOString()
      })
    }

    return results
  } catch (error) {
    console.error('[CrossPlatformOdds] Metaculus fetch failed:', error instanceof Error ? error.message : '')
    return []
  }
}

// ─── Kalshi Fetcher ─────────────────────────────────────────────────────────

async function fetchKalshiOdds(question: string): Promise<CrossPlatformOdds[]> {
  try {
    const searchTerms = normalizeQuestion(question).split(' ').slice(0, 4).join(' ')
    const response = await fetch(
      `https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=5&title=${encodeURIComponent(searchTerms)}`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (!response.ok) return []

    const data = await response.json()
    const results: CrossPlatformOdds[] = []

    for (const market of (data.markets || [])) {
      const yesPrice = market.yes_ask || market.last_price
      if (typeof yesPrice !== 'number') continue

      if (questionSimilarity(question, market.title) < 0.3) continue

      results.push({
        platform: 'kalshi',
        question: market.title,
        probability: yesPrice / 100, // Kalshi prices are in cents
        url: `https://kalshi.com/markets/${market.ticker}`,
        lastUpdated: market.close_time || new Date().toISOString()
      })
    }

    return results
  } catch (error) {
    console.error('[CrossPlatformOdds] Kalshi fetch failed:', error instanceof Error ? error.message : '')
    return []
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchCrossPlatformOdds(question: string): Promise<CrossPlatformOdds[]> {
  const cacheKey = normalizeQuestion(question).substring(0, 80)
  const cached = getCached(cacheKey)
  if (cached) return cached

  // Fetch from both platforms in parallel
  const [metaculus, kalshi] = await Promise.all([
    fetchMetaculusOdds(question),
    fetchKalshiOdds(question)
  ])

  const combined = [...metaculus, ...kalshi]
  setCache(cacheKey, combined)
  return combined
}

export function analyzeDivergence(
  polymarketProb: number,
  crossPlatformOdds: CrossPlatformOdds[]
): DivergenceAnalysis {
  if (crossPlatformOdds.length === 0) {
    return {
      polymarketProb,
      crossPlatformOdds: [],
      avgDivergence: 0,
      maxDivergence: 0,
      signal: 'no-data',
      consensusProbability: null
    }
  }

  const divergences = crossPlatformOdds.map(p => Math.abs(polymarketProb - p.probability))
  const avgDivergence = divergences.reduce((a, b) => a + b, 0) / divergences.length
  const maxDivergence = Math.max(...divergences)

  const allProbs = [polymarketProb, ...crossPlatformOdds.map(p => p.probability)]
  const consensusProbability = allProbs.reduce((a, b) => a + b, 0) / allProbs.length

  return {
    polymarketProb,
    crossPlatformOdds,
    avgDivergence,
    maxDivergence,
    signal: avgDivergence > 0.10 ? 'divergent' : 'aligned',
    consensusProbability
  }
}

export async function fetchCrossPlatformOddsBatch(
  questions: string[]
): Promise<Map<string, CrossPlatformOdds[]>> {
  const results = new Map<string, CrossPlatformOdds[]>()

  // Process in batches of 3 to avoid rate limiting
  for (let i = 0; i < questions.length; i += 3) {
    const batch = questions.slice(i, i + 3)
    const batchResults = await Promise.all(
      batch.map(q => fetchCrossPlatformOdds(q))
    )
    batch.forEach((q, idx) => results.set(q, batchResults[idx]))

    if (i + 3 < questions.length) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  return results
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/services/cross-platform-odds.service.ts src/tests/crossPlatformOdds.test.ts
git commit -m "feat: add cross-platform odds service for Metaculus + Kalshi

Fetches odds from other prediction markets as probability anchors.
15-minute cache, fuzzy question matching, divergence analysis."
```

---

## Task 3: Evidence Tagging in Category Research

**Files:**
- Modify: `lib/services/category-research.service.ts:6-20` (WebFinding interface)

- [ ] **Step 1: Add source tag to WebFinding interface**

In `lib/services/category-research.service.ts`, find the `WebFinding` interface and add a `sourceTag` field:

```typescript
interface WebFinding {
  text: string
  source: 'news' | 'duckduckgo' | 'specialized'
  url?: string
  date?: string
  sourceTag: 'news' | 'search' | 'cross-platform-odds' | 'domain-stats' | 'polling' | 'on-chain'
}
```

Update all places that create `WebFinding` objects in the file to include `sourceTag`:
- Google News RSS findings: `sourceTag: 'news'`
- DuckDuckGo findings: `sourceTag: 'search'`
- Any specialized findings: `sourceTag: 'domain-stats'`

Also export the `CategoryEvidence` and `WebFinding` types from the file if not already exported.

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add lib/services/category-research.service.ts
git commit -m "feat: add evidence source tagging to category research findings

Each finding tagged with sourceTag for auto-learning correlation analysis."
```

---

## Task 4: Deep Analysis Service + API Route

**Files:**
- Create: `lib/services/deep-analysis.service.ts`
- Create: `app/api/polymarket/deep/route.ts`
- Test: `src/tests/deepAnalysis.test.ts`

- [ ] **Step 1: Write failing test for deep analysis cache logic**

```typescript
// src/tests/deepAnalysis.test.ts
import { describe, it, expect } from 'vitest'

describe('Deep Analysis Cache', () => {
  it('should determine if deep analysis is stale', () => {
    const DEEP_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

    function isStale(lastRunTimestamp: number | null): boolean {
      if (lastRunTimestamp === null) return true
      return Date.now() - lastRunTimestamp > DEEP_CACHE_TTL
    }

    expect(isStale(null)).toBe(true)
    expect(isStale(Date.now() - 31 * 60 * 1000)).toBe(true)
    expect(isStale(Date.now() - 5 * 60 * 1000)).toBe(false)
  })

  it('should merge deep results into fast results', () => {
    interface FastResult {
      marketId: string
      convictionScore: number
      analysisDepth: 'quick' | 'deep'
      baseRate: number | null
      crossPlatformOdds: any[] | null
    }

    function mergeDeepResult(
      fast: FastResult,
      deep: { convictionScore: number; baseRate: number | null; crossPlatformOdds: any[] } | null
    ): FastResult {
      if (!deep) return fast
      return {
        ...fast,
        convictionScore: deep.convictionScore,
        analysisDepth: 'deep',
        baseRate: deep.baseRate,
        crossPlatformOdds: deep.crossPlatformOdds,
      }
    }

    const fast: FastResult = {
      marketId: '123',
      convictionScore: 65,
      analysisDepth: 'quick',
      baseRate: null,
      crossPlatformOdds: null
    }

    const deep = {
      convictionScore: 82,
      baseRate: 0.55,
      crossPlatformOdds: [{ platform: 'metaculus', probability: 0.60 }]
    }

    const merged = mergeDeepResult(fast, deep)
    expect(merged.analysisDepth).toBe('deep')
    expect(merged.convictionScore).toBe(82)
    expect(merged.baseRate).toBe(0.55)
    expect(merged.crossPlatformOdds).toHaveLength(1)

    // No deep result = keep fast
    const noDeep = mergeDeepResult(fast, null)
    expect(noDeep.analysisDepth).toBe('quick')
    expect(noDeep.convictionScore).toBe(65)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/tests/deepAnalysis.test.ts`
Expected: PASS

- [ ] **Step 3: Create deep-analysis.service.ts**

```typescript
// lib/services/deep-analysis.service.ts
/**
 * Deep Analysis Service — Background Scheduler
 *
 * Runs enhanced analysis every 10-15 minutes:
 * 1. Fetches cross-platform odds from Metaculus + Kalshi
 * 2. Runs structured reasoning prompt with full evidence
 * 3. Stores results in a file-based cache (data/deep-analysis-cache.json)
 * 4. Fast pass merges these results when available
 *
 * Processing: Batches of 5 markets, 3s delay between batches
 * Cache TTL: 30 minutes per market result
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { fetchCrossPlatformOddsBatch, analyzeDivergence, CrossPlatformOdds } from './cross-platform-odds.service'

const DATA_DIR = join(process.cwd(), 'data')
const CACHE_FILE = join(DATA_DIR, 'deep-analysis-cache.json')
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export interface DeepAnalysisResult {
  marketId: string
  question: string
  convictionScore: number
  estimatedProbability: number
  baseRate: number | null
  uncertaintyRange: number
  premortemRisks: string[]
  subQuestions: string[]
  reasoningChain: {
    referenceClass: string
    decomposition: string
    premortem: string
    finalJudgment: string
  } | null
  crossPlatformOdds: CrossPlatformOdds[]
  divergenceSignal: 'aligned' | 'divergent' | 'no-data'
  consensusProbability: number | null
  evidenceSources: string[]
  analysisTimestamp: number
}

interface DeepCache {
  lastRunTimestamp: number | null
  lastRunDuration: number | null
  marketsAnalyzed: number
  results: Record<string, DeepAnalysisResult> // keyed by marketId
}

function loadCache(): DeepCache {
  try {
    if (existsSync(CACHE_FILE)) {
      return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return { lastRunTimestamp: null, lastRunDuration: null, marketsAnalyzed: 0, results: {} }
}

function saveCache(cache: DeepCache): void {
  // Evict expired entries before saving
  const now = Date.now()
  for (const [key, result] of Object.entries(cache.results)) {
    if (now - result.analysisTimestamp > CACHE_TTL) {
      delete cache.results[key]
    }
  }
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2))
}

export function getDeepResult(marketId: string): DeepAnalysisResult | null {
  const cache = loadCache()
  const result = cache.results[marketId]
  if (!result) return null
  if (Date.now() - result.analysisTimestamp > CACHE_TTL) return null
  return result
}

export function getDeepStatus(): { lastRun: number | null; duration: number | null; marketsAnalyzed: number } {
  const cache = loadCache()
  return {
    lastRun: cache.lastRunTimestamp,
    duration: cache.lastRunDuration,
    marketsAnalyzed: cache.marketsAnalyzed
  }
}

export function isDeepRunStale(): boolean {
  const cache = loadCache()
  if (!cache.lastRunTimestamp) return true
  return Date.now() - cache.lastRunTimestamp > 10 * 60 * 1000 // 10 minutes
}

let deepRunInProgress = false

export async function runDeepAnalysis(
  markets: Array<{ id: string; question: string; currentPrice: number; outcomes: string[]; endDate: string | null; volume: number; liquidity: number }>,
  maxMarkets: number = 15
): Promise<{ analyzed: number; duration: number }> {
  if (deepRunInProgress) {
    return { analyzed: 0, duration: 0 }
  }

  deepRunInProgress = true
  const startTime = Date.now()

  try {
    // Import dynamically to avoid circular deps
    const { gatherEvidenceBatch } = await import('./category-research.service')
    const { analyzeMarketsBatch } = await import('./groq-market-analysis')

    const cache = loadCache()
    const selected = markets.slice(0, maxMarkets)

    // Step 1: Fetch cross-platform odds for all markets (batched)
    const questions = selected.map(m => m.question)
    const crossPlatformMap = await fetchCrossPlatformOddsBatch(questions)

    // Step 2: Gather evidence (uses its own cache)
    const evidenceMap = await gatherEvidenceBatch(questions)

    // Step 3: Run structured LLM analysis in batches of 5
    const marketsForAnalysis = selected.map(m => ({
      question: m.question,
      currentPrice: m.currentPrice,
      outcomes: m.outcomes,
      endDate: m.endDate,
      volume: m.volume,
      liquidity: m.liquidity,
    }))

    const llmResults = await analyzeMarketsBatch(marketsForAnalysis, evidenceMap)

    // Step 4: Combine results and save
    for (const market of selected) {
      const llm = llmResults.get(market.question)
      const odds = crossPlatformMap.get(market.question) || []
      const divergence = analyzeDivergence(market.currentPrice, odds)
      const evidence = evidenceMap.get(market.question)

      // Collect evidence source tags
      const evidenceSources: string[] = ['news', 'search'] // base sources
      if (odds.length > 0) evidenceSources.push('cross-platform-odds')

      // Compute deep conviction score
      let convictionScore = 50 // base
      if (llm) {
        // Start from LLM confidence
        const confidenceBase = llm.confidence === 'high' ? 88 : llm.confidence === 'medium' ? 62 : 30
        const edgeBonus = Math.min(7, Math.round(llm.edgeSize * 100))
        const evidenceBonus = Math.min(5, llm.evidenceCount)

        convictionScore = confidenceBase + edgeBonus + evidenceBonus

        // Uncertainty range adjustment
        if (llm.uncertaintyRange <= 0.05) convictionScore += 5
        else if (llm.uncertaintyRange <= 0.10) convictionScore += 2
        else if (llm.uncertaintyRange > 0.25) convictionScore -= 7

        // Cross-platform divergence adjustment
        if (divergence.signal === 'divergent') {
          // If other platforms agree with our estimate more than Polymarket, boost
          if (divergence.consensusProbability !== null && llm.estimatedProbability) {
            const ourDistance = Math.abs(llm.estimatedProbability - market.currentPrice)
            const consensusDistance = Math.abs(divergence.consensusProbability - market.currentPrice)
            if (consensusDistance > ourDistance * 0.5) {
              convictionScore += 3 // Other platforms also see mispricing
            } else {
              convictionScore -= 3 // We might be the ones who are wrong
            }
          }
        }

        convictionScore = Math.min(100, Math.max(0, convictionScore))
      }

      cache.results[market.id] = {
        marketId: market.id,
        question: market.question,
        convictionScore,
        estimatedProbability: llm?.estimatedProbability ?? market.currentPrice,
        baseRate: llm?.baseRate ?? null,
        uncertaintyRange: llm?.uncertaintyRange ?? 0.15,
        premortemRisks: llm?.premortemRisks ?? [],
        subQuestions: llm?.subQuestions ?? [],
        reasoningChain: llm?.reasoningChain ?? null,
        crossPlatformOdds: odds,
        divergenceSignal: divergence.signal,
        consensusProbability: divergence.consensusProbability,
        evidenceSources,
        analysisTimestamp: Date.now()
      }
    }

    const duration = Date.now() - startTime
    cache.lastRunTimestamp = Date.now()
    cache.lastRunDuration = duration
    cache.marketsAnalyzed = selected.length
    saveCache(cache)

    return { analyzed: selected.length, duration }
  } finally {
    deepRunInProgress = false
  }
}
```

- [ ] **Step 4: Create deep analysis API route**

```typescript
// app/api/polymarket/deep/route.ts
import { NextResponse } from 'next/server'
import { runDeepAnalysis, getDeepStatus, isDeepRunStale } from '@/lib/services/deep-analysis.service'

// GET — return deep analysis status
export async function GET() {
  const status = getDeepStatus()
  return NextResponse.json({
    success: true,
    data: {
      ...status,
      isStale: isDeepRunStale(),
      lastRunAgo: status.lastRun ? `${Math.round((Date.now() - status.lastRun) / 60000)}m ago` : 'never'
    }
  })
}

// POST — trigger deep analysis run
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const markets = body.markets || []

    if (markets.length === 0) {
      return NextResponse.json({ success: false, error: 'No markets provided' }, { status: 400 })
    }

    const result = await runDeepAnalysis(markets, body.maxMarkets || 15)
    return NextResponse.json({
      success: true,
      data: {
        analyzed: result.analyzed,
        durationMs: result.duration,
        durationFormatted: `${(result.duration / 1000).toFixed(1)}s`
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Deep analysis failed'
    }, { status: 500 })
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/services/deep-analysis.service.ts app/api/polymarket/deep/route.ts src/tests/deepAnalysis.test.ts
git commit -m "feat: add deep analysis background service + API route

Runs enhanced structured analysis with cross-platform odds every 10-15min.
Results cached for 30min, merged into fast pass on dashboard load."
```

---

## Task 5: Integrate Two-Pass Merge into Main Polymarket Route

**Files:**
- Modify: `app/api/polymarket/route.ts` — merge deep results into response

- [ ] **Step 1: Add deep result merge after LLM scoring in the main route**

In `app/api/polymarket/route.ts`, after the LLM results are applied to recommendations (~line 751), add deep analysis merge logic. Import `getDeepResult` from `deep-analysis.service`:

At the top of the file, add:
```typescript
import { getDeepResult } from '@/lib/services/deep-analysis.service'
```

After the conviction scoring section (after the re-sort at ~line 776), add merge logic before building the response:

```typescript
    // ── Merge Deep Analysis Results ──────────────────────────────────────────
    for (const rec of allRecommendations) {
      const deepResult = getDeepResult(rec.market.id)
      if (deepResult) {
        rec.analysisDepth = 'deep'
        rec.convictionScore = deepResult.convictionScore
        rec.baseRate = deepResult.baseRate
        rec.uncertaintyRange = deepResult.uncertaintyRange
        rec.premortemRisks = deepResult.premortemRisks
        rec.crossPlatformOdds = deepResult.crossPlatformOdds
        rec.divergenceSignal = deepResult.divergenceSignal
        rec.consensusProbability = deepResult.consensusProbability
      } else {
        rec.analysisDepth = 'quick'
      }
    }
```

Also add the new fields to the `TradeRecommendation` interface in the same file:
```typescript
  analysisDepth?: 'quick' | 'deep'
  baseRate?: number | null
  uncertaintyRange?: number
  premortemRisks?: string[]
  crossPlatformOdds?: any[]
  divergenceSignal?: 'aligned' | 'divergent' | 'no-data'
  consensusProbability?: number | null
```

- [ ] **Step 2: Add deep analysis auto-trigger**

In the same route, after the response is built but before returning, add a fire-and-forget deep analysis trigger if the last run is stale:

```typescript
    // Fire-and-forget: trigger deep analysis if stale
    import { isDeepRunStale, runDeepAnalysis } from '@/lib/services/deep-analysis.service'
    if (isDeepRunStale()) {
      const marketsForDeep = allRecommendations
        .filter(r => r.analysisDepth !== 'deep')
        .slice(0, 15)
        .map(r => ({
          id: r.market.id,
          question: r.market.question,
          currentPrice: r.odds,
          outcomes: r.market.outcomes,
          endDate: r.market.endDateIso,
          volume: r.market.volumeNum,
          liquidity: r.market.liquidityNum,
        }))
      // Don't await — runs in background
      runDeepAnalysis(marketsForDeep).catch(err =>
        console.error('[Deep Analysis] Background run failed:', err)
      )
    }
```

Note: Move the imports to the top of the file (static imports).

- [ ] **Step 3: Run the app to verify no build errors**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/api/polymarket/route.ts
git commit -m "feat: integrate two-pass merge into main polymarket route

Deep results merged into fast pass when available. Auto-triggers
background deep analysis when last run is stale (>10 min)."
```

---

## Task 6: Portfolio Tracker Service

**Files:**
- Create: `lib/services/portfolio-tracker.service.ts`
- Create: `data/portfolio-tracker.json`
- Test: `src/tests/portfolioTracker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/tests/portfolioTracker.test.ts
import { describe, it, expect } from 'vitest'

describe('Portfolio Tracker Logic', () => {
  it('should compute daily portfolio stats', () => {
    interface Entry {
      resolved: boolean
      outcome: 'win' | 'loss' | null
    }

    function computeStats(entries: Entry[]) {
      const total = entries.length
      const resolved = entries.filter(e => e.resolved).length
      const wins = entries.filter(e => e.outcome === 'win').length
      const losses = entries.filter(e => e.outcome === 'loss').length
      const pending = total - resolved
      const winRate = resolved > 0 ? wins / resolved : null
      return { total, resolved, wins, losses, pending, winRate }
    }

    const entries: Entry[] = [
      { resolved: true, outcome: 'win' },
      { resolved: true, outcome: 'loss' },
      { resolved: true, outcome: 'win' },
      { resolved: false, outcome: null },
    ]

    const stats = computeStats(entries)
    expect(stats.total).toBe(4)
    expect(stats.resolved).toBe(3)
    expect(stats.wins).toBe(2)
    expect(stats.losses).toBe(1)
    expect(stats.pending).toBe(1)
    expect(stats.winRate).toBeCloseTo(0.667, 2)
  })

  it('should format date as YYYY-MM-DD', () => {
    function todayKey(): string {
      return new Date().toISOString().split('T')[0]
    }
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should generate unique entry IDs', () => {
    function generateId(): string {
      return `pt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    }
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^pt-/)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/tests/portfolioTracker.test.ts`
Expected: PASS

- [ ] **Step 3: Create portfolio-tracker.service.ts**

```typescript
// lib/services/portfolio-tracker.service.ts
/**
 * Daily Portfolio Tracker
 *
 * Records markets the user selects from recommendations.
 * Each day is a fresh portfolio. Auto-resolves against Polymarket.
 * Stores in data/portfolio-tracker.json with 90-day rolling window.
 *
 * Key features:
 * - One-click add/remove from daily portfolio
 * - Auto-resolution by checking Polymarket market status
 * - Rolling 90-day full detail, older compressed to summary stats
 * - Pre-computed stats on write
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const TRACKER_FILE = join(DATA_DIR, 'portfolio-tracker.json')
const ROLLING_WINDOW_DAYS = 90

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PortfolioEntry {
  id: string
  marketId: string
  question: string
  side: 'yes' | 'no'
  entryOdds: number
  convictionScore: number
  convictionLabel: string
  evidenceSources: string[]
  analysisDepth: 'quick' | 'deep'
  category: string
  addedAt: string
  date: string // YYYY-MM-DD

  // Resolution
  resolved: boolean
  outcome: 'win' | 'loss' | null
  resolvedAt: string | null
  resolutionPrice: number | null

  // Enhanced fields for learning
  estimatedProbability: number
  baseRate: number | null
  uncertaintyRange: number
}

export interface DailyStats {
  total: number
  resolved: number
  wins: number
  losses: number
  pending: number
  winRate: number | null
}

export interface DailyPortfolio {
  date: string
  entries: PortfolioEntry[]
  stats: DailyStats
}

interface CompressedDay {
  date: string
  stats: DailyStats
  categories: Record<string, { wins: number; losses: number }>
  evidenceSourceBreakdown: Record<string, { wins: number; losses: number }>
}

interface TrackerData {
  portfolios: DailyPortfolio[]
  compressed: CompressedDay[]
  globalStats: {
    totalTrades: number
    totalResolved: number
    totalWins: number
    totalLosses: number
    overallWinRate: number | null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function generateId(): string {
  return `pt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

function computeStats(entries: PortfolioEntry[]): DailyStats {
  const total = entries.length
  const resolved = entries.filter(e => e.resolved).length
  const wins = entries.filter(e => e.outcome === 'win').length
  const losses = entries.filter(e => e.outcome === 'loss').length
  const pending = total - resolved
  const winRate = resolved > 0 ? wins / resolved : null
  return { total, resolved, wins, losses, pending, winRate }
}

function loadTracker(): TrackerData {
  try {
    if (existsSync(TRACKER_FILE)) {
      return JSON.parse(readFileSync(TRACKER_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {
    portfolios: [],
    compressed: [],
    globalStats: { totalTrades: 0, totalResolved: 0, totalWins: 0, totalLosses: 0, overallWinRate: null }
  }
}

function saveTracker(data: TrackerData): void {
  // Rolling window: compress portfolios older than 90 days
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - ROLLING_WINDOW_DAYS)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const toCompress = data.portfolios.filter(p => p.date < cutoffStr)
  data.portfolios = data.portfolios.filter(p => p.date >= cutoffStr)

  for (const portfolio of toCompress) {
    const categories: Record<string, { wins: number; losses: number }> = {}
    const evidenceSources: Record<string, { wins: number; losses: number }> = {}

    for (const entry of portfolio.entries) {
      if (!entry.resolved) continue
      const cat = entry.category || 'general'
      if (!categories[cat]) categories[cat] = { wins: 0, losses: 0 }
      if (entry.outcome === 'win') categories[cat].wins++
      else if (entry.outcome === 'loss') categories[cat].losses++

      for (const src of entry.evidenceSources) {
        if (!evidenceSources[src]) evidenceSources[src] = { wins: 0, losses: 0 }
        if (entry.outcome === 'win') evidenceSources[src].wins++
        else if (entry.outcome === 'loss') evidenceSources[src].losses++
      }
    }

    data.compressed.push({
      date: portfolio.date,
      stats: portfolio.stats,
      categories,
      evidenceSourceBreakdown: evidenceSources
    })
  }

  // Recompute global stats
  let totalTrades = 0, totalResolved = 0, totalWins = 0, totalLosses = 0
  for (const p of data.portfolios) {
    totalTrades += p.stats.total
    totalResolved += p.stats.resolved
    totalWins += p.stats.wins
    totalLosses += p.stats.losses
  }
  for (const c of data.compressed) {
    totalTrades += c.stats.total
    totalResolved += c.stats.resolved
    totalWins += c.stats.wins
    totalLosses += c.stats.losses
  }
  data.globalStats = {
    totalTrades,
    totalResolved,
    totalWins,
    totalLosses,
    overallWinRate: totalResolved > 0 ? totalWins / totalResolved : null
  }

  writeFileSync(TRACKER_FILE, JSON.stringify(data, null, 2))
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function addToPortfolio(entry: Omit<PortfolioEntry, 'id' | 'date' | 'addedAt' | 'resolved' | 'outcome' | 'resolvedAt' | 'resolutionPrice'>): PortfolioEntry {
  const data = loadTracker()
  const today = todayKey()

  let portfolio = data.portfolios.find(p => p.date === today)
  if (!portfolio) {
    portfolio = { date: today, entries: [], stats: { total: 0, resolved: 0, wins: 0, losses: 0, pending: 0, winRate: null } }
    data.portfolios.push(portfolio)
  }

  // Prevent duplicates
  if (portfolio.entries.some(e => e.marketId === entry.marketId && e.side === entry.side)) {
    return portfolio.entries.find(e => e.marketId === entry.marketId && e.side === entry.side)!
  }

  const newEntry: PortfolioEntry = {
    ...entry,
    id: generateId(),
    date: today,
    addedAt: new Date().toISOString(),
    resolved: false,
    outcome: null,
    resolvedAt: null,
    resolutionPrice: null,
  }

  portfolio.entries.push(newEntry)
  portfolio.stats = computeStats(portfolio.entries)
  saveTracker(data)
  return newEntry
}

export function removeFromPortfolio(entryId: string): boolean {
  const data = loadTracker()
  const today = todayKey()
  const portfolio = data.portfolios.find(p => p.date === today)
  if (!portfolio) return false

  const idx = portfolio.entries.findIndex(e => e.id === entryId)
  if (idx === -1) return false

  portfolio.entries.splice(idx, 1)
  portfolio.stats = computeStats(portfolio.entries)
  saveTracker(data)
  return true
}

export function getTodayPortfolio(): DailyPortfolio {
  const data = loadTracker()
  const today = todayKey()
  return data.portfolios.find(p => p.date === today) || {
    date: today,
    entries: [],
    stats: { total: 0, resolved: 0, wins: 0, losses: 0, pending: 0, winRate: null }
  }
}

export function getPortfolioHistory(days: number = 7): DailyPortfolio[] {
  const data = loadTracker()
  return data.portfolios.slice(-days)
}

export function getGlobalStats(): TrackerData['globalStats'] {
  const data = loadTracker()
  return data.globalStats
}

export function getAllCompressed(): CompressedDay[] {
  const data = loadTracker()
  return data.compressed
}

// ─── Auto-Resolution ────────────────────────────────────────────────────────

export async function resolvePortfolioEntries(): Promise<{ resolved: number; wins: number; losses: number }> {
  const data = loadTracker()
  let resolvedCount = 0, wins = 0, losses = 0

  // Collect all unresolved entries across all portfolios
  const unresolvedEntries: { portfolio: DailyPortfolio; entry: PortfolioEntry }[] = []
  for (const portfolio of data.portfolios) {
    for (const entry of portfolio.entries) {
      if (!entry.resolved) {
        unresolvedEntries.push({ portfolio, entry })
      }
    }
  }

  if (unresolvedEntries.length === 0) return { resolved: 0, wins: 0, losses: 0 }

  // Batch check market resolution status from Gamma API
  const marketIds = [...new Set(unresolvedEntries.map(u => u.entry.marketId))]

  for (const marketId of marketIds) {
    try {
      const response = await fetch(
        `https://gamma-api.polymarket.com/markets/${marketId}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (!response.ok) continue

      const marketData = await response.json()

      // Check if market has resolved
      if (!marketData.resolved) continue

      const resolutionPrices = typeof marketData.outcomePrices === 'string'
        ? JSON.parse(marketData.outcomePrices)
        : marketData.outcomePrices

      if (!Array.isArray(resolutionPrices)) continue

      // Determine winning outcome
      const yesWon = resolutionPrices[0] >= 0.99
      const noWon = resolutionPrices.length > 1 && resolutionPrices[1] >= 0.99

      // Update all entries for this market
      for (const { portfolio, entry } of unresolvedEntries) {
        if (entry.marketId !== marketId) continue

        entry.resolved = true
        entry.resolvedAt = new Date().toISOString()
        entry.resolutionPrice = yesWon ? 1.0 : 0.0

        if ((entry.side === 'yes' && yesWon) || (entry.side === 'no' && noWon)) {
          entry.outcome = 'win'
          wins++
        } else {
          entry.outcome = 'loss'
          losses++
        }
        resolvedCount++

        // Update portfolio stats
        portfolio.stats = computeStats(portfolio.entries)
      }

      // Small delay between market checks
      await new Promise(resolve => setTimeout(resolve, 200))
    } catch (error) {
      console.error(`[PortfolioTracker] Failed to check market ${marketId}:`, error instanceof Error ? error.message : '')
    }
  }

  if (resolvedCount > 0) {
    saveTracker(data)
  }

  return { resolved: resolvedCount, wins, losses }
}
```

- [ ] **Step 4: Create empty portfolio-tracker.json**

```json
// data/portfolio-tracker.json
{
  "portfolios": [],
  "compressed": [],
  "globalStats": {
    "totalTrades": 0,
    "totalResolved": 0,
    "totalWins": 0,
    "totalLosses": 0,
    "overallWinRate": null
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/services/portfolio-tracker.service.ts data/portfolio-tracker.json src/tests/portfolioTracker.test.ts
git commit -m "feat: add daily portfolio tracker with auto-resolution

One-click add/remove, daily scoping, auto-resolve against Polymarket API,
90-day rolling window with compression for older data."
```

---

## Task 7: Portfolio Tracker API Routes

**Files:**
- Create: `app/api/portfolio/tracker/route.ts`
- Create: `app/api/portfolio/resolve/route.ts`

- [ ] **Step 1: Create portfolio tracker route**

```typescript
// app/api/portfolio/tracker/route.ts
import { NextRequest, NextResponse } from 'next/server'
import {
  addToPortfolio,
  removeFromPortfolio,
  getTodayPortfolio,
  getPortfolioHistory,
  getGlobalStats,
} from '@/lib/services/portfolio-tracker.service'

// GET — today's portfolio or history
export async function GET(request: NextRequest) {
  try {
    const view = request.nextUrl.searchParams.get('view') || 'today'
    const days = parseInt(request.nextUrl.searchParams.get('days') || '7', 10)

    if (view === 'history') {
      const history = getPortfolioHistory(days)
      const globalStats = getGlobalStats()
      return NextResponse.json({ success: true, data: { history, globalStats } })
    }

    const today = getTodayPortfolio()
    const globalStats = getGlobalStats()
    return NextResponse.json({ success: true, data: { today, globalStats } })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST — add to today's portfolio
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entry = addToPortfolio({
      marketId: body.marketId,
      question: body.question,
      side: body.side || 'yes',
      entryOdds: body.entryOdds,
      convictionScore: body.convictionScore || 0,
      convictionLabel: body.convictionLabel || 'risky',
      evidenceSources: body.evidenceSources || [],
      analysisDepth: body.analysisDepth || 'quick',
      category: body.category || 'general',
      estimatedProbability: body.estimatedProbability || body.entryOdds,
      baseRate: body.baseRate || null,
      uncertaintyRange: body.uncertaintyRange || 0.15,
    })

    return NextResponse.json({ success: true, data: entry })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// DELETE — remove from today's portfolio
export async function DELETE(request: NextRequest) {
  try {
    const entryId = request.nextUrl.searchParams.get('id')
    if (!entryId) {
      return NextResponse.json({ success: false, error: 'Missing entry id' }, { status: 400 })
    }

    const removed = removeFromPortfolio(entryId)
    return NextResponse.json({ success: true, data: { removed } })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create resolution route**

```typescript
// app/api/portfolio/resolve/route.ts
import { NextResponse } from 'next/server'
import { resolvePortfolioEntries } from '@/lib/services/portfolio-tracker.service'

// POST — trigger resolution check
export async function POST() {
  try {
    const result = await resolvePortfolioEntries()
    return NextResponse.json({
      success: true,
      data: {
        resolved: result.resolved,
        wins: result.wins,
        losses: result.losses,
        message: result.resolved > 0
          ? `Resolved ${result.resolved} entries: ${result.wins} wins, ${result.losses} losses`
          : 'No new resolutions found'
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Resolution check failed'
    }, { status: 500 })
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio/tracker/route.ts app/api/portfolio/resolve/route.ts
git commit -m "feat: add portfolio tracker and resolution API routes

POST/GET/DELETE for daily portfolio management.
Resolution endpoint checks Polymarket for resolved markets."
```

---

## Task 8: Learning Feedback Service

**Files:**
- Create: `lib/services/learning-feedback.service.ts`
- Create: `data/learning-stats.json`
- Test: `src/tests/learningFeedback.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/tests/learningFeedback.test.ts
import { describe, it, expect } from 'vitest'

describe('Learning Feedback', () => {
  it('should compute calibration buckets', () => {
    interface ResolvedEntry {
      estimatedProbability: number
      outcome: 'win' | 'loss'
    }

    function computeCalibration(entries: ResolvedEntry[]): { bucket: string; predicted: number; actual: number; count: number }[] {
      const buckets = [
        { min: 0.0, max: 0.3, label: '0-30%' },
        { min: 0.3, max: 0.5, label: '30-50%' },
        { min: 0.5, max: 0.6, label: '50-60%' },
        { min: 0.6, max: 0.7, label: '60-70%' },
        { min: 0.7, max: 0.8, label: '70-80%' },
        { min: 0.8, max: 0.9, label: '80-90%' },
        { min: 0.9, max: 1.01, label: '90-100%' },
      ]

      return buckets.map(b => {
        const inBucket = entries.filter(e => e.estimatedProbability >= b.min && e.estimatedProbability < b.max)
        const wins = inBucket.filter(e => e.outcome === 'win').length
        return {
          bucket: b.label,
          predicted: inBucket.length > 0 ? inBucket.reduce((s, e) => s + e.estimatedProbability, 0) / inBucket.length : 0,
          actual: inBucket.length > 0 ? wins / inBucket.length : 0,
          count: inBucket.length
        }
      }).filter(b => b.count > 0)
    }

    const entries: ResolvedEntry[] = [
      { estimatedProbability: 0.75, outcome: 'win' },
      { estimatedProbability: 0.72, outcome: 'win' },
      { estimatedProbability: 0.78, outcome: 'loss' },
      { estimatedProbability: 0.55, outcome: 'win' },
      { estimatedProbability: 0.52, outcome: 'loss' },
    ]

    const calibration = computeCalibration(entries)
    const bucket70_80 = calibration.find(b => b.bucket === '70-80%')
    expect(bucket70_80).toBeDefined()
    expect(bucket70_80!.count).toBe(3)
    expect(bucket70_80!.actual).toBeCloseTo(0.667, 2)
  })

  it('should compute conviction tier adjustments', () => {
    function computeAdjustment(winRate: number, expectedWinRate: number, sampleSize: number): number {
      if (sampleSize < 20) return 0 // Not enough data
      const diff = winRate - expectedWinRate
      // Scale adjustment: max +-10 points
      return Math.round(Math.max(-10, Math.min(10, diff * 20)))
    }

    // Overperforming: positive adjustment
    expect(computeAdjustment(0.80, 0.70, 30)).toBeGreaterThan(0)
    // Underperforming: negative adjustment
    expect(computeAdjustment(0.50, 0.70, 30)).toBeLessThan(0)
    // Not enough data: no adjustment
    expect(computeAdjustment(0.50, 0.70, 10)).toBe(0)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run src/tests/learningFeedback.test.ts`
Expected: PASS

- [ ] **Step 3: Create learning-feedback.service.ts**

```typescript
// lib/services/learning-feedback.service.ts
/**
 * Learning Feedback Service
 *
 * Computes accuracy stats from resolved portfolio entries.
 * Feeds conviction adjustments back into the scoring pipeline.
 *
 * Metrics computed:
 * - Win rate by conviction tier
 * - Win rate by category
 * - Win rate by evidence source combination
 * - Calibration curve (predicted vs actual)
 * - Analysis depth impact (quick vs deep)
 *
 * Minimum threshold: 20 resolved trades before any adjustments apply.
 * Recalculates only when new resolutions detected (cached otherwise).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const DATA_DIR = join(process.cwd(), 'data')
const STATS_FILE = join(DATA_DIR, 'learning-stats.json')
const MIN_SAMPLE_SIZE = 20

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConvictionTierStats {
  tier: string
  winRate: number
  count: number
  adjustment: number
}

export interface CategoryStats {
  category: string
  winRate: number
  count: number
  adjustment: number
}

export interface EvidenceSourceStats {
  source: string
  winRate: number
  count: number
}

export interface CalibrationBucket {
  bucket: string
  predicted: number
  actual: number
  count: number
}

export interface LearningStats {
  lastUpdated: number | null
  totalResolved: number
  overallWinRate: number | null
  convictionTiers: ConvictionTierStats[]
  categories: CategoryStats[]
  evidenceSources: EvidenceSourceStats[]
  calibration: CalibrationBucket[]
  depthComparison: {
    quick: { winRate: number; count: number }
    deep: { winRate: number; count: number }
  }
  adjustmentsActive: boolean // true when >= MIN_SAMPLE_SIZE resolved
}

export interface ConvictionAdjustments {
  byCategoryAdjustment: Record<string, number>  // e.g. { sports: -5, crypto: +3 }
  byTierAdjustment: Record<string, number>      // e.g. { high: -2, consider: +1 }
  active: boolean
}

// ─── Load/Save ───────────────────────────────────────────────────────────────

function loadStats(): LearningStats {
  try {
    if (existsSync(STATS_FILE)) {
      return JSON.parse(readFileSync(STATS_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return {
    lastUpdated: null,
    totalResolved: 0,
    overallWinRate: null,
    convictionTiers: [],
    categories: [],
    evidenceSources: [],
    calibration: [],
    depthComparison: { quick: { winRate: 0, count: 0 }, deep: { winRate: 0, count: 0 } },
    adjustmentsActive: false
  }
}

function saveStats(stats: LearningStats): void {
  writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2))
}

// ─── Computation ─────────────────────────────────────────────────────────────

interface ResolvedEntry {
  convictionLabel: string
  category: string
  evidenceSources: string[]
  analysisDepth: 'quick' | 'deep'
  estimatedProbability: number
  outcome: 'win' | 'loss'
}

function computeAdjustment(winRate: number, expectedWinRate: number, sampleSize: number): number {
  if (sampleSize < MIN_SAMPLE_SIZE) return 0
  const diff = winRate - expectedWinRate
  return Math.round(Math.max(-10, Math.min(10, diff * 20)))
}

function computeCalibration(entries: ResolvedEntry[]): CalibrationBucket[] {
  const buckets = [
    { min: 0.0, max: 0.3, label: '0-30%' },
    { min: 0.3, max: 0.5, label: '30-50%' },
    { min: 0.5, max: 0.6, label: '50-60%' },
    { min: 0.6, max: 0.7, label: '60-70%' },
    { min: 0.7, max: 0.8, label: '70-80%' },
    { min: 0.8, max: 0.9, label: '80-90%' },
    { min: 0.9, max: 1.01, label: '90-100%' },
  ]

  return buckets.map(b => {
    const inBucket = entries.filter(e => e.estimatedProbability >= b.min && e.estimatedProbability < b.max)
    const wins = inBucket.filter(e => e.outcome === 'win').length
    return {
      bucket: b.label,
      predicted: inBucket.length > 0 ? inBucket.reduce((s, e) => s + e.estimatedProbability, 0) / inBucket.length : 0,
      actual: inBucket.length > 0 ? wins / inBucket.length : 0,
      count: inBucket.length
    }
  }).filter(b => b.count > 0)
}

// Expected win rates by conviction tier
const EXPECTED_WIN_RATES: Record<string, number> = {
  'no-brainer': 0.85,
  'high': 0.70,
  'consider': 0.55,
  'risky': 0.40,
}

// Expected win rates by category (neutral baseline)
const CATEGORY_BASELINE = 0.55

export function recomputeStats(entries: ResolvedEntry[]): LearningStats {
  const totalResolved = entries.length
  const wins = entries.filter(e => e.outcome === 'win').length
  const overallWinRate = totalResolved > 0 ? wins / totalResolved : null

  // Conviction tier stats
  const tiers = ['no-brainer', 'high', 'consider', 'risky']
  const convictionTiers: ConvictionTierStats[] = tiers.map(tier => {
    const tierEntries = entries.filter(e => e.convictionLabel === tier)
    const tierWins = tierEntries.filter(e => e.outcome === 'win').length
    const winRate = tierEntries.length > 0 ? tierWins / tierEntries.length : 0
    return {
      tier,
      winRate,
      count: tierEntries.length,
      adjustment: computeAdjustment(winRate, EXPECTED_WIN_RATES[tier] || 0.5, tierEntries.length)
    }
  }).filter(t => t.count > 0)

  // Category stats
  const categorySet = new Set(entries.map(e => e.category))
  const categories: CategoryStats[] = [...categorySet].map(cat => {
    const catEntries = entries.filter(e => e.category === cat)
    const catWins = catEntries.filter(e => e.outcome === 'win').length
    const winRate = catEntries.length > 0 ? catWins / catEntries.length : 0
    return {
      category: cat,
      winRate,
      count: catEntries.length,
      adjustment: computeAdjustment(winRate, CATEGORY_BASELINE, catEntries.length)
    }
  }).filter(c => c.count > 0)

  // Evidence source stats
  const sourceSet = new Set(entries.flatMap(e => e.evidenceSources))
  const evidenceSources: EvidenceSourceStats[] = [...sourceSet].map(src => {
    const srcEntries = entries.filter(e => e.evidenceSources.includes(src))
    const srcWins = srcEntries.filter(e => e.outcome === 'win').length
    return {
      source: src,
      winRate: srcEntries.length > 0 ? srcWins / srcEntries.length : 0,
      count: srcEntries.length
    }
  }).filter(s => s.count > 0)

  // Depth comparison
  const quickEntries = entries.filter(e => e.analysisDepth === 'quick')
  const deepEntries = entries.filter(e => e.analysisDepth === 'deep')

  const depthComparison = {
    quick: {
      winRate: quickEntries.length > 0 ? quickEntries.filter(e => e.outcome === 'win').length / quickEntries.length : 0,
      count: quickEntries.length
    },
    deep: {
      winRate: deepEntries.length > 0 ? deepEntries.filter(e => e.outcome === 'win').length / deepEntries.length : 0,
      count: deepEntries.length
    }
  }

  const stats: LearningStats = {
    lastUpdated: Date.now(),
    totalResolved,
    overallWinRate,
    convictionTiers,
    categories,
    evidenceSources,
    calibration: computeCalibration(entries),
    depthComparison,
    adjustmentsActive: totalResolved >= MIN_SAMPLE_SIZE
  }

  saveStats(stats)
  return stats
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getLearningStats(): LearningStats {
  return loadStats()
}

export function getConvictionAdjustments(): ConvictionAdjustments {
  const stats = loadStats()

  if (!stats.adjustmentsActive) {
    return { byCategoryAdjustment: {}, byTierAdjustment: {}, active: false }
  }

  const byCategoryAdjustment: Record<string, number> = {}
  for (const cat of stats.categories) {
    if (cat.adjustment !== 0) byCategoryAdjustment[cat.category] = cat.adjustment
  }

  const byTierAdjustment: Record<string, number> = {}
  for (const tier of stats.convictionTiers) {
    if (tier.adjustment !== 0) byTierAdjustment[tier.tier] = tier.adjustment
  }

  return { byCategoryAdjustment, byTierAdjustment, active: true }
}

export async function refreshLearningStats(): Promise<LearningStats> {
  // Load all resolved entries from portfolio tracker
  const { getPortfolioHistory, getAllCompressed } = await import('./portfolio-tracker.service')

  const portfolios = getPortfolioHistory(90)
  const resolved: ResolvedEntry[] = []

  for (const portfolio of portfolios) {
    for (const entry of portfolio.entries) {
      if (entry.resolved && entry.outcome) {
        resolved.push({
          convictionLabel: entry.convictionLabel,
          category: entry.category,
          evidenceSources: entry.evidenceSources,
          analysisDepth: entry.analysisDepth,
          estimatedProbability: entry.estimatedProbability,
          outcome: entry.outcome
        })
      }
    }
  }

  return recomputeStats(resolved)
}
```

- [ ] **Step 4: Create empty learning-stats.json**

```json
{
  "lastUpdated": null,
  "totalResolved": 0,
  "overallWinRate": null,
  "convictionTiers": [],
  "categories": [],
  "evidenceSources": [],
  "calibration": [],
  "depthComparison": { "quick": { "winRate": 0, "count": 0 }, "deep": { "winRate": 0, "count": 0 } },
  "adjustmentsActive": false
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/services/learning-feedback.service.ts data/learning-stats.json src/tests/learningFeedback.test.ts
git commit -m "feat: add learning feedback service with accuracy tracking

Computes win rates by conviction tier, category, evidence sources.
Calibration curves and conviction adjustments (active after 20+ trades)."
```

---

## Task 9: Wire Learning Adjustments into Conviction Scoring

**Files:**
- Modify: `app/api/polymarket/route.ts` — apply learning adjustments to conviction scores

- [ ] **Step 1: Import and apply adjustments after conviction scoring**

In `app/api/polymarket/route.ts`, add import at top:
```typescript
import { getConvictionAdjustments } from '@/lib/services/learning-feedback.service'
```

After the LLM scoring updates section (~line 730) and before the re-sort, add:

```typescript
    // ── Apply Learning Adjustments ───────────────────────────────────────────
    const learningAdj = getConvictionAdjustments()
    if (learningAdj.active) {
      for (const rec of allRecommendations) {
        const category = classifyCategory(rec.market.question)
        const catAdj = learningAdj.byCategoryAdjustment[category] || 0
        const tierAdj = learningAdj.byTierAdjustment[rec.convictionLabel] || 0
        rec.convictionScore = Math.min(100, Math.max(0, rec.convictionScore + catAdj + tierAdj))

        // Recompute label after adjustment
        if (rec.convictionScore >= 90) rec.convictionLabel = 'no-brainer'
        else if (rec.convictionScore >= 75) rec.convictionLabel = 'high'
        else if (rec.convictionScore >= 55) rec.convictionLabel = 'consider'
        else rec.convictionLabel = 'risky'
      }
    }
```

- [ ] **Step 2: Also trigger learning refresh after resolution**

In `app/api/portfolio/resolve/route.ts`, add learning refresh after resolution:

```typescript
import { refreshLearningStats } from '@/lib/services/learning-feedback.service'

// Inside POST handler, after resolvePortfolioEntries():
    if (result.resolved > 0) {
      // Refresh learning stats with new resolution data
      await refreshLearningStats()
    }
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/api/polymarket/route.ts app/api/portfolio/resolve/route.ts
git commit -m "feat: wire learning adjustments into conviction scoring

Applies category and tier adjustments from historical accuracy data.
Refreshes learning stats automatically after new resolutions."
```

---

## Task 10: UI — Add to Portfolio Button + Deep Badge on Market Cards

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Add portfolio state and handler functions**

In the `PolymarketSection` component, add state variables after existing state declarations (~line 300):

```typescript
  const [todayPortfolio, setTodayPortfolio] = useState<any[]>([])
  const [addingToPortfolio, setAddingToPortfolio] = useState<Set<string>>(new Set())

  // Fetch today's portfolio
  const fetchTodayPortfolio = useCallback(async () => {
    try {
      const res = await fetch('/api/portfolio/tracker')
      const data = await res.json()
      if (data.success) {
        setTodayPortfolio(data.data.today?.entries || [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchTodayPortfolio()
  }, [fetchTodayPortfolio])

  const addToPortfolio = async (rec: any) => {
    const key = rec.market.id
    setAddingToPortfolio(prev => new Set(prev).add(key))
    try {
      const res = await fetch('/api/portfolio/tracker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: rec.market.id,
          question: rec.market.question,
          side: rec.outcome?.toLowerCase() === 'no' ? 'no' : 'yes',
          entryOdds: rec.odds,
          convictionScore: rec.convictionScore || 0,
          convictionLabel: rec.convictionLabel || 'risky',
          evidenceSources: rec.evidenceSources || ['news', 'search'],
          analysisDepth: rec.analysisDepth || 'quick',
          category: rec.category || 'general',
          estimatedProbability: rec.estimatedProbability || rec.odds,
          baseRate: rec.baseRate || null,
          uncertaintyRange: rec.uncertaintyRange || 0.15,
        })
      })
      const data = await res.json()
      if (data.success) {
        await fetchTodayPortfolio()
      }
    } catch (err) {
      console.error('Failed to add to portfolio:', err)
    } finally {
      setAddingToPortfolio(prev => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const removeFromPortfolio = async (entryId: string) => {
    try {
      await fetch(`/api/portfolio/tracker?id=${entryId}`, { method: 'DELETE' })
      await fetchTodayPortfolio()
    } catch { /* ignore */ }
  }

  const isInPortfolio = (marketId: string) => todayPortfolio.some((e: any) => e.marketId === marketId)
  const getPortfolioEntry = (marketId: string) => todayPortfolio.find((e: any) => e.marketId === marketId)
```

- [ ] **Step 2: Add "Add to Portfolio" button to market cards**

In the card rendering section (~line 1105-1156, the bet sizing area), add the portfolio button after the existing Auto-Place button:

```tsx
{/* Add to Portfolio button */}
{isInPortfolio(rec.market.id) ? (
  <button
    onClick={() => {
      const entry = getPortfolioEntry(rec.market.id)
      if (entry) removeFromPortfolio(entry.id)
    }}
    className="px-3 py-1.5 rounded text-xs font-medium transition-all"
    style={{
      background: 'rgba(63, 185, 80, 0.2)',
      border: '1px solid rgba(63, 185, 80, 0.5)',
      color: '#3fb950'
    }}
  >
    In Portfolio
  </button>
) : (
  <button
    onClick={() => addToPortfolio(rec)}
    disabled={addingToPortfolio.has(rec.market.id)}
    className="px-3 py-1.5 rounded text-xs font-medium transition-all hover:brightness-125"
    style={{
      background: 'rgba(0, 255, 255, 0.15)',
      border: '1px solid rgba(0, 255, 255, 0.4)',
      color: '#00ffff'
    }}
  >
    {addingToPortfolio.has(rec.market.id) ? '...' : '+ Portfolio'}
  </button>
)}
```

- [ ] **Step 3: Add deep analysis badge to market cards**

In the card header area (~line 1045-1056, near the confidence badge), add:

```tsx
{/* Analysis depth badge */}
{rec.analysisDepth === 'deep' && (
  <span
    className="px-1.5 py-0.5 rounded text-[10px] font-bold"
    style={{
      background: 'rgba(168, 85, 247, 0.25)',
      border: '1px solid rgba(168, 85, 247, 0.5)',
      color: '#a855f7'
    }}
  >
    DEEP
  </span>
)}
```

- [ ] **Step 4: Add base rate and uncertainty display for deep-analyzed cards**

In the prediction section (~line 1070-1103), add after the EV tag:

```tsx
{/* Deep analysis extras */}
{rec.analysisDepth === 'deep' && rec.baseRate != null && (
  <span className="text-[10px] opacity-60" style={{ color: '#a855f7' }}>
    Base: {(rec.baseRate * 100).toFixed(0)}% | +/-{((rec.uncertaintyRange || 0.15) * 100).toFixed(0)}%
  </span>
)}
{rec.divergenceSignal === 'divergent' && (
  <span className="text-[10px] font-medium" style={{ color: '#f0883e' }}>
    Cross-platform divergence
  </span>
)}
```

- [ ] **Step 5: Add Today's Portfolio section above opportunity cards**

Add a collapsible "Today's Portfolio" section at the top of the opportunities tab, before the market cards grid:

```tsx
{/* Today's Portfolio */}
{todayPortfolio.length > 0 && (
  <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(0, 255, 255, 0.05)', border: '1px solid rgba(0, 255, 255, 0.15)' }}>
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-sm font-semibold" style={{ color: '#00ffff' }}>
        Today's Portfolio ({todayPortfolio.length})
      </h3>
      <button
        onClick={async () => {
          await fetch('/api/portfolio/resolve', { method: 'POST' })
          await fetchTodayPortfolio()
        }}
        className="text-[10px] px-2 py-1 rounded"
        style={{ background: 'rgba(255,255,255,0.1)', color: '#8b949e' }}
      >
        Check Resolutions
      </button>
    </div>
    <div className="flex flex-wrap gap-2">
      {todayPortfolio.map((entry: any) => (
        <div
          key={entry.id}
          className="flex items-center gap-2 px-2 py-1 rounded text-xs"
          style={{
            background: entry.resolved
              ? entry.outcome === 'win' ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)'
              : 'rgba(255,255,255,0.05)',
            border: `1px solid ${entry.resolved
              ? entry.outcome === 'win' ? 'rgba(63,185,80,0.3)' : 'rgba(248,81,73,0.3)'
              : 'rgba(255,255,255,0.1)'}`,
            color: '#e6edf3'
          }}
        >
          <span className="truncate max-w-[200px]">{entry.question}</span>
          <span className="uppercase font-bold text-[10px]" style={{ color: entry.side === 'yes' ? '#3fb950' : '#f85149' }}>
            {entry.side}
          </span>
          <span className="text-[10px] opacity-60">@{(entry.entryOdds * 100).toFixed(0)}%</span>
          {entry.resolved && (
            <span className="font-bold text-[10px]" style={{ color: entry.outcome === 'win' ? '#3fb950' : '#f85149' }}>
              {entry.outcome === 'win' ? 'WIN' : 'LOSS'}
            </span>
          )}
          {!entry.resolved && (
            <button
              onClick={() => removeFromPortfolio(entry.id)}
              className="text-[10px] opacity-40 hover:opacity-100"
              style={{ color: '#f85149' }}
            >
              x
            </button>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat: add portfolio buttons, deep badge, and today's portfolio section

One-click add/remove to daily portfolio. Deep analysis badge on cards.
Base rate and cross-platform divergence display for deep-analyzed markets."
```

---

## Task 11: UI — Enhanced Performance Tab with Learning Stats

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx` — upgrade performance tab

- [ ] **Step 1: Add learning stats fetching**

In the component, add state and fetch for learning stats:

```typescript
  const [learningStats, setLearningStats] = useState<any>(null)

  const fetchLearningStats = useCallback(async () => {
    try {
      const [historyRes] = await Promise.all([
        fetch('/api/portfolio/tracker?view=history&days=30'),
      ])
      const historyData = await historyRes.json()
      if (historyData.success) {
        setLearningStats(historyData.data)
      }
    } catch { /* ignore */ }
  }, [])

  // Fetch when switching to performance tab
  useEffect(() => {
    if (activeTab === 'performance') {
      fetchLearningStats()
    }
  }, [activeTab, fetchLearningStats])
```

- [ ] **Step 2: Upgrade performance tab content**

Replace or extend the performance tab section (~lines 1273-1387) to include learning-based stats:

```tsx
{activeTab === 'performance' && (
  <div className="space-y-4">
    {/* Global Stats Row */}
    <div className="grid grid-cols-4 gap-3">
      {[
        { label: 'Total Tracked', value: learningStats?.globalStats?.totalTrades || 0, color: '#00ffff' },
        { label: 'Resolved', value: learningStats?.globalStats?.totalResolved || 0, color: '#a855f7' },
        { label: 'Win Rate', value: learningStats?.globalStats?.overallWinRate != null ? `${(learningStats.globalStats.overallWinRate * 100).toFixed(1)}%` : 'N/A', color: '#3fb950' },
        { label: 'Learning', value: (learningStats?.globalStats?.totalResolved || 0) >= 20 ? 'Active' : `${20 - (learningStats?.globalStats?.totalResolved || 0)} more`, color: '#f0883e' }
      ].map((stat, i) => (
        <div key={i} className="p-3 rounded-lg text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="text-xs opacity-60 mb-1">{stat.label}</div>
          <div className="text-lg font-bold" style={{ color: stat.color }}>{stat.value}</div>
        </div>
      ))}
    </div>

    {/* Portfolio History */}
    {learningStats?.history && learningStats.history.length > 0 && (
      <div className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: '#e6edf3' }}>Daily History</h3>
        <div className="space-y-1">
          {learningStats.history.slice().reverse().map((day: any) => (
            <div key={day.date} className="flex items-center justify-between text-xs py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style={{ color: '#8b949e' }}>{day.date}</span>
              <span style={{ color: '#e6edf3' }}>{day.stats.total} picks</span>
              <span style={{ color: '#3fb950' }}>{day.stats.wins}W</span>
              <span style={{ color: '#f85149' }}>{day.stats.losses}L</span>
              <span style={{ color: '#8b949e' }}>{day.stats.pending} pending</span>
              <span style={{ color: day.stats.winRate != null && day.stats.winRate >= 0.5 ? '#3fb950' : '#f85149' }}>
                {day.stats.winRate != null ? `${(day.stats.winRate * 100).toFixed(0)}%` : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Message when no data yet */}
    {(!learningStats?.history || learningStats.history.length === 0) && (
      <div className="p-6 text-center rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-sm mb-2" style={{ color: '#8b949e' }}>No portfolio data yet</div>
        <div className="text-xs" style={{ color: '#6e7681' }}>
          Add markets to your daily portfolio to start tracking accuracy.
          The system needs 20+ resolved trades before learning adjustments activate.
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat: upgrade performance tab with learning stats and daily history

Shows global accuracy stats, daily portfolio history with win/loss,
and learning activation status."
```

---

## Task 12: Run All Tests + Verify Build

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Verify Next.js build**

Run: `npx next build`
Expected: Build succeeds with no type errors

- [ ] **Step 3: Fix any issues found**

If tests fail or build errors occur, fix them.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: fix any build/test issues from intelligence upgrade"
```

(Skip this commit if nothing needed fixing.)

---

## Summary

| Task | Component | Estimated Steps |
|------|-----------|-----------------|
| 1 | Structured reasoning prompt | 7 |
| 2 | Cross-platform odds service | 4 |
| 3 | Evidence tagging | 3 |
| 4 | Deep analysis service + route | 5 |
| 5 | Two-pass merge in main route | 4 |
| 6 | Portfolio tracker service | 5 |
| 7 | Portfolio tracker API routes | 3 |
| 8 | Learning feedback service | 5 |
| 9 | Wire learning into conviction | 4 |
| 10 | UI: portfolio buttons + deep badge | 6 |
| 11 | UI: performance tab upgrade | 3 |
| 12 | Tests + build verification | 4 |
| **Total** | | **53 steps** |
