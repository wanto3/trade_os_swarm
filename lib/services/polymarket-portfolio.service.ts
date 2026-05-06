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
  placedAt: number
  resolvedAt?: number
  status: 'open' | 'won' | 'lost'
  resolution?: 'yes' | 'no' | 'invalid'
  pnl?: number
  pnlPercent?: number
  url: string
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
  savePortfolioData()
  saveConfigData()

  console.log(`[PolymarketPortfolio] Placed trade: ${rec.market.question.substring(0, 60)} | ${rec.outcome} @ ${entryPrice} | $${cost.toFixed(2)} | DPS:${dpsTier}/${dpsCategory}`)
  return position
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
