'use client'

import React from 'react'

interface TrendBadgeProps {
  label: string
  type: 'bullish' | 'bearish' | 'neutral' | 'warning'
  size?: 'sm' | 'md'
  glow?: boolean
}

export function TrendBadge({ label, type, size = 'md', glow = false }: TrendBadgeProps) {
  const colorMap = {
    bullish: { color: 'var(--green)', bg: 'var(--green-bg)', dim: 'var(--green-dim)' },
    bearish: { color: 'var(--magenta)', bg: 'var(--magenta-bg)', dim: 'var(--magenta-dim)' },
    neutral: { color: 'var(--purple)', bg: 'var(--purple-bg)', dim: 'var(--purple-dim)' },
    warning: { color: 'var(--orange)', bg: 'var(--orange-glow, rgba(255,140,0,0.08))', dim: 'var(--orange-dim)' },
  }
  const c = colorMap[type]
  const padding = size === 'sm' ? '2px 6px' : '3px 8px'
  const fontSize = size === 'sm' ? '9px' : '10px'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        borderRadius: '20px',
        fontSize,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: c.color,
        background: c.bg,
        border: `1px solid ${c.dim}`,
        boxShadow: glow ? `0 0 8px ${c.dim}` : 'none',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <span style={{
        width: '4px',
        height: '4px',
        borderRadius: '50%',
        background: c.color,
        boxShadow: `0 0 4px ${c.color}`,
      }} />
      {label}
    </span>
  )
}
