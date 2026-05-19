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
  // Signal 1: Opus edge — already filtered by FILTER 2-4 upstream;
  // this flag just relays the result so we can count it as a signal.
  const opus: ConvictionSignal = input.edgePassesFloor ? 'agrees' : 'disagrees'

  // Signal 2: DPS classifier tier. high/medium = the category is
  // predictable enough that Opus's call has structural backing.
  // low/unknown/undefined = treat as disagree (conservative).
  const dps: ConvictionSignal =
    input.dpsTier === 'high' || input.dpsTier === 'medium' ? 'agrees' : 'disagrees'

  // Signal 3: Calibration. Agree by default when there's no negative
  // track record (losses < 3). Disagree only when we have ≥3 losses
  // AND the hit rate is below 50%. This prevents the system from
  // vetoing brand-new tiers (where calibration data is empty) while
  // still blocking tiers proven to be losing for the user.
  const losses = input.tierLosses ?? 0
  let calibration: ConvictionSignal
  if (losses < 3) {
    calibration = 'agrees'
  } else {
    const wr = input.tierWinRate ?? 0
    calibration = wr >= 50 ? 'agrees' : 'disagrees'
  }

  const agreeCount =
    (opus === 'agrees' ? 1 : 0) +
    (dps === 'agrees' ? 1 : 0) +
    (calibration === 'agrees' ? 1 : 0)

  const level: ConvictionLevel =
    agreeCount === 3 ? 'strong'
      : agreeCount === 2 ? 'moderate'
      : agreeCount === 1 ? 'speculative'
      : 'suppress'

  return { level, signals: { opus, dps, calibration } }
}
