'use client'

import React from 'react'

interface GaugeIndicatorProps {
  value: number
  min?: number
  max?: number
  label: string
  zones?: { from: number; to: number; color: string; label: string }[]
  size?: 'sm' | 'md' | 'lg'
  showValue?: boolean
  subLabel?: string
}

export function GaugeIndicator({
  value,
  min = 0,
  max = 100,
  label,
  zones,
  size = 'md',
  showValue = true,
  subLabel,
}: GaugeIndicatorProps) {
  const sizeMap = {
    sm: { width: 60, height: 36, stroke: 4, fontSize: '10px' },
    md: { width: 80, height: 48, stroke: 5, fontSize: '12px' },
    lg: { width: 100, height: 60, stroke: 6, fontSize: '14px' },
  }
  const dims = sizeMap[size]
  const radius = (dims.width - dims.stroke) / 2
  const circumference = Math.PI * radius
  const startAngle = Math.PI
  const endAngle = 2 * Math.PI

  const normalized = Math.max(min, Math.min(max, value))
  const pct = (normalized - min) / (max - min)
  const arcLength = circumference * pct

  // Default RSI zones
  const defaultZones = [
    { from: 0, to: 30, color: 'var(--green)', label: 'Oversold' },
    { from: 30, to: 70, color: 'var(--purple)', label: 'Neutral' },
    { from: 70, to: 100, color: 'var(--magenta)', label: 'Overbought' },
  ]
  const activeZones = zones || defaultZones

  const getColor = () => {
    for (const zone of activeZones) {
      if (normalized >= zone.from && normalized <= zone.to) {
        return zone.color
      }
    }
    return 'var(--cyan)'
  }
  const color = getColor()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      {/* Arc gauge */}
      <svg width={dims.width} height={dims.height}>
        {/* Track */}
        <path
          d={`M 0 ${dims.height} A ${radius} ${radius} 0 0 1 ${dims.width} ${dims.height}`}
          fill="none"
          stroke="rgba(42,42,74,0.8)"
          strokeWidth={dims.stroke}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={`M 0 ${dims.height} A ${radius} ${radius} 0 0 1 ${dims.width} ${dims.height}`}
          fill="none"
          stroke={color}
          strokeWidth={dims.stroke}
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          style={{
            filter: `drop-shadow(0 0 4px ${color})`,
            transition: 'stroke-dasharray 0.5s ease-out',
          }}
        />
        {/* Value text */}
        {showValue && (
          <text
            x={dims.width / 2}
            y={dims.height * 0.55}
            textAnchor="middle"
            fill={color}
            fontSize={dims.fontSize}
            fontFamily="var(--font-mono)"
            fontWeight="700"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          >
            {value.toFixed(1)}
          </text>
        )}
      </svg>

      {/* Label */}
      <div style={{
        fontSize: '9px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        {label}
      </div>
      {subLabel && (
        <div style={{
          fontSize: '8px',
          color: color,
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
        }}>
          {subLabel}
        </div>
      )}
    </div>
  )
}
