"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Zap } from 'lucide-react'

export default function MomentumIndicator() {
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

  const momentum = data?.indicators?.momentum ?? 50
  const signal = momentum > 55 ? 'BUY' : momentum < 45 ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Momentum"
      icon={<Zap size={14} />}
      value={momentum.toFixed(1)}
      subValue={momentum > 55 ? 'Bullish momentum building' : momentum < 45 ? 'Bearish momentum building' : 'Momentum cooling off'}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Momentum measures how fast the price is moving. High momentum (above 55, green) = strong move happening, likely to continue. Low momentum (below 45, red) = losing steam. When momentum diverges from price, it's often a warning sign that the trend might reverse."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#3fb950' : signal === 'SELL' ? '#f85149' : '#f0c000'}
    />
  )
}
