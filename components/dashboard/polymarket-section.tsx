"use client"

import { useState, useEffect, useCallback } from 'react'
import {
  ExternalLink, TrendingUp, TrendingDown, AlertTriangle, Shield, Zap,
  RefreshCw, ChevronDown, ArrowUpDown, DollarSign, Target, BarChart3,
  Info, Wallet, Play, Pause, Settings, Trophy, X, RotateCcw,
  CheckCircle, AlertCircle
} from 'lucide-react'
import PortfolioImport from './portfolio-import'
import PortfolioImportFromAddress from './portfolio-import-from-address'

// ── Types ────────────────────────────────────────────────────────────────────

interface Market {
  id: string
  question: string
  outcomes: string[]
  outcomePrices: number[]
  volumeNum: number
  liquidityNum: number
  volume24hr: number
  bestBid: number | null
  bestAsk: number | null
  spread: number
  endDateIso: string | null
  slug: string
  url: string
  competitive?: number
}

interface TradeRecommendation {
  market: Market
  outcome: string
  odds: number
  estimatedProbability: number
  marketImpliedProb: number
  expectedValue: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  upside: string
  riskLevel: 'low' | 'medium' | 'high'
  maxBet: number
  safetyScore: number
  recommendedBet: number
  kellyFraction: number
  halfKellyBet: number
  closingDate: number
  daysToClose: number
  // Conviction scoring (Phase 2)
  convictionScore?: number
  convictionLabel?: 'no-brainer' | 'high' | 'consider' | 'risky'
  research?: {
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed'
    keyInsight: string
    topFindings: string[]
    confidenceLevel: 'high' | 'medium' | 'low'
  } | null
  longTail?: {
    flag: 'near-certain' | 'near-impossible' | 'contrarian' | null
    reasoning: string
  } | null
  timeAnalysis?: {
    tier: 'pending' | 'imminent' | 'closing-soon' | 'medium' | 'long'
    daysToClose: number
  }
}

interface ApiResponse {
  success: boolean
  timestamp: number
  opportunities: TradeRecommendation[]
  hotNowOpportunities: TradeRecommendation[]
  closingSoonOpportunities: TradeRecommendation[]
  longTailOpportunities: TradeRecommendation[]
  // Every ≤24h market that Opus actually analyzed, regardless of whether
  // it ended in a bet recommendation. Surfaced as a "Watch List" so users
  // see what was considered — including skip-direction picks — instead of
  // a blank tab when high-conviction 24h opportunities are scarce.
  closingTodayAnalyzed?: TradeRecommendation[]
  hotMarkets: Market[]
  stats: {
    marketsAnalyzed: number
    opportunitiesFound: number
    closingSoonCount?: number
    longTailCount?: number
    highestConviction?: number | null
    avgConviction?: number | null
    highestSafety: number | null
    avgSafety: number | null
  }
}

interface PolymarketPosition {
  id: string
  marketId: string
  question: string
  outcome: 'Yes' | 'No'
  outcomeIndex: number  // 0 for Yes-side bet, 1 for No-side bet — needed for manual-resolve UI
  entryPrice: number
  quantity: number
  cost: number
  potentialPayout: number
  confidence: 'high' | 'medium' | 'low'
  safetyScore: number
  estimatedProbability: number
  marketImpliedProb: number
  expectedValue: number
  category: string
  source?: 'app' | 'auto' | 'imported'
  placedAt: number
  resolvedAt?: number
  status: 'open' | 'won' | 'lost'
  resolution?: 'yes' | 'no' | 'invalid'
  pnl?: number
  pnlPercent?: number
  url: string
}

interface AutoTraderConfig {
  enabled: boolean
  kellyMode: 'quarter' | 'half' | 'full'
  confidenceFilter: 'high' | 'medium'
  maxOpenPositions: number
  maxBetSizePercent: number
  startingBankroll: number
  lastPoll: number | null
  lastPlacement: number | null
}

interface Analytics {
  totalTrades: number
  wonTrades: number
  lostTrades: number
  winRate: number
  totalPnl: number
  roi: number
  evAccuracy: number
  avgHoldTimeDays: number
  bestTrade: PolymarketPosition | null
  worstTrade: PolymarketPosition | null
  profitByCategory: Record<string, number>
  equityCurve: Array<{ date: string; value: number }>
  evAccuracyTrades: number
  byConvictionBand?: Array<{ band: string; scoreRange: string; bets: number; wins: number; losses: number; winRate: number; pnl: number }>
  byDpsTier?: Array<{ tier: string; bets: number; wins: number; losses: number; winRate: number; pnl: number }>
  byAiEdge?: Array<{ edge: string; bets: number; wins: number; losses: number; winRate: number; pnl: number; avgRoi: number }>
  bankrollHistory?: Array<{ ts: number; bankroll: number; totalPnl: number; trigger: string }>
  dailyPerformance?: Array<{
    date: string
    startBankroll: number
    endBankroll: number
    netPnl: number
    trades: { placed: number; resolved: number; wins: number; losses: number }
    hitRateByEdge: { strong: number | null; user: number | null; weak: number | null }
    targetBankroll: number
    onTrack: boolean
  }>
  targetBankrollToday?: number
  targetEndBankroll?: number
  daysToTargetEnd?: number
  sampleSizeNeeded?: number
  hasSignificantSample?: boolean
}

interface Portfolio {
  bankroll: number
  startingBankroll: number
  totalPnl: number
  totalTrades: number
  wonTrades: number
  lostTrades: number
  positions: PolymarketPosition[]
}

// ── Sort Types ────────────────────────────────────────────────────────────────

type SortKey = 'fastestProfit' | 'winProb' | 'safety' | 'ev' | 'closing' | 'confidence'
type FilterKey = 'all' | 'high' | 'medium' | 'low' | '24h' | 'today' | '3days' | '7days' | '14days' | '30days' | 'anyEdge' | 'safeScalps' | 'compound' | 'dailyTarget' | 'aggressive'
type KellyMode = 'quarter' | 'half' | 'full'
type TabKey = 'opportunities' | 'paper-trades' | 'performance' | 'settings'

interface SortItem {
  key: SortKey
  label: string
  color: string
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SafetyBar({ score }: { score: number }) {
  const color = score >= 70 ? '#3fb950' : score >= 55 ? '#f0883e' : '#8b949e'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
      <div style={{ width: '48px', height: '6px', backgroundColor: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', backgroundColor: color, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.7rem', fontWeight: 700, color }}>{score}</span>
    </div>
  )
}

function KellyBar({ fraction }: { fraction: number }) {
  const pct = Math.min(fraction * 100, 10)
  const color = pct > 5 ? '#f0883e' : pct > 2 ? '#58a6ff' : '#3fb950'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
      <div style={{ width: '48px', height: '6px', backgroundColor: '#21262d', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pct * 10}%`, height: '100%', backgroundColor: color, borderRadius: '3px' }} />
      </div>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color }}>{(fraction * 100).toFixed(1)}%</span>
    </div>
  )
}

function StatusBadge({ status }: { status: 'open' | 'won' | 'lost' }) {
  const config = {
    open: { label: 'OPEN', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.1)' },
    won: { label: 'WON', color: '#3fb950', bg: 'rgba(63, 185, 80, 0.1)' },
    lost: { label: 'LOST', color: '#f85149', bg: 'rgba(248, 81, 73, 0.1)' },
  }
  const c = config[status]
  return (
    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: c.color, backgroundColor: c.bg, padding: '2px 7px', borderRadius: '4px' }}>
      {c.label}
    </span>
  )
}

function CategoryBadge({ cat }: { cat: string }) {
  const colors: Record<string, string> = { crypto: '#f0883e', sports: '#3fb950', policy: '#8b5cf6', general: '#58a6ff' }
  const color = colors[cat] || '#8b949e'
  return (
    <span style={{ fontSize: '0.58rem', fontWeight: 600, color, backgroundColor: `${color}15`, padding: '1px 6px', borderRadius: '4px' }}>
      {cat.toUpperCase()}
    </span>
  )
}

function MultiKeySortBar({
  sortKeys,
  onAdd,
  onToggle,
  onClear,
  allKeys,
}: {
  sortKeys: SortItem[]
  onAdd: (key: SortKey) => void
  onToggle: (key: SortKey) => void
  onClear: () => void
  allKeys: SortItem[]
}) {
  const handleClick = (e: React.MouseEvent, key: SortKey) => {
    if (e.shiftKey) {
      if (!sortKeys.find(s => s.key === key)) {
        onAdd(key)
      }
    } else {
      onToggle(key)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.6rem', color: '#6e7681', marginRight: '0.25rem' }}>Sort:</span>
      {allKeys.map(opt => {
        const isActive = sortKeys[0]?.key === opt.key
        return (
          <button
            key={opt.key}
            onClick={(e) => handleClick(e, opt.key)}
            title="Click to set primary sort; Shift+click to add secondary sort"
            style={{
              padding: '3px 8px',
              fontSize: '0.58rem',
              fontWeight: 600,
              background: isActive ? `${opt.color}20` : 'transparent',
              color: isActive ? opt.color : '#6e7681',
              border: `1px solid ${isActive ? opt.color + '50' : '#30363d'}`,
              borderRadius: '16px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
      {sortKeys.length > 0 && (
        <>
          {sortKeys.map((s, i) => (
            <span key={s.key} style={{ fontSize: '0.58rem', color: '#8b949e' }}>
              {i === 0 ? '' : ' → '}{s.label}
            </span>
          ))}
          {sortKeys.length > 1 && (
            <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', padding: '0', fontSize: '0.6rem' }}>
              <X size={12} />
            </button>
          )}
        </>
      )}
      {sortKeys.length === 0 && (
        <span style={{ fontSize: '0.58rem', color: '#484f58' }}>(click to set, Shift+click to add)</span>
      )}
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function PolymarketSection() {
  // Opportunities data
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [walletData, setWalletData] = useState<{ positions: number; trades: number; balanceUSD: number; gnosisUSDC: number; polygonUSDT: number; totalUSD: number } | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  // Default sort = 'fastestProfit' (compounding velocity, EV/day). With $4
  // small capital, daily-ROI matters more than absolute EV — locking $1 for
  // 999 days at +60% EV is much worse than 25 days at +20% EV.
  // High-mispriced bets that lose still drain bankroll; high-confidence
  // winners that compound at small per-bet returns are sustainable.
  const [sortKey, setSortKey] = useState<SortKey>('fastestProfit')
  const [secondarySort, setSecondarySort] = useState<SortKey | null>(null)
  // Default 'safeScalps' — user's chosen strategy: high-win-prob picks where
  // Opus agrees with the market price, for compounding small ($4) bankroll.
  // 24h / 7d / 14d / All filters one click away when wanting time-window focus.
  // Default filter = 'dailyTarget' — the $4→$100-in-30-days shape: ≤48h
  // closing, heavy favorite (70-92% YES), Opus medium+ confidence, ≥5pt edge.
  // Some days zero picks; some days 2-3. The user's primary growth path.
  const [filterKey, setFilterKey] = useState<FilterKey>('dailyTarget')
  // Hide AI-weak ("Limited Edge") picks from the opportunities lane by
  // default. Categories where Opus is unreliable (live sports, sports
  // props, crypto-price, weather, celebrity, short-window) shouldn't
  // crowd the main view. User can toggle off to see them.
  const [hideLimitedEdge, setHideLimitedEdge] = useState<boolean>(true)
  // Watch list category filter — lets the user focus on AI Strong picks
  // (Opus has training-data edge), Your Edge picks (esports the user
  // follows), or Limited Edge (sports/coin-flips for personal-judgment
  // bets only). Default 'all' shows everything sorted by edge magnitude.
  const [watchTierFilter, setWatchTierFilter] = useState<'all' | 'strong' | 'user' | 'weak' | 'untagged'>('all')
  // Half Kelly default — slightly more aggressive sizing for $4 grow phase.
  // User picks Full or Quarter from the selector if they want to dial up/down.
  const [kellyMode, setKellyMode] = useState<KellyMode>('half')
  // Header bankroll display (also drives Kelly sizing on opportunity
  // cards). Initialized to 0 — the useEffect below syncs to the live
  // Polymarket portfolio value as soon as paperPortfolio loads, which
  // happens within ~1s of page mount via the auto-sync we wired up.
  // User can still manually override by typing in the input box; their
  // override persists until the next paperPortfolio refresh.
  const [bankroll, setBankroll] = useState<number>(0)
  const [bankrollInput, setBankrollInput] = useState<string>('0')
  const [bankrollUserOverride, setBankrollUserOverride] = useState<boolean>(false)

  // Paper trades / analytics
  const [activeTab, setActiveTab] = useState<TabKey>('opportunities')
  const [paperPositions, setPaperPositions] = useState<PolymarketPosition[]>([])
  const [paperPortfolio, setPaperPortfolio] = useState<Portfolio | null>(null)
  // Paper-trades table sort + filter state. Click a column header to
  // sort by it (toggles direction); filter chips above the table
  // narrow to open / resolved / all positions. Default: most recent
  // open first.
  const [paperSortKey, setPaperSortKey] = useState<'placedAt' | 'cost' | 'pnl' | 'daysHeld' | 'safety' | 'status' | 'category' | 'outcome'>('placedAt')
  const [paperSortDir, setPaperSortDir] = useState<'asc' | 'desc'>('desc')
  const [paperFilter, setPaperFilter] = useState<'open' | 'resolved' | 'all'>('open')
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [autoConfig, setAutoConfig] = useState<AutoTraderConfig | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [paperLoading, setPaperLoading] = useState(false)
  const [placingTrade, setPlacingTrade] = useState<string | null>(null)
  const [placingError, setPlacingError] = useState<string | null>(null)
  const [liveTradingEnabled, setLiveTradingEnabled] = useState(false)
  const [liveTradingStatus, setLiveTradingStatus] = useState<{
    enabled: boolean
    address: string | null
    balance: { usdc: number; eth: number }
    openOrdersCount: number
  } | null>(null)

  // Local config form state
  const [localConfig, setLocalConfig] = useState<Partial<AutoTraderConfig>>({})

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/polymarket', { cache: 'no-store' })
      const json: ApiResponse = await res.json()
      if (json.success) {
        setData(json)
        setLastUpdated(json.timestamp > 0 ? json.timestamp : null)
      } else {
        setData({ success: true, timestamp: 0, opportunities: [], hotNowOpportunities: [], closingSoonOpportunities: [], longTailOpportunities: [], hotMarkets: [], stats: { marketsAnalyzed: 0, opportunitiesFound: 0, highestSafety: null, avgSafety: null } })
      }
    } catch {
      setData({ success: true, timestamp: 0, opportunities: [], hotNowOpportunities: [], closingSoonOpportunities: [], longTailOpportunities: [], hotMarkets: [], stats: { marketsAnalyzed: 0, opportunitiesFound: 0, highestSafety: null, avgSafety: null } })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    loadBalance()
    loadPaperData()
    loadLiveTradingStatus()
  }, [fetchData])

  // Auto-sync the header bankroll widget with the live Polymarket
  // value (which paperPortfolio.bankroll now mirrors after our import-
  // from-address flow reconciles it). Replaces the hardcoded $500
  // default which was useless — it drove Kelly sizing for opportunity
  // cards even when the user had pennies actually deposited. The
  // override flag stops us from clobbering the user's manual edit if
  // they typed a different number in the header input.
  useEffect(() => {
    if (bankrollUserOverride) return
    const live = paperPortfolio?.bankroll
    if (typeof live === 'number' && live >= 0) {
      setBankroll(live)
      setBankrollInput(live.toFixed(2))
    }
  }, [paperPortfolio?.bankroll, bankrollUserOverride])

  const loadLiveTradingStatus = async () => {
    try {
      const res = await fetch('/api/polymarket/trade')
      const json = await res.json()
      setLiveTradingStatus(json)
      setLiveTradingEnabled(json.enabled || false)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const id = setInterval(fetchData, 120000)
    return () => clearInterval(id)
  }, [fetchData])

  const loadBalance = async () => {
    setBalanceLoading(true)
    try {
      const res = await fetch('/api/wallet-balance')
      const json = await res.json()
      const polyBalance = json.polymarket?.balanceUSD || 0
      const gnosisBalance = json.chains?.gnosisUSDC || 0
      const polygonBalance = json.chains?.polygonUSDT || 0
      const total = polyBalance + gnosisBalance + polygonBalance
      setWalletData({ positions: json.polymarket?.positions || 0, trades: json.polymarket?.trades || 0, balanceUSD: polyBalance, gnosisUSDC: gnosisBalance, polygonUSDT: polygonBalance, totalUSD: total })
      if (total > 0) { setBankrollInput(total.toFixed(2)); setBankroll(total) }
    } catch { /* ignore */ }
    setBalanceLoading(false)
  }

  const loadPaperData = async () => {
    setPaperLoading(true)
    try {
      const [posRes, configRes, analyticsRes] = await Promise.all([
        fetch('/api/polymarket/positions'),
        fetch('/api/polymarket/config'),
        fetch('/api/polymarket/analytics'),
      ])
      const posJson = await posRes.json()
      const configJson = await configRes.json()
      const analyticsJson = await analyticsRes.json()

      if (posJson.success) {
        setPaperPositions(posJson.data?.positions || [])
        setPaperPortfolio(posJson.data?.portfolio || null)
      }
      if (configJson.success) {
        setAutoConfig(configJson.data)
        setLocalConfig(configJson.data)
      }
      if (analyticsJson.success) {
        setAnalytics(analyticsJson.data)
      }
    } catch { /* ignore */ }
    setPaperLoading(false)
  }

  const saveConfig = async (updates: Partial<AutoTraderConfig>) => {
    try {
      const res = await fetch('/api/polymarket/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...autoConfig, ...updates }),
      })
      const json = await res.json()
      if (json.success) {
        setAutoConfig(json.data)
        setLocalConfig(json.data)
        if (activeTab === 'paper-trades') loadPaperData()
      }
    } catch { /* ignore */ }
  }

  const placeTrade = async (rec: TradeRecommendation) => {
    setPlacingTrade(rec.market.id)
    setPlacingError(null)
    try {
      // Use real trading if live mode is enabled
      if (liveTradingEnabled && (rec as any).tokenId) {
        const tokenId = (rec as any).tokenId
        const res = await fetch('/api/polymarket/trade', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokenId,
            side: rec.outcome.toLowerCase() === 'yes' ? 'BUY' : 'BUY',
            price: rec.odds,
            amount: rec.recommendedBet,
            marketId: rec.market.id,
            outcome: rec.outcome,
          }),
        })
        const json = await res.json()
        if (json.success) {
          setPlacingError(null)
          loadLiveTradingStatus()
        } else {
          setPlacingError(json.error || 'Failed to place live trade')
        }
      } else {
        // Paper trade (default)
        const res = await fetch('/api/polymarket/place', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rec),
        })
        const json = await res.json()
        if (json.success) {
          loadPaperData()
        } else {
          setPlacingError(json.error || 'Failed to place trade')
        }
      }
    } catch {
      setPlacingError('Network error')
    }
    setPlacingTrade(null)
  }

  const resetPaperPortfolio = async () => {
    try {
      await fetch('/api/polymarket/config', { method: 'DELETE' })
      loadPaperData()
    } catch { /* ignore */ }
  }

  // ── Sorting helpers ─────────────────────────────────────────────────────────

  const ALL_SORT_KEYS: SortItem[] = [
    { key: 'winProb', label: '🎯 Sure Wins', color: '#3fb950' },
    { key: 'safety', label: '⚡ Conviction', color: '#8b5cf6' },
    { key: 'confidence', label: '🎯 Confidence', color: '#56b6c2' },
    { key: 'ev', label: '📊 Highest EV', color: '#58a6ff' },
    { key: 'closing', label: '⏱️ Closing Soon', color: '#f0883e' },
    { key: 'fastestProfit', label: '💰 Fastest Profit', color: '#e03e92' },
  ]

  // Always compute daysToClose live from closingDate to avoid stale cached values
  const liveDays = (rec: TradeRecommendation) =>
    rec.closingDate ? Math.max(0, Math.ceil((rec.closingDate - Date.now()) / (1000 * 60 * 60 * 24))) : 999

  const applyMultiSort = (items: TradeRecommendation[]): TradeRecommendation[] => {
    const sorters: Array<{ fn: (a: TradeRecommendation, b: TradeRecommendation) => number }> = []

    const primarySorter = (a: TradeRecommendation, b: TradeRecommendation) => {
      if (sortKey === 'fastestProfit') {
        // EV per day to resolution — what compounds fastest. Powell at 89% EV
        // closing in 11d (8.1%/day) beats Greenland at 63% EV closing in 241d
        // (0.26%/day) for a small bankroll trying to grow week-over-week.
        const scoreA = a.expectedValue / Math.max(liveDays(a), 1)
        const scoreB = b.expectedValue / Math.max(liveDays(b), 1)
        return scoreB - scoreA
      }
      if (sortKey === 'winProb') {
        // Sort by Opus's estimated win probability for THIS rec's outcome
        // (already side-corrected). Highest = most-confident wins. For small
        // bankroll preservation: prefer many small reliable wins over big
        // mispriced bets that lose 30% of the time.
        return b.estimatedProbability - a.estimatedProbability
      }
      if (sortKey === 'safety') return b.safetyScore - a.safetyScore
      if (sortKey === 'confidence') {
        const confOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
        return confOrder[a.confidence] - confOrder[b.confidence]
      }
      if (sortKey === 'ev') return b.expectedValue - a.expectedValue
      if (sortKey === 'closing') return liveDays(a) - liveDays(b)
      return 0
    }
    sorters.push({ fn: primarySorter })

    if (secondarySort && secondarySort !== sortKey) {
      sorters.push({
        fn: (a, b) => {
          if (secondarySort === 'safety') return b.safetyScore - a.safetyScore
          if (secondarySort === 'confidence') {
            const confOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
            return confOrder[a.confidence] - confOrder[b.confidence]
          }
          if (secondarySort === 'ev') return b.expectedValue - a.expectedValue
          if (secondarySort === 'closing') return liveDays(a) - liveDays(b)
          if (secondarySort === 'fastestProfit') {
            const scoreA = a.expectedValue / Math.max(liveDays(a), 1)
            const scoreB = b.expectedValue / Math.max(liveDays(b), 1)
            return scoreB - scoreA
          }
          return 0
        }
      })
    }

    return [...items].sort((a, b) => {
      for (const s of sorters) {
        const result = s.fn(a, b)
        if (result !== 0) return result
      }
      return 0
    })
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  const opportunities = data?.opportunities ?? []
  const filtered = applyMultiSort(opportunities).filter(rec => {
    // Global gate: hide AI-weak picks unless user toggles them on. Limited-
    // Edge picks (live sports, props, crypto-price etc.) crowd the main view
    // with low-trust EV claims. Watch List still surfaces them for user
    // judgment trades.
    const recExtGlobal = rec as TradeRecommendation & { aiEdge?: string }
    if (hideLimitedEdge && recExtGlobal.aiEdge === 'weak') return false

    if (filterKey === 'high') return rec.confidence === 'high'
    if (filterKey === 'medium') return rec.confidence === 'medium'
    if (filterKey === 'low') return rec.confidence === 'low'
    if (filterKey === 'anyEdge') return rec.expectedValue > 0.03 && rec.safetyScore >= 40
    if (filterKey === 'safeScalps') {
      // Category A "real" — Opus must estimate STRICTLY HIGHER win probability
      // than the market price (otherwise EV = 0 before fees, slight loss after).
      // Spread capped at 10% so we stay in "safe" territory rather than huge-
      // edge claims that depend on Opus being right.
      const winProb = rec.estimatedProbability
      const marketPrice = rec.odds
      const spread = winProb - marketPrice  // signed: positive means Opus is bullish vs market
      return winProb >= 0.85 && spread > 0 && spread <= 0.10
    }
    if (filterKey === 'compound') {
      // Server-tagged compoundable picks: ≤30d resolution, AI Strong, win prob
      // ≥55%, EV >5%. These are the picks that actually let small bankroll grow.
      return Boolean((rec as TradeRecommendation & { compoundable?: boolean }).compoundable)
    }
    if (filterKey === 'dailyTarget') {
      // "$4 → $100" daily-compound shape, widened to capture two paths:
      //   A. True daily (≤7d closing) with ≥5pt edge — fast cycling
      //   B. Mid-horizon (≤30d) AI-Strong with ≥10pt edge — slower but
      //      high enough EV that a single cycle is materially worth it
      //      (e.g. US-Iran peace NO 25d at +54% EV = 2.16%/day equivalent)
      // The dailyRoi >= 1%/day threshold filters both honestly: anything
      // below that won't compound to $100 in any reasonable timeframe.
      const days = liveDays(rec)
      const recExt = rec as TradeRecommendation & { aiEdge?: string; dailyRoi?: number }
      const edgePts = rec.estimatedProbability - rec.odds
      const dailyRoi = recExt.dailyRoi ?? (rec.expectedValue / Math.max(0.5, days))
      // Tier-aware short-cycle threshold: AI-Strong + your-edge get the
      // standard 5pt floor; AI-weak (live sports / props / coin flips)
      // requires 15pt + high-confidence to even surface as daily-compound.
      // Stops Real-Madrid-vs-X-tomorrow from crowding the lane with
      // medium-conf "Opus says 55% on a 22% market" picks that are
      // fabrication-prone in low-edge categories.
      const isAiWeak = recExt.aiEdge === 'weak'
      const shortCycleEdgeMin = isAiWeak ? 0.15 : 0.05
      const shortCycleConfMin = isAiWeak  // confidence requirement
      const isShortCycle = days <= 7 && edgePts >= shortCycleEdgeMin &&
                           (!shortCycleConfMin || rec.confidence === 'high')
      // Loosened mid-horizon edge from 10pt → 7pt for AI-Strong. AI-weak
      // mid-horizon picks excluded entirely (they should not be in the
      // daily-compound lane regardless).
      const isMidHorizonHighEdge = days <= 30 && edgePts >= 0.07 && recExt.aiEdge === 'strong'
      return (
        rec.confidence !== 'low' &&
        rec.expectedValue > 0 &&
        dailyRoi >= 0.01 &&  // ≥1%/day daily-ROI floor
        rec.odds >= 0.55 && rec.odds <= 0.95 &&
        (isShortCycle || isMidHorizonHighEdge)
      )
    }
    if (filterKey === 'aggressive') {
      // Cat B longshot mispricings — secondary high-variance path. Market
      // ≤25% YES OR ≥75% NO-favorite, Opus disagrees by ≥15pts. $1 → $4-10
      // if right. Lose entirely if wrong. Single big winner = month's growth.
      const recExt = rec as TradeRecommendation & { aiEdge?: string }
      const longshotYes = rec.outcome === 'Yes' && rec.odds <= 0.25 && rec.estimatedProbability - rec.odds >= 0.15
      const longshotNo = rec.outcome === 'No' && rec.odds <= 0.25 && rec.estimatedProbability - rec.odds >= 0.15
      return (longshotYes || longshotNo) && recExt.aiEdge !== 'weak'
    }
    // Only show markets with a real end date in time-based filters
    if (!rec.market.endDateIso) return filterKey === 'all'
    if (filterKey === '24h') return liveDays(rec) <= 1
    if (filterKey === 'today') return liveDays(rec) <= 3
    if (filterKey === '3days') return liveDays(rec) <= 3
    if (filterKey === '7days') return liveDays(rec) <= 7
    if (filterKey === '14days') return liveDays(rec) <= 14
    if (filterKey === '30days') return liveDays(rec) <= 30
    return true
  })

  const getKellyBet = (rec: TradeRecommendation) => {
    const divisor = kellyMode === 'quarter' ? 4 : kellyMode === 'half' ? 2 : 1
    // Match server-side tier-trust multiplier in calculateKellyBetSize so the
    // displayed bet matches what gets placed. AI-Strong+high → 1.5×,
    // AI-Strong+medium → 1.2×, AI-weak → 0.6×, else 1.0×.
    const recExt = rec as TradeRecommendation & { aiEdge?: 'strong' | 'user' | 'weak' }
    let tierMul = 1.0
    if (recExt.aiEdge === 'strong' && rec.confidence === 'high') tierMul = 1.5
    else if (recExt.aiEdge === 'strong' && rec.confidence === 'medium') tierMul = 1.2
    else if (recExt.aiEdge === 'weak') tierMul = 0.6
    // Server caps raw Kelly at 15%; mirror so a high-edge pick doesn't appear
    // bigger on the card than what actually places.
    const cappedFraction = Math.min(rec.kellyFraction, 0.15)
    return bankroll * cappedFraction * tierMul / divisor
  }

  const totalKellyBet = filtered.reduce((sum, r) => sum + getKellyBet(r), 0)
  const avgSafety = filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + r.safetyScore, 0) / filtered.length) : 0
  const avgEV = filtered.length > 0 ? filtered.reduce((s, r) => s + r.expectedValue, 0) / filtered.length : 0
  const potentialProfit = filtered.reduce((sum, r) => {
    const bet = getKellyBet(r)
    const expected = bet * r.estimatedProbability * ((1 / r.odds) - 1) - bet * (1 - r.estimatedProbability)
    return sum + expected
  }, 0)

  const openPositions = paperPositions.filter(p => p.status === 'open')
  const closedPositions = paperPositions.filter(p => p.status !== 'open')

  const formatTimeAgo = (ts: number | null) => {
    if (!ts) return ''
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  const formatVolume = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
    return `$${v.toFixed(0)}`
  }

  const kellyLabel = kellyMode === 'quarter' ? '¼ Kelly (Ultra-safe)' : kellyMode === 'half' ? '½ Kelly (Balanced — recommended)' : 'Full Kelly (Aggressive — bust risk)'

  // ── Tabs ────────────────────────────────────────────────────────────────────

  const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'opportunities', label: 'Opportunities', icon: <Zap size={14} /> },
    { key: 'paper-trades', label: `Paper Trades${openPositions.length > 0 ? ` (${openPositions.length})` : ''}`, icon: <Target size={14} /> },
    { key: 'performance', label: 'Performance', icon: <TrendingUp size={14} /> },
  ]

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <section style={{ marginBottom: '1.5rem' }}>
      {/* Section Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #f0883e 0%, #e03e92 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap style={{ width: '18px', height: '18px', color: '#fff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Prediction Market Opportunities
              {liveTradingEnabled && liveTradingStatus?.enabled && (
                <span style={{ fontSize: '0.55rem', backgroundColor: 'rgba(248,81,73,0.15)', color: '#f85149', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                  LIVE
                </span>
              )}
              {autoConfig?.enabled && !liveTradingEnabled && (
                <span style={{ fontSize: '0.55rem', backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                  AUTO
                </span>
              )}
            </h2>
            <p style={{ fontSize: '0.65rem', color: '#6e7681', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
              <span>{opportunities.length} opportunities</span>
              {liveTradingEnabled && liveTradingStatus?.enabled ? (
                <>
                  <span style={{ color: '#f85149', fontWeight: 600 }}>• LIVE</span>
                  {liveTradingStatus.balance.usdc > 0 && (
                    <span>• ${liveTradingStatus.balance.usdc.toFixed(2)} USDC</span>
                  )}
                </>
              ) : (
                <span>• {openPositions.length} paper trades</span>
              )}
              {/* Analysis status badge — shows what model + when last analyzed */}
              {(() => {
                const extras = data as unknown as {
                  stats?: { screeningModelUsed?: string; marketsScreened?: number; marketsAnalyzed?: number }
                  cacheStatus?: string
                  analysisInProgress?: boolean
                } | null
                const model = extras?.stats?.screeningModelUsed
                const screened = extras?.stats?.marketsScreened
                const total = extras?.stats?.marketsAnalyzed
                const inProgress = extras?.analysisInProgress
                const stale = extras?.cacheStatus === 'stale-revalidating'
                return (
                  <>
                    {model && (
                      <span style={{
                        fontSize: '0.55rem',
                        backgroundColor: 'rgba(139, 92, 246, 0.15)',
                        color: '#8b5cf6',
                        padding: '1px 6px',
                        borderRadius: '8px',
                        fontWeight: 600,
                      }}>
                        {model} {screened ?? '?'}/{total ?? '?'}
                      </span>
                    )}
                    {inProgress && (
                      <span style={{
                        fontSize: '0.55rem',
                        backgroundColor: 'rgba(58, 169, 240, 0.15)',
                        color: '#3aa9f0',
                        padding: '1px 6px',
                        borderRadius: '8px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}>
                        <RefreshCw size={9} style={{ animation: 'spin 1.5s linear infinite' }} />
                        Refreshing analysis…
                      </span>
                    )}
                    {stale && (
                      <span style={{ fontSize: '0.55rem', color: '#a09060', fontStyle: 'italic' }}>
                        cache: stale
                      </span>
                    )}
                  </>
                )
              })()}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Settings */}
          <button
            onClick={() => { setSettingsOpen(!settingsOpen); setActiveTab('opportunities') }}
            style={{
              background: settingsOpen ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              border: `1px solid ${settingsOpen ? 'rgba(139, 92, 246, 0.4)' : '#30363d'}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: settingsOpen ? '#8b5cf6' : '#6e7681',
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              transition: 'all 0.2s'
            }}
          >
            <Settings style={{ width: 14, height: 14 }} />
          </button>

          {/* Bankroll — auto-syncs from your live Polymarket portfolio
              value via the import-from-address flow. Manual edits set
              the override flag so the auto-sync stops clobbering them
              until you click the "reset to live" button. */}
          <div
            title={bankrollUserOverride
              ? 'Manual override active — auto-sync paused. Click ↺ to resume tracking live Polymarket value.'
              : `Live from Polymarket portfolio value. Updates on every Sync ${typeof paperPortfolio?.bankroll === 'number' ? `(currently $${paperPortfolio.bankroll.toFixed(2)})` : ''}.`}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              backgroundColor: '#161b22',
              border: `1px solid ${bankrollUserOverride ? 'rgba(240,136,62,0.4)' : '#30363d'}`,
              borderRadius: '8px', padding: '4px 10px',
            }}
          >
            <DollarSign style={{ width: 12, height: 12, color: bankrollUserOverride ? '#f0883e' : '#3fb950' }} />
            <input
              type='number'
              value={bankrollInput}
              onChange={e => {
                setBankrollInput(e.target.value)
                const val = parseFloat(e.target.value)
                if (!isNaN(val) && val >= 0) {
                  setBankroll(val)
                  setBankrollUserOverride(true)  // pause auto-sync
                }
              }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '0.75rem', fontWeight: 600, width: '80px', outline: 'none' }}
              placeholder='Bankroll'
            />
            {bankrollUserOverride && (
              <button
                onClick={() => setBankrollUserOverride(false)}
                title='Resume auto-sync from live Polymarket portfolio value'
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#f0883e', fontSize: '0.7rem', fontWeight: 700,
                  padding: '0 4px',
                }}
              >
                ↺
              </button>
            )}
            <button
              onClick={loadBalance}
              title='Refresh wallet balance (Polymarket + Gnosis + Polygon)'
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', display: 'flex', alignItems: 'center', padding: '2px' }}
            >
              <Wallet style={{ width: 12, height: 12, animation: balanceLoading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={() => { fetchData(); loadPaperData() }}
            disabled={loading}
            title="Refresh opportunities"
            style={{
              background: loading ? 'rgba(63,185,80,0.08)' : 'none',
              border: `1px solid ${loading ? 'rgba(63,185,80,0.3)' : '#30363d'}`,
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              color: loading ? '#3fb950' : '#8b949e',
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '14px', padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={16} color='#8b5cf6' />
              <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>AI Auto-Trader Settings</h3>
            </div>
            <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Auto-Trading Toggle */}
            <div>
              <label style={{ fontSize: '0.65rem', color: '#6e7681', display: 'block', marginBottom: '0.4rem' }}>Auto-Trading</label>
              <button
                onClick={() => saveConfig({ enabled: !localConfig.enabled })}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  background: localConfig.enabled ? 'rgba(63, 185, 80, 0.1)' : '#21262d',
                  border: `1px solid ${localConfig.enabled ? 'rgba(63, 185, 80, 0.3)' : '#30363d'}`,
                  borderRadius: '8px', padding: '6px 12px', cursor: 'pointer',
                  color: localConfig.enabled ? '#3fb950' : '#6e7681', fontSize: '0.75rem', fontWeight: 600
                }}
              >
                {localConfig.enabled ? <Play size={14} /> : <Pause size={14} />}
                {localConfig.enabled ? 'Active' : 'Paused'}
              </button>
            </div>

            {/* Kelly Mode */}
            <div>
              <label style={{ fontSize: '0.65rem', color: '#6e7681', display: 'block', marginBottom: '0.4rem' }}>Kelly Mode</label>
              <select
                value={localConfig.kellyMode || 'quarter'}
                onChange={e => saveConfig({ kellyMode: e.target.value as 'quarter' | 'half' | 'full' })}
                style={{ backgroundColor: '#21262d', color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.7rem', cursor: 'pointer', width: '100%' }}
              >
                <option value="quarter">¼ Kelly (Ultra-safe)</option>
                <option value="half">½ Kelly (Safe)</option>
                <option value="full">Full Kelly (Aggressive)</option>
              </select>
            </div>

            {/* Confidence Filter */}
            <div>
              <label style={{ fontSize: '0.65rem', color: '#6e7681', display: 'block', marginBottom: '0.4rem' }}>Confidence Filter</label>
              <select
                value={localConfig.confidenceFilter || 'high'}
                onChange={e => saveConfig({ confidenceFilter: e.target.value as 'high' | 'medium' })}
                style={{ backgroundColor: '#21262d', color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.7rem', cursor: 'pointer', width: '100%' }}
              >
                <option value="high">HIGH Only</option>
                <option value="medium">HIGH + MEDIUM</option>
              </select>
            </div>

            {/* Max Open Positions */}
            <div>
              <label style={{ fontSize: '0.65rem', color: '#6e7681', display: 'block', marginBottom: '0.4rem' }}>Max Open Positions</label>
              <input
                type='number'
                min={1} max={20}
                value={localConfig.maxOpenPositions || 5}
                onChange={e => saveConfig({ maxOpenPositions: parseInt(e.target.value) || 5 })}
                style={{ backgroundColor: '#21262d', color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.7rem', width: '100%', outline: 'none' }}
              />
            </div>

            {/* Max Bet Size */}
            <div>
              <label style={{ fontSize: '0.65rem', color: '#6e7681', display: 'block', marginBottom: '0.4rem' }}>Max Bet Size (% of bankroll)</label>
              <input
                type='number'
                min={1} max={50}
                value={localConfig.maxBetSizePercent || 10}
                onChange={e => saveConfig({ maxBetSizePercent: parseFloat(e.target.value) || 10 })}
                style={{ backgroundColor: '#21262d', color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.7rem', width: '100%', outline: 'none' }}
              />
            </div>

            {/* Starting Bankroll */}
            <div>
              <label style={{ fontSize: '0.65rem', color: '#6e7681', display: 'block', marginBottom: '0.4rem' }}>Starting Bankroll ($)</label>
              <input
                type='number'
                min={10}
                value={localConfig.startingBankroll || 1000}
                onChange={e => saveConfig({ startingBankroll: parseFloat(e.target.value) || 1000 })}
                style={{ backgroundColor: '#21262d', color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px', padding: '6px 10px', fontSize: '0.7rem', width: '100%', outline: 'none' }}
              />
            </div>
          </div>

          {/* Live Trading Section */}
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #21262d' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: liveTradingEnabled && liveTradingStatus?.enabled ? '#f85149' : '#484f58' }} />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#e6edf3' }}>Live Trading</span>
              </div>
              <button
                onClick={loadLiveTradingStatus}
                title="Refresh status"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', display: 'flex', alignItems: 'center' }}
              >
                <RefreshCw size={11} />
              </button>
            </div>

            {liveTradingStatus?.enabled ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* Wallet info */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: '#f85149', fontWeight: 700 }}>LIVE TRADING ACTIVE</div>
                    <div style={{ fontSize: '0.55rem', color: '#6e7681', marginTop: '2px', fontFamily: 'monospace' }}>
                      {liveTradingStatus.address ? `${liveTradingStatus.address.slice(0, 6)}...${liveTradingStatus.address.slice(-4)}` : 'No wallet'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3fb950' }}>
                      ${liveTradingStatus.balance.usdc.toFixed(2)} USDC
                    </div>
                    <div style={{ fontSize: '0.55rem', color: '#484f58' }}>
                      {liveTradingStatus.balance.eth.toFixed(4)} ETH
                    </div>
                  </div>
                </div>
                {/* Open orders */}
                {liveTradingStatus.openOrdersCount > 0 && (
                  <div style={{ fontSize: '0.6rem', color: '#f0883e', padding: '0.3rem 0.75rem' }}>
                    {liveTradingStatus.openOrdersCount} open order{liveTradingStatus.openOrdersCount !== 1 ? 's' : ''} on Polymarket
                  </div>
                )}
                {/* Warning */}
                <div style={{ fontSize: '0.58rem', color: '#6e7681', padding: '0.3rem 0.75rem', lineHeight: 1.4 }}>
                  Real orders are placed on Polymarket CLOB. Make sure your wallet has sufficient USDC on Polygon.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#6e7681', lineHeight: 1.5 }}>
                  Live trading is not configured. Add to <code style={{ backgroundColor: '#21262d', padding: '1px 4px', borderRadius: '3px', color: '#8b949e' }}>.env.local</code>:
                </div>
                <pre style={{ fontSize: '0.55rem', color: '#8b949e', backgroundColor: '#0d1117', borderRadius: '6px', padding: '0.6rem', margin: 0, overflow: 'auto', lineHeight: 1.6 }}>
{`POLYMARKET_TRADING_KEY=0x...
POLYMARKET_CLOB_API_KEY=...
POLYMARKET_CLOB_API_SECRET=...`}
                </pre>
                <button
                  onClick={loadLiveTradingStatus}
                  style={{ fontSize: '0.6rem', color: '#58a6ff', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '2px 0' }}
                >
                  After adding env vars → click to refresh
                </button>
              </div>
            )}
          </div>

          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #21262d' }}>
            <span style={{ fontSize: '0.65rem', color: autoConfig?.enabled ? '#3fb950' : '#6e7681' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: autoConfig?.enabled ? '#3fb950' : '#6e7681', marginRight: '4px' }} />
              {autoConfig?.enabled ? 'Auto-Trading Active' : 'Auto-Trading Paused'}
            </span>
            {autoConfig?.lastPlacement && (
              <span style={{ fontSize: '0.65rem', color: '#6e7681' }}>
                Last trade placed: {formatTimeAgo(autoConfig.lastPlacement)}
              </span>
            )}
            {paperPositions.length > 0 && (
              <div style={{ marginLeft: 'auto' }}>
                <button
                  onClick={resetPaperPortfolio}
                  style={{ background: 'none', border: '1px solid #30363d', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', color: '#6e7681', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <RotateCcw size={12} /> Reset Portfolio
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.75rem', borderBottom: '1px solid #21262d', paddingBottom: '0' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setSettingsOpen(false) }}
            style={{
              padding: '6px 14px',
              fontSize: '0.7rem',
              fontWeight: 600,
              background: 'none',
              color: activeTab === tab.key ? '#8b5cf6' : '#6e7681',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.key ? '#8b5cf6' : 'transparent'}`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Opportunities Tab ── */}
      {activeTab === 'opportunities' && (
        <>
          {/* Summary Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              { label: 'Total Kelly Bet', value: `$${totalKellyBet.toFixed(2)}`, sub: `across ${filtered.length} trades`, color: '#58a6ff', icon: <Target style={{ width: 14, height: 14 }} /> },
              { label: 'Expected Profit', value: potentialProfit > 0 ? `+$${potentialProfit.toFixed(2)}` : '$0.00', sub: 'if all resolve correctly', color: '#3fb950', icon: <TrendingUp style={{ width: 14, height: 14 }} /> },
              { label: 'Avg Conviction', value: `${avgSafety}/100`, sub: 'across all trades', color: avgSafety >= 70 ? '#3fb950' : avgSafety >= 55 ? '#f0883e' : '#8b949e', icon: <BarChart3 style={{ width: 14, height: 14 }} /> },
              { label: 'Avg EV per Trade', value: `${(avgEV * 100).toFixed(1)}%`, sub: kellyLabel, color: '#8b5cf6', icon: <Zap style={{ width: 14, height: 14 }} /> },
            ].map((stat, i) => (
              <div key={i} style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ color: stat.color }}>{stat.icon}</div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                  <div style={{ fontSize: '0.6rem', color: '#6e7681' }}>{stat.label}</div>
                  <div style={{ fontSize: '0.55rem', color: '#484f58' }}>{stat.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Sort + Filter Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.75rem',
            flexWrap: 'wrap',
            opacity: loading ? 0.5 : 1,
            pointerEvents: loading ? 'none' : 'auto',
            transition: 'opacity 0.2s',
          }}>
            <MultiKeySortBar
              sortKeys={[ALL_SORT_KEYS.find(k => k.key === sortKey)!].filter(Boolean)}
              onAdd={(key) => setSecondarySort(key)}
              onToggle={(key) => setSortKey(key)}
              onClear={() => setSecondarySort(null)}
              allKeys={ALL_SORT_KEYS}
            />

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.6rem', color: '#6e7681', marginRight: '0.25rem' }}>Kelly:</span>
              <select
                value={kellyMode}
                onChange={e => setKellyMode(e.target.value as KellyMode)}
                style={{ backgroundColor: '#161b22', color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px', padding: '3px 8px', fontSize: '0.6rem', cursor: 'pointer' }}
              >
                <option value="quarter">¼K</option>
                <option value="half">½K</option>
                <option value="full">Full</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.6rem', color: '#6e7681', marginRight: '0.25rem' }}>Filter:</span>
              {([
                { key: 'dailyTarget' as FilterKey, label: `🎯 Daily $4→$100` },
                { key: 'aggressive' as FilterKey, label: `🚀 Longshot` },
                { key: 'compound' as FilterKey, label: `💰 Compound` },
                { key: 'safeScalps' as FilterKey, label: `🛡️ Safe` },
                { key: '24h' as FilterKey, label: `24h` },
                { key: 'today' as FilterKey, label: `≤3d` },
                { key: '7days' as FilterKey, label: `≤7d` },
                { key: '14days' as FilterKey, label: `≤14d` },
                { key: 'high' as FilterKey, label: `HIGH` },
                { key: 'medium' as FilterKey, label: `MED` },
                { key: 'all' as FilterKey, label: `All (${filtered.length})` },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilterKey(tab.key)}
                  style={{
                    padding: '3px 8px', fontSize: '0.58rem', fontWeight: 600,
                    background: filterKey === tab.key
                      ? (tab.key === 'safeScalps' ? 'rgba(63, 185, 80, 0.25)'
                        : tab.key === '24h' ? 'rgba(248,81,73,0.2)'
                        : tab.key === '14days' || tab.key === '7days' ? 'rgba(240,136,62,0.2)'
                        : tab.key === 'today' ? 'rgba(240,136,62,0.15)'
                        : 'rgba(63, 185, 80, 0.15)')
                      : 'transparent',
                    color: filterKey === tab.key
                      ? (tab.key === 'safeScalps' ? '#3fb950'
                        : tab.key === '24h' ? '#f85149'
                        : tab.key === '14days' || tab.key === '7days' || tab.key === 'today' ? '#f0883e'
                        : '#3fb950')
                      : '#6e7681',
                    border: `1px solid ${
                      filterKey === tab.key
                        ? (tab.key === 'safeScalps' ? 'rgba(63, 185, 80, 0.45)'
                          : tab.key === '24h' ? 'rgba(248,81,73,0.35)'
                          : tab.key === '14days' || tab.key === '7days' || tab.key === 'today' ? 'rgba(240,136,62,0.3)'
                          : 'rgba(63, 185, 80, 0.3)')
                        : '#30363d'
                    }`,
                    borderRadius: '16px', cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}

              {/* Hide Limited Edge toggle — separates "Opus categories"
                  (politics/M&A/etc.) from coin-flip categories (live sports,
                  props). On by default to keep the main lane trustworthy. */}
              <button
                onClick={() => setHideLimitedEdge(v => !v)}
                title={hideLimitedEdge
                  ? 'Currently HIDING ⚠️ Limited Edge picks (live sports, props, crypto-price). Click to show them too.'
                  : 'Currently SHOWING ⚠️ Limited Edge picks. Click to hide low-AI-trust categories from the main lane.'}
                style={{
                  marginLeft: '0.4rem',
                  padding: '3px 8px', fontSize: '0.55rem', fontWeight: 700,
                  background: hideLimitedEdge ? 'rgba(63,185,80,0.10)' : 'rgba(160,144,96,0.10)',
                  color: hideLimitedEdge ? '#3fb950' : '#a09060',
                  border: `1px solid ${hideLimitedEdge ? 'rgba(63,185,80,0.3)' : 'rgba(160,144,96,0.3)'}`,
                  borderRadius: '14px', cursor: 'pointer',
                }}
              >
                {hideLimitedEdge ? '🤖 AI-Trustworthy only' : '⚠️ Showing Limited Edge'}
              </button>
            </div>

            <span style={{ fontSize: '0.6rem', color: loading ? '#3fb950' : '#6e7681' }}>
              {loading ? '↻ Refreshing...' : `${filtered.length} opportunities`}
            </span>
          </div>

          {/* $4 → $100 daily compound progress banner — shows whether
              today has actionable supply for the user's primary strategy.
              Daily-target count matches the dailyTarget filter chip exactly:
              short-cycle ≤7d/≥5pt edge OR mid-horizon ≤30d/≥10pt edge AI-Strong. */}
          {(() => {
            const opps = data?.opportunities ?? []
            const dailyTargets = opps.filter(r => {
              const days = liveDays(r)
              const recExt = r as TradeRecommendation & { aiEdge?: string; dailyRoi?: number }
              const edgePts = r.estimatedProbability - r.odds
              const dailyRoi = recExt.dailyRoi ?? (r.expectedValue / Math.max(0.5, days))
              // Tier-aware: AI-weak picks need 15pt edge + high confidence
              // to qualify as short-cycle daily-compound (matches the
              // dailyTarget filter logic exactly).
              const isAiWeak = recExt.aiEdge === 'weak'
              const shortCycleEdgeMin = isAiWeak ? 0.15 : 0.05
              const shortCycleConfMin = isAiWeak
              const isShortCycle = days <= 7 && edgePts >= shortCycleEdgeMin &&
                                   (!shortCycleConfMin || r.confidence === 'high')
              const isMidHorizonHighEdge = days <= 30 && edgePts >= 0.07 && recExt.aiEdge === 'strong'
              return r.confidence !== 'low' && r.expectedValue > 0 &&
                     dailyRoi >= 0.01 && r.odds >= 0.55 && r.odds <= 0.95 &&
                     (isShortCycle || isMidHorizonHighEdge)
            })
            const longshots = opps.filter(r => {
              const recExt = r as TradeRecommendation & { aiEdge?: string }
              return r.odds <= 0.25 &&
                r.estimatedProbability - r.odds >= 0.15 &&
                recExt.aiEdge !== 'weak'
            })
            const bankroll = paperPortfolio?.bankroll ?? 4
            // End-state target = startingBankroll × 25 (server-computed).
            // Falls back gracefully if analytics hasn't loaded yet.
            const targetEnd = analytics?.targetEndBankroll ?? Math.max(100, bankroll * 25)
            const daysLeft = analytics?.daysToTargetEnd ?? Math.max(1, Math.ceil((new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            const requiredDailyRate = bankroll > 0 && targetEnd > bankroll
              ? Math.pow(targetEnd / bankroll, 1 / daysLeft) - 1
              : 0  // already past target → no required growth
            const onTrack = dailyTargets.length >= 1 || longshots.length >= 1
            // Top picks for one-click deployment: highest daily-ROI from
            // daily-target lane, capped at 4 (matches $4 bankroll → $1/pick).
            const topPicks = [...dailyTargets].sort((a, b) => {
              const aRoi = (a as TradeRecommendation & { dailyRoi?: number }).dailyRoi ?? a.expectedValue / Math.max(1, liveDays(a))
              const bRoi = (b as TradeRecommendation & { dailyRoi?: number }).dailyRoi ?? b.expectedValue / Math.max(1, liveDays(b))
              return bRoi - aRoi
            }).slice(0, 4)
            const alreadyPlacedIds = new Set(openPositions.map(p => p.marketId))
            const placeable = topPicks.filter(p => !alreadyPlacedIds.has(p.market.id))
            const placeAllTop = async () => {
              for (const rec of placeable) {
                // Sequential placement so each Kelly recalc uses the updated
                // bankroll (placing 4 picks with stale $4 bankroll would
                // over-allocate). placeTrade is async — await each.
                await placeTrade(rec)
              }
            }
            return (
              <div style={{
                backgroundColor: onTrack ? 'rgba(63,185,80,0.07)' : 'rgba(240,192,0,0.06)',
                border: `1px solid ${onTrack ? '#3fb95044' : '#f0c00044'}`,
                borderRadius: '10px',
                padding: '0.65rem 0.85rem',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3' }}>
                    🎯 ${bankroll.toFixed(2)} → ${targetEnd >= 1000 ? `${(targetEnd / 1000).toFixed(1)}k` : targetEnd.toFixed(0)} in {daysLeft}d
                  </span>
                  <span style={{ fontSize: '0.55rem', color: '#8b949e' }}>
                    needs {(requiredDailyRate * 100).toFixed(1)}%/day
                  </span>
                  {/* Today's daily-progress pill — instant on-track signal */}
                  {analytics?.targetBankrollToday && analytics.targetBankrollToday > 0 && (() => {
                    const target = analytics.targetBankrollToday
                    const lag = bankroll - target
                    const lagPct = (lag / target) * 100
                    return (
                      <span
                        title={`Target trajectory today: $${target.toFixed(2)}. You're ${lag >= 0 ? 'ahead' : 'behind'} by $${Math.abs(lag).toFixed(2)} (${lagPct >= 0 ? '+' : ''}${lagPct.toFixed(0)}%).`}
                        style={{
                          fontSize: '0.55rem',
                          fontWeight: 700,
                          color: lag >= 0 ? '#3fb950' : '#f0883e',
                          backgroundColor: lag >= 0 ? 'rgba(63,185,80,0.12)' : 'rgba(240,136,62,0.12)',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          cursor: 'help',
                        }}
                      >
                        {lag >= 0 ? '✓ AHEAD' : '○ BEHIND'} ${Math.abs(lag).toFixed(2)}
                      </span>
                    )
                  })()}
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: dailyTargets.length >= 1 ? '#3fb950' : '#f85149' }}>
                    {dailyTargets.length} daily-compound picks
                  </span>
                  <span style={{ color: longshots.length >= 1 ? '#f0c000' : '#6e7681' }}>
                    {longshots.length} longshot mispricings
                  </span>
                  <span style={{ color: onTrack ? '#3fb950' : '#8b949e' }}>
                    {onTrack ? '✓ supply OK today' : '○ wait or use longshot path'}
                  </span>
                  {placeable.length >= 1 && (
                    <button
                      onClick={placeAllTop}
                      title={`Place paper trades on top ${placeable.length} daily-compound picks (skips already-placed). Sized via Half Kelly + tier-trust multiplier.`}
                      style={{
                        background: 'linear-gradient(135deg, #f0c000, #e09000)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '0.35rem 0.75rem',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        color: '#0d1117',
                        cursor: 'pointer',
                      }}
                    >
                      ⚡ Place top {placeable.length}
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Trade Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '0.75rem',
            position: 'relative',
          }}>
            {loading && !data ? (
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', fontSize: '0.85rem' }}>
                <RefreshCw style={{ width: 16, height: 16, marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                Fetching live Polymarket opportunities...
              </div>
            ) : filtered.length > 0 ? (
              filtered.map((rec) => {
                const kellyBet = getKellyBet(rec)
                const potentialWin = kellyBet * ((1 / rec.odds) - 1)
                const ev = kellyBet * rec.expectedValue
                const isAlreadyPlaced = openPositions.some(p => p.marketId === rec.market.id)
                const liveDaysToClose = liveDays(rec)
                const confColor = rec.confidence === 'high' ? '#3fb950' : rec.confidence === 'medium' ? '#f0883e' : '#8b949e'
                const confBg = rec.confidence === 'high' ? 'rgba(63,185,80,0.12)' : rec.confidence === 'medium' ? 'rgba(240,136,62,0.12)' : 'rgba(139,148,158,0.1)'
                const outcomeColor = rec.outcome.toLowerCase() === 'yes' ? '#3fb950' : '#f85149'

                return (
                  <a
                    key={`${rec.market.id}-${sortKey}`}
                    href={rec.market.url}
                    target='_blank'
                    rel='noopener noreferrer'
                    style={{
                      display: 'flex',
                      backgroundColor: '#161b22',
                      border: `1px solid ${confColor}22`,
                      borderRadius: '10px',
                      overflow: 'hidden',
                      textDecoration: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = confColor + '55'
                      ;(e.currentTarget as HTMLElement).style.boxShadow = `0 0 12px ${confColor}15`
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.borderColor = confColor + '22'
                      ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
                    }}
                  >
                    {/* Left confidence bar */}
                    <div style={{
                      width: '5px',
                      backgroundColor: confColor,
                      flexShrink: 0,
                    }} />

                    {/* Card content */}
                    <div style={{ flex: 1, padding: '0.7rem 0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {/* Top row: conviction + AI-edge + Compoundable tags + question */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '0.55rem',
                          fontWeight: 700,
                          color: confColor,
                          backgroundColor: confBg,
                          padding: '2px 7px',
                          borderRadius: '4px',
                          flexShrink: 0,
                          letterSpacing: '0.03em',
                        }}>
                          {rec.confidence.toUpperCase()}
                        </span>
                        {/* Compoundable tag — fast-cycling capital, key for $4 bankroll */}
                        {(rec as TradeRecommendation & { compoundable?: boolean; dailyRoi?: number }).compoundable && (() => {
                          const r = rec as TradeRecommendation & { dailyRoi?: number }
                          const dailyPct = ((r.dailyRoi || 0) * 100).toFixed(1)
                          return (
                            <span
                              title={`Capital recycles in ${rec.daysToClose} days at ~${dailyPct}%/day. Fast-compounding pick — ideal for small bankroll.`}
                              style={{
                                fontSize: '0.5rem',
                                fontWeight: 700,
                                color: '#f0c000',
                                backgroundColor: 'rgba(240,192,0,0.15)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                flexShrink: 0,
                                letterSpacing: '0.02em',
                                cursor: 'help',
                                border: '1px solid rgba(240,192,0,0.3)',
                              }}
                            >
                              💰 Compound {dailyPct}%/d
                            </span>
                          )
                        })()}
                        {/* AI-edge tag — tells you whether Opus is the right brain
                            for this category. Hover for the why. */}
                        {(rec as TradeRecommendation & { aiEdge?: 'strong' | 'user' | 'weak'; aiEdgeReason?: string }).aiEdge && (() => {
                          const r = rec as TradeRecommendation & { aiEdge?: 'strong' | 'user' | 'weak'; aiEdgeReason?: string }
                          const edge = r.aiEdge!
                          const cfg = edge === 'strong'
                            ? { label: '🤖 AI Strong', color: '#3fb950', bg: 'rgba(63,185,80,0.12)' }
                            : edge === 'user'
                              ? { label: '👤 Your Edge', color: '#a371f7', bg: 'rgba(163,113,247,0.12)' }
                              : { label: '⚠️ Limited Edge', color: '#a09060', bg: 'rgba(160,144,96,0.12)' }
                          return (
                            <span
                              title={r.aiEdgeReason || ''}
                              style={{
                                fontSize: '0.5rem',
                                fontWeight: 700,
                                color: cfg.color,
                                backgroundColor: cfg.bg,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                flexShrink: 0,
                                letterSpacing: '0.02em',
                                cursor: 'help',
                              }}
                            >
                              {cfg.label}
                            </span>
                          )
                        })()}
                        {/* Long-lock warning — capital tied up for >30 days */}
                        {rec.daysToClose > 30 && (
                          <span
                            title={`Capital locked for ${rec.daysToClose} days. EV is good but daily-ROI is low — only deploy if you have spare bankroll after fast picks.`}
                            style={{
                              fontSize: '0.5rem',
                              fontWeight: 700,
                              color: '#f85149',
                              backgroundColor: 'rgba(248,81,73,0.10)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              flexShrink: 0,
                              cursor: 'help',
                            }}
                          >
                            🔒 {rec.daysToClose > 365 ? `${Math.round(rec.daysToClose/365)}y lock` : `${rec.daysToClose}d lock`}
                          </span>
                        )}
                        <h3 style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: '#e6edf3',
                          margin: 0,
                          lineHeight: 1.35,
                          flex: 1,
                        }}>
                          {rec.market.question}
                        </h3>
                      </div>

                      {/* Prediction + EV row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: outcomeColor }}>
                          {rec.outcome} {(rec.odds * 100).toFixed(1)}%
                        </span>
                        <span style={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          color: '#a371f7',
                          backgroundColor: 'rgba(163,113,247,0.12)',
                          padding: '1px 6px',
                          borderRadius: '4px',
                        }}>
                          +{(rec.expectedValue * 100).toFixed(1)}% EV
                        </span>
                        {rec.convictionScore !== undefined && (
                          <span style={{
                            fontSize: '0.55rem',
                            fontWeight: 700,
                            color: rec.convictionScore >= 90 ? '#f0c000' : rec.convictionScore >= 75 ? '#3fb950' : '#58a6ff',
                            backgroundColor: 'rgba(240,192,0,0.08)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}>
                            CV {rec.convictionScore}
                          </span>
                        )}
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.55rem', color: '#6e7681' }}>
                          {(rec.odds * 100).toFixed(0)}% → {(rec.estimatedProbability * 100).toFixed(0)}%
                        </span>
                        <span style={{ fontSize: '0.55rem', fontWeight: 600, color: liveDaysToClose <= 3 ? '#3fb950' : '#6e7681' }}>
                          {liveDaysToClose <= 1 ? 'TODAY' : `${liveDaysToClose}d`}
                        </span>
                      </div>

                      {/* Bet row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f0883e' }}>
                          ${kellyBet.toFixed(2)}
                        </span>
                        <span style={{ fontSize: '0.55rem', color: '#6e7681' }}>
                          Bet (¼K)
                        </span>
                        <span style={{ color: '#30363d', fontSize: '0.6rem' }}>|</span>
                        <span style={{ fontSize: '0.6rem', color: '#3fb950' }}>+$</span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#3fb950' }}>
                          {potentialWin.toFixed(2)} If Win
                        </span>
                        {/* Payout multiplier — "$1 → $X" — most useful for longshot
                            picks where the multiplier is the whole story */}
                        {rec.odds > 0 && rec.odds < 0.5 && (
                          <span
                            title={`$1 stake returns $${(1/rec.odds).toFixed(2)} if this side wins. ${(1/rec.odds).toFixed(1)}x your money.`}
                            style={{
                              fontSize: '0.55rem',
                              fontWeight: 700,
                              color: '#f0c000',
                              backgroundColor: 'rgba(240,192,0,0.15)',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              cursor: 'help',
                            }}
                          >
                            {(1 / rec.odds).toFixed(1)}x payout
                          </span>
                        )}
                        <span style={{ color: '#30363d', fontSize: '0.6rem' }}>|</span>
                        <span style={{ fontSize: '0.6rem', fontWeight: 600, color: '#f85149' }}>
                          -${kellyBet.toFixed(2)} If Lose
                        </span>
                        <div style={{ flex: 1 }} />
                        {/* Auto-place button (stopPropagation so link still works) */}
                        {rec.confidence === 'high' && !isAlreadyPlaced && (
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); placeTrade(rec) }}
                            disabled={placingTrade === rec.market.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.3rem',
                              background: placingTrade === rec.market.id ? '#21262d' : 'rgba(63, 185, 80, 0.12)',
                              border: `1px solid ${placingTrade === rec.market.id ? '#30363d' : 'rgba(63,185,80,0.3)'}`,
                              borderRadius: '6px',
                              padding: '4px 10px',
                              cursor: placingTrade === rec.market.id ? 'default' : 'pointer',
                              color: placingTrade === rec.market.id ? '#6e7681' : '#3fb950',
                              fontSize: '0.58rem',
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {placingTrade === rec.market.id ? (
                              <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                              <Target size={10} />
                            )}
                            {placingTrade === rec.market.id ? '...' : 'Auto-Place'}
                          </button>
                        )}
                        {isAlreadyPlaced && (
                          <span style={{ fontSize: '0.55rem', color: '#3fb950', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <CheckCircle size={10} /> Placed
                          </span>
                        )}
                      </div>

                      {/* Footer */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.35rem', borderTop: '1px solid #21262d' }}>
                        <span style={{ fontSize: '0.52rem', color: '#484f58' }}>
                          ${((rec.market.volume24hr || rec.market.volumeNum) / 1e6).toFixed(1)}M vol
                          {rec.market.liquidityNum > 0 && ` • $${(rec.market.liquidityNum / 1e6).toFixed(1)}M liq`}
                        </span>
                        <span style={{ fontSize: '0.52rem', color: '#484f58' }}>
                          Spread: {rec.market.spread > 0 ? `${(rec.market.spread * 100).toFixed(1)}%` : 'N/A'}
                        </span>
                        <ExternalLink style={{ width: 9, height: 9, color: '#484f58' }} />
                      </div>
                    </div>
                  </a>
                )
              })
            ) : (
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', fontSize: '0.85rem', textAlign: 'center' }}>
                No opportunities match your filters right now.
              </div>
            )}
            {/* Pulsing refresh indicator when background-refreshing */}
            {loading && data && (
              <div style={{
                gridColumn: '1 / -1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px',
                gap: '6px',
                fontSize: '0.6rem',
                color: '#3fb950',
              }}>
                <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                Updating...
              </div>
            )}
          </div>

          {/* ── Watch List: 24h markets Opus analyzed but didn't bet ──
              Shown under 24h / ≤3d filters so the user always sees what
              was considered, even when the high-conviction list is empty.
              These are direction='skip' picks (low conf or tiny edge) so we
              label them as "considered, not recommended" to avoid implying
              they're bets. */}
          {(filterKey === '24h' || filterKey === 'today') && (() => {
            const watchRaw = data?.closingTodayAnalyzed ?? []
            // Dedupe: API returns both YES and NO sides per market; keep one
            // per question. Also drop any that are already in `filtered`
            // (those are real opportunities, no need to duplicate).
            const filteredQuestions = new Set(filtered.map(f => f.market.question))
            const seen = new Set<string>()
            const watchList = watchRaw.filter(r => {
              if (filteredQuestions.has(r.market.question)) return false
              if (seen.has(r.market.question)) return false
              seen.add(r.market.question)
              return true
            })
            if (watchList.length === 0) return null
            // Sort by win probability of the suggested side, NOT by edge.
            // Rationale: "being right" beats "claimed edge". A pick at 84%
            // YES with +0.5pt edge is more likely to win than a coin-flip
            // with a fabricated +30pt edge — and the user is compounding
            // a small bankroll where hit rate matters more than swing size.
            //
            // For each rec compute the price of the side Opus leans toward
            // (or the favorite-side price for no-lean picks). That IS the
            // market's estimate of "how often this bet wins" — the wisdom
            // of the crowd as a sanity anchor on top of Opus's claim.
            const winProbOfSide = (r: TradeRecommendation): number => {
              const edge = (r.estimatedProbability - r.odds)
              if (Math.abs(edge) < 0.005) {
                // No lean — use whichever side is the favorite
                return Math.max(r.odds, 1 - r.odds)
              }
              return edge > 0 ? r.odds : 1 - r.odds
            }
            const watchListSorted = [...watchList].sort((a, b) => {
              return winProbOfSide(b) - winProbOfSide(a)  // high win prob first
            })
            // Apply category filter from watchTierFilter state
            const watchListFiltered = watchTierFilter === 'all'
              ? watchListSorted
              : watchListSorted.filter(r => {
                const e = (r as TradeRecommendation & { aiEdge?: string }).aiEdge ?? 'untagged'
                return e === watchTierFilter
              })
            // Count by AI-edge tier so the user sees the breakdown at a glance:
            // "3 👤 your edge / 2 🤖 AI / 5 ⚠️ weak"
            const edgeCounts = { strong: 0, user: 0, weak: 0, untagged: 0 }
            for (const r of watchList) {
              const e = (r as TradeRecommendation & { aiEdge?: string }).aiEdge ?? 'untagged'
              if (e === 'strong') edgeCounts.strong++
              else if (e === 'user') edgeCounts.user++
              else if (e === 'weak') edgeCounts.weak++
              else edgeCounts.untagged++
            }
            // Category filter chip configs
            type TierChip = { key: typeof watchTierFilter; label: string; color: string; count: number }
            const tierChipsAll: TierChip[] = [
              { key: 'all', label: `All ${watchList.length}`, color: '#8b949e', count: watchList.length },
              { key: 'strong', label: `🤖 AI Strong`, color: '#3fb950', count: edgeCounts.strong },
              { key: 'user', label: `👤 Your Edge`, color: '#a371f7', count: edgeCounts.user },
              { key: 'weak', label: `⚠️ Limited`, color: '#a09060', count: edgeCounts.weak },
            ]
            const tierChips: TierChip[] = tierChipsAll.filter(c => c.key === 'all' || c.count > 0)

            return (
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  marginBottom: '0.5rem',
                  flexWrap: 'wrap',
                }}>
                  <span style={{
                    fontSize: '0.7rem', color: '#c9d1d9', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  }}>
                    👀 Watch List — actionable picks Opus skipped ({watchList.length}) · <span style={{ fontSize: '0.55rem', color: '#8b949e', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>sorted by win-probability first, edge second</span>
                  </span>
                  {/* Category filter chips */}
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    {tierChips.map(chip => (
                      <button
                        key={chip.key}
                        onClick={() => setWatchTierFilter(chip.key)}
                        style={{
                          padding: '2px 8px', fontSize: '0.55rem', fontWeight: 700,
                          background: watchTierFilter === chip.key ? `${chip.color}22` : 'transparent',
                          color: watchTierFilter === chip.key ? chip.color : '#6e7681',
                          border: `1px solid ${watchTierFilter === chip.key ? chip.color : '#30363d'}`,
                          borderRadius: '12px', cursor: 'pointer',
                        }}
                      >
                        {chip.label}{chip.key !== 'all' && ` (${chip.count})`}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.5rem', color: '#484f58', fontStyle: 'italic', marginLeft: 'auto' }}>
                    🎯 highest win-probability first · edge is secondary
                  </span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '0.5rem',
                }}>
                  {watchListFiltered.map((rec) => {
                    const liveDaysToClose = liveDays(rec)
                    const recExt = rec as TradeRecommendation & { aiEdge?: 'strong' | 'user' | 'weak'; aiEdgeReason?: string; llmDirection?: string }
                    const edgePts = (rec.estimatedProbability - rec.odds) * 100  // signed edge
                    const edgeAbs = Math.abs(edgePts)
                    // Three-way direction: 'yes' if Opus's est > market by >=0.5pt,
                    // 'no' if est < market by >=0.5pt, 'none' for truly-no-edge
                    // picks. The 'none' case fixes the strict-> bug where
                    // est == market exactly resolved silently to 'No'.
                    const aiLean: 'yes' | 'no' | 'none' =
                      edgeAbs < 0.5 ? 'none' : edgePts > 0 ? 'yes' : 'no'

                    // CRITICAL FIX: for "Team A vs Team B" markets, generic
                    // YES/NO labels were meaningless ("does YES mean Spurs
                    // or Timberwolves?"). For multi-outcome markets where
                    // outcomes are real names (not literal Yes/No), surface
                    // the actual outcome name instead. The "yes side" maps
                    // to whatever rec.outcome represents (the side Opus's
                    // estimate refers to); "no side" is the OTHER outcome.
                    const outcomesArr = (rec.market.outcomes as string[] | undefined) || []
                    const isBinaryYesNo =
                      outcomesArr.length < 2 ||
                      (outcomesArr[0] === 'Yes' && outcomesArr[1] === 'No')
                    const yesSideName = isBinaryYesNo
                      ? 'YES'
                      : (rec.outcome || outcomesArr[0] || 'YES')
                    const noSideName = isBinaryYesNo
                      ? 'NO'
                      : (outcomesArr.find(o => o !== rec.outcome) || outcomesArr[1] || 'NO')

                    const opusFavorsYes = aiLean === 'yes'
                    const suggestedSide = aiLean === 'yes' ? yesSideName : aiLean === 'no' ? noSideName : ''
                    const suggestedPrice = aiLean === 'yes' ? rec.odds : aiLean === 'no' ? 1 - rec.odds : 0
                    const payoutMultiple = suggestedPrice > 0 ? 1 / suggestedPrice : 0
                    // Generate a one-line "verdict" — most actionable interpretation
                    let verdict = ''
                    let verdictColor = '#6e7681'
                    if (edgeAbs < 1) {
                      verdict = 'No edge — Opus agrees with market. Skip unless you have personal conviction.'
                    } else if (edgeAbs < 3) {
                      verdict = `Tiny ${edgePts >= 0 ? '+' : ''}${edgePts.toFixed(1)}pt edge → bet $1 ${suggestedSide} → win $${(payoutMultiple - 1).toFixed(2)} if right`
                      verdictColor = '#f0883e'
                    } else if (recExt.aiEdge === 'user') {
                      verdict = `${edgePts >= 0 ? '+' : ''}${edgePts.toFixed(1)}pt edge — ${recExt.aiEdge === 'user' ? '👤 your scene knowledge applies' : 'judgment call'}. Bet ${suggestedSide} for ${payoutMultiple.toFixed(1)}x payout.`
                      verdictColor = '#a371f7'
                    } else {
                      verdict = `${edgePts >= 0 ? '+' : ''}${edgePts.toFixed(1)}pt — Opus skipped (${recExt.llmDirection === 'skip' ? 'low conf' : 'tiny edge'}). Override if you disagree.`
                      verdictColor = '#a09060'
                    }
                    // Parameterized placement helper — accepts the side the
                    // user explicitly chose. Side is the literal outcome
                    // name (the team name for sports/esports markets, or
                    // "Yes"/"No" for binary markets) so server-side bet
                    // creation maps to the correct token.
                    const placeOnSide = async (side: string) => {
                      // The "yes side" is the rec.outcome (the side Opus's
                      // estimate refers to). Everything else is "no side".
                      const isYesSide = side === yesSideName
                      const sidePrice = isYesSide ? rec.odds : 1 - rec.odds
                      const sidePayout = sidePrice > 0 ? 1 / sidePrice : 0
                      const stake = window.prompt(
                        `Place a paper bet on this skipped pick?\n\n${rec.market.question.slice(0, 120)}\n\nSide: ${side} at ${(sidePrice * 100).toFixed(0)}% market price\nIf right: $1 → $${sidePayout.toFixed(2)}\nOpus skipped this (${recExt.llmDirection || 'unknown'} reason: ${rec.reasoning?.slice(0, 100) || 'no reasoning'})\n\nEnter stake amount in dollars:`,
                        '1.00',
                      )
                      if (!stake) return
                      const stakeNum = parseFloat(stake)
                      if (!isFinite(stakeNum) || stakeNum <= 0) {
                        alert('Invalid stake. Must be a positive number.')
                        return
                      }
                      const overrideRec = {
                        ...rec,
                        outcome: side,
                        odds: sidePrice,
                        marketImpliedProb: sidePrice,
                        estimatedProbability: isYesSide
                          ? rec.estimatedProbability
                          : 1 - rec.estimatedProbability,
                        kellyFraction: 0,
                      }
                      try {
                        const res = await fetch('/api/polymarket/place', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(overrideRec),
                        })
                        const json = await res.json()
                        if (json.success) {
                          loadPaperData()
                          alert(`Placed $${stakeNum.toFixed(2)} on ${side}. Override paper trade — Opus skipped but you took the bet.`)
                        } else {
                          alert(`Failed to place: ${json.error}`)
                        }
                      } catch (e) {
                        alert(`Network error: ${e}`)
                      }
                    }
                    return (
                      <div
                        key={`watch-${rec.market.id}`}
                        onClick={() => window.open(rec.market.url, '_blank', 'noopener,noreferrer')}
                        title='Click anywhere to open this market on Polymarket'
                        style={{
                          backgroundColor: '#0d1117',
                          border: '1px dashed #30363d',
                          borderRadius: '10px',
                          padding: '0.6rem 0.75rem',
                          color: '#8b949e',
                          display: 'flex', flexDirection: 'column', gap: '0.35rem',
                          fontSize: '0.65rem',
                          cursor: 'pointer',
                          transition: 'border-color 120ms ease, background-color 120ms ease',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.borderColor = '#58a6ff'
                          e.currentTarget.style.backgroundColor = '#0f1623'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.borderColor = '#30363d'
                          e.currentTarget.style.backgroundColor = '#0d1117'
                        }}
                      >
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}>
                          <span style={{
                            fontSize: '0.55rem',
                            color: '#f85149',
                            backgroundColor: 'rgba(248,81,73,0.12)',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            fontWeight: 600,
                          }}>
                            {recExt.llmDirection === 'skip' ? 'Low conf' : 'Skipped'}
                          </span>
                          {/* AI lean indicator — the single most important
                              answer the user wants when scanning a card:
                              "which side does the model think is undervalued?"
                              Was buried inside the verdict line; now a
                              prominent colored pill in the header row.
                              'none' shows a neutral pill so the user knows
                              there's no directional edge to chase. */}
                          {(() => {
                            // Label shows the actual outcome name (team name
                            // for sports/esports, "YES"/"NO" for binary
                            // markets). Resolves the user's complaint:
                            // "still confused yes or no here cause its like
                            // 2 teams team a vs team b".
                            const yesLabel = isBinaryYesNo ? 'YES' : yesSideName
                            const noLabel = isBinaryYesNo ? 'NO' : noSideName
                            const cfg = aiLean === 'yes'
                              ? { label: `⬆ ${yesLabel}`, color: '#3fb950', bg: 'rgba(63,185,80,0.18)', border: 'rgba(63,185,80,0.5)', title: `Opus leans ${yesLabel} — thinks ${yesLabel}'s probability is ${edgeAbs.toFixed(1)}pt higher than market price` }
                              : aiLean === 'no'
                                ? { label: `⬇ ${noLabel}`, color: '#f85149', bg: 'rgba(248,81,73,0.18)', border: 'rgba(248,81,73,0.5)', title: `Opus leans ${noLabel} — thinks ${yesLabel}'s probability is ${edgeAbs.toFixed(1)}pt lower than market price (i.e. ${noLabel} is undervalued)` }
                                : { label: '— NO LEAN', color: '#8b949e', bg: 'rgba(139,148,158,0.12)', border: 'rgba(139,148,158,0.35)', title: 'Opus agrees with the market — no directional edge in either direction. Take this only if you have personal conviction.' }
                            return (
                              <span
                                title={cfg.title}
                                style={{
                                  fontSize: '0.6rem', fontWeight: 800,
                                  color: cfg.color, backgroundColor: cfg.bg,
                                  border: `1px solid ${cfg.border}`,
                                  padding: '0.15rem 0.5rem', borderRadius: '4px',
                                  letterSpacing: '0.03em', cursor: 'help',
                                }}
                              >
                                {cfg.label}
                              </span>
                            )
                          })()}
                          {recExt.aiEdge && (() => {
                            const cfg = recExt.aiEdge === 'strong'
                              ? { label: '🤖 AI', color: '#3fb950', bg: 'rgba(63,185,80,0.12)' }
                              : recExt.aiEdge === 'user'
                                ? { label: '👤 You', color: '#a371f7', bg: 'rgba(163,113,247,0.12)' }
                                : { label: '⚠️', color: '#a09060', bg: 'rgba(160,144,96,0.12)' }
                            return (
                              <span
                                title={recExt.aiEdgeReason || ''}
                                style={{
                                  fontSize: '0.5rem', fontWeight: 700,
                                  color: cfg.color, backgroundColor: cfg.bg,
                                  padding: '0.1rem 0.4rem', borderRadius: '4px',
                                  letterSpacing: '0.02em', cursor: 'help',
                                }}
                              >
                                {cfg.label}
                              </span>
                            )
                          })()}
                          {/* WIN ODDS — the side price the user would be
                              betting at, framed as "how often this wins"
                              per the market's collective estimate. Primary
                              signal: a 70% win prob with a tiny edge beats
                              a 30% win prob with a huge fabricated edge.
                              Color-coded by hit-rate band so the eye lands
                              on high-probability picks first. */}
                          {(() => {
                            const sidePrice = aiLean === 'yes' ? rec.odds : aiLean === 'no' ? 1 - rec.odds : Math.max(rec.odds, 1 - rec.odds)
                            const winPct = sidePrice * 100
                            const cfg = winPct >= 70
                              ? { color: '#3fb950', bg: 'rgba(63,185,80,0.16)' }
                              : winPct >= 50
                                ? { color: '#79c0ff', bg: 'rgba(121,192,255,0.12)' }
                                : winPct >= 30
                                  ? { color: '#f0c000', bg: 'rgba(240,192,0,0.12)' }
                                  : { color: '#f0883e', bg: 'rgba(240,136,62,0.12)' }
                            return (
                              <span
                                title={`Probability of this bet winning per the market price (${winPct.toFixed(0)}%). The favorite-side price is what the world thinks — high win% = safe scalp, low win% = longshot.`}
                                style={{
                                  fontSize: '0.6rem', fontWeight: 800,
                                  color: cfg.color, backgroundColor: cfg.bg,
                                  padding: '0.15rem 0.5rem', borderRadius: '4px',
                                  cursor: 'help',
                                }}
                              >
                                🎯 wins ~{winPct.toFixed(0)}%
                              </span>
                            )
                          })()}
                          <span style={{
                            fontSize: '0.5rem', fontWeight: 700,
                            color: edgeAbs >= 3 ? '#a09060' : '#484f58',
                            backgroundColor: edgeAbs >= 3 ? 'rgba(160,144,96,0.08)' : 'transparent',
                            padding: '0.1rem 0.4rem', borderRadius: '3px',
                          }}
                          title={`Edge = Opus's estimate vs market. Bigger ≠ better — high edges with low confidence are often fabricated. Use as a secondary signal after win probability.`}>
                            edge {edgePts >= 0 ? '+' : ''}{edgePts.toFixed(1)}pt
                          </span>
                          <span style={{ fontSize: '0.55rem', color: '#6e7681', marginLeft: 'auto' }}>
                            {liveDaysToClose <= 1 ? `${Math.max(1, Math.round(liveDaysToClose * 24))}h` : `${liveDaysToClose.toFixed(1)}d`}
                          </span>
                        </div>
                        {/* Title is now a clickable link to Polymarket — was
                            previously plain text. Most natural place to click
                            for "open market on Polymarket". External link icon
                            on hover signals the affordance. */}
                        <a
                          href={rec.market.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          onClick={e => e.stopPropagation()}
                          style={{
                            color: '#c9d1d9', fontSize: '0.75rem', lineHeight: 1.3,
                            textDecoration: 'none',
                            display: 'inline-block',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#58a6ff'; e.currentTarget.style.textDecoration = 'underline' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#c9d1d9'; e.currentTarget.style.textDecoration = 'none' }}
                          title='Open this market on Polymarket'
                        >
                          {rec.market.question} <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>↗</span>
                        </a>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between',
                          fontSize: '0.55rem', color: '#6e7681',
                        }}>
                          <span title={`Market's implied probability that ${yesSideName} wins / resolves YES`}>
                            Mkt {yesSideName}: {(rec.odds * 100).toFixed(0)}%
                          </span>
                          <span title={`Opus's estimate of the probability that ${yesSideName} wins / resolves YES`}>
                            Opus {yesSideName}: {(rec.estimatedProbability * 100).toFixed(0)}%
                          </span>
                          <span style={{ color: '#f0c000' }} title={`If you bet $1 on ${suggestedSide || yesSideName} and win, you get this much back`}>
                            Payout: {payoutMultiple.toFixed(1)}x
                          </span>
                        </div>
                        {/* Verdict line — actionable interpretation */}
                        <div style={{
                          fontSize: '0.6rem', color: verdictColor,
                          lineHeight: 1.3, fontWeight: 600,
                          padding: '0.3rem 0', borderTop: '1px solid #21262d', marginTop: '0.2rem',
                        }}>
                          {verdict}
                        </div>
                        {rec.reasoning && (
                          <div style={{
                            fontSize: '0.55rem', color: '#6e7681',
                            fontStyle: 'italic', lineHeight: 1.3,
                          }}>
                            {rec.reasoning.length > 110 ? rec.reasoning.substring(0, 110) + '…' : rec.reasoning}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '6px', marginTop: '0.3rem' }}>
                          <a
                            href={rec.market.url}
                            target='_blank'
                            rel='noopener noreferrer'
                            onClick={e => e.stopPropagation()}
                            style={{
                              flex: 1, textAlign: 'center',
                              fontSize: '0.55rem', padding: '4px 8px',
                              background: 'transparent', border: '1px solid #30363d',
                              borderRadius: '4px', color: '#8b949e',
                              textDecoration: 'none',
                            }}
                          >
                            View on Polymarket ↗
                          </a>
                          {aiLean === 'none' ? (
                            // No directional lean from Opus — show BOTH sides
                            // so the user picks rather than us guessing.
                            // Was a real bug: zero-edge cards previously
                            // surfaced "Place No anyway" because the underlying
                            // strict > comparison defaulted to No.
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); placeOnSide(yesSideName) }}
                                title={`Place on ${yesSideName} — no Opus lean either way, so this is your judgment call`}
                                style={{
                                  flex: 1, fontSize: '0.55rem', padding: '4px 8px',
                                  background: 'rgba(63,185,80,0.08)',
                                  border: '1px solid rgba(63,185,80,0.35)',
                                  borderRadius: '4px', color: '#3fb950',
                                  cursor: 'pointer', fontWeight: 700,
                                }}
                              >
                                ⬆ Bet {yesSideName}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); placeOnSide(noSideName) }}
                                title={`Place on ${noSideName} — no Opus lean either way, so this is your judgment call`}
                                style={{
                                  flex: 1, fontSize: '0.55rem', padding: '4px 8px',
                                  background: 'rgba(248,81,73,0.08)',
                                  border: '1px solid rgba(248,81,73,0.35)',
                                  borderRadius: '4px', color: '#f85149',
                                  cursor: 'pointer', fontWeight: 700,
                                }}
                              >
                                ⬇ Bet {noSideName}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={e => { e.stopPropagation(); placeOnSide(suggestedSide) }}
                              title={`Opus leans ${suggestedSide} (${edgeAbs.toFixed(1)}pt edge). Click to place a paper bet on that side.`}
                              style={{
                                flex: 1, fontSize: '0.55rem', padding: '4px 8px',
                                background: aiLean === 'yes' ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
                                border: `1px solid ${aiLean === 'yes' ? 'rgba(63,185,80,0.45)' : 'rgba(248,81,73,0.45)'}`,
                                borderRadius: '4px',
                                color: aiLean === 'yes' ? '#3fb950' : '#f85149',
                                cursor: 'pointer', fontWeight: 700,
                              }}
                            >
                              {aiLean === 'yes' ? '⬆' : '⬇'} Bet {suggestedSide} anyway
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{
                  marginTop: '0.5rem', fontSize: '0.6rem',
                  color: '#6e7681', fontStyle: 'italic',
                }}>
                  These markets close soon but Opus flagged low confidence or tiny edge. If you have your own read (e.g. you follow the team / event), use your judgment.
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ── Paper Trades Tab ── */}
      {activeTab === 'paper-trades' && (
        <div>
          {/* Import button + Check Resolutions trigger — both ALWAYS visible
              at top of Paper Trades tab regardless of position count.
              "Check Resolutions" calls /api/polymarket/resolve-only on
              demand instead of waiting for the 2h cron. */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <PortfolioImportFromAddress onImported={loadPaperData} />
            <PortfolioImport onImported={loadPaperData} />
            <button
              onClick={async () => {
                const ok = window.confirm(
                  'Check Polymarket for any resolved markets and update matching open positions?\n\nThis polls Polymarket\'s public API (free, no LLM) and resolves any of your positions whose underlying market has closed. Same as the 2h cron — just on demand.'
                )
                if (!ok) return
                try {
                  const res = await fetch('/api/polymarket/resolve-only', { cache: 'no-store' })
                  const json = await res.json()
                  if (json.success) {
                    loadPaperData()
                    window.alert(
                      `Resolution check complete.\n\nResolved: ${json.resolved}\nErrors: ${(json.errors || []).length}\nBankroll now: $${json.portfolio?.bankroll?.toFixed(2) ?? '?'}`
                    )
                  } else {
                    window.alert(`Failed: ${json.error || 'unknown'}`)
                  }
                } catch (e) {
                  window.alert(`Network error: ${e}`)
                }
              }}
              title='Manually trigger resolution check — polls Polymarket for any closed markets and resolves matching open positions. No LLM cost. Same as the 2h cron.'
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'rgba(63,185,80,0.10)',
                border: '1px solid rgba(63,185,80,0.35)',
                borderRadius: '8px', padding: '0.5rem 0.85rem',
                fontSize: '0.65rem', fontWeight: 700, color: '#3fb950',
                cursor: 'pointer',
                height: 'fit-content',
              }}
            >
              <RefreshCw size={12} /> Check resolutions now
            </button>
          </div>

          {paperLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681' }}>
              <RefreshCw style={{ width: 16, height: 16, marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} /> Loading...
            </div>
          ) : paperPositions.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', gap: '0.5rem' }}>
              <Target style={{ width: 32, height: 32, opacity: 0.5 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No paper trades yet</div>
              <div style={{ fontSize: '0.7rem' }}>Place a trade from the Opportunities tab, or use <strong>📷 Import portfolio from screenshot</strong> above to mirror your real Polymarket positions.</div>
            </div>
          ) : (
            <>
              {/* Portfolio summary + edit bankroll button */}
              {paperPortfolio && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    {[
                      { label: 'Bankroll', value: `$${paperPortfolio.bankroll.toFixed(2)}`, sub: `Started: $${paperPortfolio.startingBankroll}`, color: '#3fb950' },
                      { label: 'Total P&L', value: paperPortfolio.totalPnl >= 0 ? `+$${paperPortfolio.totalPnl.toFixed(2)}` : `-$${Math.abs(paperPortfolio.totalPnl).toFixed(2)}`, sub: `${paperPortfolio.totalTrades} trades`, color: paperPortfolio.totalPnl >= 0 ? '#3fb950' : '#f85149' },
                      { label: 'Open Positions', value: `${openPositions.length}`, sub: `Max: ${autoConfig?.maxOpenPositions || 5}`, color: '#58a6ff' },
                      { label: 'Kelly Mode', value: autoConfig?.kellyMode === 'quarter' ? '¼ Kelly' : autoConfig?.kellyMode === 'half' ? '½ Kelly' : 'Full', sub: `Max bet: ${autoConfig?.maxBetSizePercent || 10}%`, color: '#8b5cf6' },
                    ].map((stat, i) => (
                      <div key={i} style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                        <div style={{ fontSize: '0.6rem', color: '#6e7681' }}>{stat.label}</div>
                        <div style={{ fontSize: '0.55rem', color: '#484f58' }}>{stat.sub}</div>
                      </div>
                    ))}
                  </div>
                  {/* Edit-bankroll quick action — for typo'd starting balance or
                      reconciling against external truth. Asks for both the new
                      value AND whether to also reset starting (so target trajectory
                      recomputes). */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button
                      onClick={async () => {
                        const newVal = window.prompt(
                          `Edit bankroll. Current: $${paperPortfolio.bankroll.toFixed(2)} (started: $${paperPortfolio.startingBankroll}).\n\nEnter new bankroll value:`,
                          paperPortfolio.bankroll.toFixed(2),
                        )
                        if (newVal === null) return
                        const parsed = parseFloat(newVal)
                        if (!isFinite(parsed) || parsed < 0) {
                          alert('Invalid value — must be a non-negative number')
                          return
                        }
                        const alsoSetStarting = window.confirm(
                          `Set new bankroll to $${parsed.toFixed(2)}.\n\nAlso reset STARTING bankroll to this value?\n\nClick OK to also reset starting (recomputes the $X → $${(parsed * 25).toFixed(0)} trajectory).\nClick Cancel to keep starting as-is (just adjust current bankroll).`,
                        )
                        try {
                          const res = await fetch('/api/polymarket/positions', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ bankroll: parsed, alsoSetStarting }),
                          })
                          const json = await res.json()
                          if (json.success) {
                            loadPaperData()
                            alert(`Bankroll updated to $${parsed.toFixed(2)}${alsoSetStarting ? ' (starting reset too)' : ''}`)
                          } else {
                            alert(`Failed: ${json.error}`)
                          }
                        } catch (e) {
                          alert(`Network error: ${e}`)
                        }
                      }}
                      style={{
                        fontSize: '0.6rem', padding: '0.35rem 0.7rem',
                        background: 'transparent', border: '1px solid #30363d',
                        borderRadius: '6px', color: '#8b949e', cursor: 'pointer',
                      }}
                    >
                      ✎ Edit bankroll
                    </button>
                  </div>
                </>
              )}

              {/* Filter chips — narrow the table to open / resolved / all */}
              {(() => {
                const openCount = paperPositions.filter(p => p.status === 'open').length
                const resolvedCount = paperPositions.filter(p => p.status !== 'open').length
                const chips: Array<{ key: 'open' | 'resolved' | 'all'; label: string; count: number; color: string }> = [
                  { key: 'open', label: 'Open', count: openCount, color: '#3fb950' },
                  { key: 'resolved', label: 'Resolved', count: resolvedCount, color: '#a371f7' },
                  { key: 'all', label: 'All', count: paperPositions.length, color: '#8b949e' },
                ]
                return (
                  <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.55rem', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '4px' }}>
                      Show:
                    </span>
                    {chips.map(c => (
                      <button
                        key={c.key}
                        onClick={() => setPaperFilter(c.key)}
                        style={{
                          fontSize: '0.6rem', fontWeight: 700,
                          padding: '0.3rem 0.6rem', borderRadius: '5px',
                          background: paperFilter === c.key ? `${c.color}20` : 'transparent',
                          border: `1px solid ${paperFilter === c.key ? c.color : '#30363d'}`,
                          color: paperFilter === c.key ? c.color : '#8b949e',
                          cursor: 'pointer',
                        }}
                      >
                        {c.label} ({c.count})
                      </button>
                    ))}
                    <span style={{ fontSize: '0.5rem', color: '#484f58', fontStyle: 'italic', marginLeft: 'auto' }}>
                      click any column header to sort · arrow shows direction
                    </span>
                  </div>
                )
              })()}

              {/* Positions table */}
              <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #21262d' }}>
                      {(() => {
                        // Click-to-sort column headers. Same key clicked twice
                        // flips direction; new key resets to descending.
                        type Col = { key: typeof paperSortKey | null; label: string }
                        const cols: Col[] = [
                          { key: null, label: 'Market' },           // not meaningful to sort by question text
                          { key: 'outcome', label: 'Outcome' },
                          { key: 'status', label: 'Status' },
                          { key: 'cost', label: 'Cost' },
                          { key: 'pnl', label: 'P&L' },
                          { key: 'daysHeld', label: 'Hold Time' },
                          { key: 'category', label: 'Category' },
                          { key: 'safety', label: 'Safety' },
                          { key: null, label: '' },                  // actions column
                        ]
                        return cols.map((c, i) => {
                          const active = c.key && paperSortKey === c.key
                          const arrow = active ? (paperSortDir === 'asc' ? ' ▲' : ' ▼') : ''
                          return (
                            <th
                              key={i}
                              onClick={c.key ? () => {
                                if (paperSortKey === c.key) {
                                  setPaperSortDir(d => d === 'asc' ? 'desc' : 'asc')
                                } else {
                                  setPaperSortKey(c.key as typeof paperSortKey)
                                  setPaperSortDir('desc')
                                }
                              } : undefined}
                              style={{
                                padding: '8px 12px', textAlign: 'left',
                                fontSize: '0.6rem', fontWeight: 700,
                                color: active ? '#a5d6ff' : '#6e7681',
                                textTransform: 'uppercase',
                                cursor: c.key ? 'pointer' : 'default',
                                userSelect: 'none',
                              }}
                              title={c.key ? `Sort by ${c.label.toLowerCase()}` : undefined}
                            >
                              {c.label}{arrow}
                            </th>
                          )
                        })
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Apply filter chip first, then sort by current key/direction
                      const filtered = paperFilter === 'open'
                        ? paperPositions.filter(p => p.status === 'open')
                        : paperFilter === 'resolved'
                          ? paperPositions.filter(p => p.status !== 'open')
                          : paperPositions
                      const sign = paperSortDir === 'asc' ? 1 : -1
                      const valueOf = (p: PolymarketPosition): number | string => {
                        switch (paperSortKey) {
                          case 'placedAt':  return p.placedAt
                          case 'cost':      return p.cost
                          case 'pnl':       return p.pnl ?? -Infinity   // open positions sort last in desc
                          case 'daysHeld':  return Math.floor((Date.now() - p.placedAt) / 86400_000)
                          case 'safety':    return p.safetyScore
                          case 'status':    return p.status    // string ordering: lost < open < won
                          case 'category':  return p.category || ''
                          case 'outcome':   return p.outcome || ''
                          default:          return p.placedAt
                        }
                      }
                      const sorted = [...filtered].sort((a, b) => {
                        const va = valueOf(a)
                        const vb = valueOf(b)
                        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign
                        return String(va).localeCompare(String(vb)) * sign
                      })
                      return sorted
                    })().map(pos => {
                      const daysHeld = Math.floor((Date.now() - pos.placedAt) / (1000 * 60 * 60 * 24))
                      const cancelPosition = async () => {
                        // Confirm before refunding — prevents fat-finger mistakes.
                        const ok = window.confirm(
                          `Cancel this paper position?\n\n${pos.question.substring(0, 100)}\n\nStake: $${pos.cost.toFixed(2)} on ${pos.outcome}\nThis will REFUND $${pos.cost.toFixed(2)} to your bankroll and remove the position entirely (no win/loss recorded).\n\nUse this only for accidental placements — resolved positions cannot be canceled.`,
                        )
                        if (!ok) return
                        try {
                          const res = await fetch(`/api/polymarket/positions?id=${encodeURIComponent(pos.id)}`, {
                            method: 'DELETE',
                          })
                          const json = await res.json()
                          if (json.success) {
                            loadPaperData()
                          } else {
                            alert(`Failed to cancel: ${json.error}`)
                          }
                        } catch (e) {
                          alert(`Network error: ${e}`)
                        }
                      }
                      const manualResolve = async (resolution: 'yes' | 'no' | 'invalid') => {
                        // Show context-aware confirmation showing the user
                        // exactly what won/lost outcome they're locking in.
                        const wouldWin = (resolution === 'yes' && pos.outcomeIndex === 0) ||
                                          (resolution === 'no' && pos.outcomeIndex === 1)
                        const isInvalid = resolution === 'invalid'
                        const verdict = isInvalid
                          ? 'VOID (refund stake, no PnL)'
                          : wouldWin
                            ? `WIN — bankroll +$${pos.potentialPayout.toFixed(2)} (PnL +$${(pos.potentialPayout - pos.cost).toFixed(2)})`
                            : `LOSS — bankroll −$${pos.cost.toFixed(2)} (already deducted at placement, so net change $0)`
                        const ok = window.confirm(
                          `Manually mark this position resolved?\n\n${pos.question.substring(0, 100)}\nYour bet: ${pos.outcome}\nMarket resolution: ${resolution.toUpperCase()}\n\nResult: ${verdict}\n\nThis updates bankroll, bankrollHistory, and Performance tab analytics. Cannot be undone (cancel is for OPEN positions only).`,
                        )
                        if (!ok) return
                        try {
                          const res = await fetch('/api/polymarket/positions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: pos.id, resolution }),
                          })
                          const json = await res.json()
                          if (json.success) {
                            loadPaperData()
                          } else {
                            alert(`Failed to resolve: ${json.error}`)
                          }
                        } catch (e) {
                          alert(`Network error: ${e}`)
                        }
                      }
                      return (
                        <tr key={pos.id} style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '8px 12px', maxWidth: '200px' }}>
                            <a href={pos.url} target='_blank' rel='noopener noreferrer' style={{ fontSize: '0.65rem', color: '#e6edf3', textDecoration: 'none' }}>
                              {pos.question.length > 60 ? pos.question.substring(0, 60) + '...' : pos.question}
                            </a>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#8b949e', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{pos.outcome}</span>
                            {(pos as PolymarketPosition & { source?: string }).source === 'imported' && (
                              <span
                                title='Imported from Polymarket screenshot — your real trade, mirrored here for tracking'
                                style={{
                                  marginLeft: '6px', fontSize: '0.5rem', fontWeight: 700,
                                  color: '#8ba3ff', backgroundColor: 'rgba(88,101,242,0.1)',
                                  padding: '2px 5px', borderRadius: '3px',
                                  cursor: 'help',
                                }}
                              >
                                📷 Real
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px' }}><StatusBadge status={pos.status} /></td>
                          <td style={{ padding: '8px 12px', fontSize: '0.65rem', color: '#e6edf3' }}>${pos.cost.toFixed(2)}</td>
                          <td
                            style={{ padding: '8px 12px', fontSize: '0.65rem', fontWeight: 600 }}
                            title={pos.status === 'open' ? 'Unrealized PnL — current market price vs your entry. Updates on every sync.' : 'Realized PnL — locked in at resolution.'}
                          >
                            {(() => {
                              // For OPEN positions, prefer unrealizedPnl (live
                              // mark-to-market from Polymarket). For resolved,
                              // use realized pnl. Shows "—" only when neither
                              // is available (legacy app-placed paper position
                              // without a live mark).
                              const effective = pos.status === 'open'
                                ? (typeof (pos as PolymarketPosition & { unrealizedPnl?: number }).unrealizedPnl === 'number'
                                    ? (pos as PolymarketPosition & { unrealizedPnl?: number }).unrealizedPnl
                                    : pos.pnl)
                                : pos.pnl
                              if (typeof effective !== 'number') return <span style={{ color: '#6e7681' }}>—</span>
                              const sign = effective >= 0 ? '+' : '-'
                              const abs = Math.abs(effective).toFixed(2)
                              const colorVal = effective >= 0 ? '#3fb950' : '#f85149'
                              const liveTag = pos.status === 'open' && typeof (pos as PolymarketPosition & { unrealizedPnl?: number }).unrealizedPnl === 'number'
                              return (
                                <span style={{ color: colorVal }}>
                                  {sign}${abs}
                                  {liveTag && <span style={{ fontSize: '0.5rem', color: '#6e7681', marginLeft: '4px', fontWeight: 500 }}>live</span>}
                                </span>
                              )
                            })()}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '0.65rem', color: '#6e7681' }}>{daysHeld}d</td>
                          <td style={{ padding: '8px 12px' }}><CategoryBadge cat={pos.category} /></td>
                          <td style={{ padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: pos.safetyScore >= 70 ? '#3fb950' : pos.safetyScore >= 55 ? '#f0883e' : '#8b949e' }}>{pos.safetyScore}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            {pos.status === 'open' ? (
                              <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button
                                  onClick={() => manualResolve('yes')}
                                  title='Mark this market as resolved YES. Updates bankroll based on whether your bet matches.'
                                  style={{
                                    fontSize: '0.55rem', padding: '0.2rem 0.45rem',
                                    background: 'rgba(63,185,80,0.08)', border: '1px solid rgba(63,185,80,0.4)',
                                    borderRadius: '4px', color: '#3fb950', cursor: 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  ✓ Yes
                                </button>
                                <button
                                  onClick={() => manualResolve('no')}
                                  title='Mark this market as resolved NO. Updates bankroll based on whether your bet matches.'
                                  style={{
                                    fontSize: '0.55rem', padding: '0.2rem 0.45rem',
                                    background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.4)',
                                    borderRadius: '4px', color: '#f85149', cursor: 'pointer',
                                    fontWeight: 700,
                                  }}
                                >
                                  ✗ No
                                </button>
                                <button
                                  onClick={() => manualResolve('invalid')}
                                  title='Mark this market as void/invalid. Refunds the stake, records no PnL.'
                                  style={{
                                    fontSize: '0.55rem', padding: '0.2rem 0.45rem',
                                    background: 'transparent', border: '1px solid #6e7681',
                                    borderRadius: '4px', color: '#8b949e', cursor: 'pointer',
                                  }}
                                >
                                  Void
                                </button>
                                <button
                                  onClick={cancelPosition}
                                  title='Refund stake and remove this position entirely. Use for accidental placements.'
                                  style={{
                                    fontSize: '0.55rem', padding: '0.2rem 0.45rem',
                                    background: 'transparent', border: '1px solid #f85149aa',
                                    borderRadius: '4px', color: '#f85149', cursor: 'pointer',
                                  }}
                                >
                                  ✕ Cancel
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.55rem', color: '#484f58' }}>
                                  resolved ({pos.resolution || '?'})
                                </span>
                                {/* Log a lesson — feeds into future Opus prompts */}
                                {pos.status === 'lost' && (
                                  <button
                                    onClick={async () => {
                                      const takeaway = window.prompt(
                                        `Log a one-sentence takeaway for future picks.\n\nMarket: ${pos.question.slice(0, 100)}\nOpus thought: ${pos.outcome} side, ${(pos.estimatedProbability * 100).toFixed(0)}% real prob\nActually resolved: ${pos.resolution}\n\nWhat did Opus get wrong? (Will be injected into future screening prompts as context.)`,
                                        'Regional politics ≠ national polling momentum',
                                      )
                                      if (!takeaway || takeaway.trim().length < 5) return
                                      try {
                                        const res = await fetch('/api/lessons', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            question: pos.question,
                                            opusPrediction: `${pos.outcome} side @ ${(pos.estimatedProbability * 100).toFixed(0)}% real prob`,
                                            actualOutcome: `Market resolved ${pos.resolution}`,
                                            takeaway: takeaway.trim(),
                                            positionId: pos.id,
                                          }),
                                        })
                                        const json = await res.json()
                                        if (json.success) {
                                          alert(`Logged. Future screening prompts will include this takeaway as context.`)
                                        } else {
                                          alert(`Failed: ${json.error}`)
                                        }
                                      } catch (e) {
                                        alert(`Network error: ${e}`)
                                      }
                                    }}
                                    title='Log a one-sentence takeaway from this loss. Future Opus prompts will see it and pattern-match.'
                                    style={{
                                      fontSize: '0.5rem', padding: '0.15rem 0.4rem',
                                      background: 'transparent', border: '1px solid #f0c00055',
                                      borderRadius: '3px', color: '#f0c000', cursor: 'pointer',
                                    }}
                                  >
                                    💡 Log lesson
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Performance Tab ── */}
      {activeTab === 'performance' && (
        <div>
          {paperLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681' }}>
              <RefreshCw style={{ width: 16, height: 16, marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} /> Loading...
            </div>
          ) : !analytics || analytics.totalTrades === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', gap: '0.5rem' }}>
              <TrendingUp style={{ width: 32, height: 32, opacity: 0.5 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No performance data yet</div>
              <div style={{ fontSize: '0.7rem' }}>Place paper trades and wait for them to resolve to see analytics</div>
            </div>
          ) : (
            <>
              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                {[
                  { label: 'Win Rate', value: `${analytics.winRate.toFixed(1)}%`, sub: `${analytics.wonTrades}W / ${analytics.lostTrades}L`, color: '#3fb950' },
                  { label: 'Total P&L', value: analytics.totalPnl >= 0 ? `+$${analytics.totalPnl.toFixed(2)}` : `-$${Math.abs(analytics.totalPnl).toFixed(2)}`, sub: `ROI: ${analytics.roi.toFixed(1)}%`, color: analytics.totalPnl >= 0 ? '#3fb950' : '#f85149' },
                  { label: 'EV Accuracy', value: `${analytics.evAccuracy.toFixed(1)}%`, sub: `${analytics.evAccuracyTrades} trades analyzed`, color: '#8b5cf6' },
                  { label: 'Avg Hold Time', value: analytics.avgHoldTimeDays > 0 ? `${analytics.avgHoldTimeDays.toFixed(1)}d` : 'N/A', sub: `Total: ${analytics.totalTrades} trades`, color: '#58a6ff' },
                ].map((stat, i) => (
                  <div key={i} style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '0.75rem 1rem' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                    <div style={{ fontSize: '0.6rem', color: '#6e7681' }}>{stat.label}</div>
                    <div style={{ fontSize: '0.55rem', color: '#484f58' }}>{stat.sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                {/* Profit by Category */}
                <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 0.75rem 0' }}>Profit by Category</h4>
                  {Object.entries(analytics.profitByCategory).map(([cat, pnl]) => (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <CategoryBadge cat={cat} />
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: pnl >= 0 ? '#3fb950' : '#f85149' }}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Best / Worst Trades */}
                <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Trophy size={14} color='#f0883e' /> Best Trade
                  </h4>
                  {analytics.bestTrade ? (
                    <div>
                      <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: '0.25rem', lineHeight: 1.3 }}>
                        {analytics.bestTrade.question.length > 80
                          ? analytics.bestTrade.question.substring(0, 80) + '...'
                          : analytics.bestTrade.question}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3fb950' }}>
                        +${analytics.bestTrade.pnl?.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.65rem', color: '#6e7681' }}>No resolved trades yet</div>
                  )}

                  <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: '0.75rem 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <TrendingDown size={14} color='#f85149' /> Worst Trade
                  </h4>
                  {analytics.worstTrade && analytics.worstTrade.pnl !== undefined && analytics.worstTrade.pnl < 0 ? (
                    <div>
                      <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: '0.25rem', lineHeight: 1.3 }}>
                        {analytics.worstTrade.question.length > 80
                          ? analytics.worstTrade.question.substring(0, 80) + '...'
                          : analytics.worstTrade.question}
                      </div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f85149' }}>
                        ${analytics.worstTrade.pnl.toFixed(2)}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.65rem', color: '#6e7681' }}>No losing trades yet</div>
                  )}
                </div>
              </div>

              {/* ── Daily Progress Journal — track $4 → $100 over time ──
                  Shows day-over-day P&L bars + target trajectory overlay so
                  the user immediately sees "on track / behind / ahead". */}
              {analytics.dailyPerformance && analytics.dailyPerformance.length >= 1 && (() => {
                const days = analytics.dailyPerformance!
                const target = analytics.targetBankrollToday ?? 100
                const currentBankroll = days[days.length - 1]?.endBankroll ?? paperPortfolio?.bankroll ?? 4
                const lag = currentBankroll - target
                const lagPct = target > 0 ? (lag / target) * 100 : 0
                const trackLabel = lag >= 0 ? 'AHEAD' : 'BEHIND'
                const trackColor = lag >= 0 ? '#3fb950' : '#f85149'

                // Compute consecutive winning/losing days for streak indicator
                let streak = 0
                let streakKind: 'win' | 'loss' | 'none' = 'none'
                for (let i = days.length - 1; i >= 0; i--) {
                  const d = days[i]
                  if (d.netPnl > 0) {
                    if (streakKind === 'loss') break
                    streakKind = 'win'; streak++
                  } else if (d.netPnl < 0) {
                    if (streakKind === 'win') break
                    streakKind = 'loss'; streak++
                  } else if (streakKind === 'none' && d.trades.resolved === 0) {
                    continue  // skip no-activity days
                  } else break
                }

                // Bars: relative to max abs P&L for the period
                const maxAbsPnl = Math.max(...days.map(d => Math.abs(d.netPnl)), 0.5)

                return (
                  <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>
                        📅 Daily Progress · {days.length} day{days.length === 1 ? '' : 's'} tracked
                      </h4>
                      <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.55rem' }}>
                        <span>
                          Today: <span style={{ color: '#e6edf3', fontWeight: 700 }}>${currentBankroll.toFixed(2)}</span>
                        </span>
                        <span>
                          Target: <span style={{ color: '#8b949e' }}>${target.toFixed(2)}</span>
                        </span>
                        <span style={{ color: trackColor, fontWeight: 700 }}>
                          {trackLabel} {lag >= 0 ? '+' : ''}{lagPct.toFixed(0)}%
                        </span>
                        {streak >= 2 && streakKind !== 'none' && (
                          <span style={{ color: streakKind === 'win' ? '#3fb950' : '#f85149', fontWeight: 700 }}>
                            {streakKind === 'win' ? '🔥' : '🥶'} {streak}-day {streakKind} streak
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Day-over-day P&L bars (positive = green up; negative = red down) */}
                    <div style={{ height: '70px', display: 'flex', alignItems: 'center', gap: '2px', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', backgroundColor: '#30363d' }} />
                      {days.map((d, i) => {
                        const pnl = d.netPnl
                        const heightPct = (Math.abs(pnl) / maxAbsPnl) * 50
                        const color = pnl > 0 ? '#3fb950' : pnl < 0 ? '#f85149' : '#30363d'
                        return (
                          <div
                            key={d.date}
                            title={`${d.date}: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${d.trades.wins}W/${d.trades.losses}L of ${d.trades.resolved} resolved, ${d.trades.placed} placed) · end $${d.endBankroll.toFixed(2)} vs target $${d.targetBankroll.toFixed(2)}`}
                            style={{
                              flex: 1,
                              height: `${Math.max(2, heightPct)}%`,
                              backgroundColor: color,
                              alignSelf: pnl >= 0 ? 'flex-end' : 'flex-start',
                              marginTop: pnl >= 0 ? `${50 - Math.max(2, heightPct)}%` : '50%',
                              borderRadius: pnl >= 0 ? '2px 2px 0 0' : '0 0 2px 2px',
                              cursor: 'help',
                              opacity: 0.6 + (i / days.length) * 0.4,
                            }}
                          />
                        )
                      })}
                    </div>

                    {/* Per-day labels (only first / last / today for compactness) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.5rem', color: '#484f58' }}>
                      <span>{days[0].date}</span>
                      {days.length > 4 && (
                        <span>{days[Math.floor(days.length / 2)].date}</span>
                      )}
                      <span>{days[days.length - 1].date}</span>
                    </div>

                    {/* Today's snapshot detail (most recent entry) */}
                    {days[days.length - 1] && (() => {
                      const t = days[days.length - 1]
                      return (
                        <div style={{
                          marginTop: '0.6rem',
                          padding: '0.5rem',
                          backgroundColor: '#0d1117',
                          borderRadius: '6px',
                          fontSize: '0.55rem',
                          color: '#8b949e',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                          gap: '0.5rem',
                        }}>
                          <span>📊 Today ({t.date})</span>
                          <span>Placed: {t.trades.placed}</span>
                          <span>Resolved: {t.trades.resolved}</span>
                          <span style={{ color: t.netPnl >= 0 ? '#3fb950' : '#f85149' }}>
                            P&L: {t.netPnl >= 0 ? '+' : ''}${t.netPnl.toFixed(2)}
                          </span>
                          {t.hitRateByEdge.strong !== null && (
                            <span style={{ color: '#3fb950' }}>🤖 {t.hitRateByEdge.strong.toFixed(0)}%</span>
                          )}
                          {t.hitRateByEdge.user !== null && (
                            <span style={{ color: '#a371f7' }}>👤 {t.hitRateByEdge.user.toFixed(0)}%</span>
                          )}
                          {t.hitRateByEdge.weak !== null && (
                            <span style={{ color: '#a09060' }}>⚠️ {t.hitRateByEdge.weak.toFixed(0)}%</span>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })()}

              {/* ── Compounding Curve (live, includes mid-day placement events) ──
                  Different from Equity Curve below: equityCurve is daily
                  resolution-only snapshots; this is every bankroll change
                  including placement (cost outflow) so the user sees the full
                  $4 → $X journey, including capital tied up vs released. */}
              {analytics.bankrollHistory && analytics.bankrollHistory.length > 1 && (() => {
                const hist = analytics.bankrollHistory
                const min = Math.min(...hist.map(p => p.bankroll))
                const max = Math.max(...hist.map(p => p.bankroll))
                const range = max - min || 1
                const first = hist[0]
                const last = hist[hist.length - 1]
                const totalGrowthPct = first.bankroll > 0 ? ((last.bankroll - first.bankroll) / first.bankroll) * 100 : 0
                const days = (last.ts - first.ts) / (1000 * 60 * 60 * 24)
                const dailyGrowth = days > 0.5 ? Math.pow(1 + totalGrowthPct / 100, 1 / days) - 1 : 0
                return (
                  <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                      <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>💰 Compounding Curve</h4>
                      <span style={{ fontSize: '0.55rem', color: totalGrowthPct >= 0 ? '#3fb950' : '#f85149', fontWeight: 700 }}>
                        ${first.bankroll.toFixed(2)} → ${last.bankroll.toFixed(2)} ({totalGrowthPct >= 0 ? '+' : ''}{totalGrowthPct.toFixed(1)}% / {(dailyGrowth * 100).toFixed(2)}%/day)
                      </span>
                    </div>
                    <div style={{ height: '60px', display: 'flex', alignItems: 'flex-end', gap: '1px' }}>
                      {hist.map((p, i) => {
                        const height = ((p.bankroll - min) / range) * 100
                        const color = p.trigger === 'won' ? '#3fb950'
                          : p.trigger === 'lost' ? '#f85149'
                          : p.trigger === 'placed' ? '#58a6ff'
                          : '#8b949e'
                        return (
                          <div
                            key={i}
                            title={`${new Date(p.ts).toLocaleDateString()} ${p.trigger}: $${p.bankroll.toFixed(2)}`}
                            style={{
                              flex: 1, height: `${Math.max(4, height)}%`,
                              backgroundColor: color,
                              borderRadius: '2px 2px 0 0',
                              opacity: 0.7 + (i / hist.length) * 0.3,
                            }}
                          />
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem', fontSize: '0.55rem', color: '#484f58' }}>
                      <span>start</span>
                      <span>now ({hist.length} events)</span>
                    </div>
                  </div>
                )
              })()}

              {/* Equity Curve */}
              {analytics.equityCurve.length > 1 && (
                <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem' }}>
                  <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 0.75rem 0' }}>Equity Curve</h4>
                  <div style={{ height: '80px', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                    {analytics.equityCurve.map((point, i) => {
                      const min = Math.min(...analytics.equityCurve.map(p => p.value))
                      const max = Math.max(...analytics.equityCurve.map(p => p.value))
                      const range = max - min || 1
                      const height = ((point.value - min) / range) * 100
                      return (
                        <div key={i} title={`${point.date}: $${point.value.toFixed(2)}`} style={{
                          flex: 1, height: `${Math.max(4, height)}%`,
                          backgroundColor: point.value >= (analytics.equityCurve[0]?.value || 0) ? '#3fb950' : '#f85149',
                          borderRadius: '2px 2px 0 0',
                          opacity: 0.7 + (i / analytics.equityCurve.length) * 0.3,
                        }} />
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                    <span style={{ fontSize: '0.55rem', color: '#484f58' }}>{analytics.equityCurve[0]?.date}</span>
                    <span style={{ fontSize: '0.55rem', color: '#484f58' }}>{analytics.equityCurve[analytics.equityCurve.length - 1]?.date}</span>
                  </div>
                </div>
              )}

              {/* ── Algorithm Validation: per-AI-edge hit rate ──
                  Most actionable cut: tells us where Opus is reliable.
                  - 'strong' should aim for ≥85% win rate after 20 bets
                  - 'user' (esports) tracks user-judgment accuracy
                  - 'weak' should be ≤60% — if so, exclude from future bets */}
              {analytics.byAiEdge && analytics.byAiEdge.some(t => t.bets > 0) && (
                <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 0.75rem 0' }}>
                    AI-Edge Tier Hit Rate <span style={{ color: '#8b949e', fontWeight: 400 }}>(where Opus actually wins)</span>
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem' }}>
                    {analytics.byAiEdge.map(t => {
                      const cfg = t.edge === 'strong'
                        ? { icon: '🤖', label: 'AI Strong', color: '#3fb950' }
                        : t.edge === 'user'
                          ? { icon: '👤', label: 'Your Edge', color: '#a371f7' }
                          : t.edge === 'weak'
                            ? { icon: '⚠️', label: 'Limited', color: '#a09060' }
                            : { icon: '·', label: 'Untagged', color: '#8b949e' }
                      const hitRateColor = t.bets === 0 ? '#484f58'
                        : t.winRate >= 75 ? '#3fb950'
                        : t.winRate >= 55 ? '#f0c000'
                        : '#f85149'
                      return (
                        <div key={t.edge} style={{
                          padding: '0.6rem 0.5rem',
                          backgroundColor: '#0d1117',
                          borderRadius: '8px',
                          border: `1px solid ${cfg.color}33`,
                        }}>
                          <div style={{ fontSize: '0.55rem', color: cfg.color, fontWeight: 700, marginBottom: '0.3rem' }}>
                            {cfg.icon} {cfg.label}
                          </div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: hitRateColor, lineHeight: 1 }}>
                            {t.bets > 0 ? `${t.winRate.toFixed(0)}%` : '—'}
                          </div>
                          <div style={{ fontSize: '0.5rem', color: '#8b949e', marginTop: '0.25rem' }}>
                            {t.wins}W / {t.losses}L / {t.bets} total
                          </div>
                          <div style={{ fontSize: '0.5rem', color: t.pnl >= 0 ? '#3fb950' : '#f85149', marginTop: '0.15rem' }}>
                            ${t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)} ({t.avgRoi >= 0 ? '+' : ''}{t.avgRoi.toFixed(1)}% ROI)
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: '0.55rem', color: '#6e7681', marginTop: '0.5rem', fontStyle: 'italic' }}>
                    {(() => {
                      const total = analytics.byAiEdge.reduce((s, t) => s + t.bets, 0)
                      const need = analytics.sampleSizeNeeded || 20
                      if (total < need) {
                        return `Need ${need - total} more resolved bets for statistical confidence (${total}/${need}). Place picks across all tiers to validate.`
                      }
                      const strong = analytics.byAiEdge.find(t => t.edge === 'strong')
                      if (strong && strong.bets >= 5) {
                        if (strong.winRate >= 85) return `🤖 AI Strong validated — ${strong.winRate.toFixed(0)}% hit rate. Consider larger bets in strong-tier picks.`
                        if (strong.winRate < 60) return `🤖 AI Strong underperforming (${strong.winRate.toFixed(0)}%). Investigate prompt or category tagging.`
                      }
                      return `Sample valid. Tune Kelly fraction up where hit rate ≥85%; exclude tiers ≤55%.`
                    })()}
                  </div>
                </div>
              )}

              {/* ── Algorithm Validation: per-conviction-band hit rate ───────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                {analytics.byConvictionBand && (
                  <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem' }}>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 0.75rem 0' }}>
                      Hit Rate by Conviction Band
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {analytics.byConvictionBand.map((b) => {
                        const color = b.band === 'no-brainer' ? '#f0c674' : b.band === 'high' ? '#3fb950' : b.band === 'consider' ? '#d4ac4f' : '#a09060'
                        return (
                          <div key={b.band} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                            <span style={{ color, fontWeight: 600 }}>{b.band} ({b.scoreRange})</span>
                            <span style={{ color: '#8b949e' }}>
                              {b.bets > 0 ? `${b.winRate.toFixed(0)}% (${b.wins}W/${b.losses}L) • $${b.pnl >= 0 ? '+' : ''}${b.pnl.toFixed(2)}` : 'no resolved bets'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Per-DPS-tier breakdown */}
                {analytics.byDpsTier && (
                  <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem' }}>
                    <h4 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: '0 0 0.75rem 0' }}>
                      Hit Rate by DPS Tier
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {analytics.byDpsTier.filter(t => t.bets > 0 || t.tier !== 'unknown').map((t) => {
                        const color = t.tier === 'high' ? '#3fb950' : t.tier === 'medium' ? '#d4ac4f' : t.tier === 'low' ? '#a09060' : '#6e7681'
                        return (
                          <div key={t.tier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                            <span style={{ color, fontWeight: 600 }}>{t.tier} DPS</span>
                            <span style={{ color: '#8b949e' }}>
                              {t.bets > 0 ? `${t.winRate.toFixed(0)}% (${t.wins}W/${t.losses}L) • $${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}` : 'no resolved bets'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sample-size warning */}
              {analytics.sampleSizeNeeded !== undefined && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: analytics.hasSignificantSample ? 'rgba(63, 185, 80, 0.1)' : 'rgba(240, 136, 62, 0.1)',
                  border: `1px solid ${analytics.hasSignificantSample ? 'rgba(63, 185, 80, 0.4)' : 'rgba(240, 136, 62, 0.4)'}`,
                  borderRadius: '12px',
                  fontSize: '0.7rem',
                  color: analytics.hasSignificantSample ? '#3fb950' : '#f0883e',
                }}>
                  {analytics.hasSignificantSample
                    ? `✓ ${analytics.wonTrades + analytics.lostTrades} resolved bets — sample size sufficient for algorithm validation`
                    : `⚠ Need ${analytics.sampleSizeNeeded - (analytics.wonTrades + analytics.lostTrades)} more resolved bets (currently ${analytics.wonTrades + analytics.lostTrades}/${analytics.sampleSizeNeeded}) before win-rate stats are statistically meaningful. Place paper trades and let them resolve.`}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <style suppressHydrationWarning>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  )
}
