import { NextRequest, NextResponse } from 'next/server'
import {
  addToPortfolio,
  removeFromPortfolio,
  getTodayPortfolio,
  getPortfolioHistory,
  getGlobalStats,
} from '@/lib/services/portfolio-tracker.service'

// GET — today's portfolio or history
export async function GET(request: NextRequest) {
  try {
    const view = request.nextUrl.searchParams.get('view') || 'today'
    const days = parseInt(request.nextUrl.searchParams.get('days') || '7', 10)

    if (view === 'history') {
      const history = getPortfolioHistory(days)
      const globalStats = getGlobalStats()
      return NextResponse.json({ success: true, data: { history, globalStats } })
    }

    const today = getTodayPortfolio()
    const globalStats = getGlobalStats()
    return NextResponse.json({ success: true, data: { today, globalStats } })
  } catch (error) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// POST — add to today's portfolio
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const entry = addToPortfolio({
      marketId: body.marketId,
      question: body.question,
      side: body.side || 'yes',
      entryOdds: body.entryOdds,
      convictionScore: body.convictionScore || 0,
      convictionLabel: body.convictionLabel || 'risky',
      evidenceSources: body.evidenceSources || [],
      analysisDepth: body.analysisDepth || 'quick',
      category: body.category || 'general',
      estimatedProbability: body.estimatedProbability || body.entryOdds,
      baseRate: body.baseRate || null,
      uncertaintyRange: body.uncertaintyRange || 0.15,
    })
    return NextResponse.json({ success: true, data: entry })
  } catch (error) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// DELETE — remove from today's portfolio
export async function DELETE(request: NextRequest) {
  try {
    const entryId = request.nextUrl.searchParams.get('id')
    if (!entryId) {
      return NextResponse.json({ success: false, error: 'Missing entry id' }, { status: 400 })
    }
    const removed = removeFromPortfolio(entryId)
    return NextResponse.json({ success: true, data: { removed } })
  } catch (error) {
    return NextResponse.json({
      success: false, error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
