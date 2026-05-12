# Smarter Decision UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the dashboard around the user's three decision questions (should I enter / why not / which today), with plain-English on every indicator and a bankroll guard intercepting unsafe stakes.

**Architecture:** Six independently-shippable phases on top of the existing Next.js 14 / Polymarket pipeline — no changes to underlying screening logic except a one-pass prompt extension adding `plainSummary` and `reasoningAgainst` fields. A new `decision-glossary.ts` centralizes jargon→plain-English mapping; a `decision-card.tsx` component owns the new pick layout; `decision-guard.ts` enforces Kelly-capped stakes both client- and server-side.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest (existing `lib/**/*.test.ts` pattern), React, claude-code subprocess (existing screening path).

---

## File Structure

**Create:**
- `lib/decision-glossary.ts` — jargon → plain-English map + helper
- `lib/decision-glossary.test.ts` — unit tests
- `lib/decision-guard.ts` — Kelly cap enforcer (pure function)
- `lib/decision-guard.test.ts` — unit tests
- `lib/services/category-stats.service.ts` — per-category W/L aggregation
- `lib/services/category-stats.service.test.ts` — unit tests
- `lib/daily-action.ts` — ranking helper for the action plan
- `lib/daily-action.test.ts` — unit tests
- `components/dashboard/decision-card.tsx` — reusable pick card
- `components/dashboard/daily-action-plan.tsx` — top-of-dashboard summary
- `app/api/category-stats/route.ts` — GET endpoint surfacing category W/L

**Modify:**
- `lib/services/polymarket-screening.service.ts` — extend `BatchAssessment` + prompt
- `lib/services/groq-market-analysis.ts` — extend `LLMMarketAnalysis`
- `app/api/polymarket/route.ts` — propagate new fields through `TradeRecommendation`, mount on response shape
- `app/api/polymarket/place/route.ts` — server-side Kelly cap defense
- `components/dashboard/polymarket-section.tsx` — swap cards to `DecisionCard`, wire bankroll guard on `[Place]`
- `components/dashboard/influencer-insights.tsx` — apply plain-English subtitles
- `app/page.tsx` (or wherever the dashboard composes top-level) — mount `DailyActionPlan`

---

## Phase 1: Plain-English Indicator Layer

Goal: Every numeric indicator in the app shows a one-line plain-English explanation under it. Cheapest phase — no model changes.

### Task 1.1: Create the glossary module

**Files:**
- Create: `lib/decision-glossary.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/decision-glossary.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { explain, IndicatorKey } from './decision-glossary'

describe('decision-glossary', () => {
  it('returns the plain-English subtitle for a known indicator', () => {
    expect(explain('kellyFraction')).toBe('suggested bet size for your bankroll')
    expect(explain('edge')).toContain('YES is')
    expect(explain('payoutMultiple')).toContain('$1 wins')
  })

  it('returns empty string for an unknown indicator (graceful fallback)', () => {
    expect(explain('nonexistent' as IndicatorKey)).toBe('')
  })

  it('covers every IndicatorKey value', () => {
    const keys: IndicatorKey[] = [
      'kellyFraction', 'edge', 'payoutMultiple', 'confidence', 'convictionScore',
      'dps', 'aiEdgeStrong', 'aiEdgeUser', 'aiEdgeWeak', 'closingWindow',
      'expectedValue', 'mktYesProb', 'modelEstProb', 'safetyScore', 'riskLevel',
    ]
    for (const k of keys) {
      expect(explain(k)).not.toBe('')
      expect(explain(k).length).toBeLessThan(120)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/decision-glossary.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the minimal implementation**

Create `lib/decision-glossary.ts`:

```typescript
/**
 * Centralized plain-English explanations for every numeric indicator
 * surfaced in the dashboard. Used by Decision Cards, the action plan,
 * influencer insights, and tooltips. Keep subtitles ≤120 chars and
 * written for someone who has never seen a Kelly calculation.
 *
 * Spec: docs/superpowers/specs/2026-05-12-smarter-decision-ux-design.md
 */

export type IndicatorKey =
  | 'kellyFraction'
  | 'edge'
  | 'payoutMultiple'
  | 'confidence'
  | 'convictionScore'
  | 'dps'
  | 'aiEdgeStrong'
  | 'aiEdgeUser'
  | 'aiEdgeWeak'
  | 'closingWindow'
  | 'expectedValue'
  | 'mktYesProb'
  | 'modelEstProb'
  | 'safetyScore'
  | 'riskLevel'

const GLOSSARY: Record<IndicatorKey, string> = {
  kellyFraction:   'suggested bet size for your bankroll',
  edge:            'model thinks YES is this many points more likely than the market prices',
  payoutMultiple:  '$1 wins this much if right',
  confidence:      'how sure the model is of direction and magnitude',
  convictionScore: 'composite score: research quality × time × structure (0-100)',
  dps:             'how reliable this category\'s signal has been historically (0-1)',
  aiEdgeStrong:    'model has high-quality grounding (citable facts, base rates)',
  aiEdgeUser:      'model is unsure, but you\'ve shown edge in this category',
  aiEdgeWeak:      'model has weak grounding — bet only if you have personal conviction',
  closingWindow:   'time until the market resolves — prices move fastest near close',
  expectedValue:   'average return per $1 bet, accounting for both win and loss outcomes',
  mktYesProb:      'how likely the market currently prices YES (live from Polymarket)',
  modelEstProb:    'how likely the model thinks YES actually is',
  safetyScore:     'composite of liquidity, time fit, and price stability (0-100)',
  riskLevel:       'low = liquid + specific; high = thin liquidity or vague reasoning',
}

/**
 * Return the plain-English subtitle for an indicator. Returns empty
 * string for unknown keys so callers can render conditionally without
 * try/catch.
 */
export function explain(key: IndicatorKey): string {
  return GLOSSARY[key] ?? ''
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/decision-glossary.test.ts`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Run type check**

Run: `npx tsc --noEmit`
Expected: clean exit, no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/decision-glossary.ts lib/decision-glossary.test.ts
git commit -m "feat(glossary): centralize jargon → plain-English indicator map"
```

### Task 1.2: Apply subtitles to Polymarket pick cards

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Import the explainer**

At the top of `components/dashboard/polymarket-section.tsx`, add to existing imports:

```typescript
import { explain } from '@/lib/decision-glossary'
```

- [ ] **Step 2: Locate one indicator chip cluster on the main lane pick card**

Find a section rendering Kelly / edge / payout / confidence (search the file for `kellyFraction` or `payoutMultiple`). Each indicator should be wrapped so the existing chip becomes:

```tsx
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
  <span style={{ /* existing chip style */ }}>
    Kelly {(rec.kellyFraction * 100).toFixed(0)}%
  </span>
  <span style={{ fontSize: '0.5rem', color: '#6e7681', lineHeight: 1.2, marginTop: '1px' }}>
    {explain('kellyFraction')}
  </span>
</div>
```

Repeat for the other indicators visible on the card: `edge`, `payoutMultiple`, `confidence`, `convictionScore`, `aiEdge*`, `closingWindow`. Use the matching `IndicatorKey` for each.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Smoke-test render**

Run `npm run dev` and open the dashboard. Verify subtitles appear under each indicator without overflowing the card width. If overflow, reduce subtitle font-size to `0.45rem` or truncate via `text-overflow: ellipsis`.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(ui): plain-English subtitles under Polymarket pick indicators"
```

### Task 1.3: Apply subtitles to influencer insights indicators

**Files:**
- Modify: `components/dashboard/influencer-insights.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { explain } from '@/lib/decision-glossary'
```

- [ ] **Step 2: Add subtitles under confidence and risk chips**

In the chips block (search for `video.analysis.confidence` and `video.analysis.riskLevel`), wrap each with the same `display: flex; flexDirection: column` pattern as Task 1.2, with `explain('confidence')` / `explain('riskLevel')` underneath.

- [ ] **Step 3: Type-check and smoke test**

Run `npx tsc --noEmit` (expected clean), then refresh dashboard, verify subtitles render on influencer cards.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/influencer-insights.tsx
git commit -m "feat(ui): plain-English subtitles on influencer card indicators"
```

---

## Phase 2: Bear Case + Plain Summary Prompt Extension

Goal: Every screening result returns a one-sentence lay-friendly `plainSummary` AND a 1-2 sentence `reasoningAgainst` (bear case), wired through the existing pipeline.

### Task 2.1: Extend the screening JSON contract

**Files:**
- Modify: `lib/services/polymarket-screening.service.ts`

- [ ] **Step 1: Extend the `BatchAssessment` interface**

Find the `BatchAssessment` interface (near top of file). Add two new fields:

```typescript
interface BatchAssessment {
  marketId: string
  yourEstimate: number
  direction: 'yes' | 'no' | 'skip'
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  shouldBet: boolean
  // NEW: one-sentence plain-English summary written for a lay reader.
  // Renders as the italic subtitle directly under the question on
  // every Decision Card. No trading jargon allowed (no DPS, EV%, Kelly).
  plainSummary: string
  // NEW: 1-2 sentence bear case. Forces the model to argue against
  // its own recommendation. Surfaces failure modes the bull case omits.
  reasoningAgainst: string
}
```

- [ ] **Step 2: Update the batch prompt to require the new fields**

In `buildBatchScreeningPrompt`, locate the JSON shape example given to the model. Add the two new fields:

```typescript
// Update the "for EACH market, output:" section to include:
//
// - plainSummary: ONE sentence (max 140 chars) explaining WHY this is
//   recommended, written for a lay reader. NO trading jargon (no
//   "DPS", "EV%", "edge pp", "Kelly", "conviction score"). Lead with
//   the concrete fact creating the edge.
//   GOOD: "BTC is already at $82k with 8h to close — market hasn't
//          priced in the move yet."
//   BAD:  "DPS:high/crypto with +14pt edge and strong evidence."
//
// - reasoningAgainst: 1-2 sentences arguing AGAINST your recommendation.
//   The bear case. What would make this bet lose. Force yourself to
//   write this honestly even when you're confident — if you genuinely
//   can't think of one, write "No obvious failure mode; main risk is
//   the standard <X>" rather than skipping.
```

- [ ] **Step 3: Update the JSON example block in the prompt**

Find the example response in the prompt (search for `"yourEstimate":`). Add the two new fields:

```json
{
  "marketId": "...",
  "yourEstimate": 0.85,
  "direction": "yes",
  "confidence": "high",
  "reasoning": "...",
  "shouldBet": true,
  "plainSummary": "BTC is already at $82k with 8h to close — market hasn't priced in the move yet.",
  "reasoningAgainst": "If BTC dips below $80k in the final hour, the YES bet loses despite spending most of the window in the money."
}
```

- [ ] **Step 4: Update result sanitization**

Find the function that sanitizes parsed assessments (look for where `BatchAssessment` objects are validated after `JSON.parse`). Add safe defaults for the new fields:

```typescript
function sanitizeAssessment(raw: any): BatchAssessment | null {
  // ... existing validation ...
  return {
    marketId: String(raw.marketId),
    yourEstimate: clamp01(raw.yourEstimate),
    direction: validDirection(raw.direction),
    confidence: validConfidence(raw.confidence),
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning.slice(0, 600) : '',
    shouldBet: !!raw.shouldBet,
    plainSummary: typeof raw.plainSummary === 'string' ? raw.plainSummary.slice(0, 200) : '',
    reasoningAgainst: typeof raw.reasoningAgainst === 'string' ? raw.reasoningAgainst.slice(0, 400) : '',
  }
}
```

(The exact function name and existing fields must match what's already in the file — read the file first to confirm.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/services/polymarket-screening.service.ts
git commit -m "feat(screening): add plainSummary + reasoningAgainst to JSON contract"
```

### Task 2.2: Propagate fields through LLMMarketAnalysis → TradeRecommendation

**Files:**
- Modify: `lib/services/groq-market-analysis.ts`
- Modify: `app/api/polymarket/route.ts`

- [ ] **Step 1: Extend `LLMMarketAnalysis`**

In `lib/services/groq-market-analysis.ts`, add fields to the interface:

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
  // NEW
  plainSummary?: string
  reasoningAgainst?: string
}
```

Optional because legacy cached analyses won't have them — consumers must handle undefined.

- [ ] **Step 2: Pass fields through the batch-to-analysis mapper in screening service**

Find where `BatchAssessment` objects are mapped to `LLMMarketAnalysis` (look for `.map` or object literal containing `estimatedProbability` and `reasoning`). Add:

```typescript
plainSummary: assessment.plainSummary,
reasoningAgainst: assessment.reasoningAgainst,
```

- [ ] **Step 3: Extend `TradeRecommendation`**

In `app/api/polymarket/route.ts` line 23+, add to the interface:

```typescript
export interface TradeRecommendation {
  // ... existing fields ...
  // Plain-English one-sentence "why we picked this" subtitle, sourced
  // from the screening LLM. Renders directly under the question on
  // Decision Cards. Optional because some recs predate the field.
  plainSummary?: string
  // 1-2 sentence bear case from the screening LLM. Displayed on the
  // Decision Card as "Why not". Optional for the same reason.
  reasoningAgainst?: string
}
```

- [ ] **Step 4: Populate the fields when building recommendations from LLM results**

Find where `TradeRecommendation` objects are constructed from `LLMMarketAnalysis` (search for `estimatedProbability:` inside an object literal in `app/api/polymarket/route.ts`). Add:

```typescript
plainSummary: llm.plainSummary,
reasoningAgainst: llm.reasoningAgainst,
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/services/groq-market-analysis.ts app/api/polymarket/route.ts
git commit -m "feat(types): thread plainSummary + reasoningAgainst through TradeRecommendation"
```

### Task 2.3: Render `plainSummary` as the question subtitle (interim — full Decision Card lands Phase 3)

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Locate the question-text render on main-lane cards**

Search for the JSX rendering `rec.market.question` on the main lane (closing-soon picks). It's typically a heading or large text block.

- [ ] **Step 2: Add the plainSummary subtitle directly under it**

Append immediately after the question:

```tsx
{rec.plainSummary && (
  <div style={{
    fontSize: '0.65rem', color: '#a5d6ff',
    fontStyle: 'italic', lineHeight: 1.35,
    marginTop: '3px', paddingLeft: '6px',
    borderLeft: '2px solid rgba(165,214,255,0.3)',
  }}>
    ↳ {rec.plainSummary}
  </div>
)}
```

- [ ] **Step 3: Same treatment on the watch list cards**

Locate the watch-list section (search for `closingTodayAnalyzed` or `watchListFiltered`) and insert the same block after the question text on each card.

- [ ] **Step 4: Locate where `reasoning` is rendered, render `reasoningAgainst` next to it**

Search for `rec.reasoning` in JSX. Where it's shown, add immediately below:

```tsx
{rec.reasoningAgainst && (
  <div style={{
    fontSize: '0.6rem', color: '#f0883e',
    lineHeight: 1.4, marginTop: '4px',
    paddingLeft: '8px',
    borderLeft: '2px solid rgba(240,136,62,0.4)',
  }}>
    <strong style={{ color: '#f0883e' }}>Why not:</strong> {rec.reasoningAgainst}
  </div>
)}
```

- [ ] **Step 5: Type-check + visual smoke**

Run `npx tsc --noEmit`, then refresh dashboard. New picks should show both subtitle and bear case. Existing cached picks may not have the fields — that's OK, they'll on the next pipeline run.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(ui): render plainSummary subtitle + bear case on pick cards"
```

---

## Phase 3: Decision Card Component

Goal: Extract the new card layout into a reusable component. Replace inline card markup on main lane + watch list. Advanced indicators get tucked behind a "Show details" toggle.

### Task 3.1: Build the DecisionCard component

**Files:**
- Create: `components/dashboard/decision-card.tsx`

- [ ] **Step 1: Define the component**

Create the file with:

```typescript
"use client"

import { useState } from 'react'
import { explain } from '@/lib/decision-glossary'
import type { TradeRecommendation } from '@/app/api/polymarket/route'

// Local type — must stay in sync with the CategoryStat interface
// exported from lib/services/category-stats.service.ts in Phase 4.
// Declared locally so Phase 3 can ship before Phase 4 (Phase 3 just
// renders nothing when categoryStats is undefined).
interface CategoryStat {
  category: string
  wins: number
  losses: number
  hitRate: number
}

interface DecisionCardProps {
  rec: TradeRecommendation
  bankroll: number
  categoryStats?: CategoryStat
  onPlace: (rec: TradeRecommendation, stake: number) => void
  onSkip?: () => void
}

const ACTION_VERB: Record<string, string> = {
  yes: '✅ BUY YES on',
  no: '🛑 BUY NO on',
  skip: '⏸️ SKIP',
}

export function DecisionCard({ rec, bankroll, categoryStats, onPlace, onSkip }: DecisionCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const dir = rec.llmDirection || 'skip'
  const verb = ACTION_VERB[dir] || '👀 WATCH'
  const stake = Math.max(0.05, Math.min(bankroll * (rec.kellyFraction || 0), bankroll * 0.15))
  const pctOfBankroll = bankroll > 0 ? (stake / bankroll) * 100 : 0
  const closeStr = rec.daysToClose <= 1
    ? `${Math.max(1, Math.round(rec.daysToClose * 24))}h`
    : `${rec.daysToClose.toFixed(1)}d`

  return (
    <div style={{
      backgroundColor: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: '10px',
      padding: '0.7rem 0.85rem',
      color: '#c9d1d9',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.4rem',
      fontSize: '0.7rem',
    }}>
      {/* Action header */}
      <div style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.3 }}>
        {verb} <span style={{ color: '#a5d6ff' }}>"{rec.market.question}"</span>
      </div>

      {/* Plain-English subtitle — the primary "why" answer */}
      {rec.plainSummary && (
        <div style={{
          fontSize: '0.7rem', color: '#a5d6ff',
          fontStyle: 'italic', lineHeight: 1.35,
          paddingLeft: '8px',
          borderLeft: '2px solid rgba(165,214,255,0.4)',
        }}>
          ↳ {rec.plainSummary}
        </div>
      )}

      {/* Bear case */}
      {rec.reasoningAgainst && (
        <div style={{ fontSize: '0.65rem', color: '#c9d1d9', lineHeight: 1.4 }}>
          <strong style={{ color: '#f0883e' }}>Why not:</strong> {rec.reasoningAgainst}
        </div>
      )}

      {/* Decision lines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.65rem' }}>
        <div>
          <strong>How much:</strong> ${stake.toFixed(2)} ({pctOfBankroll.toFixed(0)}% of bankroll)
          <span style={{ color: '#6e7681', marginLeft: 6 }}>— {explain('kellyFraction')}</span>
        </div>
        <div>
          <strong>Window:</strong> Closes in {closeStr} ⏰
          <span style={{ color: '#6e7681', marginLeft: 6 }}>— {explain('closingWindow')}</span>
        </div>
        {categoryStats && (categoryStats.wins + categoryStats.losses) >= 4 && (
          <div>
            <strong>Track:</strong> {categoryStats.wins}W/{categoryStats.losses}L on {categoryStats.category} picks
            ({(categoryStats.hitRate * 100).toFixed(0)}%)
          </div>
        )}
      </div>

      {/* Show advanced toggle */}
      <button
        onClick={() => setDetailsOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#6e7681', fontSize: '0.55rem', padding: '2px 0',
          textAlign: 'left',
        }}
      >
        {detailsOpen ? '▲ Hide details' : '▼ Show details (edge, EV, confidence)'}
      </button>

      {detailsOpen && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px 12px',
          fontSize: '0.6rem',
          padding: '6px',
          background: 'rgba(42,42,74,0.3)',
          borderRadius: '4px',
        }}>
          <div>
            Edge: {((rec.estimatedProbability - rec.odds) * 100).toFixed(1)}pt
            <div style={{ color: '#6e7681', fontSize: '0.52rem' }}>{explain('edge')}</div>
          </div>
          <div>
            Payout: {rec.odds > 0 ? (1 / rec.odds).toFixed(2) : '?'}x
            <div style={{ color: '#6e7681', fontSize: '0.52rem' }}>{explain('payoutMultiple')}</div>
          </div>
          <div>
            Confidence: {rec.confidence}
            <div style={{ color: '#6e7681', fontSize: '0.52rem' }}>{explain('confidence')}</div>
          </div>
          <div>
            Conviction: {rec.convictionScore}/100
            <div style={{ color: '#6e7681', fontSize: '0.52rem' }}>{explain('convictionScore')}</div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
        <button
          onClick={() => onPlace(rec, stake)}
          style={{
            flex: 2,
            background: 'rgba(63,185,80,0.15)',
            border: '1px solid rgba(63,185,80,0.5)',
            borderRadius: '4px',
            color: '#3fb950',
            padding: '6px 10px',
            fontSize: '0.7rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Place ${stake.toFixed(2)}
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid #30363d',
              borderRadius: '4px',
              color: '#8b949e',
              padding: '6px 10px',
              fontSize: '0.7rem',
              cursor: 'pointer',
            }}
          >
            Skip
          </button>
        )}
        <a
          href={`https://polymarket.com/market/${rec.market.slug || rec.market.id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid #30363d',
            borderRadius: '4px',
            color: '#8b949e',
            padding: '6px 10px',
            fontSize: '0.65rem',
            cursor: 'pointer',
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          View ↗
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/decision-card.tsx
git commit -m "feat(ui): DecisionCard component — bull case, bear case, sized stake"
```

### Task 3.2: Replace main-lane card markup with DecisionCard

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Import**

```typescript
import { DecisionCard } from './decision-card'
```

- [ ] **Step 2: Locate the main-lane render loop**

Find where the closing-soon picks are mapped (search for `closingSoonOpportunities` or the section labelled "Top picks"). Replace each loop iteration's inline JSX with:

```tsx
<DecisionCard
  key={rec.market.id}
  rec={rec}
  bankroll={portfolio?.bankroll ?? 0}
  categoryStats={undefined /* wired in Phase 4 */}
  onPlace={async (rec, stake) => {
    // existing place handler — but stake is now the DecisionCard-computed value
    const res = await fetch('/api/polymarket/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...rec, recommendedBet: stake, halfKellyBet: stake }),
    })
    const json = await res.json()
    if (json.success) loadPaperData()
    else alert(`Failed to place: ${json.error}`)
  }}
/>
```

The existing render code (chips, indicators, action buttons) can be deleted now that DecisionCard owns them.

- [ ] **Step 3: Type-check + smoke render**

Run `npx tsc --noEmit`, refresh dashboard, verify main lane now shows DecisionCards.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(ui): adopt DecisionCard for main-lane Polymarket picks"
```

### Task 3.3: Replace watch-list cards with DecisionCard

Same pattern as Task 3.2 but for the watch list section.

- [ ] **Step 1: Locate watch-list render**

Search for `watchListFiltered.map`.

- [ ] **Step 2: Replace inline JSX with `<DecisionCard ... />`**

Use the same component but mark the action verb override if needed (these are Opus-skipped picks — the DecisionCard already handles `llmDirection: 'skip'` → `⏸️ SKIP`).

- [ ] **Step 3: Type-check + smoke**

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(ui): adopt DecisionCard for watch-list picks"
```

---

## Phase 4: Category Stats Service

Goal: Compute per-category W/L from resolved positions. Surface as "Track" footer on DecisionCard.

### Task 4.1: Build the category-stats service

**Files:**
- Create: `lib/services/category-stats.service.ts`
- Create: `lib/services/category-stats.service.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest'
import { computeCategoryStats, classifyCategory } from './category-stats.service'

describe('category-stats.service', () => {
  it('classifies questions into known categories', () => {
    expect(classifyCategory('Will Bitcoin close above $80k?')).toBe('crypto')
    expect(classifyCategory('Will Lakers cover the spread vs Thunder?')).toBe('sports')
    expect(classifyCategory('Will Trump win Pennsylvania?')).toBe('politics')
    expect(classifyCategory('Will Avengers Doomsday open above $200M?')).toBe('box-office')
    expect(classifyCategory('Will this random thing happen?')).toBe('general')
  })

  it('aggregates wins/losses per category', () => {
    const positions = [
      { question: 'Will BTC close above $80k?', status: 'won' },
      { question: 'Will BTC close above $75k?', status: 'won' },
      { question: 'Will BTC close above $90k?', status: 'lost' },
      { question: 'Will Lakers cover?', status: 'won' },
      { question: 'Will Lakers cover spread 2?', status: 'lost' },
      { question: 'Will Lakers cover spread 3?', status: 'open' },  // skipped
    ] as any[]
    const stats = computeCategoryStats(positions)
    const crypto = stats.find(s => s.category === 'crypto')
    const sports = stats.find(s => s.category === 'sports')
    expect(crypto).toEqual({ category: 'crypto', wins: 2, losses: 1, hitRate: 2/3 })
    expect(sports).toEqual({ category: 'sports', wins: 1, losses: 1, hitRate: 0.5 })
  })

  it('skips open positions in aggregation', () => {
    const positions = [{ question: 'Will BTC close above $80k?', status: 'open' }] as any[]
    const stats = computeCategoryStats(positions)
    expect(stats.find(s => s.category === 'crypto')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run lib/services/category-stats.service.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the service**

```typescript
/**
 * Category stats service — aggregates win/loss per category from
 * resolved positions. Surfaced on DecisionCards as a "Track" footer
 * to show whether the user has been right in this category before.
 *
 * Categories use keyword classification matching the same buckets
 * Opus reasons about in screening, so the track record aligns with
 * the model's category-level confidence.
 *
 * Spec: docs/superpowers/specs/2026-05-12-smarter-decision-ux-design.md
 */

interface PositionLike {
  question: string
  status: 'open' | 'won' | 'lost' | 'invalid' | 'canceled'
}

export interface CategoryStat {
  category: string
  wins: number
  losses: number
  hitRate: number
}

const CATEGORY_RULES: Array<{ category: string; keywords: RegExp }> = [
  { category: 'crypto',      keywords: /\b(bitcoin|btc|ethereum|eth|sol|xrp|crypto|halving|stablecoin|altcoin)\b/i },
  { category: 'sports',      keywords: /\b(lakers|nba|nfl|mlb|nhl|spurs|warriors|celtics|cowboys|patriots|spread|moneyline|over\/under|halftime|first quarter|first half|playoff|championship|game|match)\b/i },
  { category: 'politics',    keywords: /\b(trump|biden|harris|election|senate|congress|democrat|republican|primary|nominee|governor|incumbent|win.+(state|election))\b/i },
  { category: 'box-office',  keywords: /\b(box office|opening weekend|domestic gross|theatrical|premiere|movie)\b/i },
  { category: 'esports',     keywords: /\b(valorant|league of legends|cs2|cs:go|dota|overwatch|esports|major|tournament|grand finals)\b/i },
  { category: 'awards',      keywords: /\b(oscar|emmy|grammy|nobel|academy award|nominee|best.+(picture|actor|director))\b/i },
  { category: 'corporate',   keywords: /\b(ipo|earnings|acquisition|merger|ceo|founder|tesla|apple|nvidia|spacex|openai)\b/i },
]

/**
 * Classify a market question into one of the known categories.
 * Falls back to 'general' for unmatched questions.
 */
export function classifyCategory(question: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.test(question)) return rule.category
  }
  return 'general'
}

/**
 * Aggregate wins / losses per category from a list of positions.
 * Open / canceled / invalid positions are excluded (they don't
 * inform whether the model has been right). Returns sorted by
 * hit rate descending so the best-performing categories surface first.
 */
export function computeCategoryStats(positions: PositionLike[]): CategoryStat[] {
  const bucket = new Map<string, { wins: number; losses: number }>()
  for (const p of positions) {
    if (p.status !== 'won' && p.status !== 'lost') continue
    const cat = classifyCategory(p.question)
    const b = bucket.get(cat) || { wins: 0, losses: 0 }
    if (p.status === 'won') b.wins++
    else b.losses++
    bucket.set(cat, b)
  }
  const stats: CategoryStat[] = []
  for (const [category, b] of bucket.entries()) {
    const total = b.wins + b.losses
    stats.push({ category, wins: b.wins, losses: b.losses, hitRate: total > 0 ? b.wins / total : 0 })
  }
  stats.sort((a, b) => b.hitRate - a.hitRate)
  return stats
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/services/category-stats.service.test.ts`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/services/category-stats.service.ts lib/services/category-stats.service.test.ts
git commit -m "feat(stats): per-category win/loss aggregator"
```

### Task 4.2: Expose stats via GET endpoint

**Files:**
- Create: `app/api/category-stats/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
import { NextResponse } from 'next/server'
import { ensureInitialized, getPositions } from '@/lib/services/polymarket-portfolio.service'
import { computeCategoryStats } from '@/lib/services/category-stats.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureInitialized()
    const positions = getPositions(false /* include closed */)
    const stats = computeCategoryStats(
      positions.map(p => ({ question: p.question, status: p.status as any }))
    )
    return NextResponse.json({ success: true, stats, timestamp: Date.now() })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check + manual hit**

Run `npx tsc --noEmit` (expected clean), then `npm run dev` and hit `http://localhost:3000/api/category-stats`. Expect `{success: true, stats: [...]}`.

(Note: `getPositions(false)` must include closed positions. If it's the inverse, swap to `getPositions(/* openOnly */ false)` or use whichever pattern matches the service.)

- [ ] **Step 3: Commit**

```bash
git add app/api/category-stats/route.ts
git commit -m "feat(api): /api/category-stats endpoint for DecisionCard track record"
```

### Task 4.3: Wire stats into DecisionCard

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Fetch stats on dashboard load**

Add a `useState` and `useEffect` in the polymarket-section component (or wherever the data fetch lives):

```typescript
const [categoryStats, setCategoryStats] = useState<Record<string, { category: string; wins: number; losses: number; hitRate: number }>>({})

useEffect(() => {
  fetch('/api/category-stats')
    .then(r => r.json())
    .then(j => {
      if (j.success && Array.isArray(j.stats)) {
        const byCat: any = {}
        for (const s of j.stats) byCat[s.category] = s
        setCategoryStats(byCat)
      }
    })
    .catch(() => {})
}, [/* refresh deps if applicable */])
```

- [ ] **Step 2: Pass to each DecisionCard**

When rendering DecisionCards, classify the question and pass the matching stat:

```typescript
import { classifyCategory } from '@/lib/services/category-stats.service'

// inside the map:
<DecisionCard
  rec={rec}
  bankroll={portfolio?.bankroll ?? 0}
  categoryStats={categoryStats[classifyCategory(rec.market.question)]}
  onPlace={...}
/>
```

- [ ] **Step 3: Type-check + smoke**

Run `npx tsc --noEmit`, refresh dashboard. Cards with ≥4 W+L in their category should show the Track footer.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(ui): wire category track-record footer into DecisionCards"
```

---

## Phase 5: Daily Action Plan

Goal: New top-of-dashboard summary ranking today's actions across all surfaces.

### Task 5.1: Build the ranking helper

**Files:**
- Create: `lib/daily-action.ts`
- Create: `lib/daily-action.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest'
import { rankDailyActions, DailyAction } from './daily-action'

describe('rankDailyActions', () => {
  const baseRec = (overrides: any = {}) => ({
    market: { id: 'm1', question: 'Will BTC close above $80k?' },
    odds: 0.7,
    estimatedProbability: 0.85,
    confidence: 'high' as const,
    kellyFraction: 0.1,
    daysToClose: 0.5,
    llmDirection: 'yes' as const,
    ...overrides,
  })

  it('places urgent unresolved positions first', () => {
    const actions = rankDailyActions({
      picks: [baseRec()],
      unresolvedClosedPositions: [
        { id: 'p1', question: 'MK2 box office 35-40m?', cost: 1, closedAt: Date.now() - 3600_000 } as any,
      ],
      losses48hWithoutLesson: [],
      bankroll: 4,
    })
    expect(actions[0].kind).toBe('resolve')
  })

  it('ranks picks by edge × confidenceMultiplier × bankrollFit', () => {
    const highConf = baseRec({ market: { id: 'high', question: 'Q1' }, estimatedProbability: 0.85, odds: 0.7, confidence: 'high' })
    const lowConf  = baseRec({ market: { id: 'low',  question: 'Q2' }, estimatedProbability: 0.90, odds: 0.7, confidence: 'low' })
    const actions = rankDailyActions({
      picks: [lowConf, highConf],
      unresolvedClosedPositions: [],
      losses48hWithoutLesson: [],
      bankroll: 4,
    })
    const pickActions = actions.filter(a => a.kind === 'place')
    expect(pickActions[0].rec.market.id).toBe('high')  // high-conf ranks first despite lower edge
  })

  it('caps at 5 items total', () => {
    const picks = Array.from({ length: 10 }, (_, i) =>
      baseRec({ market: { id: `m${i}`, question: `Q${i}` } })
    )
    const actions = rankDailyActions({
      picks,
      unresolvedClosedPositions: [],
      losses48hWithoutLesson: [],
      bankroll: 4,
    })
    expect(actions.length).toBeLessThanOrEqual(5)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/daily-action.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
/**
 * Daily Action Plan ranking — produces the top-of-dashboard "what
 * should I do right now" list across picks, resolutions, and lessons.
 *
 * Spec: docs/superpowers/specs/2026-05-12-smarter-decision-ux-design.md
 */

import type { TradeRecommendation } from '@/app/api/polymarket/route'

export type DailyAction =
  | { kind: 'resolve'; positionId: string; question: string; cost: number; reason: string }
  | { kind: 'place';   rec: TradeRecommendation; stake: number; score: number; reason: string }
  | { kind: 'lesson';  positionId: string; question: string; reason: string }

interface Input {
  /** Eligible new picks (recommended + watch-list). Already filtered to
   *  actionable, sorted by the upstream pipeline. */
  picks: TradeRecommendation[]
  /** Open positions whose underlying market has settled but we haven't
   *  booked yet — money is locked until done. */
  unresolvedClosedPositions: Array<{ id: string; question: string; cost: number; closedAt: number }>
  /** Resolved losses in the last 48h with no `lesson` logged. */
  losses48hWithoutLesson: Array<{ id: string; question: string }>
  bankroll: number
}

const CONFIDENCE_MULT = { high: 1.0, medium: 0.7, low: 0.4 } as const

/** Linear decay: 1.0 at stake ≤ Kelly cap, 0 at stake ≥ 3× cap. */
function bankrollFit(stake: number, bankroll: number): number {
  if (bankroll <= 0) return 0
  const pct = stake / bankroll
  if (pct <= 0.10) return 1.0
  if (pct >= 0.30) return 0
  return 1 - ((pct - 0.10) / 0.20)
}

function scorePick(rec: TradeRecommendation, bankroll: number): number {
  const edgePts = Math.abs((rec.estimatedProbability - rec.odds) * 100)
  const cm = CONFIDENCE_MULT[rec.confidence] || 0.4
  const stake = bankroll * (rec.kellyFraction || 0.05)
  const bf = bankrollFit(stake, bankroll)
  return edgePts * cm * bf
}

export function rankDailyActions(input: Input): DailyAction[] {
  const actions: DailyAction[] = []

  // 1. Resolutions first — money locked.
  for (const p of input.unresolvedClosedPositions) {
    actions.push({
      kind: 'resolve',
      positionId: p.id,
      question: p.question,
      cost: p.cost,
      reason: `Market closed ${humanAgo(Date.now() - p.closedAt)} — $${p.cost.toFixed(2)} locked`,
    })
  }

  // 2. Place picks ranked by score.
  const scored = input.picks
    .filter(r => r.llmDirection !== 'skip')
    .map(rec => ({ rec, score: scorePick(rec, input.bankroll) }))
    .sort((a, b) => b.score - a.score)

  for (const { rec, score } of scored) {
    const stake = Math.max(0.05, Math.min(input.bankroll * (rec.kellyFraction || 0.05), input.bankroll * 0.15))
    const edgePtsNum = (rec.estimatedProbability - rec.odds) * 100
    const edgeStr = `${edgePtsNum >= 0 ? '+' : ''}${edgePtsNum.toFixed(0)}pt`
    const closeStr = rec.daysToClose <= 1
      ? `${Math.max(1, Math.round(rec.daysToClose * 24))}h`
      : `${rec.daysToClose.toFixed(1)}d`
    actions.push({
      kind: 'place',
      rec,
      stake,
      score,
      reason: `closes in ${closeStr} · ${edgeStr} edge · ${rec.confidence} conf`,
    })
  }

  // 3. Lesson prompts.
  for (const l of input.losses48hWithoutLesson) {
    actions.push({
      kind: 'lesson',
      positionId: l.id,
      question: l.question,
      reason: 'Logging a one-line takeaway sharpens next week\'s picks',
    })
  }

  return actions.slice(0, 5)
}

function humanAgo(ms: number): string {
  const hours = ms / 3600_000
  if (hours < 1) return `${Math.round(ms / 60_000)}m ago`
  if (hours < 24) return `${Math.round(hours)}h ago`
  return `${Math.round(hours / 24)}d ago`
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run lib/daily-action.test.ts`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/daily-action.ts lib/daily-action.test.ts
git commit -m "feat(actions): rankDailyActions — urgency × edge × bankroll-fit"
```

### Task 5.2: Build the DailyActionPlan component

**Files:**
- Create: `components/dashboard/daily-action-plan.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client"

import type { DailyAction } from '@/lib/daily-action'

interface Props {
  actions: DailyAction[]
  bankroll: number
  freeBankroll: number
  todayRiskCap: number
  onPlace: (action: Extract<DailyAction, { kind: 'place' }>) => void
  onResolve: (positionId: string) => void
  onLogLesson: (positionId: string) => void
}

const ICONS = { resolve: '✋', place: '⚡', lesson: '📚' }

export function DailyActionPlan({ actions, bankroll, freeBankroll, todayRiskCap, onPlace, onResolve, onLogLesson }: Props) {
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <section style={{
      backgroundColor: '#0d1117',
      border: '1px solid #30363d',
      borderRadius: '12px',
      padding: '0.75rem 1rem',
      marginBottom: '1rem',
      color: '#c9d1d9',
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <strong style={{ fontSize: '0.8rem' }}>TODAY · {today.toUpperCase()}</strong>
        <span style={{ fontSize: '0.65rem', color: '#8b949e' }}>
          You have <strong style={{ color: '#3fb950' }}>${freeBankroll.toFixed(2)}</strong> to deploy
        </span>
      </header>

      {actions.length === 0 ? (
        <div style={{ fontSize: '0.7rem', color: '#6e7681', padding: '0.5rem 0' }}>
          Nothing urgent right now — check back in a few hours.
        </div>
      ) : (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {actions.map((a, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.7rem' }}>
              <span style={{ fontSize: '0.65rem', color: '#6e7681', minWidth: '14px' }}>{i + 1}.</span>
              <span>{ICONS[a.kind]}</span>
              {a.kind === 'place' && (
                <>
                  <button onClick={() => onPlace(a)} style={primaryBtn}>
                    Place ${a.stake.toFixed(2)} on {a.rec.market.question.slice(0, 45)}…
                  </button>
                  <span style={{ color: '#6e7681', fontSize: '0.6rem' }}>{a.reason}</span>
                </>
              )}
              {a.kind === 'resolve' && (
                <>
                  <button onClick={() => onResolve(a.positionId)} style={primaryBtn}>
                    Resolve {a.question.slice(0, 50)}…
                  </button>
                  <span style={{ color: '#6e7681', fontSize: '0.6rem' }}>{a.reason}</span>
                </>
              )}
              {a.kind === 'lesson' && (
                <>
                  <button onClick={() => onLogLesson(a.positionId)} style={primaryBtn}>
                    Log lesson on {a.question.slice(0, 50)}…
                  </button>
                  <span style={{ color: '#6e7681', fontSize: '0.6rem' }}>{a.reason}</span>
                </>
              )}
            </li>
          ))}
        </ol>
      )}

      <footer style={{ marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(42,42,74,0.5)', display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#8b949e' }}>
        <span>Bankroll: <strong>${bankroll.toFixed(2)}</strong></span>
        <span>Today's risk cap: <strong style={{ color: '#f0883e' }}>${todayRiskCap.toFixed(2)}</strong> (3 picks @ 10%)</span>
      </footer>
    </section>
  )
}

const primaryBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(63,185,80,0.4)',
  borderRadius: '4px',
  color: '#3fb950',
  padding: '4px 8px',
  fontSize: '0.65rem',
  cursor: 'pointer',
  textAlign: 'left',
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/daily-action-plan.tsx
git commit -m "feat(ui): DailyActionPlan component (ranked top-of-dashboard summary)"
```

### Task 5.3: Mount the plan at the top of the dashboard

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx` (or wherever the dashboard top composes — verify with a grep)

- [ ] **Step 1: Identify the dashboard composition point**

Run: `grep -rn "PolymarketSection\|InfluencerInsights" /Users/michalwanto/Documents/Michal_wanto/Work/Experiments/crytpo_trader_OS/app/page.tsx 2>/dev/null | head`
Find the top-level dashboard component.

- [ ] **Step 2: Compute the actions array from existing data**

Wherever the polymarket data + positions + lessons are loaded, derive the daily action input:

```typescript
import { rankDailyActions } from '@/lib/daily-action'
import { DailyActionPlan } from '@/components/dashboard/daily-action-plan'

// inside the component, after data is loaded:
const now = Date.now()
const unresolvedClosed = (positions || [])
  .filter(p => p.status === 'open' && p.market?.endDateIso && new Date(p.market.endDateIso).getTime() < now)
  .map(p => ({ id: p.id, question: p.question, cost: p.cost, closedAt: new Date(p.market.endDateIso).getTime() }))

const losses48hWithoutLesson = (positions || [])
  .filter(p => p.status === 'lost' && now - (p.resolvedAt ?? 0) < 48 * 3600_000)
  .filter(p => !(lessons || []).some(l => l.positionId === p.id))
  .map(p => ({ id: p.id, question: p.question }))

const topPicks = [
  ...(data?.closingSoonOpportunities || []),
  ...(data?.closingTodayAnalyzed || []),
]
const actions = rankDailyActions({
  picks: topPicks,
  unresolvedClosedPositions: unresolvedClosed,
  losses48hWithoutLesson,
  bankroll: portfolio?.bankroll ?? 0,
})
const todayRiskCap = (portfolio?.bankroll ?? 0) * 0.30 // 3 picks × 10%
```

- [ ] **Step 3: Render at the very top of the dashboard**

```tsx
<DailyActionPlan
  actions={actions}
  bankroll={portfolio?.bankroll ?? 0}
  freeBankroll={portfolio?.bankroll ?? 0}
  todayRiskCap={todayRiskCap}
  onPlace={async (a) => {
    // Reuses the Phase 6 client-side guard (`placeWithGuard`) so the
    // Action Plan's "Place" button respects the same Kelly cap as the
    // per-card Place button. If Phase 6 hasn't shipped yet, replace
    // with a direct fetch — but ship Phase 6 first if possible.
    const res = await fetch('/api/polymarket/place', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...a.rec, recommendedBet: a.stake, halfKellyBet: a.stake }),
    })
    const json = await res.json()
    if (json.success) loadPaperData()
    else alert(`Failed to place: ${json.error}`)
  }}
  onResolve={async (positionId) => {
    // Manual resolve: ask the user which side it settled to, then
    // POST to the existing resolution endpoint.
    const resolution = window.prompt('Did this resolve YES, NO, or INVALID?', 'yes')
    if (!resolution) return
    const lower = resolution.toLowerCase()
    if (!['yes', 'no', 'invalid'].includes(lower)) {
      alert('Resolution must be yes, no, or invalid.')
      return
    }
    const res = await fetch('/api/polymarket/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: positionId, resolution: lower }),
    })
    const json = await res.json()
    if (json.success) loadPaperData()
    else alert(`Failed to resolve: ${json.error}`)
  }}
  onLogLesson={async (positionId) => {
    // Surface the existing lesson logger. Simplest path: scroll to
    // the lessons tab and pre-fill the form via a stored hint. For
    // now, just open the lessons endpoint URL params so the user
    // lands on the right input.
    const takeaway = window.prompt('One-sentence takeaway from this loss (what should the model do differently next time?)')
    if (!takeaway || takeaway.length < 5) return
    const pos = positions?.find(p => p.id === positionId)
    if (!pos) return
    const res = await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: pos.question,
        opusPrediction: `Predicted ${pos.outcome} at ${(pos.entryPrice * 100).toFixed(0)}%`,
        actualOutcome: `Position lost (resolved ${new Date(pos.resolvedAt || Date.now()).toLocaleDateString()})`,
        takeaway,
        positionId,
      }),
    })
    const json = await res.json()
    if (json.success) loadPaperData()
    else alert(`Failed to log lesson: ${json.error}`)
  }}
/>
```

- [ ] **Step 4: Type-check + smoke render**

Run `npx tsc --noEmit`, refresh dashboard, verify the plan appears at the top with at least one ranked item.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(ui): mount DailyActionPlan at top of dashboard"
```

---

## Phase 6: Bankroll Guard

Goal: Hard cap on stake size relative to bankroll, enforced client- and server-side.

### Task 6.1: Build the decision-guard

**Files:**
- Create: `lib/decision-guard.ts`
- Create: `lib/decision-guard.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest'
import { enforceBankrollCap, kellyCapFor } from './decision-guard'

describe('enforceBankrollCap', () => {
  it('proceeds when stake ≤ cap', () => {
    const r = enforceBankrollCap({ stake: 0.40, bankroll: 4, confidence: 'high' })
    expect(r.action).toBe('proceed')
  })

  it('suggests Kelly cap when stake > cap', () => {
    const r = enforceBankrollCap({ stake: 1.0, bankroll: 4, confidence: 'medium' })
    expect(r.action).toBe('suggest')
    expect(r.suggested).toBeCloseTo(0.40, 2) // 10% of $4 for medium
    expect(r.reason).toContain('25%')
  })

  it('uses 15% cap for high confidence, 10% medium, 5% low, 3% override', () => {
    expect(kellyCapFor('high')).toBe(0.15)
    expect(kellyCapFor('medium')).toBe(0.10)
    expect(kellyCapFor('low')).toBe(0.05)
    expect(kellyCapFor('override')).toBe(0.03)
  })

  it('blocks when stake exceeds 3× cap (clearly reckless)', () => {
    const r = enforceBankrollCap({ stake: 2.0, bankroll: 4, confidence: 'low' })
    expect(r.action).toBe('block')
  })

  it('handles zero bankroll gracefully', () => {
    const r = enforceBankrollCap({ stake: 1, bankroll: 0, confidence: 'high' })
    expect(r.action).toBe('block')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run lib/decision-guard.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
/**
 * Bankroll guard — enforces Kelly-style stake caps as a hard backstop
 * against blowing up a small bankroll on one pick. Client-side UI calls
 * this before posting a bet; server-side /api/polymarket/place also
 * calls it as a second line of defense.
 *
 * Spec: docs/superpowers/specs/2026-05-12-smarter-decision-ux-design.md
 */

export type Confidence = 'high' | 'medium' | 'low' | 'override'

export interface CapInput {
  stake: number
  bankroll: number
  confidence: Confidence
}

export interface CapResult {
  action: 'proceed' | 'suggest' | 'block'
  suggested: number
  reason: string
}

const CAPS: Record<Confidence, number> = {
  high:     0.15,
  medium:   0.10,
  low:      0.05,
  override: 0.03,
}

export function kellyCapFor(c: Confidence): number {
  return CAPS[c]
}

export function enforceBankrollCap(input: CapInput): CapResult {
  const { stake, bankroll, confidence } = input
  if (bankroll <= 0) {
    return { action: 'block', suggested: 0, reason: 'Bankroll is zero — top up before placing a bet.' }
  }
  const cap = kellyCapFor(confidence)
  const maxStake = bankroll * cap
  const stakePct = stake / bankroll
  if (stake <= maxStake) {
    return { action: 'proceed', suggested: stake, reason: '' }
  }
  if (stake >= maxStake * 3) {
    return {
      action: 'block',
      suggested: maxStake,
      reason: `$${stake.toFixed(2)} is ${(stakePct * 100).toFixed(0)}% of your $${bankroll.toFixed(2)} bankroll. Cap for ${confidence} confidence is ${(cap * 100).toFixed(0)}% ($${maxStake.toFixed(2)}). This is over 3× the cap — reckless.`,
    }
  }
  return {
    action: 'suggest',
    suggested: maxStake,
    reason: `$${stake.toFixed(2)} is ${(stakePct * 100).toFixed(0)}% of your $${bankroll.toFixed(2)} bankroll. Kelly says max ${(cap * 100).toFixed(0)}% ($${maxStake.toFixed(2)}) on a ${confidence}-confidence pick.`,
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run lib/decision-guard.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/decision-guard.ts lib/decision-guard.test.ts
git commit -m "feat(guard): Kelly-cap stake enforcer (pure function)"
```

### Task 6.2: Hook into client-side placement

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`
- Modify: `components/dashboard/decision-card.tsx`

- [ ] **Step 1: Wrap `onPlace` callsites with the guard**

Wherever the dashboard calls `fetch('/api/polymarket/place', ...)`, insert the guard call first:

```typescript
import { enforceBankrollCap } from '@/lib/decision-guard'

async function placeWithGuard(rec: TradeRecommendation, stake: number, bankroll: number) {
  const r = enforceBankrollCap({ stake, bankroll, confidence: rec.confidence })
  if (r.action === 'block') {
    alert(r.reason + `\n\nReduce stake to $${r.suggested.toFixed(2)} or less and try again.`)
    return
  }
  if (r.action === 'suggest') {
    const ok = window.confirm(`${r.reason}\n\nReduce to $${r.suggested.toFixed(2)}? (Cancel = override and place $${stake.toFixed(2)} anyway.)`)
    if (ok) stake = r.suggested
    else console.warn(`[BankrollGuard] User overrode Kelly cap: $${stake.toFixed(2)} on ${rec.confidence}-confidence pick`)
  }
  return fetch('/api/polymarket/place', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...rec, recommendedBet: stake, halfKellyBet: stake }),
  }).then(r => r.json())
}
```

- [ ] **Step 2: Replace all direct `/api/polymarket/place` POSTs with `placeWithGuard`**

Search for `'/api/polymarket/place'` in `polymarket-section.tsx`; every callsite uses `placeWithGuard(rec, stake, bankroll)` instead.

- [ ] **Step 3: Type-check + smoke**

Run `npx tsc --noEmit`. Manually test: set bankroll to $4, try to place a $2 bet — guard should intercept.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/polymarket-section.tsx components/dashboard/decision-card.tsx
git commit -m "feat(guard): client-side Kelly-cap intercept on bet placement"
```

### Task 6.3: Server-side defense

**Files:**
- Modify: `app/api/polymarket/place/route.ts`

- [ ] **Step 1: Import the guard and check server-side**

```typescript
import { enforceBankrollCap } from '@/lib/decision-guard'
import { getPortfolio } from '@/lib/services/polymarket-portfolio.service'
```

- [ ] **Step 2: Add the check before `createPosition`**

After the existing `if (!body.market?.id || !body.outcome) { ... }` validation:

```typescript
const stake = Number(body.recommendedBet || body.halfKellyBet || 0)
const portfolio = getPortfolio()
const bankroll = portfolio?.bankroll ?? 0
const conf = (body.confidence as 'high' | 'medium' | 'low') || 'low'
const guardResult = enforceBankrollCap({ stake, bankroll, confidence: conf })
if (guardResult.action === 'block') {
  return NextResponse.json({
    success: false,
    error: `Server-side bankroll guard rejected stake: ${guardResult.reason}`,
    timestamp: Date.now(),
  }, { status: 400 })
}
// 'suggest' is intentionally allowed server-side — the client has already
// shown the user the cap; if they chose to override, respect the choice.
// The 'block' threshold (3× cap) is the absolute backstop.
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add app/api/polymarket/place/route.ts
git commit -m "feat(guard): server-side stake-cap defense in /api/polymarket/place"
```

---

## Final Smoke Test

After all phases land:

- [ ] **Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Type-check the whole project**

```bash
npx tsc --noEmit
```

Expected: clean.

- [ ] **Build**

```bash
npm run build
```

Expected: build completes without errors.

- [ ] **Push to deploy**

```bash
git push
```

- [ ] **Verify on the live dashboard:**
  - DailyActionPlan appears at the top
  - Each pick card shows the new layout with plain-English subtitle, bear case, sized stake, optional Track footer
  - Hover/Show Details reveals technical indicators with subtitles underneath
  - Attempting a stake >Kelly cap triggers the guard dialog
  - Server-side guard rejects extreme stakes (>3× cap) even if client is bypassed

---

## Out of Scope (Future Plans)

- Correlation / concentration warnings across open positions
- Onboarding tour
- Cross-asset crypto trading integration
- Mobile-specific layout adjustments
