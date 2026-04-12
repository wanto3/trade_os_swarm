/**
 * Deep Analysis Service — Background Enhanced Analysis
 *
 * Runs every 10-15 minutes in the background to provide deeper market analysis:
 *   1. Fetches cross-platform odds from Metaculus + Kalshi
 *   2. Gathers category-aware evidence
 *   3. Runs structured LLM analysis with superforecaster reasoning
 *   4. Stores results in file-based cache (data/deep-analysis-cache.json)
 *
 * Results are merged into the fast-pass results by the dashboard API.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { CrossPlatformOdds } from './cross-platform-odds.service'
import type { MarketForAnalysis, LLMMarketAnalysis } from './groq-market-analysis'

// ─── Types ──────────────────────────────────────────────────────────────────────

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
  results: Record<string, DeepAnalysisResult>
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CACHE_FILE = path.join(process.cwd(), 'data', 'deep-analysis-cache.json')
const RESULT_TTL_MS = 30 * 60 * 1000   // 30 minutes
const STALE_THRESHOLD_MS = 10 * 60 * 1000  // 10 minutes

// ─── State ──────────────────────────────────────────────────────────────────────

let deepRunInProgress = false

// ─── Cache I/O ──────────────────────────────────────────────────────────────────

function readCache(): DeepCache {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8')
    return JSON.parse(raw) as DeepCache
  } catch {
    return { lastRunTimestamp: null, lastRunDuration: null, marketsAnalyzed: 0, results: {} }
  }
}

function writeCache(cache: DeepCache): void {
  // Evict expired entries before saving
  const now = Date.now()
  const results: Record<string, DeepAnalysisResult> = {}
  for (const [id, result] of Object.entries(cache.results)) {
    if (now - result.analysisTimestamp < RESULT_TTL_MS) {
      results[id] = result
    }
  }
  cache.results = results

  const dir = path.dirname(CACHE_FILE)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8')
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get cached deep result for a market. Returns null if expired or missing.
 */
export function getDeepResult(marketId: string): DeepAnalysisResult | null {
  const cache = readCache()
  const result = cache.results[marketId]
  if (!result) return null
  if (Date.now() - result.analysisTimestamp > RESULT_TTL_MS) return null
  return result
}

/**
 * Get current deep analysis status.
 */
export function getDeepStatus(): {
  lastRun: number | null
  duration: number | null
  marketsAnalyzed: number
} {
  const cache = readCache()
  return {
    lastRun: cache.lastRunTimestamp,
    duration: cache.lastRunDuration,
    marketsAnalyzed: cache.marketsAnalyzed,
  }
}

/**
 * True if last run was >10 minutes ago or never ran.
 */
export function isDeepRunStale(): boolean {
  const cache = readCache()
  if (cache.lastRunTimestamp === null) return true
  return Date.now() - cache.lastRunTimestamp > STALE_THRESHOLD_MS
}

// ─── Conviction Scoring ─────────────────────────────────────────────────────────

function computeConvictionScore(
  analysis: LLMMarketAnalysis,
  divergenceSignal: 'aligned' | 'divergent' | 'no-data',
): number {
  // Base from LLM confidence level
  const confidenceBase: Record<string, number> = {
    high: 88,
    medium: 62,
    low: 30,
  }
  let score = confidenceBase[analysis.confidence] ?? 50

  // Edge bonus: min(7, edgeSize * 100)
  score += Math.min(7, analysis.edgeSize * 100)

  // Evidence bonus: min(5, evidenceCount)
  score += Math.min(5, analysis.evidenceCount)

  // Uncertainty range adjustment
  if (analysis.uncertaintyRange <= 0.05) {
    score += 5
  } else if (analysis.uncertaintyRange <= 0.10) {
    score += 2
  } else if (analysis.uncertaintyRange > 0.25) {
    score -= 7
  }

  // Cross-platform divergence adjustment
  if (divergenceSignal === 'aligned') {
    score += 3
  } else if (divergenceSignal === 'divergent') {
    score -= 3
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

// ─── Main Deep Analysis ─────────────────────────────────────────────────────────

interface MarketInput {
  id: string
  question: string
  currentPrice: number
  outcomes: string[]
  endDate: string | null
  volume: number
  liquidity: number
}

/**
 * Run deep analysis on a batch of markets.
 * Guards against concurrent runs.
 */
export async function runDeepAnalysis(
  markets: MarketInput[],
  maxMarkets: number = 15,
): Promise<{ analyzed: number; duration: number }> {
  if (deepRunInProgress) {
    console.log('[Deep Analysis] Already in progress, skipping')
    return { analyzed: 0, duration: 0 }
  }

  deepRunInProgress = true
  const startTime = Date.now()

  try {
    const batch = markets.slice(0, maxMarkets)
    console.log(`[Deep Analysis] Starting analysis of ${batch.length} markets...`)

    // Dynamic imports to avoid circular dependencies and keep cold-start fast
    const { fetchCrossPlatformOddsBatch, analyzeDivergence } = await import('./cross-platform-odds.service')
    const { gatherEvidenceBatch } = await import('./category-research.service')
    const { analyzeMarketsBatch } = await import('./groq-market-analysis')

    // Step 1: Fetch cross-platform odds
    const questions = batch.map((m) => m.question)
    console.log('[Deep Analysis] Fetching cross-platform odds...')
    const oddsMap = await fetchCrossPlatformOddsBatch(questions)

    // Step 2: Gather evidence
    console.log('[Deep Analysis] Gathering evidence...')
    const evidenceMap = await gatherEvidenceBatch(questions)

    // Step 3: Run LLM analysis
    console.log('[Deep Analysis] Running LLM analysis...')
    const marketsForAnalysis: MarketForAnalysis[] = batch.map((m) => ({
      question: m.question,
      currentPrice: m.currentPrice,
      outcomes: m.outcomes,
      endDate: m.endDate,
      volume: m.volume,
      liquidity: m.liquidity,
    }))
    const analysisMap = await analyzeMarketsBatch(marketsForAnalysis, evidenceMap)

    // Step 4: Combine results
    console.log('[Deep Analysis] Combining results...')
    const cache = readCache()
    const now = Date.now()

    for (const market of batch) {
      const analysis = analysisMap.get(market.question)
      if (!analysis) continue

      const odds = oddsMap.get(market.question) || []
      const divergence = analyzeDivergence(market.currentPrice, odds)

      const deepResult: DeepAnalysisResult = {
        marketId: market.id,
        question: market.question,
        convictionScore: computeConvictionScore(analysis, divergence.signal),
        estimatedProbability: analysis.estimatedProbability,
        baseRate: analysis.baseRate,
        uncertaintyRange: analysis.uncertaintyRange,
        premortemRisks: analysis.premortemRisks,
        subQuestions: analysis.subQuestions,
        reasoningChain: analysis.reasoningChain,
        crossPlatformOdds: odds,
        divergenceSignal: divergence.signal,
        consensusProbability: divergence.consensusProbability,
        evidenceSources: analysis.evidence,
        analysisTimestamp: now,
      }

      cache.results[market.id] = deepResult
    }

    const duration = Date.now() - startTime
    cache.lastRunTimestamp = now
    cache.lastRunDuration = duration
    cache.marketsAnalyzed = batch.length

    // Step 5: Save cache (with TTL eviction)
    writeCache(cache)

    console.log(`[Deep Analysis] Complete — ${batch.length} markets in ${(duration / 1000).toFixed(1)}s`)

    return { analyzed: batch.length, duration }
  } catch (error) {
    console.error('[Deep Analysis] Error:', error)
    throw error
  } finally {
    deepRunInProgress = false
  }
}
