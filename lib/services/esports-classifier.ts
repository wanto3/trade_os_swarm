/**
 * Tier-1 esports classification — gates which esports markets get the
 * "AI Edge: User" tag (i.e. "you have documented scene knowledge here,
 * place anyway even if Opus skipped").
 *
 * Background: every esports market was previously getting `aiEdge: 'user'`
 * regardless of tier. That pushed the user toward "place anyway" buttons
 * on lower-tier matchups (Passion UA vs Sinners, BESTIA Academy vs
 * HereWeGoAgain, etc.) — markets where neither Opus nor the user has any
 * real signal. Result: systematic losses on CS picks the user followed
 * because the system told them they had edge.
 *
 * The user's scene edge comes from following recognized tournaments and
 * recognized teams — not every BO3 on Polymarket. This classifier requires
 * BOTH a tier-1 tournament keyword AND a tier-1 team name in the question
 * to grant the user-edge tag.
 *
 * Spec: investigated 2026-05-12 during root-cause analysis of CS losses.
 */

/** Tier-1 tournament keywords. These are the leagues / events with enough
 *  public coverage that a follower can reasonably claim scene knowledge.
 *  Lower-tier qualifiers, regional cups, and academy circuits are excluded. */
const TIER_1_TOURNAMENTS = new RegExp(
  '\\b(' +
  // CS / CS2
  'iem|esl pro league|blast premier|cs major|major championship|' +
  'fissure|cs asia|riyadh masters|esl one|katowice|cologne|' +
  // LoL
  'lck|lec|lcs|lpl|msi|worlds|world championship|' +
  // Valorant
  'vct champions|vct masters|vct pacific|vct emea|vct americas|' +
  'valorant champions|valorant masters|' +
  // Dota 2
  'the international|ti\\d+|dpc|dreamleague|elite league|' +
  // Generic top-tier markers — "grand finals" and "main event" are
  // specific enough to imply a major tournament. "playoffs" alone is
  // too broad (regional cups have playoffs too) so it's intentionally
  // not in this list.
  'grand finals|grand final|main event' +
  ')\\b',
  'i',
)

/** Tier-1 team names. Recognizable rosters with sustained top-30 presence
 *  in their respective scenes. Lowercase to match against `.toLowerCase()`
 *  question text. Keep this list focused on TOP names the average scene
 *  follower could identify — adding deep tier-2 names defeats the purpose. */
const TIER_1_TEAMS = new RegExp(
  '\\b(' +
  // CS
  'natus vincere|navi|faze|g2 esports|g2\\b|vitality|astralis|team liquid|' +
  'liquid\\b|mouz|spirit|heroic|cloud9|ence|fnatic|complexity|big\\b|' +
  'virtus\\.?pro|m80\\b|paiN gaming|pain gaming|9 ?ine\\b|navi junior|' +
  '3dmax|ninjas in pyjamas|nip\\b|legacy\\b|imperial|furia\\b|' +
  // LoL
  't1\\b|gen\\.?g|geng|edward gaming|edg\\b|jdg|blg|top esports|rng\\b|' +
  'lng|wbg|hanwha life|drx\\b|gam esports|psg talon|' +
  'g2 esports|fnatic|mad lions|team bds|karmine corp|team liquid|' +
  '100 thieves|team solomid|tsm|cloud9|flyquest|' +
  // Valorant
  'sentinels|loud\\b|paper rex|drx|fnatic|optic|nrg\\b|edward gaming|' +
  'team liquid|team heretics|fut esports|natus vincere|t1|' +
  // Dota 2
  'team spirit|xtreme gaming|gaimin gladiators|team liquid|tundra esports|' +
  'evil geniuses|og esports|psg quest|aurora gaming|nigma galaxy|' +
  'beastcoast|talon esports' +
  ')\\b',
  'i',
)

/** Lower-tier markers that immediately disqualify even if tier-1 keywords
 *  are also present. "FaZe Academy" still loses despite "FaZe". */
const LOWER_TIER_MARKERS = new RegExp(
  '\\b(' +
  'academy|qualifier|open qual|closed qual|cct\\b|tier[\\s-]?[23]|' +
  'amateur|regional series|relegation|promotion|relegation|' +
  'lower bracket open|monthly cup|wildcard' +
  ')\\b',
  'i',
)

/**
 * Return true when the market is a tier-1 esports matchup — both a
 * recognized tournament AND a recognized top team. Returns false for
 * lower-tier qualifiers, academy circuits, and unfamiliar regional cups
 * even within the esports category.
 */
export function isTopTierEsports(question: string): boolean {
  if (!question || typeof question !== 'string') return false
  if (LOWER_TIER_MARKERS.test(question)) return false
  if (!TIER_1_TOURNAMENTS.test(question)) return false
  if (!TIER_1_TEAMS.test(question)) return false
  return true
}
