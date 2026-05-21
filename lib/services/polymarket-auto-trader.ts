import type { TradeRecommendation, ConvictionBreakdown, TimeAnalysis, ConvictionLabel } from '@/app/api/polymarket/route'
import {
  ensureInitialized,
  getConfig,
  updateConfig,
  getPositions,
  getOpenPositionByMarketId,
  createPosition,
  resolvePosition,
} from './polymarket-portfolio.service'

function getConvictionLabel(score: number): ConvictionLabel {
  if (score >= 90) return 'no-brainer'
  if (score >= 75) return 'high'
  if (score >= 55) return 'consider'
  return 'risky'
}

const POLL_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

let lastPollTime = 0
let intervalHandle: NodeJS.Timeout | null = null

async function fetchOpportunities(): Promise<TradeRecommendation[]> {
  try {
    // Single source of truth: the API route runs the edge-engine pipeline.
    // This eliminates the duplicate keyword pipeline that used to live here.
    const baseUrl = process.env.INTERNAL_API_BASE || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/polymarket`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`Internal API error: ${res.status}`)
    const data = await res.json()
    return (data.opportunities || []) as TradeRecommendation[]
  } catch (error) {
    console.error('[PolymarketAutoTrader] Failed to fetch opportunities:', error)
    return []
  }
}


async function fetchClosedMarkets(marketIds: string[]): Promise<Map<string, 'yes' | 'no' | 'invalid'>> {
  const results = new Map<string, 'yes' | 'no' | 'invalid'>()
  if (marketIds.length === 0) return results

  // Fetch closed markets from Gamma API
  try {
    const res = await fetch(
      `https://gamma-api.polymarket.com/markets?closed=true&accepting_orders=false&limit=200`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' }
    )
    if (!res.ok) return results
    const markets: any[] = await res.json()

    const marketIdSet = new Set(marketIds)
    for (const m of markets) {
      if (marketIdSet.has(m.id)) {
        // Determine resolution
        const resolution = (m.resolution || '').toLowerCase()
        const outcomes = m.outcomes ? JSON.parse(m.outcomes) : ['Yes', 'No']
        const outcomePrices = m.outcomePrices ? JSON.parse(m.outcomePrices) : []

        let resolvedAs: 'yes' | 'no' | 'invalid' = 'invalid'
        if (resolution === outcomes[0]?.toLowerCase() || resolution === 'yes' || resolution === '1') {
          resolvedAs = 'yes'
        } else if (resolution === outcomes[1]?.toLowerCase() || resolution === 'no' || resolution === '0') {
          resolvedAs = 'no'
        } else if (resolution && resolution !== '') {
          // Try to match by outcome string
          const idx = outcomes.findIndex((o: string) => o.toLowerCase() === resolution.toLowerCase())
          resolvedAs = idx === 0 ? 'yes' : idx === 1 ? 'no' : 'invalid'
        } else {
          // Fall back to highest price outcome
          if (outcomePrices.length >= 2) {
            resolvedAs = outcomePrices[0] > outcomePrices[1] ? 'yes' : 'no'
          }
        }

        results.set(m.id, resolvedAs)
      }
    }
  } catch (error) {
    console.error('[PolymarketAutoTrader] Failed to fetch closed markets:', error)
  }

  return results
}

async function runPollCycle(): Promise<{ placed: number; resolved: number; errors: string[] }> {
  const result: { placed: number; resolved: number; errors: string[] } = { placed: 0, resolved: 0, errors: [] }

  try {
    await ensureInitialized()
    const cfg = getConfig()

    if (cfg.enabled) {
      // ── Placement Phase ──
      const opportunities = await fetchOpportunities()
      const openPositions = getPositions(true)

      for (const rec of opportunities) {
        if (cfg.confidenceFilter === 'high' && rec.confidence !== 'high') continue

        // Skip if already placed
        if (openPositions.some(p => p.marketId === rec.market.id)) continue

        const position = createPosition(rec)
        if (position) result.placed++
      }
    }

    // ── Resolution Phase ──
    const openPositions = getPositions(true)
    if (openPositions.length > 0) {
      const marketIds = openPositions.map(p => p.marketId)
      const resolutions = await fetchClosedMarkets(marketIds)

      for (const pos of openPositions) {
        const now = Date.now()

        // Flag stale positions (> 90 days) for manual review
        const age = now - pos.placedAt
        if (age > 90 * 24 * 60 * 60 * 1000) {
          console.log(`[PolymarketAutoTrader] Stale position flagged: ${pos.question} (${Math.floor(age / (24 * 60 * 60 * 1000))} days old)`)
        }

        // Try to resolve from closed markets
        const resolution = resolutions.get(pos.marketId)
        if (resolution) {
          resolvePosition(pos.id, resolution as 'yes' | 'no' | 'invalid')
          result.resolved++
        }
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    console.error('[PolymarketAutoTrader] Poll cycle error:', error)
  }

  return result
}

/**
 * Place qualifying recommendations as paper auto-trades.
 *
 * Used by the "Algorithm Test Mode" — the API route calls this after
 * each screening cycle when test mode is enabled. Filters to picks
 * that the LLM is confident enough about that a hands-off test should
 * place them (high/medium confidence + ≥5pt edge + shouldBet=true).
 *
 * Returns placed/skipped counts so the caller can log/display them.
 * Never throws — individual createPosition failures are collected as
 * errors and reported, but the function continues processing the rest.
 */
export async function placeOpportunitiesAsPaper(
  opportunities: TradeRecommendation[]
): Promise<{ placed: number; skipped: number; errors: string[] }> {
  await ensureInitialized()
  const result: { placed: number; skipped: number; errors: string[] } = {
    placed: 0,
    skipped: 0,
    errors: [],
  }

  const openPositions = getPositions(true)
  const openMarketIds = new Set(openPositions.map(p => p.marketId))

  for (const rec of opportunities) {
    // Filter 1: LLM must have emitted a concrete direction (yes/no), not 'skip'
    // 'skip' means the model declined to bet; undefined means pre-LLM rec (rare).
    if (!rec.llmDirection || rec.llmDirection === 'skip') {
      result.skipped++
      continue
    }
    // Filter 2: high or medium confidence only (no low)
    if (rec.confidence !== 'high' && rec.confidence !== 'medium') {
      result.skipped++
      continue
    }
    // Filter 3: ≥5pt edge floor (mirrors FILTER 2 in the UI)
    const edgePts = Math.abs((rec.estimatedProbability - rec.odds) * 100)
    if (edgePts < 5) {
      result.skipped++
      continue
    }
    // Already-placed guard
    if (openMarketIds.has(rec.market.id)) {
      result.skipped++
      continue
    }
    // Place it
    try {
      const position = createPosition(rec)
      if (position) {
        result.placed++
        openMarketIds.add(rec.market.id)
      } else {
        result.skipped++
      }
    } catch (e) {
      result.errors.push(
        `${rec.market.id}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  if (result.placed > 0 || result.errors.length > 0) {
    console.log(
      `[PolymarketAutoTrader] Test mode: placed ${result.placed}, skipped ${result.skipped}, errors ${result.errors.length}`
    )
  }
  return result
}

const DAILY_INTERVAL_MS = 23 * 60 * 60 * 1000  // 23h (allow some drift around 24h)

/**
 * Daily auto-trade scheduler tick.
 *
 * Called every hour by the setInterval in instrumentation.ts. Checks
 * if 23+ hours have elapsed since the last firing (from persisted
 * config). If yes, fetches the latest screening output, calls
 * placeOpportunitiesAsPaper, and updates lastDailyRunAt. If no, no-op.
 *
 * Skips placement entirely when testModeEnabled is false — the
 * scheduler still ticks and logs, but doesn't touch any positions.
 *
 * Token cost: $0 when test mode is off (no LLM calls). When test mode
 * is on, fires a single screening cycle per day (~same cost as one
 * dashboard refresh).
 *
 * Never throws — wraps the whole cycle in try/catch.
 */
export async function runDailyAutoTradeIfDue(): Promise<{
  fired: boolean
  placed: number
  reason: string
  hoursUntilNext: number
}> {
  try {
    await ensureInitialized()
    const cfg = getConfig()
    const now = Date.now()
    const last = cfg.lastDailyRunAt ?? 0
    const elapsedMs = now - last
    const hoursUntilNext = Math.max(0, (DAILY_INTERVAL_MS - elapsedMs) / 3_600_000)

    if (elapsedMs < DAILY_INTERVAL_MS) {
      return { fired: false, placed: 0, reason: 'not yet due', hoursUntilNext }
    }

    // Eagerly write lastDailyRunAt BEFORE running the cycle so a slow
    // pipeline (or a crash) doesn't cause a second tick to also fire.
    await updateConfig({ lastDailyRunAt: now })

    if (!cfg.testModeEnabled) {
      console.log('[DailyScheduler] Tick fired but testModeEnabled=false — skipping placement')
      return { fired: false, placed: 0, reason: 'test mode disabled', hoursUntilNext: 23 }
    }

    // Fetch latest opportunities via the internal API. We can't call
    // the screening service directly here because it lives in a
    // dynamic-import path. The internal HTTP fetch is the established
    // pattern (see fetchOpportunities elsewhere in this file).
    const baseUrl = process.env.INTERNAL_API_BASE || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/polymarket`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.warn(`[DailyScheduler] Fetch failed: HTTP ${res.status}`)
      return { fired: false, placed: 0, reason: `fetch http ${res.status}`, hoursUntilNext: 23 }
    }
    const data = await res.json()
    const opportunities = (data.opportunities || []) as TradeRecommendation[]

    const result = await placeOpportunitiesAsPaper(opportunities)
    console.log(`[DailyScheduler] Fired daily cycle — placed ${result.placed}, skipped ${result.skipped}, errors ${result.errors.length}`)
    return {
      fired: true,
      placed: result.placed,
      reason: `placed ${result.placed} of ${opportunities.length} opportunities`,
      hoursUntilNext: 23,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[DailyScheduler] Tick failed:', msg)
    return { fired: false, placed: 0, reason: `error: ${msg}`, hoursUntilNext: 1 }
  }
}

export function startAutoTrader(): void {
  // Per project decision (2026-05-03): no background polling at all.
  // Operating model is bet-cycle driven:
  //   - Analysis runs on-demand when the dashboard hits /api/polymarket
  //   - Position resolution runs lazily inside the same API call (see route.ts)
  //   - Manual placement is still available via triggerPollCycle()
  // This function is a no-op kept for backward compatibility with any existing callers.
  console.log('[PolymarketAutoTrader] Background polling disabled (on-demand mode)')
}

/**
 * Lazily resolve any open positions whose end-date has passed.
 * Called from the API GET route on each dashboard visit.
 */
export async function runResolutionOnly(): Promise<{ resolved: number; errors: string[] }> {
  const result: { resolved: number; errors: string[] } = { resolved: 0, errors: [] }
  try {
    await ensureInitialized()
    const openPositions = getPositions(true)
    if (openPositions.length === 0) return result

    // Pre-filter: only positions whose closing date has passed (or unknown)
    const now = Date.now()
    const candidates = openPositions.filter(p => {
      const closing = (p as unknown as { closingDate?: number }).closingDate
      return !closing || closing <= now
    })
    if (candidates.length === 0) return result

    const marketIds = candidates.map(p => p.marketId)
    const resolutions = await fetchClosedMarkets(marketIds)

    for (const pos of candidates) {
      const resolution = resolutions.get(pos.marketId)
      if (resolution) {
        resolvePosition(pos.id, resolution as 'yes' | 'no' | 'invalid')
        result.resolved++
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Unknown error')
    console.error('[PolymarketAutoTrader] Resolution check error:', error)
  }
  return result
}

export function stopAutoTrader(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log('[PolymarketAutoTrader] Stopped')
  }
}

export async function triggerPollCycle(): Promise<{ placed: number; resolved: number; errors: string[] }> {
  return runPollCycle()
}

export function isAutoTraderRunning(): boolean {
  return intervalHandle !== null
}
