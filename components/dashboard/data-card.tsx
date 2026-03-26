'use client'

import React, { useEffect, useState, useRef } from 'react'

interface DataCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  accent?: 'cyan' | 'green' | 'magenta' | 'purple' | 'orange' | 'gold'
  subValue?: string
  sparkline?: number[]
  icon?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  pulse?: boolean
  style?: React.CSSProperties
}

export function DataCard({
  label,
  value,
  change,
  changeLabel,
  accent = 'cyan',
  subValue,
  sparkline,
  icon,
  size = 'md',
  pulse = false,
  style = {},
}: DataCardProps) {
  const [prevValue, setPrevValue] = useState(value)
  const [flashClass, setFlashClass] = useState('')
  const prevChangeRef = useRef(change)

  useEffect(() => {
    if (value !== prevValue) {
      const numVal = typeof value === 'number' ? value : parseFloat(String(value))
      const numPrev = typeof prevValue === 'number' ? prevValue : parseFloat(String(prevValue))
      if (!isNaN(numVal) && !isNaN(numPrev)) {
        setFlashClass(numVal > numPrev ? 'price-up' : 'price-down')
        setTimeout(() => setFlashClass(''), 500)
      }
      setPrevValue(value)
    }
  }, [value, prevValue])

  const accentColorMap: Record<string, string> = {
    cyan: 'var(--cyan)',
    green: 'var(--green)',
    magenta: 'var(--magenta)',
    purple: 'var(--purple)',
    orange: 'var(--orange)',
    gold: 'var(--gold)',
  }

  const accentDimMap: Record<string, string> = {
    cyan: 'var(--cyan-dim)',
    green: 'var(--green-dim)',
    magenta: 'var(--magenta-dim)',
    purple: 'var(--purple-dim)',
    orange: 'var(--orange-dim)',
    gold: 'var(--gold-dim)',
  }

  const color = accentColorMap[accent]
  const dimColor = accentDimMap[accent]

  const fontSize = size === 'xl' ? '2rem' : size === 'lg' ? '1.5rem' : size === 'sm' ? '0.9rem' : '1.1rem'
  const labelSize = size === 'sm' ? '9px' : '10px'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        animation: pulse ? `breathe 4s ease-in-out infinite` : undefined,
        ...style,
      }}
    >
      {/* Label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: labelSize,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
        }}
      >
        {icon && <span style={{ color, opacity: 0.7 }}>{icon}</span>}
        {label}
      </div>

      {/* Value */}
      <div
        className={`data-number ${flashClass}`}
        style={{
          fontSize,
          fontWeight: 700,
          color,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          textShadow: `0 0 20px ${dimColor}`,
        }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>

      {/* Change indicator */}
      {change !== undefined && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span
            style={{
              color: change >= 0 ? 'var(--green)' : 'var(--magenta)',
              fontWeight: 600,
            }}
          >
            {change >= 0 ? '+' : ''}{typeof change === 'number' ? change.toFixed(2) : change}%
          </span>
          {changeLabel && (
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              {changeLabel}
            </span>
          )}
        </div>
      )}

      {/* Sub value */}
      {subValue && (
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {subValue}
        </div>
      )}

      {/* Sparkline */}
      {sparkline && sparkline.length > 1 && (
        <Sparkline data={sparkline} color={color} />
      )}
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const width = 80
  const height = 24

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} style={{ marginTop: '4px' }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  )
}
