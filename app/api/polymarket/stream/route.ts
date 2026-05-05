/**
 * /api/polymarket/stream — SSE endpoint for async LLM analysis
 *
 * Connects to /api/polymarket/fast first to get base opportunities,
 * then streams LLM analysis results as markets are processed.
 *
 * Usage: EventSource('/api/polymarket/stream')
 *
 * Events emitted:
 *   - "init"     → { opportunities: FastOpportunity[] } (base data from /fast)
 *   - "update"   → { opportunity: FastOpportunity } (LLM result for one market)
 *   - "done"     → { total: number, betCount: number } (all done)
 *   - "error"    → { message: string }
 */

import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

// ─── LLM Config ───────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY || ''
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Try known model name formats
async function resolveModel(preferred: string): Promise<string> {
  const candidates = [
    preferred,
    preferred.replace('meta-llama/', ''),
    preferred.replace('qwen/', 'qwen3-'),
  ]
  for (const model of candidates) {
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 2 }),
      })
      if (res.ok) return model
    } catch { /* try next */ }
  }
  return preferred // fallback
}

// Resolve model names at startup
let resolvedModels: { fast: string; deep: string; slow: string } | null = null

async function getModels() {
  if (!resolvedModels) {
    resolvedModels = {
      fast: await resolveModel('meta-llama/llama-4-scout-17b-16e-instruct'),
      deep: await resolveModel('qwen/qwen3-32b'),
      slow: await resolveModel('llama-3.3-70b-versatile'),
    }
  }
  return resolvedModels
}

const DELAY_MS = 500 // delay between LLM calls

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LLMResult {
  llmEstimate: number
  llmConfidence: 'high' | 'medium' | 'low'
  llmDirection: 'yes' | 'no' | 'skip'
  llmShouldBet: boolean
  llmReasoning: string
  llmEdge: number
  llmModel: string
  llmLatencyMs: number
}

interface Market {
  id: string
  question: string
  outcomes: string[]
  outcomePrices: number[]
  volumeNum: number
  liquidityNum: number
  volume24hr: number
  spread: number
  endDateIso: string | null
  slug: string | null
  competitive: number
  events?: Array<{ slug?: string | null }>
}

interface Opportunity {
  id: string
  question: string
  category: string
  outcome: string
  outcomeIndex: number
  odds: number
  safetyScore: number
  riskLevel: 'low' | 'medium' | 'high'
  maxBet: number
  kellyFraction: number
  timeTier: string
  daysToClose: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  market: Market
  llmEstimate: number | null
  llmConfidence: 'high' | 'medium' | 'low' | null
  llmDirection: 'yes' | 'no' | 'skip' | null
  llmShouldBet: boolean | null
  llmReasoning: string | null
  llmEdge: number | null
  llmModel: string | null
  llmLatencyMs: number | null
  updatedAt: number | null
  convictionScore?: number
  convictionLabel?: 'no-brainer' | 'high' | 'consider' | 'risky'
}

// ─── Scoring ───────────────────────────────────────────────────────────────────

function fastScore(m: Market, price: number): number {
  let score = 0
  if (m.liquidityNum >= 100000) score += 30
  else if (m.liquidityNum >= 50000) score += 25
  else if (m.liquidityNum >= 25000) score += 20
  else if (m.liquidityNum >= 10000) score += 15
  else if (m.liquidityNum >= 5000) score += 10

  if ((m.volume24hr || 0) >= 50000) score += 15
  else if ((m.volume24hr || 0) >= 10000) score += 8

  if (m.spread <= 0.03) score += 20
  else if (m.spread <= 0.05) score += 10
  else if (m.spread <= 0.10) score += 5

  if (m.endDateIso) {
    const days = Math.max(0, Math.ceil((new Date(m.endDateIso).getTime() - Date.now()) / 86400000))
    if (days <= 1) score += 20
    else if (days <= 3) score += 12
    else if (days <= 7) score += 6
  } else {
    score += 20
  }

  if (price >= 0.90) score += 10
  else if (price >= 0.75) score += 5
  else if (price >= 0.10) score += 2

  if (m.competitive >= 0.8) score += 10
  else if (m.competitive >= 0.6) score += 5

  return score
}

function classifyCategory(question: string): string {
  const q = question.toLowerCase()
  if (/\b(fed|rate|tariff|election|presid|congress|senate|law|pass|bill|legislation|executive order|veto)\b/.test(q)) return 'policy'
  if (/\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|trump|meme|coin|etf|on-chain)\b/.test(q)) return 'crypto'
  if (/\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs|spread|margin|over\/under|\+[0-9]+\.[0-9]+|-[0-9]+\.[0-9]+|first half|second half)\b/.test(q)) return 'sports'
  return 'general'
}

function getTimeTier(endDateIso: string | null): { tier: string; daysToClose: number } {
  if (!endDateIso) return { tier: 'pending', daysToClose: 9999 }
  const days = Math.max(0, Math.ceil((new Date(endDateIso).getTime() - Date.now()) / 86400000))
  if (days <= 1) return { tier: 'imminent', daysToClose: days }
  if (days <= 7) return { tier: 'closing-soon', daysToClose: days }
  if (days <= 30) return { tier: 'medium', daysToClose: days }
  return { tier: 'long', daysToClose: days }
}

function makeMarketUrl(m: Market): string {
  // eventSlug is nested under m.events[0].slug in raw Gamma data
  const eventSlug = (m as any).events?.[0]?.slug
  const slug = m.slug
  const invalidSlugs = ['n-a', 'undefined', 'null', '']

  const validEventSlug = eventSlug && typeof eventSlug === 'string' && !invalidSlugs.includes(eventSlug)
  const validSlug = slug && typeof slug === 'string' && !invalidSlugs.includes(slug)

  if (validEventSlug && validSlug) return `https://polymarket.com/event/${eventSlug}/${slug}`
  if (validSlug) return `https://polymarket.com/event/${slug}`
  return `https://polymarket.com/event/${m.id}`
}

function calculateKelly(price: number, estimate: number): number {
  if (price >= 0.99 || price <= 0.01) return 0
  const decimal = (1 / price) - 1
  if (decimal <= 0) return 0
  const kelly = (decimal * estimate - (1 - estimate)) / decimal
  return Math.max(0, Math.min(kelly, 0.10))
}

// ─── Web Evidence ───────────────────────────────────────────────────────────────

async function searchGoogleNews(query: string): Promise<string[]> {
  const findings: string[] = []
  try {
    const res = await fetch(
      'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en',
      { headers: { 'Accept': 'application/xml, text/xml' }, signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) {
      const xml = await res.text()
      const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/gi
      const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/gi
      let match: RegExpExecArray | null
      const titles: string[] = [], descs: string[] = []
      let count = 0
      while ((match = titleRegex.exec(xml)) !== null && count < 5) {
        const t = (match[1] || match[2] || '').trim()
        if (t.length > 15 && !t.includes('Google News') && !t.includes('RSS')) {
          titles.push(t); count++
        }
      }
      while ((match = descRegex.exec(xml)) !== null && descs.length < 5) {
        const d = (match[1] || match[2] || '').replace(/<[^>]+>/g, '').trim()
        if (d.length > 30) descs.push(d)
      }
      for (let i = 0; i < Math.min(titles.length, 5); i++) {
        const combined = descs[i] ? titles[i] + ': ' + descs[i].substring(0, 200) : titles[i]
        findings.push(combined.substring(0, 300))
      }
    }
  } catch { /* skip */ }
  return findings
}

// ─── LLM Call ──────────────────────────────────────────────────────────────────

async function callLLM(prompt: string, model: string, timeout = 20000, retries = 2): Promise<{ content: string; latencyMs: number }> {
  if (!GROQ_API_KEY) return { content: '{"error":"No Groq API key set"}', latencyMs: 0 }

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const start = Date.now()

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 256,
        }),
        signal: controller.signal,
      })
      clearTimeout(timer)

      if (res.status === 429) {
        const waitMs = (attempt + 1) * 3000
        console.warn(`[Stream] Rate limited, waiting ${waitMs}ms`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }

      if (!res.ok) {
        const err = await res.text()
        // 400 with json_validate_failed → retry with stricter prompt
        if (res.status === 400 && err.includes('json_validate_failed') && attempt < retries) {
          await new Promise(r => setTimeout(r, 1000))
          prompt = prompt + '\n\nIMPORTANT: Your response MUST be valid JSON only — no markdown, no explanation, just the JSON object.'
          continue
        }
        throw new Error(`Groq ${res.status}: ${err.substring(0, 200)}`)
      }

      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || '{}'
      // Strip markdown code blocks if present
      const cleaned = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
      return { content: cleaned || '{}', latencyMs: Date.now() - start }
    } catch (e: any) {
      clearTimeout(timer)
      if (e.name === 'AbortError') {
        console.warn(`[Stream] Timeout for model ${model}`)
        return { content: '{}', latencyMs: Date.now() - start }
      }
      if (attempt < retries) {
        console.warn(`[Stream] Retrying after error: ${e.message}`)
        await new Promise(r => setTimeout(r, 2000))
        continue
      }
      throw e
    }
  }
  return { content: '{}', latencyMs: 0 }
}

// ─── LLM Prompts ────────────────────────────────────────────────────────────────

function buildTriagePrompt(opp: Opportunity): string {
  const price = opp.odds
  const pricePct = (price * 100).toFixed(1)
  const outcome = opp.outcome

  if (opp.category === 'sports') {
    return `Answer in JSON only.

SPORTS MARKET — strict rules apply:
- Generic phrases like "team form", "home advantage", "matchup analysis", "historical performance", "key matchup" are WORTHLESS and lead to losses
- Only specific verifiable facts count: confirmed player injuries, lineup changes, disqualifications, rule changes, official announcements
- "Probably", "likely", "should" in sports context = skip
- Without named players or specific confirmed facts → confidence must be "low" and decision must be "skip"

MARKET: "${opp.question}"
CURRENT PRICE: ${pricePct}% for ${outcome}
CLOSES IN: ${opp.daysToClose} day(s)
LIQUIDITY: $${(opp.market.liquidityNum / 1000).toFixed(0)}K

Can you find a SPECIFIC named player, confirmed injury, official announcement, or disqualification that directly affects this market's outcome? If not → skip.

Return JSON: { decision: "bet" | "skip", confidence: "high" | "medium" | "low", reasoning: "specific fact found OR reason for skip", estimatedProbability: 0.0-1.0 }`
  }

  return `Answer in JSON only.

IMPORTANT — probability anchoring rules:
- The CURRENT PRICE IS THE MARKET'S ESTIMATE. Do NOT guess a different probability.
- Your "estimatedProbability" must be within 5% of the current price UNLESS you find specific news/evidence that directly contradicts the market's view.
- If no strong evidence found → estimatedProbability should equal the current price.
- If you change the estimate by >5%, your reasoning MUST cite specific facts from recent news that contradict the market price.
- Guessing or using training knowledge without current news evidence = wrong estimate.

MARKET: "${opp.question}"
CURRENT PRICE: ${pricePct}% for ${outcome}
CATEGORY: ${opp.category}
CLOSES IN: ${opp.daysToClose} day(s)
LIQUIDITY: $${(opp.market.liquidityNum / 1000).toFixed(0)}K

Does recent news contradict the market price? Return JSON:
{ decision: "bet" | "skip", confidence: "high" | "medium" | "low", reasoning: "specific news facts OR why market estimate is correct", estimatedProbability: ${price} }`
}

function buildDeepPrompt(opp: Opportunity, bullText: string, bearText: string): string {
  const price = opp.odds
  const pricePct = (price * 100).toFixed(1)
  const outcome = opp.outcome

  return `Answer in JSON only.

IMPORTANT — probability anchoring:
- CURRENT MARKET PRICE: ${pricePct}% — this reflects the crowd's best estimate.
- If EVIDENCE FOR is stronger than EVIDENCE AGAINST → your estimate should be higher than ${pricePct}%
- If EVIDENCE AGAINST is stronger → your estimate should be lower than ${pricePct}%
- If evidence is balanced or weak → keep your estimate close to ${pricePct}%
- Do NOT wildly swing your estimate without strong evidence on both sides.

MARKET: "${opp.question}"
CURRENT PRICE: ${pricePct}% for ${outcome}
CATEGORY: ${opp.category}
CLOSES IN: ${opp.daysToClose} day(s)

EVIDENCE FOR:
${bullText}

EVIDENCE AGAINST:
${bearText}

Analyze and estimate. Return JSON:
{ yourEstimate: 0.0-1.0, direction: "yes" | "no" | "skip", confidence: "high" | "medium" | "low", reasoning: "...", shouldBet: true | false }`
}

// ─── Sports Generic Check ──────────────────────────────────────────────────────

const GENERIC_SPORTS_WORDS = [
  'form guide', 'matchup analysis', 'statistical edge', 'historical',
  'home advantage', 'away form', 'key matchup', 'team strength',
  'season performance', 'head-to-head record', 'statistically',
  'likely to', 'probably', 'might', 'could', 'winning streak', 'losing streak',
  'road record', 'home record', 'straight', 'consecutive', 'last ', 'recent form',
  'momentum', 'strong on', 'weak on', 'edge in', 'edge over',
]

function isGenericSportsReasoning(reasoning: string): boolean {
  const lower = reasoning.toLowerCase()
  // Short reasoning is always suspicious
  if (reasoning.length < 80) return true
  // Count generic sports phrases
  const genericCount = GENERIC_SPORTS_WORDS.filter(w => lower.includes(w)).length
  // Also reject if reasoning doesn't contain any named entities (capitalized words)
  const hasNamedEntity = /[A-Z][a-z]+ [A-Z][a-z]+/.test(reasoning) // e.g., "Jokic" or "Denver Nuggets"
  if (genericCount >= 2 && !hasNamedEntity) return true
  // Reject if it's mostly generic even with some named entity
  if (genericCount >= 3) return true
  return false
}

// ─── Parse LLM Response ─────────────────────────────────────────────────────────

function parseLLM(raw: string, fallbackPrice: number, opp: Opportunity, model = 'scout'): LLMResult {
  try {
    const p = JSON.parse(raw)
    let estimate = Math.min(0.99, Math.max(0.01, p.estimatedProbability || p.yourEstimate || fallbackPrice))
    const confidence = (['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'low') as 'high' | 'medium' | 'low'
    const direction = (['yes', 'no', 'skip'].includes(p.direction || p.decision) ? (p.direction || p.decision) : 'skip') as 'yes' | 'no' | 'skip'
    const reasoning = p.reasoning || ''

    // Sports hard rule
    if (opp.category === 'sports' && isGenericSportsReasoning(reasoning)) {
      return {
        llmEstimate: estimate,
        llmConfidence: 'low',
        llmDirection: 'skip',
        llmShouldBet: false,
        llmReasoning: `[REJECTED: generic sports reasoning] ${reasoning}`,
        llmEdge: Math.abs(estimate - fallbackPrice),
        llmModel: model,
        llmLatencyMs: 0,
      }
    }

    // Probability anchoring enforcement:
    // If LLM deviates >10% from market price, check if reasoning is evidence-based.
    // If no strong evidence words, clamp estimate back to market price ±5%.
    const deviation = Math.abs(estimate - fallbackPrice)
    const hasEvidenceWords = /\b(confirmed|official|announced|injury|disqualif|suspended|banned|arrested|voted|passed|rejected|signing|deal|agreement|ceasefire|truce|inflation rate|employment|gdp|rate cut|rate hike|tariff imposed|tariff canceled)\b/i.test(reasoning)
    if (deviation > 0.10 && !hasEvidenceWords) {
      // Clamp to market ±5% — LLM didn't have real evidence
      const clamped = fallbackPrice + (estimate > fallbackPrice ? 0.05 : -0.05)
      estimate = Math.min(0.99, Math.max(0.01, clamped))
    }

    const shouldBet = (p.shouldBet === true || p.decision === 'bet') && confidence !== 'low'
    const edge = Math.abs(estimate - fallbackPrice)

    return { llmEstimate: estimate, llmConfidence: confidence, llmDirection: direction, llmShouldBet: shouldBet, llmReasoning: reasoning, llmEdge: edge, llmModel: model, llmLatencyMs: 0 }
  } catch {
    return {
      llmEstimate: fallbackPrice,
      llmConfidence: 'low',
      llmDirection: 'skip',
      llmShouldBet: false,
      llmReasoning: 'LLM returned malformed JSON',
      llmEdge: 0,
      llmModel: model,
      llmLatencyMs: 0,
    }
  }
}

// ─── Recalculate Conviction from LLM Analysis ───────────────────────────────────
//
// Conviction is a BET QUALITY score (not market quality).
// Combines fast heuristic score + LLM's actual edge + confidence.
// Sports have stricter requirements since we have a bad track record.

function recalculateConviction(
  opp: Opportunity,
  llm: LLMResult
): { convictionScore: number; convictionLabel: 'no-brainer' | 'high' | 'consider' | 'risky'; shouldBet: boolean } {
  const edge = llm.llmEdge
  const conf = llm.llmConfidence
  const direction = llm.llmDirection

  // Don't bet if LLM said skip or no direction
  if (direction === 'skip' || direction === 'no') {
    return {
      convictionScore: Math.max(0, opp.safetyScore - 30),
      convictionLabel: 'risky',
      shouldBet: false,
    }
  }

  // Sports-specific: very strict — only bet with high confidence AND edge ≥8%
  if (opp.category === 'sports') {
    // Hard rule: sports MUST have high confidence AND ≥8% edge to bet
    if (conf !== 'high' || edge < 0.08) {
      return {
        convictionScore: Math.max(0, opp.safetyScore - 30),
        convictionLabel: 'risky',
        shouldBet: false,
      }
    }
  }

  // Non-sports: calculate blended conviction
  // LLM quality contributes up to 40 points
  const confPts = conf === 'high' ? 40 : conf === 'medium' ? 20 : 0
  const edgePts = Math.min(40, Math.round(edge * 400)) // 5% edge = 20pts, 10% = 40pts
  const llmPts = confPts + edgePts

  // Blend fast score (max 60) with LLM quality (max 40) = 100 total
  const blended = Math.round(opp.safetyScore * 0.6 + llmPts * 0.4)

  const label: 'no-brainer' | 'high' | 'consider' | 'risky' =
    blended >= 90 ? 'no-brainer' : blended >= 75 ? 'high' : blended >= 55 ? 'consider' : 'risky'

  // Only bet if conviction is at least "consider" AND confidence isn't low
  const shouldBet = blended >= 55 && conf !== 'low' && direction === 'yes'

  return { convictionScore: blended, convictionLabel: label, shouldBet }
}

// ─── Analyze One Market ─────────────────────────────────────────────────────────

async function analyzeMarket(opp: Opportunity): Promise<LLMResult> {
  const models = await getModels()

  // Step 1: Gather evidence
  const evidence = await searchGoogleNews(opp.question)

  const bullishWords = ['likely', 'confirmed', 'approved', 'winning', 'won', 'bullish', 'support', 'growth', 'strong', 'positive', 'success', 'elected', 'signed', 'enacted', 'passed', 'truce', 'ceasefire', 'agreement', 'peace', 'open to']
  const bearishWords = ['unlikely', 'rejected', 'failed', 'losing', 'bearish', 'decline', 'ban', 'negative', 'downgrade', 'lost', 'illegal', 'risk', 'concern', 'stalled', 'air strikes', 'attacks', 'uncertain']

  const bullish = evidence.filter(f => bullishWords.some(w => f.toLowerCase().includes(w)))
  const bearish = evidence.filter(f => bearishWords.some(w => f.toLowerCase().includes(w)))
  const neutral = evidence.filter(f => !bullish.some(b => b === f) && !bearish.some(b => b === f))

  // Step 2: Triage with Scout
  const triagePrompt = buildTriagePrompt(opp)
  const triage = await callLLM(triagePrompt, models.fast)

  let parsed: any = {}
  try { parsed = JSON.parse(triage.content) } catch {}

  const triageDecision = parsed.decision || 'skip'
  const triageConfidence = parsed.confidence || 'low'

  // If triage says skip or low confidence, done
  if (triageDecision === 'skip' || triageConfidence === 'low') {
    return {
      ...parseLLM(triage.content, opp.odds, opp, models.fast),
      llmLatencyMs: triage.latencyMs,
    }
  }

  // Step 3: Deep analysis with a second call
  const bullText = bullish.length > 0 ? bullish.map((f, i) => `${i + 1}. ${f.substring(0, 200)}`).join('\n') : '(none found)'
  const bearText = bearish.length > 0 ? bearish.map((f, i) => `${i + 1}. ${f.substring(0, 200)}`).join('\n') : '(none found)'

  const deepPrompt = buildDeepPrompt(opp, bullText, bearText)
  const deep = await callLLM(deepPrompt, models.slow)

  const result = parseLLM(deep.content, opp.odds, opp, models.slow)
  result.llmLatencyMs = triage.latencyMs + deep.latencyMs
  result.llmModel = `${models.fast}+${models.slow}`

  return result
}

// ─── Fetch Base Markets ─────────────────────────────────────────────────────────

async function fetchBaseMarkets(): Promise<Opportunity[]> {
  const now = Date.now()
  const [volumeRes, volume24Res] = await Promise.all([
    fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=500', {
      headers: { 'Accept': 'application/json' }, cache: 'no-store'
    }),
    fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volume24hr&ascending=false&limit=500', {
      headers: { 'Accept': 'application/json' }, cache: 'no-store'
    }),
  ])

  if (!volumeRes.ok) throw new Error(`Gamma API ${volumeRes.status}`)

  const rawMarkets: any[] = await volumeRes.json()
  const existingIds = new Set(rawMarkets.map((m: any) => m.id))

  if (volume24Res.ok) {
    const vol24: any[] = await volume24Res.json()
    for (const m of vol24) {
      if (!existingIds.has(m.id)) {
        rawMarkets.push(m)
        existingIds.add(m.id)
      }
    }
  }

  const opportunities: Opportunity[] = []

  for (const m of rawMarkets) {
    if (m.negRisk) continue
    if (!m.outcomePrices || !m.outcomes) continue
    if (m.liquidityNum < 5000) continue
    if (m.endDateIso && new Date(m.endDateIso).getTime() < now) continue

    let outcomePrices: number[]
    try {
      outcomePrices = JSON.parse(m.outcomePrices).map(Number).filter((p: number) => !isNaN(p) && p > 0 && p < 1)
      if (outcomePrices.length < 2) continue
    } catch { continue }

    let outcomes: string[]
    try {
      outcomes = JSON.parse(m.outcomes)
    } catch {
      outcomes = ['Yes', 'No']
    }

    const spread = m.spread ? parseFloat(m.spread) : 0.02
    const bestBid = m.bestBid ? parseFloat(m.bestBid) : null
    const bestAsk = m.bestAsk ? parseFloat(m.bestAsk) : null
    const { tier, daysToClose } = getTimeTier(m.endDateIso || null)
    const category = classifyCategory(m.question)

    // Only score outcome index 0 (first outcome) per market
    // The LLM determines direction — don't show both sides before analysis
    for (let i = 0; i < 1; i++) {
      const price = outcomePrices[i]
      if (price < 0.01 || price > 0.99) continue

      const score = fastScore(m as Market, price)
      // Remove per-market score filter — show all liquid markets
      // UI filters + LLM analysis handle quality control

      const confidence: 'high' | 'medium' | 'low' =
        score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low'

      const riskLevel: 'low' | 'medium' | 'high' =
        m.liquidityNum >= 50000 ? 'low' : m.liquidityNum >= 10000 ? 'medium' : 'high'

      const maxBet = Math.min(Math.floor(m.liquidityNum * 0.005 / price), 100)
      const kelly = calculateKelly(price, price)

      const market: Market = {
        id: m.id,
        question: m.question,
        outcomes,
        outcomePrices,
        volumeNum: m.volumeNum || 0,
        liquidityNum: m.liquidityNum || 0,
        volume24hr: m.volume24hr || 0,
        spread,
        endDateIso: m.endDateIso || null,
        slug: m.slug || null,
        competitive: m.competitive || 0,
        events: m.events,
      }

      opportunities.push({
        id: `${m.id}-${i}`,
        question: m.question,
        category,
        outcome: outcomes[i] || (i === 0 ? 'Yes' : 'No'),
        outcomeIndex: i,
        odds: price,
        safetyScore: score,
        riskLevel,
        maxBet,
        kellyFraction: kelly,
        timeTier: tier,
        daysToClose,
        confidence,
        reasoning: `[PENDING LLM] Score: ${score} | ${category} | ${tier}`,
        market,
        llmEstimate: null,
        llmConfidence: null,
        llmDirection: null,
        llmShouldBet: null,
        llmReasoning: null,
        llmEdge: null,
        llmModel: null,
        llmLatencyMs: null,
        updatedAt: null,
        convictionScore: score,
        convictionLabel: score >= 90 ? 'no-brainer' : score >= 75 ? 'high' : score >= 55 ? 'consider' : 'risky',
      })
    }
  }

  // Sort by fast score descending, take top 100
  return opportunities
    .sort((a, b) => {
      if (Math.abs(b.safetyScore - a.safetyScore) > 5) return b.safetyScore - a.safetyScore
      return b.market.volumeNum - a.market.volumeNum
    })
    .slice(0, 100)
}

// ─── SSE Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      function sendHeartbeat() {
        controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${Date.now()}\n\n`))
      }

      try {
        // Fetch base markets
        const opportunities = await fetchBaseMarkets()

        // Send init with all base data
        send('init', { opportunities })

        // Start heartbeat every 10s
        const heartbeatInterval = setInterval(sendHeartbeat, 10000)

        // Process LLM analysis in background, emit updates
        let processed = 0
        let betCount = 0
        const MAX_PARALLEL = 2 // process 2 at a time

        // Process in chunks
        for (let i = 0; i < opportunities.length; i += MAX_PARALLEL) {
          const chunk = opportunities.slice(i, i + MAX_PARALLEL)
          const results = await Promise.all(chunk.map(async (opp) => {
            try {
              const llm = await analyzeMarket(opp)
              // Debug log for sports markets
              if (opp.category === 'sports') {
                console.log(`[Sports] "${opp.question.substring(0, 40)}" odds=${opp.odds} → llmEdge=${llm.llmEdge?.toFixed(3)} conf=${llm.llmConfidence} dir=${llm.llmDirection} shouldBet=${llm.llmShouldBet} reasoning="${llm.llmReasoning?.substring(0, 60)}"`)
              }
              return { opp, llm }
            } catch (e) {
              console.error(`[Stream] Failed: ${opp.question.substring(0, 30)}`, e instanceof Error ? e.message : '')
              return null
            }
          }))

          for (const result of results) {
            if (!result) continue
            const { opp, llm } = result

            // Recalculate conviction based on LLM quality + category rules
            const { convictionScore, convictionLabel, shouldBet } = recalculateConviction(opp, llm)
            if (opp.category === 'sports') {
              console.log(`[Recalc] "${opp.question.substring(0, 40)}" → score=${convictionScore} label=${convictionLabel} shouldBet=${shouldBet}`)
            }

            // Merge LLM result + recalculated conviction
            const updated: Opportunity = {
              ...opp,
              llmEstimate: llm.llmEstimate,
              llmConfidence: llm.llmConfidence,
              llmDirection: llm.llmDirection,
              llmShouldBet: shouldBet,
              llmReasoning: llm.llmReasoning,
              llmEdge: llm.llmEdge,
              llmModel: llm.llmModel,
              llmLatencyMs: llm.llmLatencyMs,
              updatedAt: Date.now(),
              convictionScore,
              convictionLabel,
            }

            send('update', { opportunity: updated })
            processed++
            if (shouldBet) betCount++
          }

          // Rate limit delay between chunks
          if (i + MAX_PARALLEL < opportunities.length) {
            await new Promise(r => setTimeout(r, DELAY_MS))
          }
        }

        clearInterval(heartbeatInterval)
        send('done', { total: opportunities.length, processed, betCount })
        controller.close()
      } catch (e) {
        console.error('[Stream]', e)
        send('error', { message: e instanceof Error ? e.message : 'Unknown error' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  })
}
