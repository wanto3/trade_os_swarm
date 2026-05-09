import { NextRequest, NextResponse } from 'next/server'
import {
  ensureInitialized,
  getPositions,
  getPortfolio,
  cancelPosition,
  setBankroll,
  resolvePosition,
} from '@/lib/services/polymarket-portfolio.service'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await ensureInitialized()
    const searchParams = request.nextUrl.searchParams
    const openOnly = searchParams.get('open') === 'true'

    const positions = getPositions(openOnly)
    const portfolio = getPortfolio()

    return NextResponse.json({
      success: true,
      data: { positions, portfolio },
      timestamp: Date.now()
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 })
  }
}

/**
 * DELETE /api/polymarket/positions?id=<positionId>
 * Cancels an OPEN paper position — refunds the stake to bankroll and
 * removes the position. Use case: "I clicked Place by accident."
 *
 * Cannot cancel resolved positions (won/lost) — that would mess with
 * realized PnL accounting. Use the reset endpoint for a full wipe.
 */
export async function DELETE(request: NextRequest) {
  try {
    await ensureInitialized()
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Missing required query param: id',
      }, { status: 400 })
    }
    const canceled = cancelPosition(id)
    if (!canceled) {
      return NextResponse.json({
        success: false,
        error: 'Position not found or already resolved (won/lost). Use reset to clear all positions.',
      }, { status: 400 })
    }
    return NextResponse.json({
      success: true,
      data: {
        canceled,
        portfolio: getPortfolio(),
      },
      timestamp: Date.now(),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * PATCH /api/polymarket/positions
 * Body: { bankroll: number, alsoSetStarting?: boolean }
 * Manually edit the bankroll. Use cases: typo'd starting bankroll,
 * reconciling against external source. Snapshots an 'init' event so the
 * compounding curve reflects the adjustment.
 */
export async function PATCH(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json()
    const newBankroll = Number(body.bankroll)
    const alsoSetStarting = Boolean(body.alsoSetStarting)
    if (!isFinite(newBankroll) || newBankroll < 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid bankroll value — must be a non-negative number',
      }, { status: 400 })
    }
    const updated = setBankroll(newBankroll, alsoSetStarting)
    return NextResponse.json({
      success: true,
      data: { portfolio: updated },
      timestamp: Date.now(),
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * POST /api/polymarket/positions
 * Body: { id: string, resolution: 'yes' | 'no' | 'invalid' }
 *
 * Manually resolve a position to won/lost. Use cases:
 *   - Imported positions with synthetic marketIds that can't auto-resolve
 *   - Override an auto-resolution that came through wrong
 *   - Mark a position resolved before its end date (early settlement)
 *
 * Resolution logic mirrors the auto-resolve path:
 *   - yes/no maps to outcome → won if matches user's bet, lost otherwise
 *   - invalid refunds the cost (treated as void market)
 * Updates bankroll + bankrollHistory + dailyPerformance via the same
 * helpers, so manual + auto-resolutions appear identically in analytics.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json()
    const id = String(body.id || '')
    const resolution = body.resolution as 'yes' | 'no' | 'invalid'
    if (!id) {
      return NextResponse.json({
        success: false,
        error: 'Missing required field: id',
      }, { status: 400 })
    }
    if (!['yes', 'no', 'invalid'].includes(resolution)) {
      return NextResponse.json({
        success: false,
        error: "resolution must be one of: 'yes', 'no', 'invalid'",
      }, { status: 400 })
    }
    const resolved = resolvePosition(id, resolution)
    if (!resolved) {
      return NextResponse.json({
        success: false,
        error: 'Position not found or already resolved',
      }, { status: 400 })
    }
    return NextResponse.json({
      success: true,
      data: {
        position: resolved,
        portfolio: getPortfolio(),
      },
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
