import { describe, it, expect } from 'vitest'

describe('Deep Analysis Cache', () => {
  it('should determine if deep analysis is stale', () => {
    const DEEP_CACHE_TTL = 30 * 60 * 1000
    function isStale(lastRunTimestamp: number | null): boolean {
      if (lastRunTimestamp === null) return true
      return Date.now() - lastRunTimestamp > DEEP_CACHE_TTL
    }
    expect(isStale(null)).toBe(true)
    expect(isStale(Date.now() - 31 * 60 * 1000)).toBe(true)
    expect(isStale(Date.now() - 5 * 60 * 1000)).toBe(false)
  })

  it('should merge deep results into fast results', () => {
    interface FastResult { marketId: string; convictionScore: number; analysisDepth: 'quick' | 'deep'; baseRate: number | null; crossPlatformOdds: any[] | null }
    function mergeDeepResult(fast: FastResult, deep: { convictionScore: number; baseRate: number | null; crossPlatformOdds: any[] } | null): FastResult {
      if (!deep) return fast
      return { ...fast, convictionScore: deep.convictionScore, analysisDepth: 'deep', baseRate: deep.baseRate, crossPlatformOdds: deep.crossPlatformOdds }
    }
    const fast: FastResult = { marketId: '123', convictionScore: 65, analysisDepth: 'quick', baseRate: null, crossPlatformOdds: null }
    const deep = { convictionScore: 82, baseRate: 0.55, crossPlatformOdds: [{ platform: 'metaculus', probability: 0.60 }] }
    const merged = mergeDeepResult(fast, deep)
    expect(merged.analysisDepth).toBe('deep')
    expect(merged.convictionScore).toBe(82)
    expect(merged.baseRate).toBe(0.55)
    const noDeep = mergeDeepResult(fast, null)
    expect(noDeep.analysisDepth).toBe('quick')
  })
})
