/**
 * Polymarket Screening Service — Phase 1 (one-shot batched analysis)
 *
 * Sends ALL candidate markets to a single Groq Llama 3.3 70B call and gets
 * back a JSON array of per-market assessments in ~5-10s. Replaces the
 * 20+ sequential per-market calls (~60s) for the dashboard's first paint.
 *
 * Phase 2 (per-market deep-dive with Opus or refined Sonnet) can be added
 * later as an opt-in click — runs sequentially in the background, doesn't
 * block the dashboard.
 *
 * Trade-off: per-market reasoning is shorter than the dedicated per-market
 * pipeline, but quality is sufficient for screening because:
 *   - The LLM sees all markets at once and can comparison-rank
 *   - Structured output forces consistent yes/no/skip decisions
 *   - Safety rules (in route.ts) still gate which results surface
 */

import type { CategoryEvidence } from './category-research.service'
import type { LLMMarketAnalysis, MarketForAnalysis } from './groq-market-analysis'
import { callClaudeCode, type ClaudeModel } from './claude-code-llm.service'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScreeningInput {
  marketId: string
  question: string
  yesPrice: number
  noPrice: number
  endDate: string | null
  // Outcome labels for multi-outcome markets — disambiguates which side
  // YES refers to. Without these, "Lakers vs. Thunder | YES: 12%" leaves
  // Opus guessing whether YES means Lakers or Thunder. Optional because
  // simple Yes/No binary markets don't need it.
  outcomes?: string[]
  evidence?: CategoryEvidence | null
}

interface BatchAssessment {
  marketId: string
  yourEstimate: number          // 0.0-1.0, YES probability
  direction: 'yes' | 'no' | 'skip'
  confidence: 'high' | 'medium' | 'low'
  reasoning: string             // 1-2 sentences
  shouldBet: boolean
}

// ─── Prompt Construction ─────────────────────────────────────────────────────

function buildBatchScreeningPrompt(markets: ScreeningInput[]): string {
  const marketLines = markets
    .map((m, i) => {
      const hours = m.endDate
        ? Math.max(0, (new Date(m.endDate).getTime() - Date.now()) / 3_600_000)
        : null
      const timeStr = hours === null
        ? '(no end date)'
        : hours <= 24
          ? `closes in ${hours.toFixed(0)}h ⏰CLOSING-SOON`
          : `closes in ${Math.ceil(hours / 24)}d`
      const ev = m.evidence
      const evHint =
        ev && ev.signalStrength > 0
          ? ` | EVIDENCE: ${ev.overallSignal} (strength ${ev.signalStrength})${
              ev.bullishFindings[0]?.text ? ` | bull: ${ev.bullishFindings[0].text.substring(0, 80)}` : ''
            }${ev.bearishFindings[0]?.text ? ` | bear: ${ev.bearishFindings[0].text.substring(0, 80)}` : ''}`
          : ''
      // Outcome label for multi-outcome markets so Opus knows which side
      // YES represents (e.g. "YES = 'Lakers'" makes the betting frame clear).
      // Skip for plain Yes/No binary markets — adds no signal there.
      const isPlainYesNo = !m.outcomes || (m.outcomes[0] === 'Yes' && m.outcomes[1] === 'No')
      const outcomeNote = !isPlainYesNo && m.outcomes
        ? ` | YES = "${m.outcomes[0]}" / NO = "${m.outcomes[1] ?? 'other'}"`
        : ''
      return `${i + 1}. ID: ${m.marketId} | Q: "${m.question.substring(0, 130)}" | YES: ${(
        m.yesPrice * 100
      ).toFixed(1)}%${outcomeNote} | ${timeStr}${evHint}`
    })
    .join('\n')

  return `You are screening prediction markets for trading opportunities. For EACH market below, give your assessment in ONE pass.

MARKETS:
${marketLines}

⏰ CLOSING-SOON MARKETS (within 24 hours) — this is the user's primary daily trading pool. Try HARD here:
  - Has the event ALREADY happened but the market hasn't fully priced it in? (e.g. result confirmed but market still at 80% instead of 99%)
  - Are there clear public-record facts (polls, news, official announcements, scheduled events) that decisively support one side?
  - Is the market price stale relative to recent developments?
  - For HEAVY favorites (yesPrice ≥0.85 or ≤0.15): your job is mostly to confirm or refute consensus. If nothing odd, agree with the market and bet the favorite for a small reliable edge — these are "safe scalps" the user wants daily.

  - SPORTS NATURE matters — calibrate by domain, not as a single category:
      * NBA / NFL / MLB / NHL / Soccer / major-league team sports:
          → Outcomes between similarly-skilled teams ARE genuinely close to 50/50.
          → Only call YES/NO direction when there's a real competence gap (one
            team is much stronger, key player out, dominant home record, etc.).
          → If teams are evenly matched, the market price near 50% is FAIR —
            return skip with yourEstimate ≈ market price.
          → Heavy favorites (>80%) — confirm or flag a specific reason to fade.

      * ESPORTS (Valorant, LoL, CS, Dota, OW, etc.):
          → NOT coin-flip nature even when prices look balanced. Team identity,
            current-meta fit, roster form, region strength, and format (BO3/BO5)
            create real edge that the market often underprices.
          → The user has DOCUMENTED EDGE in esports 24h markets — don't reflexively
            skip these. If you have ANY prior — even "this team has strong
            international results", "this region is currently dominant", "the
            favored team's IGL is reliable in clutch" — give your directional
            lean with confidence="medium" and reasoning the user can verify.
          → "low" confidence is only for genuinely-unknown teams in BOTH seats.
          → Always include reasoning even on skips so the user can apply their
            own follow-the-scene knowledge.

      * Other markets (politics, geopolitics, corporate, crypto-milestone):
          → Use the standard rubric — "medium" is the default if you have any
            grounding, "high" for citable facts, "low" for genuinely unknown.

  - For genuinely 50/50 coin-flips with no signal either way: return direction="skip" with yourEstimate = the market's yesPrice (DON'T fabricate a number like 0.79 when you actually mean "I don't know").

🎯 DAILY COMPOUND TARGET — the user is compounding $4 toward $100 in 30 days. This requires ~11%/day growth from picks closing within 24h to 3 DAYS so capital recycles fast enough. Their primary trading window is ≤3d markets, so:

  - HUNT EDGE in EVERY ≤72h market — don't reflexively skip. Every closing-soon market deserves a real read:
      * Heavy favorites at YES 70-92% closing within 3 days, where you estimate real probability is 5-15pts higher (e.g. market 80%, your estimate 88-92%). Even small confirmed edges (3-5pt) on ≤3d heavy favorites are valuable safe-scalp territory because they cycle fast.
      * Mid-favorite picks (YES 50-70%) where your estimate diverges 7-15pts from market — these have higher payout multiplier per win.
      * Recent-event markets (election results, sports outcomes, news triggers) where the resolution may already be locked but the price hasn't fully updated.
  - These should be confidence="high" or "medium" with shouldBet=true.
  - Reasoning should cite a specific reason for the edge (recent news, base rate, structural advantage, polling pattern, etc.).
  - The user has documented edge in esports — for those, give your directional lean even at medium confidence so the user can apply scene knowledge.
  - DO NOT just default to skip on ≤3d markets — the user explicitly wants you to explore this window aggressively.

🚀 AGGRESSIVE LONGSHOT (Cat B mispricings) — secondary path, higher variance, single big winner can compound a month of growth. ACTIVELY scan for:

  - LONGSHOT YES at market 5-25% where you think real probability is ≥30%. $1 → $4-20 if right. Any directional reasoning + medium confidence is worth surfacing — the user will weigh variance.
  - Examples: candidate-dropout markets where the candidate just got bad news, regulatory rejection markets where there's specific opposition signal, tail-event markets the market is sleeping on.
  - Surface as direction="yes" with honest confidence — don't over-skip just because the bet is "risky"; the user is explicitly trading variance for upside.

  - LONGSHOT NO at market 75-95% where you have a specific reason to fade the favorite.

Don't fabricate either of these — if you don't see the edge, skip honestly. But DO surface them when real, even at medium confidence.

For EACH market, output:
- yourEstimate: YES probability (0.0-1.0). NOT a percentage. Use 0.05 for "5% likely YES", 0.85 for "85% likely YES", etc.
- direction: "yes" if you think YES is undervalued (bet YES); "no" if YES is overvalued (bet NO); "skip" if within ~5% of market price (or ~3% for closing-soon)
- confidence — calibrate honestly, not defensively:
    * "high": specific public-record facts strongly support your direction (named polls, reported result, official announcement, base rate from historical data)
    * "medium": you have a reasonable directional prior even if not airtight — partial info, comparable historical patterns, sector knowledge from training data, observable trends. THIS IS THE DEFAULT for markets you can reason about even if you can't cite a specific source.
    * "low": ONLY use when you genuinely have no information about the entities, no prior, and no way to ground an estimate. Two competing teams you've never heard of with no recent context. A coin-flip with no public data either way. If you have ANY prior (e.g. "incumbents usually win these", "market price already implies the consensus is reasonable"), use medium, not low.
- reasoning: 1-2 sentences explaining the call. For closing-soon picks, name the specific fact/event/prior that creates edge.
- shouldBet: true if confidence is high or medium AND there's a meaningful edge (≥5% normally; ≥2% for closing-soon; ≥1% for Cat A heavy-favorite confirmations at yesPrice ≥0.85 closing within 48h — these are safe-scalp territory where small confirmed edges are structurally valuable to a small-bankroll trader compounding daily).

Be calibrated, not paranoid. The user is paying for Opus 4.7 specifically because you have broad world knowledge — use it. Don't reflexively skip just because you can't cite a source; if you can reason about it, that's medium confidence. But don't fabricate edges where none exist either.

Return a JSON array with EXACTLY this shape, one entry per market in the same order:
[
  {"marketId":"...","yourEstimate":0.0-1.0,"direction":"yes|no|skip","confidence":"high|medium|low","reasoning":"...","shouldBet":true|false},
  ...
]

Return ONLY the JSON array. No prose, no markdown fences, no explanation.`
}

// ─── Groq Call ───────────────────────────────────────────────────────────────

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function callGroqBatch(prompt: string, retries = 3): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  let lastError = 'unknown' // capture so "max retries exceeded" carries context
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45_000) // 45s for big batch
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 6000, // big enough for 40 market assessments
          // Note: NOT requesting json_object response format because we want
          // an array, not an object wrapper.
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.status === 429) {
        const waitMs = Math.min(15_000, (attempt + 1) * 4_000)
        const body = (await res.text()).substring(0, 200)
        lastError = `429 rate-limited (${body})`
        console.log(`[Screening] Rate limited, waiting ${waitMs}ms (retry ${attempt + 1}/${retries})`)
        await new Promise((r) => setTimeout(r, waitMs))
        continue
      }
      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Groq ${res.status}: ${err.substring(0, 200)}`)
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || '[]'
    } catch (e: unknown) {
      clearTimeout(timeout)
      if (e instanceof Error && e.name === 'AbortError') {
        lastError = `timeout on attempt ${attempt + 1}`
        console.log(`[Screening] Timeout on attempt ${attempt + 1}`)
        continue
      }
      lastError = e instanceof Error ? e.message : String(e)
      if (attempt === retries - 1) throw e
      await new Promise((r) => setTimeout(r, 2_000))
    }
  }
  throw new Error(`Screening: max retries exceeded — last error: ${lastError}`)
}

// ─── Response Parsing ────────────────────────────────────────────────────────

function stripFencesAndParse(raw: string): BatchAssessment[] {
  // Strip markdown fences if present
  let cleaned = raw.trim()
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  // Try to find a JSON array if there's leading prose
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) cleaned = arrayMatch[0]

  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is BatchAssessment => {
      return (
        typeof x === 'object' &&
        x !== null &&
        typeof x.marketId === 'string' &&
        typeof x.yourEstimate === 'number'
      )
    })
  } catch {
    return []
  }
}

function applySafetyRules(
  raw: BatchAssessment,
  marketYesPrice: number,
  evidence: CategoryEvidence | null | undefined,
  endDate?: string | null
): LLMMarketAnalysis {
  // Normalize estimate (handle percentage-format LLM responses)
  let est = raw.yourEstimate
  if (typeof est === 'string') est = parseFloat(est)
  if (typeof est !== 'number' || isNaN(est)) est = marketYesPrice
  if (est > 1) est /= 100
  est = Math.min(0.99, Math.max(0.01, est))

  const edgeSize = Math.abs(est - marketYesPrice)
  const evidenceCount = evidence
    ? evidence.bullishFindings.length + evidence.bearishFindings.length + evidence.neutralFindings.length
    : 0
  const signalStrength = evidence?.signalStrength ?? 0

  let confidence: 'high' | 'medium' | 'low' = (['high', 'medium', 'low'].includes(raw.confidence)
    ? raw.confidence
    : 'low') as 'high' | 'medium' | 'low'

  let direction: 'yes' | 'no' | 'skip' = (['yes', 'no', 'skip'].includes(raw.direction)
    ? raw.direction
    : 'skip') as 'yes' | 'no' | 'skip'

  let shouldBet = raw.shouldBet === true

  // Relaxed safety rules for screening:
  // - 'low' confidence: still skip (model itself signaled uncertainty)
  // - edge threshold scales with horizon AND market price band:
  //   * 3% normally
  //   * 2% for closing-soon (≤24h) — fast resolution = lower slippage risk
  //   * 1% for Cat A safe-scalps (≤48h AND yesPrice ≥0.85 OR ≤0.15) —
  //     these are heavy-favorite confirmations where 1-2pt confirmed edges
  //     compound reliably for a $4-bankroll user. Was blocking these
  //     entirely before.
  const closingHours = endDate
    ? Math.max(0, (new Date(endDate).getTime() - Date.now()) / 3_600_000)
    : 999
  const isClosingSoon = closingHours <= 24
  const isCatASafeScalp = closingHours <= 48 && (marketYesPrice >= 0.85 || marketYesPrice <= 0.15)
  const edgeThreshold = isCatASafeScalp ? 0.01 : isClosingSoon ? 0.02 : 0.03

  if (confidence === 'low') {
    shouldBet = false
    direction = 'skip'
  }
  if (edgeSize < edgeThreshold) {
    shouldBet = false
    direction = 'skip'
  }

  // Sanity check: direction must be CONSISTENT with yourEstimate vs market price.
  // Sometimes the LLM emits direction='no' with yourEstimate > marketPrice (or
  // vice-versa) — that's logically broken and produces giant negative EVs
  // downstream when route.ts computes side-aware EV. Force skip in that case.
  const estVsMarket = est - marketYesPrice
  if (direction === 'yes' && estVsMarket <= 0) {
    direction = 'skip'
    shouldBet = false
  }
  if (direction === 'no' && estVsMarket >= 0) {
    direction = 'skip'
    shouldBet = false
  }

  return {
    estimatedProbability: est,
    reasoning: (raw.reasoning ?? '').substring(0, 500),
    confidence,
    evidence: [],
    shouldBet,
    direction,
    edgeSize,
    evidenceCount,
    signalStrength,
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export type ScreeningModel = 'opus' | 'sonnet' | 'haiku' | 'groq'

const MODEL_LABEL: Record<ScreeningModel, string> = {
  opus: 'Claude Opus 4.7',
  sonnet: 'Claude Sonnet 4.6',
  haiku: 'Claude Haiku 4.5',
  groq: 'Groq Llama 3.3 70B',
}

/**
 * Screen all candidate markets in PARALLEL batches via the chosen LLM.
 * Returns a Map keyed by marketId → LLMMarketAnalysis (compatible with
 * the existing per-market pipeline so route.ts logic stays the same).
 *
 * For 25 markets, splits into 2 parallel sub-batches of ~12 each. Wall
 * time roughly halves vs a single 25-market call because output token
 * generation is the bottleneck (Opus ~50 tok/sec for 6K output = 120s
 * for one big call vs ~60s when split).
 *
 * Set PARALLEL_BATCHES env var to override the split count (default 2).
 */
// Default 1 (sequential). On Render free-tier, parallel claude -p
// subprocesses contend for CPU/RAM AND share the same ~/.claude session
// state — three concurrent processes all timed out at exactly 240s in
// production, indicating they were hanging on shared-state contention,
// not making API progress. Sequential = no contention, predictable
// finish time. Bump via PARALLEL_BATCHES env var on a paid tier.
const PARALLEL_BATCHES = Math.max(1, parseInt(process.env.PARALLEL_BATCHES || '1', 10))

// Module-level error trail captured during the most recent screening run.
// Populated by screenSingleBatch's fallback loop, surfaced by getLastBatchErrors()
// so the API route can include it in the debug response. We need this because
// "all fallbacks failed" silently returns an empty Map — and on Render we can't
// always tail logs to find out why (claude -p auth, missing GROQ_API_KEY,
// timeout, etc.).
let lastBatchErrors: string[] = []
export function getLastBatchErrors(): string[] {
  return lastBatchErrors.slice()
}

export async function screenMarketsBatch(
  markets: ScreeningInput[],
  model: ScreeningModel = 'opus'
): Promise<Map<string, LLMMarketAnalysis>> {
  // Reset the error trail at the start of every screening run so the API
  // response only shows errors from the most recent attempt.
  lastBatchErrors = []
  const results = new Map<string, LLMMarketAnalysis>()
  if (markets.length === 0) return results

  // Split into N sub-batches and run in parallel. If we have ≤8 markets,
  // a single batch is faster than the parallel overhead.
  const subBatchCount = markets.length <= 8 ? 1 : PARALLEL_BATCHES
  if (subBatchCount > 1) {
    const subSize = Math.ceil(markets.length / subBatchCount)
    const subBatches: ScreeningInput[][] = []
    for (let i = 0; i < markets.length; i += subSize) {
      subBatches.push(markets.slice(i, i + subSize))
    }
    console.log(`[Screening] Splitting ${markets.length} markets into ${subBatches.length} parallel ${MODEL_LABEL[model]} batches of ~${subSize} each`)
    const subResults = await Promise.all(
      subBatches.map((sub) => screenSingleBatch(sub, model))
    )
    for (const sub of subResults) {
      for (const [k, v] of Array.from(sub.entries())) results.set(k, v)
    }
    return results
  }

  console.log(`[Screening] Batch-analyzing ${markets.length} markets in ONE ${MODEL_LABEL[model]} call`)
  const single = await screenSingleBatch(markets, model)
  for (const [k, v] of Array.from(single.entries())) results.set(k, v)
  return results
}

/**
 * Internal: one LLM call analyzing one sub-batch of markets.
 */
async function screenSingleBatch(
  markets: ScreeningInput[],
  model: ScreeningModel
): Promise<Map<string, LLMMarketAnalysis>> {
  const results = new Map<string, LLMMarketAnalysis>()
  if (markets.length === 0) return results
  const prompt = buildBatchScreeningPrompt(markets)

  // Detect serverless environment — Vercel/Lambda can't spawn `claude -p`
  // subprocess (no Claude Code binary, no OAuth creds on their machines).
  // Skip the claude-code path entirely and go straight to Groq HTTP API.
  const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)

  // Build fallback chain so we never end up with 0 results from a transient
  // failure on one provider. Order picked by speed — first success wins.
  const fallbackChain: ScreeningModel[] = IS_SERVERLESS
    ? ['groq']  // serverless: only Groq HTTP API works
    : model === 'haiku'  ? ['haiku', 'groq', 'sonnet']
      : model === 'groq'   ? ['groq', 'haiku', 'sonnet']
      : model === 'sonnet' ? ['sonnet', 'haiku', 'groq']
      : ['opus', 'sonnet', 'haiku', 'groq']

  let rawResponse: string | null = null
  for (const tryModel of fallbackChain) {
    try {
      if (tryModel === 'opus' || tryModel === 'sonnet' || tryModel === 'haiku') {
        const claudeModel: ClaudeModel =
          tryModel === 'opus' ? 'claude-opus-4-7'
            : tryModel === 'sonnet' ? 'claude-sonnet-4-6'
            : 'claude-haiku-4-5'
        // Haiku is fastest (~10s for batched), Sonnet medium (~30-60s),
        // Opus slowest (~60-120s on a beefy machine, ~3-5min on Render
        // free-tier). Bumped Opus to 8min to accommodate 55-market
        // sequential batches (was 45-market max). Sonnet/Haiku timeouts
        // unchanged — they're fallbacks, not the primary path.
        const timeoutMs = tryModel === 'haiku' ? 90_000
          : tryModel === 'sonnet' ? 240_000
          : 480_000  // Opus: 8 min upper bound
        const parsed = await callClaudeCode<unknown>({
          prompt,
          model: claudeModel,
          timeoutMs,
        })
        rawResponse = typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
      } else {
        rawResponse = await callGroqBatch(prompt)
      }
      if (tryModel !== model) {
        console.log(`[Screening] ${MODEL_LABEL[tryModel]} fallback succeeded after ${MODEL_LABEL[model]} failed`)
      }
      break
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Redact secrets before logging or surfacing in API response. The
      // claude -p subprocess can echo the Authorization header in error
      // payloads (e.g. "API Error: Header '14' has invalid value:
      // 'Bearer sk-ant-oat01-...'"), and screeningErrors goes to the
      // public API response. Anything matching common token prefixes
      // gets stripped to prefix+'***REDACTED***'.
      const safe = msg
        .replace(/sk-ant-oat01-[A-Za-z0-9_\-\s]+/g, 'sk-ant-oat01-***REDACTED***')
        .replace(/sk-ant-api[0-9]+-[A-Za-z0-9_\-\s]+/g, 'sk-ant-api***REDACTED***')
        .replace(/gsk_[A-Za-z0-9]+/g, 'gsk_***REDACTED***')
        .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/g, 'Bearer ***REDACTED***')
      console.warn(`[Screening] ${MODEL_LABEL[tryModel]} failed: ${safe}`)
      lastBatchErrors.push(`${MODEL_LABEL[tryModel]}: ${safe.substring(0, 600)}`)
      // try next in chain
    }
  }

  if (!rawResponse) {
    console.error('[Screening] All fallback models failed')
    lastBatchErrors.push('ALL_FALLBACKS_FAILED')
    return results
  }

  const assessments = stripFencesAndParse(rawResponse)
  console.log(`[Screening] Parsed ${assessments.length} assessments from batch response`)
  if (assessments.length === 0) {
    // Got a response from some fallback model but couldn't extract any
    // assessments. Capture a preview so we can see whether it's prose
    // wrapping, a refusal, or completely unrelated output.
    lastBatchErrors.push(`PARSE_EMPTY: rawLen=${rawResponse.length} preview="${rawResponse.substring(0, 200).replace(/\s+/g, ' ')}"`)
  }

  // Index assessments by marketId for lookup
  const byId = new Map<string, BatchAssessment>()
  for (const a of assessments) byId.set(a.marketId, a)

  // Apply safety rules and build the LLMMarketAnalysis-shaped result per market
  for (const m of markets) {
    const a = byId.get(m.marketId)
    if (!a) {
      // LLM dropped this market — return abstain analysis
      results.set(m.marketId, {
        estimatedProbability: m.yesPrice,
        reasoning: '[Screening missed this market — no analysis returned]',
        confidence: 'low',
        evidence: [],
        shouldBet: false,
        direction: 'skip',
        edgeSize: 0,
        evidenceCount: m.evidence ? m.evidence.bullishFindings.length + m.evidence.bearishFindings.length : 0,
        signalStrength: m.evidence?.signalStrength ?? 0,
      })
      continue
    }
    results.set(m.marketId, applySafetyRules(a, m.yesPrice, m.evidence, m.endDate))
  }

  return results
}

/**
 * Adapter helper — convert MarketForAnalysis (used by per-market path) to
 * ScreeningInput so callers don't have to refactor everything.
 */
export function toScreeningInputs(
  markets: MarketForAnalysis[],
  marketIds: string[],
  evidenceMap: Map<string, CategoryEvidence>
): ScreeningInput[] {
  return markets.map((m, i) => ({
    marketId: marketIds[i],
    question: m.question,
    yesPrice: m.currentPrice,
    noPrice: 1 - m.currentPrice,
    endDate: m.endDate,
    outcomes: m.outcomes,  // pass-through for multi-outcome disambiguation
    evidence: evidenceMap.get(m.question) ?? null,
  }))
}
