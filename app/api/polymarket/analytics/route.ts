import { NextResponse } from 'next/server'
import { ensureInitialized, getAnalytics } from '@/lib/services/polymarket-portfolio.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await ensureInitialized()
    const analytics = getAnalytics()

    return NextResponse.json({
      success: true,
      data: analytics,
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
