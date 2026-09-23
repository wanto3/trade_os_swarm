import { NextResponse } from 'next/server'
import { getPredictionMarketSnapshot } from '@/lib/services/prediction-markets.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  try {
    const snapshot = await getPredictionMarketSnapshot()
    return NextResponse.json(snapshot, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ paperOnly: true, error: error instanceof Error ? error.message : 'Market feeds unavailable' }, { status: 502 })
  }
}
