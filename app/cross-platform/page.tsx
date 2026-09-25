'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Beaker,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Layers3,
  Radar,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import type {
  CrossPlatformArbitrageOpportunity,
  CrossPlatformScanResult,
} from '@/lib/services/cross-platform-arbitrage.service'

interface PaperFill {
  id: string
  recordedAt: number
  eventTitle: string
  combination: string
  shares: number
  netProfit: number
  netReturnPercent: number
  status: CrossPlatformArbitrageOpportunity['status']
}

function money(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}$${value.toFixed(4)}`
}

function compactMoney(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function statusBadge(status: CrossPlatformArbitrageOpportunity['status']) {
  switch (status) {
    case 'opportunity':
      return <span className="badge-profit px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider">Profitable Arb</span>
    case 'near-miss':
      return <span className="badge-warning px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider">Near Miss (&le; $1.02)</span>
    case 'insufficient-depth':
      return <span className="badge-loss px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider">Low Depth</span>
    case 'divergence':
    default:
      return <span className="rounded-md border border-purple/30 bg-purple/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-purple">Price Divergence</span>
  }
}

export default function CrossPlatformPage() {
  const [sharesInput, setSharesInput] = useState(10)
  const [marketLimitInput, setMarketLimitInput] = useState(120)
  const [similarityInput, setSimilarityInput] = useState(0.60)
  const [transferBufferInput, setTransferBufferInput] = useState(0.05)

  const [query, setQuery] = useState({
    shares: 10,
    marketLimit: 120,
    similarity: 0.60,
    transferBuffer: 0.05,
  })

  const [scan, setScan] = useState<CrossPlatformScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | 'profitable' | 'divergent'>('all')

  const [researching, setResearching] = useState<Record<string, boolean>>({})
  const [researchResults, setResearchResults] = useState<Record<string, any>>({})
  const [paperFills, setPaperFills] = useState<PaperFill[]>([])

  const runScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        shares: String(query.shares),
        marketLimit: String(query.marketLimit),
        similarity: String(query.similarity),
        transferBuffer: String(query.transferBuffer),
      })
      const response = await fetch(`/api/cross-platform?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || `Scanner returned HTTP ${response.status}`)
      }
      setScan(payload as CrossPlatformScanResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cross-platform scan failed')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void runScan()
  }, [runScan])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => void runScan(), 20_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, runScan])

  const applyControls = () => {
    setQuery({
      shares: Math.max(1, Number(sharesInput) || 10),
      marketLimit: Math.min(300, Math.max(10, Number(marketLimitInput) || 120)),
      similarity: Number(similarityInput) || 0.60,
      transferBuffer: Math.max(0, Number(transferBufferInput) || 0.05),
    })
  }

  const runDeepResearch = async (opp: CrossPlatformArbitrageOpportunity) => {
    setResearching(prev => ({ ...prev, [opp.id]: true }))
    try {
      const response = await fetch('/api/prediction-markets/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: opp.polymarket.id,
          venue: 'polymarket',
          marketData: {
            id: opp.polymarket.id,
            question: opp.polymarket.title,
            yesAsk: opp.polymarket.yesAsk,
            outcomes: ['Yes', 'No'],
            closeTime: opp.polymarket.closeTime,
            volume24h: opp.polymarket.volume24h,
          },
        }),
      })
      const data = await response.json()
      if (response.ok) {
        setResearchResults(prev => ({ ...prev, [opp.id]: data }))
      }
    } catch (err) {
      console.error('Research error:', err)
    } finally {
      setResearching(prev => ({ ...prev, [opp.id]: false }))
    }
  }

  const recordSimulation = (opp: CrossPlatformArbitrageOpportunity) => {
    const combo = opp.bestCombination
    setPaperFills(prev => [
      {
        id: `${opp.id}-${Date.now()}`,
        recordedAt: Date.now(),
        eventTitle: opp.eventTitle,
        combination: combo.name,
        shares: combo.fillableShares,
        netProfit: combo.netProfit,
        netReturnPercent: combo.netReturnPercent,
        status: opp.status,
      },
      ...prev,
    ].slice(0, 30))
  }

  const displayedOpportunities = useMemo(() => {
    if (!scan) return []
    if (filterMode === 'profitable') {
      return scan.opportunities.filter(o => o.status === 'opportunity')
    }
    if (filterMode === 'divergent') {
      return scan.opportunities.filter(o => o.divergence.spreadPercent >= 8)
    }
    return scan.opportunities
  }, [scan, filterMode])

  const simulatedTotalProfit = paperFills.reduce((sum, f) => sum + f.netProfit, 0)

  return (
    <main className="relative min-h-screen bg-void text-foreground">
      <div className="relative z-10 mx-auto max-w-[1500px] px-4 py-8 md:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-alt text-secondary transition-colors hover:text-accent"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold md:text-2xl">Cross-Platform Arbitrage Scanner</h1>
                <span className="rounded-full border border-purple/30 bg-purple/10 px-2.5 py-0.5 text-xs font-semibold text-purple">
                  Polymarket &times; Kalshi
                </span>
              </div>
              <p className="mt-1 text-sm text-secondary">
                Detect inter-exchange complete sets (&lt; $1.00 payout lock) and market probability divergences
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-2.5 text-xs font-medium text-secondary">
              <span className={loading ? 'h-2.5 w-2.5 animate-pulse rounded-full bg-warn' : 'live-dot h-2.5 w-2.5 rounded-full bg-profit'} />
              {loading ? 'SCANNING VENUES…' : `LIVE SCAN: ${scan ? new Date(scan.generatedAt).toLocaleTimeString() : '—'}`}
            </div>
          </div>
        </header>

        {/* Overview Stats Bar */}
        <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">Polymarket Scanned</div>
            <div className="mt-2 font-mono text-2xl font-bold">{scan?.polymarketScanned ?? '—'}</div>
            <div className="mt-1 text-[11px] text-muted">Active binary orderbooks</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">Kalshi Scanned</div>
            <div className="mt-2 font-mono text-2xl font-bold">{scan?.kalshiScanned ?? '—'}</div>
            <div className="mt-1 text-[11px] text-muted">CFTC binary contracts</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">Matched Pairs</div>
            <div className="mt-2 font-mono text-2xl font-bold text-accent">{scan?.candidatesFound ?? 0}</div>
            <div className="mt-1 text-[11px] text-muted">Verified event overlap</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">Riskless Arbs (&lt; $1)</div>
            <div className={`mt-2 font-mono text-2xl font-bold ${(scan?.profitableCount ?? 0) > 0 ? 'text-profit' : 'text-foreground'}`}>
              {scan?.profitableCount ?? 0}
            </div>
            <div className="mt-1 text-[11px] text-muted">Net positive after fees</div>
          </div>
          <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-secondary">High Divergence (&gt;8%)</div>
            <div className="mt-2 font-mono text-2xl font-bold text-purple">{scan?.divergenceCount ?? 0}</div>
            <div className="mt-1 text-[11px] text-muted">Pricing discrepancy leads</div>
          </div>
        </section>

        {/* How It Works Explainer Banner */}
        <section className="mb-6 rounded-2xl border border-accent/20 bg-gradient-to-r from-accent/5 via-surface to-purple/5 p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-accent">
                <Scale size={16} /> How Cross-Platform Arbitrage Works
              </div>
              <p className="mt-1 text-xs text-secondary leading-relaxed max-w-4xl">
                When the same event is listed on both Polymarket and Kalshi, each contract guarantees a <strong>$1.00 payout</strong> upon resolution.
                By purchasing <strong>YES on Venue A</strong> and <strong>NO on Venue B</strong>, you hold both sides of the event. If the combined ask cost is less than $1.00 (accounting for fees and capital transfer), you lock in a guaranteed profit upon settlement regardless of the event outcome.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-xs font-mono bg-surface-alt px-3 py-2 rounded-lg border border-border">
              <span className="text-profit">Poly YES + Kalshi NO</span>
              <span className="text-muted">&lt;</span>
              <span className="font-bold text-foreground">$1.00 Payout</span>
            </div>
          </div>
        </section>

        {/* Controls Bar */}
        <section className="mb-6 card-base rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <label className="grid gap-1 text-xs font-medium text-secondary">
                Shares per trade
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={sharesInput}
                  onChange={e => setSharesInput(Number(e.target.value))}
                  className="w-28 rounded-lg border border-border bg-surface-alt px-3 py-1.5 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>

              <label className="grid gap-1 text-xs font-medium text-secondary">
                Markets to scan
                <input
                  type="number"
                  min={20}
                  max={300}
                  step={20}
                  value={marketLimitInput}
                  onChange={e => setMarketLimitInput(Number(e.target.value))}
                  className="w-28 rounded-lg border border-border bg-surface-alt px-3 py-1.5 font-mono text-sm text-foreground focus:border-accent focus:outline-none"
                />
              </label>

              <label className="grid gap-1 text-xs font-medium text-secondary">
                Min Similarity
                <select
                  value={similarityInput}
                  onChange={e => setSimilarityInput(Number(e.target.value))}
                  className="rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  <option value={0.50}>50% (Broad)</option>
                  <option value={0.60}>60% (Recommended)</option>
                  <option value={0.75}>75% (Strict)</option>
                  <option value={0.85}>85% (Near Identical)</option>
                </select>
              </label>

              <label className="grid gap-1 text-xs font-medium text-secondary">
                Transfer Buffer
                <select
                  value={transferBufferInput}
                  onChange={e => setTransferBufferInput(Number(e.target.value))}
                  className="rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  <option value={0.00}>$0.00 (Zero buffer)</option>
                  <option value={0.05}>$0.05 (Standard gas/wire)</option>
                  <option value={0.10}>$0.10 (Conservative)</option>
                </select>
              </label>

              <button
                onClick={applyControls}
                disabled={loading}
                className="mt-auto flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-accent/90 disabled:opacity-50"
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                Apply &amp; Scan
              </button>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={e => setAutoRefresh(e.target.checked)}
                  className="rounded border-border text-accent focus:ring-0"
                />
                Auto-scan (20s)
              </label>

              <div className="flex rounded-lg border border-border bg-surface-alt p-1 text-xs font-medium">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`rounded-md px-3 py-1 transition-colors ${filterMode === 'all' ? 'bg-surface text-foreground font-semibold shadow-sm' : 'text-secondary hover:text-foreground'}`}
                >
                  All ({scan?.opportunities.length ?? 0})
                </button>
                <button
                  onClick={() => setFilterMode('profitable')}
                  className={`rounded-md px-3 py-1 transition-colors ${filterMode === 'profitable' ? 'bg-surface text-profit font-semibold shadow-sm' : 'text-secondary hover:text-foreground'}`}
                >
                  Arbs Only ({scan?.profitableCount ?? 0})
                </button>
                <button
                  onClick={() => setFilterMode('divergent')}
                  className={`rounded-md px-3 py-1 transition-colors ${filterMode === 'divergent' ? 'bg-surface text-purple font-semibold shadow-sm' : 'text-secondary hover:text-foreground'}`}
                >
                  Divergence ({scan?.divergenceCount ?? 0})
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Content Layout: Opportunities Tape + Paper Ledger */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* Main Opportunities List */}
          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss flex items-center gap-3">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            {loading && !scan ? (
              <div className="grid min-h-[350px] place-items-center rounded-xl border border-border bg-surface text-center text-secondary">
                <div>
                  <RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-accent" />
                  <p className="font-semibold text-foreground">Querying Polymarket CLOB &amp; Kalshi APIs…</p>
                  <p className="mt-1 text-xs text-muted">Calculating cross-venue orderbook matching</p>
                </div>
              </div>
            ) : displayedOpportunities.length === 0 ? (
              <div className="grid min-h-[320px] place-items-center rounded-xl border border-dashed border-border bg-surface text-center p-8">
                <div className="max-w-md">
                  <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-profit" />
                  <h3 className="text-lg font-semibold text-foreground">No matches found with current filter</h3>
                  <p className="mt-2 text-sm text-secondary">
                    Try setting a lower similarity threshold (e.g. 50%) or scanning more markets to broaden the search scope.
                  </p>
                  <button
                    onClick={() => { setSimilarityInput(0.50); setQuery(q => ({ ...q, similarity: 0.50 })) }}
                    className="mt-4 rounded-lg bg-surface-alt border border-border px-4 py-2 text-xs font-semibold hover:border-accent"
                  >
                    Set Similarity to 50% &amp; Retry
                  </button>
                </div>
              </div>
            ) : (
              displayedOpportunities.map(opp => {
                const combo = opp.bestCombination
                const isResearching = researching[opp.id]
                const aiResult = researchResults[opp.id]

                return (
                  <article
                    key={opp.id}
                    className="card-base rounded-xl border border-border bg-surface p-5 shadow-sm transition-colors hover:border-accent/40"
                  >
                    {/* Card Header & Status */}
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {statusBadge(opp.status)}
                        <span className="rounded-md border border-border bg-surface-alt px-2.5 py-1 text-xs font-mono text-secondary">
                          {(opp.titleSimilarity * 100).toFixed(0)}% Title Match
                        </span>
                        {opp.closeTimeDiffHours > 0 && (
                          <span className="rounded-md border border-border bg-surface-alt px-2.5 py-1 text-xs text-muted flex items-center gap-1">
                            <Clock3 size={12} /> &plusmn;{opp.closeTimeDiffHours.toFixed(1)}h
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => recordSimulation(opp)}
                          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent hover:border-accent hover:text-white transition-all"
                        >
                          <Beaker size={14} /> Record Simulation
                        </button>
                      </div>
                    </div>

                    {/* Venue Cards: Polymarket vs Kalshi */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {/* Polymarket Leg */}
                      <div className="rounded-xl border border-border bg-surface-alt/70 p-4">
                        <div className="flex items-center justify-between text-xs font-bold text-accent mb-2">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-accent" /> POLYMARKET (USDC)
                          </span>
                          <a
                            href={opp.polymarket.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-secondary hover:text-accent flex items-center gap-1"
                          >
                            Open Market <ExternalLink size={12} />
                          </a>
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                          {opp.polymarket.title}
                        </p>
                        <div className="mt-3 flex items-center gap-3 text-xs font-mono">
                          <div className="flex-1 rounded-lg border border-border bg-surface p-2 text-center">
                            <div className="text-[10px] uppercase text-secondary">YES Ask</div>
                            <div className="text-sm font-bold text-foreground">
                              {opp.polymarket.yesAsk !== null ? `$${opp.polymarket.yesAsk.toFixed(3)}` : '—'}
                            </div>
                            <div className="text-[10px] text-muted">
                              {opp.polymarket.yesAskSize ? `${opp.polymarket.yesAskSize} shs` : ''}
                            </div>
                          </div>
                          <div className="flex-1 rounded-lg border border-border bg-surface p-2 text-center">
                            <div className="text-[10px] uppercase text-secondary">NO Ask</div>
                            <div className="text-sm font-bold text-foreground">
                              {opp.polymarket.noAsk !== null ? `$${opp.polymarket.noAsk.toFixed(3)}` : '—'}
                            </div>
                            <div className="text-[10px] text-muted">
                              {opp.polymarket.noAskSize ? `${opp.polymarket.noAskSize} shs` : ''}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Kalshi Leg */}
                      <div className="rounded-xl border border-border bg-surface-alt/70 p-4">
                        <div className="flex items-center justify-between text-xs font-bold text-purple mb-2">
                          <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-purple" /> KALSHI (USD)
                          </span>
                          <a
                            href={opp.kalshi.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-secondary hover:text-purple flex items-center gap-1"
                          >
                            {opp.kalshi.ticker} <ExternalLink size={12} />
                          </a>
                        </div>
                        <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
                          {opp.kalshi.title}
                        </p>
                        <div className="mt-3 flex items-center gap-3 text-xs font-mono">
                          <div className="flex-1 rounded-lg border border-border bg-surface p-2 text-center">
                            <div className="text-[10px] uppercase text-secondary">YES Ask</div>
                            <div className="text-sm font-bold text-foreground">
                              {opp.kalshi.yesAsk !== null ? `$${opp.kalshi.yesAsk.toFixed(3)}` : '—'}
                            </div>
                            <div className="text-[10px] text-muted">
                              {opp.kalshi.yesAskSize ? `${opp.kalshi.yesAskSize} shs` : ''}
                            </div>
                          </div>
                          <div className="flex-1 rounded-lg border border-border bg-surface p-2 text-center">
                            <div className="text-[10px] uppercase text-secondary">NO Ask</div>
                            <div className="text-sm font-bold text-foreground">
                              {opp.kalshi.noAsk !== null ? `$${opp.kalshi.noAsk.toFixed(3)}` : '—'}
                            </div>
                            <div className="text-[10px] text-muted">
                              {opp.kalshi.noAskSize ? `${opp.kalshi.noAskSize} shs` : ''}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Best Arbitrage Combo & Financial Breakdown */}
                    <div className="mt-4 rounded-xl border border-border bg-surface-alt p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wider text-secondary">
                            Optimal Cross-Venue Execution
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                            <span className="rounded bg-surface px-2.5 py-1 border border-border font-mono text-xs">
                              Buy {combo.fillableShares} {combo.leg1.venue.toUpperCase()} {combo.leg1.outcome} @ ${combo.leg1.askPrice?.toFixed(3)}
                            </span>
                            <span className="text-muted font-bold">+</span>
                            <span className="rounded bg-surface px-2.5 py-1 border border-border font-mono text-xs">
                              Buy {combo.fillableShares} {combo.leg2.venue.toUpperCase()} {combo.leg2.outcome} @ ${combo.leg2.askPrice?.toFixed(3)}
                            </span>
                            <span className="text-muted font-bold">&rarr;</span>
                            <span className="rounded bg-profit/10 border border-profit/30 px-2.5 py-1 font-mono text-xs text-profit">
                              Pays ${combo.payout.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-5 shrink-0">
                          <div>
                            <div className="text-[10px] uppercase font-semibold text-secondary">Combined Cost</div>
                            <div className="font-mono text-base font-bold text-foreground">
                              ${combo.combinedUnitCost.toFixed(3)}/unit
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase font-semibold text-secondary">Net Profit</div>
                            <div className={`font-mono text-xl font-bold ${combo.netProfit > 0 ? 'text-profit' : 'text-loss'}`}>
                              {money(combo.netProfit)}
                            </div>
                            <div className={`font-mono text-xs font-semibold ${combo.netReturnPercent > 0 ? 'text-profit' : 'text-loss'}`}>
                              {combo.netReturnPercent > 0 ? '+' : ''}{combo.netReturnPercent.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Detail Metrics Row */}
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border/50 pt-2 text-[11px] text-muted font-mono">
                        <span>Gross Outlay: ${combo.totalCost.toFixed(3)}</span>
                        <span>Est. Taker Fees: -${combo.totalFees.toFixed(3)}</span>
                        <span>Transfer Buffer: -${combo.transferBuffer.toFixed(2)}</span>
                        <span>Fillable: {combo.fillableShares} of {combo.requestedShares} requested</span>
                      </div>
                    </div>

                    {/* Action Recommendation Banner */}
                    <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
                      opp.status === 'opportunity'
                        ? 'border-profit/30 bg-profit/5'
                        : opp.status === 'near-miss'
                          ? 'border-warn/30 bg-warn/5'
                          : 'border-purple/30 bg-purple/5'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold uppercase tracking-wider ${
                          opp.status === 'opportunity' ? 'text-profit' : opp.status === 'near-miss' ? 'text-warn' : 'text-purple'
                        }`}>
                          {opp.status === 'opportunity' ? 'Execution Strategy' : 'Market Insight'}
                        </span>
                        {!aiResult && (
                          <button
                            onClick={() => runDeepResearch(opp)}
                            disabled={isResearching}
                            className="text-xs flex items-center gap-1 font-medium bg-surface px-2.5 py-1 rounded border border-border hover:border-accent text-secondary hover:text-foreground transition-all disabled:opacity-50"
                          >
                            {isResearching ? <RefreshCw size={12} className="animate-spin text-accent" /> : <Radar size={12} className="text-accent" />}
                            {isResearching ? 'Analyzing with AI…' : 'Deep Research Event'}
                          </button>
                        )}
                      </div>
                      <p className="text-secondary text-xs sm:text-sm leading-relaxed">
                        {opp.recommendedAction}
                      </p>

                      {/* AI Research Result if triggered */}
                      {aiResult && (
                        <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-xs">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-semibold text-profit flex items-center gap-1">
                              <BrainCircuit size={14} /> AI Fundamental Estimate: {(aiResult.estimate * 100).toFixed(1)}% YES
                            </span>
                            <span className="text-[10px] font-mono text-muted uppercase">
                              {aiResult.confidence} Confidence &bull; {aiResult.model}
                            </span>
                          </div>
                          <p className="text-secondary leading-relaxed">{aiResult.reasoning}</p>
                        </div>
                      )}
                    </div>

                    {/* Risk & Settlement Verification Notes */}
                    {opp.riskNotes.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted">
                        {opp.riskNotes.map((note, idx) => (
                          <span key={idx} className="flex items-center gap-1 bg-surface-alt px-2.5 py-1 rounded border border-border">
                            <ShieldCheck size={11} className="text-accent" /> {note}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                )
              })
            )}
          </div>

          {/* Sidebar: Paper Trading Ledger & Guidelines */}
          <aside className="flex flex-col gap-6">
            {/* Paper Execution Ledger */}
            <div className="card-base flex flex-col p-6 bg-surface rounded-xl border border-border shadow-sm xl:sticky xl:top-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Beaker size={18} className="text-accent" /> Cross-Venue Simulation Log
              </h2>
              <p className="mt-1 text-xs text-secondary">
                Simulated fills assuming simultaneous fills on Polymarket and Kalshi.
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-surface-alt p-3.5">
                  <div className="text-[10px] font-semibold text-secondary uppercase tracking-wider">Simulated Trades</div>
                  <div className="mt-1 font-mono text-2xl font-bold">{paperFills.length}</div>
                </div>
                <div className="rounded-xl border border-border bg-surface-alt p-3.5">
                  <div className="text-[10px] font-semibold text-secondary uppercase tracking-wider">Simulated Net P&amp;L</div>
                  <div className={`mt-1 font-mono text-2xl font-bold ${simulatedTotalProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {money(simulatedTotalProfit)}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex-1 space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {paperFills.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-secondary bg-surface-alt/40">
                    <Wallet className="mx-auto mb-2 text-muted" size={20} />
                    Click &ldquo;Record Simulation&rdquo; on any opportunity card to track paper trades.
                  </div>
                ) : (
                  paperFills.map(fill => (
                    <div key={fill.id} className="rounded-lg border border-border bg-surface-alt p-3 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground line-clamp-1">{fill.eventTitle}</span>
                        <span className={`font-mono font-bold shrink-0 ${fill.netProfit > 0 ? 'text-profit' : 'text-loss'}`}>
                          {money(fill.netProfit)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                        <span>{fill.shares} shares &bull; {fill.combination}</span>
                        <span>{new Date(fill.recordedAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Cross-Venue Execution Checklist */}
              <div className="mt-6 border-t border-border pt-4">
                <div className="text-xs font-bold uppercase tracking-wider text-secondary mb-2">
                  Cross-Venue Rules &amp; Checklist
                </div>
                <ul className="space-y-2 text-xs text-muted leading-relaxed">
                  <li className="flex items-start gap-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
                    <span><strong>Resolution Source:</strong> Confirm both contracts use the same primary resolver (e.g. Associated Press vs UMA).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
                    <span><strong>Settlement Time:</strong> Ensure markets do not have ambiguous intermediate expiration windows.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-accent" />
                    <span><strong>Capital Mobility:</strong> Allow for Polygon USDC withdrawal and USD bank wire delays when rebalancing.</span>
                  </li>
                </ul>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}
