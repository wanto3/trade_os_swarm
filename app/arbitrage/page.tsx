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
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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
  if (status === 'opportunity') return 'border-green/30 bg-green/10 text-green'
  if (status === 'near-miss') return 'border-orange/30 bg-orange/10 text-orange'
  return 'border-magenta/30 bg-magenta/10 text-magenta'
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
    <main className="relative min-h-screen overflow-hidden bg-void text-foreground">
      <div className="ambient-orb ambient-orb-1" />
      <div className="ambient-orb ambient-orb-2" />
      <div className="hex-grid-bg pointer-events-none fixed inset-0" />

      <div className="relative z-10 mx-auto max-w-[1500px] px-4 py-5 md:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-border-glow/70 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border-glow bg-surface-alt text-muted-secondary hover:border-cyan/50 hover:text-cyan"
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={16} />
            </Link>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-green/30 bg-green/10 glow-green">
              <ArrowLeftRight className="text-green" size={22} />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h1 className="font-display text-xl font-bold tracking-[0.12em] md:text-2xl">COMPLETE-SET ARB LAB</h1>
                <Badge variant="outline" className="border-purple/30 bg-purple/10 text-purple">PAPER ONLY</Badge>
              </div>
              <p className="text-xs text-muted-secondary md:text-sm">
                Real CLOB V2 books · executable depth · both-leg fees · no wallet access
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface/80 px-3 py-2 text-xs text-muted-secondary">
            <span className={loading ? 'h-2 w-2 animate-pulse rounded-full bg-orange' : 'live-dot'} />
            {loading ? 'SCANNING LIVE BOOKS' : `SNAPSHOT ${scan ? new Date(scan.generatedAt).toLocaleTimeString() : '—'}`}
          </div>
        </header>

        <section className="mb-5 grid gap-4 xl:grid-cols-[1fr_360px]">
          <Card className="corner-brackets border-border-glow bg-surface/90">
            <CardHeader>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Radar size={17} className="text-cyan" /> Live scanner controls
                  </CardTitle>
                  <CardDescription className="mt-2">
                    A pair only qualifies when the requested shares can be bought on both books.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-secondary">
                    Shares per leg
                    <input
                      type="number"
                      min={1}
                      max={10_000}
                      value={sharesInput}
                      onChange={event => setSharesInput(Number(event.target.value))}
                      className="w-28"
                    />
                  </label>
                  <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-secondary">
                    Markets
                    <select
                      value={marketLimitInput}
                      onChange={event => setMarketLimitInput(Number(event.target.value))}
                      className="w-28"
                    >
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={150}>150</option>
                      <option value={250}>250</option>
                    </select>
                  </label>
                  <Button onClick={applyInputs} disabled={loading} className="gap-2">
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Scan now
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Markets scanned" value={scan?.scannedMarkets ?? 0} detail={`${scan?.eligibleBinaryMarkets ?? 0} binary books`} />
                <Metric label="Books received" value={scan?.booksReceived ?? 0} detail={`of ${scan?.booksRequested ?? 0} requested`} />
                <Metric label="Net-positive now" value={scan?.profitableCount ?? 0} detail="after estimated costs" accent={Boolean(scan?.profitableCount)} />
                <Metric label="Paper size" value={`${scan?.requestedShares ?? query.shares} pairs`} detail={`$${scan?.assumptions.gasBuffer.toFixed(2) ?? '0.03'} merge buffer`} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-green/20 bg-gradient-to-br from-green/10 to-surface/90">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck size={17} className="text-green" /> The lock condition
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs text-muted-secondary">
              <div className="rounded-lg border border-green/20 bg-void/70 p-3 font-mono text-green">
                payout − asks − fees − gas − buffer &gt; 0
              </div>
              <p>One complete YES + NO pair can be merged into $1 pUSD. This page never places or signs orders.</p>
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-surface-alt px-3 py-2">
                <span className="flex items-center gap-2"><Timer size={14} /> Auto-refresh every 15s</span>
                <input type="checkbox" checked={autoRefresh} onChange={event => setAutoRefresh(event.target.checked)} />
              </label>
            </CardContent>
          </Card>
        </section>

        {error && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-magenta/30 bg-magenta/10 p-4 text-sm text-magenta">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div><strong>Live scan failed.</strong> {error}</div>
          </div>
        )}

        {scan?.warnings.map(warning => (
          <div key={warning} className="mb-2 flex items-start gap-2 text-xs text-muted-secondary">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-orange" /> {warning}
          </div>
        ))}

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="border-border-glow bg-surface/90">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Executable opportunities</CardTitle>
                <CardDescription className="mt-2">Ranked by estimated net profit at the selected size.</CardDescription>
              </div>
              <button
                onClick={() => setShowOnlyPositive(value => !value)}
                className={`rounded-md border px-3 py-1.5 text-xs ${showOnlyPositive ? 'border-green/40 bg-green/10 text-green' : 'border-border text-muted-secondary'}`}
              >
                {showOnlyPositive ? 'Positive only' : 'Show all'}
              </button>
            </CardHeader>
            <CardContent>
              {loading && !scan ? (
                <div className="grid min-h-80 place-items-center text-center text-muted-secondary">
                  <div><RefreshCw className="mx-auto mb-3 animate-spin text-cyan" /><p>Reading live YES and NO books…</p></div>
                </div>
              ) : displayed.length === 0 ? (
                <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-border text-center">
                  <div className="max-w-sm px-6">
                    <CheckCircle2 className="mx-auto mb-3 text-green" />
                    <h3 className="font-semibold">No riskless spread right now</h3>
                    <p className="mt-2 text-xs text-muted-secondary">That is a valid result. Efficient books usually price YES + NO at or above $1 after costs.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayed.map(opportunity => (
                    <article key={opportunity.marketId} className="rounded-xl border border-border bg-void/55 p-4 transition-colors hover:border-border-glow">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={statusStyle(opportunity.status)}>
                              {opportunity.status.replace('-', ' ')}
                            </Badge>
                            {opportunity.feeSource !== 'live' && <Badge variant="outline" className="border-orange/30 text-orange">fee fallback</Badge>}
                            {opportunity.negRisk && <Badge variant="outline">neg-risk</Badge>}
                          </div>
                          <a href={opportunity.url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-2 font-semibold leading-snug text-foreground hover:text-cyan">
                            {opportunity.question}<ExternalLink size={13} className="mt-1 shrink-0" />
                          </a>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                            <Quote label={opportunity.outcomes[0]} value={opportunity.yes.averagePrice} worst={opportunity.yes.worstPrice} />
                            <Quote label={opportunity.outcomes[1]} value={opportunity.no.averagePrice} worst={opportunity.no.worstPrice} />
                            <Quote label="PAIR COST" value={opportunity.combinedAveragePrice} />
                            <div className="rounded-lg border border-border bg-surface-alt p-2">
                              <div className="data-label">DEPTH</div>
                              <div className={opportunity.fillable ? 'mt-1 font-mono text-green' : 'mt-1 font-mono text-magenta'}>
                                {opportunity.fillableShares.toFixed(2)} / {opportunity.requestedShares}
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-secondary">
                            <span>Cost {money(-opportunity.acquisitionCost)}</span>
                            <span>Gross {money(opportunity.grossProfit)}</span>
                            <span>Fees {money(-opportunity.fees)}</span>
                            <span>Buffers {money(-(opportunity.gasBuffer + opportunity.executionBuffer))}</span>
                            <span>24h vol {compactMoney(opportunity.volume24hr)}</span>
                          </div>
                        </div>

                        <div className="flex min-w-44 flex-col items-stretch rounded-xl border border-border bg-surface-alt p-3 text-right">
                          <span className="data-label">EST. NET PROFIT</span>
                          <span className={`mt-1 font-mono text-xl font-bold ${opportunity.netProfit > 0 ? 'text-green' : 'text-magenta'}`}>
                            {money(opportunity.netProfit)}
                          </span>
                          <span className={`text-xs ${opportunity.netReturnPercent > 0 ? 'text-green' : 'text-magenta'}`}>
                            {opportunity.netReturnPercent > 0 ? '+' : ''}{opportunity.netReturnPercent.toFixed(3)}%
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 gap-2"
                            disabled={!opportunity.fillable}
                            onClick={() => recordPaperFill(opportunity)}
                          >
                            <Beaker size={13} /> Record paper fill
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="h-fit border-purple/20 bg-surface/90 xl:sticky xl:top-5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Beaker size={17} className="text-purple" /> Paper-fill ledger</CardTitle>
              <CardDescription>Snapshot assumption: both legs fill exactly as displayed.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border bg-void/60 p-3">
                  <div className="data-label">SIMULATIONS</div>
                  <div className="mt-1 font-mono text-xl">{paperFills.length}</div>
                </div>
                <div className="rounded-lg border border-border bg-void/60 p-3">
                  <div className="data-label">ASSUMED P&amp;L</div>
                  <div className={`mt-1 font-mono text-xl ${simulatedProfit >= 0 ? 'text-green' : 'text-magenta'}`}>{money(simulatedProfit)}</div>
                </div>
              </div>

              {paperFills.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-secondary">
                  <Wallet className="mx-auto mb-2" size={18} /> Record a displayed quote to test its locked payout math.
                </div>
              ) : (
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {paperFills.map(fill => (
                    <div key={fill.id} className="rounded-lg border border-border bg-void/60 p-3">
                      <div className="line-clamp-2 text-xs font-medium">{fill.question}</div>
                      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-muted-secondary">
                        <span>{fill.shares} pairs</span>
                        <span className={fill.netProfit >= 0 ? 'text-green' : 'text-magenta'}>{money(fill.netProfit)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paperFills.length > 0 && (
                <Button variant="ghost" size="sm" className="mt-3 w-full text-muted-secondary" onClick={() => setPaperFills([])}>Clear paper ledger</Button>
              )}
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-orange/20 bg-orange/5 p-3 text-[11px] leading-relaxed text-muted-secondary">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-orange" />
                This proves the pricing equation, not atomic execution. Real deployment still needs FOK handling, reconciliation, and a hedge path.
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  )
}

function Metric({ label, value, detail, accent = false }: { label: string; value: string | number; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${accent ? 'border-green/30 bg-green/5' : 'border-border bg-void/55'}`}>
      <div className="data-label">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-bold ${accent ? 'text-green' : 'text-foreground'}`}>{value}</div>
      <div className="mt-1 text-[10px] text-muted-secondary">{detail}</div>
    </div>
  )
}

function Quote({ label, value, worst }: { label: string; value: number | null; worst?: number | null }) {
  return (
    <div className="rounded-lg border border-border bg-surface-alt p-2">
      <div className="truncate data-label" title={label}>{label}</div>
      <div className="mt-1 font-mono text-cyan">{value === null ? '—' : `$${value.toFixed(4)}`}</div>
      {worst !== undefined && worst !== null && <div className="text-[9px] text-muted-secondary">worst ${worst.toFixed(3)}</div>}
    </div>
  )
}
