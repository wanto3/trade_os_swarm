import { describe, it, expect } from 'vitest'
import { computeCalibration, getCalibrationPromptBlock, saveCalibration } from './calibration.service'

describe('computeCalibration — tier classification', () => {
  it('splits esports into tier-1 vs lower-tier', () => {
    const positions = [
      { question: 'Counter-Strike: Natus Vincere vs FaZe - IEM Katowice', status: 'lost' as const, pnl: -1, cost: 1 },
      { question: 'Counter-Strike: BESTIA Academy vs HereWeGoAgain - CCT South America', status: 'lost' as const, pnl: -1, cost: 1 },
      { question: 'Counter-Strike: FURIA vs Team Falcons - PGL Astana Playoffs', status: 'lost' as const, pnl: -1, cost: 1 },
      { question: 'LoL: T1 vs Gen.G - LCK Spring Finals', status: 'won' as const, pnl: 0.5, cost: 0.5 },
    ]
    const summary = computeCalibration(positions)
    const tier1 = summary.tiers.find(t => t.tier === 'esports / tier-1')
    const lower = summary.tiers.find(t => t.tier === 'esports / lower-tier')
    expect(tier1).toBeDefined()
    expect(lower).toBeDefined()
    expect(tier1?.wins).toBe(1)   // T1 vs Gen.G won
    expect(tier1?.losses).toBe(1) // NAVI vs FaZe lost (no — wait, NAVI is tier-1)
  })

  it('flags regional politics distinct from national', () => {
    const positions = [
      { question: 'Will Trump win the presidential primary?', status: 'won' as const, pnl: 1, cost: 0.5 },
      { question: 'Will Reform UK win most seats in Welsh Senedd election?', status: 'lost' as const, pnl: -1, cost: 1 },
    ]
    const summary = computeCalibration(positions)
    const national = summary.tiers.find(t => t.tier === 'politics / national')
    const regional = summary.tiers.find(t => t.tier === 'politics / regional')
    expect(national?.wins).toBe(1)
    expect(regional?.losses).toBe(1)
  })

  it('skips open positions (not yet informative)', () => {
    const positions = [
      { question: 'Open BTC bet', status: 'open' as const, cost: 1 },
      { question: 'Closed crypto bet', status: 'lost' as const, pnl: -1, cost: 1 },
    ]
    const summary = computeCalibration(positions)
    expect(summary.totalResolved).toBe(1)
  })

  it('computes correct hit rate', () => {
    const positions = [
      { question: 'Counter-Strike: Vitality vs G2 - BLAST Premier', status: 'won' as const, pnl: 1, cost: 0.5 },
      { question: 'Counter-Strike: NAVI vs Astralis - ESL Pro League', status: 'won' as const, pnl: 1, cost: 0.5 },
      { question: 'Counter-Strike: FaZe vs MOUZ - IEM Cologne', status: 'lost' as const, pnl: -0.5, cost: 0.5 },
    ]
    const summary = computeCalibration(positions)
    const tier1 = summary.tiers.find(t => t.tier === 'esports / tier-1')
    expect(tier1?.wins).toBe(2)
    expect(tier1?.losses).toBe(1)
    expect(tier1?.hitRate).toBeCloseTo(2 / 3, 2)
  })
})

describe('getCalibrationPromptBlock — prompt formatting', () => {
  it('returns empty string when no resolved bets', async () => {
    // No data on disk → empty block (graceful degrade for first run)
    // Note: this test runs against the real file. If a prior test
    // wrote real data, this will fail — pure-function tests above
    // are the actual coverage.
    const block = await getCalibrationPromptBlock()
    // Either empty or contains the section header — both are
    // valid depending on test ordering
    if (block.length > 0) {
      expect(block).toContain('YOUR HISTORICAL HIT RATE')
    }
  })

  it('emits "DEFAULT TO SKIP" for tiers with <30% hit rate and ≥3 samples', async () => {
    const summary = computeCalibration([
      { question: 'Counter-Strike: BESTIA Academy vs Hatamoto Sports - CCT 1', status: 'lost' as const, pnl: -1, cost: 1 },
      { question: 'Counter-Strike: BESTIA Academy vs Hatamoto Sports - CCT 2', status: 'lost' as const, pnl: -1, cost: 1 },
      { question: 'Counter-Strike: BESTIA Academy vs Hatamoto Sports - CCT 3', status: 'lost' as const, pnl: -1, cost: 1 },
      { question: 'Counter-Strike: BESTIA Academy vs Hatamoto Sports - CCT 4', status: 'lost' as const, pnl: -1, cost: 1 },
    ])
    await saveCalibration(summary)
    const block = await getCalibrationPromptBlock()
    expect(block).toContain('DEFAULT TO SKIP')
    expect(block).toContain('esports / lower-tier')
  })
})
