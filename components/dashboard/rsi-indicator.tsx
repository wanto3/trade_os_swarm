"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Activity } from 'lucide-react'

export default function RSIIndicator() {
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

  const rsi = data?.indicators?.rsi ?? 0
  const signal = rsi > 70 ? 'SELL' : rsi < 30 ? 'BUY' : 'HOLD'
  const subLabel = rsi > 70 ? 'Overbought — sellers may take over' : rsi < 30 ? 'Oversold — buyers may step in' : 'Neutral zone'

  return (
    <IndicatorCard
      title="RSI (14)"
      icon={<Activity size={14} />}
      value={rsi.toFixed(1)}
      subValue={subLabel}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="RSI (Relative Strength Index) measures how fast the price is changing. Above 70 (red) = overbought, sellers might take over. Below 30 (green) = oversold, buyers might step in. Between 30-70 = neutral."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
