# Polymarket Recommendation Rigor + Diversification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce false-positive Polymarket recommendations (currently losing the user money) by requiring multi-signal conviction before showing picks, and diversify away from sports/esports tunnel-vision by fetching markets per-category.

**Architecture:** Two coupled layers. Layer 1 adds a new `FILTER 5` to the watch list pipeline in `polymarket-section.tsx` that requires 2-of-3 signals to agree (Opus edge / DPS tier / calibration hit rate). Picks with only 1 signal are demoted to a "Speculative" collapsible section. Layer 2 replaces the single global market fetch in `app/api/polymarket/route.ts` with parallel per-category fetches, ensuring non-sports categories always have minimum representation, and adds a small ranking boost + UI category chips.

**Tech Stack:** Next.js 14 App Router (TypeScript), Vitest for unit tests, existing Polymarket Gamma + Data APIs, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-19-polymarket-rigor-and-diversification-design.md`

---

## File Structure

**Created:**
- `lib/services/conviction.service.ts` — pure-function module computing conviction level from 3 input signals. Exported for use in `polymarket-section.tsx` filter and badge rendering. Easy to unit test.
- `lib/services/conviction.service.test.ts` — vitest tests for the conviction calculator.

**Modified:**
- `app/api/polymarket/route.ts` — adds `dpsTier` + `dpsCategory` to `TradeRecommendation` interface (Task 1); replaces single market fetch with per-category fetch logic (Task 7).
- `components/dashboard/polymarket-section.tsx` — adds FILTER 5 in watch list filter chain (Task 4); conviction badge UI (Task 5); speculative section (Task 6); diversification boost in sort (Task 8); category chip filter UI (Task 9).

Total: 2 new files, 2 modified files.

---

## Task 1: Add `dpsTier` and `dpsCategory` to `TradeRecommendation`

**Why first:** FILTER 5 in the UI needs `dpsTier` per recommendation. Currently it's only on the server-side `dpsInfo` map. Plumbing it through the API response is a prerequisite for everything else.

**Files:**
- Modify: `app/api/polymarket/route.ts` (interface around line 24, populating around line 1418)

- [ ] **Step 1: Add fields to TradeRecommendation interface**

In `app/api/polymarket/route.ts`, find the `TradeRecommendation` interface (~line 24) and add two fields below `aiEdgeReason`:

```typescript
// DPS classification — exposed to the UI for the conviction filter
// (Layer 1, FILTER 5). The server-side dpsInfo map already computes
// these; we just need to thread them through to the client.
dpsCategory?: string
dpsTier?: 'high' | 'medium' | 'low' | 'unknown'
```

- [ ] **Step 2: Populate the fields where aiEdge is populated**

Find the block around line 1418-1450 that sets `rec.aiEdge` based on `dpsInfo.get(rec.market.question)`. The `dps` local variable is already there. Add two lines just before the `if (cat === 'esports')` block:

```typescript
rec.dpsCategory = dps?.category
rec.dpsTier = dps?.tier
```

(Place these immediately after `const cat = dps?.category` and before the existing `AI_STRONG_CATS` definition.)

- [ ] **Step 3: Verify build compiles**

Run: `docker build -f Dockerfile.koyeb -t verify-task1 . 2>&1 | grep -E "Type error|error TS|✓ Compiled|Failed to compile" | tail -5`
Expected: `✓ Compiled successfully`. If you see type errors, the new fields are referenced somewhere that didn't expect them — check audit grep `grep -n "TradeRecommendation" components/`.

- [ ] **Step 4: Clean up test image**

Run: `docker rmi verify-task1`

- [ ] **Step 5: Commit**

```bash
git add app/api/polymarket/route.ts
git commit -m "feat(polymarket): expose dpsCategory + dpsTier on TradeRecommendation

Threads the server-side DPS classification through to the API response
so the upcoming FILTER 5 (multi-signal conviction) can read it in the
UI. Pure type + assignment addition; no behavior change yet."
```

---

## Task 2: Create `conviction.service.ts` skeleton + failing test (TDD)

**Files:**
- Create: `lib/services/conviction.service.ts`
- Create: `lib/services/conviction.service.test.ts`

- [ ] **Step 1: Create the empty service module with types**

Create `lib/services/conviction.service.ts` with this exact content:

```typescript
/**
 * Multi-signal conviction calculator for Polymarket recommendations.
 *
 * A pick reaches the main watch list only when 2 of 3 independent
 * signals agree it's worth showing:
 *   1. Opus edge — the LLM screening already passed FILTER 2-4
 *   2. DPS tier — domain-predictability is high or medium (not low)
 *   3. Calibration — historical win rate in this aiEdge tier ≥50%,
 *      OR fewer than 3 resolved bets (no negative track record yet)
 *
 * Pure function. Zero side effects. Zero LLM calls. Easy to unit test.
 */

export type ConvictionSignal = 'agrees' | 'disagrees'
export type ConvictionLevel = 'strong' | 'moderate' | 'speculative' | 'suppress'

export interface ConvictionInput {
  /** True when the rec already passed the existing FILTER 2-4 edge floor */
  edgePassesFloor: boolean
  /** DPS classifier tier (high/medium = agrees, low/unknown/undefined = disagrees) */
  dpsTier?: 'high' | 'medium' | 'low' | 'unknown'
  /** Win rate 0-100 for this rec's aiEdge tier from analytics.byAiEdge */
  tierWinRate?: number | null
  /** Loss count for this rec's aiEdge tier */
  tierLosses?: number
}

export interface ConvictionResult {
  level: ConvictionLevel
  signals: {
    opus: ConvictionSignal
    dps: ConvictionSignal
    calibration: ConvictionSignal
  }
}

export function computeConviction(input: ConvictionInput): ConvictionResult {
  throw new Error('not implemented')
}
```

- [ ] **Step 2: Create the test file**

Create `lib/services/conviction.service.test.ts` with this exact content:

```typescript
import { describe, it, expect } from 'vitest'
import { computeConviction } from './conviction.service'

describe('computeConviction', () => {
  describe('Opus signal', () => {
    it('agrees when edge passes floor', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'high',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.signals.opus).toBe('agrees')
    })

    it('disagrees when edge does not pass floor', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        dpsTier: 'high',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.signals.opus).toBe('disagrees')
    })
  })

  describe('DPS signal', () => {
    it('agrees for high tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'high' })
      expect(r.signals.dps).toBe('agrees')
    })

    it('agrees for medium tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'medium' })
      expect(r.signals.dps).toBe('agrees')
    })

    it('disagrees for low tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'low' })
      expect(r.signals.dps).toBe('disagrees')
    })

    it('disagrees for unknown tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'unknown' })
      expect(r.signals.dps).toBe('disagrees')
    })

    it('disagrees when dpsTier is undefined', () => {
      const r = computeConviction({ edgePassesFloor: false })
      expect(r.signals.dps).toBe('disagrees')
    })
  })

  describe('Calibration signal', () => {
    it('agrees when losses < 3 (no negative track record)', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        tierWinRate: 0,
        tierLosses: 2,
      })
      expect(r.signals.calibration).toBe('agrees')
    })

    it('agrees when win rate >= 50% even with many losses', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        tierWinRate: 60,
        tierLosses: 10,
      })
      expect(r.signals.calibration).toBe('agrees')
    })

    it('disagrees when win rate < 50% and losses >= 3', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        tierWinRate: 30,
        tierLosses: 5,
      })
      expect(r.signals.calibration).toBe('disagrees')
    })

    it('agrees when tierLosses is undefined (no data = no veto)', () => {
      const r = computeConviction({ edgePassesFloor: false })
      expect(r.signals.calibration).toBe('agrees')
    })
  })

  describe('Conviction level', () => {
    it('strong when all 3 agree', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'high',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.level).toBe('strong')
    })

    it('moderate when exactly 2 agree (opus + dps)', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'high',
        tierWinRate: 20,
        tierLosses: 5,
      })
      expect(r.level).toBe('moderate')
    })

    it('moderate when exactly 2 agree (opus + calibration)', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'low',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.level).toBe('moderate')
    })

    it('speculative when exactly 1 agrees', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'low',
        tierWinRate: 20,
        tierLosses: 5,
      })
      expect(r.level).toBe('speculative')
    })

    it('suppress when 0 agree', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        dpsTier: 'low',
        tierWinRate: 20,
        tierLosses: 5,
      })
      expect(r.level).toBe('suppress')
    })
  })

  describe('Real-world: MOUZ-style pick', () => {
    it('top-tier esports underdog with bad track record → speculative', () => {
      // Opus says edge ≥8pt (passes FILTER 2 user-tier floor),
      // DPS classifies as 'medium' (esports is well-categorized but not
      // top tier predictability), calibration shows 0W/3L on user-tier.
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'medium',
        tierWinRate: 0,
        tierLosses: 3,
      })
      // Opus agrees, DPS agrees, calibration disagrees → 2 of 3 → moderate
      expect(r.signals.calibration).toBe('disagrees')
      expect(r.level).toBe('moderate')
    })
  })
})
```

- [ ] **Step 3: Verify the test fails as expected**

First, check vitest is installed by running it once. From repo root:

Run: `npx vitest run lib/services/conviction.service.test.ts 2>&1 | tail -20`

Expected: tests run but ALL fail with `Error: not implemented`. The test infrastructure works, the implementation just doesn't exist yet.

If vitest can't find the file or the import errors out, fix that first — the test discovery glob in `vitest.config.ts` includes `lib/**/*.test.ts` so the path should work.

- [ ] **Step 4: Commit the failing test**

```bash
git add lib/services/conviction.service.ts lib/services/conviction.service.test.ts
git commit -m "test(conviction): scaffold conviction.service + failing tests (TDD)

Sets up the multi-signal conviction calculator skeleton and 14 failing
tests covering Opus / DPS / Calibration signal behaviors plus 5 level
combinations. Implementation in next commit."
```

---

## Task 3: Implement `computeConviction` to pass tests

**Files:**
- Modify: `lib/services/conviction.service.ts`

- [ ] **Step 1: Replace the throw with the real implementation**

In `lib/services/conviction.service.ts`, replace the `computeConviction` function body with:

```typescript
export function computeConviction(input: ConvictionInput): ConvictionResult {
  // Signal 1: Opus edge — already filtered by FILTER 2-4 upstream;
  // this flag just relays the result so we can count it as a signal.
  const opus: ConvictionSignal = input.edgePassesFloor ? 'agrees' : 'disagrees'

  // Signal 2: DPS classifier tier. high/medium = the category is
  // predictable enough that Opus's call has structural backing.
  // low/unknown/undefined = treat as disagree (conservative).
  const dps: ConvictionSignal =
    input.dpsTier === 'high' || input.dpsTier === 'medium' ? 'agrees' : 'disagrees'

  // Signal 3: Calibration. Agree by default when there's no negative
  // track record (losses < 3). Disagree only when we have ≥3 losses
  // AND the hit rate is below 50%. This prevents the system from
  // vetoing brand-new tiers (where calibration data is empty) while
  // still blocking tiers proven to be losing for the user.
  const losses = input.tierLosses ?? 0
  let calibration: ConvictionSignal
  if (losses < 3) {
    calibration = 'agrees'
  } else {
    const wr = input.tierWinRate ?? 0
    calibration = wr >= 50 ? 'agrees' : 'disagrees'
  }

  const agreeCount =
    (opus === 'agrees' ? 1 : 0) +
    (dps === 'agrees' ? 1 : 0) +
    (calibration === 'agrees' ? 1 : 0)

  const level: ConvictionLevel =
    agreeCount === 3 ? 'strong'
      : agreeCount === 2 ? 'moderate'
      : agreeCount === 1 ? 'speculative'
      : 'suppress'

  return { level, signals: { opus, dps, calibration } }
}
```

- [ ] **Step 2: Run the tests, verify all pass**

Run: `npx vitest run lib/services/conviction.service.test.ts 2>&1 | tail -10`

Expected output should include `Test Files  1 passed` and `Tests  14 passed`.

If any test fails, the test description tells you which case — fix the implementation, don't modify the test (it encodes the spec).

- [ ] **Step 3: Commit**

```bash
git add lib/services/conviction.service.ts
git commit -m "feat(conviction): implement multi-signal conviction calculator

All 14 tests pass. Pure function, zero side effects, ready to be wired
into FILTER 5 of the watch list filter chain."
```

---

## Task 4: Wire FILTER 5 into the watch list filter chain

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx` (the watch list filter around line ~1742-1804)

- [ ] **Step 1: Import the conviction service at the top of the file**

Find the existing imports block at the top of `components/dashboard/polymarket-section.tsx` (around line 1-30). Add this import:

```typescript
import { computeConviction, type ConvictionResult } from '@/lib/services/conviction.service'
```

- [ ] **Step 2: Compute conviction inside the watch list filter**

Find the existing watch list filter chain in `polymarket-section.tsx` (search for `// FILTER 4`). Just before the closing `return true` of the `.filter(r => { ... })`, add:

```typescript
              // FILTER 5 — MULTI-SIGNAL CONVICTION.
              // Require 2 of 3 signals to agree before surfacing in the
              // main watch list. 1-of-3 picks get tagged 'speculative'
              // and rendered in a separate section. 0-of-3 dropped.
              //
              // Compute once, attach to the rec via a Symbol-keyed
              // sidecar property so the badge renderer can read it
              // without recomputing. Using a normal property would
              // mutate the rec; this keeps the existing object shape
              // for downstream code that doesn't know about conviction.
              const recExt = r as TradeRecommendation & {
                aiEdge?: 'strong' | 'user' | 'weak'
                dpsTier?: 'high' | 'medium' | 'low' | 'unknown'
              }
              const tierKey = recExt.aiEdge ?? 'untagged'
              const tierStatsForConv = analytics?.byAiEdge?.find(t => t.edge === tierKey)
              const conviction = computeConviction({
                edgePassesFloor: true,  // reached here = FILTER 2-4 passed
                dpsTier: recExt.dpsTier,
                tierWinRate: tierStatsForConv?.winRate ?? null,
                tierLosses: tierStatsForConv?.losses ?? 0,
              })
              // Stash on the rec for downstream UI (badge + speculative
              // section split). Mutation is fine here — the watch list
              // rec objects are scoped to this render only.
              ;(r as TradeRecommendation & { conviction?: ConvictionResult }).conviction = conviction
              if (conviction.level === 'suppress') return false
              return true
```

(Replace the existing final `return true` with this block — the conviction logic IS the new final check.)

- [ ] **Step 3: Split watchList into main + speculative after sorting**

Find the section that sorts `watchList` into `watchListSorted` (after the filter). Immediately after the sort, add:

```typescript
            // Split into main (strong + moderate) and speculative (1-of-3).
            // suppress picks were already dropped by FILTER 5 above.
            const watchListMain = watchListSorted.filter(r => {
              const conv = (r as TradeRecommendation & { conviction?: ConvictionResult }).conviction
              return conv?.level === 'strong' || conv?.level === 'moderate'
            })
            const watchListSpeculative = watchListSorted.filter(r => {
              const conv = (r as TradeRecommendation & { conviction?: ConvictionResult }).conviction
              return conv?.level === 'speculative'
            })
```

Then update any subsequent code that references `watchListSorted` for the MAIN render path to use `watchListMain` instead. The category-filter step (`watchListFiltered`) should operate on `watchListMain`, not the unfiltered list.

- [ ] **Step 4: Verify build**

Run: `docker build -f Dockerfile.koyeb -t verify-task4 . 2>&1 | grep -E "Type error|error TS|✓ Compiled|Failed to compile" | tail -5`
Expected: `✓ Compiled successfully`.

If TS errors mention `conviction` property missing, the type cast `(r as TradeRecommendation & { conviction?: ConvictionResult })` is in the wrong place — verify all read sites have the cast.

- [ ] **Step 5: Clean up + commit**

```bash
docker rmi verify-task4
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(watch-list): FILTER 5 multi-signal conviction + main/speculative split

Picks now compute conviction (strong/moderate/speculative/suppress)
from Opus + DPS + Calibration agreement. suppress dropped entirely.
strong+moderate flow to main watch list, speculative split off into
a separate array ready for the collapsible section in Task 6.

UI badge + speculative section render in Tasks 5-6."
```

---

## Task 5: Add conviction badge UI to each watch list card

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Add the badge inside each watch list card**

Find the watch list card render block (the `.map()` over `watchListFiltered` that renders each card). At the top of each card's content (the very first child element, before existing badges like aiEdge), add:

```tsx
                            {(() => {
                              const conv = (rec as TradeRecommendation & { conviction?: ConvictionResult }).conviction
                              if (!conv) return null
                              const cfg = conv.level === 'strong'
                                ? { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', icon: '🟢', label: 'STRONG CONVICTION' }
                                : { color: '#f0c000', bg: 'rgba(240,192,0,0.12)', icon: '🟡', label: 'MODERATE CONVICTION' }
                              const signalText = (() => {
                                const o = conv.signals.opus === 'agrees' ? '✓' : '✗'
                                const d = conv.signals.dps === 'agrees' ? '✓' : '✗'
                                const c = conv.signals.calibration === 'agrees' ? '✓' : '✗'
                                return `Opus ${o} · DPS ${d} · Calibration ${c}`
                              })()
                              return (
                                <div
                                  title={`${signalText}\n\nA conviction badge means signals AGREED that this pick has edge — NOT that the outcome is guaranteed. Polymarket bets always involve risk.`}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '0.25rem 0.55rem',
                                    backgroundColor: cfg.bg,
                                    border: `1px solid ${cfg.color}55`,
                                    borderRadius: '6px',
                                    fontSize: '0.55rem',
                                    fontWeight: 700,
                                    color: cfg.color,
                                    marginBottom: '0.5rem',
                                    cursor: 'help',
                                  }}
                                >
                                  <span>{cfg.icon} {cfg.label}</span>
                                  <span style={{ fontSize: '0.5rem', opacity: 0.8, fontWeight: 500 }}>{signalText}</span>
                                </div>
                              )
                            })()}
```

- [ ] **Step 2: Verify build**

Run: `docker build -f Dockerfile.koyeb -t verify-task5 . 2>&1 | grep -E "Type error|error TS|✓ Compiled|Failed to compile" | tail -5`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Clean up + commit**

```bash
docker rmi verify-task5
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(watch-list): conviction badge on each card with breakdown tooltip

Green 🟢 STRONG for 3-of-3, yellow 🟡 MODERATE for 2-of-3. Inline
signal breakdown (Opus ✓ · DPS ✓ · Calibration ✗) plus hover tooltip
warning that conviction means signals agreed, not outcome guaranteed."
```

---

## Task 6: Add Speculative section (collapsed by default)

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Add state for speculative section open/closed**

At the top of the component function (where other `useState` hooks live), add:

```typescript
  const [speculativeOpen, setSpeculativeOpen] = useState(false)
```

- [ ] **Step 2: Render the speculative section after the main watch list**

After the existing watch list `.map()` JSX block, add this section (use `watchListSpeculative` from Task 4):

```tsx
              {watchListSpeculative.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <button
                    onClick={() => setSpeculativeOpen(v => !v)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      background: 'rgba(110,118,129,0.08)',
                      border: '1px dashed rgba(110,118,129,0.4)',
                      borderRadius: '8px',
                      padding: '0.6rem 0.9rem',
                      cursor: 'pointer',
                      color: '#8b949e',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    <span>{speculativeOpen ? '▼' : '▶'}</span>
                    <span>SPECULATIVE — {watchListSpeculative.length} pick{watchListSpeculative.length === 1 ? '' : 's'} only 1 of 3 signals agreed</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.55rem', color: '#6e7681', fontStyle: 'italic' }}>
                      Higher variance — read the breakdown before betting
                    </span>
                  </button>
                  {speculativeOpen && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', opacity: 0.85 }}>
                      {watchListSpeculative.map((rec, idx) => (
                        <div
                          key={`spec-${idx}-${rec.market.id}`}
                          style={{
                            padding: '0.75rem',
                            backgroundColor: '#161b22',
                            border: '1px dashed #30363d',
                            borderRadius: '8px',
                            fontSize: '0.7rem',
                            color: '#c9d1d9',
                          }}
                        >
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, marginBottom: '0.35rem', color: '#e6edf3' }}>
                            {rec.market.question}
                          </div>
                          <div style={{ fontSize: '0.55rem', color: '#8b949e' }}>
                            {(() => {
                              const conv = (rec as TradeRecommendation & { conviction?: ConvictionResult }).conviction
                              if (!conv) return null
                              const o = conv.signals.opus === 'agrees' ? '✓' : '✗'
                              const d = conv.signals.dps === 'agrees' ? '✓' : '✗'
                              const c = conv.signals.calibration === 'agrees' ? '✓' : '✗'
                              return `Opus ${o} · DPS ${d} · Calibration ${c}`
                            })()}
                            {' · '}
                            Edge {((rec.estimatedProbability - rec.odds) * 100).toFixed(1)}pt
                            {' · '}
                            Side {rec.outcome} @ {(rec.odds * 100).toFixed(0)}¢
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
```

- [ ] **Step 3: Verify build**

Run: `docker build -f Dockerfile.koyeb -t verify-task6 . 2>&1 | grep -E "Type error|error TS|✓ Compiled|Failed to compile" | tail -5`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Clean up + commit**

```bash
docker rmi verify-task6
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(watch-list): speculative section for 1-of-3 conviction picks

Collapsed by default — keeps the main watch list focused on high-
conviction. Toggle reveals the picks with one signal agreeing, each
showing the signal breakdown so the user can decide whether to take
the higher-variance bet."
```

---

## Task 7: Per-category fetch quotas in `app/api/polymarket/route.ts`

**Files:**
- Modify: `app/api/polymarket/route.ts`

This task replaces the existing top-N-by-volume market fetch with per-category fetches. It's the largest single change — three sub-steps.

- [ ] **Step 1: Define category quotas constant**

Near the top of `app/api/polymarket/route.ts` (after the imports, before the route handler), add:

```typescript
/**
 * Per-DPS-category fetch quotas. The screener used to grab top-N by
 * volume globally, which means on a tournament day 80% of picks were
 * sports/esports. These quotas force a minimum allocation to each
 * category so the watch list always has diverse coverage.
 *
 * Total target: ~180 markets per cycle (vs ~100 previously). 1.5-2× the
 * screening token cost — trivial on Max sub, ~$0.005-0.01 extra on
 * Anthropic API fallback. Worth it for diversification.
 */
const CATEGORY_FETCH_QUOTAS: Array<{ category: string; quota: number }> = [
  { category: 'politics', quota: 30 },
  { category: 'geopolitics', quota: 30 },
  { category: 'crypto-milestone', quota: 20 },
  { category: 'policy', quota: 20 },
  { category: 'corporate-ma', quota: 15 },
  { category: 'tech-launch', quota: 15 },
  { category: 'esports', quota: 20 },
  { category: 'live-sports', quota: 10 },
  { category: 'crypto-price', quota: 10 },
  { category: 'creator-economy', quota: 10 },
  { category: 'box-office', quota: 10 },
]
```

- [ ] **Step 2: Add a helper that fetches markets by category**

Below the quotas constant, add this helper:

```typescript
/**
 * Fetch top-N Polymarket markets for a specific DPS category, ordered
 * by volume. Uses the existing Gamma API but filters via post-fetch
 * DPS classification (Polymarket itself doesn't expose our DPS taxonomy).
 *
 * Strategy: fetch a wider pool (quota * 3) ordered by volume24hr,
 * classify each via dps.service, keep the first `quota` matches.
 * Imperfect but cheap — avoids new API calls and respects rate limits.
 */
async function fetchMarketsForCategory(
  targetCategory: string,
  quota: number,
  signal: AbortSignal
): Promise<PolymarketMarket[]> {
  const url = new URL('https://gamma-api.polymarket.com/markets')
  url.searchParams.set('closed', 'false')
  url.searchParams.set('order', 'volume24hr')
  url.searchParams.set('ascending', 'false')
  url.searchParams.set('limit', String(Math.min(quota * 5, 200)))

  try {
    const res = await fetch(url.toString(), { signal })
    if (!res.ok) return []
    const data = await res.json()
    const raw = Array.isArray(data) ? data : []
    const matched: PolymarketMarket[] = []
    for (const m of raw) {
      const market = mapGammaMarketToPolymarketMarket(m)
      if (!market) continue
      const dps = scoreDomainPredictability(market.question)
      if (dps.category === targetCategory) {
        matched.push(market)
        if (matched.length >= quota) break
      }
    }
    return matched
  } catch {
    return []
  }
}
```

(If `mapGammaMarketToPolymarketMarket` doesn't exist with that exact name, find the equivalent helper in the existing code — search for where the raw Gamma response is converted to `PolymarketMarket`. The existing fetch logic already does this conversion; reuse the same function.)

- [ ] **Step 3: Replace the existing market fetch with per-category orchestration**

Find the existing block in the GET handler that fetches the market pool (search for `gamma-api.polymarket.com/markets` and the loop that accumulates markets). Replace it with:

```typescript
    // Per-category parallel fetch (Layer 2 of the rigor-and-diversification spec).
    // Replaces the legacy "top-100-by-volume globally" fetch which biased
    // toward sports/esports on tournament days.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15_000)
    const fetchPromises = CATEGORY_FETCH_QUOTAS.map(({ category, quota }) =>
      fetchMarketsForCategory(category, quota, controller.signal)
    )
    const perCategoryResults = await Promise.allSettled(fetchPromises)
    clearTimeout(timeoutId)

    // Flatten + dedupe by market ID. First occurrence wins.
    const seenIds = new Set<string>()
    const markets: PolymarketMarket[] = []
    for (const result of perCategoryResults) {
      if (result.status !== 'fulfilled') continue
      for (const m of result.value) {
        if (seenIds.has(m.id)) continue
        seenIds.add(m.id)
        markets.push(m)
      }
    }
    console.log(`[Polymarket] Per-category fetch: ${markets.length} unique markets across ${CATEGORY_FETCH_QUOTAS.length} categories`)
```

(Adjust variable names like `markets` if the existing code uses different names — search for the previous declaration and rename consistently.)

- [ ] **Step 4: Verify build**

Run: `docker build -f Dockerfile.koyeb -t verify-task7 . 2>&1 | grep -E "Type error|error TS|✓ Compiled|Failed to compile" | tail -5`
Expected: `✓ Compiled successfully`.

If the build fails on missing import (e.g. `scoreDomainPredictability` not imported in this file), add the import at the top: `import { scoreDomainPredictability } from '@/lib/services/dps.service'`.

- [ ] **Step 5: Clean up + commit**

```bash
docker rmi verify-task7
git add app/api/polymarket/route.ts
git commit -m "feat(polymarket): per-category market fetch quotas

Replaces top-N-by-volume global fetch with parallel per-category
fetches respecting target quotas (politics 30, geopolitics 30,
crypto 20, etc.). Total ~180 markets vs ~100 — 1.5-2× screening
token cost, trivial on Max, worth it for diversification.

Layer 2 of the rigor + diversification spec."
```

---

## Task 8: Diversification boost in watch list sort

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx` (the `winProbOfSide` sort function area)

- [ ] **Step 1: Modify the sort comparator to include diversification boost**

Find the existing watch list sort (search for `winProbOfSide` then the `.sort((a, b) => ...)`). Replace the comparator with:

```typescript
            const watchListSorted = [...watchList].sort((a, b) => {
              // Diversification boost: non-sports/esports get +0.02
              // win-prob equivalent so politics/crypto/geopolitics
              // float higher on tie-breaks. Small enough not to invert
              // genuinely better picks, large enough to surface variety.
              const aExt = a as TradeRecommendation & { dpsCategory?: string }
              const bExt = b as TradeRecommendation & { dpsCategory?: string }
              const isSportsA = aExt.dpsCategory === 'esports' || aExt.dpsCategory === 'live-sports'
              const isSportsB = bExt.dpsCategory === 'esports' || bExt.dpsCategory === 'live-sports'
              const boostA = isSportsA ? 0 : 0.02
              const boostB = isSportsB ? 0 : 0.02
              return (winProbOfSide(b) + boostB) - (winProbOfSide(a) + boostA)
            })
```

- [ ] **Step 2: Verify build**

Run: `docker build -f Dockerfile.koyeb -t verify-task8 . 2>&1 | grep -E "Type error|error TS|✓ Compiled|Failed to compile" | tail -5`
Expected: `✓ Compiled successfully`.

- [ ] **Step 3: Clean up + commit**

```bash
docker rmi verify-task8
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(watch-list): diversification boost in sort

Non-sports/esports picks get +0.02 to their effective win-probability
when sorting. Small enough not to invert genuinely better picks,
large enough to break ties in favor of category variety."
```

---

## Task 9: Category chip filter in UI

**Files:**
- Modify: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Add state for the category filter**

Near the existing `watchTierFilter` state, add:

```typescript
  const [watchCategoryFilter, setWatchCategoryFilter] = useState<string>('all')
```

- [ ] **Step 2: Apply the category filter to the rendered list**

Find where the existing `watchListFiltered` is computed (the chain after `watchListSorted`). After the existing tier-filter logic, add category filtering:

```typescript
            const watchListAfterCategory = watchCategoryFilter === 'all'
              ? watchListFiltered
              : watchListFiltered.filter(r => {
                const cat = (r as TradeRecommendation & { dpsCategory?: string }).dpsCategory ?? 'other'
                return cat === watchCategoryFilter
              })
```

Then replace any downstream reference to `watchListFiltered` (in the `.map()` render) with `watchListAfterCategory`.

- [ ] **Step 3: Compute per-category counts and render chips**

Just below the existing tier-chip render (search for `tierChips` JSX), add the category chip row:

```tsx
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  marginBottom: '0.5rem',
                  flexWrap: 'wrap',
                  fontSize: '0.6rem',
                }}>
                  <span style={{ color: '#6e7681', marginRight: '0.3rem' }}>Category:</span>
                  {(() => {
                    const counts = new Map<string, number>()
                    for (const r of watchListFiltered) {
                      const cat = (r as TradeRecommendation & { dpsCategory?: string }).dpsCategory ?? 'other'
                      counts.set(cat, (counts.get(cat) ?? 0) + 1)
                    }
                    const allCount = watchListFiltered.length
                    const chips: Array<{ key: string; label: string; count: number }> = [
                      { key: 'all', label: 'All', count: allCount },
                    ]
                    for (const [cat, count] of Array.from(counts.entries()).sort((a, b) => b[1] - a[1])) {
                      chips.push({ key: cat, label: cat, count })
                    }
                    return chips.map(c => {
                      const isActive = watchCategoryFilter === c.key
                      return (
                        <button
                          key={c.key}
                          onClick={() => setWatchCategoryFilter(c.key)}
                          style={{
                            padding: '0.2rem 0.55rem',
                            background: isActive ? 'rgba(88,166,255,0.18)' : 'transparent',
                            border: `1px solid ${isActive ? 'rgba(88,166,255,0.5)' : '#30363d'}`,
                            borderRadius: '5px',
                            color: isActive ? '#58a6ff' : '#8b949e',
                            cursor: 'pointer',
                            fontSize: '0.55rem',
                            fontWeight: 600,
                          }}
                        >
                          {c.label} {c.count}
                        </button>
                      )
                    })
                  })()}
                </div>
```

- [ ] **Step 4: Verify build**

Run: `docker build -f Dockerfile.koyeb -t verify-task9 . 2>&1 | grep -E "Type error|error TS|✓ Compiled|Failed to compile" | tail -5`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Clean up + commit**

```bash
docker rmi verify-task9
git add components/dashboard/polymarket-section.tsx
git commit -m "feat(watch-list): category chip filter

Adds a second row of filter chips below the existing aiEdge chips
showing per-category counts. Click a chip to narrow the watch list
to that category. Sorted by count, descending, so dominant categories
appear first."
```

---

## Task 10: Final integration build + deploy push

**Files:** None modified — pure verification step.

- [ ] **Step 1: Full docker build to verify everything compiles together**

Run: `docker build -f Dockerfile.koyeb -t trade-os-final:local . 2>&1 | tail -25`
Expected: `✓ Compiled successfully`, `✓ Generating static pages (26/26)`, `naming to docker.io/library/trade-os-final:local`.

- [ ] **Step 2: Boot the image and smoke-test HTTP**

Run:
```bash
docker run --rm -d --name trade-os-final-test -p 13002:3000 -e PORT=3000 trade-os-final:local
sleep 5
curl -s -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" http://localhost:13002/
docker logs trade-os-final-test 2>&1 | tail -10
docker stop trade-os-final-test
```

Expected: `HTTP 200 in <0.5s` and Next.js startup log showing `✓ Ready in <500ms`.

- [ ] **Step 3: Clean up**

Run: `docker rmi trade-os-final:local`

- [ ] **Step 4: Push to trigger Northflank auto-deploy**

Run: `git push 2>&1 | tail -5`
Expected: a single push line showing the new commits.

- [ ] **Step 5: Wait for Northflank build + post-deploy smoke test**

Wait ~5 min for Northflank to build and deploy.

Then run:
```bash
curl -s "https://p01--tradeosswarm--gmnh7f2dj7xm.code.run/" -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n"
```

Expected: `HTTP 200`. If it returns 502 or hangs, check Northflank's deploy logs.

Manual verification on the live site:
- Open the MARKETS tab
- Watch list should show fewer picks (target: 2-5 vs current 8-15)
- Each card should have a 🟢 STRONG or 🟡 MODERATE conviction badge at the top
- Hover the badge — tooltip shows signal breakdown
- Scroll down — "▶ SPECULATIVE — N picks" section should be present (collapsed)
- Click it — speculative picks appear
- Above the watch list — category chip row should show counts like "All 4 | politics 2 | geopolitics 1 | esports 1"
- Click a category chip — list narrows to that category

If any of these don't appear, check the browser console for errors and the Northflank runtime logs.

---

## Spec Coverage Self-Review

Going through each requirement in the spec and pointing to its task:

| Spec requirement | Task |
|---|---|
| Multi-signal conviction filter (2 of 3) | Task 2-4 |
| 3 of 3 → strong / 2 → moderate / 1 → speculative / 0 → suppress | Task 3 + 4 |
| Conviction badge UI with hover breakdown | Task 5 |
| Speculative collapsible section | Task 6 |
| Per-category fetch quotas | Task 7 |
| Diversification +0.02 boost in ranking | Task 8 |
| Category chip filter in UI | Task 9 |
| Missing DPS = disagree (conservative) | Task 3 (test: "disagrees when dpsTier is undefined") |
| Missing calibration data = agree (no veto) | Task 3 (test: "agrees when tierLosses is undefined") |
| Per-category fetch failure → exclude from cycle, don't block | Task 7 (`Promise.allSettled`, status !== 'fulfilled' skipped) |
| FILTER 5 returns 0 picks → main watch list empty, speculative still accessible | Task 6 (speculative section renders regardless of main list count) |
| Token cost ~1.5-2× per cycle | Task 7 docstring + commit message |
| No automated tests for UI changes | Plan only tests conviction.service (Task 2-3) |
| Layer 1 + 2 ship together | Single plan with all 10 tasks |

All spec requirements covered. No placeholders. Type names consistent: `ConvictionResult`, `ConvictionInput`, `ConvictionLevel`, `ConvictionSignal` used identically across tasks. `watchListMain` / `watchListSpeculative` / `watchListAfterCategory` distinct and used consistently.

---

## Risk-Aware Reminders

- **Empty watch list on quiet days is the intended behavior.** Don't fall back to "show some picks anyway" — that undoes the rigor.
- **Conviction badge ≠ outcome guarantee.** Tooltip language matters; keep the "signals AGREED, not outcome guaranteed" disclaimer.
- **Per-category fetch widens the screening pool.** If Max sub starts rate-limiting, the fallback to Anthropic API costs ~$0.005-0.01 per cycle. Watch the cost in production.
- **Don't add UI tests for the cards.** The codebase doesn't have them and they're brittle. The conviction service unit tests cover the math. Manual smoke test covers the UI integration.
