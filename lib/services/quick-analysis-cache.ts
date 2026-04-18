/**
 * Quick Analysis Cache — Cross-Cycle Persistence for 8B LLM Verdicts
 *
 * Mirrors the deep-analysis-cache pattern but for the fast 8B Groq pass.
 *
 * Why this exists:
 *   The dashboard cache (in-memory, 90s TTL) churns through 12-27 markets per cycle
 *   while there are 200+ candidates. Without persistence, every cycle re-analyzes the
 *   same closing-soon markets and the other 180 stay pending forever. With this cache,
 *   verdicts accumulate: cycle 1 covers 27, cycle 2 covers another 27 (skipping the
 *   already-analyzed 27), and within 5-7 cycles every actionable market has a verdict.
 *
 * TTL is shorter than deep cache (15min vs 30min) because 8B verdicts are noisier and
 * we want them refreshed more often as market prices move.
 */

import * as fs from 'fs'
import * as path from 'path'
import type { LLMMarketAnalysis } from './groq-market-analysis'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface QuickAnalysisResult {
  marketId: string
  question: string
  analysis: LLMMarketAnalysis
  /** Market odds at time of analysis — if odds drift > 5% we treat as stale */
  oddsAtAnalysis: number
  analysisTimestamp: number
}

interface QuickCache {
  results: Record<string, QuickAnalysisResult>
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const CACHE_FILE = path.join(process.cwd(), 'data', 'quick-analysis-cache.json')
const RESULT_TTL_MS = 15 * 60 * 1000   // 15 minutes — refresh more often than deep
const ODDS_DRIFT_THRESHOLD = 0.05      // 5% absolute price move → re-analyze

// ─── Cache I/O ──────────────────────────────────────────────────────────────────

function readCache(): QuickCache {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8')
    return JSON.parse(raw) as QuickCache
  } catch {
    return { results: {} }
  }
}

function writeCache(cache: QuickCache): void {
  // Evict expired entries before saving so the file doesn't grow unbounded
  const now = Date.now()
  const results: Record<string, QuickAnalysisResult> = {}
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
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8')
}

// In-memory cache to avoid hammering the disk on every recommendation merge.
// Re-read from disk every 30s so changes from concurrent runs are picked up.
let memCache: QuickCache | null = null
let memCacheLoaded = 0
const MEM_CACHE_TTL = 30_000

function getCache(): QuickCache {
  if (!memCache || Date.now() - memCacheLoaded > MEM_CACHE_TTL) {
    memCache = readCache()
    memCacheLoaded = Date.now()
  }
  return memCache
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Get cached quick result for a market. Returns null only if missing or expired.
 *
 * Note: this no longer evicts on price drift. The previous behavior — dropping the cached
 * verdict whenever the price moved >5% — caused analyzed picks to visually disappear and
 * get "replaced" by other markets every few minutes, even though the LLM hadn't actually
 * changed its mind. That wasted compute and confused the user, who couldn't tell whether
 * to act on a recommendation or wait. We now keep showing the verdict and let the caller
 * use `isQuickResultStale()` to decide whether to queue a *background* re-analysis. When
 * the new verdict comes back, it overwrites the cache silently — no UI churn unless the
 * LLM genuinely flipped (e.g., shouldBet: true → false).
 */
export function getQuickResult(marketId: string): QuickAnalysisResult | null {
  const cache = getCache()
  const result = cache.results[marketId]
  if (!result) return null
  if (Date.now() - result.analysisTimestamp > RESULT_TTL_MS) return null
  return result
}

/**
 * Check whether a cached verdict needs a background refresh.
 *
 * Returns true when:
 *   - No cache entry exists (never analyzed)
 *   - TTL expired
 *   - Price has drifted past the threshold since analysis (verdict may no longer reflect reality)
 *
 * The display path uses `getQuickResult()` and shows whatever's in cache. The candidate
 * selector uses this helper to decide which markets to push into the next Groq batch — so
 * stale picks remain visible while their re-analysis runs in the background.
 */
export function isQuickResultStale(marketId: string, currentOdds: number): boolean {
  const cache = getCache()
  const result = cache.results[marketId]
  if (!result) return true
  if (Date.now() - result.analysisTimestamp > RESULT_TTL_MS) return true
  if (Math.abs(currentOdds - result.oddsAtAnalysis) > ODDS_DRIFT_THRESHOLD) return true
  return false
}

/**
 * Store a quick analysis verdict for cross-cycle reuse.
 * Skips storing rate-limit fallback responses (low signal — let next cycle retry).
 */
export function setQuickResult(marketId: string, question: string, analysis: LLMMarketAnalysis, oddsAtAnalysis: number): void {
  // Don't persist obvious rate-limit fallbacks — they have no real signal and would block
  // the market from being properly analyzed for the full TTL window.
  if (isRateLimitFallback(analysis)) return

  const cache = getCache()
  cache.results[marketId] = {
    marketId,
    question,
    analysis,
    oddsAtAnalysis,
    analysisTimestamp: Date.now(),
  }
  writeCache(cache)
  // Update mem cache so subsequent reads in the same process see it immediately
  memCache = cache
  memCacheLoaded = Date.now()
}

/**
 * Detect Groq rate-limit / parse-failure fallback responses.
 *
 * The 8B fallback shape (observed empirically when Groq throttles or returns malformed JSON):
 *   shouldBet=false, edgeSize=0, confidence='low', reasoning is generic/short
 *
 * Real "skip" verdicts from a successful LLM call have either:
 *   - Higher confidence ('medium'/'high') — model is sure there's no edge
 *   - Non-zero edge calculation — model actually computed
 *   - Substantive reasoning (>120 chars) — model wrote real analysis
 *
 * Note: evidenceCount alone isn't a signal because we always attach evidence upstream
 * (it's the input, not a verdict-quality marker).
 */
export function isRateLimitFallback(analysis: LLMMarketAnalysis): boolean {
  if (analysis.shouldBet) return false                     // any positive bet is real signal
  if (analysis.edgeSize > 0.01) return false               // model computed something
  if (analysis.confidence !== 'low') return false          // medium/high = real assessment
  // At this point: shouldBet=false, edge≈0, confidence=low → throttle shape unless reasoning is substantive
  const reasoning = analysis.reasoning || ''
  if (reasoning.length > 120) return false                 // model wrote real analysis
  return true
}

/**
 * Stats for diagnostics.
 */
export function getQuickCacheStats(): { count: number; oldestAgeMs: number | null } {
  const cache = getCache()
  const entries = Object.values(cache.results)
  if (entries.length === 0) return { count: 0, oldestAgeMs: null }
  const now = Date.now()
  const oldest = Math.max(...entries.map(e => now - e.analysisTimestamp))
  return { count: entries.length, oldestAgeMs: oldest }
}
