import { scoreDomainPredictability, recommendModel, dpsConvictionMultiplier, type DPSResult } from './dps.service'
import { callClaudeCode, ClaudeCodeRateLimitError } from './claude-code-llm.service'
import {
  analyzeMarketWithLLM,
  buildStructuredPrompt,
  parseAnalysisResponse,
  type MarketForAnalysis,
  type LLMMarketAnalysis,
  type CategoryEvidence,
} from './groq-market-analysis'

export type ModelUsed = 'opus' | 'sonnet' | 'groq-fallback' | 'skip'

export interface EdgeEngineResult {
  analysis: LLMMarketAnalysis
  modelUsed: ModelUsed
  dps: DPSResult
  dpsMultiplierApplied: number
}

function skippedAnalysis(market: MarketForAnalysis, evidence: CategoryEvidence, reason: string): LLMMarketAnalysis {
  return {
    estimatedProbability: market.currentPrice,
    reasoning: `[SKIPPED — Low DPS] ${reason}`,
    confidence: 'low',
    evidence: [],
    shouldBet: false,
    direction: 'skip',
    edgeSize: 0,
    evidenceCount: evidence.bullishFindings.length + evidence.bearishFindings.length + evidence.neutralFindings.length,
    signalStrength: evidence.signalStrength,
  }
}

/**
 * Analyze a single market through DPS-routed LLM pipeline.
 *  - High DPS  → Opus 4.7 via claude-code-llm (Max sub)
 *  - Medium DPS → Sonnet 4.6 via claude-code-llm (Max sub)
 *  - Low DPS   → skip (return abstain analysis)
 *  - Rate limit / Claude Code error → fall back to Groq Llama 70B
 */
export async function analyzeMarketWithEdgeEngine(
  market: MarketForAnalysis,
  evidence: CategoryEvidence
): Promise<EdgeEngineResult> {
  const dps = scoreDomainPredictability(market.question)
  const modelChoice = recommendModel(dps.tier)
  const multiplier = dpsConvictionMultiplier(dps.tier)

  if (modelChoice === 'skip') {
    return {
      analysis: skippedAnalysis(market, evidence, dps.rationale),
      modelUsed: 'skip',
      dps,
      dpsMultiplierApplied: multiplier,
    }
  }

  const model = modelChoice === 'opus' ? 'claude-opus-4-7' : 'claude-sonnet-4-6'
  const prompt = buildStructuredPrompt(market, evidence)

  try {
    const rawResponse = await callClaudeCode<any>({
      prompt: prompt + '\n\nReturn ONLY a JSON object matching the OUTPUT FORMAT above. No prose before or after.',
      model,
      timeoutMs: 45_000,
    })
    // callClaudeCode already JSON-parses; re-stringify so parseAnalysisResponse can consume
    // the raw-string contract it shares with the Groq path.
    const analysis = parseAnalysisResponse(JSON.stringify(rawResponse), market, evidence)
    // Apply DPS multiplier — if confidence is high but multiplier is <1, downgrade so a
    // medium-DPS "high confidence" can't outrank a true high-DPS pick.
    if (multiplier < 1.0 && analysis.confidence === 'high') {
      analysis.confidence = 'medium'
    }
    return {
      analysis,
      modelUsed: modelChoice === 'opus' ? 'opus' : 'sonnet',
      dps,
      dpsMultiplierApplied: multiplier,
    }
  } catch (e) {
    const isRateLimit = e instanceof ClaudeCodeRateLimitError
    console.warn(
      `[edge-engine] ${model} failed (${isRateLimit ? 'rate-limit' : 'error'}), falling back to Groq:`,
      (e as Error).message
    )
    const fallback = await analyzeMarketWithLLM(market, evidence)
    return {
      analysis: fallback,
      modelUsed: 'groq-fallback',
      dps,
      dpsMultiplierApplied: multiplier,
    }
  }
}

/**
 * Batch entry point: analyzes many markets in parallel with a worker pool.
 * Concurrency capped to avoid spawning N subprocesses simultaneously.
 */
export async function analyzeMarketsBatchWithEdgeEngine(
  markets: MarketForAnalysis[],
  evidenceMap: Map<string, CategoryEvidence>,
  concurrency = 6
): Promise<Map<string, EdgeEngineResult>> {
  const results = new Map<string, EdgeEngineResult>()
  let idx = 0

  async function worker() {
    while (idx < markets.length) {
      const i = idx++
      const market = markets[i]
      const evidence = evidenceMap.get(market.question) ?? {
        category: 'general' as const,
        bullishFindings: [],
        bearishFindings: [],
        neutralFindings: [],
        overallSignal: 'none' as const,
        signalStrength: 0,
        keyInsights: [],
      }
      try {
        const r = await analyzeMarketWithEdgeEngine(market, evidence)
        results.set(market.question, r)
      } catch (e) {
        console.error('[edge-engine] worker failed for', market.question.substring(0, 40), e)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, markets.length) }, () => worker()))
  return results
}
