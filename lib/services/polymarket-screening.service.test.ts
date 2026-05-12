import { describe, it, expect } from 'vitest'
import { reasoningContradictsEstimate } from './polymarket-screening.service'

/**
 * Regression tests for the contradiction guardrail.
 *
 * Real production examples (pulled from the live dashboard during root-cause
 * investigation of the user's reported esports losses) — these had Opus
 * emitting large numeric edges while the prose explicitly said the opposite.
 * The fabrication-by-length clamp didn't catch them because the reasoning
 * was decent length.
 */
describe('reasoningContradictsEstimate', () => {
  it('catches NAVI vs GamerLegion: "market priced fairly" + 51pt numeric edge', () => {
    expect(reasoningContradictsEstimate(
      '[OPUS 4.7 | DPS:high/esports] [⚠️ WATCH ONLY] NAVI is a top-tier CS team; GamerLegion is solid but a clear underdog. Market priced fairly.',
      0.76,   // Opus est
      0.245,  // market YES
    )).toBe(true)
  })

  it('catches BESTIA: "no strong prior" + 45pt numeric edge', () => {
    expect(reasoningContradictsEstimate(
      '[OPUS 4.7 | DPS:high/esports] [⚠️ WATCH ONLY] Lower-tier SA teams I have no strong prior on.',
      0.725,
      0.275,
    )).toBe(true)
  })

  it('catches Liquid vs M80: "coin flip with no strong directional signal"', () => {
    expect(reasoningContradictsEstimate(
      'NA derby, both rosters relatively balanced. Coin flip with no strong directional signal.',
      0.55,
      0.42,
    )).toBe(true)
  })

  it('catches "evenly matched" with numeric edge', () => {
    expect(reasoningContradictsEstimate(
      'Both rosters evenly matched in recent form.',
      0.65,
      0.50,
    )).toBe(true)
  })

  it('does NOT fire when reasoning is confidently arguing for the edge', () => {
    expect(reasoningContradictsEstimate(
      'NAVI has won 3 BO3 against this opponent type and recent form is dominant — 76% is well-supported by HLTV stats.',
      0.76,
      0.40,
    )).toBe(false)
  })

  it('does NOT fire when edge is below threshold even with no-edge phrase', () => {
    expect(reasoningContradictsEstimate(
      'Market priced fairly',
      0.52,
      0.50,
    )).toBe(false)
  })

  it('does NOT fire on empty / missing reasoning', () => {
    expect(reasoningContradictsEstimate('', 0.80, 0.30)).toBe(false)
    expect(reasoningContradictsEstimate(undefined as any, 0.80, 0.30)).toBe(false)
  })

  it('handles malformed numeric inputs without crashing', () => {
    expect(reasoningContradictsEstimate('coin flip', NaN, 0.50)).toBe(false)
    expect(reasoningContradictsEstimate('coin flip', 0.50, null as any)).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(reasoningContradictsEstimate('Market Priced Fairly', 0.80, 0.30)).toBe(true)
    expect(reasoningContradictsEstimate('NO STRONG PRIOR HERE', 0.80, 0.30)).toBe(true)
  })

  it('respects custom minEdge threshold', () => {
    // 3pt edge — below default 5pt threshold → no fire
    expect(reasoningContradictsEstimate('coin flip', 0.53, 0.50)).toBe(false)
    // But fires with custom 2pt threshold
    expect(reasoningContradictsEstimate('coin flip', 0.53, 0.50, 0.02)).toBe(true)
  })
})
