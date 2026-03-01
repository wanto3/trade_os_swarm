"use client"

import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown, AlertCircle, RefreshCw, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/utils"

interface ApiPosition {
  id: string
  symbol: string
  type: string
  entryPrice: number
  currentPrice: number
  quantity: number
  leverage: number
  marginUsed: number
  pnl: number
  pnlPercent: number
  timestamp: number
  status: string
}

interface ApiPortfolio {
  totalBalance: number
  availableMargin: number
  usedMargin: number
  positions: any[]
  totalPnl: number
  lastUpdate: number
}

interface ApiPositionsResponse {
  success: boolean
  data?: {
    positions: ApiPosition[]
    portfolio: ApiPortfolio
    timestamp: number
  }
  error?: string
}

const defaultPortfolio: ApiPortfolio = {
  totalBalance: 10000,
  availableMargin: 10000,
  usedMargin: 0,
  positions: [],
  totalPnl: 0,
  lastUpdate: Date.now(),
}

export function PositionPanel() {
  const [portfolio, setPortfolio] = useState<ApiPortfolio>(defaultPortfolio)
  const [positions, setPositions] = useState<ApiPosition[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchPositions = async () => {
    try {
      setError(null)
      const response = await fetch('/api/positions')
      const result: ApiPositionsResponse = await response.json()

      if (result.success && result.data) {
        if (result.data.positions) setPositions(result.data.positions)
        if (result.data.portfolio) setPortfolio(result.data.portfolio)
      } else {
        setError(result.error || 'Failed to fetch positions')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchPositions()
    const interval = setInterval(fetchPositions, 10000)
    return () => clearInterval(interval)
  }, [])

  const handleClosePosition = async (positionId: string) => {
    try {
      await fetch(`/api/positions/${positionId}`, { method: 'DELETE' })
      fetchPositions()
    } catch (err) {
      console.error('Error closing position:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="border border-border/50 rounded-xl p-4" style={{ border: '1px solid hsl(217.2 32.6% 17.5%)', borderRadius: '0.75rem', padding: '1rem', backgroundColor: 'hsl(222.2 84% 4.9%)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold" style={{ color: 'hsl(210 40% 98%)' }}>Portfolio</h2>
        </div>
        <div className="h-24 rounded-lg bg-muted/20 animate-pulse" style={{ height: '6rem', borderRadius: '0.5rem', backgroundColor: 'hsl(217.2 32.6% 17.5% / 0.2)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10" style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid hsl(0 72% 51% / 0.2)', backgroundColor: 'hsl(0 72% 51% / 0.1)' }}>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" style={{ color: 'hsl(0 72% 51%)' }} />
          <p className="text-sm text-red-500" style={{ color: 'hsl(0 72% 51%)' }}>{error}</p>
          <Button variant="outline" size="sm" onClick={() => { setIsRefreshing(true); fetchPositions() }} className="ml-auto h-7">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const totalPnl = positions.reduce((acc, pos) => acc + pos.pnl, 0)
  const isPositivePnl = totalPnl >= 0

  return (
    <div className="border border-border/50 rounded-xl p-4" style={{ border: '1px solid hsl(217.2 32.6% 17.5%)', borderRadius: '0.75rem', padding: '1rem', backgroundColor: 'hsl(222.2 84% 4.9%)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground" style={{ color: 'hsl(215 20.2% 65.1%)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Portfolio</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setIsRefreshing(true); fetchPositions() }}
          disabled={isRefreshing}
          className="h-7"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Balance Display */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-muted/20 mb-4" style={{ padding: '1rem', borderRadius: '0.5rem', backgroundColor: 'hsl(217.2 32.6% 17.5% / 0.2)' }}>
        <div>
          <p className="text-xs text-muted-foreground mb-1" style={{ color: 'hsl(215 20.2% 65.1%)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Total Balance</p>
          <p className="text-2xl font-bold" style={{ color: 'hsl(210 40% 98%)', fontSize: '1.5rem', fontWeight: 'bold' }}>${portfolio.totalBalance.toLocaleString()}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-1" style={{ color: 'hsl(215 20.2% 65.1%)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>P&L</p>
          <p className="text-lg font-bold flex items-center gap-1 justify-end" style={{ fontSize: '1.125rem', fontWeight: 'bold', color: isPositivePnl ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)', display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end' }}>
            {isPositivePnl ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isPositivePnl ? "+" : ""}{formatPrice(totalPnl)}
          </p>
        </div>
      </div>

      {/* Positions */}
      {positions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wide" style={{ color: 'hsl(215 20.2% 65.1%)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Open Positions</p>
          {positions.slice(0, 3).map(position => {
            const isPositive = position.pnl >= 0
            const isLong = position.type.toUpperCase() === "LONG"

            return (
              <div key={position.id} className="flex items-center justify-between p-3 rounded-lg bg-card/50 border border-border/30" style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'hsl(217.2 32.6% 17.5%)', border: '1px solid hsl(217.2 32.6% 17.5% / 0.3)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontWeight: 'bold', backgroundColor: isLong ? 'hsl(142 71% 45% / 0.2)' : 'hsl(0 72% 51% / 0.2)', color: isLong ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)' }}>
                    {position.type}
                  </span>
                  <span className="font-bold" style={{ color: 'hsl(210 40% 98%)', fontWeight: 'bold' }}>{position.symbol}</span>
                  <span className="text-xs text-muted-foreground" style={{ fontSize: '0.75rem', color: 'hsl(215 20.2% 65.1%)' }}>{position.leverage}x</span>
                </div>
                <div className="text-right">
                  <p className="font-bold" style={{ fontWeight: 'bold', color: isPositive ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)' }}>
                    {isPositive ? "+" : ""}{formatPrice(position.pnl)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-8" style={{ textAlign: 'center', padding: '2rem 0' }}>
          <DollarSign className="w-8 h-8 mx-auto mb-2 text-muted-foreground/20" style={{ width: '2rem', height: '2rem', margin: '0 auto 0.5rem', color: 'hsl(215 20.2% 65.1% / 0.2)' }} />
          <p className="text-sm text-muted-foreground" style={{ fontSize: '0.875rem', color: 'hsl(215 20.2% 65.1%)' }}>No open positions</p>
        </div>
      )}
    </div>
  )
}
