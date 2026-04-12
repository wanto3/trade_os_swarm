/**
 * Category-Aware Evidence Gathering Service
 *
 * Gathers evidence differently per market category (sports/crypto/policy/general),
 * separates findings into bullish/bearish/neutral, and scores signal strength.
 *
 * Designed as a drop-in replacement for the old generic gatherEvidence() in
 * groq-market-analysis.ts. This service is category-aware and feeds properly
 * separated evidence to downstream LLM analysis.
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MarketCategory = 'sports' | 'crypto' | 'policy' | 'general'

export type SignalDirection = 'bullish' | 'bearish' | 'neutral' | 'mixed' | 'none'

export interface WebFinding {
  text: string
  source: 'news' | 'duckduckgo' | 'specialized'
  sourceTag: 'news' | 'search' | 'cross-platform-odds' | 'domain-stats' | 'polling' | 'on-chain'
  url?: string
  date?: string
}

export interface CategoryEvidence {
  category: MarketCategory
  bullishFindings: WebFinding[]
  bearishFindings: WebFinding[]
  neutralFindings: WebFinding[]
  overallSignal: SignalDirection
  signalStrength: number  // 0-100
  keyInsights: string[]
  searchQueriesUsed: string[]
}

// ─── Keyword Dictionaries ─────────────────────────────────────────────────────

const POLICY_KEYWORDS = /\b(fed|rate|tariff|election|presid(ent|ential)|congress|senate|law|pass|bill|legislation|executive order|veto|regulation|inflation|jobs|nomination|senator|representative|governor|supreme court|federal|amend|gop|democrat|republican|constitutional|deficit|economy|unemployment|gdp|trade deal|immigration|healthcare|tax|obamacare|medicare|social security)\b/i

const CRYPTO_KEYWORDS = /\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|avax|meme|coin|etf|on-chain|token|defi|nft|stablecoin|blockchain|miner|hashrate|whale|funding rate|satoshi|web3|smart contract|layer.?2)\b/i

const SPORTS_KEYWORDS = /\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs|draft|roster|injur|coach|manager|match|matchup|tournament|open|doubles|cup|elimination|knockout|race|grand prix|marathon|olympic|golf|dart|soccer|baseball|hockey|cricket|boxing|mma|ufc|pga|lpga|champion|winner|loser|defeated|knocked out|eliminated|victory|lost to)\b/i

// ─── Signal Word Dictionaries ─────────────────────────────────────────────────

const BULLISH_WORDS = [
  'likely', 'confirmed', 'approved', 'passed', 'winning', 'ahead', 'will win',
  'support', 'bullish', 'growth', 'approved', 'signed', 'elected', 'won', 'favor',
  'strong', 'beat', 'defeated', 'lead', 'leading', 'higher', 'success', 'positive',
  'breakthrough', 'adoption', 'record high', 'all-time', 'surge', 'rally', 'upgrade',
  'increase', 'upgraded', 'undervalued', 'opportunity', 'bullish', 'catalyst',
  // Sports-specific
  'won the', 'victory', 'defeat', 'eliminated', 'knocked out',
  // Policy-specific
  'signed into law', 'enacted', 'passed the', 'cleared', 'endorsed', 'backed',
  // Crypto-specific
  'institutional', 'inflows', 'breakout', 'accumulation', 'all-time high',
]

const BEARISH_WORDS = [
  'unlikely', 'rejected', 'failed', 'losing', 'behind', 'resistance', 'bearish',
  'decline', 'ban', 'crackdown', 'negative', 'downgrade', 'lost', 'vetoed',
  'illegal', 'risk', 'concern', 'uncertain', 'lower', 'weaker', 'worse',
  'rejected', 'struck down', 'penalty', 'drop', 'crash', 'selloff', 'fear',
  'overvalued', 'headwind', 'counter', 'contradicted', 'disputed',
  // Sports-specific
  'lost to', 'defeat', 'eliminated', 'knocked out', 'blowout',
  // Policy-specific
  'blocked', 'stalled', 'delayed', 'defeated', 'withdrawn', 'veto override',
  // Crypto-specific
  'outflows', 'rejection', 'sell pressure', 'whale dump', 'liquidation',
]

// ─── Category Classification ──────────────────────────────────────────────────

export function classifyCategory(question: string): MarketCategory {
  const q = question.toLowerCase()

  // Policy: most specific — check first to avoid false positives from generic terms
  if (POLICY_KEYWORDS.test(q)) return 'policy'
  // Crypto: specific asset names
  if (CRYPTO_KEYWORDS.test(q)) return 'crypto'
  // Sports: sport-specific keywords
  if (SPORTS_KEYWORDS.test(q)) return 'sports'

  return 'general'
}

// ─── Sports Entity Extraction ─────────────────────────────────────────────────

interface ExtractedSportsEntities {
  teams: string[]
  sport: string
}

/**
 * Extract team names from questions like "Team A vs Team B" or "Will Team A beat Team B"
 * by matching the "A vs B" pattern and capitalized word sequences.
 */
function extractSportsEntities(question: string): ExtractedSportsEntities {
  const teams: string[] = []
  let sport = ''

  // Pattern 1: "Team A vs Team B"
  const vsMatch = question.match(/\b([A-Z][a-zA-Z\s&']+?)\s+vs\.?\s+([A-Z][a-zA-Z\s&']+)/i)
  if (vsMatch) {
    teams.push(vsMatch[1].trim())
    teams.push(vsMatch[2].trim())
  }

  // Pattern 2: "Will [Team] beat/lose to [Team]"
  const beatMatch = question.match(/\b([A-Z][a-zA-Z\s&']+?)\s+(?:beat|lose to|defeat)\s+([A-Z][a-zA-Z\s&']+)/i)
  if (beatMatch) {
    const t1 = beatMatch[1].trim()
    const t2 = beatMatch[2].trim()
    if (!teams.includes(t1)) teams.push(t1)
    if (!teams.includes(t2)) teams.push(t2)
  }

  // Pattern 3: capitalized sequences (likely team names) — fallback
  if (teams.length < 2) {
    const capMatches = question.match(/\b[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,3}\b/g)
    if (capMatches) {
      for (const match of capMatches) {
        const clean = match.trim()
        // Filter out common non-team words
        const skip = ['The ', 'Will ', 'Will The ', 'World Cup', 'NBA Finals', 'Super Bowl',
          'Stanley Cup', 'Premier League', 'Champions League', 'World Series', 'Finals']
        if (!skip.some(s => match.startsWith(s)) && clean.length > 3 && clean.length < 40) {
          if (!teams.includes(clean)) teams.push(clean)
        }
      }
    }
  }

  // Infer sport from keywords
  if (/\b(nba|basketball|mvp|playoffs|finals)\b/i.test(question)) sport = 'basketball'
  else if (/\b(nfl|football|super bowl|playoffs)\b/i.test(question)) sport = 'football'
  else if (/\b(nhl|hockey|Stanley cup)\b/i.test(question)) sport = 'hockey'
  else if (/\b(fifa|world cup|soccer|football|match)\b/i.test(question)) sport = 'soccer'
  else if (/\b(mlb|baseball|world series)\b/i.test(question)) sport = 'baseball'
  else if (/\b(golf|masters|pga)\b/i.test(question)) sport = 'golf'
  else if (/\b(tennis|open|doubles)\b/i.test(question)) sport = 'tennis'
  else if (/\b(mma|ufc|boxing)\b/i.test(question)) sport = 'mma'
  else if (/\b(nascar|grand prix|race)\b/i.test(question)) sport = 'racing'

  return { teams: teams.slice(0, 4), sport }
}

// ─── Search Query Builders ──────────────────────────────────────────────────────

function cleanQuestionForSearch(question: string): string {
  return question
    .replace(/[?!.,;:()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100)
}

function buildSearchQueries(question: string, category: MarketCategory, entities?: ExtractedSportsEntities | null): string[] {
  const cleaned = cleanQuestionForSearch(question)
  const queries: string[] = []
  const year = '2026'

  switch (category) {
    case 'sports': {
      queries.push(`${cleaned} ${year}`)
      queries.push(`${cleaned} form recent games`)
      queries.push(`${cleaned} head to head record`)
      if (entities && entities.teams.length >= 2) {
        queries.push(`${entities.teams[0]} vs ${entities.teams[1]} schedule`)
      }
      break
    }
    case 'crypto': {
      queries.push(`${cleaned} ${year}`)
      queries.push(`${cleaned} on-chain metrics`)
      queries.push(`${cleaned} institutional ETF`)
      queries.push(`${cleaned} macro outlook ${year}`)
      break
    }
    case 'policy': {
      queries.push(`${cleaned} ${year}`)
      queries.push(`${cleaned} legislative progress`)
      queries.push(`${cleaned} expert analysis`)
      queries.push(`${cleaned} polling public opinion`)
      break
    }
    case 'general': {
      queries.push(`${cleaned} ${year}`)
      queries.push(`${cleaned} latest news`)
      break
    }
  }

  return Array.from(new Set(queries)).slice(0, 6)
}

// ─── Signal Interpretation ─────────────────────────────────────────────────────

function rateSignalStrength(findings: WebFinding[], direction: SignalDirection): number {
  if (findings.length === 0) return 0

  const count = findings.length
  const baseScore = Math.min(80, count * 12)

  // Direction bonuses
  if (direction === 'bullish' || direction === 'bearish') {
    // High-quality findings with strong signal words get boosted
    let strongSignalCount = 0
    for (const f of findings) {
      const text = f.text.toLowerCase()
      const hasStrongWord = [...BULLISH_WORDS, ...BEARISH_WORDS].some(w => text.includes(w.toLowerCase()))
      if (hasStrongWord) strongSignalCount++
    }
    const boost = Math.min(20, strongSignalCount * 5)
    return Math.min(100, baseScore + boost)
  }

  if (direction === 'mixed') {
    return Math.min(50, baseScore)
  }

  return baseScore
}

function interpretText(text: string): SignalDirection {
  const lowerText = text.toLowerCase()

  let bullishCount = 0
  let bearishCount = 0

  for (const word of BULLISH_WORDS) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    const matches = lowerText.match(regex)
    if (matches) bullishCount += matches.length
  }

  for (const word of BEARISH_WORDS) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    const matches = lowerText.match(regex)
    if (matches) bearishCount += matches.length
  }

  if (bullishCount === 0 && bearishCount === 0) return 'neutral'
  if (bullishCount > bearishCount * 1.5) return 'bullish'
  if (bearishCount > bullishCount * 1.5) return 'bearish'
  if (bullishCount > 0 || bearishCount > 0) return 'mixed'
  return 'neutral'
}

function classifyFinding(finding: WebFinding): 'bullish' | 'bearish' | 'neutral' {
  const direction = interpretText(finding.text)
  if (direction === 'bullish') return 'bullish'
  if (direction === 'bearish') return 'bearish'
  return 'neutral'
}

// ─── Web Search Functions ──────────────────────────────────────────────────────

/**
 * Fetch results from Google News RSS feed.
 * Returns up to 8 news items with source and date.
 */
async function searchGoogleNews(query: string): Promise<WebFinding[]> {
  const findings: WebFinding[] = []

  try {
    const encodedQuery = encodeURIComponent(query)
    const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    const response = await fetch(url, {
      headers: { 'Accept': 'application/xml, text/xml' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (response.ok) {
      const xml = await response.text()

      // Extract titles and descriptions from RSS items
      const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/gi
      const descRegex = /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/gi
      const linkRegex = /<link>(.*?)<\/link>/gi

      let match
      let count = 0
      const titles: string[] = []
      const links: string[] = []

      // Capture titles
      while ((match = titleRegex.exec(xml)) !== null && count < 8) {
        const title = (match[1] || match[2] || '').trim()
        if (title.length > 15 && !title.includes('Google News') && !title.includes('RSS')) {
          titles.push(title)
          count++
        }
      }

      // Capture links (next sibling after title in RSS)
      let linkCount = 0
      while ((match = linkRegex.exec(xml)) !== null && linkCount < count) {
        let link = (match[1] || '').trim()
        // Skip the first link which is the feed self-link
        if (linkCount > 0 || link.includes('news.google.com')) {
          links.push(link)
          linkCount++
        }
      }

      // Capture descriptions
      const descs: string[] = []
      while ((match = descRegex.exec(xml)) !== null && descs.length < 8) {
        const desc = (match[1] || match[2] || '')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .trim()
        if (desc.length > 30) {
          descs.push(desc)
        }
      }

      // Build findings from titles (primary) and descriptions (secondary)
      for (let i = 0; i < Math.min(titles.length, 8); i++) {
        const title = titles[i]
        const desc = descs[i] || ''
        const combined = desc.length > 30 ? `${title}: ${desc}` : title
        if (combined.length > 20) {
          findings.push({
            text: combined.substring(0, 400),
            source: 'news',
            sourceTag: 'news',
            url: i < links.length ? links[i] : undefined,
          })
        }
      }
    }
  } catch {
    // Google News failed — return whatever we found so far
  }

  return findings
}

/**
 * Fetch results from DuckDuckGo Instant Answer API.
 * Returns background text and related topics.
 */
async function searchDuckDuckGo(query: string): Promise<WebFinding[]> {
  const findings: WebFinding[] = []

  try {
    const encodedQuery = encodeURIComponent(query)
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (res.ok) {
      const data: Record<string, any> = await res.json()

      // Abstract text
      if (data.AbstractText && data.AbstractText.length > 20) {
        findings.push({
          text: data.AbstractText.substring(0, 400),
          source: 'duckduckgo',
          sourceTag: 'search',
          url: data.AbstractURL || undefined,
        })
      }

      // Related Topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          const text = topic.Text || topic.Result || ''
          if (text && text.length > 20) {
            findings.push({
              text: text.substring(0, 300),
              source: 'duckduckgo',
              sourceTag: 'search',
              url: topic.FirstURL || topic.URL || undefined,
            })
          }
        }
      }
    }
  } catch {
    // DuckDuckGo failed — return whatever we found so far
  }

  return findings
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

// In-memory cache keyed by question (normalized), TTL 5 minutes
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { result: CategoryEvidence; expiry: number }>()

function getCached(question: string): CategoryEvidence | null {
  const key = question.substring(0, 100)
  const entry = cache.get(key)
  if (entry && entry.expiry > Date.now()) return entry.result
  return null
}

function setCache(question: string, result: CategoryEvidence): void {
  const key = question.substring(0, 100)
  cache.set(key, { result, expiry: Date.now() + CACHE_TTL_MS })
}

// ─── Core Evidence Gathering ─────────────────────────────────────────────────

/**
 * Main entry point: gather category-aware evidence for a single question.
 *
 * 1. Classifies the question into a category
 * 2. Builds category-specific search queries
 * 3. Runs all searches in parallel (Google News + DuckDuckGo)
 * 4. Separates findings into bullish/bearish/neutral buckets
 * 5. Scores signal strength and determines overall direction
 * 6. Returns structured CategoryEvidence ready for LLM consumption
 */
export async function gatherCategoryEvidence(question: string): Promise<CategoryEvidence> {
  // Check cache first
  const cached = getCached(question)
  if (cached) return cached

  const category = classifyCategory(question)
  const entities = category === 'sports' ? extractSportsEntities(question) : null
  const queries = buildSearchQueries(question, category, entities)

  // Collect all findings from all searches in parallel
  // Each search handles its own errors — one failing search doesn't affect others
  const searchResults = await Promise.allSettled(
    queries.flatMap(q => [
      searchGoogleNews(q),
      searchDuckDuckGo(q),
    ])
  )

  // Flatten all findings
  const allFindings: WebFinding[] = []
  for (const result of searchResults) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allFindings.push(...result.value)
    }
  }

  // Deduplicate by text (first occurrence wins)
  const seenTexts = new Set<string>()
  const uniqueFindings: WebFinding[] = []
  for (const f of allFindings) {
    const normalized = f.text.substring(0, 80).toLowerCase()
    if (!seenTexts.has(normalized)) {
      seenTexts.add(normalized)
      uniqueFindings.push(f)
    }
  }

  // Separate into buckets
  const bullishFindings: WebFinding[] = []
  const bearishFindings: WebFinding[] = []
  const neutralFindings: WebFinding[] = []

  for (const f of uniqueFindings) {
    const bucket = classifyFinding(f)
    if (bucket === 'bullish') bullishFindings.push(f)
    else if (bucket === 'bearish') bearishFindings.push(f)
    else neutralFindings.push(f)
  }

  // Determine overall signal
  const total = bullishFindings.length + bearishFindings.length
  let overallSignal: SignalDirection = 'none'

  if (total === 0) {
    overallSignal = neutralFindings.length > 0 ? 'neutral' : 'none'
  } else {
    const ratio = bullishFindings.length / total
    if (ratio > 0.6) overallSignal = 'bullish'
    else if (ratio < 0.4) overallSignal = 'bearish'
    else overallSignal = 'mixed'
  }

  // Score signal strength
  const signalStrength = rateSignalStrength(uniqueFindings, overallSignal)

  // Build key insights from top findings
  const keyInsights: string[] = []
  for (const f of uniqueFindings.slice(0, 5)) {
    const sentiment = classifyFinding(f)
    const prefix = sentiment === 'bullish' ? '[BULLISH]' : sentiment === 'bearish' ? '[BEARISH]' : '[INFO]'
    keyInsights.push(`${prefix} ${f.text.substring(0, 200)}`)
  }

  const result: CategoryEvidence = {
    category,
    bullishFindings,
    bearishFindings,
    neutralFindings,
    overallSignal,
    signalStrength,
    keyInsights,
    searchQueriesUsed: queries,
  }

  setCache(question, result)
  return result
}

/**
 * Batch wrapper: gather evidence for multiple questions in parallel,
 * returning a Map of question -> CategoryEvidence.
 *
 * Each question is handled independently with its own cache entry.
 * Failed questions are included in the map with 'none' signal rather than throwing.
 */
export async function gatherEvidenceBatch(questions: string[]): Promise<Map<string, CategoryEvidence>> {
  const results = new Map<string, CategoryEvidence>()

  await Promise.allSettled(
    questions.map(async (q) => {
      try {
        const evidence = await gatherCategoryEvidence(q)
        results.set(q, evidence)
      } catch (e) {
        // On failure, insert empty evidence rather than crashing the batch
        results.set(q, {
          category: classifyCategory(q),
          bullishFindings: [],
          bearishFindings: [],
          neutralFindings: [],
          overallSignal: 'none',
          signalStrength: 0,
          keyInsights: [],
          searchQueriesUsed: [],
        })
      }
    })
  )

  return results
}
