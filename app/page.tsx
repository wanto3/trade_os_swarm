'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowLeftRight, ArrowUpRight, BrainCircuit, ExternalLink,
  Filter, RefreshCw, Search, ShieldAlert, ShieldCheck, Sparkles,
} from 'lucide-react'
import type {
  PredictionMarket, PredictionMarketSnapshot, PredictionVenue,
} from '@/lib/services/prediction-markets.service'

type VenueFilter = 'all' | PredictionVenue

interface ResearchResult {
  model: string
  generatedAt: string
  estimate: number
  confidence: 'high' | 'medium' | 'low'
  uncertaintyRange: number
  reasoning: string
  citedEvidence: string[]
  premortemRisks: string[]
  evidenceCount: number
  signalStrength: number
  disclaimer: string
}

function quote(price: number | null): string {
  return price === null ? '—' : `${(price * 100).toFixed(1)}¢`
}

function volume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toFixed(0)
}

function closeLabel(value: string | null): string {
  if (!value) return 'Close unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Close unknown' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function sourceLabel(venue: PredictionVenue): string {
  return venue === 'polymarket' ? 'Polymarket' : 'Kalshi'
}

export default function PredictionMarketDashboard() {
  const [snapshot, setSnapshot] = useState<PredictionMarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<VenueFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [research, setResearch] = useState<ResearchResult | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/prediction-markets', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setSnapshot(data as PredictionMarketSnapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Market feed unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])

  const markets = useMemo(() => [...(snapshot?.markets ?? [])].sort((a, b) => b.volume24h - a.volume24h), [snapshot])
  const quoteCounts = useMemo(() => ({
    polymarket: markets.filter(market => market.venue === 'polymarket' && (market.yesAsk !== null || market.noAsk !== null)).length,
    kalshi: markets.filter(market => market.venue === 'kalshi' && (market.yesAsk !== null || market.noAsk !== null)).length,
  }), [markets])
  const visible = useMemo(() => markets.filter(market =>
    (filter === 'all' || market.venue === filter) &&
    market.title.toLowerCase().includes(search.trim().toLowerCase()),
  ).slice(0, 80), [markets, filter, search])
  const selected = visible.find(market => `${market.venue}:${market.id}` === selectedKey) ?? visible[0] ?? null

  const selectMarket = (market: PredictionMarket) => {
    setSelectedKey(`${market.venue}:${market.id}`)
    setResearch(null)
    setResearchError(null)
  }

  const researchSelected = async () => {
    if (!selected || !snapshot?.modelAvailable) return
    setResearchLoading(true)
    setResearch(null)
    setResearchError(null)
    try {
      const response = await fetch('/api/prediction-markets/research', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, venue: selected.venue }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setResearch(data as ResearchResult)
    } catch (cause) {
      setResearchError(cause instanceof Error ? cause.message : 'Research unavailable')
    } finally {
      setResearchLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-void text-foreground font-sans">
      <div className="mx-auto max-w-[1600px] p-5 md:p-8">
        
        {/* Header */}
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            <Activity className="text-accent" size={28} />
            <span className="text-2xl font-bold tracking-tight">TradeOS</span>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="rounded-full bg-accent/10 px-4 py-2 text-accent">Markets</span>
            <Link href="/arbitrage" className="rounded-full px-4 py-2 text-secondary hover:bg-surface-alt hover:text-foreground transition-colors">
              Arbitrage
            </Link>
            <Link href="/crypto" className="rounded-full px-4 py-2 text-secondary hover:bg-surface-alt hover:text-foreground transition-colors">
              Crypto
            </Link>
          </nav>
        </header>

        {/* Compact Status Bar */}
        <section className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className={`live-dot ${snapshot?.sources.polymarket.ok ? 'bg-profit' : 'bg-loss'}`} />
              <span className="text-secondary">Polymarket: <span className={snapshot?.sources.polymarket.ok ? 'text-profit' : 'text-loss'}>{snapshot?.sources.polymarket.ok ? 'Active' : 'Offline'}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`live-dot ${snapshot?.sources.kalshi.ok ? 'bg-profit' : 'bg-loss'}`} />
              <span className="text-secondary">Kalshi: <span className={snapshot?.sources.kalshi.ok ? 'text-profit' : 'text-loss'}>{snapshot?.sources.kalshi.ok ? 'Active' : 'Offline'}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <BrainCircuit size={16} className={snapshot?.modelAvailable ? 'text-profit' : 'text-warn'} />
              <span className="text-secondary">Model: <span className={snapshot?.modelAvailable ? 'text-profit' : 'text-warn'}>{snapshot?.modelAvailable ? 'Ready' : 'Not Configured'}</span></span>
            </div>
            <div className="text-secondary">
              Last refresh: {snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString() : '—'}
            </div>
          </div>
          <button 
            onClick={() => void refresh()} 
            disabled={loading} 
            className="flex items-center gap-2 rounded-lg bg-surface-alt px-4 py-2 text-sm font-medium hover:bg-border transition disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </section>

        {error && <div className="mb-6 rounded-xl border border-loss/30 bg-loss/10 p-5 text-sm text-loss">{error}</div>}

        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          {/* Markets List Section */}
          <section className="flex flex-col min-w-0 rounded-2xl border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
              <h2 className="text-lg font-semibold">Markets</h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
                  <input 
                    aria-label="Search markets" 
                    value={search} 
                    onChange={event => setSearch(event.target.value)} 
                    placeholder="Search markets..." 
                    className="rounded-lg border border-border bg-surface-alt py-2 pl-10 pr-4 text-sm focus:border-accent focus:outline-none w-64 text-foreground placeholder-muted" 
                  />
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-alt p-1">
                  {(['all', 'polymarket', 'kalshi'] as VenueFilter[]).map(value => (
                    <button 
                      key={value} 
                      onClick={() => { setFilter(value); setSelectedKey(null); setResearch(null) }} 
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${filter === value ? 'bg-surface text-accent shadow-sm' : 'text-secondary hover:text-foreground'}`}
                    >
                      {value === 'all' ? 'All' : sourceLabel(value)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="max-h-[800px] overflow-y-auto p-4 space-y-3">
              {loading && !snapshot ? (
                <div className="grid min-h-64 place-items-center text-muted">Loading markets...</div>
              ) : visible.length === 0 ? (
                <div className="grid min-h-64 place-items-center text-muted">No markets found matching your filters.</div>
              ) : (
                visible.map(market => {
                  const active = selected?.id === market.id && selected.venue === market.venue
                  return (
                    <button 
                      key={`${market.venue}:${market.id}`} 
                      onClick={() => selectMarket(market)} 
                      className={`card-base w-full rounded-xl border p-5 text-left transition ${active ? 'border-accent bg-accent/5' : 'border-border bg-surface-alt hover:border-border-glow'}`}
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className={`badge-neutral rounded-full px-2.5 py-1 text-xs font-medium ${market.venue === 'polymarket' ? 'bg-purple/10 text-purple' : 'bg-cyan/10 text-cyan'}`}>
                          {sourceLabel(market.venue)}
                        </span>
                        <span className="text-xs text-muted">{closeLabel(market.closeTime)}</span>
                      </div>
                      
                      <h3 className="mb-4 text-base font-semibold leading-relaxed">{market.title}</h3>
                      
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-secondary">
                          Yes <span className="text-foreground">{quote(market.yesAsk)}</span> · No <span className="text-foreground">{quote(market.noAsk)}</span>
                        </span>
                        <span className="text-sm text-muted">Vol {volume(market.volume24h)}</span>
                      </div>
                      
                      {market.yesAsk !== null && (
                        <div className="prob-bar mt-2">
                          <div className="prob-bar-fill bg-accent" style={{ width: `${Math.max(0, Math.min(100, market.yesAsk * 100))}%` }} />
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </section>

          {/* Research Panel */}
          <aside className="h-fit rounded-2xl border border-border bg-surface xl:sticky xl:top-6">
            <div className="border-b border-border p-6">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <BrainCircuit size={20} className="text-accent" /> Research
              </h2>
            </div>
            
            {!selected ? (
              <div className="p-6 text-muted">Select a market to view details and research.</div>
            ) : (
              <div className="space-y-6 p-6">
                <div>
                  <div className="mb-2 text-xs font-medium text-accent">{sourceLabel(selected.venue)}</div>
                  <h3 className="text-lg font-semibold leading-snug">{selected.title}</h3>
                  <a href={selected.url} target="_blank" rel="noreferrer" className="mt-3 flex w-fit items-center gap-1 text-sm text-accent hover:underline">
                    View on platform <ExternalLink size={14} />
                  </a>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-border bg-surface-alt p-4">
                    <div className="data-label mb-1 text-xs text-muted">Yes Price</div>
                    <div className="text-2xl font-mono font-medium text-profit">{quote(selected.yesAsk)}</div>
                    <div className="mt-1 text-xs text-muted">Size: {selected.yesAskSize?.toFixed(0) ?? '—'}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-alt p-4">
                    <div className="data-label mb-1 text-xs text-muted">No Price</div>
                    <div className="text-2xl font-mono font-medium text-magenta">{quote(selected.noAsk)}</div>
                    <div className="mt-1 text-xs text-muted">Size: {selected.noAskSize?.toFixed(0) ?? '—'}</div>
                  </div>
                </div>
                
                {selected.rules && (
                  <div className="rounded-xl border border-border bg-surface-alt p-4">
                    <h4 className="mb-2 text-sm font-semibold">Rules & Description</h4>
                    <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-sm text-secondary">{selected.rules}</p>
                  </div>
                )}
                
                <div className="pt-2">
                  <button 
                    onClick={() => void researchSelected()} 
                    disabled={!snapshot?.modelAvailable || researchLoading || selected.yesAsk === null || selected.outcomes[0].toLowerCase() !== 'yes' || selected.outcomes[1].toLowerCase() !== 'no'} 
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-void transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <BrainCircuit size={16} />
                    {researchLoading ? 'Analyzing...' : snapshot?.modelAvailable ? 'Run Research Model' : 'Model Offline'}
                  </button>
                  
                  {researchError && <p className="mt-3 text-sm text-loss">{researchError}</p>}
                  
                  {research && (
                    <div className="mt-6 space-y-4 rounded-xl border border-accent/20 bg-accent/5 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-medium text-secondary">Model Estimate</div>
                          <div className="mt-1 text-3xl font-mono font-semibold text-accent">{(research.estimate * 100).toFixed(1)}%</div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${research.confidence === 'high' ? 'bg-profit/10 text-profit' : research.confidence === 'medium' ? 'bg-warn/10 text-warn' : 'bg-secondary/10 text-secondary'}`}>
                          {research.confidence} Confidence
                        </span>
                      </div>
                      
                      <p className="text-sm leading-relaxed text-foreground">{research.reasoning}</p>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm text-secondary pt-2">
                        <div>Evidence: <span className="text-foreground">{research.evidenceCount} sources</span></div>
                        <div>Signal: <span className="text-foreground">{research.signalStrength}/100</span></div>
                        <div className="col-span-2">Uncertainty: <span className="text-foreground">±{(research.uncertaintyRange * 100).toFixed(0)}%</span></div>
                      </div>
                      
                      {research.premortemRisks.length > 0 && (
                        <div className="pt-2">
                          <div className="mb-1 text-xs font-medium text-secondary">Risk Factors</div>
                          <ul className="list-disc pl-4 text-sm text-foreground">
                            {research.premortemRisks.slice(0, 2).map((risk, i) => (
                              <li key={i}>{risk}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="border-t border-accent/10 pt-4 text-xs text-warn">{research.disclaimer}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Cross-Platform Opportunities */}
        <section className="mt-6 rounded-2xl border border-border bg-surface p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ArrowLeftRight size={20} className="text-accent" /> Cross-Platform Opportunities
              </h2>
              <p className="mt-2 text-sm text-secondary">Potential arbitrage between markets. Verify rules and execution costs.</p>
            </div>
            <span className="badge-neutral rounded-full bg-surface-alt px-4 py-2 text-sm font-medium">
              {snapshot?.crossVenueCandidates.length ?? 0} Opportunities
            </span>
          </div>
          
          {!snapshot?.crossVenueCandidates.length ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-alt p-8 text-center text-sm text-muted">
              No cross-platform opportunities detected in the current data.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {snapshot.crossVenueCandidates.map(candidate => (
                <div key={`${candidate.polymarket.id}:${candidate.kalshi.id}`} className="card-base rounded-xl border border-border bg-surface-alt p-5 transition hover:border-border-glow">
                  <div className="mb-3 text-xs font-medium text-accent">Needs Review</div>
                  <h3 className="mb-3 text-base font-semibold">{candidate.polymarket.title}</h3>
                  <div className="mb-4 text-sm text-secondary">
                    <span className="font-medium text-foreground">{candidate.cheaperPair?.replaceAll('-', ' ').replace(' + ', ' + ') ?? 'Missing asks'}</span>
                    {' · Sum '}
                    <span className="font-mono font-medium text-foreground">{quote(candidate.bestOppositeAskSum)}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <a href={candidate.polymarket.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-purple hover:underline">
                      Polymarket <ArrowUpRight size={14} />
                    </a>
                    <a href={candidate.kalshi.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-cyan hover:underline">
                      Kalshi <ArrowUpRight size={14} />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-8 flex items-center justify-center gap-2 text-sm text-muted pb-8">
          <ShieldAlert size={16} /> Data is for informational purposes only. Verification is required before trading.
        </footer>
      </div>
    </main>
  )
}
