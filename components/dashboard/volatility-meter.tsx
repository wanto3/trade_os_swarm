"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Gauge } from 'lucide-react'

export default function VolatilityMeter() {
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

  const vol = data?.indicators?.volatility
  const level = vol?.level ?? 'normal'
  const atrPct = vol?.atr && data?.price ? (vol.atr / data.price) * 100 : 0
  const signal = level === 'low' ? 'BUY' : level === 'high' ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Volatility (ATR)"
      icon={<Gauge size={14} />}
      value={level.toUpperCase()}
      subValue={`ATR: ${atrPct.toFixed(2)}% ($${(vol?.atr ?? 0).toFixed(2)})`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Volatility measures how wild the price swings are. Low volatility (calm, green) = tight price range, good for range trading. High volatility (wild, red) = big swings, more risk but also more opportunity. ATR (Average True Range) quantifies this — higher ATR = more volatile."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={level === 'low' ? '#3fb950' : level === 'high' ? '#f85149' : '#f0c000'}
    />
  )
}
