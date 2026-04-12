import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioEntry {
  id: string
  marketId: string
  question: string
  side: 'yes' | 'no'
  entryOdds: number
  convictionScore: number
  convictionLabel: string
  evidenceSources: string[]
  analysisDepth: 'quick' | 'deep'
  category: string
  addedAt: string
  date: string // YYYY-MM-DD
  resolved: boolean
  outcome: 'win' | 'loss' | null
  resolvedAt: string | null
  resolutionPrice: number | null
  estimatedProbability: number
  baseRate: number | null
  uncertaintyRange: number
}

export interface DailyStats {
  total: number
  resolved: number
  wins: number
  losses: number
  pending: number
  winRate: number | null
}

export interface DailyPortfolio {
  date: string
  entries: PortfolioEntry[]
  stats: DailyStats
}

interface CompressedDay {
  date: string
  stats: DailyStats
  categories: Record<string, { wins: number; losses: number }>
  evidenceSourceBreakdown: Record<string, { wins: number; losses: number }>
}

interface TrackerData {
  portfolios: DailyPortfolio[]
  compressed: CompressedDay[]
  globalStats: {
    totalTrades: number
    totalResolved: number
    totalWins: number
    totalLosses: number
    overallWinRate: number | null
  }
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

const DATA_PATH = join(process.cwd(), 'data', 'portfolio-tracker.json')

function loadData(): TrackerData {
  try {
    const raw = readFileSync(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as TrackerData
  } catch {
    return {
      portfolios: [],
      compressed: [],
      globalStats: {
        totalTrades: 0,
        totalResolved: 0,
        totalWins: 0,
        totalLosses: 0,
        overallWinRate: null,
      },
    }
  }
}

function saveData(data: TrackerData): void {
  // Compress portfolios older than 90 days before saving
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const toKeep: DailyPortfolio[] = []
  const toCompress: DailyPortfolio[] = []

  for (const p of data.portfolios) {
    if (p.date < cutoffStr) {
      toCompress.push(p)
    } else {
      toKeep.push(p)
    }
  }

  for (const p of toCompress) {
    const categories: Record<string, { wins: number; losses: number }> = {}
    const evidenceSourceBreakdown: Record<string, { wins: number; losses: number }> = {}

    for (const e of p.entries) {
      if (!categories[e.category]) categories[e.category] = { wins: 0, losses: 0 }
      if (e.outcome === 'win') categories[e.category].wins++
      if (e.outcome === 'loss') categories[e.category].losses++

      for (const src of e.evidenceSources) {
        if (!evidenceSourceBreakdown[src]) evidenceSourceBreakdown[src] = { wins: 0, losses: 0 }
        if (e.outcome === 'win') evidenceSourceBreakdown[src].wins++
        if (e.outcome === 'loss') evidenceSourceBreakdown[src].losses++
      }
    }

    data.compressed.push({
      date: p.date,
      stats: p.stats,
      categories,
      evidenceSourceBreakdown,
    })
  }

  data.portfolios = toKeep
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

function computeStats(entries: PortfolioEntry[]): DailyStats {
  const total = entries.length
  const resolved = entries.filter(e => e.resolved).length
  const wins = entries.filter(e => e.outcome === 'win').length
  const losses = entries.filter(e => e.outcome === 'loss').length
  const pending = total - resolved
  const winRate = resolved > 0 ? wins / resolved : null
  return { total, resolved, wins, losses, pending, winRate }
}

function todayKey(): string {
  return new Date().toISOString().split('T')[0]
}

function generateId(): string {
  return `pt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

function getOrCreateTodayPortfolio(data: TrackerData): DailyPortfolio {
  const today = todayKey()
  let portfolio = data.portfolios.find(p => p.date === today)
  if (!portfolio) {
    portfolio = {
      date: today,
      entries: [],
      stats: { total: 0, resolved: 0, wins: 0, losses: 0, pending: 0, winRate: null },
    }
    data.portfolios.push(portfolio)
  }
  return portfolio
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function addToPortfolio(
  entry: Omit<PortfolioEntry, 'id' | 'date' | 'addedAt' | 'resolved' | 'outcome' | 'resolvedAt' | 'resolutionPrice'>
): PortfolioEntry {
  const data = loadData()
  const portfolio = getOrCreateTodayPortfolio(data)

  // Prevent duplicates (same marketId + side on the same day)
  const existing = portfolio.entries.find(
    e => e.marketId === entry.marketId && e.side === entry.side
  )
  if (existing) {
    return existing
  }

  const newEntry: PortfolioEntry = {
    ...entry,
    id: generateId(),
    date: todayKey(),
    addedAt: new Date().toISOString(),
    resolved: false,
    outcome: null,
    resolvedAt: null,
    resolutionPrice: null,
  }

  portfolio.entries.push(newEntry)
  portfolio.stats = computeStats(portfolio.entries)

  // Update global stats
  data.globalStats.totalTrades++

  saveData(data)
  return newEntry
}

export function removeFromPortfolio(entryId: string): boolean {
  const data = loadData()
  const today = todayKey()
  const portfolio = data.portfolios.find(p => p.date === today)
  if (!portfolio) return false

  const idx = portfolio.entries.findIndex(e => e.id === entryId)
  if (idx === -1) return false

  const removed = portfolio.entries[idx]
  portfolio.entries.splice(idx, 1)
  portfolio.stats = computeStats(portfolio.entries)

  // Update global stats
  data.globalStats.totalTrades--
  if (removed.resolved) {
    data.globalStats.totalResolved--
    if (removed.outcome === 'win') data.globalStats.totalWins--
    if (removed.outcome === 'loss') data.globalStats.totalLosses--
    data.globalStats.overallWinRate =
      data.globalStats.totalResolved > 0
        ? data.globalStats.totalWins / data.globalStats.totalResolved
        : null
  }

  saveData(data)
  return true
}

export function getTodayPortfolio(): DailyPortfolio {
  const data = loadData()
  const today = todayKey()
  const portfolio = data.portfolios.find(p => p.date === today)
  if (!portfolio) {
    return {
      date: today,
      entries: [],
      stats: { total: 0, resolved: 0, wins: 0, losses: 0, pending: 0, winRate: null },
    }
  }
  return portfolio
}

export function getPortfolioHistory(days: number = 7): DailyPortfolio[] {
  const data = loadData()
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  return data.portfolios
    .filter(p => p.date >= cutoffStr)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function getGlobalStats(): {
  totalTrades: number
  totalResolved: number
  totalWins: number
  totalLosses: number
  overallWinRate: number | null
} {
  const data = loadData()
  return { ...data.globalStats }
}

export function getAllCompressed(): CompressedDay[] {
  const data = loadData()
  return data.compressed
}

export async function resolvePortfolioEntries(): Promise<{
  resolved: number
  wins: number
  losses: number
}> {
  const data = loadData()
  let resolved = 0
  let wins = 0
  let losses = 0

  for (const portfolio of data.portfolios) {
    for (const entry of portfolio.entries) {
      if (entry.resolved) continue

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)

        const resp = await fetch(
          `https://gamma-api.polymarket.com/markets/${entry.marketId}`,
          { signal: controller.signal }
        )
        clearTimeout(timeout)

        if (!resp.ok) continue

        const market = (await resp.json()) as {
          closed?: boolean
          resolved?: boolean
          resolutionPrices?: number[]
        }

        if (!market.resolved && !market.closed) continue

        const resPrice = market.resolutionPrices?.[0] ?? null
        if (resPrice === null) continue

        const yesWon = resPrice >= 0.99
        const userBetYes = entry.side === 'yes'
        const userWon = (yesWon && userBetYes) || (!yesWon && !userBetYes)

        entry.resolved = true
        entry.outcome = userWon ? 'win' : 'loss'
        entry.resolvedAt = new Date().toISOString()
        entry.resolutionPrice = resPrice

        resolved++
        if (userWon) wins++
        else losses++

        data.globalStats.totalResolved++
        if (userWon) data.globalStats.totalWins++
        else data.globalStats.totalLosses++
      } catch {
        // Network error or timeout — skip
        continue
      }

      // 200ms delay between checks
      await new Promise(r => setTimeout(r, 200))
    }

    // Recompute stats for this portfolio
    portfolio.stats = computeStats(portfolio.entries)
  }

  // Update overall win rate
  data.globalStats.overallWinRate =
    data.globalStats.totalResolved > 0
      ? data.globalStats.totalWins / data.globalStats.totalResolved
      : null

  saveData(data)
  return { resolved, wins, losses }
}
