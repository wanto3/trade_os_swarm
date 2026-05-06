/**
 * /api/polymarket/resolve-only — lightweight resolution endpoint.
 *
 * Designed for cron / keep-alive use. Runs runResolutionOnly() (which polls
 * Polymarket Gamma API for closed markets and updates matching open
 * positions) WITHOUT triggering the screening pipeline. No Opus calls, no
 * Max-subscription burn, no LLM cost. Just:
 *   - Hit Gamma API for closed-market outcomes (free)
 *   - Resolve any matching open positions
 *   - Append bankroll + daily snapshots
 *   - Return a small summary
 *
 * The full /api/polymarket route still runs the Opus pipeline on dashboard
 * loads (where the user is actively looking for opportunities). This route
 * exists so background cron can keep positions current and the Render
 * container warm without spending Opus tokens.
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { runResolutionOnly } = await import('@/lib/services/polymarket-auto-trader')
    const { ensureInitialized, getPortfolio, getPositions } = await import('@/lib/services/polymarket-portfolio.service')

    await ensureInitialized()
    const result = await runResolutionOnly()
    const portfolio = getPortfolio()
    const open = getPositions(true).length

    return NextResponse.json({
      success: true,
      timestamp: Date.now(),
      resolved: result.resolved,
      errors: result.errors,
      portfolio: {
        bankroll: portfolio.bankroll,
        totalPnl: portfolio.totalPnl,
        wonTrades: portfolio.wonTrades,
        lostTrades: portfolio.lostTrades,
        openPositions: open,
      },
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
      timestamp: Date.now(),
    }, { status: 500 })
  }
}
