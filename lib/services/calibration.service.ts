/**
 * Calibration service — the closed-loop learning layer.
 *
 * After every Polymarket sync, the user's resolved positions land in
 * the portfolio store. This service rolls them up into per-tier W/L
 * statistics and emits a prompt block that gets prepended to the next
 * screening run. Effect: Opus sees its own historical performance per
 * category and adjusts confidence accordingly.
 *
 * Example: if the user lost 8/8 on lower-tier esports CS matchups,
 * the next screening prompt tells Opus exactly that, so Opus knows
 * to default to skip on similar markets even when an apparent edge
 * looks attractive.
 *
 * Complements lessons-learned.service.ts:
 *   - lessons-learned = USER-curated takeaways ("Welsh devolved
 *     politics ≠ national polling")
 *   - calibration    = OBJECTIVE W/L from actual resolved bets,
 *     no user input required
 */

import { promises as fs } from 'fs'
import path from 'path'
import { isTopTierEsports } from './esports-classifier'

const STORE_PATH = path.resolve(process.cwd(), 'data/calibration-stats.json')

export interface PositionLike {
  question: string
  category?: string
  status: 'open' | 'won' | 'lost'
  pnl?: number
  cost?: number
  outcome?: string
  aiEdge?: 'strong' | 'user' | 'weak'
  source?: 'app' | 'auto' | 'imported'
}

export interface TierStat {
  tier: string                    // human-readable tier label
  wins: number
  losses: number
  hitRate: number                 // 0..1
  totalPnl: number
  totalCost: number
  samples: string[]               // up to 3 example questions for the prompt
}

export interface CalibrationSummary {
  tiers: TierStat[]
  totalResolved: number
  totalPnl: number
  computedAt: number
}

/**
 * Classify a position into a fine-grained tier. We go beyond the broad
 * category classifier (crypto/sports/policy/general) because the user's
 * actual losses cluster in narrower buckets — e.g. "lower-tier CS" is
 * very different from "tier-1 LCK".
 */
function classifyTier(p: PositionLike): string {
  const q = (p.question || '').toLowerCase()
  // Esports — split tier-1 vs lower-tier so the algo learns which to skip
  if (/\b(counter-strike|cs2|cs:go|csgo|valorant|league of legends|lol\b|dota|overwatch|esports|bo[35])\b/.test(q)) {
    return isTopTierEsports(p.question) ? 'esports / tier-1' : 'esports / lower-tier'
  }
  // Major-league team sports
  if (/\b(nba|nfl|mlb|nhl|premier league|la liga|champions league|world cup)\b/.test(q)) {
    return 'sports / major-league'
  }
  // Soccer at club level — distinct from internationals, often shows up
  // in our data (FC Bayern, Corinthians, etc.)
  if (/\b(fc\s|bayern|barcelona|real madrid|chelsea|liverpool|man (city|united)|psg|juventus|corinthians|flamengo|palmeiras)\b/.test(q)) {
    return 'sports / club-soccer'
  }
  // Box-office bucket markets
  if (/\b(box office|opening weekend|domestic gross)\b/.test(q)) {
    return 'box-office'
  }
  // Crypto price-threshold markets
  if (/\b(btc|bitcoin|ethereum|eth|sol|crypto)\s+(above|below|reach|hit|close)/.test(q)) {
    return 'crypto / price-threshold'
  }
  // Politics — split national vs sub-national/regional. Welsh-Senedd-
  // style markets need a flag because Opus systematically over-extrapolates
  // national polling.
  if (/\b(senate|congress|presidential|presidency|nominee|primary)\b/.test(q)) {
    return 'politics / national'
  }
  if (/\b(senedd|assembly|regional election|gubernatorial|governor|mayor|local election)\b/.test(q)) {
    return 'politics / regional'
  }
  // Use the explicit category if set
  if (p.category) {
    return p.category
  }
  return 'general'
}

/**
 * Compute per-tier W/L statistics from a list of positions. Only
 * counts RESOLVED (won/lost) positions — open positions don't
 * inform whether the algo was right yet.
 */
export function computeCalibration(positions: PositionLike[]): CalibrationSummary {
  const buckets = new Map<string, TierStat>()
  let totalPnl = 0
  let totalResolved = 0

  for (const p of positions) {
    if (p.status !== 'won' && p.status !== 'lost') continue
    totalResolved++
    totalPnl += p.pnl ?? 0

    const tier = classifyTier(p)
    const b = buckets.get(tier) || {
      tier, wins: 0, losses: 0, hitRate: 0,
      totalPnl: 0, totalCost: 0, samples: [],
    }
    if (p.status === 'won') b.wins++
    else b.losses++
    b.totalPnl += p.pnl ?? 0
    b.totalCost += p.cost ?? 0
    if (b.samples.length < 3 && p.question) {
      b.samples.push(p.question.slice(0, 80))
    }
    buckets.set(tier, b)
  }

  const tiers: TierStat[] = Array.from(buckets.values())
  for (const b of tiers) {
    const total = b.wins + b.losses
    b.hitRate = total > 0 ? b.wins / total : 0
  }
  // Sort by sample size descending so the most-statistically-significant
  // tiers surface first in the prompt
  tiers.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses))

  return { tiers, totalResolved, totalPnl, computedAt: Date.now() }
}

/**
 * Persist the calibration summary to disk so the screening prompt can
 * read it without needing the portfolio service in scope. Best-effort
 * — failure is logged but doesn't throw.
 */
export async function saveCalibration(summary: CalibrationSummary): Promise<void> {
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
    await fs.writeFile(STORE_PATH, JSON.stringify(summary, null, 2))
  } catch (e) {
    console.warn('[Calibration] save failed:', e instanceof Error ? e.message : e)
  }
}

export async function loadCalibration(): Promise<CalibrationSummary | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    return JSON.parse(raw) as CalibrationSummary
  } catch {
    return null
  }
}

/**
 * Auto-emit lessons from calibration patterns. The system watches its
 * own track record per tier and writes synthetic lessons when patterns
 * cross thresholds. This is the recursive-improvement engine: every
 * sync feeds new data back into the prompt without user intervention.
 *
 *   Pattern detected         → lesson emitted (or refreshed)
 *   ─────────────────────────────────────────────────────────
 *   tier has 0W/≥3L          → "Always skip {tier} — algo has been 0-for-N"
 *   tier has <30% w/ ≥4 samples → "Apply heavy skepticism to {tier} — algo has been wrong here repeatedly"
 *   tier has ≥70% w/ ≥4 samples → "Trust {tier} edges — algo has been consistently right"
 *
 * Auto-lessons are tagged with category='auto-calibration' and a stable
 * id derived from the tier so re-runs UPSERT rather than duplicate.
 * They survive the same lifecycle as user-written lessons (capped at
 * 100, persisted to disk, surfaced in the next screening prompt).
 *
 * Returns the count of lessons added/refreshed for diagnostics.
 */
export async function emitAutoLessons(summary: CalibrationSummary): Promise<{ added: number; refreshed: number; skipped: number }> {
  if (summary.totalResolved < 3) {
    return { added: 0, refreshed: 0, skipped: 0 }
  }
  // Lazy-load to avoid a dependency cycle (lessons-learned doesn't
  // import calibration).
  const { logLesson, getAllLessons, deleteLesson } = await import('./lessons-learned.service')

  // Load existing auto-lessons so we can refresh vs duplicate.
  const allLessons = await getAllLessons()
  const existingAuto = new Map<string, { id: string; loggedAt: number }>()
  for (const l of allLessons) {
    if (l.category === 'auto-calibration' && l.positionId) {
      // We re-use positionId as the stable "tier-key" so the upsert
      // logic can find prior auto-lessons for the same tier.
      existingAuto.set(l.positionId, { id: l.id, loggedAt: l.loggedAt })
    }
  }

  let added = 0
  let refreshed = 0
  let skipped = 0

  for (const t of summary.tiers) {
    const total = t.wins + t.losses
    if (total < 3) { skipped++; continue }

    // Decide whether this tier warrants a lesson.
    let takeaway = ''
    let prediction = ''
    let outcome = ''
    if (t.wins === 0 && t.losses >= 3) {
      takeaway = `Default to SKIP on ${t.tier} — algo has been 0-for-${t.losses} on this tier. The bar for recommending here is now "explicit quote-anchored grounding only".`
      prediction = `Algo previously surfaced ${t.losses} ${t.tier} picks as actionable`
      outcome = `All ${t.losses} resolved as losses. Cumulative PnL: ${t.totalPnl >= 0 ? '+' : ''}$${t.totalPnl.toFixed(2)}`
    } else if (t.hitRate < 0.3 && total >= 4) {
      takeaway = `${t.tier}: apply heavy skepticism. ${t.wins}W/${t.losses}L (${(t.hitRate * 100).toFixed(0)}%) — algo has been worse than random here. Require quote-anchored reasoning before recommending.`
      prediction = `Algo recommended ${total} ${t.tier} picks recently`
      outcome = `Only ${t.wins} won (${(t.hitRate * 100).toFixed(0)}% hit rate, PnL ${t.totalPnl >= 0 ? '+' : ''}$${t.totalPnl.toFixed(2)})`
    } else if (t.hitRate >= 0.7 && total >= 4) {
      takeaway = `${t.tier}: algo edge is real. ${t.wins}W/${t.losses}L (${(t.hitRate * 100).toFixed(0)}%) — trust apparent edges in this tier even with medium confidence.`
      prediction = `Algo recommended ${total} ${t.tier} picks recently`
      outcome = `${t.wins} won, hit rate ${(t.hitRate * 100).toFixed(0)}%, PnL +$${t.totalPnl.toFixed(2)}`
    } else {
      skipped++
      continue
    }

    // Stable id per tier so we upsert (delete old + insert new) rather
    // than duplicate across syncs.
    const tierKey = `auto-${t.tier.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`
    const existing = existingAuto.get(tierKey)

    // Don't refresh if the existing auto-lesson is <12h old AND
    // sample-count hasn't grown — same data, same lesson, skip the churn.
    if (existing && Date.now() - existing.loggedAt < 12 * 3600_000) {
      skipped++
      continue
    }
    if (existing) {
      await deleteLesson(existing.id)
      refreshed++
    } else {
      added++
    }
    await logLesson({
      question: `${t.tier} (${total} resolved)`,
      opusPrediction: prediction,
      actualOutcome: outcome,
      takeaway,
      category: 'auto-calibration',
      positionId: tierKey,
    })
  }

  return { added, refreshed, skipped }
}

/**
 * Format the calibration summary as a prompt block for Opus. Only
 * tiers with at least 2 resolved bets surface — single-sample tiers
 * are noise. Tiers with hit rate < 30% get an explicit "default to
 * skip" instruction so Opus actively avoids the patterns the user
 * has lost on.
 */
export async function getCalibrationPromptBlock(): Promise<string> {
  const summary = await loadCalibration()
  if (!summary || summary.totalResolved < 2) return ''

  const meaningfulTiers = summary.tiers.filter(t => (t.wins + t.losses) >= 2)
  if (meaningfulTiers.length === 0) return ''

  const lines: string[] = []
  for (const t of meaningfulTiers) {
    const total = t.wins + t.losses
    const ratePct = (t.hitRate * 100).toFixed(0)
    const pnlStr = t.totalPnl >= 0 ? `+$${t.totalPnl.toFixed(2)}` : `-$${Math.abs(t.totalPnl).toFixed(2)}`
    let verdict = ''
    if (t.hitRate < 0.3 && total >= 3) {
      verdict = '  → DEFAULT TO SKIP unless the reasoning is airtight and quote-anchored. Algo has been consistently wrong here.'
    } else if (t.hitRate >= 0.65) {
      verdict = '  → Algo edge holds. Trust apparent edges in this tier more than usual.'
    } else if (t.hitRate < 0.5) {
      verdict = '  → Apply heavy skepticism. Algo has been worse than coin-flip in this tier.'
    }
    lines.push(`- **${t.tier}**: ${t.wins}W / ${t.losses}L (${ratePct}%, PnL ${pnlStr})${verdict}`)
  }

  const overallPnl = summary.totalPnl >= 0
    ? `+$${summary.totalPnl.toFixed(2)}`
    : `-$${Math.abs(summary.totalPnl).toFixed(2)}`

  return `\n📊 YOUR HISTORICAL HIT RATE — pulled live from the user's resolved Polymarket positions. This is the algo's track record IN PRACTICE, not in theory. Adjust confidence accordingly:

${lines.join('\n')}

Overall: ${summary.totalResolved} resolved bets, total PnL ${overallPnl}.

If you're about to recommend something in a tier with <30% hit rate, you need EXPLICIT quote-anchored grounding — the bar is much higher because the algo has been wrong here repeatedly. Generic "favorite has pedigree" reasoning is not enough.
`
}
