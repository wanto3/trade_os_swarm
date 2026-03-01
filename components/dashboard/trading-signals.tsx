"use client"

import { useState, useEffect } from "react"
import { TrendingUp, TrendingDown, Minus, AlertCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ApiSignal {
  symbol: string
  action: "BUY" | "SELL" | "HOLD"
  confidence: number
  reasons: string[]
  timestamp: number
}

interface ApiSignalsResponse {
  success: boolean
  data?: ApiSignal[]
  error?: string
}

const getSignalType = (action: string): "bullish" | "bearish" | "neutral" => {
  switch (action) {
    case "BUY": return "bullish"
    case "SELL": return "bearish"
    default: return "neutral"
  }
}

export function TradingSignals() {
  const [signals, setSignals] = useState<ApiSignal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchSignals = async () => {
    try {
      setError(null)
      const response = await fetch('/api/signals')
      const result: ApiSignalsResponse = await response.json()

      if (result.success && result.data) {
        setSignals(result.data)
      } else {
        setError(result.error || 'Failed to fetch signals')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchSignals()
    const interval = setInterval(fetchSignals, 30000)
    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return (
      <div className="border border-border/50 rounded-xl p-4" style={{ border: '1px solid hsl(217.2 32.6% 17.5%)', borderRadius: '0.75rem', padding: '1rem', backgroundColor: 'hsl(222.2 84% 4.9%)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold" style={{ color: 'hsl(210 40% 98%)' }}>Trading Signals</h2>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-14 rounded-lg bg-muted/20 animate-pulse" style={{ height: '3.5rem', borderRadius: '0.5rem', backgroundColor: 'hsl(217.2 32.6% 17.5% / 0.2)' }} />
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
          <Button variant="outline" size="sm" onClick={() => { setIsRefreshing(true); fetchSignals() }} className="ml-auto h-7">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border/50 rounded-xl p-4" style={{ border: '1px solid hsl(217.2 32.6% 17.5%)', borderRadius: '0.75rem', padding: '1rem', backgroundColor: 'hsl(222.2 84% 4.9%)' }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground" style={{ color: 'hsl(215 20.2% 65.1%)', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trading Signals</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setIsRefreshing(true); fetchSignals() }}
          disabled={isRefreshing}
          className="h-7"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="space-y-2">
        {signals.slice(0, 4).map(signal => {
          const signalType = getSignalType(signal.action)
          const bgColor = signalType === "bullish" ? "hsl(142 71% 45% / 0.05)" : signalType === "bearish" ? "hsl(0 72% 51% / 0.05)" : "hsl(217.2 32.6% 17.5% / 0.2)"
          const borderColor = signalType === "bullish" ? "hsl(142 71% 45% / 0.2)" : signalType === "bearish" ? "hsl(0 72% 51% / 0.2)" : "hsl(217.2 32.6% 17.5% / 0.3)"
          const iconBg = signalType === "bullish" ? "hsl(142 71% 45% / 0.2)" : signalType === "bearish" ? "hsl(0 72% 51% / 0.2)" : "hsl(217.2 32.6% 17.5% / 0.3)"
          const iconColor = signalType === "bullish" ? "hsl(142 71% 45%)" : signalType === "bearish" ? "hsl(0 72% 51%)" : "hsl(215 20.2% 65.1%)"

          return (
            <div
              key={signal.symbol}
              className="flex items-center justify-between p-3 rounded-lg border"
              style={{ padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: bgColor, border: `1px solid ${borderColor}` }}
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg" style={{ padding: '0.375rem', borderRadius: '0.5rem', backgroundColor: iconBg }}>
                  {signalType === "bullish" ? <TrendingUp className="w-4 h-4" style={{ color: iconColor }} /> :
                   signalType === "bearish" ? <TrendingDown className="w-4 h-4" style={{ color: iconColor }} /> :
                   <Minus className="w-4 h-4" style={{ color: iconColor }} />}
                </div>
                <div>
                  <span className="font-bold" style={{ color: 'hsl(210 40% 98%)', fontWeight: 'bold' }}>{signal.symbol}</span>
                  <span className="ml-2 text-xs px-1.5 py-0.5 rounded font-medium" style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.125rem 0.375rem', borderRadius: '0.25rem', backgroundColor: iconBg, color: iconColor }}>
                    {signal.action}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold" style={{ color: 'hsl(210 40% 98%)', fontSize: '0.875rem', fontWeight: 'bold' }}>{signal.confidence.toFixed(0)}%</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
