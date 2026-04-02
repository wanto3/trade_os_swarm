"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { LineChart } from 'lucide-react'

export default function MovingAveragesIndicator() {
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

  const ema = data?.indicators
  const price = data?.price ?? 0
  const aboveAll = price > (ema?.ema9 ?? 0) && price > (ema?.ema21 ?? 0) && price > (ema?.ema50 ?? 0)
  const belowAll = price < (ema?.ema9 ?? 0) && price < (ema?.ema21 ?? 0) && price < (ema?.ema50 ?? 0)
  const signal = aboveAll ? 'BUY' : belowAll ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="EMA (9, 21, 50)"
      icon={<LineChart size={14} />}
      value={`$${(ema?.ema9 ?? 0).toFixed(2)}`}
      subValue={`EMA21: $${(ema?.ema21 ?? 0).toFixed(2)} | EMA50: $${(ema?.ema50 ?? 0).toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="EMA (Exponential Moving Average) smooths out price data, focusing on recent trends. Price above all EMAs = short, medium, and long-term bullish (green). Price below all = bearish (red). Mixed signals = neutral (yellow)."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#3fb950' : signal === 'SELL' ? '#f85149' : '#f0c000'}
    />
  )
}
