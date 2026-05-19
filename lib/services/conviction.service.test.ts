import { describe, it, expect } from 'vitest'
import { computeConviction } from './conviction.service'

describe('computeConviction', () => {
  describe('Opus signal', () => {
    it('agrees when edge passes floor', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'high',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.signals.opus).toBe('agrees')
    })

    it('disagrees when edge does not pass floor', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        dpsTier: 'high',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.signals.opus).toBe('disagrees')
    })
  })

  describe('DPS signal', () => {
    it('agrees for high tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'high' })
      expect(r.signals.dps).toBe('agrees')
    })

    it('agrees for medium tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'medium' })
      expect(r.signals.dps).toBe('agrees')
    })

    it('disagrees for low tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'low' })
      expect(r.signals.dps).toBe('disagrees')
    })

    it('disagrees for unknown tier', () => {
      const r = computeConviction({ edgePassesFloor: false, dpsTier: 'unknown' })
      expect(r.signals.dps).toBe('disagrees')
    })

    it('disagrees when dpsTier is undefined', () => {
      const r = computeConviction({ edgePassesFloor: false })
      expect(r.signals.dps).toBe('disagrees')
    })
  })

  describe('Calibration signal', () => {
    it('agrees when losses < 3 (no negative track record)', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        tierWinRate: 0,
        tierLosses: 2,
      })
      expect(r.signals.calibration).toBe('agrees')
    })

    it('agrees when win rate >= 50% even with many losses', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        tierWinRate: 60,
        tierLosses: 10,
      })
      expect(r.signals.calibration).toBe('agrees')
    })

    it('disagrees when win rate < 50% and losses >= 3', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        tierWinRate: 30,
        tierLosses: 5,
      })
      expect(r.signals.calibration).toBe('disagrees')
    })

    it('agrees when tierLosses is undefined (no data = no veto)', () => {
      const r = computeConviction({ edgePassesFloor: false })
      expect(r.signals.calibration).toBe('agrees')
    })
  })

  describe('Conviction level', () => {
    it('strong when all 3 agree', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'high',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.level).toBe('strong')
    })

    it('moderate when exactly 2 agree (opus + dps)', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'high',
        tierWinRate: 20,
        tierLosses: 5,
      })
      expect(r.level).toBe('moderate')
    })

    it('moderate when exactly 2 agree (opus + calibration)', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'low',
        tierWinRate: 60,
        tierLosses: 5,
      })
      expect(r.level).toBe('moderate')
    })

    it('speculative when exactly 1 agrees', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'low',
        tierWinRate: 20,
        tierLosses: 5,
      })
      expect(r.level).toBe('speculative')
    })

    it('suppress when 0 agree', () => {
      const r = computeConviction({
        edgePassesFloor: false,
        dpsTier: 'low',
        tierWinRate: 20,
        tierLosses: 5,
      })
      expect(r.level).toBe('suppress')
    })
  })

  describe('Real-world: MOUZ-style pick', () => {
    it('top-tier esports underdog with bad track record → speculative', () => {
      const r = computeConviction({
        edgePassesFloor: true,
        dpsTier: 'medium',
        tierWinRate: 0,
        tierLosses: 3,
      })
      expect(r.signals.calibration).toBe('disagrees')
      expect(r.level).toBe('moderate')
    })
  })
})
