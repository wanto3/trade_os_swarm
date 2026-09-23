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
  return venue === 'polymarket' ? 'POLYMARKET' : 'KALSHI'
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
    <main className="relative min-h-screen overflow-hidden bg-void text-foreground">
      <div className="ambient-orb ambient-orb-1" />
      <div className="hex-grid-bg pointer-events-none fixed inset-0" />
      <div className="relative z-10 mx-auto max-w-[1600px] px-4 pb-16 pt-5 md:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border-glow/60 pb-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan/30 bg-cyan/10 text-cyan"><Activity size={21} /></div>
            <div>
              <div className="font-display text-sm font-bold tracking-[.18em] text-foreground md:text-base">TRADE<span className="text-cyan">OS</span></div>
              <div className="text-[10px] uppercase tracking-[.16em] text-muted-secondary">Prediction market command center</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2 font-semibold text-cyan">Markets</span>
            <Link href="/arbitrage" className="flex items-center gap-1.5 rounded-lg border border-border-glow bg-surface px-3 py-2 text-muted-secondary hover:text-cyan"><ArrowLeftRight size={13} /> Complete-set lab</Link>
            <Link href="/crypto" className="rounded-lg border border-border-glow bg-surface px-3 py-2 text-muted-secondary hover:text-cyan">Crypto dashboard</Link>
          </nav>
        </header>

        <section className="mb-7 grid gap-5 xl:grid-cols-[1fr_330px]">
          <div className="rounded-2xl border border-border-glow bg-gradient-to-br from-cyan/10 via-surface to-purple/5 p-6 md:p-8">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-green/30 bg-green/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-green"><ShieldCheck size={12} /> Read only · paper research</div>
            <h1 className="max-w-3xl font-display text-2xl font-bold leading-tight tracking-wide md:text-4xl">Find the question.<br /><span className="text-cyan">Price the uncertainty.</span></h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-secondary">Live public Kalshi and Polymarket quotes, side-by-side research, and a manual cross-venue review queue. No orders, wallet access, or invented “guaranteed” outcomes.</p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-secondary">
              <span className="rounded-lg border border-border bg-void/60 px-3 py-2">YES / NO asks ≠ true probability</span>
              <span className="rounded-lg border border-border bg-void/60 px-3 py-2">Quotes can move before execution</span>
              <span className="rounded-lg border border-border bg-void/60 px-3 py-2">Rules must match before hedging</span>
            </div>
          </div>
          <div className="rounded-2xl border border-purple/25 bg-surface/90 p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-purple" /> Research stack</div>
            <div className="space-y-3 text-xs text-muted-secondary">
              <div className="flex justify-between gap-3 border-b border-border pb-3"><span>Polymarket</span><span className={snapshot?.sources.polymarket.ok && quoteCounts.polymarket > 0 ? 'text-green' : 'text-orange'}>{snapshot?.sources.polymarket.ok ? `${snapshot.sources.polymarket.count} markets · ${quoteCounts.polymarket} quoted` : 'unavailable'}</span></div>
              <div className="flex justify-between gap-3 border-b border-border pb-3"><span>Kalshi</span><span className={snapshot?.sources.kalshi.ok && quoteCounts.kalshi > 0 ? 'text-green' : 'text-orange'}>{snapshot?.sources.kalshi.ok ? `${snapshot.sources.kalshi.count} markets · ${quoteCounts.kalshi} quoted` : 'unavailable'}</span></div>
              <div className="flex justify-between gap-3 border-b border-border pb-3"><span>On-demand model</span><span className={snapshot?.modelAvailable ? 'text-green' : 'text-orange'}>{snapshot?.modelAvailable ? 'configured' : 'not configured'}</span></div>
              <div className="flex justify-between gap-3"><span>Snapshot</span><span className="font-mono text-foreground">{snapshot ? new Date(snapshot.generatedAt).toLocaleTimeString() : '—'}</span></div>
            </div>
            <button onClick={() => void refresh()} disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan/30 bg-cyan/10 px-3 py-2.5 text-xs font-semibold text-cyan transition hover:bg-cyan/20 disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {loading ? 'Refreshing feeds…' : 'Refresh feeds'}</button>
          </div>
        </section>

        {error && <div className="mb-5 rounded-xl border border-magenta/30 bg-magenta/10 p-4 text-sm text-magenta">Market feeds failed: {error}</div>}
        {snapshot && !snapshot.sources.polymarket.ok && <div className="mb-3 text-xs text-orange">Polymarket unavailable: {snapshot.sources.polymarket.error}</div>}
        {snapshot?.sources.polymarket.ok && snapshot.sources.polymarket.count > 0 && quoteCounts.polymarket === 0 && <div className="mb-3 text-xs text-orange">Polymarket market metadata is live, but its executable CLOB asks are temporarily unavailable. No Polymarket arbitrage is evaluated without asks.</div>}
        {snapshot && !snapshot.sources.kalshi.ok && <div className="mb-3 text-xs text-orange">Kalshi unavailable: {snapshot.sources.kalshi.error}</div>}

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0 rounded-2xl border border-border-glow bg-surface/90">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border p-5">
              <div><h2 className="font-display text-base font-semibold tracking-wider">MARKET TAPE</h2><p className="mt-1 text-xs text-muted-secondary">Top sampled binary markets, sorted by 24h volume · {markets.length} loaded</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-secondary" size={13} /><input aria-label="Search markets" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search questions" className="w-48 pl-8" /></div>
                <Filter size={14} className="text-muted-secondary" />
                {(['all', 'polymarket', 'kalshi'] as VenueFilter[]).map(value => <button key={value} onClick={() => { setFilter(value); setSelectedKey(null); setResearch(null) }} className={`rounded-md border px-2.5 py-1.5 text-[11px] font-semibold ${filter === value ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-border bg-void text-muted-secondary'}`}>{value === 'all' ? 'All' : sourceLabel(value)}</button>)}
              </div>
            </div>
            <div className="max-h-[880px] overflow-y-auto p-3">
              {loading && !snapshot ? <div className="grid min-h-72 place-items-center text-sm text-muted-secondary">Reading live market feeds…</div> : visible.length === 0 ? <div className="grid min-h-72 place-items-center text-sm text-muted-secondary">No markets match this filter, or the source is unavailable.</div> : visible.map(market => {
                const active = selected?.id === market.id && selected.venue === market.venue
                return <button key={`${market.venue}:${market.id}`} onClick={() => selectMarket(market)} className={`mb-2 w-full rounded-xl border p-4 text-left transition ${active ? 'border-cyan/40 bg-cyan/5' : 'border-border bg-void/50 hover:border-border-glow'}`}>
                  <div className="mb-2 flex items-center justify-between gap-3"><span className={`text-[10px] font-bold tracking-wider ${market.venue === 'polymarket' ? 'text-purple' : 'text-cyan'}`}>{sourceLabel(market.venue)}</span><span className="text-[10px] text-muted-secondary">{closeLabel(market.closeTime)}</span></div>
                  <div className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{market.title}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><span className="text-muted-secondary">{market.outcomes[0]} ASK <b className="ml-1 font-mono text-green">{quote(market.yesAsk)}</b></span><span className="text-muted-secondary">{market.outcomes[1]} ASK <b className="ml-1 font-mono text-magenta">{quote(market.noAsk)}</b></span><span className="text-muted-secondary">24H VOL <b className="ml-1 font-mono text-foreground">{volume(market.volume24h)}</b></span></div>
                </button>
              })}
            </div>
          </div>

          <aside className="h-fit rounded-2xl border border-purple/25 bg-surface/90 xl:sticky xl:top-5">
            <div className="border-b border-border p-5"><h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wider"><BrainCircuit size={17} className="text-purple" /> RESEARCH DESK</h2><p className="mt-2 text-xs text-muted-secondary">Select a market to inspect its quote and request evidence-based model research.</p></div>
            {!selected ? <div className="p-6 text-sm text-muted-secondary">Choose a market from the tape.</div> : <div className="space-y-5 p-5">
              <div><div className="mb-2 text-[10px] font-bold tracking-widest text-purple">{sourceLabel(selected.venue)}</div><h3 className="text-base font-semibold leading-snug">{selected.title}</h3><a href={selected.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-cyan">View contract <ExternalLink size={12} /></a></div>
              <div className="grid grid-cols-2 gap-2"><div className="rounded-lg border border-border bg-void p-3"><div className="truncate text-[10px] text-muted-secondary" title={selected.outcomes[0]}>BUY {selected.outcomes[0]} ASK</div><div className="mt-1 font-mono text-xl text-green">{quote(selected.yesAsk)}</div><div className="text-[10px] text-muted-secondary">top size {selected.yesAskSize?.toFixed(0) ?? '—'}</div></div><div className="rounded-lg border border-border bg-void p-3"><div className="truncate text-[10px] text-muted-secondary" title={selected.outcomes[1]}>BUY {selected.outcomes[1]} ASK</div><div className="mt-1 font-mono text-xl text-magenta">{quote(selected.noAsk)}</div><div className="text-[10px] text-muted-secondary">top size {selected.noAskSize?.toFixed(0) ?? '—'}</div></div></div>
              <div className="text-[11px] leading-relaxed text-muted-secondary">{selected.quoteSource === 'orderbook' ? 'Polymarket: best displayed CLOB asks. The size shown is only the top level.' : 'Kalshi: public market-summary asks. Confirm full depth before estimating fills.'}</div>
              {selected.rules && <details className="rounded-lg border border-border bg-void/50 p-3 text-xs text-muted-secondary"><summary className="cursor-pointer font-semibold text-foreground">Settlement rules / description</summary><p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed">{selected.rules}</p></details>}
              <button onClick={() => void researchSelected()} disabled={!snapshot?.modelAvailable || researchLoading || selected.yesAsk === null || selected.outcomes[0].toLowerCase() !== 'yes' || selected.outcomes[1].toLowerCase() !== 'no'} className="flex w-full items-center justify-center gap-2 rounded-lg border border-purple/40 bg-purple/10 px-3 py-3 text-xs font-semibold text-purple transition hover:bg-purple/20 disabled:cursor-not-allowed disabled:opacity-50"><BrainCircuit size={14} />{researchLoading ? 'Gathering evidence…' : snapshot?.modelAvailable ? 'Run model research' : 'Model not configured'}</button>
              {(selected.outcomes[0].toLowerCase() !== 'yes' || selected.outcomes[1].toLowerCase() !== 'no') && <p className="text-[11px] text-muted-secondary">The current model prompt is limited to explicit YES/NO contracts; no forecast is generated for named outcomes.</p>}
              {!snapshot?.modelAvailable && <p className="text-[11px] leading-relaxed text-orange">Set <code>GROQ_API_KEY</code> on the server to enable the existing 70B research pipeline. Until then, no AI forecast is shown.</p>}
              {researchError && <p className="text-xs text-magenta">{researchError}</p>}
              {research && <div className="space-y-3 rounded-xl border border-purple/30 bg-purple/5 p-4 text-xs">
                <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] uppercase tracking-widest text-muted-secondary">Model estimate · not calibrated</div><div className="mt-1 font-mono text-2xl text-purple">{(research.estimate * 100).toFixed(1)}%</div></div><span className="rounded-md border border-purple/30 px-2 py-1 text-[10px] uppercase text-purple">{research.confidence} confidence</span></div>
                <p className="leading-relaxed text-foreground">{research.reasoning}</p>
                <p className="text-muted-secondary">Evidence items: {research.evidenceCount} · signal: {research.signalStrength}/100 · uncertainty range: ±{(research.uncertaintyRange * 100).toFixed(0)} points</p>
                {research.premortemRisks.length > 0 && <p className="text-muted-secondary">What could break this view: {research.premortemRisks.slice(0, 2).join('; ')}</p>}
                <p className="border-t border-purple/20 pt-3 text-orange">{research.disclaimer}</p>
              </div>}
            </div>}
          </aside>
        </section>

        <section className="mt-5 rounded-2xl border border-orange/25 bg-surface/90 p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-display text-sm font-semibold tracking-wider"><ArrowLeftRight size={17} className="text-orange" /> CROSS-VENUE REVIEW QUEUE</h2><p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-secondary">Similar titles and close times are only leads. A lower opposite-ask sum is <b>not</b> arbitrage until settlement rules, both books, fees, transfer costs, and execution are verified.</p></div><span className="rounded-full border border-orange/30 bg-orange/10 px-3 py-1 text-[10px] font-bold text-orange">0 VERIFIED ARBS</span></div>
          {!snapshot?.crossVenueCandidates.length ? <div className="rounded-xl border border-dashed border-border p-5 text-xs text-muted-secondary">No close title/date matches in the current sampled markets. The complete-set lab still scans executable depth within Polymarket.</div> : <div className="grid gap-3 lg:grid-cols-2">{snapshot.crossVenueCandidates.map(candidate => <div key={`${candidate.polymarket.id}:${candidate.kalshi.id}`} className="rounded-xl border border-border bg-void/60 p-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange">Unverified comparison · rule review required</div><div className="line-clamp-2 text-sm font-semibold">{candidate.polymarket.title}</div><div className="mt-2 text-xs text-muted-secondary">{candidate.cheaperPair?.replaceAll('-', ' ').replace(' + ', ' + ') ?? 'Missing opposite asks'} · quoted sum <span className="font-mono text-foreground">{quote(candidate.bestOppositeAskSum)}</span> before fees</div><div className="mt-3 flex gap-4 text-xs"><a href={candidate.polymarket.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-purple">Polymarket <ArrowUpRight size={12} /></a><a href={candidate.kalshi.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan">Kalshi <ArrowUpRight size={12} /></a></div></div>)}</div>}
        </section>

        <footer className="mt-6 flex flex-wrap items-center gap-2 text-[11px] leading-relaxed text-muted-secondary"><ShieldAlert size={14} className="text-orange" /> Paper-only decision support. There is no always-win prediction model or risk-free cross-exchange execution. <Link href="/arbitrage" className="inline-flex items-center gap-1 text-cyan">Open depth-aware complete-set lab <ArrowUpRight size={11} /></Link></footer>
      </div>
    </main>
  )
}
