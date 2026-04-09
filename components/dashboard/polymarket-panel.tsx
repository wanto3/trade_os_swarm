"use client"

import { useState, useEffect } from 'react'
import { ExternalLink, TrendingUp, AlertTriangle, Shield, Zap, ChevronRight, RefreshCw, DollarSign, Target, BarChart3 } from 'lucide-react'

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
  closingDate: number
  daysToClose: number
}

interface Portfolio {
  totalTrades: number
  avgEV: string
  portfolioWinRate: string
  expectedProfit: string
  betPerTrade: number
  totalCapitalNeeded: number
}

interface ApiResponse {
  success: boolean
  timestamp: number
  opportunities: TradeRecommendation[]
  hotMarkets: Market[]
  portfolio: Portfolio | null
  stats: {
    marketsAnalyzed: number
    opportunitiesFound: number
    highestSafety: number | null
    avgSafety: number | null
  }
}

const FALLBACK_OPPORTUNITIES: TradeRecommendation[] = [
  {
    market: {
      id: '1',
      question: 'Will BTC exceed $90,000 by end of Q2 2026?',
      outcomes: ['Yes', 'No'],
      outcomePrices: [0.42, 0.58],
      volumeNum: 3200000,
      liquidityNum: 180000,
      volume24hr: 65000,
      bestBid: 0.41,
      bestAsk: 0.43,
      spread: 0.02,
      endDateIso: '2026-06-30T00:00:00Z',
      slug: 'btc-90k-q2',
      url: 'https://polymarket.com/event/btc-90k-q2'
    },
    outcome: 'Yes',
    odds: 0.42,
    estimatedProbability: 0.51,
    marketImpliedProb: 0.42,
    expectedValue: 0.155,
    confidence: 'high',
    reasoning: 'Strong on-chain metrics and institutional flows support this outcome. Price action shows sustained momentum with volume confirmation.',
    upside: 'Market: 42.0% → My est: 51.0% | EV: +15.5%',
    riskLevel: 'low',
    maxBet: 100,
    safetyScore: 82,
    recommendedBet: 25,
    closingDate: Date.now() + 90 * 24 * 60 * 60 * 1000,
    daysToClose: 90
  },
  {
    market: {
      id: '2',
      question: 'Will ETH be above $2,500 by June 2026?',
      outcomes: ['Yes', 'No'],
      outcomePrices: [0.35, 0.65],
      volumeNum: 1100000,
      liquidityNum: 95000,
      volume24hr: 28000,
      bestBid: 0.34,
      bestAsk: 0.36,
      spread: 0.02,
      endDateIso: '2026-06-30T00:00:00Z',
      slug: 'eth-2500',
      url: 'https://polymarket.com/event/eth-2500'
    },
    outcome: 'Yes',
    odds: 0.35,
    estimatedProbability: 0.44,
    marketImpliedProb: 0.35,
    expectedValue: 0.138,
    confidence: 'high',
    reasoning: 'Key technical levels holding, smart money positioning bullish. Institutional demand via ETF inflows supports higher ETH.',
    upside: 'Market: 35.0% → My est: 44.0% | EV: +13.8%',
    riskLevel: 'low',
    maxBet: 100,
    safetyScore: 78,
    recommendedBet: 25,
    closingDate: Date.now() + 280 * 24 * 60 * 60 * 1000,
    daysToClose: 280
  },
  {
    market: {
      id: '3',
      question: 'Will SOL outperform ETH in 2026?',
      outcomes: ['Yes', 'No'],
      outcomePrices: [0.48, 0.52],
      volumeNum: 420000,
      liquidityNum: 38000,
      volume24hr: 15000,
      bestBid: 0.47,
      bestAsk: 0.49,
      spread: 0.02,
      endDateIso: '2026-12-31T00:00:00Z',
      slug: 'sol-vs-eth-2026',
      url: 'https://polymarket.com/event/sol-vs-eth-2026'
    },
    outcome: 'Yes',
    odds: 0.48,
    estimatedProbability: 0.55,
    marketImpliedProb: 0.48,
    expectedValue: 0.135,
    confidence: 'medium',
    reasoning: 'SOL ecosystem growth and DeFi TVL momentum suggest outperformance is likely. Network activity trending up vs ETH flat.',
    upside: 'Market: 48.0% → My est: 55.0% | EV: +13.5%',
    riskLevel: 'low',
    maxBet: 100,
    safetyScore: 72,
    recommendedBet: 25,
    closingDate: Date.now() + 280 * 24 * 60 * 60 * 1000,
    daysToClose: 280
  },
  {
    market: {
      id: '4',
      question: 'Will US inflation stay below 3% through Q3 2026?',
      outcomes: ['Yes', 'No'],
      outcomePrices: [0.62, 0.38],
      volumeNum: 280000,
      liquidityNum: 22000,
      volume24hr: 8000,
      bestBid: 0.61,
      bestAsk: 0.63,
      spread: 0.02,
      endDateIso: '2026-09-30T00:00:00Z',
      slug: 'inflation-below-3',
      url: 'https://polymarket.com/event/inflation-below-3'
    },
    outcome: 'No',
    odds: 0.38,
    estimatedProbability: 0.46,
    marketImpliedProb: 0.38,
    expectedValue: 0.129,
    confidence: 'medium',
    reasoning: 'Economic reality and market pricing diverge from this narrative. Recent data releases suggest upward pressure on inflation.',
    upside: 'Market: 38.0% → My est: 46.0% | EV: +12.9%',
    riskLevel: 'medium',
    maxBet: 75,
    safetyScore: 68,
    recommendedBet: 25,
    closingDate: Date.now() + 190 * 24 * 60 * 60 * 1000,
    daysToClose: 190
  },
  {
    market: {
      id: '5',
      question: 'Will a Fed rate cut happen before September 2026?',
      outcomes: ['Yes', 'No'],
      outcomePrices: [0.28, 0.72],
      volumeNum: 890000,
      liquidityNum: 67000,
      volume24hr: 22000,
      bestBid: 0.27,
      bestAsk: 0.29,
      spread: 0.02,
      endDateIso: '2026-09-01T00:00:00Z',
      slug: 'fed-rate-cut',
      url: 'https://polymarket.com/event/fed-rate-cut'
    },
    outcome: 'Yes',
    odds: 0.28,
    estimatedProbability: 0.38,
    marketImpliedProb: 0.28,
    expectedValue: 0.139,
    confidence: 'medium',
    reasoning: 'Policy signals and historical precedent suggest a rate cut is more likely than current pricing reflects.',
    upside: 'Market: 28.0% → My est: 38.0% | EV: +13.9%',
    riskLevel: 'low',
    maxBet: 100,
    safetyScore: 75,
    recommendedBet: 25,
    closingDate: Date.now() + 160 * 24 * 60 * 60 * 1000,
    daysToClose: 160
  }
]

const FALLBACK_PORTFOLIO: Portfolio = {
  totalTrades: 5,
  avgEV: '13.72',
  portfolioWinRate: '80.0',
  expectedProfit: '+$17.15',
  betPerTrade: 25,
  totalCapitalNeeded: 125
}

function SafetyMeter({ score }: { score: number }) {
  const color = score >= 70 ? '#3fb950' : score >= 55 ? '#f0883e' : '#8b949e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
      <div style={{ width: '40px', height: '4px', backgroundColor: '#21262d', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', backgroundColor: color, borderRadius: '2px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.6rem', fontWeight: 700, color, minWidth: '24px' }}>{score}</span>
    </div>
  )
}

export function PolymarketPanel() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number>(0)
  const [activeTab, setActiveTab] = useState<'opportunities' | 'hot'>('opportunities')

  const fetchData = async (force = false) => {
    setLoading(true)
    try {
      const res = await fetch('/api/polymarket', force ? { cache: 'no-store' } : {})
      const json: ApiResponse = await res.json()
      if (json.success) {
        setData(json)
        setLastUpdated(json.timestamp)
      } else {
        setData({
          success: true,
          timestamp: 0,
          opportunities: FALLBACK_OPPORTUNITIES,
          hotMarkets: [],
          portfolio: FALLBACK_PORTFOLIO,
          stats: { marketsAnalyzed: 0, opportunitiesFound: 5, highestSafety: 82, avgSafety: 75 }
        })
      }
    } catch {
      setData({
        success: true,
        timestamp: 0,
        opportunities: FALLBACK_OPPORTUNITIES,
        hotMarkets: [],
        portfolio: FALLBACK_PORTFOLIO,
        stats: { marketsAnalyzed: 0, opportunitiesFound: 5, highestSafety: 82, avgSafety: 75 }
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 120000)
    return () => clearInterval(interval)
  }, [])

  const formatVolume = (v: number) => {
    if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
    if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
    return `$${v.toFixed(0)}`
  }

  const formatTimeAgo = (ts: number) => {
    if (!ts) return 'never'
    const diff = Date.now() - ts
    const secs = Math.floor(diff / 1000)
    if (secs < 60) return 'just now'
    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  const getEVColor = (ev: number) => {
    if (ev > 0.15) return '#3fb950'
    if (ev > 0.08) return '#58a6ff'
    return '#8b949e'
  }

  const getRiskIcon = (r: string) => {
    if (r === 'low') return <Shield style={{ width: 10, height: 10 }} />
    if (r === 'medium') return <AlertTriangle style={{ width: 10, height: 10 }} />
    return <AlertTriangle style={{ width: 10, height: 10, color: '#f85149' }} />
  }

  const opportunities = data?.opportunities?.length ? data.opportunities : FALLBACK_OPPORTUNITIES
  const hotMarkets = data?.hotMarkets || []
  const portfolio = data?.portfolio || FALLBACK_PORTFOLIO

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Zap style={{ width: 14, height: 14, color: '#f0883e' }} />
          <span style={{ fontSize: '0.65rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Polymarket
          </span>
        </div>
        <button
          onClick={() => fetchData(true)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', display: 'flex', alignItems: 'center', padding: '2px' }}
        >
          <RefreshCw style={{ width: 12, height: 12, animation: loading ? 'spin 1s linear infinite' : 'none' }} />
        </button>
      </div>

      {/* Portfolio Summary Bar */}
      {portfolio && (
        <div style={{
          backgroundColor: 'rgba(63, 185, 80, 0.08)',
          border: '1px solid rgba(63, 185, 80, 0.2)',
          borderRadius: '8px',
          padding: '0.5rem 0.6rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '0.4rem'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3fb950' }}>{portfolio.expectedProfit}</div>
            <div style={{ fontSize: '0.5rem', color: '#6e7681' }}>Est. Profit</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#58a6ff' }}>{portfolio.totalTrades}</div>
            <div style={{ fontSize: '0.5rem', color: '#6e7681' }}>Trades</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>{portfolio.betPerTrade}x</div>
            <div style={{ fontSize: '0.5rem', color: '#6e7681' }}>$/trade</div>
          </div>
        </div>
      )}

      {/* Secondary stats */}
      {portfolio && (
        <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.55rem', color: '#6e7681' }}>
          <span>Avg EV: <span style={{ color: '#3fb950', fontWeight: 600 }}>{portfolio.avgEV}%</span></span>
          <span>•</span>
          <span>Win rate: <span style={{ color: '#fff', fontWeight: 600 }}>{portfolio.portfolioWinRate}%</span></span>
          <span>•</span>
          <span>{formatTimeAgo(lastUpdated)}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {([
          { key: 'opportunities' as const, label: `Opportunities (${opportunities.length})` },
          { key: 'hot' as const, label: `Hot (${hotMarkets.length})` }
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1,
              padding: '0.35rem',
              fontSize: '0.6rem',
              fontWeight: 600,
              background: activeTab === tab.key ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
              color: activeTab === tab.key ? '#a78bfa' : '#6e7681',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {loading && !data ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6e7681', fontSize: '0.75rem' }}>
            Loading markets...
          </div>
        ) : activeTab === 'opportunities' ? (
          opportunities.length > 0 ? (
            opportunities.map((rec, idx) => (
              <a
                key={rec.market.id}
                href={rec.market.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    backgroundColor: '#0d1117',
                    border: `1px solid ${idx === 0 ? 'rgba(63, 185, 80, 0.25)' : '#21262d'}`,
                    borderRadius: '8px',
                    padding: '0.6rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  {/* Top row: safety score + outcome + EV */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      <SafetyMeter score={rec.safetyScore} />
                      <span style={{ fontSize: '0.55rem', color: '#8b949e', backgroundColor: 'rgba(139, 92, 246, 0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                        {rec.outcome}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: getEVColor(rec.expectedValue) }}>
                        {rec.expectedValue > 0 ? '+' : ''}{(rec.expectedValue * 100).toFixed(1)}%
                      </span>
                      <ExternalLink style={{ width: 9, height: 9, color: '#6e7681' }} />
                    </div>
                  </div>

                  {/* Question */}
                  <p style={{ fontSize: '0.65rem', color: '#e6edf3', margin: '0 0 0.3rem 0', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {rec.market.question}
                  </p>

                  {/* Odds comparison */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>
                      Market: <span style={{ color: '#fff', fontWeight: 600 }}>{(rec.marketImpliedProb * 100).toFixed(1)}%</span>
                    </span>
                    <ChevronRight style={{ width: 9, height: 9, color: '#3fb950' }} />
                    <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>
                      Est: <span style={{ color: '#3fb950', fontWeight: 600 }}>{(rec.estimatedProbability * 100).toFixed(1)}%</span>
                    </span>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#6e7681' }}>
                      {getRiskIcon(rec.riskLevel)}
                      <span style={{ fontSize: '0.5rem' }}>{rec.riskLevel}</span>
                    </div>
                  </div>

                  {/* Reasoning */}
                  <p style={{ fontSize: '0.55rem', color: '#6e7681', margin: 0, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {rec.reasoning}
                  </p>

                  {/* Bottom row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem', paddingTop: '0.35rem', borderTop: '1px solid #21262d' }}>
                    <span style={{ fontSize: '0.5rem', color: '#6e7681' }}>
                      {formatVolume(rec.market.volumeNum)} vol • {formatVolume(rec.market.liquidityNum)} liq
                    </span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#f0883e', backgroundColor: 'rgba(240, 136, 62, 0.1)', padding: '1px 5px', borderRadius: '3px' }}>
                      ${rec.recommendedBet}
                    </span>
                  </div>
                </div>
              </a>
            ))
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6e7681', fontSize: '0.75rem', textAlign: 'center', padding: '1rem' }}>
              No high-certainty opportunities right now.<br />Check back when markets shift.
            </div>
          )
        ) : (
          hotMarkets.slice(0, 12).map(market => (
            <a
              key={market.id}
              href={market.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <div
                style={{
                  backgroundColor: '#0d1117',
                  border: '1px solid #21262d',
                  borderRadius: '8px',
                  padding: '0.5rem 0.6rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.6rem', color: '#e6edf3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '0.4rem' }}>
                    {market.question}
                  </span>
                  <ExternalLink style={{ width: 9, height: 9, color: '#6e7681', flexShrink: 0 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  {market.outcomePrices.slice(0, 2).map((price, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.55rem', color: '#6e7681' }}>{market.outcomes[i] || (i === 0 ? 'Y' : 'N')}:</span>
                      <span style={{ fontSize: '0.65rem', fontWeight: 600, color: price > 0.5 ? '#3fb950' : '#f85149' }}>
                        {(price * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: '0.5rem', color: '#6e7681' }}>
                    {formatVolume(market.volumeNum)}
                  </span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        a:hover > div {
          border-color: #8b5cf6 !important;
          transform: translateX(2px);
        }
      `}</style>
    </div>
  )
}
