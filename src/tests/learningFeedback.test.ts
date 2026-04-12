import { describe, it, expect } from 'vitest'

describe('Learning Feedback', () => {
  it('should compute calibration buckets', () => {
    interface ResolvedEntry { estimatedProbability: number; outcome: 'win' | 'loss' }
    function computeCalibration(entries: ResolvedEntry[]) {
      const buckets = [
        { min: 0.0, max: 0.3, label: '0-30%' }, { min: 0.3, max: 0.5, label: '30-50%' },
        { min: 0.5, max: 0.6, label: '50-60%' }, { min: 0.6, max: 0.7, label: '60-70%' },
        { min: 0.7, max: 0.8, label: '70-80%' }, { min: 0.8, max: 0.9, label: '80-90%' },
        { min: 0.9, max: 1.01, label: '90-100%' },
      ]
      return buckets.map(b => {
        const inBucket = entries.filter(e => e.estimatedProbability >= b.min && e.estimatedProbability < b.max)
        const wins = inBucket.filter(e => e.outcome === 'win').length
        return {
          bucket: b.label,
          predicted: inBucket.length > 0 ? inBucket.reduce((s, e) => s + e.estimatedProbability, 0) / inBucket.length : 0,
          actual: inBucket.length > 0 ? wins / inBucket.length : 0,
          count: inBucket.length
        }
      }).filter(b => b.count > 0)
    }
    const entries = [
      { estimatedProbability: 0.75, outcome: 'win' as const },
      { estimatedProbability: 0.72, outcome: 'win' as const },
      { estimatedProbability: 0.78, outcome: 'loss' as const },
      { estimatedProbability: 0.55, outcome: 'win' as const },
      { estimatedProbability: 0.52, outcome: 'loss' as const },
    ]
    const calibration = computeCalibration(entries)
    const bucket = calibration.find(b => b.bucket === '70-80%')
    expect(bucket).toBeDefined()
    expect(bucket!.count).toBe(3)
    expect(bucket!.actual).toBeCloseTo(0.667, 2)
  })

  it('should compute conviction tier adjustments', () => {
    function computeAdjustment(winRate: number, expectedWinRate: number, sampleSize: number): number {
      if (sampleSize < 20) return 0
      const diff = winRate - expectedWinRate
      return Math.round(Math.max(-10, Math.min(10, diff * 20)))
    }
    expect(computeAdjustment(0.80, 0.70, 30)).toBeGreaterThan(0)
    expect(computeAdjustment(0.50, 0.70, 30)).toBeLessThan(0)
    expect(computeAdjustment(0.50, 0.70, 10)).toBe(0)
  })
})
