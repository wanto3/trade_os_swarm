import { NextResponse } from 'next/server'
import { runDailyAutoTradeIfDue } from '@/lib/services/polymarket-auto-trader'

export const dynamic = 'force-dynamic'

/**
 * Internal endpoint invoked by the hourly setInterval in instrumentation.ts.
 *
 * Keeps Node.js `fs`/`path` imports out of the instrumentation bundle —
 * instrumentation.ts uses a plain fetch() call here instead of a dynamic
 * import, which avoids Next.js bundling polymarket-auto-trader (and its
 * transitive `fs` deps) into the edge runtime.
 *
 * NOT intended for end-user calls. No auth guard needed because:
 *   - No funds are at risk (paper trades only)
 *   - The endpoint is a no-op when testModeEnabled=false
 *   - The function itself is idempotent (lastDailyRunAt prevents double-fire)
 */
export async function POST() {
  try {
    const result = await runDailyAutoTradeIfDue()
    return NextResponse.json({ success: true, ...result })
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
