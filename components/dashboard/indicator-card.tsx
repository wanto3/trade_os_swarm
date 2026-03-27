"use client"

import { ReactNode, useState } from 'react'
import { RefreshCw, HelpCircle } from 'lucide-react'

interface IndicatorCardProps {
  title: string
  icon: ReactNode
  value: string | number
  subValue?: string
  signal?: 'BUY' | 'SELL' | 'HOLD'
  signalReason?: string
  tooltip: string
  lastUpdated?: string
  onRefresh: () => void
  isLoading?: boolean
  children?: ReactNode
  accentColor?: string
}

const SIGNAL_STYLES = {
  BUY: 'bg-green-500/20 text-green-400 border border-green-500/30',
  SELL: 'bg-red-500/20 text-red-400 border border-red-500/30',
  HOLD: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
}

export default function IndicatorCard({
  title, icon, value, subValue, signal, signalReason, tooltip, lastUpdated,
  onRefresh, isLoading, children, accentColor = '#00d4ff'
}: IndicatorCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  return (
    <div className="relative">
      <div className="relative z-10 rounded-xl border transition-all duration-200"
           style={{ background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.06)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <span style={{ color: accentColor }}>{icon}</span>
            <span className="text-xs font-medium text-white/60">{title}</span>
          </div>
          <div className="flex items-center gap-2">
            {signal && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SIGNAL_STYLES[signal]}`}>
                {signal}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1 rounded hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={12} className={`text-white/40 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <div className="relative">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="p-1 rounded hover:bg-white/10 transition-colors"
              >
                <HelpCircle size={12} className="text-white/40" />
              </button>
              {showTooltip && (
                <div className="absolute right-0 top-6 z-50 w-56 p-3 rounded-lg text-xs text-white/90 shadow-xl"
                     style={{ background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {tooltip}
                  {signalReason && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <span className="text-white/40">Reason: </span>
                      <span className="text-white/70">{signalReason}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Content */}
        <div className="p-4">
          <div className="text-2xl font-bold text-white">{value}</div>
          {subValue && <div className="text-xs text-white/40 mt-1">{subValue}</div>}
          {children}
        </div>
        {/* Footer */}
        {lastUpdated && (
          <div className="px-4 pb-2 text-[10px] text-white/30">
            Updated: {lastUpdated}
          </div>
        )}
      </div>
    </div>
  )
}
