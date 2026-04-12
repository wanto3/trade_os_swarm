import { NextResponse } from 'next/server'
import { resolvePortfolioEntries } from '@/lib/services/portfolio-tracker.service'
import { refreshLearningStats } from '@/lib/services/learning-feedback.service'

// POST — trigger resolution check
export async function POST() {
  try {
    const result = await resolvePortfolioEntries()
    if (result.resolved > 0) {
      await refreshLearningStats()
    }
    return NextResponse.json({
      success: true,
      data: {
        resolved: result.resolved,
        wins: result.wins,
        losses: result.losses,
        message: result.resolved > 0
          ? `Resolved ${result.resolved} entries: ${result.wins} wins, ${result.losses} losses`
          : 'No new resolutions found'
      }
    })
  } catch (error) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Resolution check failed'
    }, { status: 500 })
  }
}
