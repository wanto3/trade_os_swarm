import { NextResponse } from 'next/server'
import { getDeepStatus, isDeepRunStale, runDeepAnalysis } from '@/lib/services/deep-analysis.service'

export const dynamic = 'force-dynamic'

/**
 * GET /api/polymarket/deep
 * Returns deep analysis status: lastRun, duration, marketsAnalyzed, isStale
 */
export async function GET() {
  try {
    const status = getDeepStatus()
    return NextResponse.json({
      ...status,
      isStale: isDeepRunStale(),
    })
  } catch (error) {
    console.error('[Deep API] GET error:', error)
    return NextResponse.json({ error: 'Failed to get deep analysis status' }, { status: 500 })
  }
}

/**
 * POST /api/polymarket/deep
 * Triggers a deep analysis run.
 * Body: { markets: [...], maxMarkets?: number }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { markets, maxMarkets } = body

    if (!markets || !Array.isArray(markets)) {
      return NextResponse.json({ error: 'markets array is required' }, { status: 400 })
    }

    const result = await runDeepAnalysis(markets, maxMarkets)

    return NextResponse.json({
      analyzed: result.analyzed,
      duration: result.duration,
    })
  } catch (error) {
    console.error('[Deep API] POST error:', error)
    return NextResponse.json({ error: 'Deep analysis failed' }, { status: 500 })
  }
}
