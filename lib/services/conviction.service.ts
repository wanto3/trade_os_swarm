/**
 * Multi-signal conviction calculator for Polymarket recommendations.
 *
 * A pick reaches the main watch list only when 2 of 3 independent
 * signals agree it's worth showing:
 *   1. Opus edge — the LLM screening already passed FILTER 2-4
 *   2. DPS tier — domain-predictability is high or medium (not low)
 *   3. Calibration — historical win rate in this aiEdge tier ≥50%,
 *      OR fewer than 3 resolved bets (no negative track record yet)
 *
 * Pure function. Zero side effects. Zero LLM calls. Easy to unit test.
 */

export type ConvictionSignal = 'agrees' | 'disagrees'
export type ConvictionLevel = 'strong' | 'moderate' | 'speculative' | 'suppress'

export interface ConvictionInput {
  /** True when the rec already passed the existing FILTER 2-4 edge floor */
  edgePassesFloor: boolean
  /** DPS classifier tier (high/medium = agrees, low/unknown/undefined = disagrees) */
  dpsTier?: 'high' | 'medium' | 'low' | 'unknown'
  /** Win rate 0-100 for this rec's aiEdge tier from analytics.byAiEdge */
  tierWinRate?: number | null
  /** Loss count for this rec's aiEdge tier */
  tierLosses?: number
}

export interface ConvictionResult {
  level: ConvictionLevel
  signals: {
    opus: ConvictionSignal
    dps: ConvictionSignal
    calibration: ConvictionSignal
  }
}

export function computeConviction(input: ConvictionInput): ConvictionResult {
  throw new Error('not implemented')
}
