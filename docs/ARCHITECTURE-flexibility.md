# Architecture — Recursive Improvement + Model Swap

This document confirms the two non-negotiables baked into the system:
the algorithm **gets smarter over time**, and the **LLM provider can be
swapped** without code changes.

## 1. Recursive Improvement Loop

Every Polymarket sync runs the full closed loop. The system genuinely
gets smarter with each new resolved position.

```
┌──────────────────────────────────────────────────────────────────┐
│  position resolves on-chain  (Polymarket settles)                │
│                          │                                        │
│                          ▼                                        │
│  /api/portfolio/import-from-address sync (5-min auto-tick)        │
│                          │                                        │
│                          ▼                                        │
│  computeCalibration() — per-tier W/L stats                       │
│    output → data/calibration-stats.json                          │
│                          │                                        │
│                          ▼                                        │
│  emitAutoLessons() — system writes synthetic lessons             │
│    pattern: 0W/≥3L          → "default skip {tier}"              │
│    pattern: <30% hit, ≥4    → "heavy skepticism"                 │
│    pattern: ≥70% hit, ≥4    → "trust apparent edges"             │
│    output → data/lessons-learned.json                            │
│                          │                                        │
│                          ▼                                        │
│  next screenMarketsBatch() call assembles the prompt:             │
│    + user-curated lessons (lessons-learned.service)              │
│    + auto-generated lessons (calibration → emitAutoLessons)      │
│    + objective calibration block (getCalibrationPromptBlock)     │
│    + anti-fabrication guardrails (already in prompt)             │
│    + regional-politics calibration (already in prompt)           │
│                          │                                        │
│                          ▼                                        │
│  Opus generates new picks with full historical context           │
│                          │                                        │
│                          ▼                                        │
│  applySafetyRules() — server-side post-processing:                │
│    + reasoningContradictsEstimate() — strip self-contradictions  │
│    + fabrication clamp on short-reasoning large-edge claims      │
│                          │                                        │
│                          ▼                                        │
│  isTopTierEsports() — tier-aware user-edge classification         │
│                          │                                        │
│                          ▼                                        │
│  picks surface on dashboard, user places some,                    │
│  positions eventually resolve → loop back to step 1               │
└──────────────────────────────────────────────────────────────────┘
```

**Key files:**

- `lib/services/calibration.service.ts` — `computeCalibration` +
  `emitAutoLessons` (the auto-learning brain)
- `lib/services/lessons-learned.service.ts` — lesson store (manual +
  auto, same schema)
- `lib/services/polymarket-screening.service.ts` —
  `reasoningContradictsEstimate` (catches Opus contradicting itself)
  + fabrication clamp + prompt assembly
- `lib/services/esports-classifier.ts` — tier-aware esports
  classification, used both at screening time and in calibration
- `app/api/portfolio/import-from-address/route.ts` — orchestrates the
  full loop after every Polymarket sync

**What "recursive" means here:**

Each new resolved position feeds back into how Opus reasons about
future picks. No human-in-the-loop required for the basic adjustments
(the system writes its own lessons). Manual lessons (`/api/lessons`
POST) still work — they just sit alongside auto-lessons in the same
prompt block.

**Persistence today vs durable:**

State today lives in `data/*.json` on Render's ephemeral disk —
calibration + lessons survive within a deploy lifecycle but get wiped
on redeploy. Because the on-chain position history is durable, every
sync after a redeploy re-derives calibration + auto-lessons within
seconds, so the practical impact is minimal.

For true cross-deploy durability: the Phase B GitHub-as-DB layer in
`docs/superpowers/specs/2026-05-12-polymarket-account-mirror-design.md`
moves the lesson + calibration history into a separate orphan
GitHub repo (the algo-history repo we already created). When that
ships, learning truly persists across infrastructure changes.

## 2. LLM Provider Swap

The screening pipeline supports **three independent provider tiers**.
Switching is configuration-only — no code change needed when the
Max subscription expires.

### Provider chain

| Tier | Provider | Activation | Cost | Comment |
|------|----------|------------|------|---------|
| 1 | `claude -p` subprocess (Max sub) | default | $0 / call | Opus → Sonnet → Haiku via the `ClaudeCode` service |
| 2 | Anthropic API direct | set `ANTHROPIC_API_KEY` | pay-per-token | Auto-inserted into the chain when the key is present |
| 3 | Groq (Llama 3.3 70B) | `GROQ_API_KEY` set | free tier | Last-resort fallback, always present if key is set |

### Swap scenarios

**Scenario A: Max subscription expires.**

Just set `ANTHROPIC_API_KEY` on Render. The chain becomes
`opus → sonnet → haiku → anthropic-opus → anthropic-sonnet →
anthropic-haiku → groq`. The Max-subscription tiers will all fail
(no Claude Code OAuth), the rate-limit short-circuit jumps to the
Anthropic API tier, and picks keep flowing. Cost is per-token but
the user explicitly opted in by adding the key.

**Scenario B: Skip Max entirely, prefer pay-per-token.**

Set both `ANTHROPIC_API_KEY` and `PRIMARY_LLM=groq`. The chain
collapses to `[anthropic-opus, anthropic-sonnet, anthropic-haiku,
groq]` — skips the Max subprocess. Useful if the Render IP is
blocked from Claude Code OAuth.

**Scenario C: Free tier only.**

Set `PRIMARY_LLM=groq`. Chain becomes `['groq']` only. Llama 3.3 70B
handles screening — quality dips a bit but the pipeline keeps
running at $0.

**Scenario D: Override per-call.**

Set `SCREENING_MODEL=sonnet` (or any `ScreeningModel` value). The
default model used as the chain anchor changes; everything else
slots in as fallbacks behind it.

### Adding a new provider

The architecture extends cleanly. To add OpenAI or anyone else:

1. Create `lib/services/openai-api.service.ts` mirroring
   `anthropic-api.service.ts` (one async function returning parsed
   JSON, one availability flag, one custom RateLimitError class).
2. Add the new model IDs to the `ScreeningModel` union in
   `polymarket-screening.service.ts`.
3. Add a label in `MODEL_LABEL` and a branch in the fallback loop.
4. (Optional) Add a tier in the `fallbackChain` array if you want
   it auto-included on availability.

No call sites change. The screening service hides all provider
choice from downstream code.

### Verification

After swapping, hit the dashboard and check
`/api/polymarket?_refresh=1` — the `screenedDebug` array surfaces
which model actually answered each market. The dashboard's status
strip can also be wired to show the active provider tier (TODO when
the user wants UI signal).

## Env Var Reference

```
# Subscription-based (Max plan)
# No env var needed — autodetected when `claude` CLI is on PATH and OAuth is set

# Direct Anthropic API (Max-runs-out path)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Groq free-tier fallback
GROQ_API_KEY=gsk_...

# Overrides
SCREENING_MODEL=opus|sonnet|haiku|groq|anthropic-opus|...   # default model
PRIMARY_LLM=groq                                            # force-skip Claude tiers entirely

# Polymarket account (default wallet)
POLYMARKET_WALLET_ADDRESS=0x...

# Algo-history persistence (Phase B — future)
GITHUB_ALGO_HISTORY_TOKEN=github_pat_...
GITHUB_ALGO_HISTORY_REPO=owner/repo
```
