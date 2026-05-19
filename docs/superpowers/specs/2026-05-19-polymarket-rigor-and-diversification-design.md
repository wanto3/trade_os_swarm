# Polymarket Recommendation Rigor + Market Diversification

**Date:** 2026-05-19
**Status:** Design approved, awaiting implementation plan
**Author:** Brainstormed with user (Polymarket trader)

## Problem

The user lost most of their Polymarket portfolio acting on the dashboard's
recommendations. Two compounding issues:

1. **Weak rigor.** A pick reaches the watch list when Opus alone calls an
   edge. One model, one signal. False positives are common — Opus
   confidently calls a coin flip an edge, the user bets, the bet loses.
   The MOUZ-shaped underdog problem we've been chasing all session is a
   specific instance of this broader pattern.

2. **Narrow coverage.** The recommendations skew heavily toward sports
   and esports because Polymarket's volume skews that way on most days.
   The user wants opportunities surfaced in politics, crypto-milestone,
   geopolitics, policy, corporate-M&A, and tech-launch markets too —
   categories where Opus has stronger training-data edge per the
   aiEdge tier work already in place.

Existing recursive-learning fixes (tier-aware underdog ladder, calibration
auto-tighten) address one slice of the problem but don't change either
the conviction floor or the category mix.

## Goals

- Require **multi-signal agreement** before a pick reaches the top-level
  watch list. Reduce false-positive rate at the cost of fewer picks.
- Surface **per-card conviction breakdown** so the user sees WHY a pick
  passed: which signals agreed, which disagreed. Builds trust.
- Force **category diversification** by quota — top-N markets fetched
  from each category, not top-N overall — so the watch list isn't 80%
  esports just because there's a tournament that day.
- Add **category filter chips** in the UI so the user can see the
  category mix at a glance and filter to one.

## Non-Goals

- Auto-trading. Recommendations remain user-actionable, not auto-placed.
- LLM prompt rewrite. Opus screening logic stays as-is; we add filters
  around it, not inside it.
- New data sources. Polymarket Gamma + Data APIs remain the only feeds.
- Real-money execution. Still paper trades + manual placement.

## Architecture

### Layer 1: Multi-Signal Conviction Filter

A new `FILTER 5` in `components/dashboard/polymarket-section.tsx`,
applied after the existing FILTER 1-4 (no-edge favorite, tier-aware
underdog ladder, calibration override).

**Three signals, require any 2 of 3 to agree:**

| Signal | "Agrees" when |
|---|---|
| **Opus edge** | Edge passes the tier-aware floor already enforced by FILTER 2-4 |
| **DPS tier** | Domain-predictability score returns `high` or `medium` (not `low`) |
| **Calibration** | The pick's `aiEdge` tier (`strong` / `user` / `weak` / `untagged`) shows a historical win rate ≥ 50% in `analytics.byAiEdge`, OR fewer than 3 resolved bets in that tier (no negative track record yet to veto on) |

**Outcomes:**

- **3 of 3 agree** → pick surfaces in main watch list with `🟢 Strong conviction` badge
- **2 of 3 agree** → pick surfaces in main watch list with `🟡 Moderate conviction` badge
- **1 of 3 agrees** → pick demoted to a separate "Speculative" section
  (collapsed by default, toggleable)
- **0 of 3 agree** → pick suppressed entirely (FILTER 5 returns false)

**Conviction badge UI:** appears at top of each watch list card. Hover
tooltip shows the breakdown: `Opus ✓ · DPS High ✓ · Calibration 4W/2L
(66%) ✓` — so the user can audit which signals are doing the work.

### Layer 2: Per-Category Fetch Quotas + Diversification Boost

Replace the current "top-N by volume" market fetch in
`app/api/polymarket/route.ts` with a per-category fetch.

**Categories and quotas (target counts per cycle):**

| DPS category | Quota | Rationale |
|---|---|---|
| `politics` | 30 | Opus strong here, often high-conviction edges |
| `geopolitics` | 30 | Opus strong, longer-horizon picks |
| `crypto-milestone` | 20 | Opus strong, you have personal interest |
| `policy` | 20 | Opus reasonable, calibration data thin |
| `corporate-ma` | 15 | Opus strong, slow-moving |
| `tech-launch` | 15 | Opus strong, specific catalysts |
| `esports` | 20 | Volume-heavy on Polymarket but high noise |
| `live-sports` | 10 | Opus weak, included only to surface arbitrage |
| `crypto-price` | 10 | Opus weak, included for awareness |
| Other (`creator-economy`, `box-office`, etc.) | 10 each | Long tail |

Per-category fetch issued in parallel. Failures in any one category
fall back to global top-N (best effort, don't block the cycle).

**Diversification boost in ranking:** when sorting the final watch list
by win-probability (existing logic), add a small bonus (+0.02) for
non-sports categories. Small enough to not invert genuinely better
picks, large enough to break ties in favor of diversification.

**Category chip filter in UI:** extend the existing aiEdge tier chip
filter (`All | 🤖 AI Strong | 👤 Your Edge | ⚠️ Limited`) with a
second row of category chips (`All | Politics 3 | Crypto 2 | Geopolitics
1 | Sports 4 | Esports 0`). Counts reflect the current watch list.

## Components Affected

### `app/api/polymarket/route.ts`

- Replace single-fetch with `fetchByCategory()` that issues parallel
  requests per category with target quotas.
- After fetching, dedupe by market ID across categories.
- Pass the per-market DPS category through to the screening service
  (already happens via `dpsInfo` map; verify nothing breaks with the
  larger market pool).

### `components/dashboard/polymarket-section.tsx`

- Add **FILTER 5** in the watch list filter chain (line ~1801) computing
  signal agreement.
- Add **conviction badge** rendering at top of each card. Reuse the
  visual language of the existing aiEdge badges.
- Add **"Speculative" collapsible section** below the main watch list
  for 1-of-3 picks.
- Add **category chip filter** below the existing aiEdge chip row.
- Compute counts for each chip from the filtered watch list.

### `lib/services/dps.service.ts`

- No changes — already returns `category` and `tier`. Verify
  `scoreDomainPredictability` handles the wider category mix correctly.

### `lib/services/polymarket-screening.service.ts`

- No changes. Screening logic operates per-market; doesn't care about
  category mix.

## Data Flow

1. **Fetch** (`app/api/polymarket/route.ts`):
   per-category parallel fetches → dedupe → market pool (~150-200 markets).
2. **Classify**: DPS service tags each with category + tier (already exists).
3. **Screen**: send to Opus → returns edges, conviction estimates.
4. **Filter** (`polymarket-section.tsx` watch list filter chain):
   - FILTER 1: drop "no-edge extreme favorite" noise (existing)
   - FILTER 2: underdog ≥5pt edge (existing)
   - FILTER 3: extreme favorite ≥3pt edge (existing)
   - FILTER 4: tier-aware underdog ladder + calibration override (existing)
   - **FILTER 5 (new): multi-signal conviction**
5. **Sort**: by win-probability of suggested side (existing) + diversification boost (new).
6. **Render**: watch list cards with conviction badges + speculative section + category chips.

## Error Handling

- **Per-category fetch failure**: log warning, exclude that category
  from this cycle. Don't block the whole watch list.
- **Missing DPS classification**: treat as `general / unknown` → DPS
  signal counts as "disagree" (conservative).
- **Missing calibration data** (tier never resolved): treat as
  "agree by default" (no negative track record means no veto).
- **FILTER 5 returns 0 picks** (quiet day): watch list shows empty
  state with explanation: "No high-conviction picks right now. Check
  the Speculative section for single-signal opportunities."

## Migration / Rollout

- **No data migration needed.** Existing positions and calibration
  unchanged.
- **Default state on first deploy**:
  - Layer 1 (FILTER 5) active immediately.
  - Speculative section starts collapsed.
  - Category chips appear after first screening cycle completes.
- **Per-category quotas active on first cycle**.
- **Reversibility**: filters and quotas live in code constants. If the
  user wants to revert, comment out FILTER 5 and restore the original
  fetch logic. No state migration.

## Token Cost Implications

- **Screening tokens per cycle increase ~1.5-2×** because we send more
  markets (~150-200 vs ~100). On Max sub: $0. On Anthropic API fallback:
  ~$0.005-0.01 extra per cycle. Trivial.
- **No new LLM calls** in the filter or conviction logic. Pure JS math
  + disk reads.
- **Calibration recompute** still triggered by resolvePosition() as
  already shipped — no change.

## Testing

- **Manual smoke test on Northflank deploy:**
  - Verify watch list count drops (target: 2-5 picks vs current 8-15).
  - Verify category mix shifts (target: ≤50% sports+esports vs current ~80%).
  - Verify conviction badges render with breakdown tooltips.
  - Verify speculative section toggles open/closed.
  - Verify category chip filter narrows the list correctly.
- **No automated tests in this pass.** Adding vitest coverage for the
  conviction logic is a follow-up.

## What Could Go Wrong (Risks)

- **Empty watch list on quiet days**. Mitigated by the speculative
  section being one click away.
- **User over-trusts the conviction badge.** A 🟢 Strong conviction pick
  can still lose. The badge means signals AGREED on edge existence, not
  that the outcome is guaranteed. Tooltip language must be careful.
- **Calibration agreement is loose** for new tiers (no losses yet =
  pass). Possible to launder weak picks through untested categories.
  Acceptable trade-off — alternative is "no calibration data → veto" which
  blocks all new categories forever.
- **Per-category quotas may starve sports markets on busy days.**
  Acceptable — the whole point is to stop sports/esports dominating.

## Success Criteria

- Watch list shows ≥3 distinct categories on most cycles (vs current
  1-2).
- Conviction breakdown is visible and tooltips are readable.
- Speculative section accessible but visually de-emphasized.
- After 1 week of running, calibration data shows hit rate improvement
  in 'user' tier (esports) compared to baseline pre-shipment.
- User reports either "I trust this more" OR "I want X changed" —
  feedback loop continues.

## Out of Scope (Future Work)

- Auto-trader integration with FILTER 5 (auto-trader currently bypasses
  these filters; that's a separate, larger change).
- Conviction-weighted Kelly sizing (3-of-3 picks get larger suggested
  stake than 2-of-3).
- Surfacing active auto-lessons in the dashboard UI (separate spec).
- Per-category calibration breakdown (currently calibration is per
  aiEdge tier, not per DPS category).

## Implementation Note

Layer 1 (conviction filter) and Layer 2 (category quotas + boost) are
tightly coupled — they reinforce each other. Layer 1 without Layer 2
risks an empty watch list (rigor with no new categories to find edges
in). Layer 2 without Layer 1 surfaces more low-quality picks across
more categories. **Ship together, not separately.**
