'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowLeftRight, ArrowUpRight, BrainCircuit, CheckCircle2,
  ChevronRight, Clock3, DollarSign, ExternalLink, Eye, Gauge, Layers3,
  LockKeyhole, Radar, RefreshCw, Search, AlertTriangle, ShieldCheck,
  SlidersHorizontal, Sparkles, TrendingUp,
} from 'lucide-react'
import type {
  PredictionMarket, PredictionMarketSnapshot, PredictionVenue,
} from '@/lib/services/prediction-markets.service'

type VenueFilter = 'all' | PredictionVenue
type SortMode = 'volume' | 'tight' | 'balanced' | 'closing'

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

interface ArbitrageOpportunitySummary {
  marketId: string
  question: string
  outcomes: [string, string]
  url: string
  requestedShares: number
  fillable: boolean
  status: 'opportunity' | 'near-miss' | 'insufficient-depth'
  yes: { averagePrice: number | null }
  no: { averagePrice: number | null }
  acquisitionCost: number
  payout: number
  fees: number
  netProfit: number
  netReturnPercent: number
  combinedAveragePrice: number | null
  feeSource: 'live' | 'conservative-fallback'
}

interface ArbitrageScanSummary {
  generatedAt: string
  paperOnly: true
  requestedShares: number
  scannedMarkets: number
  profitableCount: number
  opportunities: ArbitrageOpportunitySummary[]
  warnings: string[]
}

function quote(price: number | null): string {
  return price === null ? 'Not quoted' : `${(price * 100).toFixed(1)}¢`
}

function compactVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return value.toFixed(0)
}

function money(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toFixed(2)}`
}

function closeLabel(value: string | null): string {
  if (!value) return 'Close unknown'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Close unknown'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function sourceLabel(venue: PredictionVenue): string {
  return venue === 'polymarket' ? 'Polymarket' : 'Kalshi'
}

function marketKey(market: PredictionMarket): string {
  return `${market.venue}:${market.id}`
}

function askTotal(market: PredictionMarket): number | null {
  return market.yesAsk !== null && market.noAsk !== null ? market.yesAsk + market.noAsk : null
}

function quoteQuality(market: PredictionMarket): {
  label: 'Strong' | 'Fair' | 'Thin' | 'Incomplete'
  detail: string
  className: string
} {
  const total = askTotal(market)
  if (total === null) return { label: 'Incomplete', detail: 'One side is missing', className: 'text-warn bg-warn/10 border-warn/20' }
  const friction = Math.abs(total - 1)
  if (friction <= 0.025 && market.volume24h >= 5_000) return { label: 'Strong', detail: 'Tight quotes, active market', className: 'text-profit bg-profit/10 border-profit/20' }
  if (friction <= 0.06 && market.volume24h >= 500) return { label: 'Fair', detail: 'Usable, verify depth', className: 'text-accent bg-accent/10 border-accent/20' }
  return { label: 'Thin', detail: 'Higher execution risk', className: 'text-warn bg-warn/10 border-warn/20' }
}

function sortMarkets(markets: PredictionMarket[], mode: SortMode): PredictionMarket[] {
  return [...markets].sort((a, b) => {
    if (mode === 'volume') return b.volume24h - a.volume24h
    if (mode === 'balanced') return Math.abs((a.yesAsk ?? 0.5) - 0.5) - Math.abs((b.yesAsk ?? 0.5) - 0.5)
    if (mode === 'tight') return Math.abs((askTotal(a) ?? 99) - 1) - Math.abs((askTotal(b) ?? 99) - 1)
    const aTime = a.closeTime ? Date.parse(a.closeTime) : Infinity
    const bTime = b.closeTime ? Date.parse(b.closeTime) : Infinity
    return (Number.isFinite(aTime) ? aTime : Infinity) - (Number.isFinite(bTime) ? bTime : Infinity)
  })
}

function CheckLine({ good, label, detail }: { good: boolean; label: string; detail: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-void/35 p-3.5">
      {good ? <CheckCircle2 className="mt-0.5 shrink-0 text-profit" size={17} /> : <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={17} />}
      <div><div className="text-sm font-semibold text-foreground">{label}</div><div className="mt-0.5 text-xs leading-relaxed text-secondary">{detail}</div></div>
    </div>
  )
}

export default function PredictionMarketDashboard() {
  const [snapshot, setSnapshot] = useState<PredictionMarketSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<VenueFilter>('all')
  const [sort, setSort] = useState<SortMode>('volume')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [research, setResearch] = useState<ResearchResult | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [arbitrage, setArbitrage] = useState<ArbitrageScanSummary | null>(null)
  const [arbitrageLoading, setArbitrageLoading] = useState(true)
  const [arbitrageError, setArbitrageError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/prediction-markets', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setSnapshot(data as PredictionMarketSnapshot)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Market feeds are temporarily unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  const scanArbitrage = useCallback(async () => {
    setArbitrageLoading(true)
    setArbitrageError(null)
    try {
      const response = await fetch('/api/arbitrage?shares=10&marketLimit=100', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || data.success === false) throw new Error(data.error ?? `HTTP ${response.status}`)
      setArbitrage(data as ArbitrageScanSummary)
    } catch (cause) {
      setArbitrageError(cause instanceof Error ? cause.message : 'Arbitrage scan is temporarily unavailable')
    } finally {
      setArbitrageLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [refresh])


  useEffect(() => {
    void scanArbitrage()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void scanArbitrage()
    }, 90_000)
    return () => window.clearInterval(timer)
  }, [scanArbitrage])

  const markets = useMemo(() => snapshot?.markets ?? [], [snapshot])
  const quoteCounts = useMemo(() => ({
    polymarket: markets.filter(m => m.venue === 'polymarket' && m.yesAsk !== null && m.noAsk !== null).length,
    kalshi: markets.filter(m => m.venue === 'kalshi' && m.yesAsk !== null && m.noAsk !== null).length,
  }), [markets])
  const fullyQuoted = quoteCounts.polymarket + quoteCounts.kalshi
  const tightMarkets = useMemo(() => markets.filter(market => {
    const total = askTotal(market)
    return total !== null && Math.abs(total - 1) <= 0.025 && market.volume24h >= 5_000
  }).length, [markets])
  const visible = useMemo(() => sortMarkets(markets.filter(market =>
    (filter === 'all' || market.venue === filter) &&
    market.title.toLowerCase().includes(search.trim().toLowerCase()),
  ), sort).slice(0, 40), [markets, filter, search, sort])
  const selected = visible.find(market => marketKey(market) === selectedKey) ?? visible[0] ?? null
  const selectedTotal = selected ? askTotal(selected) : null
  const selectedQuality = selected ? quoteQuality(selected) : null
  const lockedProfit = useMemo(() => arbitrage?.opportunities
    .filter(item => item.status === 'opportunity' && item.fillable && item.netProfit > 0)
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 3) ?? [], [arbitrage])
  const closestSetups = useMemo(() => arbitrage?.opportunities
    .filter(item => item.status === 'near-miss' && item.fillable)
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 3) ?? [], [arbitrage])
  const modelCanRun = Boolean(selected && snapshot?.modelAvailable && selected.yesAsk !== null &&
    selected.outcomes[0].toLowerCase() === 'yes' && selected.outcomes[1].toLowerCase() === 'no')

  const selectMarket = (market: PredictionMarket) => {
    setSelectedKey(marketKey(market))
    setResearch(null)
    setResearchError(null)
  }

  const changeFilter = (value: VenueFilter) => {
    setFilter(value)
    setSelectedKey(null)
    setResearch(null)
    setResearchError(null)
  }

  const researchSelected = async () => {
    if (!selected || !modelCanRun) return
    setResearchLoading(true)
    setResearch(null)
    setResearchError(null)
    try {
      const response = await fetch('/api/prediction-markets/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, venue: selected.venue }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setResearch(data as ResearchResult)
    } catch (cause) {
      setResearchError(cause instanceof Error ? cause.message : 'Research is temporarily unavailable')
    } finally {
      setResearchLoading(false)
    }
  }

  const selectedYesShare = selected && selectedTotal && selected.yesAsk !== null
    ? Math.max(3, Math.min(97, selected.yesAsk / selectedTotal * 100))
    : 50

  return (
    <main className="relative min-h-screen overflow-hidden bg-void text-foreground">
      <div className="subtle-grid pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1480px] px-4 pb-14 pt-4 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-accent to-purple text-white shadow-lg shadow-accent/20"><Activity size={20} /></div>
            <div><div className="text-lg font-extrabold tracking-tight">TradeOS</div><div className="text-[11px] font-medium text-secondary">Prediction intelligence</div></div>
          </div>
          <nav className="flex items-center gap-1 rounded-full border border-border bg-surface/80 p-1 text-xs font-semibold shadow-sm">
            <span className="rounded-full bg-accent px-4 py-2 text-white">Markets</span>
            <Link href="/arbitrage" className="rounded-full px-4 py-2 text-secondary hover:bg-surface-alt hover:text-foreground">Arbitrage lab</Link>
            <Link href="/crypto" className="hidden rounded-full px-4 py-2 text-secondary hover:bg-surface-alt hover:text-foreground sm:block">Crypto</Link>
          </nav>
        </header>

        <section className="glass-panel mb-6 overflow-hidden rounded-[28px]">
          <div className="grid lg:grid-cols-[1.3fr_.7fr]">
            <div className="p-6 sm:p-8 lg:p-10">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-profit/20 bg-profit/10 px-3 py-1.5 text-xs font-semibold text-profit"><ShieldCheck size={14} /> Read-only decision support</div>
              <h1 className="max-w-3xl text-3xl font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-5xl">Find the edge.<br /><span className="bg-gradient-to-r from-emerald-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">Verify the math.</span></h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-secondary sm:text-base">Locked-price arbitrage appears first. Evidence-backed market ideas come next. If nothing clears fees, liquidity, and execution buffers, the dashboard says so plainly.</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button onClick={() => document.getElementById('opportunity-radar')?.scrollIntoView({ behavior: 'smooth' })} className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-white shadow-lg shadow-accent/20 transition hover:-translate-y-0.5">View money opportunities <ChevronRight size={16} /></button>
                <div className="text-xs leading-5 text-secondary"><span className="font-semibold text-foreground">Priority order:</span> locked arbitrage first,<br className="hidden sm:block" /> researched value second.</div>
              </div>
            </div>
            <div className="border-t border-border bg-void/25 p-6 lg:border-l lg:border-t-0 lg:p-8">
              <div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-secondary">Today at a glance</div><div className="mt-1 text-sm text-foreground">Live public market snapshot</div></div><button aria-label="Refresh market feeds" onClick={() => void refresh()} disabled={loading} className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface-alt text-secondary transition hover:border-accent/40 hover:text-accent disabled:opacity-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-border bg-surface-alt/80 p-4"><div className="text-2xl font-bold">{markets.length || '—'}</div><div className="mt-1 text-xs text-secondary">Markets scanned</div></div>
                <div className="rounded-2xl border border-border bg-surface-alt/80 p-4"><div className="text-2xl font-bold text-profit">{fullyQuoted || '—'}</div><div className="mt-1 text-xs text-secondary">Complete quotes</div></div>
                <div className="rounded-2xl border border-border bg-surface-alt/80 p-4"><div className="text-2xl font-bold text-accent">{tightMarkets}</div><div className="mt-1 text-xs text-secondary">Decision-ready books</div></div>
                <div className="rounded-2xl border border-border bg-surface-alt/80 p-4"><div className="text-2xl font-bold text-purple">{snapshot?.crossVenueCandidates.length ?? 0}</div><div className="mt-1 text-xs text-secondary">Cross-venue leads</div></div>
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-secondary"><span>{snapshot ? `Updated ${new Date(snapshot.generatedAt).toLocaleTimeString()}` : 'Connecting to feeds…'}</span><span className={snapshot?.modelAvailable ? 'text-profit' : 'text-warn'}>{snapshot?.modelAvailable ? 'AI research ready' : 'AI not configured'}</span></div>
            </div>
          </div>
        </section>

        <section id="opportunity-radar" className="glass-panel mb-6 overflow-hidden rounded-3xl border-profit/20">
          <div className="border-b border-border bg-gradient-to-r from-profit/10 via-transparent to-accent/5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2"><Radar className="text-profit" size={19} /><h2 className="text-lg font-bold">Money opportunity radar</h2><span className="rounded-full border border-profit/25 bg-profit/10 px-2 py-0.5 text-[10px] font-bold text-profit">LIVE PAPER SCAN</span></div>
                <p className="max-w-3xl text-xs leading-5 text-secondary">First priority: buy both outcomes of the same contract for less than its payout after estimated fees and buffers. This is the closest setup to “no-brainer” math, but separate order legs can still move or fail.</p>
              </div>
              <button aria-label="Refresh arbitrage scan" onClick={() => void scanArbitrage()} disabled={arbitrageLoading} className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-xs font-bold text-secondary transition hover:border-profit/40 hover:text-profit disabled:opacity-50"><RefreshCw size={14} className={arbitrageLoading ? 'animate-spin' : ''} /> Scan again</button>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-void/35 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-secondary">Locked-profit now</span><LockKeyhole size={15} className={lockedProfit.length ? 'text-profit' : 'text-muted'} /></div><div className={`mt-2 text-3xl font-bold ${lockedProfit.length ? 'text-profit' : 'text-foreground'}`}>{arbitrageLoading && !arbitrage ? '—' : lockedProfit.length}</div><div className="mt-1 text-[11px] text-muted">fee-adjusted, fillable candidates</div></div>
              <div className="rounded-2xl border border-border bg-void/35 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-secondary">Best net profit</span><DollarSign size={15} className="text-accent" /></div><div className="mt-2 text-3xl font-bold text-accent">{lockedProfit[0] ? money(lockedProfit[0].netProfit) : '—'}</div><div className="mt-1 text-[11px] text-muted">on {arbitrage?.requestedShares ?? 10} matched shares</div></div>
              <div className="rounded-2xl border border-border bg-void/35 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-secondary">Markets checked</span><Eye size={15} className="text-purple" /></div><div className="mt-2 text-3xl font-bold text-purple">{arbitrage?.scannedMarkets ?? '—'}</div><div className="mt-1 text-[11px] text-muted">full order-book scan</div></div>
            </div>

            {arbitrageLoading && !arbitrage && <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-border bg-void/20"><div className="text-center"><RefreshCw className="mx-auto mb-2 animate-spin text-profit" size={20} /><div className="text-sm font-semibold">Checking both sides of every book</div><div className="mt-1 text-xs text-secondary">Accounting for depth, fees, and execution buffer…</div></div></div>}

            {arbitrageError && <div className="flex items-start gap-3 rounded-2xl border border-loss/25 bg-loss/10 p-4 text-sm text-loss"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><div><div className="font-semibold">Opportunity scan unavailable</div><div className="mt-0.5 text-xs opacity-80">{arbitrageError}</div></div></div>}

            {!arbitrageLoading && !arbitrageError && lockedProfit.length > 0 && <div className="grid gap-3 lg:grid-cols-3">{lockedProfit.map(item => <article key={item.marketId} className="rounded-2xl border border-profit/30 bg-profit/5 p-4">
              <div className="flex items-center justify-between gap-3"><span className="rounded-full bg-profit/15 px-2.5 py-1 text-[10px] font-bold text-profit">LOCKED-PRICE CANDIDATE</span><span className="font-mono text-lg font-bold text-profit">+{money(item.netProfit)}</span></div>
              <h3 className="mt-3 line-clamp-2 text-sm font-bold leading-5">{item.question}</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-void/35 p-2.5"><div className="text-muted">Total cost</div><div className="mt-1 font-mono font-bold">{money(item.acquisitionCost)}</div></div><div className="rounded-xl bg-void/35 p-2.5"><div className="text-muted">Payout</div><div className="mt-1 font-mono font-bold">{money(item.payout)}</div></div></div>
              <div className="mt-3 text-[11px] leading-5 text-secondary">Buy {item.requestedShares} of <strong className="text-foreground">{item.outcomes[0]}</strong> and <strong className="text-foreground">{item.outcomes[1]}</strong>. Estimated return <strong className="text-profit">+{item.netReturnPercent.toFixed(2)}%</strong>.</div>
              <div className="mt-4 flex items-center justify-between"><a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-profit">Open contract <ArrowUpRight size={12} /></a><Link href="/arbitrage" className="text-xs font-bold text-accent">Full execution check</Link></div>
            </article>)}</div>}

            {!arbitrageLoading && !arbitrageError && lockedProfit.length === 0 && arbitrage && <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
              <div className="rounded-2xl border border-dashed border-border bg-void/25 p-5"><ShieldCheck className="mb-3 text-profit" size={23} /><div className="text-base font-bold">No locked-profit setup right now</div><p className="mt-2 text-xs leading-5 text-secondary">That is the correct answer—not a missed opportunity. None of the scanned books currently produces a positive payout after depth, fees, gas, and the execution buffer.</p><Link href="/arbitrage" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">Open detailed arbitrage lab <ArrowUpRight size={12} /></Link></div>
              <div className="rounded-2xl border border-border bg-void/25 p-5"><div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-bold">Closest watchlist</div><div className="mt-1 text-[11px] text-secondary">Not trades—wait for the combined price to move below break-even.</div></div><span className="rounded-full bg-warn/10 px-2.5 py-1 text-[10px] font-bold text-warn">WATCH ONLY</span></div>
                <div className="space-y-2">{closestSetups.length ? closestSetups.map(item => <a key={item.marketId} href={item.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-alt/60 p-3 transition hover:border-warn/30"><div className="min-w-0"><div className="truncate text-xs font-semibold">{item.question}</div><div className="mt-1 text-[10px] text-muted">combined asks {item.combinedAveragePrice === null ? '—' : money(item.combinedAveragePrice)} per $1 payout</div></div><div className="shrink-0 text-right"><div className="font-mono text-xs font-bold text-loss">{money(item.netProfit)}</div><div className="text-[10px] text-muted">current net</div></div></a>) : <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-secondary">No fillable near-misses were returned.</div>}</div>
              </div>
            </div>}

            <div className="mt-4 flex flex-col justify-between gap-2 border-t border-border pt-4 text-[10px] leading-4 text-muted sm:flex-row"><span>“Locked” describes the payout math only—not guaranteed execution. Quotes and available size can disappear between legs.</span><span className="shrink-0">Last scan {arbitrage ? new Date(arbitrage.generatedAt).toLocaleTimeString() : '—'}</span></div>
          </div>
        </section>

        {error && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-loss/25 bg-loss/10 p-4 text-sm text-loss"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><div><div className="font-semibold">Market feeds did not refresh</div><div className="mt-0.5 opacity-80">{error}</div></div></div>}

        <section id="decision-queue" className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="glass-panel min-w-0 overflow-hidden rounded-3xl">
            <div className="border-b border-border p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><div className="mb-1 flex items-center gap-2"><Layers3 className="text-accent" size={18} /><h2 className="text-lg font-bold">Decision queue</h2></div><p className="text-xs leading-5 text-secondary">Ranked for review—not recommendations to trade.</p></div>
                <div className="flex items-center gap-2 text-xs text-secondary"><span className={`h-2 w-2 rounded-full ${snapshot?.sources.polymarket.ok && snapshot?.sources.kalshi.ok ? 'bg-profit' : 'bg-warn'}`} />{snapshot ? `${quoteCounts.polymarket} Polymarket · ${quoteCounts.kalshi} Kalshi quoted` : 'Connecting…'}</div>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} /><input aria-label="Search markets" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a topic, team, or event" className="!rounded-xl !bg-void/45 !py-3 !pl-10" /></label>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="hidden text-muted sm:block" size={15} />
                  <select aria-label="Sort markets" value={sort} onChange={event => setSort(event.target.value as SortMode)} className="!w-auto !min-w-40 !rounded-xl !bg-void/45 !py-3">
                    <option value="volume">Most active</option><option value="tight">Tightest quotes</option><option value="balanced">Most uncertain</option><option value="closing">Closing soon</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                {(['all', 'polymarket', 'kalshi'] as VenueFilter[]).map(value => <button key={value} onClick={() => changeFilter(value)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === value ? 'bg-foreground text-void' : 'border border-border bg-void/30 text-secondary hover:text-foreground'}`}>{value === 'all' ? 'All markets' : sourceLabel(value)}</button>)}
              </div>
            </div>

            <div className="space-y-2 p-3 sm:p-4">
              {loading && !snapshot ? <div className="grid min-h-72 place-items-center"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin text-accent" size={22} /><div className="text-sm font-semibold">Reading live markets</div><div className="mt-1 text-xs text-secondary">Comparing quotes and liquidity…</div></div></div> : visible.length === 0 ? <div className="grid min-h-72 place-items-center text-center"><div><Search className="mx-auto mb-3 text-muted" size={24} /><div className="font-semibold">No matching markets</div><div className="mt-1 text-sm text-secondary">Try a broader search or another venue.</div></div></div> : visible.map((market, index) => {
                const active = selected ? marketKey(selected) === marketKey(market) : false
                const quality = quoteQuality(market)
                const total = askTotal(market)
                return <button key={marketKey(market)} onClick={() => selectMarket(market)} className={`decision-row w-full rounded-2xl p-4 text-left sm:p-5 ${active ? '!border-accent/60 !bg-accent/10 shadow-lg shadow-accent/5' : ''}`}>
                  <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_230px_auto]">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-secondary">#{String(index + 1).padStart(2, '0')}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${market.venue === 'polymarket' ? 'border-purple/25 bg-purple/10 text-purple' : 'border-accent/25 bg-accent/10 text-accent'}`}>{sourceLabel(market.venue)}</span><span className="flex items-center gap-1 text-[10px] text-muted"><Clock3 size={11} /> {closeLabel(market.closeTime)}</span></div>
                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 sm:text-[15px]">{market.title}</h3>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-secondary"><span>24h volume <strong className="font-semibold text-foreground">{compactVolume(market.volume24h)}</strong></span>{total !== null && <span>quote friction <strong className={Math.abs(total - 1) <= .025 ? 'text-profit' : 'text-warn'}>{((total - 1) * 100).toFixed(1)} pts</strong></span>}</div>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs"><span className="max-w-[95px] truncate text-secondary">{market.outcomes[0]}</span><span className="font-mono font-bold text-foreground">{quote(market.yesAsk)}</span></div>
                      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated"><div className="h-full rounded-full bg-gradient-to-r from-accent to-purple" style={{ width: `${Math.max(0, Math.min(100, (market.yesAsk ?? 0) * 100))}%` }} /></div>
                      <div className="flex items-center justify-between text-xs"><span className="max-w-[95px] truncate text-secondary">{market.outcomes[1]}</span><span className="font-mono font-bold text-foreground">{quote(market.noAsk)}</span></div>
                    </div>
                    <div className="flex items-center justify-between gap-3 md:block"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${quality.className}`}>{quality.label}</span><ChevronRight className={`mt-2 hidden md:block ${active ? 'text-accent' : 'text-muted'}`} size={18} /></div>
                  </div>
                </button>
              })}
            </div>
            {visible.length > 0 && <div className="border-t border-border px-5 py-3 text-center text-[11px] text-muted">Showing {visible.length} of {markets.length} sampled markets · refreshes every minute</div>}
          </div>

          <aside className="glass-panel overflow-hidden rounded-3xl xl:sticky xl:top-5">
            <div className="border-b border-border px-5 py-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="text-purple" size={17} /> Decision brief</div><span className="rounded-full border border-border bg-void/35 px-2.5 py-1 text-[10px] font-bold text-secondary">PAPER ONLY</span></div></div>
            {!selected ? <div className="p-8 text-center"><Gauge className="mx-auto mb-3 text-muted" size={28} /><div className="font-semibold">Choose a market</div><p className="mt-1 text-sm text-secondary">Its pricing, quality checks, and research will appear here.</p></div> : <div className="space-y-5 p-5 sm:p-6">
              <div><div className="mb-2 flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${selected.venue === 'polymarket' ? 'bg-purple/10 text-purple' : 'bg-accent/10 text-accent'}`}>{sourceLabel(selected.venue)}</span><span className="text-[11px] text-muted">{closeLabel(selected.closeTime)}</span></div><h3 className="text-lg font-bold leading-6">{selected.title}</h3><a href={selected.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-foreground">Open contract <ExternalLink size={12} /></a></div>

              <div className="rounded-2xl border border-border bg-void/35 p-4">
                <div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.14em] text-secondary">Current market view</div><div className="mt-1 text-xs text-muted">Executable asks, not true probabilities</div></div>{selectedQuality && <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${selectedQuality.className}`}>{selectedQuality.label}</span>}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div><div className="truncate text-xs text-secondary">{selected.outcomes[0]}</div><div className="mt-1 font-mono text-3xl font-bold tracking-tight">{quote(selected.yesAsk)}</div><div className="mt-1 text-[11px] text-muted">top size {selected.yesAskSize?.toFixed(0) ?? '—'}</div></div>
                  <div className="text-right"><div className="truncate text-xs text-secondary">{selected.outcomes[1]}</div><div className="mt-1 font-mono text-3xl font-bold tracking-tight">{quote(selected.noAsk)}</div><div className="mt-1 text-[11px] text-muted">top size {selected.noAskSize?.toFixed(0) ?? '—'}</div></div>
                </div>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-elevated"><div className="bg-accent" style={{ width: `${selectedYesShare}%` }} /><div className="flex-1 bg-purple" /></div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between"><h4 className="text-sm font-bold">Before you decide</h4><span className="text-[10px] uppercase tracking-wider text-muted">4 checks</span></div>
                <div className="space-y-2">
                  <CheckLine good={selected.yesAsk !== null && selected.noAsk !== null} label="Both sides are quoted" detail={selected.yesAsk !== null && selected.noAsk !== null ? 'You can compare the full cost of opposing positions.' : 'A missing ask makes execution and arbitrage analysis unreliable.'} />
                  <CheckLine good={selectedTotal !== null && Math.abs(selectedTotal - 1) <= .03} label="Pricing friction" detail={selectedTotal === null ? 'Cannot calculate until both asks are available.' : `${((selectedTotal - 1) * 100).toFixed(1)} points above or below $1 before fees and slippage.`} />
                  <CheckLine good={selected.volume24h >= 5_000} label="Market activity" detail={`${compactVolume(selected.volume24h)} reported 24h volume. Higher volume can help, but does not guarantee a fill.`} />
                  <CheckLine good={Boolean(selected.rules)} label="Resolution rules" detail={selected.rules ? 'Rules are available below—read the exact resolution wording.' : 'Rules were not returned in this snapshot. Open the contract before acting.'} />
                </div>
              </div>

              {selected.rules && <details className="group rounded-2xl border border-border bg-void/30"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-bold">Read resolution rules <ChevronRight className="transition group-open:rotate-90" size={15} /></summary><div className="max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-border px-4 py-3 text-xs leading-5 text-secondary">{selected.rules}</div></details>}

              <div className="rounded-2xl border border-purple/20 bg-gradient-to-br from-purple/10 to-accent/5 p-4">
                <div className="mb-3 flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple/15 text-purple"><BrainCircuit size={18} /></div><div><div className="text-sm font-bold">Evidence-based research</div><div className="mt-0.5 text-xs leading-5 text-secondary">Compare the market price with a sourced model estimate and premortem risks.</div></div></div>
                <button onClick={() => void researchSelected()} disabled={!modelCanRun || researchLoading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-void transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">{researchLoading ? <RefreshCw className="animate-spin" size={16} /> : <BrainCircuit size={16} />}{researchLoading ? 'Building research brief…' : 'Run AI research brief'}</button>
                {!snapshot?.modelAvailable && <p className="mt-2 text-[11px] text-warn">The research model is not configured on this deployment.</p>}
                {snapshot?.modelAvailable && !modelCanRun && <p className="mt-2 text-[11px] text-secondary">AI research currently supports explicit Yes/No contracts only.</p>}
                {researchError && <p className="mt-3 rounded-lg bg-loss/10 p-3 text-xs text-loss">{researchError}</p>}
              </div>

              {research && <div className="space-y-4 rounded-2xl border border-accent/25 bg-accent/5 p-4">
                <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-wider text-secondary">Model estimate</div><div className="mt-1 font-mono text-3xl font-bold text-accent">{(research.estimate * 100).toFixed(1)}%</div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold capitalize ${research.confidence === 'high' ? 'bg-profit/10 text-profit' : research.confidence === 'medium' ? 'bg-warn/10 text-warn' : 'bg-surface-elevated text-secondary'}`}>{research.confidence} confidence</span></div>
                {selected.yesAsk !== null && <div className="rounded-xl border border-border bg-void/35 p-3"><div className="flex items-center justify-between text-xs"><span className="text-secondary">Model–market gap</span><strong className="font-mono text-foreground">{((research.estimate - selected.yesAsk) * 100).toFixed(1)} pts</strong></div><div className="mt-1 text-[10px] text-muted">A research discrepancy, not a guaranteed edge.</div></div>}
                <p className="text-sm leading-6 text-foreground">{research.reasoning}</p>
                <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg bg-void/35 p-2"><div className="font-bold">{research.evidenceCount}</div><div className="text-[10px] text-muted">sources</div></div><div className="rounded-lg bg-void/35 p-2"><div className="font-bold">{research.signalStrength}/100</div><div className="text-[10px] text-muted">signal</div></div><div className="rounded-lg bg-void/35 p-2"><div className="font-bold">±{(research.uncertaintyRange * 100).toFixed(0)}%</div><div className="text-[10px] text-muted">uncertainty</div></div></div>
                {research.premortemRisks.length > 0 && <div><div className="mb-2 text-xs font-bold">What could make this wrong</div><ul className="space-y-2">{research.premortemRisks.slice(0, 3).map((risk, index) => <li key={index} className="flex gap-2 text-xs leading-5 text-secondary"><AlertTriangle className="mt-0.5 shrink-0 text-warn" size={13} />{risk}</li>)}</ul></div>}
                <div className="border-t border-border pt-3 text-[10px] leading-4 text-muted">{research.disclaimer}</div>
              </div>}
            </div>}
          </aside>
        </section>

        <section className="glass-panel mt-6 rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><ArrowLeftRight className="text-purple" size={18} /><h2 className="text-lg font-bold">Cross-venue review</h2></div><p className="mt-1 max-w-2xl text-xs leading-5 text-secondary">Similar titles are only leads. Verify exact settlement rules, fees, depth, transfer constraints, and simultaneous execution.</p></div><div className="rounded-full border border-border bg-void/35 px-3 py-1.5 text-xs font-bold"><span className="text-purple">{snapshot?.crossVenueCandidates.length ?? 0}</span> to review · <span className="text-secondary">0 verified</span></div></div>
          {!snapshot?.crossVenueCandidates.length ? <div className="mt-5 rounded-2xl border border-dashed border-border bg-void/25 p-7 text-center"><ShieldCheck className="mx-auto mb-2 text-secondary" size={22} /><div className="text-sm font-semibold">No comparable contracts found</div><div className="mt-1 text-xs text-secondary">That is a valid result. The system will not invent an arbitrage opportunity.</div></div> : <div className="mt-5 grid gap-3 lg:grid-cols-2">{snapshot.crossVenueCandidates.map(candidate => <div key={`${candidate.polymarket.id}:${candidate.kalshi.id}`} className="rounded-2xl border border-border bg-void/30 p-4"><div className="mb-2 flex items-center justify-between"><span className="rounded-full bg-warn/10 px-2 py-1 text-[10px] font-bold text-warn">RULE CHECK REQUIRED</span><span className="font-mono text-xs font-bold">{quote(candidate.bestOppositeAskSum)}</span></div><div className="text-sm font-semibold leading-5">{candidate.polymarket.title}</div><div className="mt-2 text-xs text-secondary">{candidate.cheaperPair?.replaceAll('-', ' ') ?? 'Opposing asks incomplete'} · before fees</div><div className="mt-3 flex gap-4"><a href={candidate.polymarket.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-purple">Polymarket <ArrowUpRight size={12} /></a><a href={candidate.kalshi.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-accent">Kalshi <ArrowUpRight size={12} /></a></div></div>)}</div>}
        </section>

        <footer className="mt-7 flex flex-col items-center justify-between gap-3 border-t border-border px-2 pt-6 text-center text-[11px] leading-5 text-muted sm:flex-row sm:text-left"><div className="flex items-center gap-2"><ShieldCheck size={14} /> Quotes can move before execution. Nothing shown is a guaranteed outcome or risk-free trade.</div><div className="flex items-center gap-3"><span className="inline-flex items-center gap-1"><TrendingUp size={12} /> Public market data</span><span className="inline-flex items-center gap-1"><Gauge size={12} /> 60s refresh</span></div></footer>
      </div>
    </main>
  )
}
