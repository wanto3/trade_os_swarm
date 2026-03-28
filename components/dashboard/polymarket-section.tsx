"use client"

import { useState, useEffect } from 'react'
import { ExternalLink, TrendingUp, TrendingDown, AlertTriangle, Shield, Zap, RefreshCw, ChevronDown, ArrowUpDown, DollarSign, Target, BarChart3, Info, Wallet } from 'lucide-react'

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
}

interface ApiResponse {
  success: boolean
  timestamp: number
  opportunities: TradeRecommendation[]
  hotMarkets: Market[]
  stats: {
    marketsAnalyzed: number
    opportunitiesFound: number
    highestSafety: number | null
    avgSafety: number | null
  }
}

type SortKey = 'fastestProfit' | 'safety' | 'ev' | 'closing'
type FilterKey = 'all' | 'thisWeek' | 'thisMonth' | 'anyEdge'
type KellyMode = 'quarter' | 'half' | 'full'

// No fallback — only real Polymarket API data with verified URLs is shown

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

export function PolymarketSection() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [balanceLoading, setBalanceLoading] = useState(false)
  const [walletData, setWalletData] = useState<{ positions: number; trades: number; balanceUSD: number; gnosisUSDC: number; polygonUSDT: number; totalUSD: number } | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('fastestProfit')
  const [filterKey, setFilterKey] = useState<FilterKey>('all')
  const [kellyMode, setKellyMode] = useState<KellyMode>('quarter')
  const [bankroll, setBankroll] = useState<number>(500)
  const [bankrollInput, setBankrollInput] = useState<string>('500')

  // Load bankroll from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('polymarket_bankroll')
    if (saved) {
      const val = parseFloat(saved)
      if (!isNaN(val) && val > 0) {
        setBankroll(val)
        setBankrollInput(saved)
      }
    }
    fetchData()
    loadBalance() // Also check wallet balance on mount
  }, [])

  // Save bankroll to localStorage when it changes
  useEffect(() => {
    if (bankroll > 0) {
      localStorage.setItem('polymarket_bankroll', String(bankroll))
    }
  }, [bankroll])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/polymarket', { cache: 'no-store' })
      const json: ApiResponse = await res.json()
      if (json.success) {
        setData(json)
        setLastUpdated(json.timestamp > 0 ? json.timestamp : null)
      } else {
        setData({ success: true, timestamp: 0, opportunities: [], hotMarkets: [], stats: { marketsAnalyzed: 0, opportunitiesFound: 0, highestSafety: null, avgSafety: null } })
      }
    } catch {
      setData({ success: true, timestamp: 0, opportunities: [], hotMarkets: [], stats: { marketsAnalyzed: 0, opportunitiesFound: 0, highestSafety: null, avgSafety: null } })
    }
    setLoading(false)
  }

  useEffect(() => {
    const id = setInterval(fetchData, 120000)
    return () => clearInterval(id)
  }, [])

  const formatVolume = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
    return `$${v.toFixed(0)}`
  }

  const formatTimeAgo = (ts: number | null) => {
    if (!ts) return ''
    const diff = Date.now() - ts
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return 'just now'
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  const loadBalance = async () => {
    setBalanceLoading(true)
    try {
      const res = await fetch('/api/wallet-balance')
      const json = await res.json()
      const polyBalance = json.polymarket?.balanceUSD || 0
      const gnosisBalance = json.chains?.gnosisUSDC || 0
      const polygonBalance = json.chains?.polygonUSDT || 0
      const total = polyBalance + gnosisBalance + polygonBalance

      setWalletData({
        positions: json.polymarket?.positions || 0,
        trades: json.polymarket?.trades || 0,
        balanceUSD: polyBalance,
        gnosisUSDC: gnosisBalance,
        polygonUSDT: polygonBalance,
        totalUSD: total
      })

      // If total > 0, use it. Otherwise keep manual input.
      if (total > 0) {
        setBankrollInput(total.toFixed(2))
        setBankroll(total)
      }
    } catch {}
    setBalanceLoading(false)
  }

  const getKellyBet = (rec: TradeRecommendation) => {
    const divisor = kellyMode === 'quarter' ? 4 : kellyMode === 'half' ? 2 : 1
    return bankroll * rec.kellyFraction / divisor
  }

  // Only show real Polymarket API data
  const opportunities = data?.opportunities ?? []

  // Apply sorting
  const sorted = [...opportunities].sort((a, b) => {
    if (sortKey === 'fastestProfit') {
      // Score = how fast + how certain the profit is
      // Fast = days to close (lower = better)
      // Certain = safety score (higher = better)
      // Combined: (safety_score / days_to_close) — high safety + short time = best
      const scoreA = a.safetyScore / Math.max(a.daysToClose, 1)
      const scoreB = b.safetyScore / Math.max(b.daysToClose, 1)
      return scoreB - scoreA
    }
    if (sortKey === 'safety') return b.safetyScore - a.safetyScore
    if (sortKey === 'ev') return b.expectedValue - a.expectedValue
    if (sortKey === 'closing') return a.daysToClose - b.daysToClose
    return 0
  })

  // Apply filters
  const filtered = sorted.filter(rec => {
    if (filterKey === 'thisWeek') return rec.daysToClose <= 7
    if (filterKey === 'thisMonth') return rec.daysToClose <= 30
    if (filterKey === 'anyEdge') return rec.expectedValue > 0.03 && rec.safetyScore >= 40
    return true // 'all'
  })

  // Portfolio summary
  const totalKellyBet = filtered.reduce((sum, r) => sum + getKellyBet(r), 0)
  const avgSafety = filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + r.safetyScore, 0) / filtered.length) : 0
  const avgEV = filtered.length > 0 ? filtered.reduce((s, r) => s + r.expectedValue, 0) / filtered.length : 0
  const potentialProfit = filtered.reduce((sum, r) => {
    const bet = getKellyBet(r)
    const win = bet * ((1 / r.odds) - 1)
    const expected = bet * r.estimatedProbability * ((1 / r.odds) - 1) - bet * (1 - r.estimatedProbability)
    return sum + expected
  }, 0)

  const kellyLabel = kellyMode === 'quarter' ? '¼ Kelly (Ultra-safe)' : kellyMode === 'half' ? '½ Kelly (Safe)' : 'Full Kelly (Aggressive)'

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
            </h2>
            <p style={{ fontSize: '0.65rem', color: '#6e7681', margin: 0 }}>
              {opportunities.length} high-certainty trades • Sorted by conviction
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Kelly Mode Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Info style={{ width: 12, height: 12, color: '#6e7681' }} />
            <select
              value={kellyMode}
              onChange={e => setKellyMode(e.target.value as KellyMode)}
              style={{ backgroundColor: '#161b22', color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px', padding: '4px 8px', fontSize: '0.65rem', cursor: 'pointer' }}
            >
              <option value="quarter">¼ Kelly (Ultra-safe)</option>
              <option value="half">½ Kelly (Safe)</option>
              <option value="full">Full Kelly (Aggressive)</option>
            </select>
          </div>

          {/* Bankroll Input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px', padding: '4px 10px' }}>
            <DollarSign style={{ width: 12, height: 12, color: '#3fb950' }} />
            <input
              type="number"
              value={bankrollInput}
              onChange={e => {
                setBankrollInput(e.target.value)
                const val = parseFloat(e.target.value)
                if (!isNaN(val) && val > 0) setBankroll(val)
              }}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: '0.75rem', fontWeight: 600, width: '70px', outline: 'none' }}
              placeholder="Bankroll"
            />
            <button
              onClick={loadBalance}
              title="Load from wallet"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6e7681', display: 'flex', alignItems: 'center', padding: '2px' }}
            >
              <Wallet style={{ width: 12, height: 12, animation: balanceLoading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>

          {/* Refresh */}
          <button
            onClick={fetchData}
            style={{ background: 'none', border: '1px solid #30363d', borderRadius: '8px', cursor: 'pointer', color: '#8b949e', display: 'flex', alignItems: 'center', padding: '6px 10px', transition: 'all 0.2s' }}
          >
            <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>{formatTimeAgo(lastUpdated)}</span>
        </div>
      </div>

      {/* Fund Account Banner — shown when balance is 0 */}
      {bankroll === 0 && walletData !== null && (
        <div style={{
          backgroundColor: 'rgba(240, 136, 62, 0.08)',
          border: '1px solid rgba(240, 136, 62, 0.3)',
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f0883e', marginBottom: '0.25rem' }}>
              No funds detected on Polymarket
            </div>
            <div style={{ fontSize: '0.7rem', color: '#8b949e' }}>
              {walletData.polygonUSDT > 0 && (
                <span>Found {walletData.polygonUSDT.toFixed(2)} USDT on Polygon — you need USDC on <strong>Gnosis Chain</strong> for Polymarket. </span>
              )}
              {walletData.polygonUSDT === 0 && (
                <span>Deposit USDC on Gnosis Chain to start trading. </span>
              )}
              <a href="https://app.osmosis.to/swap?from=USDT&to=USDC&chain_from=Polygon&chain_to=Gnosis" target="_blank" rel="noopener noreferrer" style={{ color: '#58a6ff' }}>Bridge to Gnosis →</a>
            </div>
          </div>
          <a
            href="https://polymarket.com/wallet"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              backgroundColor: '#f0883e',
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontSize: '0.7rem',
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            Fund Account
          </a>
        </div>
      )}

      {/* Polygon Balance Detected Banner */}
      {bankroll === 0 && walletData !== null && walletData.polygonUSDT > 0 && (
        <div style={{
          backgroundColor: 'rgba(88, 166, 255, 0.08)',
          border: '1px solid rgba(88, 166, 255, 0.3)',
          borderRadius: '12px',
          padding: '0.75rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#58a6ff', marginBottom: '0.15rem' }}>
              ⚠️ USDT on Polygon detected
            </div>
            <div style={{ fontSize: '0.65rem', color: '#8b949e' }}>
              Polymarket trades on <strong>Gnosis Chain</strong>. Bridge your {walletData.polygonUSDT.toFixed(2)} USDT to Gnosis to use it here.
            </div>
          </div>
          <button
            onClick={() => {
              setBankroll(walletData!.polygonUSDT)
              setBankrollInput(walletData!.polygonUSDT.toFixed(2))
            }}
            style={{
              backgroundColor: '#58a6ff',
              color: '#fff',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.65rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Use anyway
          </button>
        </div>
      )}

      {/* Portfolio Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: 'Total Kelly Bet', value: `$${totalKellyBet.toFixed(0)}`, sub: `across ${filtered.length} trades`, color: '#58a6ff', icon: <Target style={{ width: 14, height: 14 }} /> },
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

      {/* Sort Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <ArrowUpDown style={{ width: 12, height: 12, color: '#6e7681' }} />
        <span style={{ fontSize: '0.65rem', color: '#6e7681', marginRight: '0.5rem' }}>Sort by:</span>
        {/* Sort Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6rem', color: '#6e7681', marginRight: '0.25rem' }}>Sort:</span>
          {([
            { key: 'fastestProfit' as SortKey, label: '⚡ Fastest Profit', color: '#3fb950' },
            { key: 'safety' as SortKey, label: '🎯 High Conviction', color: '#8b5cf6' },
            { key: 'closing' as SortKey, label: '⏱️ Closing Soon', color: '#f0883e' },
            { key: 'ev' as SortKey, label: '📊 Highest EV', color: '#58a6ff' },
          ]).map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortKey(opt.key)}
              style={{
                padding: '4px 10px',
                fontSize: '0.6rem',
                fontWeight: 600,
                background: sortKey === opt.key ? `${opt.color}20` : 'transparent',
                color: sortKey === opt.key ? opt.color : '#6e7681',
                border: `1px solid ${sortKey === opt.key ? opt.color + '50' : '#30363d'}`,
                borderRadius: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.6rem', color: '#6e7681', marginRight: '0.25rem' }}>Filter:</span>
          {([
            { key: 'all' as FilterKey, label: `All (${filtered.length})` },
            { key: 'thisWeek' as FilterKey, label: `≤7 days` },
            { key: 'thisMonth' as FilterKey, label: `≤30 days` },
            { key: 'anyEdge' as FilterKey, label: `Any edge` },
          ]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterKey(tab.key)}
              style={{
                padding: '3px 8px',
                fontSize: '0.58rem',
                fontWeight: 600,
                background: filterKey === tab.key ? 'rgba(63, 185, 80, 0.15)' : 'transparent',
                color: filterKey === tab.key ? '#3fb950' : '#6e7681',
                border: `1px solid ${filterKey === tab.key ? 'rgba(63, 185, 80, 0.3)' : '#30363d'}`,
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>
          {loading && !data ? '↻' : `${filtered.length} of ${sorted.length} trades`}
        </span>
      </div>

      {/* Trade Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
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

            return (
              <a
                key={`${rec.market.id}-${sortKey}`}
                href={rec.market.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    backgroundColor: '#161b22',
                    border: `1px solid ${rec.safetyScore >= 70 ? 'rgba(63, 185, 80, 0.25)' : 'rgba(240, 136, 62, 0.2)'}`,
                    borderRadius: '14px',
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem'
                  }}
                >
                  {/* Top row: question + link */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e6edf3', margin: 0, lineHeight: 1.4, flex: 1 }}>
                      {rec.market.question}
                    </h3>
                    <ExternalLink style={{ width: 14, height: 14, color: '#6e7681', flexShrink: 0, marginTop: '2px' }} />
                  </div>

                  {/* Outcome + EV */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#8b949e', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                      {rec.outcome}
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
                    {rec.riskLevel === 'low' ? (
                      <Shield style={{ width: 12, height: 12, color: '#3fb950' }} />
                    ) : (
                      <AlertTriangle style={{ width: 12, height: 12, color: rec.riskLevel === 'medium' ? '#f0883e' : '#f85149' }} />
                    )}
                  </div>

                  {/* Metrics row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    <SafetyBar score={rec.safetyScore} />
                    <KellyBar fraction={rec.kellyFraction} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f0883e' }}>${kellyBet.toFixed(0)}</div>
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
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#f85149' }}>-${kellyBet.toFixed(0)}</div>
                      <div style={{ fontSize: '0.5rem', color: '#6e7681' }}>If Lose</div>
                    </div>
                  </div>

                  {/* Reasoning */}
                  <p style={{ fontSize: '0.65rem', color: '#8b949e', margin: 0, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {rec.reasoning}
                  </p>

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
              </a>
            )
          })
        ) : (
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '120px', backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', color: '#6e7681', fontSize: '0.85rem', textAlign: 'center' }}>
            No high-certainty opportunities found right now.<br />Markets shift — check back in a few minutes.
          </div>
        )}
      </div>

      <style suppressHydrationWarning>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        a:hover > div {
          border-color: #8b5cf6 !important;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(139, 92, 246, 0.15);
        }
      `}</style>
    </section>
  )
}
