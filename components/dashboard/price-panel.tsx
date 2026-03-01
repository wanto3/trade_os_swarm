"use client"

import { useState, useEffect } from "react"
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/utils"

interface ApiPrice {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  marketCap: number
  timestamp: number
}

interface ApiPriceResponse {
  success: boolean
  data?: ApiPrice[]
  error?: string
}

export function PricePanel() {
  const [prices, setPrices] = useState<ApiPrice[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPrices = async () => {
    try {
      setError(null)
      const response = await fetch('/api/prices')
      const result: ApiPriceResponse = await response.json()

      if (result.success && result.data) {
        setPrices(result.data)
      } else {
        setError(result.error || 'Failed to fetch prices')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  const refreshPrices = () => {
    setIsRefreshing(true)
    fetchPrices()
  }

  useEffect(() => {
    fetchPrices()
    const interval = setInterval(fetchPrices, 5000)
    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return (
      <div className="border border-border/50 rounded-xl p-4" style={{ border: '1px solid hsl(217.2 32.6% 17.5%)', borderRadius: '0.75rem', padding: '1rem', backgroundColor: 'hsl(222.2 84% 4.9%)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold" style={{ color: 'hsl(210 40% 98%)' }}>Live Prices</h2>
          <div className="w-2 h-2 rounded-full bg-bullish animate-pulse" style={{ backgroundColor: 'hsl(142 71% 45%)' }} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-24 rounded-lg bg-muted/20 animate-pulse" style={{ height: '6rem', borderRadius: '0.5rem', backgroundColor: 'hsl(217.2 32.6% 17.5% / 0.2)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10" style={{ padding: '1rem', borderRadius: '0.75rem', border: '1px solid hsl(0 72% 51% / 0.2)', backgroundColor: 'hsl(0 72% 51% / 0.1)' }}>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" style={{ color: 'hsl(0 72% 51%)' }} />
          <p className="text-sm text-red-500" style={{ color: 'hsl(0 72% 51%)' }}>{error}</p>
          <Button variant="outline" size="sm" onClick={refreshPrices} className="ml-auto h-7">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border/50 rounded-xl p-4" style={{ border: '1px solid hsl(217.2 32.6% 17.5%)', borderRadius: '0.75rem', padding: '1rem', backgroundColor: 'hsl(222.2 84% 4.9%)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground" style={{ color: 'hsl(215 20.2% 65.1%)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Prices</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshPrices}
          disabled={isRefreshing}
          className="h-7"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Responsive price grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {prices.map((price) => {
          const isPositive = price.change24h >= 0
          return (
            <div
              key={price.symbol}
              className="p-3 rounded-lg bg-card/50 border border-border/50 hover:border-border transition-colors"
              style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: 'hsl(217.2 32.6% 17.5%)', border: '1px solid hsl(217.2 32.6% 17.5%)' }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold" style={{ color: 'hsl(210 40% 98%)', fontWeight: 'bold' }}>{price.symbol}</span>
                {isPositive ? (
                  <TrendingUp className="w-3 h-3 text-bullish" style={{ color: 'hsl(142 71% 45%)' }} />
                ) : (
                  <TrendingDown className="w-3 h-3 text-bearish" style={{ color: 'hsl(0 72% 51%)' }} />
                )}
              </div>
              <div className="text-lg font-bold" style={{ color: 'hsl(210 40% 98%)', fontSize: '1.125rem', fontWeight: 'bold' }}>
                {formatPrice(price.price)}
              </div>
              <div className={`text-xs font-medium ${isPositive ? 'text-bullish' : 'text-bearish'}`} style={{ fontSize: '0.75rem', color: isPositive ? 'hsl(142 71% 45%)' : 'hsl(0 72% 51%)' }}>
                {isPositive ? '+' : ''}{price.change24h.toFixed(2)}%
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
