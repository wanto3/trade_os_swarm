"use client"

import { useState, useEffect } from 'react'
import { Moon } from 'lucide-react'
import IndicatorCard from './indicator-card'

interface LunarPhaseData {
  phase: string
  illumination: number
  daysUntilFull: number
  daysUntilNew: number
  tradingImplication: string
  mood: string
  signal: 'BUY' | 'SELL' | 'HOLD'
  action: string
}

function calculateLunarPhase(): LunarPhaseData {
  const knownNewMoon = 947163600000
  const lunarCycle = 29.53058867 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const daysSinceKnownNew = (now - knownNewMoon) / (24 * 60 * 60 * 1000)
  const currentCyclePosition = daysSinceKnownNew % 29.53058867
  const illumination = Math.round((1 - Math.cos((currentCyclePosition / 29.53058867) * 2 * Math.PI)) / 2 * 100)

  let phase: string, tradingImplication: string, mood: string, signal: 'BUY' | 'SELL' | 'HOLD', action: string
  let daysUntilFull: number, daysUntilNew: number

  if (currentCyclePosition < 1.85) {
    phase = 'New Moon'; tradingImplication = 'Start of new cycle - fresh starts, new positions'; mood = '🌑'; daysUntilFull = 14.77 - currentCyclePosition; daysUntilNew = 0; signal = 'BUY'; action = 'New Cycle'
  } else if (currentCyclePosition < 7.38) {
    phase = 'Waxing Crescent'; tradingImplication = 'Building momentum - look for breakouts'; mood = '🌒'; daysUntilFull = 14.77 - currentCyclePosition; daysUntilNew = 29.53 - currentCyclePosition; signal = 'BUY'; action = 'Accumulate'
  } else if (currentCyclePosition < 9.23) {
    phase = 'First Quarter'; tradingImplication = 'Decision point - trend may accelerate'; mood = '🌓'; daysUntilFull = 14.77 - currentCyclePosition; daysUntilNew = 29.53 - currentCyclePosition; signal = 'HOLD'; action = 'Confirm Trend'
  } else if (currentCyclePosition < 14.77) {
    phase = 'Waxing Gibbous'; tradingImplication = 'Peak growth phase - momentum continues'; mood = '🌔'; daysUntilFull = 14.77 - currentCyclePosition; daysUntilNew = 29.53 - currentCyclePosition; signal = 'HOLD'; action = 'Stay Long'
  } else if (currentCyclePosition < 16.61) {
    phase = 'Full Moon'; tradingImplication = 'Peak energy - possible volatility peak'; mood = '🌕'; daysUntilFull = 0; daysUntilNew = 29.53 - currentCyclePosition; signal = 'SELL'; action = 'Take Profits'
  } else if (currentCyclePosition < 22.15) {
    phase = 'Waning Gibbous'; tradingImplication = 'Energy declining - caution advised'; mood = '🌖'; daysUntilFull = 29.53 - currentCyclePosition + 14.77; daysUntilNew = 29.53 - currentCyclePosition; signal = 'SELL'; action = 'Reduce Exposure'
  } else if (currentCyclePosition < 24.0) {
    phase = 'Last Quarter'; tradingImplication = 'Reflection phase - review positions'; mood = '🌗'; daysUntilFull = 29.53 - currentCyclePosition + 14.77; daysUntilNew = 29.53 - currentCyclePosition; signal = 'HOLD'; action = 'Assess'
  } else {
    phase = 'Waning Crescent'; tradingImplication = 'End of cycle - prepare for new opportunities'; mood = '🌘'; daysUntilFull = 29.53 - currentCyclePosition + 14.77; daysUntilNew = 29.53 - currentCyclePosition; signal = 'BUY'; action = 'Prepare'
  }

  return { phase, illumination, daysUntilFull: Math.round(daysUntilFull * 10) / 10, daysUntilNew: Math.round(daysUntilNew * 10) / 10, tradingImplication, mood, signal, action }
}

export default function LunarPhaseIndicator() {
  const [data, setData] = useState<LunarPhaseData | null>(null)
  const [loading, setLoading] = useState(false)

  const refresh = () => {
    setLoading(true)
    setTimeout(() => {
      setData(calculateLunarPhase())
      setLoading(false)
    }, 100)
  }

  useEffect(() => { refresh() }, [])

  if (!data) return null

  const signalColor = data.signal === 'BUY' ? '#22c55e' : data.signal === 'SELL' ? '#ef4444' : '#eab308'

  return (
    <IndicatorCard
      title="Lunar Phase"
      icon={<Moon size={14} />}
      value={data.mood}
      subValue={`${data.phase} — ${data.illumination}% illuminated`}
      signal={data.signal}
      signalReason={`${data.action}: ${data.tradingImplication}`}
      tooltip="A fun/alternative signal based on lunar cycles. Some traders believe moon phases correlate with market sentiment. New Moon = potential start of trends (green). Full Moon = potential peak or reversal (red)."
      lastUpdated={new Date().toLocaleTimeString()}
      onRefresh={refresh}
      isLoading={loading}
      accentColor={signalColor}
    />
  )
}
