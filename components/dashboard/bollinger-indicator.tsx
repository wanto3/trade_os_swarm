"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { BarChart2 } from 'lucide-react'

export default function BollingerIndicator() {
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

  const bb = data?.indicators?.bollinger
  const price = data?.price ?? 0
  const upper = bb?.upper ?? 0
  const lower = bb?.lower ?? 0
  const position = bb ? ((price - lower) / (upper - lower)) * 100 : 50
  const signal = position < 20 ? 'BUY' : position > 80 ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Bollinger Bands (20,2)"
      icon={<BarChart2 size={14} />}
      value={`$${(bb?.middle ?? 0).toFixed(2)}`}
      subValue={`Upper: $${(bb?.upper ?? 0).toFixed(2)} | Lower: $${(bb?.lower ?? 0).toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Bollinger Bands show the 'normal' price range. The wider the bands, the more volatile (wilder) the market. When price touches the top band = potentially overbought. When it touches the bottom band = potentially oversold."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#eab308'}
    />
  )
}
