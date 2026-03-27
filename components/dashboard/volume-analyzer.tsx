"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { BarChart } from 'lucide-react'

export default function VolumeAnalyzer() {
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

  const vol = data?.indicators?.volume
  const level = vol?.level ?? 'normal'
  const signal = level === 'high' ? 'BUY' : level === 'low' ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Volume"
      icon={<BarChart size={14} />}
      value={vol?.level?.toUpperCase() ?? 'N/A'}
      subValue={vol?.total ? `${(vol.total / 1e6).toFixed(0)}M total` : 'Loading...'}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Volume shows how much is being traded. High volume with a price move = strong signal (green). Low volume = weak signal, price might not hold. Think of it like crowd noise — loud crowds are harder to ignore."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={level === 'high' ? '#22c55e' : level === 'low' ? '#ef4444' : '#eab308'}
    />
  )
}
