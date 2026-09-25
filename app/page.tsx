'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowLeftRight, ArrowUpRight, Beaker, BrainCircuit, CheckCircle2,
  ChevronRight, Clock3, DollarSign, ExternalLink, Eye, Gauge, Info, Layers3,
  LockKeyhole, Radar, RefreshCw, Scale, Search, AlertTriangle, ShieldCheck,
  SlidersHorizontal, Sparkles, Trash2, TrendingUp, X,
} from 'lucide-react'
import type {
  PredictionMarket, PredictionMarketSnapshot, PredictionVenue,
} from '@/lib/services/prediction-markets.service'

type VenueFilter = 'all' | PredictionVenue
type SortMode = 'riskReward' | 'volume' | 'tight' | 'balanced' | 'certainty' | 'upside' | 'closing'
type RiskMode = 'protected' | 'explore'

type DecisionTone = 'profit' | 'accent' | 'warn' | 'loss'

interface DecisionGuidance {
  action: string
  reason: string
  tone: DecisionTone
}

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

interface RebalancingOutcome {
  id: string
  title: string
  price: number
  bestBid: number | null
  bestAsk: number | null
  volume24hr: number
}

interface RebalancingOpportunity {
  id: string
  title: string
  slug: string
  url: string
  negRisk: boolean
  outcomeCount: number
  volume24hr: number
  liquidity: number
  priceSum: number
  askSum: number | null
  bidSum: number | null
  diffFromDollar: number
  type: 'mint-and-sell' | 'buy-all-discount' | 'overpriced-basket' | 'discounted-basket' | 'balanced'
  headline: string
  explanation: string
  actionGuidance: string
  profitPercent: number
  outcomes: RebalancingOutcome[]
}

interface RebalancingResponse {
  generatedAt: string
  eventsScanned: number
  opportunitiesFound: number
  mintAndSellCount: number
  buyAllCount: number
  opportunities: RebalancingOpportunity[]
}

interface RebalancingPaperTrade {
  id: string
  recordedAt: number
  eventTitle: string
  slug: string
  type: RebalancingOpportunity['type']
  shares: number
  capitalCommitted: number
  payout: number
  netProfit: number
  netReturnPercent: number
  status: 'instant-settled' | 'awaiting-resolution'
  legs: Array<{
    candidate: string
    action: 'BUY' | 'SELL'
    price: number
    shares: number
  }>
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

function favoriteSide(market: PredictionMarket): { outcome: string; price: number } | null {
  if (market.yesAsk === null || market.noAsk === null) return null
  return market.yesAsk >= market.noAsk
    ? { outcome: market.outcomes[0], price: market.yesAsk }
    : { outcome: market.outcomes[1], price: market.noAsk }
}

interface OpportunityProfile {
  outcome: string
  price: number
  impliedChance: number
  profitPerShare: number
  returnOnStake: number
  score: number
  label: 'High chance · small reward' | 'Balanced chance + reward' | 'Higher reward · higher risk'
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * A market-screening score, not a probability forecast. It favors liquid,
 * tightly quoted favorites around 70–85%, where the payout is still meaningful.
 */
function opportunityProfile(market: PredictionMarket): OpportunityProfile | null {
  const favorite = favoriteSide(market)
  const total = askTotal(market)
  if (!favorite || total === null || favorite.price <= 0 || favorite.price >= 1) return null

  const impliedChance = clamp(favorite.price / total)
  const profitPerShare = 1 - favorite.price
  const returnOnStake = profitPerShare / favorite.price
  const chanceRewardFit = clamp(1 - Math.abs(impliedChance - 0.78) / 0.28)
  const usefulReturn = clamp(returnOnStake / 0.5)
  const liquidity = clamp(Math.log10(market.volume24h + 1) / 5)
  const quoteIntegrity = clamp(1 - Math.abs(total - 1) / 0.08)
  const thinMarketPenalty = market.volume24h < 500 ? 0.65 : 1
  const score = 100 * (
    chanceRewardFit * 0.45 +
    usefulReturn * 0.25 +
    liquidity * 0.20 +
    quoteIntegrity * 0.10
  ) * thinMarketPenalty

  return {
    outcome: favorite.outcome,
    price: favorite.price,
    impliedChance,
    profitPerShare,
    returnOnStake,
    score,
    label: impliedChance >= 0.9
      ? 'High chance · small reward'
      : impliedChance >= 0.7
        ? 'Balanced chance + reward'
        : 'Higher reward · higher risk',
  }
}

function baseDecision(market: PredictionMarket): DecisionGuidance {
  const total = askTotal(market)
  const favorite = favoriteSide(market)
  if (total === null) return { action: 'SKIP', reason: 'One side has no executable ask.', tone: 'loss' }
  if (Math.abs(total - 1) > 0.06) return { action: 'SKIP', reason: 'Pricing friction is too high.', tone: 'loss' }
  if (market.volume24h < 500) return { action: 'WAIT', reason: 'Quoted activity is too thin.', tone: 'warn' }
  if (favorite && favorite.price >= 0.7) return {
    action: `RESEARCH ${favorite.outcome.toUpperCase()}`,
    reason: `${(favorite.price * 100).toFixed(0)}% market-implied favorite; confirm value before buying.`,
    tone: 'accent',
  }
  return { action: 'RUN RESEARCH', reason: 'The price alone does not reveal a positive edge.', tone: 'accent' }
}

function researchedDecision(market: PredictionMarket, research: ResearchResult | null): DecisionGuidance {
  if (!research || market.yesAsk === null) return baseDecision(market)
  const edge = research.estimate - market.yesAsk
  const threshold = Math.max(0.05, research.uncertaintyRange)
  const confidenceReady = research.confidence === 'high' || research.confidence === 'medium'
  if (confidenceReady && edge > threshold) return {
    action: `CONSIDER ${market.outcomes[0].toUpperCase()}`,
    reason: `Model is ${(edge * 100).toFixed(1)} points above the market, beyond its uncertainty threshold.`,
    tone: 'profit',
  }
  if (confidenceReady && edge < -threshold && market.noAsk !== null) return {
    action: `CONSIDER ${market.outcomes[1].toUpperCase()}`,
    reason: `Model is ${(Math.abs(edge) * 100).toFixed(1)} points below the market, favoring the opposite side.`,
    tone: 'profit',
  }
  return { action: 'PASS', reason: 'No model edge large enough to clear uncertainty and execution risk.', tone: 'warn' }
}

function decisionClass(tone: DecisionTone): string {
  if (tone === 'profit') return 'border-profit/30 bg-profit/10 text-profit'
  if (tone === 'loss') return 'border-loss/30 bg-loss/10 text-loss'
  if (tone === 'warn') return 'border-warn/30 bg-warn/10 text-warn'
  return 'border-accent/30 bg-accent/10 text-accent'
}

function sortMarkets(markets: PredictionMarket[], mode: SortMode): PredictionMarket[] {
  return [...markets].sort((a, b) => {
    if (mode === 'riskReward') return (opportunityProfile(b)?.score ?? -1) - (opportunityProfile(a)?.score ?? -1)
    if (mode === 'volume') return b.volume24h - a.volume24h
    if (mode === 'balanced') return Math.abs((a.yesAsk ?? 0.5) - 0.5) - Math.abs((b.yesAsk ?? 0.5) - 0.5)
    if (mode === 'tight') return Math.abs((askTotal(a) ?? 99) - 1) - Math.abs((askTotal(b) ?? 99) - 1)
    if (mode === 'certainty') return (favoriteSide(b)?.price ?? 0) - (favoriteSide(a)?.price ?? 0)
    if (mode === 'upside') return (opportunityProfile(b)?.returnOnStake ?? -1) - (opportunityProfile(a)?.returnOnStake ?? -1)
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
  const [sort, setSort] = useState<SortMode>('riskReward')
  const [riskMode, setRiskMode] = useState<RiskMode>('protected')
  const [search, setSearch] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [research, setResearch] = useState<ResearchResult | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchError, setResearchError] = useState<string | null>(null)
  const [arbitrage, setArbitrage] = useState<ArbitrageScanSummary | null>(null)
  const [arbitrageLoading, setArbitrageLoading] = useState(true)
  const [arbitrageError, setArbitrageError] = useState<string | null>(null)
  const [rebalancing, setRebalancing] = useState<RebalancingResponse | null>(null)
  const [rebalancingLoading, setRebalancingLoading] = useState(true)
  const [rebalancingError, setRebalancingError] = useState<string | null>(null)

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

  const scanRebalancing = useCallback(async () => {
    setRebalancingLoading(true)
    setRebalancingError(null)
    try {
      const response = await fetch('/api/rebalancing?limit=40', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`)
      setRebalancing(data as RebalancingResponse)
    } catch (cause) {
      setRebalancingError(cause instanceof Error ? cause.message : 'Rebalancing scan is temporarily unavailable')
    } finally {
      setRebalancingLoading(false)
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

  useEffect(() => {
    void scanRebalancing()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void scanRebalancing()
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [scanRebalancing])

  const [rebalancingPaperTrades, setRebalancingPaperTrades] = useState<RebalancingPaperTrade[]>([])
  const [simulationModalOpp, setSimulationModalOpp] = useState<RebalancingOpportunity | null>(null)
  const [simShares, setSimShares] = useState<number>(10)
  const [simToast, setSimToast] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tradeos_rebalancing_simulations')
      if (stored) {
        setRebalancingPaperTrades(JSON.parse(stored))
      }
    } catch {}
  }, [])

  const executeSimulation = (opp: RebalancingOpportunity, shares: number) => {
    const isMintAndSell = opp.type === 'mint-and-sell'
    const isBuyAll = opp.type === 'buy-all-discount'

    let capitalCommitted = 0
    let payout = 0
    let netProfit = 0
    let netReturnPercent = 0
    let status: RebalancingPaperTrade['status'] = 'instant-settled'
    const legs: RebalancingPaperTrade['legs'] = []

    if (isMintAndSell) {
      capitalCommitted = 1.00 * shares
      const sellTotal = (opp.bidSum || opp.priceSum) * shares
      payout = sellTotal
      netProfit = sellTotal - capitalCommitted
      netReturnPercent = capitalCommitted > 0 ? (netProfit / capitalCommitted) * 100 : 0
      status = 'instant-settled'

      opp.outcomes.forEach(o => {
        legs.push({
          candidate: o.title,
          action: 'SELL',
          price: o.bestBid || o.price,
          shares,
        })
      })
    } else if (isBuyAll) {
      capitalCommitted = (opp.askSum || opp.priceSum) * shares
      payout = 1.00 * shares
      netProfit = payout - capitalCommitted
      netReturnPercent = capitalCommitted > 0 ? (netProfit / capitalCommitted) * 100 : 0
      status = 'awaiting-resolution'

      opp.outcomes.forEach(o => {
        legs.push({
          candidate: o.title,
          action: 'BUY',
          price: o.bestAsk || o.price,
          shares,
        })
      })
    } else {
      capitalCommitted = (opp.outcomes[0]?.price || 0.5) * shares
      payout = 1.00 * shares
      netProfit = (opp.profitPercent / 100) * capitalCommitted
      netReturnPercent = opp.profitPercent
      status = 'awaiting-resolution'

      legs.push({
        candidate: opp.outcomes[0]?.title || 'Leading Contender',
        action: 'BUY',
        price: opp.outcomes[0]?.price || 0.5,
        shares,
      })
    }

    const trade: RebalancingPaperTrade = {
      id: `${opp.id}-${Date.now()}`,
      recordedAt: Date.now(),
      eventTitle: opp.title,
      slug: opp.slug,
      type: opp.type,
      shares,
      capitalCommitted,
      payout,
      netProfit,
      netReturnPercent,
      status,
      legs,
    }

    const updated = [trade, ...rebalancingPaperTrades].slice(0, 40)
    setRebalancingPaperTrades(updated)
    try {
      localStorage.setItem('tradeos_rebalancing_simulations', JSON.stringify(updated))
    } catch {}

    setSimToast(`Simulated ${shares} sets on "${opp.title.slice(0, 32)}…" (Net: ${money(netProfit)})`)
    setTimeout(() => setSimToast(null), 4000)
    setSimulationModalOpp(null)
  }

  const clearPaperTrades = () => {
    setRebalancingPaperTrades([])
    try {
      localStorage.removeItem('tradeos_rebalancing_simulations')
    } catch {}
  }

  const simCapital = useMemo(() => rebalancingPaperTrades.reduce((sum, t) => sum + t.capitalCommitted, 0), [rebalancingPaperTrades])
  const simProfit = useMemo(() => rebalancingPaperTrades.reduce((sum, t) => sum + t.netProfit, 0), [rebalancingPaperTrades])

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
  const allLockedProfit = useMemo(() => arbitrage?.opportunities
    .filter(item => item.status === 'opportunity' && item.fillable && item.netProfit > 0)
    .sort((a, b) => b.netProfit - a.netProfit)
    ?? [], [arbitrage])
  const lockedProfit = useMemo(() => allLockedProfit.slice(0, 3), [allLockedProfit])
  const lockedMarketIds = useMemo(() => new Set(allLockedProfit.map(item => item.marketId)), [allLockedProfit])
  const visible = useMemo(() => sortMarkets(markets.filter(market =>
    (riskMode === 'explore' || lockedMarketIds.has(market.id)) &&
    (filter === 'all' || market.venue === filter) &&
    market.title.toLowerCase().includes(search.trim().toLowerCase()),
  ), riskMode === 'protected' ? 'volume' : sort).slice(0, 40), [markets, riskMode, lockedMarketIds, filter, search, sort])
  const selected = visible.find(market => marketKey(market) === selectedKey) ?? visible[0] ?? null
  const selectedTotal = selected ? askTotal(selected) : null
  const selectedQuality = selected ? quoteQuality(selected) : null
  const closestSetups = useMemo(() => arbitrage?.opportunities
    .filter(item => item.status === 'near-miss' && item.fillable)
    .sort((a, b) => b.netProfit - a.netProfit)
    .slice(0, 3) ?? [], [arbitrage])
  const selectedArbitrage = selected ? allLockedProfit.find(item => item.marketId === selected.id) : null
  const selectedDecision = selectedArbitrage
    ? { action: 'BUY BOTH SIDES', reason: `${money(selectedArbitrage.netProfit)} estimated net profit after modeled costs for ${selectedArbitrage.requestedShares} matched shares. Recheck both books immediately before execution.`, tone: 'profit' as const }
    : selected ? researchedDecision(selected, research) : null
  const likelyFavorites = useMemo(() => markets
    .map(market => ({ market, favorite: favoriteSide(market), total: askTotal(market) }))
    .filter((item): item is { market: PredictionMarket; favorite: { outcome: string; price: number }; total: number } =>
      item.favorite !== null && item.total !== null && Math.abs(item.total - 1) <= 0.03 &&
      item.market.volume24h >= 5_000 && item.favorite.price >= 0.7 && item.favorite.price <= 0.97)
    .sort((a, b) => b.favorite.price - a.favorite.price || b.market.volume24h - a.market.volume24h)
    .slice(0, 3), [markets])
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
            <Link href="/cross-platform" className="rounded-full px-4 py-2 text-secondary hover:bg-surface-alt hover:text-foreground">Cross-Platform</Link>
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
                <div className="rounded-2xl border border-border bg-void/35 p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-secondary">Locked-profit now</span><LockKeyhole size={15} className={allLockedProfit.length ? 'text-profit' : 'text-muted'} /></div><div className={`mt-2 text-3xl font-bold ${allLockedProfit.length ? 'text-profit' : 'text-foreground'}`}>{arbitrageLoading && !arbitrage ? '—' : allLockedProfit.length}</div><div className="mt-1 text-[11px] text-muted">fee-adjusted, fillable candidates</div></div>
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

            {!arbitrageLoading && !arbitrageError && allLockedProfit.length === 0 && arbitrage && <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
              <div className="rounded-2xl border border-dashed border-border bg-void/25 p-5"><div className="mb-3 flex items-center justify-between gap-3"><ShieldCheck className="text-profit" size={23} /><span className="rounded-full border border-loss/30 bg-loss/10 px-2.5 py-1 text-[10px] font-bold text-loss">DECISION: DO NOT TRADE</span></div><div className="text-base font-bold">No locked-profit setup right now</div><p className="mt-2 text-xs leading-5 text-secondary">That is the correct answer—not a missed opportunity. None of the scanned books currently produces a positive payout after depth, fees, gas, and the execution buffer.</p><Link href="/arbitrage" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent">Open detailed arbitrage lab <ArrowUpRight size={12} /></Link></div>
              {riskMode === 'protected' ? <div className="rounded-2xl border border-profit/20 bg-profit/5 p-5"><div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-bold">Capital Protection is active</div><div className="mt-1 text-[11px] text-secondary">Directional bets are hidden because even a 99% favorite can lose.</div></div><LockKeyhole className="text-profit" size={20} /></div><p className="text-xs leading-5 text-secondary">Stay disciplined and wait for a fully hedged opportunity, or deliberately switch to Explore Ideas to review trades where loss is possible.</p><button onClick={() => setRiskMode('explore')} className="mt-4 rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-xs font-bold text-foreground hover:border-accent/35">Explore riskier ideas</button></div> : <div className="rounded-2xl border border-border bg-void/25 p-5"><div className="mb-3 flex items-center justify-between"><div><div className="text-sm font-bold">Highest implied win chance</div><div className="mt-1 text-[11px] text-secondary">Liquid favorites between 70–97%. Likely does not automatically mean profitable.</div></div><span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">RESEARCH FIRST</span></div>
                <div className="space-y-2">{likelyFavorites.length ? likelyFavorites.map(({ market, favorite }) => <button key={marketKey(market)} onClick={() => { selectMarket(market); document.getElementById('decision-queue')?.scrollIntoView({ behavior: 'smooth' }) }} className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-surface-alt/60 p-3 text-left transition hover:border-accent/35"><div className="min-w-0"><div className="truncate text-xs font-semibold">{market.title}</div><div className="mt-1 text-[10px] text-muted">market favorite: <span className="text-foreground">{favorite.outcome}</span> · gross upside {((1 - favorite.price) * 100).toFixed(1)}¢</div></div><div className="shrink-0 text-right"><div className="font-mono text-base font-bold text-accent">{(favorite.price * 100).toFixed(1)}%</div><div className="text-[10px] font-bold text-accent">RESEARCH</div></div></button>) : <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-secondary">No liquid favorites meet the quality filter.</div>}</div>
              </div>}
            </div>}

            {!arbitrageLoading && !arbitrageError && allLockedProfit.length === 0 && closestSetups.length > 0 && <details className="mt-4 rounded-2xl border border-border bg-void/20"><summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-bold">Closest arbitrage watchlist <span className="text-[10px] font-semibold text-warn">NOT PROFITABLE YET · {closestSetups.length} NEAR-MISSES</span></summary><div className="grid gap-2 border-t border-border p-3 md:grid-cols-3">{closestSetups.map(item => <a key={item.marketId} href={item.url} target="_blank" rel="noreferrer" className="rounded-xl border border-border bg-surface-alt/60 p-3 transition hover:border-warn/30"><div className="truncate text-xs font-semibold">{item.question}</div><div className="mt-2 flex items-center justify-between text-[10px]"><span className="text-muted">asks {item.combinedAveragePrice === null ? '—' : money(item.combinedAveragePrice)}</span><span className="font-mono font-bold text-loss">{money(item.netProfit)} net</span></div></a>)}</div></details>}

            <div className="mt-4 flex flex-col justify-between gap-2 border-t border-border pt-4 text-[10px] leading-4 text-muted sm:flex-row"><span>“Locked” describes the payout math only—not guaranteed execution. Quotes and available size can disappear between legs.</span><span className="shrink-0">Last scan {arbitrage ? new Date(arbitrage.generatedAt).toLocaleTimeString() : '—'}</span></div>
          </div>
        </section>

        {/* Multi-Outcome Rebalancing & Neg-Risk Radar */}
        <section id="rebalancing-radar" className="glass-panel mb-6 overflow-hidden rounded-3xl border-purple/30">
          <div className="border-b border-border bg-gradient-to-r from-purple/10 via-transparent to-accent/5 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Scale className="text-purple" size={20} />
                  <h2 className="text-lg font-bold">Multi-Outcome Rebalancing &amp; Neg-Risk Radar</h2>
                  <span className="rounded-full border border-purple/30 bg-purple/10 px-2.5 py-0.5 text-[10px] font-bold text-purple">
                    100% MATH: EXACTLY 1 OUTCOME WINS $1.00
                  </span>
                </div>
                <p className="max-w-3xl text-xs leading-5 text-secondary">
                  When multiple candidates run in an election, tournament, or policy vote, exactly one candidate pays $1.00 and all others pay $0.00.
                  Whenever total market prices or bids deviate from $1.00 (e.g. sum is $1.15 due to retail hype, or $0.94 due to neglected outsiders), risk-free minting or complete-set buying opportunities open up.
                </p>
              </div>
              <button
                aria-label="Refresh rebalancing scan"
                onClick={() => void scanRebalancing()}
                disabled={rebalancingLoading}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface-alt px-3.5 py-2.5 text-xs font-bold text-secondary transition hover:border-purple/40 hover:text-purple disabled:opacity-50"
              >
                <RefreshCw size={14} className={rebalancingLoading ? 'animate-spin' : ''} /> Scan Multi-Markets
              </button>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            {/* Quick Summary Metrics */}
            <div className="mb-5 grid gap-3 grid-cols-2 sm:grid-cols-4">
              <div className="rounded-2xl border border-border bg-void/35 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-secondary">Mint &amp; Sell Ready</div>
                <div className={`mt-2 font-mono text-2xl font-bold ${(rebalancing?.mintAndSellCount ?? 0) > 0 ? 'text-profit' : 'text-foreground'}`}>
                  {rebalancingLoading && !rebalancing ? '—' : rebalancing?.mintAndSellCount ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-muted">Bids total &gt; $1.00 (Instant profit)</div>
              </div>

              <div className="rounded-2xl border border-border bg-void/35 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-secondary">Discount Complete Sets</div>
                <div className={`mt-2 font-mono text-2xl font-bold ${(rebalancing?.buyAllCount ?? 0) > 0 ? 'text-profit' : 'text-foreground'}`}>
                  {rebalancingLoading && !rebalancing ? '—' : rebalancing?.buyAllCount ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-muted">Asks total &lt; $1.00 (Guaranteed payout)</div>
              </div>

              <div className="rounded-2xl border border-border bg-void/35 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-secondary">Hype Overpriced Fields</div>
                <div className="mt-2 font-mono text-2xl font-bold text-warn">
                  {rebalancingLoading && !rebalancing ? '—' : rebalancing?.opportunities.filter(o => o.type === 'overpriced-basket').length ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-muted">Prices sum &gt; $1.04 (Short edge)</div>
              </div>

              <div className="rounded-2xl border border-border bg-void/35 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-secondary">Events Scanned</div>
                <div className="mt-2 font-mono text-2xl font-bold text-accent">
                  {rebalancing?.eventsScanned ?? '—'}
                </div>
                <div className="mt-1 text-[11px] text-muted">Active Polymarket events</div>
              </div>
            </div>

            {/* Paper Trading Portfolio Banner */}
            <div className="mb-5 rounded-2xl border border-purple/30 bg-gradient-to-r from-void/60 via-purple/10 to-surface-alt p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple/20 text-purple border border-purple/30">
                  <Beaker size={20} />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-2">
                    Paper Trading Portfolio (Simulation Mode)
                    <span className="rounded-full bg-purple/20 px-2.5 py-0.5 text-[10px] font-mono text-purple font-semibold">
                      NO REAL MONEY AT RISK
                    </span>
                  </div>
                  <div className="text-[11px] text-muted">
                    Test complete-set minting and basket purchases to track hypothetical performance with zero capital risk.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-secondary">Capital Simulated</div>
                  <div className="font-mono text-sm font-bold text-foreground">${simCapital.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-secondary">Simulated Net P&amp;L</div>
                  <div className={`font-mono text-sm font-bold ${simProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {money(simProfit)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-semibold text-secondary">Simulated Baskets</div>
                  <div className="font-mono text-sm font-bold text-accent">{rebalancingPaperTrades.length}</div>
                </div>
                {rebalancingPaperTrades.length > 0 && (
                  <button
                    onClick={clearPaperTrades}
                    className="flex items-center gap-1 rounded-lg border border-border bg-surface-alt px-2.5 py-1 text-xs text-muted hover:text-loss transition-colors"
                  >
                    <Trash2 size={12} /> Clear Log
                  </button>
                )}
              </div>
            </div>

            {/* Toast notice */}
            {simToast && (
              <div className="mb-4 rounded-xl border border-profit/30 bg-profit/10 p-3 text-xs font-semibold text-profit flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{simToast}</span>
              </div>
            )}

            {/* Loading state */}
            {rebalancingLoading && !rebalancing && (
              <div className="grid min-h-36 place-items-center rounded-2xl border border-dashed border-border bg-void/20">
                <div className="text-center">
                  <RefreshCw className="mx-auto mb-2 animate-spin text-purple" size={20} />
                  <div className="text-sm font-semibold">Scanning Neg-Risk and Multi-Candidate Events</div>
                  <div className="mt-1 text-xs text-secondary">Calculating basket sum totals across all candidates…</div>
                </div>
              </div>
            )}

            {/* Error state */}
            {rebalancingError && (
              <div className="flex items-start gap-3 rounded-2xl border border-loss/25 bg-loss/10 p-4 text-sm text-loss mb-4">
                <AlertTriangle className="mt-0.5 shrink-0" size={17} />
                <div>
                  <div className="font-semibold">Rebalancing scan unavailable</div>
                  <div className="mt-0.5 text-xs opacity-80">{rebalancingError}</div>
                </div>
              </div>
            )}

            {/* Events Grid */}
            {!rebalancingLoading && !rebalancingError && rebalancing && rebalancing.opportunities.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {rebalancing.opportunities.slice(0, 6).map(opp => (
                  <article key={opp.id} className="rounded-2xl border border-border bg-surface-alt/70 p-5 shadow-sm transition hover:border-purple/40">
                    {/* Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 pb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {opp.type === 'mint-and-sell' && (
                            <span className="badge-profit px-2.5 py-0.5 rounded text-[10px] font-bold uppercase">
                              🟢 Mint &amp; Sell (+{opp.profitPercent.toFixed(1)}%)
                            </span>
                          )}
                          {opp.type === 'buy-all-discount' && (
                            <span className="badge-profit px-2.5 py-0.5 rounded text-[10px] font-bold uppercase">
                              🟢 Buy All Discount (+{opp.profitPercent.toFixed(1)}%)
                            </span>
                          )}
                          {opp.type === 'overpriced-basket' && (
                            <span className="badge-warning px-2.5 py-0.5 rounded text-[10px] font-bold uppercase">
                              🔶 Overpriced (+{opp.profitPercent.toFixed(1)}% Hype)
                            </span>
                          )}
                          {opp.type === 'discounted-basket' && (
                            <span className="rounded border border-purple/30 bg-purple/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-purple">
                              🔷 Underpriced Basket
                            </span>
                          )}
                          {opp.type === 'balanced' && (
                            <span className="rounded border border-border bg-surface px-2.5 py-0.5 text-[10px] font-semibold text-secondary uppercase">
                              ⚪ Balanced Field
                            </span>
                          )}
                          <span className="text-[11px] text-muted">{opp.outcomeCount} candidates</span>
                        </div>
                        <h3 className="text-sm font-bold text-foreground line-clamp-1">{opp.title}</h3>
                      </div>
                      <a
                        href={opp.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-accent hover:underline flex items-center gap-1 shrink-0"
                      >
                        Polymarket <ArrowUpRight size={13} />
                      </a>
                    </div>

                    {/* Math breakdown row */}
                    <div className="my-3.5 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-xl border border-border bg-surface p-2.5">
                        <div className="text-[10px] uppercase font-semibold text-secondary">Price Sum</div>
                        <div className={`mt-1 font-mono text-base font-bold ${opp.priceSum > 1.03 ? 'text-warn' : opp.priceSum < 0.97 ? 'text-purple' : 'text-foreground'}`}>
                          ${opp.priceSum.toFixed(3)}
                        </div>
                        <div className="text-[10px] text-muted">{opp.diffFromDollar >= 0 ? `+${(opp.diffFromDollar * 100).toFixed(1)}%` : `${(opp.diffFromDollar * 100).toFixed(1)}%`} vs $1</div>
                      </div>

                      <div className="rounded-xl border border-border bg-surface p-2.5">
                        <div className="text-[10px] uppercase font-semibold text-secondary">Cost to Buy All</div>
                        <div className={`mt-1 font-mono text-base font-bold ${opp.askSum && opp.askSum < 1.0 ? 'text-profit font-extrabold' : 'text-foreground'}`}>
                          {opp.askSum !== null ? `$${opp.askSum.toFixed(3)}` : 'Thin depth'}
                        </div>
                        <div className="text-[10px] text-muted">pays $1.00 at close</div>
                      </div>

                      <div className="rounded-xl border border-border bg-surface p-2.5">
                        <div className="text-[10px] uppercase font-semibold text-secondary">Mint &amp; Sell Bids</div>
                        <div className={`mt-1 font-mono text-base font-bold ${opp.bidSum && opp.bidSum > 1.0 ? 'text-profit font-extrabold' : 'text-foreground'}`}>
                          {opp.bidSum !== null ? `$${opp.bidSum.toFixed(3)}` : 'Thin bids'}
                        </div>
                        <div className="text-[10px] text-muted">costs $1.00 to mint</div>
                      </div>
                    </div>

                    {/* Top candidates preview */}
                    <div className="mb-3">
                      <div className="text-[10px] uppercase font-semibold text-secondary mb-1.5">Top Contenders:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {opp.outcomes.slice(0, 5).map(o => (
                          <span key={o.id} className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-mono flex items-center gap-1.5">
                            <span className="font-sans font-medium text-foreground truncate max-w-[120px]">{o.title}</span>
                            <span className="font-bold text-accent">${o.price.toFixed(2)}</span>
                          </span>
                        ))}
                        {opp.outcomeCount > 5 && (
                          <span className="text-[10px] text-muted self-center">+{opp.outcomeCount - 5} more</span>
                        )}
                      </div>
                    </div>

                    {/* Step-by-Step Action Guidance */}
                    <div className={`rounded-xl border p-3 text-xs leading-relaxed ${
                      opp.type === 'mint-and-sell' || opp.type === 'buy-all-discount'
                        ? 'border-profit/30 bg-profit/10 text-foreground'
                        : 'border-border bg-surface text-secondary'
                    }`}>
                      <div className="font-semibold text-foreground mb-1">{opp.headline}</div>
                      <p className="text-[11px] text-muted">{opp.explanation}</p>
                      <div className="mt-2 text-[11px] font-medium text-foreground border-t border-border/40 pt-1.5 whitespace-pre-line">
                        {opp.actionGuidance}
                      </div>
                    </div>

                    {/* Interactive Simulation Button */}
                    <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-border/60">
                      <div className="text-[11px] text-muted font-mono flex items-center gap-1">
                        <Info size={12} className="text-secondary" />
                        {opp.type === 'mint-and-sell' ? 'Instant arbitrage settlement' : opp.type === 'buy-all-discount' ? 'Guaranteed resolution payout' : 'Statistical edge setup'}
                      </div>
                      <button
                        onClick={() => {
                          setSimulationModalOpp(opp)
                          setSimShares(10)
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-purple/30 bg-purple/10 px-3.5 py-1.5 text-xs font-semibold text-purple hover:bg-purple/20 transition-colors shadow-sm"
                      >
                        <Beaker size={13} /> Simulate Rebalance
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {/* Paper Trading Ledger Table */}
            {rebalancingPaperTrades.length > 0 && (
              <div className="mt-6 rounded-2xl border border-border bg-void/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Beaker size={16} className="text-purple" />
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Simulated Paper Execution Ledger</h4>
                  </div>
                  <span className="text-[11px] text-muted">{rebalancingPaperTrades.length} recorded simulations</span>
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {rebalancingPaperTrades.map(trade => (
                    <div key={trade.id} className="rounded-xl border border-border bg-surface-alt p-3 text-xs flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold text-foreground line-clamp-1">{trade.eventTitle}</div>
                        <div className="mt-0.5 text-[10px] text-muted flex items-center gap-2">
                          <span className="uppercase font-mono text-purple">{trade.type}</span>
                          <span>&bull;</span>
                          <span>{trade.shares} sets</span>
                          <span>&bull;</span>
                          <span>Outlay: ${trade.capitalCommitted.toFixed(2)}</span>
                          <span>&bull;</span>
                          <span>{new Date(trade.recordedAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono text-sm font-bold ${trade.netProfit >= 0 ? 'text-profit' : 'text-loss'}`}>
                          {money(trade.netProfit)}
                        </div>
                        <div className="text-[10px] font-mono text-muted">
                          {trade.status === 'instant-settled' ? 'Instant Settled' : 'Awaiting Resolution'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col justify-between gap-2 border-t border-border pt-4 text-[10px] leading-4 text-muted sm:flex-row">
              <span>Multi-outcome events resolve through Polymarket&apos;s Neg-Risk CTF contracts. Exactly one outcome redeems for $1.00 USDC.</span>
              <span className="shrink-0">Last scan: {rebalancing ? new Date(rebalancing.generatedAt).toLocaleTimeString() : '—'}</span>
            </div>
          </div>
        </section>

        {/* Simulation Modal */}
        {simulationModalOpp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
              <button
                onClick={() => setSimulationModalOpp(null)}
                className="absolute right-4 top-4 text-muted hover:text-foreground"
              >
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 text-purple mb-1">
                <Beaker size={18} />
                <span className="text-xs font-bold uppercase tracking-wider">Paper Trading Simulator</span>
              </div>
              <h3 className="text-base font-bold text-foreground line-clamp-1">{simulationModalOpp.title}</h3>

              <div className="mt-4 rounded-xl border border-border bg-surface-alt p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary font-medium">Rebalance Strategy:</span>
                  <span className="font-bold text-purple uppercase">{simulationModalOpp.headline}</span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-secondary font-medium">Trade Size (Sets / Shares):</span>
                  <div className="flex items-center gap-1.5">
                    {[5, 10, 25, 50, 100].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setSimShares(amt)}
                        className={`px-2 py-0.5 rounded text-xs font-mono font-semibold transition ${simShares === amt ? 'bg-purple text-white' : 'bg-surface border border-border text-secondary'}`}
                      >
                        {amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Financial Simulation Math */}
                <div className="border-t border-border pt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-surface p-2 border border-border">
                    <div className="text-[10px] text-muted uppercase">Capital Needed</div>
                    <div className="mt-1 font-mono text-sm font-bold text-foreground">
                      ${(simulationModalOpp.type === 'mint-and-sell' ? 1.00 * simShares : (simulationModalOpp.askSum || simulationModalOpp.priceSum) * simShares).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface p-2 border border-border">
                    <div className="text-[10px] text-muted uppercase">Expected Payout</div>
                    <div className="mt-1 font-mono text-sm font-bold text-accent">
                      ${(simulationModalOpp.type === 'mint-and-sell' ? (simulationModalOpp.bidSum || simulationModalOpp.priceSum) * simShares : 1.00 * simShares).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface p-2 border border-border">
                    <div className="text-[10px] text-muted uppercase">Net Profit</div>
                    <div className="mt-1 font-mono text-sm font-bold text-profit">
                      {money(simulationModalOpp.type === 'mint-and-sell'
                        ? ((simulationModalOpp.bidSum || simulationModalOpp.priceSum) - 1.00) * simShares
                        : (1.00 - (simulationModalOpp.askSum || simulationModalOpp.priceSum)) * simShares
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Leg preview */}
              <div className="mt-4">
                <div className="text-[11px] font-bold uppercase text-secondary mb-2">Simulated Order Tickets ({simulationModalOpp.outcomes.length} legs):</div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {simulationModalOpp.outcomes.map(o => (
                    <div key={o.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-xs font-mono">
                      <span className="font-sans font-medium text-foreground truncate max-w-[200px]">{o.title}</span>
                      <span className="text-secondary">
                        {simulationModalOpp.type === 'mint-and-sell' ? 'SELL' : 'BUY'} {simShares} @ ${(o.bestBid || o.bestAsk || o.price).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  onClick={() => setSimulationModalOpp(null)}
                  className="px-4 py-2 rounded-xl border border-border bg-surface-alt text-xs font-semibold text-secondary hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => executeSimulation(simulationModalOpp, simShares)}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-purple text-white text-xs font-bold shadow-lg shadow-purple/20 hover:bg-purple/90"
                >
                  <Beaker size={14} /> Confirm Paper Execution
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-loss/25 bg-loss/10 p-4 text-sm text-loss"><AlertTriangle className="mt-0.5 shrink-0" size={17} /><div><div className="font-semibold">Market feeds did not refresh</div><div className="mt-0.5 opacity-80">{error}</div></div></div>}

        <section id="decision-queue" className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="glass-panel min-w-0 overflow-hidden rounded-3xl">
            <div className="border-b border-border p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><div className="mb-1 flex items-center gap-2"><Layers3 className="text-accent" size={18} /><h2 className="text-lg font-bold">Decision queue</h2></div><p className="text-xs leading-5 text-secondary">{riskMode === 'protected' ? 'Only fully hedged, positive-after-cost candidates are shown.' : 'Directional ideas are ranked for research—not recommendations to trade.'}</p></div>
                <div className="flex items-center gap-2 text-xs text-secondary"><span className={`h-2 w-2 rounded-full ${snapshot?.sources.polymarket.ok && snapshot?.sources.kalshi.ok ? 'bg-profit' : 'bg-warn'}`} />{snapshot ? `${quoteCounts.polymarket} Polymarket · ${quoteCounts.kalshi} Kalshi quoted` : 'Connecting…'}</div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-void/35 p-1.5">
                <button onClick={() => { setRiskMode('protected'); setSelectedKey(null) }} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${riskMode === 'protected' ? 'bg-profit text-void shadow-lg shadow-profit/10' : 'text-secondary hover:bg-surface-alt hover:text-foreground'}`}><LockKeyhole size={14} /> Capital Protection</button>
                <button onClick={() => { setRiskMode('explore'); setSelectedKey(null) }} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${riskMode === 'explore' ? 'bg-accent text-white shadow-lg shadow-accent/10' : 'text-secondary hover:bg-surface-alt hover:text-foreground'}`}><Sparkles size={14} /> Explore Ideas</button>
              </div>
              {riskMode === 'protected' && <div className="mt-3 flex items-start gap-2 rounded-xl border border-profit/15 bg-profit/5 px-3.5 py-2.5 text-[11px] leading-5 text-secondary"><ShieldCheck className="mt-0.5 shrink-0 text-profit" size={14} /><span><strong className="text-foreground">Strict rule:</strong> if both outcomes cannot be bought below the guaranteed payout after modeled costs and available depth, the decision is DO NOT TRADE.</span></div>}
              {riskMode === 'explore' && <div className="mt-3 rounded-xl border border-accent/15 bg-accent/5 px-3.5 py-2.5 text-[11px] leading-5 text-secondary"><strong className="text-foreground">Recommended ranking:</strong> Best chance + return favors liquid, tightly quoted favorites around 70–85%, where the potential payout is still meaningful. It is a screening score—not proof that the favorite will win.</div>}
              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative block"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} /><input aria-label="Search markets" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search a topic, team, or event" className="!rounded-xl !bg-void/45 !py-3 !pl-10" /></label>
                {riskMode === 'explore' && <div className="flex items-center gap-2">
                  <SlidersHorizontal className="hidden text-muted sm:block" size={15} />
                  <select aria-label="Sort markets" value={sort} onChange={event => setSort(event.target.value as SortMode)} className="!w-auto !min-w-40 !rounded-xl !bg-void/45 !py-3">
                    <option value="riskReward">Best chance + return</option><option value="certainty">Highest implied chance</option><option value="upside">Highest potential return</option><option value="volume">Most active</option><option value="tight">Tightest quotes</option><option value="balanced">Most uncertain</option><option value="closing">Closing soon</option>
                  </select>
                </div>}
              </div>
              <div className="mt-3 flex gap-2">
                {(['all', 'polymarket', 'kalshi'] as VenueFilter[]).map(value => <button key={value} onClick={() => changeFilter(value)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${filter === value ? 'bg-foreground text-void' : 'border border-border bg-void/30 text-secondary hover:text-foreground'}`}>{value === 'all' ? 'All markets' : sourceLabel(value)}</button>)}
              </div>
            </div>

            <div className="space-y-2 p-3 sm:p-4">
              {(loading && !snapshot) || (riskMode === 'protected' && arbitrageLoading && !arbitrage) ? <div className="grid min-h-72 place-items-center"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin text-accent" size={22} /><div className="text-sm font-semibold">{riskMode === 'protected' ? 'Checking for fully hedged trades' : 'Reading live markets'}</div><div className="mt-1 text-xs text-secondary">Comparing quotes, costs, and available depth…</div></div></div> : visible.length === 0 ? <div className="grid min-h-72 place-items-center text-center"><div><ShieldCheck className="mx-auto mb-3 text-profit" size={26} /><div className="font-semibold">{riskMode === 'protected' ? 'DO NOT TRADE right now' : 'No matching markets'}</div><div className="mt-1 max-w-sm text-sm leading-6 text-secondary">{riskMode === 'protected' ? 'No fully hedged opportunity currently survives fees, depth, and the execution buffer. Waiting protects your capital.' : 'Try a broader search or another venue.'}</div></div></div> : visible.map((market, index) => {
                const active = selected ? marketKey(selected) === marketKey(market) : false
                const quality = quoteQuality(market)
                const locked = allLockedProfit.find(item => item.marketId === market.id)
                const decision: DecisionGuidance = locked
                  ? { action: 'BUY BOTH SIDES', reason: `${money(locked.netProfit)} modeled net profit.`, tone: 'profit' }
                  : baseDecision(market)
                const total = askTotal(market)
                const profile = opportunityProfile(market)
                return <button key={marketKey(market)} onClick={() => selectMarket(market)} className={`decision-row w-full rounded-2xl p-4 text-left sm:p-5 ${active ? '!border-accent/60 !bg-accent/10 shadow-lg shadow-accent/5' : ''}`}>
                  <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_230px_auto]">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-secondary">#{String(index + 1).padStart(2, '0')}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${market.venue === 'polymarket' ? 'border-purple/25 bg-purple/10 text-purple' : 'border-accent/25 bg-accent/10 text-accent'}`}>{sourceLabel(market.venue)}</span><span className="flex items-center gap-1 text-[10px] text-muted"><Clock3 size={11} /> {closeLabel(market.closeTime)}</span></div>
                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 sm:text-[15px]">{market.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-secondary"><span>24h volume <strong className="font-semibold text-foreground">{compactVolume(market.volume24h)}</strong></span>{total !== null && <span>quote friction <strong className={Math.abs(total - 1) <= .025 ? 'text-profit' : 'text-warn'}>{((total - 1) * 100).toFixed(1)} pts</strong></span>}{profile && <span className={profile.impliedChance >= .9 ? 'text-warn' : profile.impliedChance >= .7 ? 'text-profit' : 'text-secondary'}>{profile.label}</span>}</div>
                    </div>
                    <div>
                      {profile && <div className="mb-2 grid grid-cols-3 gap-1.5 text-center" title={`Favorite: ${profile.outcome}`}><div className="rounded-lg bg-void/35 px-1.5 py-1.5"><div className="font-mono text-xs font-bold text-accent">{(profile.impliedChance * 100).toFixed(0)}%</div><div className="text-[8px] uppercase tracking-wide text-muted">implied</div></div><div className="rounded-lg bg-void/35 px-1.5 py-1.5"><div className="font-mono text-xs font-bold text-profit">{(profile.profitPerShare * 100).toFixed(0)}¢</div><div className="text-[8px] uppercase tracking-wide text-muted">profit/share</div></div><div className="rounded-lg bg-void/35 px-1.5 py-1.5"><div className="font-mono text-xs font-bold text-foreground">+{(profile.returnOnStake * 100).toFixed(0)}%</div><div className="text-[8px] uppercase tracking-wide text-muted">gross return</div></div></div>}
                      <div className="mb-2 flex items-center justify-between text-xs"><span className="max-w-[95px] truncate text-secondary">{market.outcomes[0]}</span><span className="font-mono font-bold text-foreground">{quote(market.yesAsk)}</span></div>
                      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated"><div className="h-full rounded-full bg-gradient-to-r from-accent to-purple" style={{ width: `${Math.max(0, Math.min(100, (market.yesAsk ?? 0) * 100))}%` }} /></div>
                      <div className="flex items-center justify-between text-xs"><span className="max-w-[95px] truncate text-secondary">{market.outcomes[1]}</span><span className="font-mono font-bold text-foreground">{quote(market.noAsk)}</span></div>
                    </div>
                    <div className="flex items-center justify-between gap-3 md:flex-col md:items-end"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold ${decisionClass(decision.tone)}`}>{decision.action}</span><span className={`hidden rounded-full border px-2 py-0.5 text-[9px] font-bold md:inline-flex ${quality.className}`}>{quality.label} quotes</span><ChevronRight className={active ? 'text-accent' : 'text-muted'} size={17} /></div>
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

              {selectedDecision && <div className={`rounded-2xl border p-4 ${decisionClass(selectedDecision.tone)}`}><div className="flex items-center justify-between gap-3"><div className="text-[10px] font-bold uppercase tracking-[.16em] opacity-75">Decision</div><span className="rounded-full border border-current/25 px-2 py-0.5 text-[9px] font-bold">{research ? 'MODEL + MARKET' : 'MARKET SCREEN'}</span></div><div className="mt-2 text-xl font-extrabold tracking-tight">{selectedDecision.action}</div><div className="mt-1 text-xs leading-5 opacity-80">{selectedDecision.reason}</div>{!research && modelCanRun && <button onClick={() => void researchSelected()} disabled={researchLoading} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-[11px] font-bold text-void disabled:opacity-50">{researchLoading ? <RefreshCw className="animate-spin" size={12} /> : <BrainCircuit size={12} />} Confirm with AI research</button>}</div>}

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
