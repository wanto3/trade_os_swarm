/**
 * Groq Market Analysis Service — Structured Two-Sided Reasoning
 *
 * Replaces the old single-prompt LLM approach with a systematic pipeline:
 *   1. Pre-gathered CategoryEvidence (bullish+bearish separated) from category-research.service.ts
 *   2. Structured two-sided reasoning prompt that forces explicit step-by-step analysis
 *   3. SKIP is the default — only bet when evidence clearly misprices the market
 *
 * Key design:
 * - Evidence-first: LLM receives pre-gathered, categorized evidence (not blind analysis)
 * - Llama 3.3 70B Versatile: strong reasoning via structured prompts
 * - 10-minute cache to avoid redundant LLM calls
 * - Retry with exponential backoff on 429 errors
 * - 3s delay between batch calls (Groq rate limit)
 * - Safety/calibration rules: force SKIP on low confidence, weak signal, or small edge
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LLMMarketAnalysis {
  estimatedProbability: number
  reasoning: string         // Step-by-step reasoning visible to user
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]        // Evidence cited in reasoning
  shouldBet: boolean
  direction: 'yes' | 'no' | 'skip'
  edgeSize: number          // |estimate - marketPrice|
  evidenceCount: number
  signalStrength: number    // 0-100 from evidence gathering
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

export interface MarketForAnalysis {
  question: string
  currentPrice: number
  outcomes: string[]
  endDate: string | null
  volume: number
  liquidity: number
}

// Shared type from category-research.service.ts
// Re-exported here so consumers of this service don't need to import both
export interface CategoryEvidence {
  category: 'sports' | 'crypto' | 'policy' | 'general'
  bullishFindings: Array<{ text: string; source: string }>
  bearishFindings: Array<{ text: string; source: string }>
  neutralFindings: Array<{ text: string; source: string }>
  overallSignal: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'none'
  signalStrength: number
  keyInsights: string[]
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const analysisCache = new Map<string, { result: LLMMarketAnalysis; expiry: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000

function getCached(question: string): LLMMarketAnalysis | null {
  const c = analysisCache.get(question)
  if (c && c.expiry > Date.now()) return c.result
  return null
}

function setCache(question: string, result: LLMMarketAnalysis): void {
  analysisCache.set(question, { result, expiry: Date.now() + CACHE_TTL_MS })

  // Periodic eviction: prevent unbounded cache growth
  if (analysisCache.size > 200) {
    const now = Date.now()
    const allEntries = Array.from(analysisCache.entries())
    for (const [k, v] of allEntries) {
      if (v.expiry <= now) analysisCache.delete(k)
    }
    // If still too large, trim oldest half (by expiry time)
    if (analysisCache.size > 200) {
      const remaining = Array.from(analysisCache.entries())
      remaining.sort((a, b) => a[1].expiry - b[1].expiry)
      for (let i = 0; i < 100; i++) {
        analysisCache.delete(remaining[i][0])
      }
    }
  }
}

// ─── Groq API Call with Retry ────────────────────────────────────────────────

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

type GroqModel = 'llama-3.3-70b-versatile' | 'llama-3.1-8b-instant'

async function callGroq(prompt: string, retries = 3, model: GroqModel = 'llama-3.3-70b-versatile'): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  const is8B = model === 'llama-3.1-8b-instant'
  const timeoutMs = is8B ? 15000 : 20000
  const maxTokens = is8B ? 400 : 600
  const tag = is8B ? '[Groq 8B]' : '[Groq 70B]'

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.status === 429) {
        const waitMs = is8B ? Math.min(3000, (attempt + 1) * 1000) : Math.min(15000, (attempt + 1) * 5000)
        console.log(`${tag} Rate limited, waiting ${waitMs}ms before retry ${attempt + 1}/${retries}`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Groq ${res.status}: ${err.substring(0, 200)}`)
      }

      const data = await res.json()
      return data.choices?.[0]?.message?.content || '{}'
    } catch (e: any) {
      clearTimeout(timeout)
      if (e.name === 'AbortError') {
        console.log(`${tag} Timeout on attempt ${attempt + 1}`)
        continue
      }
      if (attempt === retries - 1) throw e
      await new Promise(r => setTimeout(r, is8B ? 1000 : 3000))
    }
  }
  throw new Error('Groq: max retries exceeded')
}

// ─── Structured Two-Sided Reasoning Prompt ──────────────────────────────────

function buildStructuredPrompt(m: MarketForAnalysis, evidence: CategoryEvidence): string {
  const days = m.endDate
    ? Math.max(0, Math.ceil((new Date(m.endDate).getTime() - Date.now()) / 86400000))
    : null

  const pricePercent = (m.currentPrice * 100).toFixed(1)
  const volumeK = (m.volume / 1000).toFixed(0)
  const liquidityK = (m.liquidity / 1000).toFixed(0)

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

  return `You are a superforecaster-calibrated prediction market analyst. You must reason through 4 structured stages before making any recommendation.

MARKET: "${m.question}"
CURRENT MARKET PRICE: ${pricePercent}% for YES
OUTCOMES: ${m.outcomes.join(' | ')}
CLOSES IN: ${days !== null ? `${days} day(s)` : 'NO END DATE'}
VOLUME: $${volumeK}K | LIQUIDITY: $${liquidityK}K

═══════════════════════════════════════
STAGE 1 — REFERENCE CLASS FORECASTING
Identify the reference class for this event type. What is the historical base rate for similar events? For example, if this is about a policy decision, how often have similar policies been enacted? Start with the base rate before considering specific evidence.

═══════════════════════════════════════
STAGE 2 — DECOMPOSITION
Break this question into 2-4 independent sub-questions. For each sub-question, estimate a mini-probability. Combine them to form a preliminary estimate.

═══════════════════════════════════════
STAGE 3 — PRE-MORTEM
Assume your current prediction turns out to be WRONG. What happened? List 2-3 specific scenarios that would cause your prediction to fail. How likely are these failure modes?

═══════════════════════════════════════
STAGE 4 — EVIDENCE ASSESSMENT & CALIBRATED ESTIMATE

EVIDENCE SUPPORTING YES:
${bullishSection}

EVIDENCE SUPPORTING NO:
${bearishSection}

OVERALL SIGNAL FROM RESEARCH: ${evidence.overallSignal} (strength: ${evidence.signalStrength}/100)

Synthesize all stages: base rate from Stage 1, decomposition from Stage 2, failure modes from Stage 3, and the evidence above. Produce a final calibrated estimate.

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
  "keyDrivers": ["factor 1", "factor 2", "factor 3"],
  "yourEstimate": 0.0-1.0,
  "edge": "market minus your estimate as %",
  "direction": "yes" | "no" | "skip",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentences explaining your reasoning step by step",
  "citedEvidence": ["quote from specific finding that supports your view"],
  "shouldBet": true | false,
  "baseRate": 0.0-1.0,
  "baseRateReasoning": "1-2 sentences on the reference class and base rate",
  "subQuestions": ["sub-question 1 (p=X)", "sub-question 2 (p=Y)"],
  "premortemRisks": ["failure scenario 1", "failure scenario 2"],
  "uncertaintyRange": 0.0-0.5
}`
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

export async function analyzeMarketWithLLM(
  market: MarketForAnalysis,
  evidence: CategoryEvidence,
  model: GroqModel = 'llama-3.3-70b-versatile'
): Promise<LLMMarketAnalysis> {
  const cached = getCached(market.question)
  if (cached) return cached

  try {
    const raw = await callGroq(buildStructuredPrompt(market, evidence), 3, model)
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error('[Groq 70B] Malformed JSON from LLM, returning fallback:', market.question.substring(0, 50))
      return {
        estimatedProbability: market.currentPrice,
        reasoning: 'LLM returned malformed JSON. No edge detected.',
        confidence: 'low',
        evidence: [],
        shouldBet: false,
        direction: 'skip',
        edgeSize: 0,
        evidenceCount: evidence.bullishFindings.length + evidence.bearishFindings.length + evidence.neutralFindings.length,
        signalStrength: evidence.signalStrength,
        baseRate: null,
        subQuestions: [],
        uncertaintyRange: 0.15,
        premortemRisks: [],
        reasoningChain: null,
      }
    }

    // Parse estimate and compute edge
    const yourEstimate = Math.min(0.99, Math.max(0.01, parsed.yourEstimate ?? market.currentPrice))
    const edgeSize = Math.abs(yourEstimate - market.currentPrice)

    // Build reasoning with KEY DRIVERS prefix
    const keyDrivers = Array.isArray(parsed.keyDrivers) ? parsed.keyDrivers.slice(0, 3) : []
    const keyDriversText = keyDrivers.length > 0
      ? `KEY DRIVERS: ${keyDrivers.join(' | ')}. `
      : ''
    const reasoning = (keyDriversText + (parsed.reasoning || '')).substring(0, 500)

    // Parse new structured reasoning fields
    const baseRate = typeof parsed.baseRate === 'number' && parsed.baseRate >= 0 && parsed.baseRate <= 1
      ? parsed.baseRate : null
    const subQuestions = Array.isArray(parsed.subQuestions) ? parsed.subQuestions : []
    const uncertaintyRange = typeof parsed.uncertaintyRange === 'number' && parsed.uncertaintyRange >= 0 && parsed.uncertaintyRange <= 0.5
      ? parsed.uncertaintyRange : 0.15
    const premortemRisks = Array.isArray(parsed.premortemRisks) ? parsed.premortemRisks : []
    const reasoningChain = (parsed.baseRateReasoning || parsed.reasoning) ? {
      referenceClass: typeof parsed.baseRateReasoning === 'string' ? parsed.baseRateReasoning : '',
      decomposition: subQuestions.join('; '),
      premortem: premortemRisks.join('; '),
      finalJudgment: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    } : null

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

    // ── Safety / Calibration Rules ──────────────────────────────────────────

    // Rule 1: Force SKIP if confidence is 'low'
    if (result.confidence === 'low') {
      result.shouldBet = false
      result.direction = 'skip'
    }

    // Rule 2: Force SKIP if evidence signal strength < 25
    if (evidence.signalStrength < 25) {
      result.shouldBet = false
      result.direction = 'skip'
    }

    // Rule 3: Force SKIP if edge is tiny (not worth fees/spread)
    if (edgeSize < 0.05) {
      result.shouldBet = false
      result.direction = 'skip'
    }

    // Rule 4: Cap confidence at medium if no real evidence was found
    if (evidence.bullishFindings.length === 0 && evidence.bearishFindings.length === 0 && result.confidence === 'high') {
      result.confidence = 'medium'
    }

    setCache(market.question, result)
    return result

  } catch (error) {
    console.error('[Groq 70B] Analysis failed:', market.question.substring(0, 50), error instanceof Error ? error.message : '')

    return {
      estimatedProbability: market.currentPrice,
      reasoning: 'LLM analysis unavailable. No edge detected.',
      confidence: 'low',
      evidence: [],
      shouldBet: false,
      direction: 'skip',
      edgeSize: 0,
      evidenceCount: evidence.bullishFindings.length + evidence.bearishFindings.length + evidence.neutralFindings.length,
      signalStrength: evidence.signalStrength,
      baseRate: null,
      subQuestions: [],
      uncertaintyRange: 0.15,
      premortemRisks: [],
      reasoningChain: null,
    }
  }
}

// ─── Batch Analysis (Receives Pre-Gathered Evidence) ─────────────────────────

/**
 * Process multiple markets sequentially using pre-gathered evidence.
 *
 * This function assumes evidence has already been gathered (e.g., via
 * gatherEvidenceBatch from category-research.service.ts) and passed in as
 * evidenceMap. This avoids redundant evidence gathering and lets the caller
 * control the evidence pipeline separately.
 *
 * @param markets - Markets to analyze
 * @param evidenceMap - Map of question -> pre-gathered CategoryEvidence
 */
export async function analyzeMarketsBatch(
  markets: MarketForAnalysis[],
  evidenceMap: Map<string, CategoryEvidence>,
  model: GroqModel = 'llama-3.3-70b-versatile'
): Promise<Map<string, LLMMarketAnalysis>> {
  const results = new Map<string, LLMMarketAnalysis>()
  const is8B = model === 'llama-3.1-8b-instant'
  // 8B has ~30 RPM free-tier limit; run 4 in parallel (well under limit), 70B tighter so only 2
  const CONCURRENCY = is8B ? 4 : 2

  console.log(`[Groq Analysis] Processing ${markets.length} markets with concurrency=${CONCURRENCY}...`)
  const startMs = Date.now()

  // Partition markets: cached vs needs-analysis
  const toAnalyze: { market: MarketForAnalysis; idx: number }[] = []
  markets.forEach((market, i) => {
    const cached = getCached(market.question)
    if (cached) {
      results.set(market.question, cached)
      console.log(`[Groq ${i + 1}/${markets.length}] CACHED: ${market.question.substring(0, 40)}...`)
    } else {
      toAnalyze.push({ market, idx: i })
    }
  })

  // Process in parallel chunks of CONCURRENCY
  for (let chunkStart = 0; chunkStart < toAnalyze.length; chunkStart += CONCURRENCY) {
    const chunk = toAnalyze.slice(chunkStart, chunkStart + CONCURRENCY)
    await Promise.all(chunk.map(async ({ market, idx }) => {
      const evidence = evidenceMap.get(market.question) || {
        category: 'general' as const,
        bullishFindings: [],
        bearishFindings: [],
        neutralFindings: [],
        overallSignal: 'none' as const,
        signalStrength: 0,
        keyInsights: [],
      }
      try {
        const analysis = await analyzeMarketWithLLM(market, evidence, model)
        results.set(market.question, analysis)
        const edgePct = (analysis.edgeSize * 100).toFixed(1)
        console.log(
          `[Groq ${idx + 1}/${markets.length}] ${market.question.substring(0, 40)}... | ` +
          `${analysis.confidence} conf | edge=${edgePct}% | bet=${analysis.shouldBet} | ` +
          `dir=${analysis.direction} | signal=${analysis.signalStrength}`
        )
      } catch (e) {
        console.error(`[Groq ${idx + 1}/${markets.length}] FAILED:`, e instanceof Error ? e.message : '')
      }
    }))
  }

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1)
  console.log(`[Groq Analysis] ${results.size}/${markets.length} done in ${elapsed}s`)
  return results
}

// ─── Legacy Support (deprecated) ────────────────────────────────────────────

/**
 * @deprecated Use analyzeMarketWithLLM(market, evidence) instead.
 * This overload is kept for backward compatibility with code that still calls
 * analyzeMarketWithLLM with only the market parameter (auto-gathering evidence).
 * It will be removed once all callers are migrated to the two-argument form.
 */
export async function analyzeMarketWithLLM_Legacy(
  market: MarketForAnalysis,
): Promise<LLMMarketAnalysis> {
  // Re-import dynamically to avoid circular dep issues during migration
  const { gatherCategoryEvidence } = await import('./category-research.service')
  const evidence = await gatherCategoryEvidence(market.question)
  return analyzeMarketWithLLM(market, evidence)
}

// Backward-compatible batch that gathers its own evidence (deprecated)
export async function analyzeMarketsBatch_Legacy(
  markets: MarketForAnalysis[],
): Promise<Map<string, LLMMarketAnalysis>> {
  const { gatherEvidenceBatch } = await import('./category-research.service')
  const evidenceMap = await gatherEvidenceBatch(markets.map(m => m.question))
  return analyzeMarketsBatch(markets, evidenceMap)
}