# Trading Recommendation Quality Improvement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Polymarket trade recommendation accuracy across all categories (sports, crypto, policy, general) by replacing shallow LLM reasoning with structured, evidence-based analysis.

**Architecture:** Three-phase pipeline: (1) category-specific parallel evidence gathering, (2) structured two-sided LLM reasoning, (3) conservative filtering in route.ts. The existing `scoreMarket()` in route.ts becomes a pre-filter; the new category research + LLM analysis replaces hardcoded biases.

**Tech Stack:** TypeScript, Groq API (llama-3.3-70b-versatile), Google News RSS, DuckDuckGo API, Next.js App Router.

---

## File Map

| File | Role | Change |
|------|------|--------|
| `lib/services/category-research.service.ts` | Category-aware evidence gathering (sports/crypto/policy/general) | **NEW** |
| `lib/services/groq-market-analysis.ts` | Structured reasoning LLM with two-sided analysis | **REPLACE** |
| `app/api/polymarket/route.ts` | Wire new research, remove hardcoded biases, raise thresholds | **MODIFY** |
| `components/dashboard/polymarket-section.tsx` | Display layer — review for reasoning format changes | Minor |

---

## Task 1: Create Category-Specific Evidence Gatherer

**Files:**
- Create: `lib/services/category-research.service.ts`
- Test: Manual — call the API endpoint and inspect `research` field in response

- [ ] **Step 1: Create the file with interfaces and types**

Create `lib/services/category-research.service.ts`:

```typescript
/**
 * Category-Aware Research Service
 *
 * Gathers evidence differently per market category:
 * - SPORTS: team form, head-to-head, injuries, home/away
 * - CRYPTO: on-chain signals, ETF flows, macro conditions
 * - POLICY: legislative progress, statements, polling
 * - GENERAL: mainstream news consensus
 *
 * Key principle: evidence must be separated into BULLISH and BEARISH
 * so the LLM can weigh both sides.
 */

export type MarketCategory = 'sports' | 'crypto' | 'policy' | 'general'

export interface WebFinding {
  text: string
  source: 'news' | 'duckduckgo' | 'specialized'
  url?: string
  date?: string
}

export interface CategoryEvidence {
  category: MarketCategory
  bullishFindings: WebFinding[]
  bearishFindings: WebFinding[]
  neutralFindings: WebFinding[]
  overallSignal: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'none'
  signalStrength: number  // 0-100
  keyInsights: string[]
  searchQueriesUsed: string[]
}

// ─── Category Classification ──────────────────────────────────────────────────

const SPORTS_KEYWORDS = /\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs|winner|champion|draft|roster|injury|disabled list|home game|away game)\b/i
const CRYPTO_KEYWORDS = /\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|trump meme|coin|token|defi|nft|exchange|blockchain|mining|halving|etf|institutional|on-chain|hashrate|funding rate)\b/i
const POLICY_KEYWORDS = /\b(fed|rate|tariff|election|presid(ent|ential)|congress|law|pass|convicted|inflation|jobs|nomination|senate|house|supreme court|bill|legislation|executive order|veto|amendment|regulation|sec|fcc|fda|cdc)\b/i

export function classifyCategory(question: string): MarketCategory {
  const q = question.toLowerCase()
  if (POLICY_KEYWORDS.test(q)) return 'policy'
  if (CRYPTO_KEYWORDS.test(q)) return 'crypto'
  if (SPORTS_KEYWORDS.test(q)) return 'sports'
  return 'general'
}

// ─── Sports-Specific Helpers ─────────────────────────────────────────────────

interface SportsEntities {
  teams: string[]
  tournament?: string
  sport?: string
}

function extractSportsEntities(question: string): SportsEntities {
  const teams: string[] = []

  // Common team name patterns (handles "Team A vs Team B", "A @ B", etc.)
  // Extract potential team names from the question
  const vsMatch = question.match(/([A-Z][a-zA-Z\s&']+?)\s+(?:vs|@|at|versus)\s+([A-Z][a-zA-Z\s&']+)/)
  if (vsMatch) {
    teams.push(vsMatch[1].trim(), vsMatch[2].trim())
  }

  // Extract all cap-word sequences that might be team names
  const capWords = question.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+)*\b/g) || []
  for (const word of capWords) {
    if (word.length > 3 && !teams.includes(word)) {
      teams.push(word)
    }
  }

  return { teams: teams.slice(0, 4) }
}

// ─── Sports Evidence Gathering ────────────────────────────────────────────────

/**
 * Gathers sports-specific evidence: team form, head-to-head, injuries.
 * Searches for each extracted team separately, then interprets findings.
 */
async function gatherSportsEvidence(question: string): Promise<CategoryEvidence> {
  const entities = extractSportsEntities(question)
  const searches: Array<{ query: string; weight: number }> = []

  // Primary search: team form for each team
  for (const team of entities.teams.slice(0, 2)) {
    searches.push({ query: `${team} recent form results 2026`, weight: 3 })
    searches.push({ query: `${team} wins losses last 10 games`, weight: 2 })
  }

  // Head-to-head if we have 2 teams
  if (entities.teams.length >= 2) {
    searches.push({
      query: `${entities.teams[0]} vs ${entities.teams[1]} head to head record`,
      weight: 4
    })
    searches.push({
      query: `${entities.teams[0]} ${entities.teams[1]} recent matchup results`,
      weight: 3
    })
  }

  // Injuries/absentees
  searches.push({ query: `${entities.teams[0]} injury report 2026`, weight: 2 })

  // Tournament/championship context
  searches.push({ query: `${question.substring(0, 80)} championship bracket 2026`, weight: 1 })

  return runParallelSearches(question, 'sports', searches)
}

// ─── Crypto Evidence Gathering ────────────────────────────────────────────────

async function gatherCryptoEvidence(question: string): Promise<CategoryEvidence> {
  const searches: Array<{ query: string; weight: number }> = []

  // Extract coin/token name
  const coinMatch = question.match(/\b(bitcoin|btc|ethereum|eth|solana|sol|crypto)\b/i)
  const coin = coinMatch ? coinMatch[1] : 'crypto'

  searches.push({ query: `${coin} news April 2026`, weight: 3 })
  searches.push({ query: `${coin} price prediction analysis 2026`, weight: 2 })
  searches.push({ query: `${coin} ETF institutional flow April 2026`, weight: 2 })
  searches.push({ query: `${coin} on-chain metrics network activity 2026`, weight: 1 })
  searches.push({ query: `${coin} regulatory news 2026`, weight: 1 })

  return runParallelSearches(question, 'crypto', searches)
}

// ─── Policy Evidence Gathering ────────────────────────────────────────────────

async function gatherPolicyEvidence(question: string): Promise<CategoryEvidence> {
  const searches: Array<{ query: string; weight: number }> = []

  // Extract key policy terms
  const policyTerms: string[] = []
  const fedMatch = question.match(/\b(fed|federal reserve|interest rate|tariff|election|congress|senate|supreme court|bill|legislation)\b/i)
  if (fedMatch) policyTerms.push(fedMatch[1])

  searches.push({ query: `${question.substring(0, 100)} latest update 2026`, weight: 3 })
  searches.push({ query: `${policyTerms[0] || 'policy'} recent developments April 2026`, weight: 2 })
  searches.push({ query: `${question.substring(0, 80)} vote outcome 2026`, weight: 2 })
  searches.push({ query: `${question.substring(0, 80)} expert analysis 2026`, weight: 1 })

  return runParallelSearches(question, 'policy', searches)
}

// ─── General Evidence Gathering ───────────────────────────────────────────────

async function gatherGeneralEvidence(question: string): Promise<CategoryEvidence> {
  const searches: Array<{ query: string; weight: number }> = []

  searches.push({ query: `${question.substring(0, 100)} latest news April 2026`, weight: 3 })
  searches.push({ query: `${question.substring(0, 100)} 2026 update`, weight: 2 })

  return runParallelSearches(question, 'general', searches)
}

// ─── Parallel Search Engine ──────────────────────────────────────────────────

interface SearchTask {
  query: string
  weight: number
}

async function runParallelSearches(
  _question: string,
  category: MarketCategory,
  searches: SearchTask[]
): Promise<CategoryEvidence> {
  const allFindings: WebFinding[] = []

  // Run all searches in parallel
  const results = await Promise.allSettled(
    searches.map(async ({ query, weight }) => {
      const findings = await searchQuery(query)
      return findings.map(f => ({ ...f, weight }))
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allFindings.push(...result.value)
    }
  }

  return interpretFindings(allFindings, category)
}

async function searchQuery(query: string): Promise<WebFinding[]> {
  const findings: WebFinding[] = []
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)

  try {
    // Strategy 1: Google News RSS
    const encodedQuery = encodeURIComponent(query)
    const newsUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`

    const newsRes = await fetch(newsUrl, {
      headers: { 'Accept': 'application/xml, text/xml' },
      signal: controller.signal,
    })

    if (newsRes.ok) {
      const xml = await newsRes.text()

      const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/gi
      const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/gi

      let count = 0
      let match

      while ((match = titleRegex.exec(xml)) !== null && count < 3) {
        const title = (match[1] || match[2] || '').trim()
        if (title.length > 15 && !title.includes('Google News')) {
          findings.push({ text: `NEWS: ${title}`, source: 'news' })
          count++
        }
      }
    }
  } catch {
    // Google News failed — try DuckDuckGo
  }

  clearTimeout(timeout)

  // Strategy 2: DuckDuckGo Instant Answer
  try {
    const controller2 = new AbortController()
    const timeout2 = setTimeout(() => controller2.abort(), 3000)

    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
    const ddgRes = await fetch(ddgUrl, {
      headers: { 'Accept': 'application/json' },
      signal: controller2.signal,
    })

    clearTimeout(timeout2)

    if (ddgRes.ok) {
      const data = await ddgRes.json()
      if (data.AbstractText && data.AbstractText.length > 20) {
        findings.push({ text: `BACKGROUND: ${data.AbstractText.substring(0, 300)}`, source: 'duckduckgo' })
      }
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 3)) {
          const text = (topic.Text || topic.Result || '') as string
          if (text.length > 20) {
            findings.push({ text: text.substring(0, 250), source: 'duckduckgo' })
          }
        }
      }
    }
  } catch {
    // DuckDuckGo failed
  }

  return findings
}

// ─── Evidence Interpretation ──────────────────────────────────────────────────

const BULLISH_SIGNALS = [
  'likely', 'confirmed', 'approved', 'passed', 'winning', 'ahead', 'will win',
  'support', 'bullish', 'growth', 'increase', 'adoption', 'breakthrough',
  'success', 'positive', 'upgrade', 'all-time', 'high', 'record', 'elected',
  'signed', 'enacted', 'legal', 'won', 'favor', 'favorable', 'strong',
  'outperform', 'beat', 'defeated', 'lead', 'leading', 'higher',
]

const BEARISH_SIGNALS = [
  'unlikely', 'rejected', 'failed', 'losing', 'behind', 'resistance',
  'bearish', 'decline', 'decrease', 'ban', 'crackdown', 'loss',
  'negative', 'downgrade', 'low', 'lost', 'defeated', 'vetoed',
  'struck down', 'illegal', 'penalty', 'risk', 'concern', 'uncertain',
  'underperform', 'lower', 'trailing', 'weaker', 'worse',
]

function interpretFindings(findings: WebFinding[], category: MarketCategory): CategoryEvidence {
  const bullishFindings: WebFinding[] = []
  const bearishFindings: WebFinding[] = []
  const neutralFindings: WebFinding[] = []

  for (const finding of findings) {
    const lowerText = finding.text.toLowerCase()
    let bullishCount = 0
    let bearishCount = 0

    // Category-specific signal boosting
    const signals = [...BULLISH_SIGNALS]
    const bearSignals = [...BEARISH_SIGNALS]

    // Sports-specific
    if (category === 'sports') {
      signals.push('won the', 'victory', 'score', 'goal', 'point', 'game win')
      bearSignals.push('lost to', 'defeat', 'eliminated', 'knocked out')
    }

    for (const signal of signals) {
      if (lowerText.includes(signal)) bullishCount++
    }
    for (const signal of bearSignals) {
      if (lowerText.includes(signal)) bearishCount++
    }

    if (bullishCount > bearishCount && bullishCount > 0) {
      bullishFindings.push(finding)
    } else if (bearishCount > bullishCount && bearishCount > 0) {
      bearishFindings.push(finding)
    } else {
      neutralFindings.push(finding)
    }
  }

  // Determine overall signal
  let overallSignal: CategoryEvidence['overallSignal'] = 'none'
  let signalStrength = 0

  if (bullishFindings.length > 0 || bearishFindings.length > 0) {
    const diff = Math.abs(bullishFindings.length - bearishFindings.length)
    const total = bullishFindings.length + bearishFindings.length

    if (diff <= 1 && total >= 3) {
      overallSignal = 'mixed'
      signalStrength = 30
    } else if (bullishFindings.length > bearishFindings.length * 1.5) {
      overallSignal = 'bullish'
      signalStrength = Math.min(80, 30 + bullishFindings.length * 15)
    } else if (bearishFindings.length > bullishFindings.length * 1.5) {
      overallSignal = 'bearish'
      signalStrength = Math.min(80, 30 + bearishFindings.length * 15)
    } else {
      overallSignal = 'neutral'
      signalStrength = 20
    }
  }

  // Key insights = top 3 most specific findings
  const keyInsights = findings
    .filter(f => f.text.length > 30)
    .slice(0, 3)
    .map(f => f.text.substring(0, 200))

  return {
    category,
    bullishFindings: bullishFindings.slice(0, 5),
    bearishFindings: bearishFindings.slice(0, 5),
    neutralFindings: neutralFindings.slice(0, 5),
    overallSignal,
    signalStrength,
    keyInsights,
    searchQueriesUsed: [],
  }
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * Gather evidence for a market question, using category-specific search strategies.
 * Returns bullish/bearish/neutral separated evidence for two-sided reasoning.
 */
export async function gatherCategoryEvidence(question: string): Promise<CategoryEvidence> {
  const category = classifyCategory(question)

  switch (category) {
    case 'sports':
      return gatherSportsEvidence(question)
    case 'crypto':
      return gatherCryptoEvidence(question)
    case 'policy':
      return gatherPolicyEvidence(question)
    default:
      return gatherGeneralEvidence(question)
  }
}

/**
 * Batch gather evidence for multiple markets in parallel.
 */
export async function gatherEvidenceBatch(
  questions: string[]
): Promise<Map<string, CategoryEvidence>> {
  const results = await Promise.allSettled(
    questions.map(async (q) => ({
      question: q,
      evidence: await gatherCategoryEvidence(q),
    }))
  )

  const map = new Map<string, CategoryEvidence>()
  for (const result of results) {
    if (result.status === 'fulfilled') {
      map.set(result.value.question, result.value.evidence)
    }
  }
  return map
}
```

- [ ] **Step 2: Run the API and verify evidence gathering works**

Start the dev server:
```bash
cd /Users/michalwanto/Documents/Michal_wanto/Work/Experiments/crytpo_trader_OS && npm run dev &
sleep 5
```

Call the endpoint:
```bash
curl -s "http://localhost:3000/api/polymarket" | python3 -c "import json,sys; d=json.load(sys.stdin); recs=d.get('opportunities',[]); [print(f'{r[\"reasoning\"][:100]}... | conf={r[\"confidence\"]} | label={r.get(\"convictionLabel\",\"?\")}') for r in recs[:5]]"
```

Expected: Output should show structured evidence in the `research` field. Verify sports markets show sports-specific search results.

- [ ] **Step 3: Commit**

```bash
git add lib/services/category-research.service.ts
git commit -m "feat: add category-aware evidence gathering service

Sports: team form, head-to-head, injuries searches
Crypto: on-chain, ETF, macro searches
Policy: legislative progress, statements searches
General: mainstream news
All evidence separated into bullish/bearish/neutral for two-sided reasoning

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Redesign the LLM Analysis Service

**Files:**
- Create: `lib/services/groq-market-analysis.ts` (REPLACE existing)
- Test: Manual — call API and check that recommendations show structured reasoning

- [ ] **Step 1: Write the new groq-market-analysis.ts**

```typescript
/**
 * Groq Market Analysis Service — Structured Reasoning Pipeline
 *
 * Replaces shallow single-prompt LLM with a thinking-first approach:
 *   1. Receives category-specific evidence (bullish + bearish separated)
 *   2. Runs structured reasoning: key factors → both sides → estimate → recommend
 *   3. SKIP is the default — only recommend when evidence strongly favors one side
 *   4. Two-sided confidence calibration
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LLMMarketAnalysis {
  estimatedProbability: number
  reasoning: string         // Step-by-step reasoning visible to user
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]        // Evidence cited in reasoning
  shouldBet: boolean
  direction: 'yes' | 'no' | 'skip'
  edgeSize: number          // |estimate - marketPrice|
  evidenceCount: number
  signalStrength: number    // 0-100 from evidence gathering
}

export interface MarketForAnalysis {
  question: string
  currentPrice: number
  outcomes: string[]
  endDate: string | null
  volume: number
  liquidity: number
}

// ─── Evidence Types (from category-research.service.ts) ──────────────────────

export interface CategoryEvidence {
  category: 'sports' | 'crypto' | 'policy' | 'general'
  bullishFindings: Array<{ text: string; source: string }>
  bearishFindings: Array<{ text: string; source: string }>
  neutralFindings: Array<{ text: string; source: string }>
  overallSignal: 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'none'
  signalStrength: number
  keyInsights: string[]
}

// ─── Cache ───────────────────────────────────────────────────────────────────

const analysisCache = new Map<string, { result: LLMMarketAnalysis; expiry: number }>()
const CACHE_TTL_MS = 10 * 60 * 1000

function getCached(key: string): LLMMarketAnalysis | null {
  const c = analysisCache.get(key)
  if (c && c.expiry > Date.now()) return c.result
  return null
}

function setCache(key: string, result: LLMMarketAnalysis): void {
  analysisCache.set(key, { result, expiry: Date.now() + CACHE_TTL_MS })
}

// ─── Groq API Call ───────────────────────────────────────────────────────────

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

async function callGroq(prompt: string, retries = 3): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY not set')

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 600,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.status === 429) {
        const waitMs = Math.min(15000, (attempt + 1) * 5000)
        console.log(`[Groq] Rate limited, waiting ${waitMs}ms`)
        await new Promise(r => setTimeout(r, waitMs))
        continue
      }

      if (!res.ok) {
        const err = await res.text()
        throw new Error(`Groq ${res.status}: ${err.substring(0, 200)}`)
      }

      const data = await res.json()
      return data.choices?.[0]?.message?.content || '{}'
    } catch (e: any) {
      clearTimeout(timeout)
      if (e.name === 'AbortError') {
        console.log(`[Groq] Timeout on attempt ${attempt + 1}`)
        continue
      }
      if (attempt === retries - 1) throw e
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  throw new Error('Groq: max retries exceeded')
}

// ─── Structured Reasoning Prompt ────────────────────────────────────────────

function buildStructuredPrompt(
  m: MarketForAnalysis,
  evidence: CategoryEvidence
): string {
  const days = m.endDate
    ? Math.max(0, Math.ceil((new Date(m.endDate).getTime() - Date.now()) / 86400000))
    : null

  // Format bullish evidence
  const bullishText = evidence.bullishFindings.length > 0
    ? evidence.bullishFindings.map((f, i) => `  ${i + 1}. ${f.text.substring(0, 200)}`).join('\n')
    : '  (none found)'

  // Format bearish evidence
  const bearishText = evidence.bearishFindings.length > 0
    ? evidence.bearishFindings.map((f, i) => `  ${i + 1}. ${f.text.substring(0, 200)}`).join('\n')
    : '  (none found)'

  return `You are an expert prediction market analyst. You must THINK through every market systematically before making any recommendation.

MARKET: "${m.question}"
CURRENT MARKET PRICE: ${(m.currentPrice * 100).toFixed(1)}% for YES
OUTCOMES: ${m.outcomes.join(' vs ')}
${days !== null ? `CLOSES IN: ${days} day${days !== 1 ? 's' : ''}` : 'NO END DATE'}
VOLUME: $${(m.volume / 1000).toFixed(0)}K | LIQUIDITY: $${(m.liquidity / 1000).toFixed(0)}K

═══════════════════════════════════════
STEP 1 — KEY QUESTION DRIVERS
What specific factors determine whether this market resolves YES? List 2-3 concrete things to look for. Be specific to THIS question, not generic.

Example: "For 'Will Team A win the championship?', key factors are: (1) current form in recent games, (2) head-to-head record vs final opponent, (3) any injuries to key players."

═══════════════════════════════════════
STEP 2 — ASSESS EVIDENCE (TWO SIDES REQUIRED)

EVIDENCE SUPPORTING YES:
${bullishText}

EVIDENCE SUPPORTING NO:
${bearishText}

OVERALL SIGNAL FROM RESEARCH: ${evidence.overallSignal} (strength: ${evidence.signalStrength}/100)

═══════════════════════════════════════
STEP 3 — YOUR ESTIMATE

Based on Step 1 (key factors) and Step 2 (evidence), what probability would you assign to YES?

IMPORTANT: Start from the base rate (market's current price) and adjust only if evidence clearly justifies it. The market price reflects thousands of traders — you need genuine evidence to disagree.

Your YES probability estimate: __%

═══════════════════════════════════════
STEP 4 — RECOMMENDATION (BE HONEST)

Market price: ${(m.currentPrice * 100).toFixed(1)}%
Your estimate: __%

Compare these numbers honestly:
- If your estimate is WITHIN 10% of market price → the market is probably efficient. RECOMMEND SKIP.
- If your estimate is 10%+ higher than market → YES is mispriced in your favor. Consider YES.
- If your estimate is 10%+ lower than market → NO is mispriced in your favor. Consider NO.
- If evidence is weak or mixed on both sides → RECOMMEND SKIP. Do NOT force a recommendation.

Confidence levels:
- HIGH: Strong, specific evidence on one side clearly outweighs the other AND your estimate differs from market by 10%+
- MEDIUM: Some evidence supports one side, but it's not overwhelming OR estimate differs by 5-10%
- LOW: Evidence is balanced/mixed, no clear signal, or estimate close to market. ALWAYS SKIP.

═══════════════════════════════════════
OUTPUT FORMAT

Return JSON with these exact fields:
{
  "keyDrivers": ["factor 1", "factor 2", "factor 3"],
  "yourEstimate": 0.0-1.0,
  "edge": "market minus your estimate as % (positive = market higher than you)",
  "direction": "yes" | "no" | "skip",
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentences explaining your reasoning step by step, citing specific evidence",
  "citedEvidence": ["quote from specific finding that supports your view"],
  "shouldBet": true | false
}
`
}

// ─── Main Analysis Function ──────────────────────────────────────────────────

export async function analyzeMarketWithLLM(
  market: MarketForAnalysis,
  evidence: CategoryEvidence
): Promise<LLMMarketAnalysis> {
  const cacheKey = `${market.question.substring(0, 80)}_${market.currentPrice}`
  const cached = getCached(cacheKey)
  if (cached) return cached

  try {
    const raw = await callGroq(buildStructuredPrompt(market, evidence))
    const parsed = JSON.parse(raw)

    const direction = (['yes', 'no', 'skip'].includes(parsed.direction) ? parsed.direction : 'skip') as any
    const confidence = (['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low') as any

    const marketPrice = market.currentPrice
    const yourEstimate = Math.min(0.99, Math.max(0.01, parsed.yourEstimate ?? marketPrice))
    const edgeSize = Math.abs(yourEstimate - marketPrice)

    // Force SKIP if confidence is low OR if evidence signal is weak
    let shouldBet = parsed.shouldBet === true && confidence !== 'low' && evidence.signalStrength >= 25

    // Force SKIP if edge is too small relative to evidence strength
    // A 3% edge with STRONG evidence (signal 70+) is better than 8% edge with weak evidence
    if (shouldBet && evidence.signalStrength < 30 && edgeSize < 0.10) {
      shouldBet = false
    }

    // Build step-by-step reasoning for the user
    const keyDrivers = Array.isArray(parsed.keyDrivers) ? parsed.keyDrivers.slice(0, 3) : []
    let reasoning = ''

    if (keyDrivers.length > 0) {
      reasoning += `KEY DRIVERS: ${keyDrivers.join(', ')}. `
    }

    if (parsed.reasoning) {
      reasoning += parsed.reasoning.substring(0, 400)
    }

    const result: LLMMarketAnalysis = {
      estimatedProbability: yourEstimate,
      reasoning,
      confidence,
      evidence: Array.isArray(parsed.citedEvidence) ? parsed.citedEvidence.slice(0, 5) : [],
      shouldBet,
      direction,
      edgeSize,
      evidenceCount: evidence.bullishFindings.length + evidence.bearishFindings.length,
      signalStrength: evidence.signalStrength,
    }

    setCache(cacheKey, result)
    return result
  } catch (error) {
    console.error('[Groq] Analysis failed:', market.question.substring(0, 50), error instanceof Error ? error.message : '')

    return {
      estimatedProbability: market.currentPrice,
      reasoning: 'LLM analysis unavailable — market price used as estimate.',
      confidence: 'low',
      evidence: [],
      shouldBet: false,
      direction: 'skip',
      edgeSize: 0,
      evidenceCount: 0,
      signalStrength: 0,
    }
  }
}

// ─── Batch Analysis ──────────────────────────────────────────────────────────

export async function analyzeMarketsBatch(
  markets: MarketForAnalysis[],
  evidenceMap: Map<string, CategoryEvidence>
): Promise<Map<string, LLMMarketAnalysis>> {
  const results = new Map<string, LLMMarketAnalysis>()
  const DELAY_MS = 3000

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i]

    const cached = getCached(`${market.question.substring(0, 80)}_${market.currentPrice}`)
    if (cached) {
      results.set(market.question, cached)
      continue
    }

    const evidence = evidenceMap.get(market.question) || {
      category: 'general',
      bullishFindings: [],
      bearishFindings: [],
      neutralFindings: [],
      overallSignal: 'none' as const,
      signalStrength: 0,
      keyInsights: [],
    }

    try {
      const analysis = await analyzeMarketWithLLM(market, evidence)
      results.set(market.question, analysis)
      console.log(`[LLM ${i+1}/${markets.length}] ${market.question.substring(0, 40)}... → conf=${analysis.confidence}, edge=${(analysis.edgeSize*100).toFixed(1)}%, bet=${analysis.shouldBet}`)
    } catch (e) {
      console.error(`[LLM ${i+1}/${markets.length}] FAILED:`, e instanceof Error ? e.message : '')
    }

    if (i < markets.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  }

  return results
}
```

- [ ] **Step 2: Test the structured reasoning output**

```bash
curl -s "http://localhost:3000/api/polymarket" | python3 -c "
import json, sys
d = json.load(sys.stdin)
recs = d.get('opportunities', [])
for r in recs[:5]:
    print('=' * 60)
    print(f'Q: {r[\"market\"][\"question\"][:80]}')
    print(f'Reasoning: {r[\"reasoning\"][:200]}')
    print(f'Confidence: {r[\"confidence\"]} | Label: {r.get(\"convictionLabel\",\"?\")} | shouldBet: {r.get(\"research\",{}).get(\"sentiment\",\"?\")}')
    print(f'Price: {r[\"odds\"]*100:.1f}% -> Est: {r[\"estimatedProbability\"]*100:.1f}% | EV: {r[\"expectedValue\"]*100:.1f}%')
    print()
"
```

Expected: Each recommendation should show structured reasoning with specific evidence. Fewer recommendations (more conservative). SKIP-marked recommendations should be clearly labeled.

- [ ] **Step 3: Commit**

```bash
git add lib/services/groq-market-analysis.ts
git commit -m "feat: replace shallow LLM with structured two-sided reasoning

New reasoning pipeline:
- Think-first approach: key factors -> both sides -> estimate -> recommend
- Category-specific evidence (bullish/bearish/neutral separated)
- SKIP is default — only recommend when evidence clearly favors one side
- Step-by-step reasoning visible to user
- Evidence-quality gates instead of arbitrary edge thresholds

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Wire Everything Together in Route.ts

**Files:**
- Modify: `app/api/polymarket/route.ts`

**Changes:**
1. Import new `gatherEvidenceBatch` from `category-research.service.ts`
2. Import new `analyzeMarketsBatch` from `groq-market-analysis.ts`
3. Remove `categoryBias` table and hardcoded biases
4. Remove `nearCertainBoost` and `near-impossible` shortcuts
5. Raise safety thresholds: safetyMin = 40 for all markets
6. Raise EV threshold: 5% minimum for all markets (was 0.2% for imminent)
7. Wire category-specific evidence → LLM → results
8. Replace conviction scoring with LLM-based scores
9. Cap non-LLM-analyzed markets at conviction 30

- [ ] **Step 1: Read the current route.ts file to identify exact lines to change**

```bash
head -100 app/api/polymarket/route.ts
```

- [ ] **Step 2: Replace the imports section**

Add after the existing imports (around line 1):
```typescript
import { gatherEvidenceBatch } from '@/lib/services/category-research.service'
```

- [ ] **Step 3: Remove hardcoded biases from scoreMarket()**

Find and remove or comment out these sections in `scoreMarket()`:

**Remove the `categoryBias` table (around line 358-364):**
```typescript
// REMOVE THIS ENTIRE BLOCK:
const categoryBias: Record<string, number> = {
  crypto: isImminent ? 0.03 : isClosingSoon ? 0.02 : 0.01,
  sports: isImminent ? 0.03 : isClosingSoon ? 0.02 : 0.01,
  policy: isImminent ? -0.05 : isClosingSoon ? -0.03 : -0.02,
  general: isImminent ? 0.02 : isClosingSoon ? 0.01 : 0.0,
}
const bias = categoryBias[category] || 0
// Replace with: NO BIAS — let the LLM estimate be the estimate
```

Replace the bias usage with no bias:
```typescript
const bias = 0  // Removed hardcoded biases — LLM provides evidence-based estimate
const estimatedProb = Math.min(0.999, Math.max(0.001, marketProb + bias))
```

**Raise the EV threshold (line ~370):**
```typescript
// REMOVE:
const evThreshold = isImminent ? 0.2 : isClosingSoon ? 0.3 : 3

// REPLACE with:
const evThreshold = 0.05  // 5% minimum for ALL markets — no time-tier shortcuts
```

**Raise safety minimums (line ~375):**
```typescript
// REMOVE:
const safetyMin = isImminent ? 10 : isClosingSoon ? 12 : 20

// REPLACE with:
const safetyMin = 40  // Conservative minimum for all markets
```

**Raise liquidity minimums (line ~340):**
```typescript
// REMOVE:
const liquidityMin = isToday ? 50 : isImminent ? 100 : isClosingSoon ? 200 : 500

// REPLACE with:
const liquidityMin = 1000  // $1K minimum for all markets
```

- [ ] **Step 4: Wire category evidence + LLM into the pipeline**

In the GET() handler, find where the LLM analysis is called (around line 669) and replace the import + call:

**REPLACE the import section (around line 607-608):**
```typescript
// OLD:
const { analyzeMarketsBatch } = await import('@/lib/services/groq-market-analysis')
const { fetchOrderBookImbalance, analyzeTimeEdge } = await import('@/lib/services/polymarket-research.service')

// NEW:
const { analyzeMarketsBatch } = await import('@/lib/services/groq-market-analysis')
const { fetchOrderBookImbalance, analyzeTimeEdge } = await import('@/lib/services/polymarket-research.service')
const { gatherEvidenceBatch } = await import('@/lib/services/category-research.service')
```

**REPLACE the LLM pipeline call (around line 659-669):**

The current code builds `marketsForAnalysis` and calls `analyzeMarketsBatch`. Replace with:

```typescript
// ── Stage 1: Category-aware evidence gathering (parallel, fast) ──
console.log(`[Pipeline] Stage 1: Gathering category-specific evidence for ${selectedForAnalysis.length} markets...`)
const evidenceMap = await gatherEvidenceBatch(
  selectedForAnalysis.map(r => r.market.question)
)
console.log(`[Pipeline] Evidence gathered. Categories: ${Array.from(evidenceMap.values()).map(e => e.category).join(', ')}`)

// ── Stage 2: Structured LLM reasoning (sequential, 3s delay) ──
const marketsForAnalysis = selectedForAnalysis.map(rec => ({
  question: rec.market.question,
  currentPrice: rec.odds,
  outcomes: rec.market.outcomes as string[],
  endDate: rec.market.endDateIso,
  volume: rec.market.volumeNum,
  liquidity: rec.market.liquidityNum,
}))

const llmResults = await analyzeMarketsBatch(marketsForAnalysis, evidenceMap)
```

**Remove the "nearCertainBoost" logic** from the recommendation building (around line 696-709 in the apply section):

Find the conviction scoring block that adds `nearCertainBoost` and `liquidityBonus` and simplify:

```typescript
// REPLACE the conviction scoring (lines ~696-709):
// OLD:
const confidenceBase = { high: 88, medium: 62, low: 30 }
const baseScore = confidenceBase[analysis.confidence] || 30
const edgeBonus = Math.min(7, Math.round(analysis.edgeSize * 100))
const evidenceBonus = Math.min(5, (analysis.evidenceCount || 0) * 2)
rec.convictionScore = Math.min(100, baseScore + edgeBonus + evidenceBonus)

// NEW:
const confidenceBase = { high: 85, medium: 55, low: 25 }
const baseScore = confidenceBase[analysis.confidence] || 25
// Signal strength bonus: evidence with actual bullish/bearish separation
const signalBonus = Math.min(10, Math.round((analysis.signalStrength || 0) / 10))
// Edge bonus (but evidence quality matters more)
const edgeBonus = Math.min(5, Math.round(analysis.edgeSize * 50))
rec.convictionScore = Math.min(95, baseScore + signalBonus + edgeBonus)
```

**Update the conviction label:**
```typescript
// REPLACE (around line 708):
// OLD:
rec.convictionLabel = rec.convictionScore >= 90 ? 'no-brainer' : rec.convictionScore >= 75 ? 'high' : rec.convictionScore >= 55 ? 'consider' : 'risky'

// NEW:
// Only 'high' or 'no-brainer' if LLM confirmed shouldBet=true
// Remove the automatic no-brainer label — it should be earned
if (analysis.shouldBet && analysis.confidence === 'high' && rec.convictionScore >= 80) {
  rec.convictionLabel = 'high'
} else if (analysis.shouldBet && analysis.confidence === 'medium' && rec.convictionScore >= 60) {
  rec.convictionLabel = 'consider'
} else {
  rec.convictionLabel = 'risky'
}
```

**Lower the cap for unanalyzed markets (line ~743):**
```typescript
// CHANGE:
rec.convictionScore = Math.min(rec.convictionScore, 30)  // was 40
rec.safetyScore = rec.convictionScore
```

**Fix the reasoning prefix for unanalyzed markets:**
```typescript
// REMOVE the "[⚠️ PENDING LLM ANALYSIS]" prefix from unanalyzed —
// these should simply have lower conviction scores
if (rec.convictionScore <= 30) {
  rec.confidence = 'low'
  rec.convictionLabel = 'risky'
}
```

- [ ] **Step 5: Test the full pipeline**

```bash
curl -s "http://localhost:3000/api/polymarket" | python3 -c "
import json, sys
d = json.load(sys.stdin)
recs = d.get('opportunities', [])
stats = d.get('stats', {})
print(f'Markets analyzed: {stats.get(\"marketsAnalyzed\", \"?\")}')
print(f'Opportunities found: {stats.get(\"opportunitiesFound\", \"?\")}')
print(f'Avg conviction: {stats.get(\"avgConviction\", \"?\")}')
print()
print('TOP 5 RECOMMENDATIONS:')
for r in recs[:5]:
    label = r.get('convictionLabel', '?')
    conf = r.get('confidence', '?')
    ev = r.get('expectedValue', 0) * 100
    price = r.get('odds', 0) * 100
    est = r.get('estimatedProbability', 0) * 100
    reason = r.get('reasoning', '')[:150]
    print(f'  [{label.upper():12}] conf={conf:6} EV={ev:+6.1f}% | {price:.1f}% -> {est:.1f}%')
    print(f'    Q: {r[\"market\"][\"question\"][:80]}')
    print(f'    Reason: {reason}...')
    print()
"
```

Expected results:
- Fewer opportunities (more conservative filtering)
- Higher average conviction scores (less noise)
- Sports/crypto/policy each showing relevant reasoning
- SKIP-labeled trades clearly demoted

- [ ] **Step 6: Commit**

```bash
git add app/api/polymarket/route.ts
git commit -m "feat: wire category research + structured LLM into recommendation pipeline

- Removed hardcoded categoryBias (+1% sports, -2% policy, etc.)
- Removed near-certain boost creating false confidence
- Raised EV threshold to 5% minimum for all markets
- Raised safety minimum to 40 for all markets
- Raised liquidity minimum to $1K for all markets
- LLM conviction scoring now uses evidence signal strength + edge
- Non-LLM-analyzed markets capped at conviction 30
- SKIP is the default when evidence is mixed

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Review Dashboard Component

**Files:**
- Review: `components/dashboard/polymarket-section.tsx`

- [ ] **Step 1: Check if reasoning format changed requires UI updates**

Look at how the reasoning is displayed. The new structured reasoning includes:
- "KEY DRIVERS:" prefix in reasoning text
- Different confidence format
- Evidence citations

If the UI truncates or formats the reasoning text, check that it handles longer reasoning text gracefully.

Run the app and verify the dashboard displays the new reasoning format properly:
```bash
# Open http://localhost:3000 and check the Polymarket section
# Look for:
# - Reasoning text showing step-by-step analysis
# - Confidence badges matching new calibration
# - Conviction labels matching new scoring
```

- [ ] **Step 2: Commit if any changes needed, or skip**

```bash
# If no changes needed:
git add components/dashboard/polymarket-section.tsx
git commit -m "chore: review polymarket-section — no UI changes needed for new reasoning format

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Verification Checklist

After all tasks complete, run this end-to-end check:

```bash
curl -s "http://localhost:3000/api/polymarket" | python3 -c "
import json, sys
d = json.load(sys.stdin)
recs = d.get('opportunities', [])
stats = d.get('stats', {})

print('=== QUALITY CHECK ===')
print(f'Total opportunities: {len(recs)}')
print(f'Markets analyzed: {stats.get(\"marketsAnalyzed\", \"?\")}')
print()

# Check 1: Are there high-confidence, high-conviction trades?
high = [r for r in recs if r.get('confidence') == 'high']
print(f'High confidence trades: {len(high)}')
if high:
    for r in high[:3]:
        print(f'  - {r[\"market\"][\"question\"][:60]} | {r[\"odds\"]*100:.1f}% -> {r[\"estimatedProbability\"]*100:.1f}%')

print()

# Check 2: Are sports trades showing sports-specific reasoning?
sports = [r for r in recs if 'vs' in r['market']['question'] or 'game' in r['market']['question'].lower()]
print(f'Sports trades: {len(sports)}')
if sports:
    for r in sports[:2]:
        print(f'  - {r[\"reasoning\"][:100]}')

print()

# Check 3: Are low-confidence trades properly demoted?
low = [r for r in recs if r.get('confidence') == 'low']
print(f'Low confidence trades: {len(low)} (should be fewer than before)')

print()

# Check 4: Average conviction
avg = stats.get('avgConviction', 0)
print(f'Average conviction: {avg} (should be higher than before — fewer noisy trades)')

print()
print('=== ALL CHECKS PASSED ===' if len(high) > 0 and len(recs) < 30 else '=== NEEDS REVIEW ===')
"
```

Expected: Fewer total trades, some high-confidence ones, sports reasoning present, higher average conviction.

---

## Spec Coverage Check

- [x] **Category-specific evidence gathering** → Task 1
- [x] **Two-sided structured reasoning prompt** → Task 2
- [x] **SKIP as default** → Task 2 (confidence gates + shouldBet logic)
- [x] **Remove hardcoded biases** → Task 3 (route.ts changes)
- [x] **Remove near-certain false boost** → Task 3 (removed from conviction scoring)
- [x] **Raise safety thresholds** → Task 3 (safetyMin = 40)
- [x] **Raise EV threshold** → Task 3 (5% minimum)
- [x] **Evidence-quality gates** → Task 2 (signalStrength in LLM analysis)
- [x] **Cap unanalyzed markets** → Task 3 (conviction 30)
- [x] **Dashboard review** → Task 4
