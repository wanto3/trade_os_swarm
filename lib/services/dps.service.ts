export type DPSTier = 'high' | 'medium' | 'low'
export type ModelChoice = 'opus' | 'sonnet' | 'groq' | 'skip'

export interface DPSResult {
  tier: DPSTier
  score: number       // 0-100
  rationale: string
  category: string    // 'politics' | 'esports' | 'box-office' | 'crypto-milestone' | 'live-sports' | 'weather' | 'general' etc.
}

interface CategorySignal {
  pattern: RegExp
  category: string
  score: number       // 0-100, contributes to DPS
}

const HIGH_DPS_SIGNALS: CategorySignal[] = [
  // Politics / elections / legislation — polls and news create dense signal
  { pattern: /\b(election|primary|senator|congress|president(ial)?|governor|legislat|impeach|nominee|nomination|veto|signed into law|supreme court|fed (rate|chair|decision)|tariff|sanction|resign(s|ed|ation)?|step\s?down|cabinet (pick|nominee)|confirmed by senate|approval rating|filibuster)\b/i, category: 'politics', score: 85 },
  // Geopolitical events with paper trails (treaties, NATO, ceasefires, summits)
  { pattern: /\b(ceasefire|peace deal|treaty signed|nato (membership|accession)|join (nato|eu)|sanction(s)? against|summit|g7 (meeting|summit)|g20 (meeting|summit)|un security council|withdraw from)\b/i, category: 'geopolitics', score: 78 },
  // Esports — match histories, meta, bracket structure
  { pattern: /\b(esports|league of legends|lol worlds|dota|csgo|cs2|counter-strike|valorant|overwatch|fortnite|starcraft|rocket league|t1|g2|fnatic|cloud9|tsm|gen\.?g|edward gaming|the international|major championship|iem|blast premier)\b/i, category: 'esports', score: 80 },
  // Box office / streaming / awards — opening weekend data is dense
  { pattern: /\b(box office|opening weekend|gross over|gross more than|domestic gross|worldwide gross|netflix top 10|streaming chart|rotten tomatoes|metacritic score|oscar|academy award|emmy|grammy|best picture|best actor|best actress|album of the year|song of the year)\b/i, category: 'box-office', score: 78 },
  // Crypto on-chain milestones (NOT price predictions, which are noise)
  { pattern: /\b(bitcoin etf|btc etf|eth etf|spot etf|halving|merge|fork|hashrate|stablecoin (cap|supply)|on-chain|active addresses|defi tvl|inflows? exceed|outflows? exceed|listed on (coinbase|binance|kraken)|sec approval)\b/i, category: 'crypto-milestone', score: 75 },
  // Tech product launches — dates and specs leak
  { pattern: /\b(iphone \d+|pixel \d+|tesla cybertruck|gpt-?\d|claude \d|model release|product launch|wwdc|google i\/o|apple event|samsung unpacked|vision pro|robotaxi launch)\b/i, category: 'tech-launch', score: 72 },
  // Corporate M&A / business milestones — leaks, filings, regulator action
  { pattern: /\b(acquir(e|es|ed|ing)|merger with|buys?\s+\w+\s+for\s+\$\d|ipo|files? for ipo|antitrust|ftc block|doj block|earnings (beat|miss)|revenue (above|over|exceed))\b/i, category: 'corporate-ma', score: 73 },
  // Creator economy — public counters (subs/views/followers)
  { pattern: /\b(youtube subscribers|mr ?beast|reach \d+m followers|hit \d+m subs|monthly active users|maus exceed|x\/twitter follower)\b/i, category: 'creator-economy', score: 70 },
]

const LOW_DPS_SIGNALS: CategorySignal[] = [
  // Major sports team names — strong sports signal regardless of phrasing
  { pattern: /\b(lakers|celtics|warriors|nets|knicks|bulls|heat|spurs|76ers|sixers|raptors|hawks|magic|wizards|cavaliers|pistons|bucks|pacers|hornets|thunder|jazz|nuggets|trail blazers|kings|suns|clippers|mavericks|rockets|grizzlies|pelicans|timberwolves|patriots|cowboys|packers|eagles|chiefs|49ers|bills|dolphins|jets|ravens|steelers|browns|bengals|colts|titans|texans|jaguars|broncos|raiders|chargers|seahawks|rams|cardinals|vikings|lions|bears|saints|buccaneers|panthers|falcons|commanders|giants|yankees|red sox|cubs|dodgers|braves|mets|phillies|man city|man united|liverpool|arsenal|chelsea|tottenham|real madrid|barcelona|bayern|psg|juventus)\b/i, category: 'live-sports', score: 25 },
  // Live sports outcomes — league name + outcome verb
  { pattern: /\b(nba|nfl|mlb|nhl|premier league|champions league|world cup|fifa|uefa|stanley cup|super bowl|world series)\b.*\b(beat|defeat|win(s|ner)?|lose|loss|tonight|today|tomorrow|game \d|score)\b/i, category: 'live-sports', score: 25 },
  // "X vs Y" with a near-term time word
  { pattern: /\b[A-Z][a-z]+\s+vs\.?\s+[A-Z][a-z]+\b.*\b(tonight|today|tomorrow|saturday|sunday|game)\b/i, category: 'live-sports', score: 25 },
  // "the X beat the Y" structural pattern (sports-style "the [Team] verb the [Team]")
  { pattern: /\bthe\s+[A-Z][a-z]+s?\s+(beat|defeat|edge|crush|tops|loses to|lose to|win against)\s+the\s+[A-Z][a-z]+s?\b/i, category: 'live-sports', score: 25 },
  // Crypto price predictions — coin-flippy
  { pattern: /\b(bitcoin|btc|ethereum|eth|solana|sol|dogecoin|doge|xrp|ada|avax|sui)\s+(reach|hit|above|below|over|under|exceed|cross|touch)\s+\$?\d/i, category: 'crypto-price', score: 30 },
  // Stock price predictions — same noise profile as crypto-price
  { pattern: /\b(stock|share|equity|\$[a-z]{2,5})\s+(reach|hit|above|below|over|under|exceed|cross|close)\s+\$?\d/i, category: 'stock-price', score: 30 },
  // Sports prop bets / over-unders — even noisier than match outcomes
  { pattern: /\b(over\/under|prop bet|points scored|yards thrown|home runs|goals scored|shots on goal|exceed \d+\s+(points|goals|yards|runs))\b/i, category: 'sports-prop', score: 22 },
  // Weather
  { pattern: /\b(rain|snow|hurricane|tornado|temperature|weather|forecast|\d+ degrees)\b/i, category: 'weather', score: 20 },
  // Celebrity gossip / personal events
  { pattern: /\b(get(s|ting)? married|get(s|ting)? divorced|cheat(s|ing)?|break ?up|engagement ring|pregnan(t|cy)|new baby)\b/i, category: 'celebrity', score: 25 },
  // Coin-flip "by midnight" / "in the next hour" type events — variance dominated
  { pattern: /\b(in the next \d+\s*(hours?|minutes?)|by midnight|by the end of (the )?day|next \d+\s*hours?)\b/i, category: 'short-window', score: 28 },
]

export function scoreDomainPredictability(question: string): DPSResult {
  // Check high DPS first
  for (const sig of HIGH_DPS_SIGNALS) {
    if (sig.pattern.test(question)) {
      return {
        tier: 'high',
        score: sig.score,
        rationale: `High-data domain: ${sig.category}. Polls/stats/leaks/structured data available.`,
        category: sig.category,
      }
    }
  }
  // Then low DPS
  for (const sig of LOW_DPS_SIGNALS) {
    if (sig.pattern.test(question)) {
      return {
        tier: 'low',
        score: sig.score,
        rationale: `Noise-dominated domain: ${sig.category}. High variance, irreducible uncertainty.`,
        category: sig.category,
      }
    }
  }
  // Default: medium
  return {
    tier: 'medium',
    score: 50,
    rationale: 'Unclassified domain — moderate predictability assumed.',
    category: 'general',
  }
}

export function recommendModel(tier: DPSTier): ModelChoice {
  // Speed/quality tradeoff: Sonnet 4.6 is 3-4x faster than Opus 4.7 with
  // near-equivalent quality on yes/no prediction-market analysis. Going
  // Sonnet across the board keeps dashboard load times under 60s instead
  // of 2-3 minutes. Opus is reserved for explicit per-market deep-dives
  // (a future feature) where a user wants the strongest model on a single
  // important pick. Low-DPS still skips entirely.
  switch (tier) {
    case 'high': return 'sonnet'
    case 'medium': return 'sonnet'
    case 'low': return 'skip'
  }
}

/**
 * Multiplier applied to LLM-derived conviction score before display.
 * Caps low-DPS conviction so a 90-confidence sports pick can't outrank a 90-confidence politics pick.
 */
export function dpsConvictionMultiplier(tier: DPSTier): number {
  switch (tier) {
    case 'high': return 1.0
    case 'medium': return 0.85
    case 'low': return 0.50
  }
}
