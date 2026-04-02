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
  BUY: { bg: 'rgba(63,185,80,0.1)', color: '#3fb950', border: 'rgba(63,185,80,0.25)' },
  SELL: { bg: 'rgba(248,81,73,0.1)', color: '#f85149', border: 'rgba(248,81,73,0.25)' },
  HOLD: { bg: 'rgba(240,192,0,0.1)', color: '#f0c000', border: 'rgba(240,192,0,0.25)' },
}

export default function IndicatorCard({
  title, icon, value, subValue, signal, signalReason, tooltip, lastUpdated,
  onRefresh, isLoading, children, accentColor = '#58a6ff'
}: IndicatorCardProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const signalStyle = signal ? SIGNAL_STYLES[signal] : null

  return (
    <div style={{
      backgroundColor: '#161b22',
      border: `1px solid ${signalStyle ? signalStyle.border : 'rgba(42,42,74,0.8)'}`,
      borderRadius: '12px',
      overflow: 'hidden',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: signalStyle ? `0 0 12px ${signalStyle.color}12` : 'none',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.6rem 0.75rem',
        borderBottom: '1px solid rgba(42,42,74,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: accentColor }}>{icon}</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#8b949e', letterSpacing: '0.02em' }}>{title}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {signal && (
            <span style={{
              fontSize: '0.55rem',
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: '4px',
              backgroundColor: signalStyle!.bg,
              color: signalStyle!.color,
              border: `1px solid ${signalStyle!.border}`,
              letterSpacing: '0.05em',
            }}>
              {signal}
            </span>
          )}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh"
            style={{
              background: 'none',
              border: 'none',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              color: isLoading ? accentColor : '#484f58',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s',
            }}
          >
            <RefreshCw size={11} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <div style={{ position: 'relative' }}>
            <button
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              title="What is this?"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#484f58',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 0.2s',
              }}
            >
              <HelpCircle size={11} />
            </button>
            {showTooltip && (
              <div style={{
                position: 'absolute',
                right: 0,
                top: '100%',
                marginTop: '6px',
                zIndex: 50,
                width: '240px',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.6rem',
                lineHeight: 1.5,
                color: '#8b949e',
                backgroundColor: 'rgba(10, 10, 18, 0.97)',
                border: '1px solid rgba(42,42,74,0.8)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}>
                {tooltip}
                {signalReason && (
                  <div style={{
                    marginTop: '0.5rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid rgba(42,42,74,0.6)',
                  }}>
                    <span style={{ color: '#484f58' }}>Reason: </span>
                    <span style={{ color: '#6e7681' }}>{signalReason}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0.75rem' }}>
        <div style={{
          fontSize: '1.4rem',
          fontWeight: 700,
          color: '#e6edf3',
          lineHeight: 1,
          marginBottom: '4px',
        }}>
          {value}
        </div>
        {subValue && (
          <div style={{ fontSize: '0.6rem', color: '#6e7681', lineHeight: 1.4 }}>
            {subValue}
          </div>
        )}
        {children}
      </div>

      {/* Footer */}
      {lastUpdated && (
        <div style={{
          padding: '0.4rem 0.75rem',
          borderTop: '1px solid rgba(42,42,74,0.4)',
          fontSize: '0.5rem',
          color: '#484f58',
        }}>
          Updated {lastUpdated}
        </div>
      )}
    </div>
  )
}
