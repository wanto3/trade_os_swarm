import { NextRequest, NextResponse } from 'next/server'
import { ensureInitialized, resetTestMode } from '@/lib/services/polymarket-portfolio.service'

export const dynamic = 'force-dynamic'

/**
 * POST /api/polymarket/reset-test
 * Body: { amount?: number }  (default 10)
 *
 * Wipes auto-placed paper positions and resets bankroll to the given
 * amount. Preserves manual + imported positions. Used to start a clean
 * Algorithm Test Mode run.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json().catch(() => ({}))
    const amount = typeof body.amount === 'number' && body.amount > 0 ? body.amount : 10
    const updated = resetTestMode(amount)
    return NextResponse.json({
      success: true,
      portfolio: updated,
      bankroll: updated.bankroll,
      startingBankroll: updated.startingBankroll,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
