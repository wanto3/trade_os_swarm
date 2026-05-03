import { NextResponse } from 'next/server'
import { ensureInitialized, getPositions } from '@/lib/services/polymarket-portfolio.service'
import { scoreDomainPredictability } from '@/lib/services/dps.service'

export const dynamic = 'force-dynamic'

interface CategoryStats {
  category: string
  tier: 'high' | 'medium' | 'low' | 'unknown'
  total: number
  won: number
  lost: number
  pending: number
  hitRate: number       // wins / (won + lost)
  totalPnl: number      // sum of pnl across resolved positions
  avgEdgeAtPlacement: number  // mean of |estimatedProb - marketImpliedProb| across positions
  avgConfidence: number       // numeric: high=3, medium=2, low=1
}

/**
 * Returns per-DPS-category and per-tier hit rates from the user's portfolio.
 * Feeds the continuous-learning loop: as more positions resolve, the data
 * here can either drive UI ("you've been 4/5 on geopolitics, 1/8 on
 * sports-prop") or auto-tune DPS multipliers.
 *
 * Response shape:
 *   {
 *     overall: { total, won, lost, pending, hitRate, totalPnl }
 *     byTier: CategoryStats[]
 *     byCategory: CategoryStats[]
 *     resolvedCount: number
 *     unresolvedCount: number
 *   }
 */
export async function GET() {
  try {
    await ensureInitialized()
    const all = getPositions(false)  // include resolved + open

    const buckets = new Map<string, { tier: 'high' | 'medium' | 'low' | 'unknown'; positions: typeof all }>()

    for (const pos of all) {
      // Use stored DPS category if available, otherwise re-classify on the fly
      let cat = pos.dpsCategory
      let tier: 'high' | 'medium' | 'low' | 'unknown' = pos.dpsTier ?? 'unknown'
      if (!cat) {
        const dps = scoreDomainPredictability(pos.question)
        cat = dps.category
        tier = dps.tier
      }
      if (!buckets.has(cat)) buckets.set(cat, { tier, positions: [] })
      buckets.get(cat)!.positions.push(pos)
    }

    const byCategory: CategoryStats[] = []
    for (const [cat, { tier, positions: bucket }] of Array.from(buckets.entries())) {
      const won = bucket.filter(p => p.status === 'won').length
      const lost = bucket.filter(p => p.status === 'lost').length
      const pending = bucket.filter(p => p.status === 'open').length
      const total = bucket.length
      const resolved = won + lost
      const hitRate = resolved > 0 ? won / resolved : 0
      const totalPnl = bucket.reduce((sum, p) => sum + (p.pnl ?? 0), 0)
      const avgEdge = bucket.length > 0
        ? bucket.reduce((sum, p) => sum + Math.abs(p.estimatedProbability - p.marketImpliedProb), 0) / bucket.length
        : 0
      const confMap = { high: 3, medium: 2, low: 1 } as const
      const avgConf = bucket.length > 0
        ? bucket.reduce((sum, p) => sum + (confMap[p.confidence] ?? 1), 0) / bucket.length
        : 0
      byCategory.push({
        category: cat,
        tier,
        total,
        won,
        lost,
        pending,
        hitRate,
        totalPnl,
        avgEdgeAtPlacement: avgEdge,
        avgConfidence: avgConf,
      })
    }

    // Aggregate by tier
    const tierMap = new Map<'high' | 'medium' | 'low' | 'unknown', CategoryStats>()
    for (const c of byCategory) {
      const cur = tierMap.get(c.tier) ?? {
        category: c.tier,
        tier: c.tier,
        total: 0, won: 0, lost: 0, pending: 0,
        hitRate: 0, totalPnl: 0, avgEdgeAtPlacement: 0, avgConfidence: 0,
      }
      cur.total += c.total
      cur.won += c.won
      cur.lost += c.lost
      cur.pending += c.pending
      cur.totalPnl += c.totalPnl
      cur.avgEdgeAtPlacement += c.avgEdgeAtPlacement * c.total  // weighted accumulator
      cur.avgConfidence += c.avgConfidence * c.total
      tierMap.set(c.tier, cur)
    }
    const byTier = Array.from(tierMap.values()).map(t => {
      const resolved = t.won + t.lost
      return {
        ...t,
        hitRate: resolved > 0 ? t.won / resolved : 0,
        avgEdgeAtPlacement: t.total > 0 ? t.avgEdgeAtPlacement / t.total : 0,
        avgConfidence: t.total > 0 ? t.avgConfidence / t.total : 0,
      }
    })

    // Overall totals
    const overall = byTier.reduce(
      (acc, t) => {
        acc.total += t.total
        acc.won += t.won
        acc.lost += t.lost
        acc.pending += t.pending
        acc.totalPnl += t.totalPnl
        return acc
      },
      { total: 0, won: 0, lost: 0, pending: 0, totalPnl: 0, hitRate: 0 }
    )
    const resolvedTotal = overall.won + overall.lost
    overall.hitRate = resolvedTotal > 0 ? overall.won / resolvedTotal : 0

    return NextResponse.json({
      success: true,
      overall,
      byTier: byTier.sort((a, b) => b.total - a.total),
      byCategory: byCategory.sort((a, b) => b.total - a.total),
      resolvedCount: resolvedTotal,
      unresolvedCount: overall.pending,
      timestamp: Date.now(),
      note: 'Hit rate requires resolved positions. Open positions count toward total but not hitRate.',
    })
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    }, { status: 500 })
  }
}
