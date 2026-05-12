# Smarter Decision UX — Design Spec

**Date:** 2026-05-12
**Owner:** wanto3
**Status:** Approved (brainstorm), pending implementation plan

## Problem

The dashboard surfaces a lot of correct trading signals, but the user
struggles to act on them because:

1. **Indicators are jargon-dense.** Kelly fraction, EV%, edge pp, DPS,
   conviction score, payout multiple, AI Edge tier, confidence high/medium/low —
   each is correctly computed but their **meaning** isn't visible. A lay-person
   pattern of thinking ("Should I bet? How much? Why might it lose?") doesn't
   map cleanly to the numeric grid.
2. **No clear "what should I do right now" answer.** Five lanes (closing-soon,
   watch list, paper trades, influencer, lessons) all compete for attention.
   With a $4 bankroll the user can place at most 3-4 bets/day, so the dashboard
   should rank actions by urgency × edge × bankroll fit, not surface all 30+
   eligible picks equally.
3. **No bear case.** Every recommendation argues for the bet; nothing forces
   the model to argue against it. Users lose on picks the model overcommitted
   to because the bull case was unopposed.
4. **No bankroll guard rails.** Nothing stops the user from clicking "Place
   $1" on a $4 bankroll (25% concentration) on a medium-confidence pick where
   Kelly says 12% max. One mistake compounds slowly back.

The result: the user can see edge, can compute size, but constantly second-
guesses *when* to enter, *when not to*, and *which* of 30 eligible picks
should actually consume today's stake budget.

## Goals

1. **Plain-English on every indicator.** Every numeric metric in the app
   shows its value AND a one-line explanation underneath. No jargon stands
   alone. (User chose option "B" — keep numbers, add subtitles.)
2. **Restructure pick cards around decisions, not metrics.** A "Decision Card"
   answers in order: should I enter, why not, how much, when, has this
   category been right before.
3. **Single daily action plan.** Top of dashboard shows what to do today,
   ranked by urgency, with bankroll context.
4. **Hard bankroll guard.** Bet placement above Kelly's safe cap is
   intercepted with a recommended reduction.

## Non-Goals

- Cross-pick **correlation warnings** ("this is your 3rd box-office bet
  this weekend"). Deferred — the user already sees their open positions
  list; only worth building if it becomes a real failure mode.
- A **separate calibration tab**. The only useful calibration signal —
  "have I been right in this category before" — lives on the Decision Card
  as a one-line track record footer. No need for a dedicated surface.
- Changes to the **underlying screening pipeline** (Opus / DPS / categories).
  Those are working; this spec is a presentation + decision-support layer
  on top of existing data plus one prompt addition (bear case).

## Components

### 1. Plain-English Indicator Layer

Every numeric indicator in the app gets a subtitle. Examples:

| Term shown | Subtitle |
|---|---|
| `Kelly 10%` | suggested bet size for your bankroll |
| `Edge +12pt` | model thinks YES is 12 points more likely than market prices |
| `Payout 4.2x` | $1 wins $4.20 if right |
| `Confidence: high` | model is sure of direction *and* magnitude |
| `Conviction 78` | composite score: research quality × time × structure |
| `DPS 0.84` | how reliable this category's signal has been historically |
| `AI Edge: 🤖 Strong` | model has high-quality grounding (citable facts) |
| `AI Edge: 👤 Your scene` | model is unsure, but you've shown edge in this category |
| `AI Edge: ⚠️ Limited` | model has weak grounding — only bet if you have personal conviction |
| `Closes in 8h ⏰` | last-mile timing — prices move fastest here |

**Implementation:** Centralize subtitles in a `lib/decision-glossary.ts`
module exporting one map keyed by indicator name. Every dashboard surface
reads from this map so subtitles stay consistent across cards / tabs.

### 2. Decision Card

Replaces the current pick card layout on:

- Polymarket main lane (`closingSoonOpportunities`)
- Watch list (`closingTodayAnalyzed`)
- Hot Now / Top 24hr picks
- Paper Trades (open position view)

**Shape:**

```
✅ BUY YES on "<question>"

Why:        <1-2 sentence bull case — actual reasoning, not generic>
Why not:    <1-2 sentence bear case — forced from the model>
How much:   $0.40 (10% of bankroll — Kelly says safe here)
Window:     Closes in 8h ⏰ — price refreshes every visit
Track:      3W/1L on crypto-threshold picks (75% over last 4)

[Place $0.40]  [Skip]  [View on Polymarket]
```

Each line shows the data PLUS the technical breakdown beneath/on hover
(per the B choice for indicators).

**Data additions:**

- **Bear case field on every screening result.** Prompt extension in
  `polymarket-screening.service.ts` — adds `"reasoningAgainst": "1-2
  sentence bear case"` to the JSON contract. The screening output already
  carries `reasoning` (bull); we mirror it with `reasoningAgainst`.
- **Category track record aggregation.** New service:
  `lib/services/category-stats.service.ts`. Reads resolved positions from
  `data/polymarket-portfolio.json`, groups by category (derived from
  question text via existing classifier), produces
  `{ category: string, wins: number, losses: number, hitRate: number, lastN: array }`.
  Surfaced on each Decision Card by matching the rec's category. Hide
  footer if N < 4 (insufficient data).

### 3. Daily Action Plan

A new section at the top of the dashboard, above all existing lanes.

**Shape:**

```
TODAY · MAY 12 · You have $4.00 to deploy

1. ⚡ Place $0.40 on BTC>$80k    (closes 6pm · +14pt edge · high conf)
2. ⚡ Place $0.30 on NBA spread   (closes 8pm · +9pt edge · medium)
3. ✋ Resolve MK2 35-40m bucket  (closed yesterday, not yet booked)
4. 📚 Log lesson on Real Madrid  (would improve next Sunday's picks)

Bankroll: $4.00 free · $0 locked in open positions
Today's risk cap: $1.20 (3 max picks @ 10% each)
```

**Ranking rules:**

1. **🚫 Urgent resolution** first (positions whose market has settled but
   we haven't booked yet — money is locked until done).
2. **⚡ High-edge picks** closing within next 24h, ranked by
   `edge × confidenceMultiplier × bankrollFit`.
   - `confidenceMultiplier`: high=1.0, medium=0.7, low=0.4.
   - `bankrollFit`: 1.0 if stake ≤ Kelly cap, decays linearly to 0 at 3× cap.
3. **📚 Lesson prompts**: if there's a resolved-loss position from the
   last 48h with no `lesson` logged yet, surface a prompt — closes the
   feedback loop without burying it in a separate tab.
4. Cap at 5 items; surface "+N more" if backlog longer.

**Implementation:** New component `components/dashboard/daily-action-plan.tsx`.
Pulls from existing endpoints (`/api/polymarket`, `/api/polymarket/positions`,
`/api/lessons`) — no new backend.

### 4. Bankroll Guard

Hooks into every `[Place]` click across the app. Before posting to
`/api/polymarket/place`, the guard checks:

```
stake > kellyCap(confidence, bankroll)
   ? interceptWithDialog(suggestedReduction)
   : proceed()
```

`kellyCap` lookup table (% of free bankroll):

| Confidence | Max % | Rationale |
|---|---|---|
| high | 15% | Opus is sure of direction + magnitude |
| medium | 10% | Directional but not airtight |
| low | 5% | Mostly vibes |
| watch-list / override | 3% | User is taking the bet despite Opus skipping |

Dialog copy:

> "$1.00 is **25%** of your $4.00 bankroll. Kelly says max **12%** ($0.48)
> on a medium-confidence pick like this. Reduce to $0.48? [Yes — Use Kelly]
> [Override — I'm sure]"

The override path is one-click but logs to console for retrospection.

**Implementation:** `lib/decision-guard.ts` exporting `enforceBankrollCap`
(returns `{ action: 'proceed' | 'suggest' | 'block', suggested: number, reason: string }`).
All current placement UIs call it before fetching `/api/polymarket/place`.
The `place` API endpoint also calls it server-side as a second line of
defense.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ components/dashboard/                                    │
│   daily-action-plan.tsx   ← NEW: top-of-dash summary    │
│   decision-card.tsx        ← NEW: reusable card         │
│   polymarket-section.tsx   ← uses DecisionCard          │
│                                                          │
│ lib/                                                     │
│   decision-glossary.ts     ← NEW: jargon → plain-en map │
│   decision-guard.ts        ← NEW: bankroll cap enforcer │
│   services/                                              │
│     category-stats.service.ts  ← NEW: win/loss by cat   │
│     polymarket-screening.service.ts                     │
│       (prompt extended w/ reasoningAgainst)             │
│                                                          │
│ app/api/                                                 │
│   polymarket/place/route.ts                              │
│     (server-side bankroll cap as second defense)        │
└─────────────────────────────────────────────────────────┘
```

**Data flow:**

```
Polymarket pipeline → screening (with bear case) → rec object
  → DecisionCard renders {bull, bear, kellySize, categoryStats}
  → user clicks Place → decision-guard → /api/polymarket/place
```

The Daily Action Plan is a pure composition of existing endpoint data —
no new state, no new persistence.

## Phasing

Implementation order optimizes for "ship value early, no big-bang":

**Phase 1 — Plain-English layer** (cheapest, no model change)
- Build `decision-glossary.ts`
- Add subtitles under each indicator across all dashboard surfaces:
  `polymarket-section.tsx` (main lane, watch list, paper trades tabs),
  `influencer-insights.tsx` (YouTube/IG/Discord cards), and the
  bankroll/portfolio header
- Ship + verify

**Phase 2 — Bear case prompt**
- Extend `polymarket-screening.service.ts` JSON contract
- Update batched-screening prompt to require `reasoningAgainst`
- Wire `reasoningAgainst` through `LLMMarketAnalysis` → `TradeRecommendation`
- Display alongside existing reasoning on cards (still old layout)

**Phase 3 — Decision Card component**
- Build `decision-card.tsx` consuming `{rec, categoryStats, bankroll}`
- Replace inline card markup in main lane + watch list
- Keep advanced details under "Show details" toggle

**Phase 4 — Category stats**
- Build `category-stats.service.ts`
- Surface `track` line on Decision Card (hide if N < 4)

**Phase 5 — Daily Action Plan**
- Build `daily-action-plan.tsx`
- Add to dashboard top
- Wire ranking algorithm

**Phase 6 — Bankroll Guard**
- Build `decision-guard.ts`
- Hook into all `[Place]` paths client-side
- Add server-side enforcement in `/api/polymarket/place`

Each phase is independently shippable.

## Out of Scope / Future Work

- Correlation/concentration warnings across open positions
- Cross-asset risk (crypto trading section, when built)
- Onboarding tour explaining each surface to first-time users
- A/B testing copy variants on the plain-English subtitles
- Mobile-specific layout (current responsive shrink suffices)

## Open Questions

None outstanding — answered in brainstorm:
- Indicator presentation style → **B** (numbers + subtitle)
- Calibration as own tab → **No** (lives on Decision Card)
- Correlation warnings → **Deferred** (out of scope)
