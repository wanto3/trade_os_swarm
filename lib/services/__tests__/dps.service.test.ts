import { describe, it, expect } from 'vitest'
import { scoreDomainPredictability, recommendModel, dpsConvictionMultiplier, type DPSTier } from '../dps.service'

describe('scoreDomainPredictability', () => {
  it('classifies political markets as high DPS', () => {
    const r = scoreDomainPredictability('Will Trump win the 2026 election?')
    expect(r.tier).toBe('high')
    expect(r.score).toBeGreaterThanOrEqual(70)
  })

  it('classifies esports as high DPS', () => {
    const r = scoreDomainPredictability('Will T1 win Worlds 2026 League of Legends?')
    expect(r.tier).toBe('high')
  })

  it('classifies box office as high DPS', () => {
    const r = scoreDomainPredictability('Will Avatar 4 gross over $2B globally?')
    expect(r.tier).toBe('high')
  })

  it('classifies crypto on-chain milestones as high DPS', () => {
    const r = scoreDomainPredictability('Will Bitcoin ETF inflows exceed $1B in May 2026?')
    expect(r.tier).toBe('high')
  })

  it('classifies live sports outcomes as low DPS', () => {
    const r = scoreDomainPredictability('Will the Lakers beat the Celtics tonight?')
    expect(r.tier).toBe('low')
  })

  it('classifies weather as low DPS', () => {
    const r = scoreDomainPredictability('Will it rain in NYC this Friday?')
    expect(r.tier).toBe('low')
  })

  it('defaults unknown topics to medium DPS', () => {
    const r = scoreDomainPredictability('Will something interesting happen by year end?')
    expect(r.tier).toBe('medium')
  })
})

describe('recommendModel', () => {
  it('routes high DPS to sonnet (current speed/quality tradeoff)', () => {
    expect(recommendModel('high')).toBe('sonnet')
  })
  it('routes medium DPS to sonnet', () => {
    expect(recommendModel('medium')).toBe('sonnet')
  })
  it('routes low DPS to skip', () => {
    expect(recommendModel('low')).toBe('skip')
  })
})

describe('dpsConvictionMultiplier', () => {
  it('high DPS gets full conviction (1.0)', () => {
    expect(dpsConvictionMultiplier('high')).toBe(1.0)
  })
  it('medium DPS gets dampened conviction (0.85)', () => {
    expect(dpsConvictionMultiplier('medium')).toBe(0.85)
  })
  it('low DPS gets heavily capped conviction (0.50)', () => {
    expect(dpsConvictionMultiplier('low')).toBe(0.50)
  })
})
