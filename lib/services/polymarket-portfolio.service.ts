import { promises as fs } from 'fs';
import { join } from 'path';
import type { TradeRecommendation } from '@/app/api/polymarket/route';

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
  kellyMode: 'quarter',
  confidenceFilter: 'high',
  maxOpenPositions: 5,
  maxBetSizePercent: 10,
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
  kellyMode: 'quarter' | 'half' | 'full'
): number {
  const decimalOdds = (1 / marketProb) - 1
  if (decimalOdds <= 0 || estimatedProb <= 0) return 0
  const q = 1 - estimatedProb
  const kelly = (decimalOdds * estimatedProb - q) / decimalOdds
  const positiveKelly = Math.max(0, kelly)
  const cappedKelly = Math.min(positiveKelly, 0.10)
  const multiplier = kellyMode === 'full' ? 1 : kellyMode === 'half' ? 0.5 : 0.25
  return bankroll * cappedKelly * multiplier
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

  // Skip if closing within 1 day
  if (rec.daysToClose <= 1) {
    console.log(`[PolymarketPortfolio] Skipping ${rec.market.question}: closing within 1 day`)
    return null
  }

  // Apply Kelly sizing
  const rawBet = calculateKellyBetSize(
    portfolio.bankroll,
    rec.estimatedProbability,
    rec.marketImpliedProb,
    config.kellyMode
  )

  // Cap at max bet size % of bankroll
  const maxBet = portfolio.bankroll * (config.maxBetSizePercent / 100)
  const betSize = Math.min(rawBet, maxBet)

  if (betSize < 0.01) {
    console.log(`[PolymarketPortfolio] Bet size too small: $${betSize.toFixed(2)}`)
    return null
  }

  const entryPrice = rec.odds
  const quantity = betSize / entryPrice
  const cost = entryPrice * quantity
  const potentialPayout = (1 - entryPrice) * quantity

  const outcomeIndex = rec.outcome === 'Yes' || rec.outcome === '1' ? 0 : 1

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

  savePortfolioData()
  saveConfigData()

  console.log(`[PolymarketPortfolio] Placed trade: ${rec.market.question} | ${rec.outcome} @ ${entryPrice} | Cost: $${cost.toFixed(2)}`)
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

  savePortfolioData()

  console.log(`[PolymarketPortfolio] Resolved: ${pos.question} | ${resolution} | PnL: $${pos.pnl?.toFixed(2)}`)
  return pos
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
