'use client'

import React from 'react'

interface MultiTimeframeProps {
  symbol?: string
}

export function MultiTimeframe({ symbol = 'BTC' }: MultiTimeframeProps) {
  const timeframes = [
    { label: '1H', trend: 'bullish' as const, strength: 72 },
    { label: '4H', trend: 'bullish' as const, strength: 65 },
    { label: '1D', trend: 'neutral' as const, strength: 48 },
    { label: '1W', trend: 'bullish' as const, strength: 78 },
  ]

  const trendColor = (trend: string) => {
    if (trend === 'bullish') return 'var(--green)'
    if (trend === 'bearish') return 'var(--magenta)'
    return 'var(--purple)'
  }

  return (
    <div style={{
      display: 'flex',
      gap: '6px',
      padding: '10px',
      background: 'rgba(10,10,18,0.5)',
      borderRadius: '8px',
      border: '1px solid rgba(42,42,74,0.5)',
    }}>
      {timeframes.map((tf) => (
        <div
          key={tf.label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 10px',
            borderRadius: '6px',
            background: `${trendColor(tf.trend)}08`,
            border: `1px solid ${trendColor(tf.trend)}20`,
            flex: 1,
          }}
        >
          <span style={{
            fontSize: '9px',
            fontWeight: 700,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-sans)',
          }}>
            {tf.label}
          </span>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: trendColor(tf.trend),
            boxShadow: `0 0 6px ${trendColor(tf.trend)}`,
          }} />
          <span style={{
            fontSize: '9px',
            fontWeight: 600,
            color: trendColor(tf.trend),
            textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)',
          }}>
            {tf.trend.slice(0, 3)}
          </span>
          <div style={{
            width: '100%',
            height: '3px',
            background: 'var(--border)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${tf.strength}%`,
              height: '100%',
              background: trendColor(tf.trend),
              borderRadius: '2px',
              boxShadow: `0 0 4px ${trendColor(tf.trend)}60`,
            }} />
          </div>
          <span style={{
            fontSize: '8px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
          }}>
            {tf.strength}%
          </span>
        </div>
      ))}
    </div>
  )
}

interface SupportResistanceLevel {
  price: number
  type: 'support' | 'resistance'
  strength: number
  touches: number
}

export function SupportResistanceLevels() {
  const levels: SupportResistanceLevel[] = [
    { price: 68420, type: 'support', strength: 85, touches: 5 },
    { price: 69200, type: 'support', strength: 62, touches: 3 },
    { price: 71000, type: 'resistance', strength: 78, touches: 4 },
    { price: 72450, type: 'resistance', strength: 92, touches: 7 },
    { price: 74500, type: 'resistance', strength: 55, touches: 2 },
  ]

  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    return `$${p.toFixed(2)}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px 1fr 50px 40px',
        gap: '8px',
        padding: '0 4px 4px',
        fontSize: '8px',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        borderBottom: '1px solid rgba(42,42,74,0.5)',
      }}>
        <span>Type</span>
        <span>Level</span>
        <span style={{ textAlign: 'center' }}>Strength</span>
        <span style={{ textAlign: 'right' }}>Touches</span>
      </div>

      {levels.map((level, i) => (
        <div
          key={i}
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 50px 40px',
            gap: '8px',
            alignItems: 'center',
            padding: '5px 4px',
            borderRadius: '4px',
            background: level.type === 'support' ? 'rgba(0,255,136,0.03)' : 'rgba(255,0,128,0.03)',
          }}
        >
          <span style={{
            fontSize: '8px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: level.type === 'support' ? 'var(--green)' : 'var(--magenta)',
          }}>
            {level.type}
          </span>
          <span style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}>
            {formatPrice(level.price)}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              width: '36px',
              height: '4px',
              background: 'var(--border)',
              borderRadius: '2px',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${level.strength}%`,
                height: '100%',
                background: level.type === 'support' ? 'var(--green)' : 'var(--magenta)',
                borderRadius: '2px',
              }} />
            </div>
          </div>
          <span style={{
            fontSize: '9px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-muted)',
            textAlign: 'right',
          }}>
            {level.touches}x
          </span>
        </div>
      ))}
    </div>
  )
}
