import { describe, it, expect } from 'vitest'
import { isTopTierEsports } from './esports-classifier'

/**
 * Regression tests built from real production picks pulled during
 * investigation of CS losses. The "user edge" tag was firing on every
 * esports market regardless of tier — these are the cases that need
 * to be REJECTED (downgraded to AI Edge: weak so the user isn't
 * encouraged to place anyway).
 */
describe('isTopTierEsports — REJECTS lower-tier matchups', () => {
  it('rejects CCT South America Series (lower-tier circuit)', () => {
    expect(isTopTierEsports(
      'Counter-Strike: BESTIA Academy vs HereWeGoAgain (BO3) - CCT South America Series 2 Group S'
    )).toBe(false)
  })

  it('rejects academy teams even with tier-1 tournament', () => {
    expect(isTopTierEsports(
      'Counter-Strike: NAVI Junior vs Team Spirit Academy - IEM Atlanta Group A'
    )).toBe(false)
  })

  it('rejects qualifiers', () => {
    expect(isTopTierEsports(
      'Counter-Strike: Team X vs Team Y - Open Qualifier for IEM'
    )).toBe(false)
  })

  it('rejects matchups with no recognizable team', () => {
    expect(isTopTierEsports(
      'Counter-Strike: Passion UA vs Sinners (BO3) - IEM Atlanta Group B'
    )).toBe(false)
  })

  it('rejects matchups with no recognizable tournament', () => {
    expect(isTopTierEsports(
      'Counter-Strike: NAVI vs FaZe - Some Random Cup'
    )).toBe(false)
  })
})

describe('isTopTierEsports — ACCEPTS tier-1 matchups', () => {
  it('accepts NAVI vs GamerLegion at IEM (top team + tier-1 event)', () => {
    expect(isTopTierEsports(
      'Counter-Strike: Natus Vincere vs GamerLegion (BO3) - IEM Atlanta Group B'
    )).toBe(true)
  })

  it('accepts Astralis vs Liquid at BLAST Premier', () => {
    expect(isTopTierEsports(
      'Counter-Strike: Astralis vs Team Liquid - BLAST Premier Spring Final'
    )).toBe(true)
  })

  it('accepts T1 vs Gen.G at LCK', () => {
    expect(isTopTierEsports(
      'League of Legends: T1 vs Gen.G - LCK Spring Split Finals'
    )).toBe(true)
  })

  it('accepts Sentinels vs LOUD at VCT Champions', () => {
    expect(isTopTierEsports(
      'Valorant: Sentinels vs LOUD - VCT Champions Playoffs'
    )).toBe(true)
  })

  it('accepts Team Spirit vs Xtreme Gaming at The International', () => {
    expect(isTopTierEsports(
      'Dota 2: Team Spirit vs Xtreme Gaming - The International 14 Grand Finals'
    )).toBe(true)
  })
})

describe('isTopTierEsports — graceful edge cases', () => {
  it('returns false for empty / non-string input', () => {
    expect(isTopTierEsports('')).toBe(false)
    expect(isTopTierEsports(null as any)).toBe(false)
    expect(isTopTierEsports(undefined as any)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isTopTierEsports(
      'COUNTER-STRIKE: NAVI VS FAZE - IEM KATOWICE GRAND FINAL'
    )).toBe(true)
  })
})
