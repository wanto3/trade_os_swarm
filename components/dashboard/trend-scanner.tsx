"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Compass } from 'lucide-react'

export default function TrendScanner() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/prices?symbol=BTCUSDT&interval=1h`)
      const json = await res.json()
      setData(json)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const trend = data?.indicators?.trend ?? 'neutral'
  const change = data?.change24h ?? 0
  const signal = trend === 'bullish' ? 'BUY' : trend === 'bearish' ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Trend Scanner"
      icon={<Compass size={14} />}
      value={trend.toUpperCase()}
      subValue={`24h change: ${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Shows the overall trend direction. Green = price above the 50 EMA (bullish — uptrend). Red = price below the 50 EMA (bearish — downtrend). Yellow = mixed signals. Think of it as the 'direction of traffic' for the market."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
