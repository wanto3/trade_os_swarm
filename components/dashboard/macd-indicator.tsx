"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { TrendingUp } from 'lucide-react'

export default function MACDIndicator() {
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

  const macd = data?.indicators?.macd
  const histogram = macd?.histogram ?? 0
  const signal = histogram > 0.5 ? 'BUY' : histogram < -0.5 ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="MACD (12,26,9)"
      icon={<TrendingUp size={14} />}
      value={histogram.toFixed(4)}
      subValue={`MACD: ${(macd?.value ?? 0).toFixed(2)} | Signal: ${(macd?.signal ?? 0).toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="MACD shows if a trend is gaining or losing steam. When the blue MACD line crosses above the orange signal line = 'buy' signal. When it crosses below = 'sell'. The histogram bars show how strong the move is."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#3fb950' : signal === 'SELL' ? '#f85149' : '#f0c000'}
    />
  )
}
