import { NextRequest, NextResponse } from 'next/server'
import { scanCrossPlatformArbitrage } from '@/lib/services/cross-platform-arbitrage.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const requestedShares = Number(request.nextUrl.searchParams.get('shares') || 10)
  const marketLimit = Number(request.nextUrl.searchParams.get('marketLimit') || 100)
  const minSimilarity = Number(request.nextUrl.searchParams.get('similarity') || 0.60)
  const transferBuffer = Number(request.nextUrl.searchParams.get('transferBuffer') || 0.05)

  try {
    const result = await scanCrossPlatformArbitrage({
      requestedShares,
      marketLimit,
      minSimilarity,
      transferBuffer,
    })
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    })
  } catch (error) {
    console.error('[CrossPlatformScanner] Scan failed:', error)
    return NextResponse.json({
      success: false,
      paperOnly: true,
      error: error instanceof Error ? error.message : 'Cross-platform scan failed',
    }, { status: 502 })
  }
}
