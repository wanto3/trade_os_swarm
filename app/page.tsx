'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Zap, TrendingUp, TrendingDown, Activity, RefreshCw,
  Clock, Wallet, Bell, Settings, Maximize2, Minimize2,
  BarChart3, LineChart as LineIcon, PieChart as PieIcon,
  Globe, ArrowUpRight, ArrowDownLeft, Shield, AlertTriangle,
  Target, Cpu, Database, Eye, ArrowLeftRight
} from 'lucide-react'
import { GlassPanel } from '@/components/dashboard/glass-panel'
import { DataCard } from '@/components/dashboard/data-card'
import { GaugeIndicator } from '@/components/dashboard/gauge-indicator'
import { TrendBadge } from '@/components/dashboard/trend-badge'
import { PriceHero } from '@/components/dashboard/price-hero'
import { SignalRadar } from '@/components/dashboard/signal-radar'
import { OrderBookDepth } from '@/components/dashboard/order-book-depth'
import { WhaleAlerts } from '@/components/dashboard/whale-alerts'
import { MarginHealth, FundingRates, OpenInterest, Liquidations } from '@/components/dashboard/margin-health'
import { PositionManager } from '@/components/dashboard/position-manager'
import { KellyCalculator } from '@/components/dashboard/kelly-optimizer'
import { MultiTimeframe, SupportResistanceLevels } from '@/components/dashboard/multi-timeframe'
import { TabNavigation } from '@/components/dashboard/tab-nav'
import { StatusBar } from '@/components/dashboard/status-bar'
import { PolymarketSection } from '@/components/dashboard/polymarket-section'

// Types
interface PriceData {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  marketCap: number
}

type TabId = 'overview' | 'technical' | 'onchain' | 'trading' | 'markets'

// === FALLBACK DATA ===
const FALLBACK_PRICES: PriceData[] = [
  { symbol: 'BTC', price: 84350, change24h: 1.2, volume24h: 42e9, marketCap: 1.67e12 },
  { symbol: 'ETH', price: 2025, change24h: 0.8, volume24h: 14e9, marketCap: 243e9 },
  { symbol: 'SOL', price: 128.5, change24h: 3.5, volume24h: 3.2e9, marketCap: 56e9 },
  { symbol: 'ADA', price: 0.62, change24h: -0.5, volume24h: 480e6, marketCap: 22e9 },
  { symbol: 'DOT', price: 7.25, change24h: 2.1, volume24h: 320e6, marketCap: 9.8e9 },
]

// === UTILITY ===
function formatLarge(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(2)}`
}

function formatTimeAgo(ts: number | null): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

// === MAIN PAGE ===
export default function DashboardPage() {
  const [prices, setPrices] = useState<PriceData[]>(FALLBACK_PRICES)
  const [dataSource, setDataSource] = useState<string>('local')
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [time, setTime] = useState(Date.now())

  const selectedPrice = prices.find(p => p.symbol === selectedSymbol) || prices[0]

  const fetchPrices = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/prices')
      const json = await res.json()
      if (json.success && json.data) {
        setPrices(json.data)
        setDataSource(json.source || 'coingecko')
        setLastUpdated(Date.now())
      }
    } catch {
      setDataSource('local')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrices()
    const id = setInterval(fetchPrices, 60000)
    const timeId = setInterval(() => setTime(Date.now()), 1000)
    return () => {
      clearInterval(id)
      clearInterval(timeId)
    }
  }, [fetchPrices])

  // Order book mock
  const midPrice = selectedPrice.price
  const spread = midPrice * 0.0003
  const mockBids = Array.from({ length: 12 }, (_, i) => ({
    price: midPrice - spread - (i * midPrice * 0.0001),
    size: 0.5 + Math.random() * 3,
    total: 0,
  }))
  const mockAsks = Array.from({ length: 12 }, (_, i) => ({
    price: midPrice + spread + (i * midPrice * 0.0001),
    size: 0.5 + Math.random() * 3,
    total: 0,
  }))
  let bidTotal = 0
  let askTotal = 0
  mockBids.forEach(b => { bidTotal += b.size; b.total = bidTotal })
  mockAsks.forEach(a => { askTotal += a.size; a.total = askTotal })

  // Signal radar axes
  const radarAxes = [
    { label: 'RSI', value: 50 + selectedPrice.change24h * 5, max: 100 },
    { label: 'MACD', value: selectedPrice.change24h > 0 ? 70 : 35, max: 100 },
    { label: 'Volume', value: 45 + Math.random() * 30, max: 100 },
    { label: 'Trend', value: selectedPrice.change24h > 0 ? 75 : 40, max: 100 },
    { label: 'Momentum', value: 55 + Math.random() * 30, max: 100 },
    { label: 'Sentiment', value: 60 + Math.random() * 25, max: 100 },
  ]

  const formatClock = (ts: number) =>
    new Date(ts).toLocaleTimeString('en-US', { hour12: false })

  // === RENDER ===
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--void)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        position: 'relative',
        overflowX: 'hidden',
      }}
    >
      {/* Ambient background orbs */}
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="ambient-orb ambient-orb-3" />

      {/* Scan line */}
      <div className="scan-line-overlay" />

      {/* Hex grid bg */}
      <div className="hex-grid-bg" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }} />

      {/* === HEADER === */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(5,5,8,0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(42,42,74,0.6)',
          padding: '0 24px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, var(--cyan), var(--purple))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 16px rgba(0,245,255,0.3), 0 0 4px rgba(168,85,247,0.3)',
          }}>
            <Zap size={18} color="#fff" style={{ filter: 'drop-shadow(0 0 4px #fff)' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: '14px',
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.1em',
              color: 'var(--text-primary)',
              margin: 0,
              lineHeight: 1,
            }}>
              CRYPTOS<span style={{ color: 'var(--cyan)' }}>OS</span>
            </h1>
            <p style={{
              fontSize: '8px',
              color: 'var(--text-muted)',
              margin: 0,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}>
              Command Center
            </p>
          </div>
        </div>

        {/* Tab navigation */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {/* Right actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          {/* Live indicator */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '20px',
            background: 'rgba(0,255,136,0.06)',
            border: '1px solid rgba(0,255,136,0.2)',
          }}>
            <div className="live-dot" />
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--green)' }}>LIVE</span>
          </div>

          {/* Clock */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--text-secondary)',
          }}>
            <Clock size={12} />
            {formatClock(time)}
          </div>

          {/* Refresh */}
          <button
            onClick={fetchPrices}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              border: '1px solid rgba(42,42,74,0.8)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>

          {/* Source */}
          <div style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: dataSource === 'coingecko' ? 'var(--cyan)' : 'var(--orange)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {dataSource}
          </div>

          {/* Auto-improve link */}
          <Link
            href="/self-improvement"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--purple)',
              background: 'rgba(168,85,247,0.08)',
              border: '1px solid rgba(168,85,247,0.2)',
              textDecoration: 'none',
              transition: 'all 0.2s',
            }}
          >
            <Zap size={10} />
            AI
          </Link>
        </div>
      </header>

      {/* === MAIN CONTENT === */}
      <div style={{
        display: 'flex',
        minHeight: 'calc(100vh - 56px - 28px)',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* === LEFT SIDEBAR === */}
        <aside
          style={{
            width: sidebarCollapsed ? '48px' : '260px',
            flexShrink: 0,
            borderRight: '1px solid rgba(42,42,74,0.5)',
            padding: sidebarCollapsed ? '16px 8px' : '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: 'rgba(5,5,8,0.5)',
            transition: 'width 0.2s ease-out',
            overflow: 'hidden',
          }}
        >
          {/* Collapse toggle */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-end',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '4px',
            }}
          >
            {sidebarCollapsed ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>

          {!sidebarCollapsed && (
            <>
              {/* Symbol selector */}
              <div>
                <div style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  marginBottom: '8px',
                }}>
                  Selected Asset
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {prices.map((p) => (
                    <button
                      key={p.symbol}
                      onClick={() => setSelectedSymbol(p.symbol)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        background: selectedSymbol === p.symbol
                          ? 'rgba(0,245,255,0.08)'
                          : 'rgba(10,10,18,0.5)',
                        borderBottom: selectedSymbol === p.symbol
                          ? '1px solid rgba(0,245,255,0.2)'
                          : '1px solid rgba(42,42,74,0.3)',
                        transition: 'all 0.15s',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (selectedSymbol !== p.symbol) {
                          e.currentTarget.style.background = 'rgba(42,42,74,0.3)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (selectedSymbol !== p.symbol) {
                          e.currentTarget.style.background = 'rgba(10,10,18,0.5)'
                        }
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          color: selectedSymbol === p.symbol ? 'var(--cyan)' : 'var(--text-primary)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {p.symbol}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={{
                          fontSize: '11px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                        }}>
                          {p.price >= 1000
                            ? `$${p.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                            : `$${p.price.toFixed(2)}`
                          }
                        </span>
                        <span style={{
                          fontSize: '9px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: p.change24h >= 0 ? 'var(--green)' : 'var(--magenta)',
                        }}>
                          {p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Price hero */}
              {selectedPrice && (
                <PriceHero
                  symbol={selectedPrice.symbol}
                  price={selectedPrice.price}
                  change24h={selectedPrice.change24h}
                  high24h={selectedPrice.price * 1.025}
                  low24h={selectedPrice.price * 0.975}
                  volume24h={selectedPrice.volume24h}
                  marketCap={selectedPrice.marketCap}
                />
              )}

              {/* Quick stats */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}>
                <DataCard
                  label="MCap"
                  value={formatLarge(selectedPrice.marketCap)}
                  accent="cyan"
                  size="sm"
                />
                <DataCard
                  label="Vol 24H"
                  value={formatLarge(selectedPrice.volume24h)}
                  accent="purple"
                  size="sm"
                />
                <DataCard
                  label="BTC Dom"
                  value="52.3%"
                  accent="gold"
                  size="sm"
                />
                <DataCard
                  label="Fear/Greed"
                  value="68"
                  accent="green"
                  subValue="Greed"
                  size="sm"
                />
              </div>

              {/* AI Score */}
              <div style={{
                padding: '10px',
                borderRadius: '10px',
                background: 'rgba(0,245,255,0.04)',
                border: '1px solid rgba(0,245,255,0.12)',
              }}>
                <div style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Cpu size={10} color="var(--cyan)" />
                  AI Conviction
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    fontSize: '28px',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    color: 'var(--cyan)',
                    lineHeight: 1,
                    textShadow: '0 0 20px rgba(0,245,255,0.5)',
                  }}>
                    72
                  </div>
                  <div>
                    <div style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      color: 'var(--green)',
                      textTransform: 'uppercase',
                    }}>
                      BULLISH
                    </div>
                    <div style={{ fontSize: '8px', color: 'var(--text-muted)' }}>
                      Confidence: High
                    </div>
                  </div>
                </div>
                <div style={{
                  height: '3px',
                  background: 'var(--border)',
                  borderRadius: '2px',
                  marginTop: '8px',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: '72%',
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--cyan), var(--green))',
                    borderRadius: '2px',
                    boxShadow: '0 0 6px rgba(0,245,255,0.4)',
                  }} />
                </div>
              </div>

              {/* Mini whale ticker */}
              <div>
                <div style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <ArrowLeftRight size={10} />
                  Whale Activity
                </div>
                <div style={{
                  padding: '8px',
                  borderRadius: '8px',
                  background: 'rgba(10,10,18,0.5)',
                  border: '1px solid rgba(42,42,74,0.5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                    <span style={{ color: 'var(--green)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <ArrowDownLeft size={8} /> Inflows
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>+1.2B</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                    <span style={{ color: 'var(--magenta)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <ArrowUpRight size={8} /> Outflows
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--magenta)' }}>-820M</span>
                  </div>
                  <div style={{
                    borderTop: '1px solid rgba(42,42,74,0.5)',
                    paddingTop: '4px',
                    marginTop: '2px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '9px',
                    fontWeight: 700,
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>Net Flow</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--green)' }}>+380M</span>
                  </div>
                </div>
              </div>

              {/* Wallet */}
              <div style={{
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(10,10,18,0.5)',
                border: '1px solid rgba(42,42,74,0.5)',
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginBottom: '6px',
                }}>
                  <Wallet size={12} color="var(--cyan)" />
                  <span style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>
                    Wallet
                  </span>
                </div>
                <div style={{
                  fontSize: '18px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: 'var(--cyan)',
                }}>
                  $10,000.00
                </div>
                <div style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--green)',
                }}>
                  +$320.50 (+3.32%)
                </div>
              </div>
            </>
          )}
        </aside>

        {/* === MAIN CONTENT AREA === */}
        <main style={{ flex: 1, padding: '20px 24px', overflowY: 'auto', paddingBottom: '60px' }}>
          {/* === TAB: OVERVIEW === */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fade-in-up 0.4s ease-out' }}>
              {/* Row 1: Key metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                <GlassPanel glow="cyan" hoverable padding="14px">
                  <DataCard
                    label="Total Market Cap"
                    value={formatLarge(prices.reduce((s, p) => s + p.marketCap, 0))}
                    change={1.8}
                    changeLabel="24h"
                    accent="cyan"
                    icon={<Globe size={10} />}
                    size="md"
                  />
                </GlassPanel>
                <GlassPanel hoverable padding="14px">
                  <DataCard
                    label="24H Volume"
                    value={formatLarge(prices.reduce((s, p) => s + p.volume24h, 0))}
                    change={-2.3}
                    changeLabel="vs yesterday"
                    accent="purple"
                    icon={<Activity size={10} />}
                    size="md"
                  />
                </GlassPanel>
                <GlassPanel hoverable padding="14px">
                  <DataCard
                    label="BTC Dominance"
                    value="52.3%"
                    change={0.4}
                    accent="gold"
                    icon={<BarChart3 size={10} />}
                    size="md"
                  />
                </GlassPanel>
                <GlassPanel hoverable padding="14px">
                  <DataCard
                    label="Fear & Greed"
                    value="68"
                    subValue="Greed"
                    accent="green"
                    icon={<Eye size={10} />}
                    size="md"
                  />
                </GlassPanel>
              </div>

              {/* Row 2: Price cards + Signal Radar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '16px' }}>
                {/* Price strip */}
                <GlassPanel glow="none" padding="16px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    <BarChart3 size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Market Prices
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                    {prices.map((p) => (
                      <div
                        key={p.symbol}
                        onClick={() => setSelectedSymbol(p.symbol)}
                        style={{
                          padding: '12px 10px',
                          borderRadius: '10px',
                          background: selectedSymbol === p.symbol
                            ? 'rgba(0,245,255,0.06)'
                            : 'rgba(10,10,18,0.4)',
                          border: selectedSymbol === p.symbol
                            ? '1px solid rgba(0,245,255,0.25)'
                            : '1px solid rgba(42,42,74,0.4)',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          animation: 'breathe 4s ease-in-out infinite',
                          animationDelay: `${prices.indexOf(p) * 0.5}s`,
                        }}
                        onMouseEnter={(e) => {
                          if (selectedSymbol !== p.symbol) {
                            e.currentTarget.style.borderColor = 'rgba(0,245,255,0.2)'
                            e.currentTarget.style.transform = 'translateY(-1px)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedSymbol !== p.symbol) {
                            e.currentTarget.style.borderColor = 'rgba(42,42,74,0.4)'
                            e.currentTarget.style.transform = 'translateY(0)'
                          }
                        }}
                      >
                        <div style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-primary)',
                        }}>
                          {p.symbol}
                        </div>
                        <div style={{
                          fontSize: '13px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                        }}>
                          {p.price >= 1000
                            ? `$${p.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                            : `$${p.price.toFixed(2)}`
                          }
                        </div>
                        <div style={{
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 600,
                          color: p.change24h >= 0 ? 'var(--green)' : 'var(--magenta)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px',
                        }}>
                          {p.change24h >= 0 ? (
                            <TrendingUp size={8} />
                          ) : (
                            <TrendingDown size={8} />
                          )}
                          {p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(2)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </GlassPanel>

                {/* Signal Radar */}
                <GlassPanel glow="purple" padding="16px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                  }}>
                    <Target size={12} color="var(--purple)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Signal Radar
                    </span>
                  </div>
                  <SignalRadar axes={radarAxes} size={200} />
                </GlassPanel>
              </div>

              {/* Row 3: Multi-timeframe + indicators */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <GlassPanel padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <LineIcon size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Multi-Timeframe Analysis — {selectedSymbol}
                    </span>
                  </div>
                  <MultiTimeframe symbol={selectedSymbol} />
                </GlassPanel>

                <GlassPanel padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <BarChart3 size={12} color="var(--orange)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Support & Resistance
                    </span>
                  </div>
                  <SupportResistanceLevels />
                </GlassPanel>
              </div>

              {/* Row 4: Funding, OI, Liquidations */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                <GlassPanel glow="cyan" padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <Activity size={12} color="var(--orange)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Funding Rates
                    </span>
                  </div>
                  <FundingRates />
                </GlassPanel>
                <GlassPanel glow="purple" padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <BarChart3 size={12} color="var(--purple)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Open Interest
                    </span>
                  </div>
                  <OpenInterest />
                </GlassPanel>
                <GlassPanel glow="magenta" padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <AlertTriangle size={12} color="var(--magenta)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Liquidations
                    </span>
                  </div>
                  <Liquidations />
                </GlassPanel>
              </div>

              {/* Row 5: Whales + Polymarket */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px' }}>
                <GlassPanel glow="cyan" padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <ArrowLeftRight size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Whale Alerts
                    </span>
                  </div>
                  <WhaleAlerts />
                </GlassPanel>

                {/* Polymarket */}
                <PolymarketSection />
              </div>
            </div>
          )}

          {/* === TAB: TECHNICAL === */}
          {activeTab === 'technical' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fade-in-up 0.4s ease-out' }}>
              {/* Indicator gauges row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                {[
                  { label: 'RSI (14)', value: 50 + selectedPrice.change24h * 3 },
                  { label: 'MACD', value: selectedPrice.change24h > 0 ? 72 : 38 },
                  { label: 'ADX', value: 45 + Math.random() * 20 },
                  { label: 'Stoch', value: 30 + Math.random() * 40 },
                  { label: 'ATR %', value: 1.5 + Math.random() * 1.5 },
                  { label: 'VWAP', value: 98 + Math.random() * 4 },
                ].map((ind, i) => (
                  <GlassPanel key={ind.label} glow={i === 0 ? 'green' : i === 1 ? 'cyan' : 'none'} hoverable padding="12px">
                    <GaugeIndicator
                      value={ind.value}
                      label={ind.label}
                      size="md"
                      zones={ind.label === 'RSI (14)' ? undefined : [
                        { from: 0, to: 30, color: 'var(--magenta)', label: '' },
                        { from: 30, to: 70, color: 'var(--purple)', label: '' },
                        { from: 70, to: 100, color: 'var(--green)', label: '' },
                      ]}
                    />
                  </GlassPanel>
                ))}
              </div>

              {/* Moving averages */}
              <GlassPanel padding="16px">
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}>
                  <LineIcon size={12} color="var(--cyan)" />
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'var(--text-muted)',
                  }}>
                    Moving Averages — {selectedSymbol}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }}>
                  {[
                    { label: 'SMA 20', value: selectedPrice.price * 0.985 },
                    { label: 'SMA 50', value: selectedPrice.price * 0.975 },
                    { label: 'SMA 200', value: selectedPrice.price * 0.92 },
                    { label: 'EMA 12', value: selectedPrice.price * 1.005 },
                    { label: 'EMA 26', value: selectedPrice.price * 0.995 },
                    { label: 'EMA 200', value: selectedPrice.price * 0.91 },
                  ].map((ma) => {
                    const diff = ((selectedPrice.price - ma.value) / ma.value) * 100
                    const above = selectedPrice.price > ma.value
                    return (
                      <div key={ma.label} style={{
                        padding: '10px',
                        borderRadius: '8px',
                        background: 'rgba(10,10,18,0.5)',
                        border: `1px solid ${above ? 'rgba(0,255,136,0.15)' : 'rgba(255,0,128,0.15)'}`,
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                          {ma.label}
                        </div>
                        <div style={{
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          color: above ? 'var(--green)' : 'var(--magenta)',
                        }}>
                          ${ma.value >= 1000 ? ma.value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : ma.value.toFixed(2)}
                        </div>
                        <div style={{
                          fontSize: '8px',
                          fontFamily: 'var(--font-mono)',
                          color: above ? 'var(--green)' : 'var(--magenta)',
                        }}>
                          {above ? '+' : ''}{diff.toFixed(2)}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              </GlassPanel>

              {/* Bollinger + Volume */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <GlassPanel padding="16px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <BarChart3 size={12} color="var(--purple)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Bollinger Bands
                    </span>
                  </div>
                  {(() => {
                    const mid = selectedPrice.price
                    const upper = mid * 1.04
                    const lower = mid * 0.96
                    const pct = ((mid - lower) / (upper - lower)) * 100
                    return (
                      <div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '10px',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--text-muted)',
                          marginBottom: '8px',
                        }}>
                          <span>Upper: ${upper >= 1000 ? upper.toLocaleString('en-US', { maximumFractionDigits: 0 }) : upper.toFixed(2)}</span>
                          <span>Lower: ${lower >= 1000 ? lower.toLocaleString('en-US', { maximumFractionDigits: 0 }) : lower.toFixed(2)}</span>
                        </div>
                        <div style={{ position: 'relative', height: '40px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                          {/* Lower band */}
                          <div style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '2px',
                            background: 'var(--purple)',
                            boxShadow: '0 0 4px var(--purple)',
                          }} />
                          {/* Middle band */}
                          <div style={{
                            position: 'absolute',
                            top: '40%',
                            left: 0,
                            right: 0,
                            height: '1px',
                            background: 'var(--purple)',
                            opacity: 0.5,
                          }} />
                          {/* Price line */}
                          <div style={{
                            position: 'absolute',
                            top: `${100 - pct}%`,
                            left: 0,
                            right: 0,
                            height: '2px',
                            background: 'var(--cyan)',
                            boxShadow: '0 0 8px var(--cyan)',
                          }} />
                          {/* Upper band */}
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            height: '2px',
                            background: 'var(--purple)',
                            boxShadow: '0 0 4px var(--purple)',
                          }} />
                        </div>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'center',
                          marginTop: '6px',
                          fontSize: '9px',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          Position: {pct.toFixed(1)}% ({(pct > 50 ? 'Above' : 'Below')} middle)
                        </div>
                      </div>
                    )
                  })()}
                </GlassPanel>

                <GlassPanel padding="16px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <Activity size={12} color="var(--green)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Volume Analysis
                    </span>
                  </div>
                  {(() => {
                    const volumes = [65, 78, 45, 92, 88, 55, 73, 98, 82, 71, 85, 90]
                    const avgVol = volumes.reduce((a, b) => a + b, 0) / volumes.length
                    return (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
                        {volumes.map((v, i) => (
                          <div key={i} style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                          }}>
                            <div style={{
                              width: '100%',
                              height: `${v}%`,
                              background: v > avgVol
                                ? 'linear-gradient(180deg, var(--cyan), var(--purple))'
                                : 'var(--border)',
                              borderRadius: '2px',
                              boxShadow: v > avgVol ? '0 0 4px rgba(0,245,255,0.3)' : 'none',
                              transition: 'height 0.3s ease-out',
                            }} />
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '6px',
                    fontSize: '8px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}>
                    <span>Vol: ABOVE AVG (Bullish volume)</span>
                  </div>
                </GlassPanel>
              </div>

              {/* More indicators */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {[
                  { label: 'CCI', value: 45 + Math.random() * 60, range: [-100, 100] },
                  { label: 'MFI', value: 50 + Math.random() * 40, range: [0, 100] },
                  { label: 'ROC', value: 1 + Math.random() * 4, range: [-5, 5] },
                ].map((ind) => (
                  <GlassPanel key={ind.label} hoverable padding="12px">
                    <GaugeIndicator
                      value={ind.value}
                      min={ind.range[0]}
                      max={ind.range[1]}
                      label={ind.label}
                      size="md"
                    />
                  </GlassPanel>
                ))}
              </div>

              {/* S/R + Multi-timeframe */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <GlassPanel padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <LineIcon size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Support & Resistance
                    </span>
                  </div>
                  <SupportResistanceLevels />
                </GlassPanel>
                <GlassPanel padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <LineIcon size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Multi-Timeframe — {selectedSymbol}
                    </span>
                  </div>
                  <MultiTimeframe symbol={selectedSymbol} />
                </GlassPanel>
              </div>
            </div>
          )}

          {/* === TAB: ON-CHAIN === */}
          {activeTab === 'onchain' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fade-in-up 0.4s ease-out' }}>
              {/* Whale alerts full */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <GlassPanel glow="cyan" padding="16px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    <ArrowLeftRight size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Whale Activity Feed
                    </span>
                  </div>
                  <WhaleAlerts />
                </GlassPanel>

                <GlassPanel padding="16px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '12px',
                  }}>
                    <Globe size={12} color="var(--purple)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      TVL & DeFi Metrics
                    </span>
                  </div>
                  {(() => {
                    const tvl = [
                      { name: 'Lido', tvl: 15.2e9, change: 2.1 },
                      { name: 'Aave', tvl: 8.4e9, change: -1.2 },
                      { name: 'Maker', tvl: 6.8e9, change: 0.8 },
                      { name: 'Uniswap', tvl: 5.2e9, change: 5.4 },
                      { name: 'Curve', tvl: 3.1e9, change: -2.3 },
                    ]
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {tvl.map((p, i) => (
                          <div key={p.name} style={{
                            display: 'grid',
                            gridTemplateColumns: '80px 1fr 60px',
                            gap: '8px',
                            alignItems: 'center',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            background: 'rgba(10,10,18,0.4)',
                          }}>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{p.name}</span>
                            <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{
                                width: `${(p.tvl / 15.2e9) * 100}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, var(--purple), var(--cyan))',
                                borderRadius: '3px',
                              }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text-primary)' }}>
                                ${(p.tvl / 1e9).toFixed(1)}B
                              </span>
                              <span style={{
                                fontSize: '8px',
                                fontFamily: 'var(--font-mono)',
                                color: p.change >= 0 ? 'var(--green)' : 'var(--magenta)',
                              }}>
                                {p.change >= 0 ? '+' : ''}{p.change}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </GlassPanel>
              </div>

              {/* Exchange flows */}
              <GlassPanel padding="16px">
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '12px',
                }}>
                  <ArrowUpRight size={12} color="var(--green)" />
                  <ArrowDownLeft size={12} color="var(--magenta)" />
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'var(--text-muted)',
                  }}>
                    Exchange Flows (24H)
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                  {[
                    { exchange: 'Binance', flow: 1250000000, type: 'in' as const },
                    { exchange: 'Coinbase', flow: -420000000, type: 'out' as const },
                    { exchange: 'Kraken', flow: 180000000, type: 'in' as const },
                    { exchange: 'Bitfinex', flow: -95000000, type: 'out' as const },
                  ].map((ex) => (
                    <div key={ex.exchange} style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: ex.type === 'in' ? 'rgba(0,255,136,0.04)' : 'rgba(255,0,128,0.04)',
                      border: `1px solid ${ex.type === 'in' ? 'rgba(0,255,136,0.15)' : 'rgba(255,0,128,0.15)'}`,
                      textAlign: 'center',
                    }}>
                      <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginBottom: '4px' }}>{ex.exchange}</div>
                      <div style={{
                        fontSize: '14px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                        color: ex.type === 'in' ? 'var(--green)' : 'var(--magenta)',
                      }}>
                        {ex.type === 'in' ? '+' : ''}{formatLarge(Math.abs(ex.flow))}
                      </div>
                      <div style={{
                        fontSize: '9px',
                        color: ex.type === 'in' ? 'var(--green)' : 'var(--magenta)',
                        marginTop: '2px',
                      }}>
                        {ex.type === 'in' ? 'Net Inflow' : 'Net Outflow'}
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </div>
          )}

          {/* === TAB: TRADING === */}
          {activeTab === 'trading' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fade-in-up 0.4s ease-out' }}>
              {/* Order Book + Margin */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <GlassPanel glow="cyan" padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <BarChart3 size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Order Book Depth — {selectedSymbol}
                    </span>
                  </div>
                  <OrderBookDepth bids={mockBids} asks={mockAsks} spread={spread} symbol={selectedSymbol} />
                </GlassPanel>

                <GlassPanel glow="purple" padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <Shield size={12} color="var(--purple)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Margin Health
                    </span>
                  </div>
                  <MarginHealth />
                </GlassPanel>
              </div>

              {/* Positions */}
              <GlassPanel glow="green" padding="14px">
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '10px',
                }}>
                  <Activity size={12} color="var(--green)" />
                  <span style={{
                    fontSize: '9px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: 'var(--text-muted)',
                  }}>
                    Position Manager
                  </span>
                </div>
                <PositionManager />
              </GlassPanel>

              {/* Kelly Calculator */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <GlassPanel glow="cyan" padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <Target size={12} color="var(--cyan)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Kelly Criterion Calculator
                    </span>
                  </div>
                  <KellyCalculator />
                </GlassPanel>

                <GlassPanel padding="14px">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '10px',
                  }}>
                    <AlertTriangle size={12} color="var(--magenta)" />
                    <span style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-muted)',
                    }}>
                      Recent Liquidations
                    </span>
                  </div>
                  <Liquidations />
                </GlassPanel>
              </div>
            </div>
          )}

          {/* === TAB: MARKETS === */}
          {activeTab === 'markets' && (
            <div style={{ animation: 'fade-in-up 0.4s ease-out' }}>
              <PolymarketSection />
            </div>
          )}
        </main>
      </div>

      {/* === STATUS BAR === */}
      <StatusBar lastUpdated={lastUpdated || undefined} dataSource={dataSource} />

      {/* === GLOBAL STYLES === */}
      <style suppressHydrationWarning>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.01); opacity: 1; }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes orb-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -20px) scale(1.1); }
          50% { transform: translate(-10px, 30px) scale(0.95); }
          75% { transform: translate(-25px, -15px) scale(1.05); }
        }
        @keyframes pulse-live {
          0%, 100% { opacity: 1; box-shadow: 0 0 4px var(--green), 0 0 8px rgba(0,255,136,0.25); }
          50% { opacity: 0.6; box-shadow: 0 0 8px var(--green), 0 0 16px rgba(0,255,136,0.25); }
        }
        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--green);
          animation: pulse-live 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
