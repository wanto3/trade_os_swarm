import { describe, it, expect } from 'vitest'

describe('Cross-Platform Odds', () => {
  it('should compute divergence score between platforms', () => {
    function computeDivergence(polymarketProb: number, otherPlatformProbs: { platform: string; probability: number }[]) {
      if (otherPlatformProbs.length === 0) return { avgDivergence: 0, maxDivergence: 0, signal: 'no-data' }
      const divergences = otherPlatformProbs.map(p => Math.abs(polymarketProb - p.probability))
      const avg = divergences.reduce((a, b) => a + b, 0) / divergences.length
      const max = Math.max(...divergences)
      return { avgDivergence: avg, maxDivergence: max, signal: avg > 0.10 ? 'divergent' : 'aligned' }
    }
    const aligned = computeDivergence(0.60, [{ platform: 'metaculus', probability: 0.58 }, { platform: 'kalshi', probability: 0.62 }])
    expect(aligned.signal).toBe('aligned')
    expect(aligned.avgDivergence).toBeLessThan(0.05)
    const divergent = computeDivergence(0.60, [{ platform: 'metaculus', probability: 0.40 }])
    expect(divergent.signal).toBe('divergent')
    const noData = computeDivergence(0.60, [])
    expect(noData.signal).toBe('no-data')
  })

  it('should normalize market questions for fuzzy matching', () => {
    function normalizeQuestion(q: string): string {
      return q.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
    }
    expect(normalizeQuestion('Will Bitcoin hit $100K by June 2026?')).toBe('will bitcoin hit 100k by june 2026')
    expect(normalizeQuestion("Will BTC reach $100,000 by June '26?")).toBe('will btc reach 100000 by june 26')
  })
})
