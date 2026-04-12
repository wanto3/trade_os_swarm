import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConvictionTierStats {
  tier: string
  winRate: number
  count: number
  adjustment: number
}

export interface CategoryStats {
  category: string
  winRate: number
  count: number
  adjustment: number
}

export interface EvidenceSourceStats {
  source: string
  winRate: number
  count: number
}

export interface CalibrationBucket {
  bucket: string
  predicted: number
  actual: number
  count: number
}

export interface LearningStats {
  lastUpdated: number | null
  totalResolved: number
  overallWinRate: number | null
  convictionTiers: ConvictionTierStats[]
  categories: CategoryStats[]
  evidenceSources: EvidenceSourceStats[]
  calibration: CalibrationBucket[]
  depthComparison: {
    quick: { winRate: number; count: number }
    deep: { winRate: number; count: number }
  }
  adjustmentsActive: boolean
}

export interface ConvictionAdjustments {
  byCategoryAdjustment: Record<string, number>
  byTierAdjustment: Record<string, number>
  active: boolean
}

interface ResolvedEntry {
  convictionLabel: string
  category: string
  evidenceSources: string[]
  analysisDepth: 'quick' | 'deep'
  estimatedProbability: number
  outcome: 'win' | 'loss'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SAMPLE_SIZE = 20

const STATS_FILE = join(process.cwd(), 'data', 'learning-stats.json')

const EXPECTED_WIN_RATES: Record<string, number> = {
  'no-brainer': 0.85,
  high: 0.7,
  consider: 0.55,
  risky: 0.4,
}

const CATEGORY_BASELINE = 0.55

const CALIBRATION_BUCKETS = [
  { min: 0.0, max: 0.3, label: '0-30%' },
  { min: 0.3, max: 0.5, label: '30-50%' },
  { min: 0.5, max: 0.6, label: '50-60%' },
  { min: 0.6, max: 0.7, label: '60-70%' },
  { min: 0.7, max: 0.8, label: '70-80%' },
  { min: 0.8, max: 0.9, label: '80-90%' },
  { min: 0.9, max: 1.01, label: '90-100%' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyStats(): LearningStats {
  return {
    lastUpdated: null,
    totalResolved: 0,
    overallWinRate: null,
    convictionTiers: [],
    categories: [],
    evidenceSources: [],
    calibration: [],
    depthComparison: {
      quick: { winRate: 0, count: 0 },
      deep: { winRate: 0, count: 0 },
    },
    adjustmentsActive: false,
  }
}

function computeAdjustment(
  winRate: number,
  expectedWinRate: number,
  sampleSize: number
): number {
  if (sampleSize < MIN_SAMPLE_SIZE) return 0
  const diff = winRate - expectedWinRate
  return Math.round(Math.max(-10, Math.min(10, diff * 20)))
}

function winRate(entries: ResolvedEntry[]): number {
  if (entries.length === 0) return 0
  return entries.filter((e) => e.outcome === 'win').length / entries.length
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getLearningStats(): LearningStats {
  try {
    const raw = readFileSync(STATS_FILE, 'utf-8')
    return JSON.parse(raw) as LearningStats
  } catch {
    return emptyStats()
  }
}

export function getConvictionAdjustments(): ConvictionAdjustments {
  const stats = getLearningStats()

  if (stats.totalResolved < MIN_SAMPLE_SIZE || !stats.adjustmentsActive) {
    return { byCategoryAdjustment: {}, byTierAdjustment: {}, active: false }
  }

  const byCategoryAdjustment: Record<string, number> = {}
  for (const cat of stats.categories) {
    if (cat.adjustment !== 0) {
      byCategoryAdjustment[cat.category] = cat.adjustment
    }
  }

  const byTierAdjustment: Record<string, number> = {}
  for (const tier of stats.convictionTiers) {
    if (tier.adjustment !== 0) {
      byTierAdjustment[tier.tier] = tier.adjustment
    }
  }

  return { byCategoryAdjustment, byTierAdjustment, active: true }
}

export function recomputeStats(entries: ResolvedEntry[]): LearningStats {
  if (entries.length === 0) {
    const empty = emptyStats()
    writeFileSync(STATS_FILE, JSON.stringify(empty, null, 2))
    return empty
  }

  const totalResolved = entries.length
  const overallWinRate = winRate(entries)
  const adjustmentsActive = totalResolved >= MIN_SAMPLE_SIZE

  // Conviction tiers
  const tierGroups = new Map<string, ResolvedEntry[]>()
  for (const e of entries) {
    const group = tierGroups.get(e.convictionLabel) ?? []
    group.push(e)
    tierGroups.set(e.convictionLabel, group)
  }

  const convictionTiers: ConvictionTierStats[] = []
  Array.from(tierGroups.entries()).forEach(([tier, group]) => {
    const wr = winRate(group)
    const expected = EXPECTED_WIN_RATES[tier] ?? CATEGORY_BASELINE
    convictionTiers.push({
      tier,
      winRate: wr,
      count: group.length,
      adjustment: computeAdjustment(wr, expected, group.length),
    })
  })

  // Categories
  const catGroups = new Map<string, ResolvedEntry[]>()
  for (const e of entries) {
    const group = catGroups.get(e.category) ?? []
    group.push(e)
    catGroups.set(e.category, group)
  }

  const categories: CategoryStats[] = []
  Array.from(catGroups.entries()).forEach(([category, group]) => {
    const wr = winRate(group)
    categories.push({
      category,
      winRate: wr,
      count: group.length,
      adjustment: computeAdjustment(wr, CATEGORY_BASELINE, group.length),
    })
  })

  // Evidence sources
  const srcGroups = new Map<string, ResolvedEntry[]>()
  for (const e of entries) {
    for (const src of e.evidenceSources) {
      const group = srcGroups.get(src) ?? []
      group.push(e)
      srcGroups.set(src, group)
    }
  }

  const evidenceSources: EvidenceSourceStats[] = []
  Array.from(srcGroups.entries()).forEach(([source, group]) => {
    evidenceSources.push({
      source,
      winRate: winRate(group),
      count: group.length,
    })
  })

  // Calibration
  const calibration: CalibrationBucket[] = CALIBRATION_BUCKETS.map((b) => {
    const inBucket = entries.filter(
      (e) => e.estimatedProbability >= b.min && e.estimatedProbability < b.max
    )
    const wins = inBucket.filter((e) => e.outcome === 'win').length
    return {
      bucket: b.label,
      predicted:
        inBucket.length > 0
          ? inBucket.reduce((s, e) => s + e.estimatedProbability, 0) /
            inBucket.length
          : 0,
      actual: inBucket.length > 0 ? wins / inBucket.length : 0,
      count: inBucket.length,
    }
  }).filter((b) => b.count > 0)

  // Depth comparison
  const quickEntries = entries.filter((e) => e.analysisDepth === 'quick')
  const deepEntries = entries.filter((e) => e.analysisDepth === 'deep')

  const depthComparison = {
    quick: { winRate: winRate(quickEntries), count: quickEntries.length },
    deep: { winRate: winRate(deepEntries), count: deepEntries.length },
  }

  const stats: LearningStats = {
    lastUpdated: Date.now(),
    totalResolved,
    overallWinRate,
    convictionTiers,
    categories,
    evidenceSources,
    calibration,
    depthComparison,
    adjustmentsActive,
  }

  writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2))
  return stats
}

export async function refreshLearningStats(): Promise<LearningStats> {
  const { getPortfolioHistory, getAllCompressed } = await import(
    './portfolio-tracker.service'
  )

  // Gather all resolved entries from full history
  const history = getPortfolioHistory(9999)
  const resolvedEntries: ResolvedEntry[] = []

  for (const day of history) {
    for (const entry of day.entries) {
      if (entry.resolved && entry.outcome) {
        resolvedEntries.push({
          convictionLabel: entry.convictionLabel,
          category: entry.category,
          evidenceSources: entry.evidenceSources,
          analysisDepth: entry.analysisDepth,
          estimatedProbability: entry.estimatedProbability,
          outcome: entry.outcome,
        })
      }
    }
  }

  // Also check compressed data for older resolved entries
  const compressed = getAllCompressed()
  // Compressed data is summary-only; individual entries come from history above

  return recomputeStats(resolvedEntries)
}
