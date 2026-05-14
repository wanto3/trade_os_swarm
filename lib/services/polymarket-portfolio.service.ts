import { promises as fs } from 'fs';
import { join } from 'path';
import type { TradeRecommendation } from '@/app/api/polymarket/route';
import * as dpsServiceImport from './dps.service';

export interface PolymarketPosition {
  id: string
  marketId: string
  question: string
  outcome: 'Yes' | 'No'
  outcomeIndex: number
  entryPrice: number
  quantity: number
  cost: number
  potentialPayout: number
  confidence: 'high' | 'medium' | 'low'
  safetyScore: number
  estimatedProbability: number
  marketImpliedProb: number
  expectedValue: number
  category: 'crypto' | 'sports' | 'policy' | 'general'
  /** DPS category — granular tier for learning calibration. Optional for backward compat with older positions. */
  dpsCategory?: string
  /** DPS tier at time of placement. */
  dpsTier?: 'high' | 'medium' | 'low'
  /** AI-edge tier at placement: 'strong' | 'user' | 'weak'. The learning loop's
   *  most important grouping — if 'strong' picks hit 90% but 'weak' hits 50%,
   *  we know to trust Opus only on its bread-and-butter categories. */
  aiEdge?: 'strong' | 'user' | 'weak'
  /** Daily-ROI estimate at placement (EV / daysToClose). Lets the analytics
   *  compare predicted vs actual return rates per category. */
  dailyRoiAtPlacement?: number
  /** Days-to-close at placement — used to compute actual realized hold time. */
  daysToCloseAtPlacement?: number
  /** Snapshot of LLM reasoning at placement time — for post-hoc analysis. */
  reasoningAtPlacement?: string
  /** Where this position came from:
   *   - 'app'      — user clicked Place from a dashboard recommendation (default)
   *   - 'auto'     — auto-trader placed it (config.enabled = true)
   *   - 'imported' — user imported from a Polymarket screenshot (their real
   *                  trades, mirrored into the paper portfolio for tracking).
   *                  Used by the comparison view to separate app-recommended
   *                  picks from user-traded picks for hit-rate analysis. */
  source?: 'app' | 'auto' | 'imported'
  placedAt: number
  resolvedAt?: number
  status: 'open' | 'won' | 'lost'
  resolution?: 'yes' | 'no' | 'invalid'
  pnl?: number
  pnlPercent?: number
  url: string
  // Live mark-to-market fields, populated for positions imported from
  // a Polymarket address. `currentMarketPrice` is the current price of
  // the held side (0-1). `unrealizedPnl` is (currentMarketPrice -
  // entryPrice) * quantity at the last sync. Both stay undefined on
  // app-placed paper positions where we don't poll a live price.
  currentMarketPrice?: number
  unrealizedPnl?: number
}

export interface PolymarketPortfolio {
  bankroll: number
  startingBankroll: number
  totalPnl: number
  totalTrades: number
  wonTrades: number
  lostTrades: number
  positions: PolymarketPosition[]
  lastUpdate: number
  /** Bankroll history: a snapshot is appended on every position placement
   *  and resolution. Powers the compounding-curve chart so the user can SEE
   *  $4 → $X over time, not just current bankroll. Capped at 500 entries
   *  for storage sanity. */
  bankrollHistory?: Array<{ ts: number; bankroll: number; totalPnl: number; trigger: 'init' | 'placed' | 'won' | 'lost' | 'invalid' }>
  /** Daily performance journal — one snapshot per UTC day capturing the
   *  day's trading activity vs the $4 → $100 target trajectory. Lets the
   *  user see "on track" or "behind" at a glance over weeks/months,
   *  separate from the per-event bankrollHistory firehose. */
  dailyPerformance?: Array<DailySnapshot>
}

export interface DailySnapshot {
  date: string                // 'YYYY-MM-DD' UTC
  startBankroll: number       // bankroll at first activity of the day
  endBankroll: number         // bankroll at last activity of the day
  netPnl: number              // sum of resolutions on this day
  trades: {
    placed: number            // positions opened today
    resolved: number          // positions closed today (any outcome)
    wins: number              // 'won' resolutions today
    losses: number            // 'lost' resolutions today
  }
  /** Hit rate by AI-edge tier on resolutions THAT CLOSED TODAY. Null when
   *  zero bets resolved in that tier — UI displays "—" instead of 0%. */
  hitRateByEdge: {
    strong: number | null
    user: number | null
    weak: number | null
  }
  /** Target bankroll trajectory: $4 starting → $100 at end of month, log
   *  interpolation. Lets the UI overlay "where you should be today" on
   *  the compounding curve. Computed from startingBankroll + daysElapsed. */
  targetBankroll: number
  /** True if endBankroll >= targetBankroll. Drives the "on track" badge. */
  onTrack: boolean
}

export interface AutoTraderConfig {
  enabled: boolean
  kellyMode: 'quarter' | 'half' | 'full'
  confidenceFilter: 'high' | 'medium'
  maxOpenPositions: number
  maxBetSizePercent: number
  startingBankroll: number
  lastPoll: number | null
  lastPlacement: number | null
}

const DATA_DIR = join(process.cwd(), 'data')
const POSITIONS_FILE = join(DATA_DIR, 'polymarket-positions.json')
const PORTFOLIO_FILE = join(DATA_DIR, 'polymarket-portfolio.json')
const CONFIG_FILE = join(DATA_DIR, 'polymarket-autotrader.json')

const DEFAULT_PORTFOLIO: PolymarketPortfolio = {
  bankroll: 1000,
  startingBankroll: 1000,
  totalPnl: 0,
  totalTrades: 0,
  wonTrades: 0,
  lostTrades: 0,
  positions: [],
  lastUpdate: Date.now(),
}

const DEFAULT_CONFIG: AutoTraderConfig = {
  enabled: false,
  // Half Kelly default — small-capital + AI-edge user wants slightly more
  // aggressive sizing than ¼ K. Half Kelly is the textbook risk-adjusted
  // optimum: ~75% of full-Kelly growth rate with much lower variance.
  kellyMode: 'half',
  confidenceFilter: 'high',
  maxOpenPositions: 5,
  maxBetSizePercent: 20,  // was 10 — slightly more aggressive ceiling for $4 grow phase
  startingBankroll: 1000,
  lastPoll: null,
  lastPlacement: null,
}

// In-memory state
let portfolio: PolymarketPortfolio = { ...DEFAULT_PORTFOLIO }
let positions: PolymarketPosition[] = []
let config: AutoTraderConfig = { ...DEFAULT_CONFIG }
let initialized = false

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR)
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true })
  }
}

async function initialize(): Promise<void> {
  if (initialized) return
  try {
    await ensureDataDir()
    try {
      const portfolioData = await fs.readFile(PORTFOLIO_FILE, 'utf-8')
      portfolio = JSON.parse(portfolioData)
      positions = portfolio.positions
      // Backfill: if bankrollHistory is missing (older portfolio file), seed it
      // with an init snapshot so the curve starts somewhere instead of empty.
      if (!portfolio.bankrollHistory || portfolio.bankrollHistory.length === 0) {
        portfolio.bankrollHistory = [{
          ts: Date.now(),
          bankroll: portfolio.bankroll,
          totalPnl: portfolio.totalPnl,
          trigger: 'init',
        }]
        await savePortfolioData()
      }
      // Backfill dailyPerformance with today's entry on first load. Subsequent
      // ticks from the cron / dashboard will keep it current.
      if (!portfolio.dailyPerformance) portfolio.dailyPerformance = []
      recordDailySnapshot()
    } catch {
      await savePortfolioData()
    }
    try {
      const configData = await fs.readFile(CONFIG_FILE, 'utf-8')
      config = { ...DEFAULT_CONFIG, ...JSON.parse(configData) }
    } catch {
      await saveConfigData()
    }
    initialized = true
  } catch (error) {
    console.error('Error loading Polymarket portfolio data:', error)
  }
}

async function savePortfolioData(): Promise<void> {
  try {
    await ensureDataDir()
    portfolio.positions = positions
    portfolio.lastUpdate = Date.now()
    await fs.writeFile(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2))
  } catch (error) {
    console.error('Error saving Polymarket portfolio:', error)
  }
}

async function saveConfigData(): Promise<void> {
  try {
    await ensureDataDir()
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))
  } catch (error) {
    console.error('Error saving Polymarket autotrader config:', error)
  }
}

function calculateKellyBetSize(
  bankroll: number,
  estimatedProb: number,
  marketProb: number,
  kellyMode: 'quarter' | 'half' | 'full',
  /** Tier multiplier — bet more when AI is most reliable. Caller passes
   *  1.5 for AI-Strong + high-confidence picks, 0.75 for AI-weak picks,
   *  1.0 default. Layered on top of the Kelly mode multiplier. */
  edgeTrustMultiplier = 1.0,
): number {
  const decimalOdds = (1 / marketProb) - 1
  if (decimalOdds <= 0 || estimatedProb <= 0) return 0
  const q = 1 - estimatedProb
  const kelly = (decimalOdds * estimatedProb - q) / decimalOdds
  const positiveKelly = Math.max(0, kelly)
  // Internal cap raised 10% → 15%. Half Kelly on a 25-30% raw Kelly pick
  // (typical AI-Strong) at the old 10% cap was capping too low to deploy
  // meaningfully as bankroll grows. 15% lets the half-Kelly default
  // actually bite at $20-50 bankroll while staying below full Kelly's
  // bust-risk territory.
  const cappedKelly = Math.min(positiveKelly, 0.15)
  const multiplier = kellyMode === 'full' ? 1 : kellyMode === 'half' ? 0.5 : 0.25
  return bankroll * cappedKelly * multiplier * edgeTrustMultiplier
}

/** Compounding-target multiplier: grow the bankroll by this factor by
 *  TARGET_END_DATE_UTC. User's stated $4 → $100 = 25× growth, applied
 *  uniformly so any starting bankroll has a sensible target:
 *   $4 start  → $100 target
 *   $10 start → $250 target
 *   $1000 start → $25,000 target
 *  This avoids the broken "shrink $1000 → $100" trajectory that came
 *  from a hardcoded $100 absolute target. */
const TARGET_MULTIPLIER = 25
const TARGET_END_DATE_UTC = '2026-05-31T23:59:00Z'

/** End-state target bankroll (start × multiplier). Used for trajectory
 *  + UI labels. */
function targetEndBankroll(): number {
  const start = portfolio.startingBankroll || 4
  return start * TARGET_MULTIPLIER
}

/** Compute "where the bankroll SHOULD be today" if we're on a smooth
 *  log-interpolated GROWTH path from start → start×TARGET_MULTIPLIER.
 *  Always ascending — the on-track flag means "growing fast enough."
 *  Used for the daily progress trajectory. */
function computeTargetBankroll(): number {
  const startBankroll = portfolio.startingBankroll || 4
  const targetEnd = targetEndBankroll()
  const startTs = portfolio.bankrollHistory?.[0]?.ts ?? Date.now()
  const targetTs = new Date(TARGET_END_DATE_UTC).getTime()
  const totalDays = Math.max(1, (targetTs - startTs) / (1000 * 60 * 60 * 24))
  const daysElapsed = Math.max(0, (Date.now() - startTs) / (1000 * 60 * 60 * 24))
  if (daysElapsed >= totalDays) return targetEnd
  // Log-interpolate: bankroll(t) = start × (target/start)^(t/totalDays)
  const ratio = targetEnd / startBankroll
  return startBankroll * Math.pow(ratio, daysElapsed / totalDays)
}

/** Record or update today's daily snapshot. Idempotent — call from
 *  runResolutionOnly + every placement/resolution; this updates the
 *  current-day entry in place rather than appending duplicates. */
function recordDailySnapshot(): void {
  if (!portfolio.dailyPerformance) portfolio.dailyPerformance = []
  const today = new Date().toISOString().split('T')[0]  // 'YYYY-MM-DD' UTC
  const todayMs = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  )
  const tomorrowMs = todayMs + 24 * 60 * 60 * 1000

  // Bucket today's activity from positions
  const placedToday = positions.filter(p => p.placedAt >= todayMs && p.placedAt < tomorrowMs)
  const resolvedToday = positions.filter(p => p.resolvedAt && p.resolvedAt >= todayMs && p.resolvedAt < tomorrowMs)
  const winsToday = resolvedToday.filter(p => p.status === 'won')
  const lossesToday = resolvedToday.filter(p => p.status === 'lost')
  const netPnlToday = resolvedToday.reduce((s, p) => s + (p.pnl ?? 0), 0)

  // Per-AI-edge hit rate on TODAY'S resolutions only
  const hitRateAt = (edge: 'strong' | 'user' | 'weak'): number | null => {
    const inTier = resolvedToday.filter(p => p.aiEdge === edge)
    if (inTier.length === 0) return null
    const w = inTier.filter(p => p.status === 'won').length
    return (w / inTier.length) * 100
  }

  // First-of-day startBankroll: lowest bankrollHistory entry today's date
  // (or current bankroll if no history today). Falls back gracefully.
  let startBankroll = portfolio.bankroll
  if (portfolio.bankrollHistory) {
    const todayHist = portfolio.bankrollHistory.filter(h => h.ts >= todayMs && h.ts < tomorrowMs)
    if (todayHist.length > 0) {
      startBankroll = todayHist[0].bankroll
    } else {
      // Use last bankroll BEFORE today as starting point
      const beforeToday = portfolio.bankrollHistory.filter(h => h.ts < todayMs)
      if (beforeToday.length > 0) startBankroll = beforeToday[beforeToday.length - 1].bankroll
    }
  }

  const targetBankroll = computeTargetBankroll()
  const snapshot: DailySnapshot = {
    date: today,
    startBankroll,
    endBankroll: portfolio.bankroll,
    netPnl: netPnlToday,
    trades: {
      placed: placedToday.length,
      resolved: resolvedToday.length,
      wins: winsToday.length,
      losses: lossesToday.length,
    },
    hitRateByEdge: {
      strong: hitRateAt('strong'),
      user: hitRateAt('user'),
      weak: hitRateAt('weak'),
    },
    targetBankroll,
    onTrack: portfolio.bankroll >= targetBankroll,
  }

  // Upsert today's entry
  const existingIdx = portfolio.dailyPerformance.findIndex(d => d.date === today)
  if (existingIdx >= 0) {
    portfolio.dailyPerformance[existingIdx] = snapshot
  } else {
    portfolio.dailyPerformance.push(snapshot)
  }
}

/** Append a bankroll snapshot. Called every time the bankroll changes so
 *  the compounding curve UI can render $4 → $X over time. Caps at 500
 *  entries (≈ years of trading at this volume) to bound storage. */
function snapshotBankroll(trigger: 'init' | 'placed' | 'won' | 'lost' | 'invalid'): void {
  if (!portfolio.bankrollHistory) portfolio.bankrollHistory = []
  portfolio.bankrollHistory.push({
    ts: Date.now(),
    bankroll: portfolio.bankroll,
    totalPnl: portfolio.totalPnl,
    trigger,
  })
  // Keep history bounded
  if (portfolio.bankrollHistory.length > 500) {
    portfolio.bankrollHistory = portfolio.bankrollHistory.slice(-500)
  }
}

function classifyCategory(question: string): PolymarketPosition['category'] {
  const q = question.toLowerCase()
  if (/\b(fed|rate|tariff|election|presid(ent|ential)|congress|law|pass|convicted|inflation|jobs|nomination)\b/.test(q)) return 'policy'
  if (/\b(btc|bitcoin|eth(ereum)?|sol(ana)?|crypto|dogecoin|xrp|ada|dot|trump|meme|coin)\b/.test(q)) return 'crypto'
  if (/\b(vs|beat|loss|score|game|team|league|championship|nba|nfl|mlb|premier|ufa|tennis|basketball|football|mvp|world cup|fifa|nhl|stanley cup|series|semifinal|quarterfinal|finals|playoffs)\b/.test(q)) return 'sports'
  return 'general'
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function ensureInitialized(): Promise<void> {
  await initialize()
}

export function getConfig(): AutoTraderConfig {
  return { ...config }
}

export function updateConfig(updates: Partial<AutoTraderConfig>): AutoTraderConfig {
  config = { ...config, ...updates }
  saveConfigData()
  return { ...config }
}

export function getPortfolio(): PolymarketPortfolio {
  return {
    bankroll: portfolio.bankroll,
    startingBankroll: portfolio.startingBankroll,
    totalPnl: portfolio.totalPnl,
    totalTrades: portfolio.totalTrades,
    wonTrades: portfolio.wonTrades,
    lostTrades: portfolio.lostTrades,
    positions: [...positions],
    lastUpdate: portfolio.lastUpdate,
  }
}

export function getPositions(openOnly = false): PolymarketPosition[] {
  if (openOnly) return positions.filter(p => p.status === 'open')
  return [...positions]
}

export function getPosition(id: string): PolymarketPosition | undefined {
  return positions.find(p => p.id === id)
}

export function getOpenPositionByMarketId(marketId: string): PolymarketPosition | undefined {
  return positions.find(p => p.marketId === marketId && p.status === 'open')
}

export function canPlaceTrade(): { allowed: boolean; reason?: string } {
  const openCount = positions.filter(p => p.status === 'open').length
  if (openCount >= config.maxOpenPositions) {
    return { allowed: false, reason: `Max open positions reached (${config.maxOpenPositions})` }
  }
  if (portfolio.bankroll <= 0) {
    return { allowed: false, reason: 'Bankroll depleted' }
  }
  return { allowed: true }
}

export function createPosition(rec: TradeRecommendation): PolymarketPosition | null {
  const { allowed, reason } = canPlaceTrade()
  if (!allowed) {
    console.log(`[PolymarketPortfolio] Cannot place trade: ${reason}`)
    return null
  }

  // Note: previously skipped markets closing within 1 day. Removed because
  // many high-edge prediction-market opportunities resolve same-day; the user
  // clicking the button knows what they're doing. Auto-trader can guard against
  // imminent placement at its own layer if needed.

  // Apply Kelly sizing — uses estimatedProbability/marketImpliedProb that are
  // already side-correct (set by route.ts based on rec.outcome). The edge-trust
  // multiplier sizes UP on AI-Strong + high-confidence picks (where Opus is
  // most reliable) and sizes DOWN on AI-weak picks (coin-flippy categories).
  const recAi = (rec as TradeRecommendation & { aiEdge?: 'strong' | 'user' | 'weak' }).aiEdge
  let edgeTrustMultiplier = 1.0
  if (recAi === 'strong' && rec.confidence === 'high') edgeTrustMultiplier = 1.5
  else if (recAi === 'strong' && rec.confidence === 'medium') edgeTrustMultiplier = 1.2
  else if (recAi === 'weak') edgeTrustMultiplier = 0.6
  // 'user' (esports) stays at 1.0 — user judgment determines actual edge

  const rawBet = calculateKellyBetSize(
    portfolio.bankroll,
    rec.estimatedProbability,
    rec.marketImpliedProb,
    config.kellyMode,
    edgeTrustMultiplier,
  )

  // Cap at max bet size % of bankroll
  const maxBet = portfolio.bankroll * (config.maxBetSizePercent / 100)
  let betSize = Math.min(rawBet, maxBet)

  // Floor: if Kelly is positive but tiny, place a minimal $1 paper bet so the
  // user actually sees the trade in their portfolio. Without this, near-certain
  // long-tail picks (Kelly ~ pennies) silently fail to place.
  if (betSize > 0 && betSize < 1) {
    betSize = Math.min(1, portfolio.bankroll)
  }

  if (betSize <= 0) {
    console.log(
      `[PolymarketPortfolio] Cannot place ${rec.market.question}: Kelly=0 (estimatedProb=${rec.estimatedProbability.toFixed(3)} vs market=${rec.marketImpliedProb.toFixed(3)} — model thinks this side is unfavorable)`
    )
    return null
  }

  const entryPrice = rec.odds
  if (entryPrice <= 0 || entryPrice >= 1) {
    console.log(`[PolymarketPortfolio] Invalid entry price ${entryPrice} for ${rec.market.question}`)
    return null
  }

  const quantity = betSize / entryPrice
  const cost = entryPrice * quantity
  const potentialPayout = (1 - entryPrice) * quantity

  const outcomeIndex = rec.outcome === 'Yes' || rec.outcome === '1' ? 0 : 1

  // Compute DPS at placement time so learning stats can group by tier/category later.
  // Lazy import to avoid circular dep risk.
  let dpsCategory: string | undefined
  let dpsTier: 'high' | 'medium' | 'low' | undefined
  try {
    // Use the imported function (top of file would create a circular dep risk
    // since this module is itself loaded by route.ts; lazy import via dynamic
    // require avoids it but the eslint plugin for that rule isn't installed).
    const dpsModule = dpsServiceImport
    if (dpsModule) {
      const dps = dpsModule.scoreDomainPredictability(rec.market.question)
      dpsCategory = dps.category
      dpsTier = dps.tier
    }
  } catch { /* DPS service not available — fall back to legacy category only */ }

  // Capture aiEdge + dailyRoi at placement time. These are the learning-loop
  // groupings — when this position resolves, we'll know whether the AI
  // edge tier predicted the outcome correctly.
  const recExt = rec as TradeRecommendation & {
    aiEdge?: 'strong' | 'user' | 'weak'
    dailyRoi?: number
  }

  const position: PolymarketPosition = {
    id: `pm-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    marketId: rec.market.id,
    question: rec.market.question,
    outcome: rec.outcome as 'Yes' | 'No',
    outcomeIndex,
    entryPrice,
    quantity,
    cost,
    potentialPayout,
    confidence: rec.confidence,
    safetyScore: rec.safetyScore,
    estimatedProbability: rec.estimatedProbability,
    marketImpliedProb: rec.marketImpliedProb,
    expectedValue: rec.expectedValue,
    category: classifyCategory(rec.market.question),
    dpsCategory,
    dpsTier,
    aiEdge: recExt.aiEdge,
    dailyRoiAtPlacement: recExt.dailyRoi,
    daysToCloseAtPlacement: rec.daysToClose,
    reasoningAtPlacement: rec.reasoning?.substring(0, 500),
    placedAt: Date.now(),
    status: 'open',
    url: rec.market.url,
  }

  positions.push(position)
  portfolio.bankroll -= cost
  portfolio.totalTrades = positions.length
  portfolio.lastUpdate = Date.now()
  config.lastPlacement = Date.now()
  config.lastPoll = Date.now()

  snapshotBankroll('placed')
  recordDailySnapshot()
  savePortfolioData()
  saveConfigData()

  console.log(`[PolymarketPortfolio] Placed trade: ${rec.market.question.substring(0, 60)} | ${rec.outcome} @ ${entryPrice} | $${cost.toFixed(2)} | DPS:${dpsTier}/${dpsCategory}`)
  return position
}

export interface ImportedPositionInput {
  question: string
  outcome: 'Yes' | 'No'
  /** Price the user paid per share (0-1). */
  entryPrice: number
  /** Number of shares held. cost = entryPrice * quantity. */
  quantity: number
  /** Polymarket market URL if known — UI can link out. Optional. */
  url?: string
  /** Optional placement timestamp. Defaults to now. Use this if the user
   *  knows when they bought (e.g. "3 days ago" → pass an ISO string). */
  placedAtIso?: string
  /** Free-form note from the user (e.g. "manual position from Polymarket
   *  screenshot of 2026-05-08"). Stored as reasoningAtPlacement. */
  note?: string
  /** Skip the Polymarket Gamma API market-lookup step. Default false.
   *  Set true if you've already pre-matched the position OR if you
   *  explicitly want a manual-only position with no auto-resolution. */
  skipLookup?: boolean
  /** Live market price for the held side at import time (0-1). When set,
   *  the position records currentMarketPrice + unrealizedPnl so the
   *  dashboard can display real PnL on open positions, not just
   *  realized PnL after resolution. */
  currentMarketPrice?: number
  /** Live cashPnl reported by Polymarket for this position. If provided,
   *  overrides the (curPrice − avgPrice) × size computation. Useful
   *  because Polymarket's value includes fees / partial fills the naive
   *  formula misses. */
  livePnl?: number
}

// ─── Polymarket Gamma market lookup (for imported-position resolution) ─────

interface GammaMarket {
  id: string
  question: string
  slug?: string
  closed?: boolean
  endDate?: string
  resolution?: string
}

let marketsLookupCache: { markets: GammaMarket[]; ts: number } | null = null
const MARKETS_LOOKUP_CACHE_TTL_MS = 60 * 60_000  // 1 hour

const LOOKUP_STOPWORDS = new Set([
  'will', 'is', 'the', 'a', 'an', 'be', 'by', 'in', 'on', 'at', 'to', 'of',
  'for', 'with', 'this', 'that', 'there', 'than', 'as', 'and', 'or', 'if',
  'are', 'do', 'does', 'have', 'has', 'had', 'was', 'were',
])

function tokenize(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 2 && !LOOKUP_STOPWORDS.has(t)),
  )
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const x of Array.from(a)) if (b.has(x)) intersection++
  const union = a.size + b.size - intersection
  return union > 0 ? intersection / union : 0
}

async function fetchAllMarkets(): Promise<GammaMarket[]> {
  if (marketsLookupCache && Date.now() - marketsLookupCache.ts < MARKETS_LOOKUP_CACHE_TTL_MS) {
    return marketsLookupCache.markets
  }
  try {
    // Open + closed in parallel. Cap at 1000 each — most-recently-active
    // markets first. Imported positions are typically still active, but
    // matching against closed lets us also handle already-resolved imports.
    const [openRes, closedRes] = await Promise.all([
      fetch('https://gamma-api.polymarket.com/markets?closed=false&accepting_orders=true&order=volumeNum&ascending=false&limit=1000', { cache: 'no-store' }),
      fetch('https://gamma-api.polymarket.com/markets?closed=true&order=endDate&ascending=false&limit=500', { cache: 'no-store' }),
    ])
    const open = openRes.ok ? await openRes.json() : []
    const closed = closedRes.ok ? await closedRes.json() : []
    const all = [
      ...(Array.isArray(open) ? open : []),
      ...(Array.isArray(closed) ? closed : []),
    ] as GammaMarket[]
    marketsLookupCache = { markets: all, ts: Date.now() }
    return all
  } catch (e) {
    console.warn('[Portfolio] Gamma markets fetch failed:', e instanceof Error ? e.message : e)
    return marketsLookupCache?.markets ?? []
  }
}

/** Find a Polymarket market whose question best matches the given text.
 *  Used at import-time to back-fill the real marketId so auto-resolution
 *  works on imported positions. Returns null if no match crosses the
 *  similarity threshold (default 0.5 Jaccard token overlap).
 *
 *  Threshold tuning notes:
 *   - 0.5: catches "Reform UK Welsh Senedd" → "Will Reform UK win the most
 *     seats in the 2026 Welsh Senedd election?" (high overlap on rare tokens)
 *   - <0.4: false positives common (any politics question matches)
 *   - >0.7: misses screenshots that truncate questions */
export async function lookupMarketByQuestion(
  question: string,
  minSimilarity = 0.5,
): Promise<GammaMarket | null> {
  const queryTokens = tokenize(question)
  if (queryTokens.size === 0) return null
  const allMarkets = await fetchAllMarkets()
  let bestMatch: GammaMarket | null = null
  let bestScore = 0
  for (const m of allMarkets) {
    if (!m.question) continue
    const score = jaccardSimilarity(queryTokens, tokenize(m.question))
    if (score > bestScore) {
      bestScore = score
      bestMatch = m
    }
  }
  return bestScore >= minSimilarity ? bestMatch : null
}

/** Add a position imported from an external source (screenshot of the
 *  user's real Polymarket portfolio, manual paste, etc.).
 *
 *  Looks up the real Polymarket market by question text so the position
 *  gets a real marketId (not a synthetic 'imported-...' string). With
 *  the real id, the existing runResolutionOnly cron auto-resolves the
 *  position when the market closes — same flow as app-recommended picks.
 *
 *  Bankroll is decremented by cost, same accounting as createPosition.
 *  Tagged source='imported' so the comparison view can separate user-
 *  traded picks from app-recommended ones for hit-rate analysis.
 *
 *  Returns the saved position. The result includes a `marketId` —
 *  starting with 'imported-' if no Polymarket match was found (manual
 *  resolve required), or the real Gamma id otherwise. */
export async function addImportedPosition(input: ImportedPositionInput): Promise<PolymarketPosition | null> {
  if (input.entryPrice <= 0 || input.entryPrice >= 1) return null
  if (input.quantity <= 0) return null
  if (!input.question || input.question.length < 5) return null

  const cost = input.entryPrice * input.quantity
  // Don't gate on canPlaceTrade() — imported positions reflect REAL trades
  // the user already made on Polymarket; we're just mirroring them.
  const placedAt = input.placedAtIso ? new Date(input.placedAtIso).getTime() : Date.now()
  const outcomeIndex = input.outcome === 'Yes' ? 0 : 1

  // Try to match against the real Polymarket market. Failure is non-fatal —
  // the position still imports, just with a synthetic id and won't auto-
  // resolve (user can manually mark it later).
  let resolvedMarketId = `imported-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
  let resolvedUrl = input.url || `https://polymarket.com/`
  let lookupNote = ''
  if (!input.skipLookup) {
    try {
      const match = await lookupMarketByQuestion(input.question)
      if (match) {
        resolvedMarketId = match.id
        resolvedUrl = match.slug ? `https://polymarket.com/event/${match.slug}` : resolvedUrl
        lookupNote = ` [auto-resolve: matched live market ${match.id.slice(0, 12)}…]`
      } else {
        lookupNote = ` [auto-resolve: no Polymarket match — needs manual resolve]`
      }
    } catch (e) {
      console.warn('[Portfolio] Market lookup failed for import:', e instanceof Error ? e.message : e)
      lookupNote = ` [auto-resolve: lookup failed — needs manual resolve]`
    }
  }

  // Compute unrealized PnL from live market price if we have one. Prefer
  // Polymarket's reported cashPnl over the naive formula since it
  // accounts for fees / partial fills.
  const liveMark = typeof input.currentMarketPrice === 'number' && isFinite(input.currentMarketPrice)
    ? Math.max(0, Math.min(1, input.currentMarketPrice))
    : undefined
  const unrealized = typeof input.livePnl === 'number' && isFinite(input.livePnl)
    ? input.livePnl
    : typeof liveMark === 'number'
      ? (liveMark - input.entryPrice) * input.quantity
      : undefined

  const position: PolymarketPosition = {
    id: `pm-import-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    marketId: resolvedMarketId,
    question: input.question.slice(0, 500),
    outcome: input.outcome,
    outcomeIndex,
    entryPrice: input.entryPrice,
    quantity: input.quantity,
    cost,
    potentialPayout: (1 - input.entryPrice) * input.quantity,
    confidence: 'medium',  // unknown — user's own conviction
    safetyScore: 50,       // neutral
    estimatedProbability: input.entryPrice,  // unknown — proxy with market price
    marketImpliedProb: input.entryPrice,
    expectedValue: 0,      // unknown for imported
    category: classifyCategory(input.question),
    reasoningAtPlacement: ((input.note || '') + lookupNote).slice(0, 500),
    source: 'imported',
    placedAt,
    status: 'open',
    url: resolvedUrl,
    currentMarketPrice: liveMark,
    unrealizedPnl: unrealized,
  }

  positions.push(position)
  portfolio.bankroll = Math.max(0, portfolio.bankroll - cost)
  portfolio.totalTrades = positions.length
  portfolio.lastUpdate = Date.now()
  snapshotBankroll('placed')
  recordDailySnapshot()
  savePortfolioData()
  console.log(`[PolymarketPortfolio] Imported position: ${input.question.slice(0, 60)} | ${input.outcome} @ ${input.entryPrice} | cost $${cost.toFixed(2)}${lookupNote}`)
  return position
}

/** Re-run market lookups for any imported positions still on synthetic
 *  marketIds. Useful when a user imported before the lookup feature shipped,
 *  OR when Gamma API was temporarily down at import time. */
export async function reLookupImportedPositions(): Promise<{ relinked: number; stillUnmatched: number }> {
  let relinked = 0
  let stillUnmatched = 0
  for (const p of positions) {
    if (p.source !== 'imported') continue
    if (p.status !== 'open') continue
    if (!p.marketId.startsWith('imported-')) continue  // already real id
    try {
      const match = await lookupMarketByQuestion(p.question)
      if (match) {
        p.marketId = match.id
        if (match.slug) p.url = `https://polymarket.com/event/${match.slug}`
        relinked++
      } else {
        stillUnmatched++
      }
    } catch {
      stillUnmatched++
    }
  }
  if (relinked > 0) {
    portfolio.lastUpdate = Date.now()
    savePortfolioData()
  }
  console.log(`[PolymarketPortfolio] Re-lookup: ${relinked} relinked, ${stillUnmatched} still unmatched`)
  return { relinked, stillUnmatched }
}

/** Clear all positions — used by import-replace mode. Refunds open positions'
 *  cost to bankroll first so the math stays clean. Call before bulk-importing
 *  if the user wants to wipe slate and start from screenshot state. */
export function clearAllPositions(): void {
  // Refund any currently-open positions' cost so the bankroll reflects
  // pre-import state. Then ALSO reset the win/loss/PnL counters —
  // those are tied to the position history we just wiped, so leaving
  // them populated leaves the dashboard showing inflated counts. Bug
  // history: auto-sync of imported positions in 'replace' mode kept
  // re-resolving the same 3 already-resolved positions on every
  // 5-min tick, so lostTrades climbed from 3 → 16 after several
  // syncs while only 12 positions were actually present.
  const openCost = positions.filter(p => p.status === 'open').reduce((s, p) => s + p.cost, 0)
  positions = []
  portfolio.bankroll += openCost
  portfolio.totalTrades = 0
  portfolio.wonTrades = 0
  portfolio.lostTrades = 0
  portfolio.totalPnl = 0
  portfolio.lastUpdate = Date.now()
  snapshotBankroll('init')
  recordDailySnapshot()
  savePortfolioData()
  console.log(`[PolymarketPortfolio] Cleared all positions + counters, refunded $${openCost.toFixed(2)}`)
}

/** Cancel an OPEN position — refunds the cost back to bankroll and removes
 *  the position entirely (does NOT mark it as won/lost — pretend it never
 *  happened). Designed for "I clicked Place by accident" recovery. Returns
 *  the canceled position or null if not found / already resolved.
 *
 *  Side effects mirror createPosition's bookkeeping in reverse so the
 *  bankrollHistory + dailyPerformance charts stay coherent. */
export function cancelPosition(positionId: string): PolymarketPosition | null {
  const idx = positions.findIndex(p => p.id === positionId)
  if (idx < 0) return null
  const pos = positions[idx]
  if (pos.status !== 'open') {
    // Already resolved — can't cancel after the fact, that would mess
    // with realized PnL accounting. Use resetPortfolio for a full wipe.
    console.log(`[PolymarketPortfolio] Cannot cancel ${positionId}: status=${pos.status}`)
    return null
  }
  // Remove from positions array + refund stake to bankroll
  positions.splice(idx, 1)
  portfolio.bankroll += pos.cost
  portfolio.totalTrades = positions.length
  portfolio.lastUpdate = Date.now()
  // Append a snapshot tagged 'invalid' so the curve shows the refund as a
  // bankroll-restoration event (same trigger we already use for void
  // markets — semantically equivalent: stake came back, no PnL).
  snapshotBankroll('invalid')
  recordDailySnapshot()
  savePortfolioData()
  console.log(`[PolymarketPortfolio] Canceled: ${pos.question.substring(0, 60)} | refunded $${pos.cost.toFixed(2)}`)
  return pos
}

/** Manually edit the bankroll. Use cases:
 *   - User typo'd starting bankroll (was $1000 default, wants $4)
 *   - User reconciling against an external source
 *  Snapshots an 'init' event so the curve shows the adjustment. */
export function setBankroll(newBankroll: number, alsoSetStarting = false): PolymarketPortfolio {
  if (!isFinite(newBankroll) || newBankroll < 0) {
    throw new Error(`Invalid bankroll value: ${newBankroll}`)
  }
  portfolio.bankroll = newBankroll
  if (alsoSetStarting) portfolio.startingBankroll = newBankroll
  portfolio.lastUpdate = Date.now()
  snapshotBankroll('init')
  recordDailySnapshot()
  savePortfolioData()
  console.log(`[PolymarketPortfolio] Bankroll manually set to $${newBankroll.toFixed(2)}${alsoSetStarting ? ' (also reset starting)' : ''}`)
  return portfolio
}

/**
 * Recompute portfolio.totalPnl from current position state. Unlike the
 * inline updates in resolvePosition (which only sum resolved pnl),
 * this includes unrealizedPnl on open imported positions — so the
 * dashboard headline shows live mark-to-market PnL, not just realized.
 *
 * Call after a bulk import to refresh the headline figure once all
 * positions are loaded.
 */
export function recomputePortfolioPnl(): PolymarketPortfolio {
  const realized = positions
    .filter(p => p.status !== 'open' && typeof p.pnl === 'number')
    .reduce((sum, p) => sum + (p.pnl ?? 0), 0)
  const unrealized = positions
    .filter(p => p.status === 'open' && typeof p.unrealizedPnl === 'number')
    .reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)
  portfolio.totalPnl = realized + unrealized
  portfolio.lastUpdate = Date.now()
  savePortfolioData()
  console.log(`[PolymarketPortfolio] Total PnL recomputed: realized $${realized.toFixed(2)} + unrealized $${unrealized.toFixed(2)} = $${portfolio.totalPnl.toFixed(2)}`)
  return portfolio
}

export function resolvePosition(
  positionId: string,
  resolution: 'yes' | 'no' | 'invalid'
): PolymarketPosition | null {
  const pos = positions.find(p => p.id === positionId)
  if (!pos || pos.status !== 'open') return null

  pos.resolvedAt = Date.now()
  pos.resolution = resolution

  if (resolution === 'invalid') {
    pos.status = 'lost'
    pos.pnl = 0
    pos.pnlPercent = 0
    // Refund cost on invalid
    portfolio.bankroll += pos.cost
  } else {
    const won = (resolution === 'yes' && pos.outcomeIndex === 0) ||
                 (resolution === 'no' && pos.outcomeIndex === 1)

    if (won) {
      pos.status = 'won'
      pos.pnl = pos.potentialPayout - pos.cost
      portfolio.bankroll += pos.potentialPayout
      portfolio.wonTrades++
    } else {
      pos.status = 'lost'
      pos.pnl = -pos.cost
      portfolio.lostTrades++
    }
  }

  portfolio.totalPnl = positions
    .filter(p => p.pnl !== undefined)
    .reduce((sum, p) => sum + p.pnl!, 0)
  portfolio.lastUpdate = Date.now()

  // Snapshot trigger reflects the resolution outcome so the chart can color
  // win events green and loss events red.
  const snapTrigger: 'won' | 'lost' | 'invalid' =
    resolution === 'invalid' ? 'invalid' : (pos.status === 'won' ? 'won' : 'lost')
  snapshotBankroll(snapTrigger)
  recordDailySnapshot()
  savePortfolioData()

  console.log(`[PolymarketPortfolio] Resolved: ${pos.question} | ${resolution} | PnL: $${pos.pnl?.toFixed(2)}`)
  return pos
}

export interface ConvictionBandStats {
  band: 'no-brainer' | 'high' | 'consider' | 'risky'
  scoreRange: string
  bets: number
  wins: number
  losses: number
  winRate: number
  pnl: number
}
export interface DpsTierStats {
  tier: 'high' | 'medium' | 'low' | 'unknown'
  bets: number
  wins: number
  losses: number
  winRate: number
  pnl: number
}
/** Per-AI-edge-tier breakdown — the most actionable learning loop cut.
 *  If 'strong' picks (politics, geopolitics, M&A) hit 90%+, we know to
 *  trust Opus there. If 'weak' picks (sports props, coin flips) hit ≤55%,
 *  we should exclude them entirely. 'user' (esports) cuts our judgment. */
export interface AiEdgeStats {
  edge: 'strong' | 'user' | 'weak' | 'untagged'
  bets: number
  wins: number
  losses: number
  winRate: number
  pnl: number
  avgRoi: number   // average % return per bet (pnl/cost)
}

export function getAnalytics(): {
  totalTrades: number
  wonTrades: number
  lostTrades: number
  winRate: number
  totalPnl: number
  roi: number
  evAccuracy: number
  avgHoldTimeDays: number
  bestTrade: PolymarketPosition | null
  worstTrade: PolymarketPosition | null
  profitByCategory: Record<string, number>
  equityCurve: Array<{ date: string; value: number }>
  evAccuracyTrades: number
  // ── Algorithm validation ─────────────────────────────────────────────
  byConvictionBand: ConvictionBandStats[]
  byDpsTier: DpsTierStats[]
  /** AI-edge tier breakdown — the most actionable learning cut. */
  byAiEdge: AiEdgeStats[]
  /** Bankroll history for the compounding-curve chart. */
  bankrollHistory: Array<{ ts: number; bankroll: number; totalPnl: number; trigger: string }>
  /** Daily performance journal — UI renders trajectory + on-track signal. */
  dailyPerformance: DailySnapshot[]
  /** Where the bankroll SHOULD be today vs target. UI shows delta. */
  targetBankrollToday: number
  /** End-state target bankroll: startingBankroll × TARGET_MULTIPLIER. */
  targetEndBankroll: number
  /** Days remaining to TARGET_END_DATE_UTC (clipped to 0). */
  daysToTargetEnd: number
  /** Resolved trade count required for statistical confidence. */
  sampleSizeNeeded: number
  /** True when total resolved >= sampleSizeNeeded. */
  hasSignificantSample: boolean
} {
  const resolved = positions.filter(p => p.status !== 'open' && p.pnl !== undefined)

  const wonTrades = resolved.filter(p => p.status === 'won').length
  const lostTrades = resolved.filter(p => p.status === 'lost').length
  const totalResolved = resolved.length

  const winRate = totalResolved > 0 ? (wonTrades / totalResolved) * 100 : 0
  const totalPnl = positions.reduce((sum, p) => sum + (p.pnl || 0), 0)
  const roi = portfolio.startingBankroll > 0 ? (totalPnl / portfolio.startingBankroll) * 100 : 0

  // EV accuracy: % of trades where estimatedProb > marketProb and we won
  const evAccuracyTrades = positions.filter(p =>
    p.estimatedProbability > p.marketImpliedProb && p.status !== 'open'
  )
  const evAccuracy = evAccuracyTrades.length > 0
    ? (evAccuracyTrades.filter(p => p.status === 'won').length / evAccuracyTrades.length) * 100
    : 0

  const holdTimes = resolved
    .filter(p => p.resolvedAt)
    .map(p => (p.resolvedAt! - p.placedAt) / (1000 * 60 * 60 * 24))
  const avgHoldTimeDays = holdTimes.length > 0
    ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length
    : 0

  const sortedByPnl = [...resolved].sort((a, b) => (b.pnl || 0) - (a.pnl || 0))
  const bestTrade = sortedByPnl[0] || null
  const worstTrade = sortedByPnl[sortedByPnl.length - 1] || null

  const profitByCategory: Record<string, number> = {
    crypto: 0, sports: 0, policy: 0, general: 0
  }
  for (const p of resolved) {
    profitByCategory[p.category] = (profitByCategory[p.category] || 0) + (p.pnl || 0)
  }

  // Equity curve: daily bankroll snapshots from resolved positions
  const sortedResolved = [...resolved].sort((a, b) => a.resolvedAt! - b.resolvedAt!)
  let runningBankroll = portfolio.startingBankroll
  const equityCurve: Array<{ date: string; value: number }> = []
  const dailyMap = new Map<string, number>()

  for (const p of sortedResolved) {
    const date = new Date(p.resolvedAt!).toISOString().split('T')[0]
    runningBankroll += p.pnl || 0
    dailyMap.set(date, runningBankroll)
  }
  for (const [date, value] of Array.from(dailyMap.entries())) {
    equityCurve.push({ date, value })
  }

  // ── Per-conviction-band breakdown — does high-conviction actually win more?
  const bandsConfig: { band: ConvictionBandStats['band']; scoreRange: string; min: number; max: number }[] = [
    { band: 'no-brainer', scoreRange: '90-100', min: 90, max: 101 },
    { band: 'high',       scoreRange: '75-89',  min: 75, max: 90 },
    { band: 'consider',   scoreRange: '55-74',  min: 55, max: 75 },
    { band: 'risky',      scoreRange: '<55',    min: 0,  max: 55 },
  ]
  const byConvictionBand: ConvictionBandStats[] = bandsConfig.map((cfg) => {
    const inBand = resolved.filter((p) => p.safetyScore >= cfg.min && p.safetyScore < cfg.max)
    const wins = inBand.filter((p) => p.status === 'won').length
    const losses = inBand.filter((p) => p.status === 'lost').length
    const total = wins + losses
    return {
      band: cfg.band,
      scoreRange: cfg.scoreRange,
      bets: inBand.length,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      pnl: inBand.reduce((s, p) => s + (p.pnl ?? 0), 0),
    }
  })

  // ── Per-DPS-tier breakdown — does high-DPS actually outperform?
  const dpsTiers: ('high' | 'medium' | 'low' | 'unknown')[] = ['high', 'medium', 'low', 'unknown']
  const byDpsTier: DpsTierStats[] = dpsTiers.map((tier) => {
    const inTier = resolved.filter((p) => (p.dpsTier ?? 'unknown') === tier)
    const wins = inTier.filter((p) => p.status === 'won').length
    const losses = inTier.filter((p) => p.status === 'lost').length
    const total = wins + losses
    return {
      tier,
      bets: inTier.length,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      pnl: inTier.reduce((s, p) => s + (p.pnl ?? 0), 0),
    }
  })

  // ── Per-AI-edge-tier breakdown — the highest-leverage learning cut.
  //    Tells us whether to trust Opus (strong), defer to user (esports),
  //    or just stop placing bets in a category (weak).
  const aiEdgeTiers: ('strong' | 'user' | 'weak' | 'untagged')[] = ['strong', 'user', 'weak', 'untagged']
  const byAiEdge: AiEdgeStats[] = aiEdgeTiers.map((edge) => {
    const inTier = resolved.filter((p) => (p.aiEdge ?? 'untagged') === edge)
    const wins = inTier.filter((p) => p.status === 'won').length
    const losses = inTier.filter((p) => p.status === 'lost').length
    const total = wins + losses
    const pnl = inTier.reduce((s, p) => s + (p.pnl ?? 0), 0)
    const totalCost = inTier.reduce((s, p) => s + p.cost, 0)
    return {
      edge,
      bets: inTier.length,
      wins,
      losses,
      winRate: total > 0 ? (wins / total) * 100 : 0,
      pnl,
      avgRoi: totalCost > 0 ? (pnl / totalCost) * 100 : 0,
    }
  })

  // ── Sample size guidance — 20 resolved bets is a reasonable baseline for
  //    statistical confidence in a binary win/loss outcome.
  const SAMPLE_SIZE_NEEDED = 20
  const hasSignificantSample = totalResolved >= SAMPLE_SIZE_NEEDED

  return {
    totalTrades: positions.length,
    wonTrades,
    lostTrades,
    winRate,
    totalPnl,
    roi,
    evAccuracy,
    avgHoldTimeDays,
    bestTrade,
    worstTrade,
    profitByCategory,
    equityCurve,
    evAccuracyTrades: evAccuracyTrades.length,
    byConvictionBand,
    byDpsTier,
    byAiEdge,
    bankrollHistory: portfolio.bankrollHistory ?? [],
    dailyPerformance: portfolio.dailyPerformance ?? [],
    targetBankrollToday: computeTargetBankroll(),
    targetEndBankroll: targetEndBankroll(),
    daysToTargetEnd: Math.max(
      0,
      Math.ceil((new Date(TARGET_END_DATE_UTC).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    ),
    sampleSizeNeeded: SAMPLE_SIZE_NEEDED,
    hasSignificantSample,
  }
}

export async function resetPortfolio(): Promise<void> {
  portfolio = {
    ...DEFAULT_PORTFOLIO,
    startingBankroll: config.startingBankroll,
    bankroll: config.startingBankroll,
  }
  positions = []
  await savePortfolioData()
}

export async function resetConfig(): Promise<void> {
  config = { ...DEFAULT_CONFIG }
  await saveConfigData()
}
