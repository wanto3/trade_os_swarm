import { NextRequest, NextResponse } from 'next/server'
import { ensureInitialized, createPosition } from '@/lib/services/polymarket-portfolio.service'
import type { TradeRecommendation } from '@/app/api/polymarket/route'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body: TradeRecommendation = await request.json()

    if (!body.market?.id || !body.outcome) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: market.id and outcome',
        timestamp: Date.now()
      }, { status: 400 })
    }

    const position = createPosition(body)

    if (!position) {
      return NextResponse.json({
        success: false,
        error: 'Could not place trade — check guardrails (max positions, bankroll, or market closing soon)',
        timestamp: Date.now()
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: position,
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
