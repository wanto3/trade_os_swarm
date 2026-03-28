import { NextRequest, NextResponse } from 'next/server'
import { ensureInitialized, getPositions, getPortfolio } from '@/lib/services/polymarket-portfolio.service'

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
