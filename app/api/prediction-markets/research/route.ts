import { NextRequest, NextResponse } from 'next/server'
import { getPredictionMarketSnapshot, type PredictionVenue } from '@/lib/services/prediction-markets.service'
import { gatherCategoryEvidence } from '@/lib/services/category-research.service'
import { analyzeMarketWithLLM } from '@/lib/services/groq-market-analysis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const researchCache = new Map<string, { expires: number; value: unknown }>()

export async function POST(request: NextRequest) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'Model research is not configured. Set GROQ_API_KEY on the server.' }, { status: 503 })
  }

  let body: { id?: string; venue?: PredictionVenue }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (typeof body.id !== 'string' || !['kalshi', 'polymarket'].includes(body.venue ?? '')) {
    return NextResponse.json({ error: 'Choose a market from the live dashboard.' }, { status: 400 })
  }

  const key = `${body.venue}:${body.id}`
  const previous = researchCache.get(key)
  if (previous && previous.expires > Date.now()) return NextResponse.json(previous.value)

  try {
    const snapshot = await getPredictionMarketSnapshot()
    const market = snapshot.markets.find(item => item.venue === body.venue && item.id === body.id)
    if (!market || market.yesAsk === null) {
      return NextResponse.json({ error: 'Market or first-outcome ask unavailable.' }, { status: 404 })
    }
    if (market.outcomes[0].toLowerCase() !== 'yes' || market.outcomes[1].toLowerCase() !== 'no') {
      return NextResponse.json({ error: 'This model prompt supports explicit YES/NO contracts only.' }, { status: 422 })
    }
    const evidence = await gatherCategoryEvidence(market.title)
    const analysis = await analyzeMarketWithLLM({
      question: market.title,
      currentPrice: market.yesAsk,
      outcomes: market.outcomes,
      endDate: market.closeTime,
      volume: market.volume24h,
      liquidity: 0,
    }, evidence, 'llama-3.3-70b-versatile')
    const value = {
      market: { id: market.id, venue: market.venue, title: market.title, yesAsk: market.yesAsk },
      model: 'llama-3.3-70b-versatile', generatedAt: new Date().toISOString(),
      estimate: analysis.estimatedProbability, confidence: analysis.confidence,
      uncertaintyRange: analysis.uncertaintyRange, reasoning: analysis.reasoning,
      citedEvidence: analysis.evidence, premortemRisks: analysis.premortemRisks,
      evidenceCount: analysis.evidenceCount, signalStrength: analysis.signalStrength,
      disclaimer: 'Model-generated research, not a calibrated probability or trade recommendation. Verify sources and contract rules independently.',
    }
    researchCache.set(key, { expires: Date.now() + 10 * 60_000, value })
    return NextResponse.json(value)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Research unavailable' }, { status: 502 })
  }
}
