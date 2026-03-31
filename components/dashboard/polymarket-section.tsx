"use client"

import { useState, useEffect, useCallback } from 'react'
import {
  ExternalLink, TrendingUp, TrendingDown, AlertTriangle, Shield, Zap,
  RefreshCw, ChevronDown, ArrowUpDown, DollarSign, Target, BarChart3,
  Info, Wallet, Play, Pause, Settings, Trophy, X, RotateCcw,
  CheckCircle, AlertCircle
} from 'lucide-react'

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
  convictionScore: number
  convictionLabel: 'no-brainer' | 'high' | 'consider' | 'risky'
  convictionBreakdown?: {
    score: number
    label: string
    factors: {
      marketQuality: number
      timeEdge: number
      researchAlignment: number
      evRationality: number
    }
  }
  research?: {
    queryUsed: string
    topFindings: string[]
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed'
    keyInsight: string
    confidenceLevel: 'high' | 'medium' | 'low'
  } | null
  longTail?: {
    flag: 'near-certain' | 'near-impossible' | 'contrarian' | 'opportunity-alert' | null
    reasoning: string
    researchEvidence: string
    alternativeOutcome?: string
    estimatedAlternativeProb?: number
    alternativeEV?: number
  } | null
  timeAnalysis?: {
    tier: 'imminent' | 'closing-soon' | 'medium' | 'long'
    daysToClose: number
    closingSoonFactors: string[]
    resolutionUncertainty: 'low' | 'medium' | 'high'
  }
}

interface ApiResponse {
  success: boolean
  timestamp: number
  opportunities: TradeRecommendation[]
  closingSoonOpportunities: TradeRecommendation[]
  longTailOpportunities: TradeRecommendation[]
  hotMarkets: Market[]
  stats: {
    marketsAnalyzed: number
    opportunitiesFound: number
    closingSoonCount: number
    longTailCount: number
    highestConviction: number | null
    avgConviction: number | null
  }
}

interface PolymarketPosition {
  id: string
  marketId: string
  question: string
  outcome: 'Yes' | 'No'
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

// ── Conviction Badge Components ────────────────────────────────────────────────

function ConvictionBadge({ score, label, daysToClose }: { score: number; label: string; daysToClose: number }) {
  const colors: Record<string, string> = {
    'no-brainer': 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40',
    'high': 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40',
    'consider': 'bg-blue-500/20 text-blue-400 border border-blue-500/40',
    'risky': 'bg-gray-500/20 text-gray-400 border border-gray-500/40',
  }
  const color = colors[label] || colors['risky']
  const closingSoon = daysToClose <= 7

  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${color}`}>
      <span className="font-bold">{score}</span>
      <span>{label.toUpperCase()}</span>
      {closingSoon && (
        <span className="text-orange-300 font-medium ml-1">
          ⚡ {daysToClose}d
        </span>
      )}
    </div>
  )
}

function LongTailBadge({ flag }: { flag: string | null }) {
  if (!flag) return null
  const styles: Record<string, string> = {
    'near-certain': 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40',
    'near-impossible': 'bg-red-500/20 text-red-300 border border-red-500/40',
    'contrarian': 'bg-purple-500/20 text-purple-300 border border-purple-500/40',
    'opportunity-alert': 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
  }
  const style = styles[flag as string] || ''
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${style}`}>
      {flag.replace('-', ' ')}
    </span>
  )
}

function SentimentPill({ sentiment }: { sentiment: string }) {
  const colors: Record<string, string> = {
    bullish: 'bg-green-500/20 text-green-400',
    bearish: 'bg-red-500/20 text-red-400',
    neutral: 'bg-gray-500/20 text-gray-400',
    mixed: 'bg-yellow-500/20 text-yellow-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[sentiment] || colors.neutral}`}>
      {sentiment}
    </span>
  )
}

// ── Sort Types ────────────────────────────────────────────────────────────────

type SortKey = 'fastestProfit' | 'safety' | 'ev' | 'closing' | 'confidence'
type FilterKey = 'all' | 'high' | 'medium' | 'low' | 'today' | '3days' | '7days' | '30days' | 'anyEdge'
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
  const [sortKey, setSortKey] = useState<SortKey>('fastestProfit')
  const [secondarySort, setSecondarySort] = useState<SortKey | null>(null)
  const [filterKey, setFilterKey] = useState<FilterKey>('all')
  const [kellyMode, setKellyMode] = useState<KellyMode>('quarter')
  const [bankroll, setBankroll] = useState<number>(500)
  const [bankrollInput, setBankrollInput] = useState<string>('500')

  // Paper trades / analytics
  const [activeTab, setActiveTab] = useState<TabKey>('opportunities')
  // Polymarket conviction filter tabs
  const [polyTab, setPolyTab] = useState<'all' | 'closing' | 'longtail'>('all')
  const [paperPositions, setPaperPositions] = useState<PolymarketPosition[]>([])
  const [paperPortfolio, setPaperPortfolio] = useState<Portfolio | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [autoConfig, setAutoConfig] = useState<AutoTraderConfig | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [paperLoading, setPaperLoading] = useState(false)
  const [placingTrade, setPlacingTrade] = useState<string | null>(null)
  const [placingError, setPlacingError] = useState<string | null>(null)

  // Local config form state
  const [localConfig, setLocalConfig] = useState<Partial<AutoTraderConfig>>({})

  const fetchData = useState<() => void>(() => async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/polymarket', { cache: 'no-store' })
      const json: ApiResponse = await res.json()
      if (json.success) {
        setData(json)
        setLastUpdated(json.timestamp > 0 ? json.timestamp : null)
      } else {
        setData({ success: true, timestamp: 0, opportunities: [], closingSoonOpportunities: [], longTailOpportunities: [], hotMarkets: [], stats: { marketsAnalyzed: 0, opportunitiesFound: 0, closingSoonCount: 0, longTailCount: 0, highestConviction: null, avgConviction: null } })
      }
    } catch {
      setData({ success: true, timestamp: 0, opportunities: [], closingSoonOpportunities: [], longTailOpportunities: [], hotMarkets: [], stats: { marketsAnalyzed: 0, opportunitiesFound: 0, closingSoonCount: 0, longTailCount: 0, highestConviction: null, avgConviction: null } })
    }
    setLoading(false)
  })[0]

  useEffect(() => {
    fetchData()
    loadBalance()
    loadPaperData()
  }, [])

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
    { key: 'safety', label: '⚡ Conviction', color: '#8b5cf6' },
    { key: 'confidence', label: '🎯 Confidence', color: '#3fb950' },
    { key: 'ev', label: '📊 Highest EV', color: '#58a6ff' },
    { key: 'closing', label: '⏱️ Closing Soon', color: '#f0883e' },
    { key: 'fastestProfit', label: '💰 Fastest Profit', color: '#e03e92' },
  ]

  const applyMultiSort = (items: TradeRecommendation[]): TradeRecommendation[] => {
    const sorters: Array<{ fn: (a: TradeRecommendation, b: TradeRecommendation) => number }> = []

    const primarySorter = (a: TradeRecommendation, b: TradeRecommendation) => {
      if (sortKey === 'fastestProfit') {
        const scoreA = a.safetyScore / Math.max(a.daysToClose, 1)
        const scoreB = b.safetyScore / Math.max(b.daysToClose, 1)
        return scoreB - scoreA
      }
      if (sortKey === 'safety') return b.safetyScore - a.safetyScore
      if (sortKey === 'confidence') {
        const confOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
        return confOrder[a.confidence] - confOrder[b.confidence]
      }
      if (sortKey === 'ev') return b.expectedValue - a.expectedValue
      if (sortKey === 'closing') return a.daysToClose - b.daysToClose
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
          if (secondarySort === 'closing') return a.daysToClose - b.daysToClose
          if (secondarySort === 'fastestProfit') {
            const scoreA = a.safetyScore / Math.max(a.daysToClose, 1)
            const scoreB = b.safetyScore / Math.max(b.daysToClose, 1)
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
    if (filterKey === 'high') return rec.confidence === 'high'
    if (filterKey === 'medium') return rec.confidence === 'medium'
    if (filterKey === 'low') return rec.confidence === 'low'
    if (filterKey === 'today') return rec.daysToClose <= 1
    if (filterKey === '3days') return rec.daysToClose <= 3
    if (filterKey === '7days') return rec.daysToClose <= 7
    if (filterKey === '30days') return rec.daysToClose <= 30
    if (filterKey === 'anyEdge') return rec.expectedValue > 0.03 && rec.safetyScore >= 40
    return true
  })

  const getKellyBet = (rec: TradeRecommendation) => {
    const divisor = kellyMode === 'quarter' ? 4 : kellyMode === 'half' ? 2 : 1
    return bankroll * rec.kellyFraction / divisor
  }

  const totalKellyBet = filtered.reduce((sum, r) => sum + getKellyBet(r), 0)
  const avgSafety = filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + r.safetyScore, 0) / filtered.length) : 0
  const avgEV = filtered.length > 0 ? filtered.reduce((s, r) => s + r.expectedValue, 0) / filtered.length : 0
  const displayOpportunities = polyTab === 'closing'
    ? (data?.closingSoonOpportunities ?? [])
    : polyTab === 'longtail'
      ? (data?.longTailOpportunities ?? [])
      : filtered
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

  const kellyLabel = kellyMode === 'quarter' ? '¼ Kelly (Ultra-safe)' : kellyMode === 'half' ? '½ Kelly (Safe)' : 'Full Kelly (Aggressive)'

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
              {autoConfig?.enabled && (
                <span style={{ fontSize: '0.55rem', backgroundColor: 'rgba(63, 185, 80, 0.15)', color: '#3fb950', padding: '1px 6px', borderRadius: '8px', fontWeight: 600 }}>
                  AUTO
                </span>
              )}
            </h2>
            <p style={{ fontSize: '0.65rem', color: '#6e7681', margin: 0 }}>
              {opportunities.length} opportunities • {openPositions.length} paper trades open
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

          {/* Bankroll */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '4px 10px' }}>
            <DollarSign style={{ width: 12, height: 12, color: '#3fb950' }} />
            <input type='number' value={bankrollInput}
              onChange={e => { setBankrollInput(e.target.value); const val = parseFloat(e.target.value); if (!isNaN(val) && val > 0) setBankroll(val) }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '0.75rem', fontWeight: 600, width: '80px', outline: 'none' }} placeholder="Bankroll" />
            <button onClick={loadBalance} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', display: 'flex', alignItems: 'center', padding: '2px' }}>
              <Wallet style={{ width: 12, height: 12, animation: balanceLoading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Refresh */}
          <button onClick={() => { fetchData(); loadPaperData() }}
            style={{ background: 'none', border: '1px solid #30363d', borderRadius: '8px', cursor: 'pointer', color: '#8b949e', display: 'flex', alignItems: 'center', padding: '6px 10px', transition: 'all 0.2s' }}>
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
          {/* Stats grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="text-xs text-slate-400">Markets Analyzed</div>
              <div className="text-xl font-bold text-white">{data?.stats?.marketsAnalyzed ?? 0}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="text-xs text-slate-400">Opportunities</div>
              <div className="text-xl font-bold text-blue-400">{data?.stats?.opportunitiesFound ?? 0}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="text-xs text-slate-400">Closing Soon</div>
              <div className="text-xl font-bold text-orange-400">{data?.stats?.closingSoonCount ?? 0}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
              <div className="text-xs text-slate-400">Long-Tail</div>
              <div className="text-xl font-bold text-purple-400">{data?.stats?.longTailCount ?? 0}</div>
            </div>
          </div>

          {/* Tab selector */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setPolyTab('all')}
              className={`px-4 py-2 rounded text-sm font-medium transition ${
                polyTab === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              All ({data?.opportunities?.length || 0})
            </button>
            <button
              onClick={() => setPolyTab('closing')}
              className={`px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2 ${
                polyTab === 'closing'
                  ? 'bg-orange-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              ⚡ Closing Soon ({data?.closingSoonOpportunities?.length || 0})
            </button>
            <button
              onClick={() => setPolyTab('longtail')}
              className={`px-4 py-2 rounded text-sm font-medium transition flex items-center gap-2 ${
                polyTab === 'longtail'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              🎯 Long-Tail ({data?.longTailOpportunities?.length || 0})
            </button>
          </div>

          {/* Sort + Filter Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
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
                { key: 'all' as FilterKey, label: `All (${filtered.length})` },
                { key: 'high' as FilterKey, label: `HIGH` },
                { key: 'medium' as FilterKey, label: `MED` },
                { key: 'today' as FilterKey, label: `≤24h` },
                { key: '7days' as FilterKey, label: `≤7d` },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilterKey(tab.key)}
                  style={{
                    padding: '3px 8px', fontSize: '0.58rem', fontWeight: 600,
                    background: filterKey === tab.key ? 'rgba(63, 185, 80, 0.15)' : 'transparent',
                    color: filterKey === tab.key ? '#3fb950' : '#6e7681',
                    border: `1px solid ${filterKey === tab.key ? 'rgba(63, 185, 80, 0.3)' : '#30363d'}`,
                    borderRadius: '16px', cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>
              {loading && !data ? '↻' : `${displayOpportunities.length} of ${opportunities.length}`}
            </span>
          </div>

          {/* Trade Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
            {loading && !data ? (
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', fontSize: '0.85rem' }}>
                <RefreshCw style={{ width: 16, height: 16, marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                Fetching live Polymarket opportunities...
              </div>
            ) : displayOpportunities.length > 0 ? (
              displayOpportunities.map((rec) => {
                const kellyBet = getKellyBet(rec)
                const potentialWin = kellyBet * ((1 / rec.odds) - 1)
                const ev = kellyBet * rec.expectedValue
                const isAlreadyPlaced = openPositions.some(p => p.marketId === rec.market.id)

                return (
                  <div
                    key={`${rec.market.id}-${sortKey}`}
                    style={{
                      backgroundColor: '#161b22',
                      border: `1px solid ${rec.safetyScore >= 70 ? 'rgba(63, 185, 80, 0.25)' : 'rgba(240, 136, 62, 0.2)'}`,
                      borderRadius: '14px',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.6rem',
                    }}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e6edf3', margin: 0, lineHeight: 1.4, flex: 1 }}>
                        <a href={rec.market.url} target='_blank' rel='noopener noreferrer' style={{ color: '#e6edf3', textDecoration: 'none' }}>
                          {rec.market.question}
                        </a>
                      </h3>
                      <ExternalLink style={{ width: 14, height: 14, color: '#6e7681', flexShrink: 0, marginTop: '2px' }} />
                    </div>

                    {/* Conviction + Long-tail header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <ConvictionBadge
                          score={rec.convictionScore || rec.safetyScore}
                          label={rec.convictionLabel || (rec.safetyScore >= 70 ? 'high' : rec.safetyScore >= 55 ? 'consider' : 'risky')}
                          daysToClose={rec.daysToClose}
                        />
                        {rec.longTail?.flag && <LongTailBadge flag={rec.longTail.flag} />}
                        {rec.research?.sentiment && <SentimentPill sentiment={rec.research.sentiment} />}
                      </div>
                      {rec.timeAnalysis?.tier === 'imminent' && (
                        <span style={{ fontSize: '0.65rem', color: '#f97316', fontWeight: 700 }}>⚡ RESOLVING SOON</span>
                      )}
                    </div>

                    {/* Outcome + badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#8b949e', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                        {rec.outcome}
                      </span>
                      <span style={{
                        fontSize: '0.58rem', fontWeight: 700,
                        color: rec.confidence === 'high' ? '#3fb950' : rec.confidence === 'medium' ? '#f0883e' : '#8b949e',
                        backgroundColor: rec.confidence === 'high' ? 'rgba(63, 185, 80, 0.1)' : rec.confidence === 'medium' ? 'rgba(240, 136, 62, 0.1)' : 'rgba(139, 148, 158, 0.1)',
                        padding: '2px 7px', borderRadius: '4px'
                      }}>
                        {rec.confidence.toUpperCase()}
                      </span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: rec.expectedValue > 0 ? '#3fb950' : '#f85149' }}>
                        {rec.expectedValue > 0 ? '+' : ''}{(rec.expectedValue * 100).toFixed(1)}% EV
                      </span>
                      <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>
                        {(rec.odds * 100).toFixed(0)}% → {(rec.estimatedProbability * 100).toFixed(0)}%
                      </span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontSize: '0.55rem', fontWeight: 600, color: rec.daysToClose <= 7 ? '#3fb950' : rec.daysToClose <= 30 ? '#f0883e' : '#8b949e', backgroundColor: rec.daysToClose <= 7 ? 'rgba(63, 185, 80, 0.1)' : 'transparent', padding: rec.daysToClose <= 7 ? '2px 6px' : '2px 4px', borderRadius: '4px' }}>
                        {rec.daysToClose <= 1 ? 'TODAY' : rec.daysToClose === 999 ? 'TBD' : `${rec.daysToClose}d`}
                      </span>
                      {rec.riskLevel === 'low' ? <Shield style={{ width: 12, height: 12, color: '#3fb950' }} /> : <AlertTriangle style={{ width: 12, height: 12, color: rec.riskLevel === 'medium' ? '#f0883e' : '#f85149' }} />}
                    </div>

                    {/* Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      <SafetyBar score={rec.safetyScore} />
                      <KellyBar fraction={rec.kellyFraction} />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f0883e' }}>${kellyBet.toFixed(2)}</div>
                        <span style={{ fontSize: '0.55rem', color: '#6e7681' }}>Bet ({kellyMode === 'quarter' ? '¼' : kellyMode === 'half' ? '½' : '1'}K)</span>
                      </div>
                    </div>

                    {/* P&L projection */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', backgroundColor: '#0d1117', borderRadius: '8px', padding: '0.5rem' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#3fb950' }}>+${potentialWin.toFixed(2)}</div>
                        <div style={{ fontSize: '0.5rem', color: '#6e7681' }}>If Win</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#58a6ff' }}>${ev.toFixed(2)}</div>
                        <div style={{ fontSize: '0.5rem', color: '#6e7681' }}>Expected</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f85149' }}>-${kellyBet.toFixed(2)}</div>
                        <div style={{ fontSize: '0.5rem', color: '#6e7681' }}>If Lose</div>
                      </div>
                    </div>

                    {/* Reasoning */}
                    <p style={{ fontSize: '0.65rem', color: '#8b949e', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {rec.reasoning}
                    </p>

                    {/* Research Details */}
                    {rec.research && rec.research.topFindings.length > 0 && (
                      <details className="mt-2 p-2 bg-slate-800/50 rounded border border-slate-700/50">
                        <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">Research Details</summary>
                        <div className="mt-2 space-y-1">
                          {rec.research.keyInsight && (
                            <p className="text-xs text-slate-300">{rec.research.keyInsight}</p>
                          )}
                          {rec.research.topFindings.slice(0, 3).map((finding, fi) => (
                            <p key={fi} className="text-xs text-slate-400">• {finding.substring(0, 120)}{finding.length > 120 ? '...' : ''}</p>
                          ))}
                          {rec.research.confidenceLevel && (
                            <p className="text-xs text-slate-500">Research confidence: {rec.research.confidenceLevel}</p>
                          )}
                        </div>
                      </details>
                    )}

                    {/* Long-Tail Analysis */}
                    {rec.longTail && (
                      <details className="mt-2 p-2 bg-purple-900/20 rounded border border-purple-700/30">
                        <summary className="text-xs text-purple-400 cursor-pointer hover:text-purple-300">Long-Tail Analysis</summary>
                        <p className="mt-1 text-xs text-purple-200">{rec.longTail.reasoning}</p>
                        {rec.longTail.alternativeOutcome && rec.longTail.alternativeEV !== undefined && (
                          <p className="mt-1 text-xs text-purple-300">
                            💡 Consider: &quot;{rec.longTail.alternativeOutcome}&quot; @ ~{((1 - (rec.longTail.estimatedAlternativeProb || 0)) * 100).toFixed(1)}% | EV: {(rec.longTail.alternativeEV * 100).toFixed(1)}%
                          </p>
                        )}
                      </details>
                    )}

                    {/* Auto-place button */}
                    {rec.confidence === 'high' && !isAlreadyPlaced && (
                      <button
                        onClick={() => placeTrade(rec)}
                        disabled={placingTrade === rec.market.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                          background: placingTrade === rec.market.id ? '#21262d' : 'rgba(63, 185, 80, 0.1)',
                          border: `1px solid ${placingTrade === rec.market.id ? '#30363d' : 'rgba(63, 185, 80, 0.3)'}`,
                          borderRadius: '8px',
                          padding: '6px 12px',
                          cursor: placingTrade === rec.market.id ? 'default' : 'pointer',
                          color: placingTrade === rec.market.id ? '#6e7681' : '#3fb950',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          transition: 'all 0.2s',
                        }}
                      >
                        {placingTrade === rec.market.id ? (
                          <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <Target size={12} />
                        )}
                        {placingTrade === rec.market.id ? 'Placing...' : 'Auto-Place Paper Trade'}
                      </button>
                    )}
                    {isAlreadyPlaced && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', color: '#3fb950', fontSize: '0.65rem', fontWeight: 600, backgroundColor: 'rgba(63, 185, 80, 0.05)', border: '1px solid rgba(63, 185, 80, 0.15)', borderRadius: '8px', padding: '6px 12px' }}>
                        <CheckCircle size={12} /> Paper Trade Placed
                      </div>
                    )}
                    {placingError && placingTrade === null && (
                      <div style={{ fontSize: '0.6rem', color: '#f85149', textAlign: 'center' }}>
                        <AlertCircle size={12} style={{ display: 'inline', marginRight: '4px' }} />
                        {placingError}
                      </div>
                    )}

                    {/* Footer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #21262d' }}>
                      <span style={{ fontSize: '0.55rem', color: '#484f58' }}>
                        {formatVolume(rec.market.volumeNum)} vol • {formatVolume(rec.market.liquidityNum)} liq
                      </span>
                      <span style={{ fontSize: '0.55rem', color: '#484f58' }}>
                        Spread: {rec.market.spread > 0 ? `${(rec.market.spread * 100).toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', fontSize: '0.85rem', textAlign: 'center' }}>
                No opportunities match your filters right now.
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Paper Trades Tab ── */}
      {activeTab === 'paper-trades' && (
        <div>
          {paperLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681' }}>
              <RefreshCw style={{ width: 16, height: 16, marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} /> Loading...
            </div>
          ) : paperPositions.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', gap: '0.5rem' }}>
              <Target style={{ width: 32, height: 32, opacity: 0.5 }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>No paper trades yet</div>
              <div style={{ fontSize: '0.7rem' }}>Enable auto-trading in settings, or place a trade from the Opportunities tab</div>
            </div>
          ) : (
            <>
              {/* Portfolio summary */}
              {paperPortfolio && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
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
              )}

              {/* Positions table */}
              <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #21262d' }}>
                      {['Market', 'Outcome', 'Status', 'Cost', 'P&L', 'Hold Time', 'Category', 'Safety'].map((h, i) => (
                        <th key={i} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.6rem', fontWeight: 700, color: '#6e7681', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...paperPositions].sort((a, b) => b.placedAt - a.placedAt).map(pos => {
                      const daysHeld = Math.floor((Date.now() - pos.placedAt) / (1000 * 60 * 60 * 24))
                      return (
                        <tr key={pos.id} style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '8px 12px', maxWidth: '200px' }}>
                            <a href={pos.url} target='_blank' rel='noopener noreferrer' style={{ fontSize: '0.65rem', color: '#e6edf3', textDecoration: 'none' }}>
                              {pos.question.length > 60 ? pos.question.substring(0, 60) + '...' : pos.question}
                            </a>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#8b949e', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>{pos.outcome}</span>
                          </td>
                          <td style={{ padding: '8px 12px' }}><StatusBadge status={pos.status} /></td>
                          <td style={{ padding: '8px 12px', fontSize: '0.65rem', color: '#e6edf3' }}>${pos.cost.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', fontSize: '0.65rem', fontWeight: 600, color: pos.pnl === undefined ? '#6e7681' : pos.pnl >= 0 ? '#3fb950' : '#f85149' }}>
                            {pos.pnl === undefined ? '—' : pos.pnl >= 0 ? `+$${pos.pnl.toFixed(2)}` : `-$${Math.abs(pos.pnl).toFixed(2)}`}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: '0.65rem', color: '#6e7681' }}>{daysHeld}d</td>
                          <td style={{ padding: '8px 12px' }}><CategoryBadge cat={pos.category} /></td>
                          <td style={{ padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: pos.safetyScore >= 70 ? '#3fb950' : pos.safetyScore >= 55 ? '#f0883e' : '#8b949e' }}>{pos.safetyScore}</td>
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
