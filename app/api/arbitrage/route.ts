import { NextRequest, NextResponse } from 'next/server'
import { scanCompleteSetArbitrage } from '@/lib/services/polymarket-arbitrage.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const requestedShares = Number(request.nextUrl.searchParams.get('shares') || 10)
  const marketLimit = Number(request.nextUrl.searchParams.get('marketLimit') || 100)

  try {
    const result = await scanCompleteSetArbitrage({ requestedShares, marketLimit })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[ArbitrageScanner] Scan failed:', error)
    return NextResponse.json({
      success: false,
      paperOnly: true,
      error: error instanceof Error ? error.message : 'Arbitrage scan failed',
    }, { status: 502 })
  }
}
