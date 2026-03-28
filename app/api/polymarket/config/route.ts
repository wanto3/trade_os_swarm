import { NextRequest, NextResponse } from 'next/server'
import {
  ensureInitialized,
  getConfig,
  updateConfig,
  resetPortfolio,
} from '@/lib/services/polymarket-portfolio.service'
import { startAutoTrader, stopAutoTrader } from '@/lib/services/polymarket-auto-trader'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureInitialized()
    const config = getConfig()

    return NextResponse.json({
      success: true,
      data: config,
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

export async function PUT(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json()

    const updated = updateConfig({
      enabled: body.enabled,
      kellyMode: body.kellyMode,
      confidenceFilter: body.confidenceFilter,
      maxOpenPositions: body.maxOpenPositions,
      maxBetSizePercent: body.maxBetSizePercent,
      startingBankroll: body.startingBankroll,
    })

    // Start or stop autotrader based on enabled state
    if (updated.enabled) {
      startAutoTrader()
    } else {
      stopAutoTrader()
    }

    return NextResponse.json({
      success: true,
      data: updated,
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

export async function DELETE() {
  try {
    await ensureInitialized()
    await resetPortfolio()

    return NextResponse.json({
      success: true,
      message: 'Portfolio reset',
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
