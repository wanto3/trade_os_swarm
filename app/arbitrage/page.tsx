'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Beaker,
  CheckCircle2,
  ExternalLink,
  Radar,
  RefreshCw,
  ShieldCheck,
  Timer,
  Wallet,
} from 'lucide-react'

interface BookFill {
  averagePrice: number | null
  worstPrice: number | null
  filledShares: number
  fillable: boolean
  cost: number
}

interface ArbitrageOpportunity {
  marketId: string
  question: string
  outcomes: [string, string]
  url: string
  status: 'opportunity' | 'near-miss' | 'insufficient-depth'
  requestedShares: number
  fillableShares: number
  fillable: boolean
  yes: BookFill
  no: BookFill
  bestAskSum: number | null
  combinedAveragePrice: number | null
  acquisitionCost: number
  payout: number
  grossProfit: number
  fees: number
  gasBuffer: number
  executionBuffer: number
  netProfit: number
  netReturnPercent: number
  feeRate: number
  feeSource: 'live' | 'conservative-fallback'
  volume24hr: number
  liquidity: number
  endDate: string | null
  negRisk: boolean
}

interface ScanResult {
  generatedAt: string
  paperOnly: true
  requestedShares: number
  marketLimit: number
  scannedMarkets: number
  eligibleBinaryMarkets: number
  booksRequested: number
  booksReceived: number
  profitableCount: number
  opportunities: ArbitrageOpportunity[]
  assumptions: {
    minimumNetProfit: number
    gasBuffer: number
    executionBufferBps: number
    fallbackFeeRate: number
  }
  warnings: string[]
}

interface PaperFill {
  id: string
  recordedAt: number
  question: string
  shares: number
  netProfit: number
  netReturnPercent: number
  status: ArbitrageOpportunity['status']
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

function statusStyle(status: ArbitrageOpportunity['status']): string {
  if (status === 'opportunity') return 'badge-profit'
  if (status === 'near-miss') return 'badge-warning'
  return 'badge-loss'
}

function statusLabel(status: ArbitrageOpportunity['status']): string {
  if (status === 'opportunity') return 'Profitable'
  if (status === 'near-miss') return 'Near Miss'
  return 'Not Enough Depth'
}

export default function ArbitrageLabPage() {
  const [sharesInput, setSharesInput] = useState(10)
  const [marketLimitInput, setMarketLimitInput] = useState(100)
  const [query, setQuery] = useState({ shares: 10, marketLimit: 100 })
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [showOnlyPositive, setShowOnlyPositive] = useState(false)
  const [paperFills, setPaperFills] = useState<PaperFill[]>([])

  const runScan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        shares: String(query.shares),
        marketLimit: String(query.marketLimit),
      })
      const response = await fetch(`/api/arbitrage?${params}`, { cache: 'no-store' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || `Scanner returned HTTP ${response.status}`)
      setScan(payload as ScanResult)
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Scanner failed')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    void runScan()
  }, [runScan])

  useEffect(() => {
    if (!autoRefresh) return
    const timer = window.setInterval(() => void runScan(), 15_000)
    return () => window.clearInterval(timer)
  }, [autoRefresh, runScan])

  const displayed = useMemo(() => {
    if (!scan) return []
    return showOnlyPositive
      ? scan.opportunities.filter(item => item.status === 'opportunity')
      : scan.opportunities
  }, [scan, showOnlyPositive])

  const simulatedProfit = paperFills.reduce((sum, fill) => sum + fill.netProfit, 0)

  const applyInputs = () => {
    const next = {
      shares: Math.min(10_000, Math.max(1, Number(sharesInput) || 10)),
      marketLimit: Math.min(250, Math.max(10, Math.floor(Number(marketLimitInput) || 100))),
    }
    setSharesInput(next.shares)
    setMarketLimitInput(next.marketLimit)
    if (next.shares === query.shares && next.marketLimit === query.marketLimit) {
      void runScan()
    } else {
      setQuery(next)
    }
  }

  const recordPaperFill = (opportunity: ArbitrageOpportunity) => {
    setPaperFills(current => [{
      id: `${opportunity.marketId}-${Date.now()}`,
      recordedAt: Date.now(),
      question: opportunity.question,
      shares: opportunity.requestedShares,
      netProfit: opportunity.netProfit,
      netReturnPercent: opportunity.netReturnPercent,
      status: opportunity.status,
    }, ...current].slice(0, 20))
  }

  return (
    <main className="relative min-h-screen bg-void text-foreground">
      <div className="relative z-10 mx-auto max-w-[1500px] px-4 py-8 md:px-8">
        <header className="mb-8 flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface-alt text-muted hover:text-accent transition-colors"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-bold md:text-2xl">Arbitrage Scanner</h1>
              <p className="text-sm text-secondary mt-1">
                Scan Polymarket for risk-free complete-set opportunities (Paper mode only)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-alt px-4 py-2.5 text-xs font-medium text-secondary">
            <span className={loading ? 'h-2.5 w-2.5 animate-pulse rounded-full bg-warn' : 'live-dot h-2.5 w-2.5 rounded-full bg-profit'} />
            {loading ? 'SCANNING' : `LIVE SCAN: ${scan ? new Date(scan.generatedAt).toLocaleTimeString() : '—'}`}
          </div>
        </header>

        <section className="mb-6 grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="card-base flex flex-col p-6 bg-surface rounded-xl border border-border shadow-sm">
            <div className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Radar size={18} className="text-accent" /> Scanner Controls
                </h2>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <label className="grid gap-1.5 text-xs font-medium text-secondary">
                  Shares per trade
                  <input
                    type="number"
                    min={1}
                    max={10_000}
                    value={sharesInput}
                    onChange={event => setSharesInput(Number(event.target.value))}
                    className="w-32 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium text-secondary">
                  Markets to scan
                  <select
                    value={marketLimitInput}
                    onChange={event => setMarketLimitInput(Number(event.target.value))}
                    className="w-32 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={150}>150</option>
                    <option value={250}>250</option>
                  </select>
                </label>
                <button
                  onClick={applyInputs}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                  Scan Now
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Markets Scanned" value={scan?.scannedMarkets ?? 0} detail={`${scan?.eligibleBinaryMarkets ?? 0} binary books`} />
              <Metric label="Order Books" value={scan?.booksReceived ?? 0} detail={`of ${scan?.booksRequested ?? 0} requested`} />
              <Metric label="Profitable" value={scan?.profitableCount ?? 0} detail="after estimated costs" accent={Boolean(scan?.profitableCount)} />
              <Metric label="Trade Size" value={`${scan?.requestedShares ?? query.shares} shares`} detail={`$${scan?.assumptions.gasBuffer.toFixed(2) ?? '0.03'} merge buffer`} />
            </div>
          </div>

          <div className="card-base flex flex-col p-6 bg-surface rounded-xl border border-border shadow-sm">
             <h2 className="flex items-center gap-2 text-lg font-semibold">
                <ShieldCheck size={18} className="text-profit" /> How it works
              </h2>
              <div className="mt-5 text-sm text-secondary space-y-5">
                <div className="rounded-lg border border-border bg-surface-alt p-4 font-medium text-foreground text-center">
                  Buy Yes + No shares → Merge into $1.00 → Keep the profit
                </div>
                <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface-alt px-4 py-3 hover:border-border-glow transition-colors">
                  <span className="flex items-center gap-2 text-foreground font-medium"><Timer size={16} /> Auto-refresh (15s)</span>
                  <input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} className="h-4 w-4 accent-accent rounded" />
                </label>
              </div>
          </div>
        </section>

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-loss/30 bg-loss/10 p-4 text-sm text-loss">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div><strong>Live scan failed.</strong> {error}</div>
          </div>
        )}

        {scan?.warnings.map(warning => (
          <div key={warning} className="mb-3 flex items-start gap-2 text-sm text-secondary">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" /> {warning}
          </div>
        ))}

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Executable Opportunities</h2>
                <p className="mt-1 text-sm text-secondary">Ranked by estimated net profit at the selected size.</p>
              </div>
              <button
                onClick={() => setShowOnlyPositive(value => !value)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${showOnlyPositive ? 'border-profit/40 bg-profit/10 text-profit' : 'border-border bg-surface-alt text-secondary hover:text-foreground'}`}
              >
                {showOnlyPositive ? 'Positive Only' : 'Show All'}
              </button>
            </div>
            
            <div>
              {loading && !scan ? (
                <div className="grid min-h-[320px] place-items-center rounded-xl border border-border bg-surface text-center text-secondary">
                  <div><RefreshCw className="mx-auto mb-4 h-8 w-8 animate-spin text-accent" /><p>Reading live YES and NO books…</p></div>
                </div>
              ) : displayed.length === 0 ? (
                <div className="grid min-h-[280px] place-items-center rounded-xl border border-dashed border-border bg-surface text-center">
                  <div className="max-w-md px-6">
                    <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-profit" />
                    <h3 className="text-lg font-semibold text-foreground">No riskless spread right now</h3>
                    <p className="mt-2 text-sm text-secondary">That is a valid result. Efficient books usually price YES + NO at or above $1 after costs.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayed.map(opportunity => (
                    <article key={opportunity.marketId} className="card-base p-5 bg-surface rounded-xl border border-border transition-colors hover:border-accent/40 shadow-sm">
                      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider ${statusStyle(opportunity.status)}`}>
                                {statusLabel(opportunity.status)}
                            </span>
                            {opportunity.feeSource !== 'live' && <span className="badge-warning px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider">Fee Fallback</span>}
                            {opportunity.negRisk && <span className="badge-neutral px-2.5 py-1 rounded-md text-xs font-medium uppercase tracking-wider">Neg Risk</span>}
                          </div>
                          
                          <a href={opportunity.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2 text-base font-semibold text-foreground hover:text-accent leading-snug">
                            {opportunity.question}<ExternalLink size={15} className="mt-1 shrink-0 text-secondary" />
                          </a>
                          
                          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-secondary font-mono bg-surface-alt rounded-lg px-4 py-2.5 w-fit border border-border">
                            <span>Yes avg: {opportunity.yes.averagePrice !== null ? `$${opportunity.yes.averagePrice.toFixed(4)}` : '—'}</span>
                            <span className="text-muted">&middot;</span>
                            <span>No avg: {opportunity.no.averagePrice !== null ? `$${opportunity.no.averagePrice.toFixed(4)}` : '—'}</span>
                            <span className="text-muted">&middot;</span>
                            <span className="font-semibold text-foreground">Total: {opportunity.combinedAveragePrice !== null ? `$${opportunity.combinedAveragePrice.toFixed(4)}` : '—'}</span>
                          </div>
                          
                          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted font-medium">
                            <span>Cost {money(-opportunity.acquisitionCost)}</span>
                            <span>Gross {money(opportunity.grossProfit)}</span>
                            <span>Fees {money(-opportunity.fees)}</span>
                            <span>Buffer {money(-(opportunity.gasBuffer + opportunity.executionBuffer))}</span>
                            <span>24h Vol {compactMoney(opportunity.volume24hr)}</span>
                          </div>
                        </div>

                        <div className="flex flex-col justify-center rounded-xl bg-surface-alt border border-border p-5 min-w-[220px] shrink-0 text-right">
                          <span className="text-xs font-semibold text-secondary uppercase tracking-wider">Net Profit</span>
                          <span className={`mt-1 font-mono text-3xl font-bold ${opportunity.netProfit > 0 ? 'text-profit' : 'text-loss'}`}>
                            {money(opportunity.netProfit)}
                          </span>
                          <span className={`mt-1 font-mono text-sm font-medium ${opportunity.netReturnPercent > 0 ? 'text-profit' : 'text-loss'}`}>
                            {opportunity.netReturnPercent > 0 ? '+' : ''}{opportunity.netReturnPercent.toFixed(2)}%
                          </span>
                          <button
                            className="mt-5 w-full flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-accent hover:border-accent hover:text-white transition-all disabled:opacity-50 disabled:hover:bg-surface disabled:hover:text-foreground disabled:hover:border-border"
                            disabled={!opportunity.fillable}
                            onClick={() => recordPaperFill(opportunity)}
                          >
                            <Beaker size={16} /> Record Trade
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card-base flex flex-col p-6 bg-surface rounded-xl border border-border shadow-sm xl:sticky xl:top-6 h-fit">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Beaker size={18} className="text-accent" /> Trade Log
            </h2>
            <p className="mt-2 text-sm text-secondary">Snapshot assumption: both legs fill exactly as displayed.</p>
            
            <div className="mt-6 mb-5 grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-surface-alt p-4">
                <div className="text-xs font-semibold text-secondary uppercase tracking-wider">Simulations</div>
                <div className="mt-2 font-mono text-2xl font-bold">{paperFills.length}</div>
              </div>
              <div className="rounded-xl border border-border bg-surface-alt p-4">
                <div className="text-xs font-semibold text-secondary uppercase tracking-wider">Assumed P&amp;L</div>
                <div className={`mt-2 font-mono text-2xl font-bold ${simulatedProfit >= 0 ? 'text-profit' : 'text-loss'}`}>{money(simulatedProfit)}</div>
              </div>
            </div>

            {paperFills.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-secondary bg-surface-alt/50">
                <Wallet className="mx-auto mb-3 text-muted" size={24} /> 
                Record a trade to test its locked payout math.
              </div>
            ) : (
              <div className="max-h-[500px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                {paperFills.map(fill => (
                  <div key={fill.id} className="rounded-lg border border-border bg-surface-alt p-4 shadow-sm">
                    <div className="line-clamp-2 text-sm font-medium leading-snug">{fill.question}</div>
                    <div className="mt-3 flex items-center justify-between font-mono text-xs text-secondary">
                      <span className="font-medium bg-surface px-2 py-1 rounded border border-border">{fill.shares} shares</span>
                      <span className={`text-sm font-bold ${fill.netProfit >= 0 ? 'text-profit' : 'text-loss'}`}>{money(fill.netProfit)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {paperFills.length > 0 && (
              <button 
                className="mt-5 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-secondary hover:bg-surface-alt hover:text-foreground transition-colors" 
                onClick={() => setPaperFills([])}
              >
                Clear Log
              </button>
            )}
            
            <div className="mt-5 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn/10 p-4 text-xs leading-relaxed text-secondary font-medium">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
              This proves the pricing equation, not atomic execution. Real deployment still needs FOK handling and a hedge path.
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string | number; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? 'border-profit/30 bg-profit/5' : 'border-border bg-surface-alt'}`}>
      <div className="text-xs font-semibold text-secondary uppercase tracking-wider">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold ${accent ? 'text-profit' : 'text-foreground'}`}>{value}</div>
      <div className="mt-1.5 text-xs text-muted font-medium">{detail}</div>
    </div>
  )
}

function Quote({ label, value, worst }: { label: string; value: number | null; worst?: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt p-3">
      <div className="truncate text-xs font-semibold text-secondary uppercase tracking-wider" title={label}>{label}</div>
      <div className="mt-1.5 font-mono text-sm font-medium text-accent">{value === null ? '—' : `$${value.toFixed(4)}`}</div>
      {worst !== undefined && worst !== null && <div className="mt-1 text-[10px] text-muted font-medium">worst ${worst.toFixed(3)}</div>}
    </div>
  )
}
