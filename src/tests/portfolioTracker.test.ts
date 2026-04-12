import { describe, it, expect } from 'vitest'

describe('Portfolio Tracker Logic', () => {
  it('should compute daily portfolio stats', () => {
    interface Entry { resolved: boolean; outcome: 'win' | 'loss' | null }
    function computeStats(entries: Entry[]) {
      const total = entries.length
      const resolved = entries.filter(e => e.resolved).length
      const wins = entries.filter(e => e.outcome === 'win').length
      const losses = entries.filter(e => e.outcome === 'loss').length
      const pending = total - resolved
      const winRate = resolved > 0 ? wins / resolved : null
      return { total, resolved, wins, losses, pending, winRate }
    }
    const entries: Entry[] = [
      { resolved: true, outcome: 'win' },
      { resolved: true, outcome: 'loss' },
      { resolved: true, outcome: 'win' },
      { resolved: false, outcome: null },
    ]
    const stats = computeStats(entries)
    expect(stats.total).toBe(4)
    expect(stats.resolved).toBe(3)
    expect(stats.wins).toBe(2)
    expect(stats.winRate).toBeCloseTo(0.667, 2)
  })

  it('should format date as YYYY-MM-DD', () => {
    function todayKey(): string { return new Date().toISOString().split('T')[0] }
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should generate unique entry IDs', () => {
    function generateId(): string { return `pt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}` }
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
    expect(id1).toMatch(/^pt-/)
  })
})
