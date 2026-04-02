"use client"

import { useState, useEffect } from 'react'
import IndicatorCard from './indicator-card'
import { Layers } from 'lucide-react'

export default function SupportResistance() {
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

  const price = data?.price ?? 0
  const bb = data?.indicators?.bollinger
  const support = bb ? bb.lower : price * 0.97
  const resistance = bb ? bb.upper : price * 1.03
  const nearSupport = bb ? (price - support) / support * 100 < 2 : false
  const nearResistance = bb ? (resistance - price) / price * 100 < 2 : false
  const signal = nearSupport ? 'BUY' : nearResistance ? 'SELL' : 'HOLD'

  return (
    <IndicatorCard
      title="Support / Resistance"
      icon={<Layers size={14} />}
      value={`$${price.toFixed(2)}`}
      subValue={`Support: $${support.toFixed(2)} | Resistance: $${resistance.toFixed(2)}`}
      signal={signal}
      signalReason={data?.indicators?.signalReason}
      tooltip="Support is the price 'floor' where buyers often step in (green zone). Resistance is the price 'ceiling' where sellers often step in (red zone). When price gets within 2% of support = potential buy zone. When near resistance = potential sell zone."
      lastUpdated={data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : undefined}
      onRefresh={fetchData}
      isLoading={loading}
      accentColor={signal === 'BUY' ? '#3fb950' : signal === 'SELL' ? '#f85149' : '#f0c000'}
    />
  )
}
