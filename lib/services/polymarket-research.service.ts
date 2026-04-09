/**
 * Polymarket Research Service
 *
 * 5-layer conviction pipeline for scoring Polymarket opportunities:
 *   Layer 1: Sanity Filter
 *   Layer 2: Deep Research Engine (DuckDuckGo web search)
 *   Layer 3: Time / Closing-Soon Analysis
 *   Layer 4: Conviction Scorer
 *   Layer 5: Long-Tail Edge Detector
 *
 * Key principle: NO Math.random() — all probability estimates are derived
 * from real data and analysis.
 */

import type {
  ConvictionLabel,
  LongTailFlag,
  TimeTier,
  ResearchSummary,
  LongTailAnalysis,
  TimeAnalysis,
  ConvictionBreakdown,
  TradeRecommendation,
  PolymarketMarket,
} from '@/app/api/polymarket/route'

// ─── MarketScoringInput ───────────────────────────────────────────────────────

export interface MarketScoringInput {
  id: string
  question: string
  outcomes: string | string[]   // comes as JSON string from API
  outcomePrices: string | number[]  // comes as JSON string from API
  volumeNum: number
  liquidityNum: number
  volume24hr: number
  bestBid: string | null
  bestAsk: string | null
  spread: string | null
  endDateIso: string | null
  slug: string | null
  competitive: number | null
  negRisk: boolean
  events: { slug: string }[]
}

// ─── Internal helpers for parsing inputs ─────────────────────────────────────

function parseOutcomes(outcomes: string | string[]): string[] {
  if (Array.isArray(outcomes)) return outcomes
  try {
    const parsed = JSON.parse(outcomes)
    return Array.isArray(parsed) ? parsed : ['Yes', 'No']
  } catch {
    return ['Yes', 'No']
  }
}

function parseOutcomePrices(prices: string | number[]): number[] {
  if (Array.isArray(prices)) return prices.map(Number).filter(p => !isNaN(p) && p > 0 && p < 1)
  try {
    const parsed = JSON.parse(prices)
    return Array.isArray(parsed) ? parsed.map(Number).filter(p => !isNaN(p) && p > 0 && p < 1) : []
  } catch {
    return []
  }
}

function parseSpread(spread: string | null | number): number {
  if (spread === null || spread === undefined) return 0.02
  if (typeof spread === 'number') return spread
  const parsed = parseFloat(spread)
  return isNaN(parsed) ? 0.02 : parsed
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1: SANITY FILTER
// ═══════════════════════════════════════════════════════════════════════════════

const TRIVIAL_QUESTIONS = [
  'will 1+1 equal 2',
  'will tomorrow be tomorrow',
  'will the sun rise',
  'will gravity continue',
  'will water be wet',
]

const CERTAIN_PATTERNS: RegExp[] = [
  /^will (i|you|he|she|it|they|we) .+\s+exist$/i,
  /will \d+ be (greater|less|larger|smaller) than \d+/i,
  /will .+ (be true|occur|happen|exist) (in |on |at )?(the )?(past|future)$/i,
  /will .+ (equal|be|remain) .+$/i,
  /will .+ (always|never) .+$/i,
  /will \w+ (continue|work|function) as \w+$/i,
]

export interface SanityResult {
  passed: boolean
  reason?: string
}

export function passSanityFilter(
  question: string,
  endDateIso: string | null,
  outcomePrices: number[],
  liquidityNum: number,
  negRisk: boolean
): SanityResult {
  // 1. End date already passed
  if (endDateIso) {
    const endDate = new Date(endDateIso)
    if (endDate.getTime() < Date.now()) {
      return { passed: false, reason: 'Market end date has already passed' }
    }
  }

  // 2. Less than 2 valid outcomes
  const validPrices = outcomePrices.filter(p => !isNaN(p) && p > 0 && p < 1)
  if (validPrices.length < 2) {
    return { passed: false, reason: 'Fewer than 2 valid outcomes — market may already be settled' }
  }

  // 3. NegRisk
  if (negRisk) {
    return { passed: false, reason: 'NegRisk markets are not supported for standalone analysis' }
  }

  // 4. Min liquidity
  if (liquidityNum < 500) {
    return { passed: false, reason: `Insufficient liquidity: $${liquidityNum.toFixed(0)} < $500` }
  }

  // 5. Empty or too-short question
  if (!question || question.trim().length < 5) {
    return { passed: false, reason: 'Question text is empty or too short' }
  }

  // 6. Trivial questions
  const qLower = question.toLowerCase().trim()
  for (const trivial of TRIVIAL_QUESTIONS) {
    if (qLower === trivial || qLower.includes(trivial)) {
      return { passed: false, reason: 'Question is trivially certain' }
    }
  }

  // 7. Logically certain patterns
  for (const pattern of CERTAIN_PATTERNS) {
    if (pattern.test(qLower)) {
      return { passed: false, reason: 'Question matches a logically certain pattern' }
    }
  }

  return { passed: true }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 2: DEEP RESEARCH ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

const BULLISH_SIGNALS = [
  'likely', 'confirmed', 'approved', 'passed', 'winning', 'ahead',
  'support', 'bullish', 'growth', 'increase', 'adoption', 'breakthrough',
  'success', 'positive', 'upgrade', 'all-time', 'high', 'record',
  'elected', 'signed', 'enacted', 'legal', 'won',
]

const BEARISH_SIGNALS = [
  'unlikely', 'rejected', 'failed', 'losing', 'behind', 'resistance',
  'bearish', 'decline', 'decrease', 'ban', 'crackdown', 'loss',
  'negative', 'downgrade', 'low', 'rejected', 'lost', 'defeated',
  'vetoed', 'struck down', 'illegal', 'penalty',
]

function analyzeSentiment(text: string, _category: string): 'bullish' | 'bearish' | 'neutral' | 'mixed' {
  const lowerText = text.toLowerCase()
  let bullishCount = 0
  let bearishCount = 0

  for (const signal of BULLISH_SIGNALS) {
    const regex = new RegExp(`\\b${signal}\\b`, 'gi')
    const matches = lowerText.match(regex)
    if (matches) bullishCount += matches.length
  }

  for (const signal of BEARISH_SIGNALS) {
    const regex = new RegExp(`\\b${signal}\\b`, 'gi')
    const matches = lowerText.match(regex)
    if (matches) bearishCount += matches.length
  }

  if (bullishCount === 0 && bearishCount === 0) return 'neutral'
  if (bullishCount > bearishCount * 1.5) return 'bullish'
  if (bearishCount > bullishCount * 1.5) return 'bearish'
  return 'mixed'
}

function cleanQuestionForSearch(question: string): string {
  return question
    .replace(/[?!.,;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 120)
}

function buildKeyInsight(
  question: string,
  marketProb: number,
  findings: string[],
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed',
  _category: string
): string {
  if (findings.length === 0) {
    return `Limited online data available for "${question.substring(0, 60)}..." — market price ${(marketProb * 100).toFixed(1)}% may reflect thin information.`
  }

  const firstFinding = findings[0] || 'No specific data found'
  const sentimentWord = sentiment === 'bullish' ? 'supporting' : sentiment === 'bearish' ? 'opposing' : 'neutral regarding'
  const probWord = marketProb >= 0.5 ? 'high' : 'low'

  return `${firstFinding.substring(0, 120)}. Overall sentiment is ${sentiment}, ${sentimentWord} the current ${probWord}-priced market.`
}

interface DuckDuckGoResult {
  Title?: string
  Text?: string
  Result?: string
  FirstURL?: string
}

interface DuckDuckGoResponse {
  RelatedTopics?: DuckDuckGoResult[]
  AbstractText?: string
  Abstract?: string
  Heading?: string
}

export async function runDeepResearch(
  question: string,
  marketProb: number,
  category: 'policy' | 'crypto' | 'sports' | 'general'
): Promise<ResearchSummary> {
  const cleanedQuestion = cleanQuestionForSearch(question)
  const query = `${cleanedQuestion} 2026 news update`
  const encodedQuery = encodeURIComponent(query)
  const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`

  let topFindings: string[] = []
  let combinedText = ''

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 }, // cache for 5 minutes
    })

    if (response.ok) {
      const data: DuckDuckGoResponse = await response.json()

      // Extract from RelatedTopics (first 5 results)
      if (data.RelatedTopics && data.RelatedTopics.length > 0) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          const title = topic.Title || ''
          const text = topic.Text || topic.Result || ''
          if (title || text) {
            const combined = title && text ? `${title}: ${text}` : (title || text)
            if (combined.length > 20) {
              topFindings.push(combined.substring(0, 300))
              combinedText += ' ' + combined
            }
          }
        }
      }

      // Also include abstract
      if (data.AbstractText || data.Abstract) {
        const abstract = (data.AbstractText || data.Abstract || '').substring(0, 300)
        if (abstract.length > 20) {
          topFindings.unshift(abstract)
          combinedText += ' ' + abstract
        }
      }

      if (data.Heading) {
        combinedText += ' ' + data.Heading
      }
    }
  } catch {
    // Network errors — return empty research
  }

  const sentiment = analyzeSentiment(combinedText, category)
  const keyInsight = buildKeyInsight(question, marketProb, topFindings, sentiment, category)

  // Confidence based on number of findings
  let confidenceLevel: 'high' | 'medium' | 'low'
  if (topFindings.length >= 4) confidenceLevel = 'high'
  else if (topFindings.length >= 2) confidenceLevel = 'medium'
  else confidenceLevel = 'low'

  return {
    queryUsed: query,
    topFindings: topFindings.slice(0, 5),
    sentiment,
    keyInsight,
    confidenceLevel,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 3: TIME / CLOSING-SOON ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

export function analyzeTimeEdge(endDateIso: string | null, _market: MarketScoringInput): TimeAnalysis {
  let daysToClose = 999

  if (endDateIso) {
    const endDate = new Date(endDateIso)
    const now = Date.now()
    const msToClose = endDate.getTime() - now
    daysToClose = Math.max(0, Math.ceil(msToClose / (1000 * 60 * 60 * 24)))
  }

  let tier: TimeTier
  if (daysToClose <= 1) tier = 'imminent'
  else if (daysToClose <= 7) tier = 'closing-soon'
  else if (daysToClose <= 30) tier = 'medium'
  else tier = 'long'

  const closingSoonFactors: string[] = []

  if (tier === 'imminent') {
    closingSoonFactors.push('Resolution within 24 hours — maximum time pressure')
    closingSoonFactors.push('Minimal room for new information to shift probability')
  } else if (tier === 'closing-soon') {
    closingSoonFactors.push('Resolution within 7 days — high time urgency')
    if (daysToClose <= 3) {
      closingSoonFactors.push('Very short window — events should be near-decided')
    }
  } else if (tier === 'medium') {
    closingSoonFactors.push('Resolution within 30 days — moderate uncertainty window')
  } else {
    closingSoonFactors.push('Long-duration market — significant uncertainty remains')
  }

  let resolutionUncertainty: 'low' | 'medium' | 'high'
  if (tier === 'imminent') resolutionUncertainty = 'low'
  else if (tier === 'closing-soon') resolutionUncertainty = 'medium'
  else if (tier === 'medium') resolutionUncertainty = 'medium'
  else resolutionUncertainty = 'high'

  return {
    tier,
    daysToClose,
    closingSoonFactors,
    resolutionUncertainty,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 4: CONVICTION SCORER
// ═══════════════════════════════════════════════════════════════════════════════

function getConvictionLabel(score: number): ConvictionLabel {
  if (score >= 90) return 'no-brainer'
  if (score >= 75) return 'high'
  if (score >= 55) return 'consider'
  return 'risky'
}

function scoreLiquidityTier(liquidityNum: number): number {
  if (liquidityNum >= 100000) return 100
  if (liquidityNum >= 50000) return 85
  if (liquidityNum >= 25000) return 70
  if (liquidityNum >= 10000) return 55
  if (liquidityNum >= 5000) return 40
  if (liquidityNum >= 1000) return 25
  return 10
}

function scoreVolumeTier(volumeNum: number): number {
  if (volumeNum >= 1000000) return 100
  if (volumeNum >= 500000) return 85
  if (volumeNum >= 100000) return 70
  if (volumeNum >= 50000) return 55
  if (volumeNum >= 10000) return 40
  if (volumeNum >= 1000) return 25
  return 10
}

function scoreSpreadTier(spread: number): number {
  if (spread <= 0.01) return 100
  if (spread <= 0.02) return 85
  if (spread <= 0.03) return 70
  if (spread <= 0.05) return 55
  if (spread <= 0.10) return 40
  if (spread <= 0.20) return 25
  return 10
}

function scoreTimeEdge(tier: TimeTier, uncertainty: 'low' | 'medium' | 'high'): number {
  let base: number
  switch (tier) {
    case 'imminent': base = 95; break
    case 'closing-soon': base = 75; break
    case 'medium': base = 55; break
    case 'long': base = 35; break
    default: base = 50
  }

  // Adjust for uncertainty
  let uncertaintyAdj = 0
  switch (uncertainty) {
    case 'low': uncertaintyAdj = 0; break
    case 'medium': uncertaintyAdj = -10; break
    case 'high': uncertaintyAdj = -20; break
  }

  return Math.max(0, Math.min(100, base + uncertaintyAdj))
}

function scoreResearchAlignment(
  probDiff: number,
  sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed',
  confidenceLevel: 'high' | 'medium' | 'low',
  outcomeIndex: number
): number {
  // probDiff: positive means research thinks higher than market
  const absDiff = Math.abs(probDiff)

  let sentimentAlignment = 0
  // outcomeIndex 0 = first outcome (usually "Yes"), 1 = second (usually "No")
  const isFirstOutcome = outcomeIndex === 0

  if (sentiment === 'bullish' && isFirstOutcome) {
    sentimentAlignment = probDiff > 0 ? 15 : -10
  } else if (sentiment === 'bearish' && isFirstOutcome) {
    sentimentAlignment = probDiff < 0 ? 15 : -10
  } else if (sentiment === 'bullish' && !isFirstOutcome) {
    sentimentAlignment = probDiff < 0 ? 15 : -10
  } else if (sentiment === 'bearish' && !isFirstOutcome) {
    sentimentAlignment = probDiff > 0 ? 15 : -10
  }
  // neutral/mixed: no adjustment

  // Confidence multiplier
  let confidenceMult: number
  switch (confidenceLevel) {
    case 'high': confidenceMult = 1.0
      break
    case 'medium': confidenceMult = 0.7
      break
    case 'low': confidenceMult = 0.3
      break
  }

  // Base alignment from probability difference
  // |diff| >= 0.15 = max score, |diff| = 0 = minimum score
  const diffScore = Math.min(100, absDiff * 500)

  return Math.max(0, Math.min(100, (diffScore + sentimentAlignment) * confidenceMult))
}

function scoreEVRationality(ev: number): number {
  const evPct = ev * 100
  // Sweet spot is 3-25% EV
  if (evPct >= 3 && evPct <= 25) return 100
  if (evPct > 25 && evPct <= 40) return 70
  if (evPct > 40 && evPct <= 50) return 40
  if (evPct >= 1 && evPct < 3) return 50
  if (evPct > 50) return 20
  return 0 // EV <= 0
}

export function assessConvictionScore(
  marketProb: number,
  estimatedProb: number,
  research: ResearchSummary,
  timeAnalysis: TimeAnalysis,
  liquidityNum: number,
  volumeNum: number,
  spread: number
): { score: number; breakdown: ConvictionBreakdown; label: ConvictionLabel } {
  const probDiff = estimatedProb - marketProb

  // Factor 1: Market Quality (20%)
  const liqScore = scoreLiquidityTier(liquidityNum)
  const volScore = scoreVolumeTier(volumeNum)
  const sprScore = scoreSpreadTier(spread)
  const marketQuality = (liqScore * 0.4 + volScore * 0.3 + sprScore * 0.3)

  // Factor 2: Time Edge (15%)
  const timeEdge = scoreTimeEdge(timeAnalysis.tier, timeAnalysis.resolutionUncertainty)

  // Factor 3: Research Alignment (30%) — estimate for outcome index 0 (first outcome)
  const researchAlignment = scoreResearchAlignment(
    probDiff,
    research.sentiment,
    research.confidenceLevel,
    0
  )

  // Factor 4: EV Rationality (5%)
  const ev = (estimatedProb - marketProb) / (1 - marketProb)
  const evRationality = scoreEVRationality(ev)

  // Weighted score
  const score = Math.round(
    researchAlignment * 0.30 +
    marketQuality * 0.20 +
    timeEdge * 0.15 +
    evRationality * 0.05
  )

  const label = getConvictionLabel(score)

  const breakdown: ConvictionBreakdown = {
    score,
    label,
    factors: {
      marketQuality: Math.round(marketQuality),
      timeEdge: Math.round(timeEdge),
      researchAlignment: Math.round(researchAlignment),
      evRationality: Math.round(evRationality),
    },
  }

  return { score, breakdown, label }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 5: LONG-TAIL EDGE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════════

function checkNearCertainEvidence(
  research: ResearchSummary,
  _question: string
): boolean {
  // High confidence + bullish sentiment, or 2+ bullish sources
  if (research.confidenceLevel === 'high' && research.sentiment === 'bullish') return true
  if (research.confidenceLevel === 'high' && research.sentiment === 'neutral') return true
  if (research.confidenceLevel === 'medium') {
    const bullishFindings = research.topFindings.filter(f =>
      BULLISH_SIGNALS.some(s => f.toLowerCase().includes(s))
    )
    if (bullishFindings.length >= 2) return true
  }
  return false
}

function checkNearImpossibleEvidence(
  research: ResearchSummary,
  _question: string
): boolean {
  // High confidence + bearish sentiment, or 2+ bearish sources
  if (research.confidenceLevel === 'high' && research.sentiment === 'bearish') return true
  if (research.confidenceLevel === 'high' && research.sentiment === 'neutral') return true
  if (research.confidenceLevel === 'medium') {
    const bearishFindings = research.topFindings.filter(f =>
      BEARISH_SIGNALS.some(s => f.toLowerCase().includes(s))
    )
    if (bearishFindings.length >= 2) return true
  }
  return false
}

export function detectLongTailEdges(
  marketProb: number,
  outcomeIndex: number,
  outcome: string,
  research: ResearchSummary,
  estimatedProb: number,
  question: string,
  liquidityNum: number
): LongTailAnalysis | null {
  // Near-Certain: marketProb >= 0.90, < 0.99
  if (marketProb >= 0.90 && marketProb < 0.99) {
    const hasEvidence = checkNearCertainEvidence(research, question)
    if (hasEvidence) {
      return {
        flag: 'near-certain',
        reasoning: `Market at ${(marketProb * 100).toFixed(1)}% with ${research.topFindings.length} confirmatory sources and ${research.sentiment} sentiment. Research confidence: ${research.confidenceLevel}.`,
        researchEvidence: research.topFindings.slice(0, 2).join('; ') || 'No specific sources found',
        alternativeOutcome: outcomeIndex === 0 ? 'No' : 'Yes',
      }
    }
  }

  // Near-Impossible: marketProb <= 0.10, > 0.01
  if (marketProb <= 0.10 && marketProb > 0.01) {
    const hasEvidence = checkNearImpossibleEvidence(research, question)
    if (hasEvidence) {
      return {
        flag: 'near-impossible',
        reasoning: `Market at ${(marketProb * 100).toFixed(1)}% with ${research.topFindings.length} contradictory sources and ${research.sentiment} sentiment. Research confidence: ${research.confidenceLevel}.`,
        researchEvidence: research.topFindings.slice(0, 2).join('; ') || 'No specific sources found',
        alternativeOutcome: outcomeIndex === 0 ? 'No' : 'Yes',
      }
    }
  }

  // Contrarian: |estimatedProb - marketProb| > 0.15 and they disagree
  const probDiff = Math.abs(estimatedProb - marketProb)
  if (probDiff > 0.15) {
    const researchThinksHigher = estimatedProb > marketProb
    const marketThinksHigher = marketProb > 0.5

    if (researchThinksHigher !== marketThinksHigher) {
      const alternativeOutcome = outcomeIndex === 0 ? 'No' : 'Yes'
      const altMarketProb = 1 - marketProb
      const altEV = (estimatedProb - altMarketProb) / (1 - altMarketProb)

      return {
        flag: 'contrarian',
        reasoning: `Research estimates ${(estimatedProb * 100).toFixed(1)}% vs market ${(marketProb * 100).toFixed(1)}% — a ${probDiff > 0.30 ? 'strong' : 'moderate'} disagreement. ${research.keyInsight}`,
        researchEvidence: research.topFindings.slice(0, 2).join('; ') || 'Research suggests alternative view',
        alternativeOutcome,
        estimatedAlternativeProb: 1 - estimatedProb,
        alternativeEV: altEV,
      }
    }
  }

  // Imminent high-liquidity near-certain: marketProb >= 0.70, research confirms, liquidity >= 50000
  if (marketProb >= 0.70 && liquidityNum >= 50000) {
    const hasEvidence = checkNearCertainEvidence(research, question)
    if (hasEvidence) {
      return {
        flag: 'near-certain',
        reasoning: `High-liquidity market ($${liquidityNum.toFixed(0)}) at ${(marketProb * 100).toFixed(1)}% with research confirmation of near-certainty. ${research.keyInsight}`,
        researchEvidence: research.topFindings.slice(0, 2).join('; ') || 'No specific sources found',
        alternativeOutcome: outcomeIndex === 0 ? 'No' : 'Yes',
      }
    }
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROBABILITY ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════════

export function estimateTrueProbability(
  marketProb: number,
  category: 'policy' | 'crypto' | 'sports' | 'general',
  research: ResearchSummary | null
): number {
  const CATEGORY_BIAS: Record<string, number> = {
    crypto: 0.01,
    sports: 0.01,
    policy: -0.02,
    general: 0.0,
  }

  let estimate = marketProb

  // Category bias
  const categoryBias = CATEGORY_BIAS[category] ?? 0.0
  estimate += categoryBias

  // Research adjustment — only if not low confidence
  if (research && research.confidenceLevel !== 'low') {
    const CONFIDENCE_MULT: Record<string, number> = {
      high: 1.0,
      medium: 0.5,
      low: 0.0,
    }
    const mult = CONFIDENCE_MULT[research.confidenceLevel] ?? 0.0

    let sentimentAdjustment = 0
    if (research.sentiment === 'bullish') sentimentAdjustment = 0.05
    else if (research.sentiment === 'bearish') sentimentAdjustment = -0.05
    // neutral/mixed: 0

    estimate += sentimentAdjustment * mult
  }

  // Clamp to reasonable bounds
  return Math.min(0.97, Math.max(0.03, estimate))
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function classifyCategory(question: string): 'policy' | 'crypto' | 'sports' | 'general' {
  const q = question.toLowerCase()
  if (/\b(fed|rate|tariff|election|presid(ent|ential)|congress|law|pass|convicted|inflation|jobs|nomination)\b/.test(q)) return 'policy'
  if (/\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|trump|meme|coin)\b/.test(q)) return 'crypto'
  if (/\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs)\b/.test(q)) return 'sports'
  return 'general'
}

export function buildResearchReasoning(
  question: string,
  research: ResearchSummary,
  timeAnalysis: TimeAnalysis,
  estimatedProb: number,
  marketProb: number
): string {
  const probDiff = estimatedProb - marketProb
  const diffWord = probDiff > 0 ? 'higher' : 'lower'
  const tierWord = timeAnalysis.tier === 'imminent' ? 'resolves imminently' :
    timeAnalysis.tier === 'closing-soon' ? 'closing soon' :
      timeAnalysis.tier === 'medium' ? 'medium-term' : 'long-duration'

  let reasoning = `${question.substring(0, 80)}${question.length > 80 ? '...' : ''} `
  reasoning += `Market at ${(marketProb * 100).toFixed(1)}%, research suggests ${(estimatedProb * 100).toFixed(1)}% (${Math.abs(probDiff * 100).toFixed(1)}% ${diffWord}). `
  reasoning += `Sentiment: ${research.sentiment}. ${timeAnalysis.closingSoonFactors[0] || ''} `

  if (research.topFindings.length > 0) {
    reasoning += `Key finding: "${research.topFindings[0].substring(0, 100)}"`
  } else {
    reasoning += 'Limited online data available.'
  }

  return reasoning.trim()
}

export function buildUpsideString(
  marketProb: number,
  estimatedProb: number,
  expectedValue: number,
  longTail: LongTailAnalysis | null
): string {
  let upside = `Market: ${(marketProb * 100).toFixed(1)}% -> Est: ${(estimatedProb * 100).toFixed(1)}% | EV: ${(expectedValue * 100) > 0 ? '+' : ''}${(expectedValue * 100).toFixed(1)}%`

  if (longTail) {
    if (longTail.flag === 'near-certain') {
      upside += ` | NEAR-CERTAIN: ${(marketProb * 100).toFixed(0)}% market + research confirmation`
    } else if (longTail.flag === 'near-impossible') {
      upside += ` | NEAR-IMPOSSIBLE: ${(marketProb * 100).toFixed(1)}% market — research contradicts`
    } else if (longTail.flag === 'contrarian') {
      upside += ` | CONTRARIAN: ${Math.abs((estimatedProb - marketProb) * 100).toFixed(1)}% disagreement`
    }
  }

  return upside
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ScoredOpportunity {
  recommendation: TradeRecommendation
  sanityPassed: boolean
  sanityReason?: string
}

function slugifyForUrl(text: string): string {
  return text
    .toLowerCase()
    .replace(/[?!,.\/\\#\$%\^&\*;:\{\}=\[\]'"`()~@\+]+/g, '')
    .replace(/202([4-9])[\u2010-\u2015](\d{2})/g, '202$1-$2')
    .replace(/202([4-9])202(\d{2})/g, '202$1-$2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2010-\u2015\u2018\u2019\u201c\u201d]/g, '-')
    .replace(/[$]+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 115)
}

function makeMarketUrl(market: MarketScoringInput): string {
  if (market.events && market.events.length > 0 && market.events[0].slug) {
    return `https://polymarket.com/event/${market.events[0].slug}`
  }
  if (market.slug) {
    return `https://polymarket.com/event/${market.slug}`
  }
  const slug = slugifyForUrl(market.question)
  return `https://polymarket.com/event/${slug}`
}

export async function scoreMarketPipeline(
  market: MarketScoringInput
): Promise<ScoredOpportunity | null> {
  // Parse inputs
  const outcomes = parseOutcomes(market.outcomes)
  const outcomePrices = parseOutcomePrices(market.outcomePrices)

  if (outcomePrices.length < 2) return null

  // ─── Layer 1: Sanity Filter ──────────────────────────────────────────────
  const sanity = passSanityFilter(
    market.question,
    market.endDateIso,
    outcomePrices,
    market.liquidityNum,
    market.negRisk
  )

  if (!sanity.passed) {
    return null
  }

  // ─── Layer 2: Classify category + Deep Research (parallel per outcome) ──
  const category = classifyCategory(market.question)

  const researchResults = await Promise.all(
    outcomePrices.slice(0, 2).map(price =>
      runDeepResearch(market.question, price, category)
    )
  )

  // ─── Probability Estimation ───────────────────────────────────────────────
  // Use research from the first outcome for overall market estimate
  const primaryResearch = researchResults[0]

  const estimatedProbs = outcomePrices.slice(0, 2).map((price, i) =>
    estimateTrueProbability(price, category, researchResults[i] ?? null)
  )

  // ─── Layer 3: Time Analysis ──────────────────────────────────────────────
  const timeAnalysis = analyzeTimeEdge(market.endDateIso, market)

  // ─── Layer 4: Conviction Scoring (per outcome) ───────────────────────────
  const convictionResults = outcomePrices.slice(0, 2).map((price, i) =>
    assessConvictionScore(
      price,
      estimatedProbs[i],
      researchResults[i] ?? primaryResearch,
      timeAnalysis,
      market.liquidityNum,
      market.volumeNum,
      parseSpread(market.spread)
    )
  )

  // ─── Layer 5: Long-Tail Detection (per outcome) ──────────────────────────
  const longTailResults = outcomePrices.slice(0, 2).map((price, i) =>
    detectLongTailEdges(
      price,
      i,
      outcomes[i] || (i === 0 ? 'Yes' : 'No'),
      researchResults[i] ?? primaryResearch,
      estimatedProbs[i],
      market.question,
      market.liquidityNum
    )
  )

  // ─── Build TradeRecommendations ───────────────────────────────────────────
  const spread = parseSpread(market.spread)
  const url = makeMarketUrl(market)

  const recommendations: TradeRecommendation[] = []

  for (let i = 0; i < Math.min(outcomePrices.length, 2); i++) {
    const marketProb = outcomePrices[i]
    const estimatedProb = estimatedProbs[i]
    const ev = (estimatedProb - marketProb) / (1 - marketProb)
    const evPct = ev * 100

    // Skip extremely priced outcomes
    if (marketProb < 0.01 || marketProb > 0.99) continue

    // Skip negative EV
    if (ev <= 0) continue

    const conviction = convictionResults[i]
    const research = researchResults[i] ?? primaryResearch
    const longTail = longTailResults[i]
    const time = timeAnalysis

    // Skip if conviction < 30
    if (conviction.score < 30) continue

    const { kellyFraction } = calculateKellyBet(1000, estimatedProb, marketProb)

    const confidence: 'high' | 'medium' | 'low' =
      conviction.score >= 75 ? 'high' : conviction.score >= 55 ? 'medium' : 'low'

    const riskLevel: 'low' | 'medium' | 'high' =
      market.liquidityNum >= 50000 ? 'low' :
        market.liquidityNum >= 10000 ? 'medium' : 'high'

    const maxBet = Math.min(Math.floor(market.liquidityNum * 0.005 / marketProb), 100)

    const reasoning = buildResearchReasoning(
      market.question,
      research,
      time,
      estimatedProb,
      marketProb
    )

    const upside = buildUpsideString(marketProb, estimatedProb, ev, longTail)

    recommendations.push({
      market: {
        id: market.id,
        question: market.question,
        outcomes,
        outcomePrices,
        volumeNum: market.volumeNum,
        liquidityNum: market.liquidityNum,
        volume24hr: market.volume24hr || 0,
        bestBid: market.bestBid ? Number(market.bestBid) : null,
        bestAsk: market.bestAsk ? Number(market.bestAsk) : null,
        spread,
        endDateIso: market.endDateIso || null,
        slug: market.slug || '',
        competitive: market.competitive || 0,
        url,
      },
      outcome: outcomes[i] || (i === 0 ? 'Yes' : 'No'),
      odds: marketProb,
      estimatedProbability: estimatedProb,
      marketImpliedProb: marketProb,
      expectedValue: ev,
      confidence,
      reasoning,
      upside,
      riskLevel,
      maxBet,
      safetyScore: conviction.score,
      recommendedBet: 0,
      kellyFraction,
      halfKellyBet: 0,
      closingDate: market.endDateIso ? new Date(market.endDateIso).getTime() : Date.now() + 365 * 24 * 60 * 60 * 1000,
      daysToClose: time.daysToClose,
      convictionScore: conviction.score,
      convictionLabel: conviction.label,
      convictionBreakdown: conviction.breakdown,
      research,
      longTail,
      timeAnalysis: time,
    })
  }

  if (recommendations.length === 0) return null

  // Sort by conviction score, then EV
  recommendations.sort((a, b) => {
    if (Math.abs(b.convictionScore - a.convictionScore) > 3) {
      return b.convictionScore - a.convictionScore
    }
    return b.expectedValue - a.expectedValue
  })

  return {
    recommendation: recommendations[0],
    sanityPassed: true,
  }
}

// ─── Kelly Bet Calculator (duplicated from route.ts for self-containment) ──

// ─── Order Book Imbalance (stub — Polymarket CLOB API) ──────────────────────

export async function fetchOrderBookImbalance(
  marketId: string
): Promise<{ imbalance: number; momentum: 'up' | 'down' | 'neutral' } | null> {
  // TODO: integrate with Polymarket CLOB client for real order book data
  // For now, return null (no signal) — the pipeline gracefully handles missing data
  void marketId
  return null
}

function calculateKellyBet(bankroll: number, estimatedProb: number, marketProb: number): { kellyFraction: number; halfKelly: number; quarterKelly: number } {
  const decimalOdds = (1 / marketProb) - 1
  if (decimalOdds <= 0 || estimatedProb <= 0) return { kellyFraction: 0, halfKelly: 0, quarterKelly: 0 }
  const q = 1 - estimatedProb
  const kelly = (decimalOdds * estimatedProb - q) / decimalOdds
  const positiveKelly = Math.max(0, kelly)
  const cappedKelly = Math.min(positiveKelly, 0.10)
  return {
    kellyFraction: cappedKelly,
    halfKelly: bankroll * cappedKelly / 2,
    quarterKelly: bankroll * cappedKelly / 4,
  }
}
