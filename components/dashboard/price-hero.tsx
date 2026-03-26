'use client'

import React, { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface PriceHeroProps {
  symbol: string
  price: number
  change24h: number
  high24h?: number
  low24h?: number
  volume24h?: number
  marketCap?: number
}

export function PriceHero({
  symbol,
  price,
  change24h,
  high24h,
  low24h,
  volume24h,
  marketCap,
}: PriceHeroProps) {
  const [prevPrice, setPrevPrice] = useState(price)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (price !== prevPrice) {
      setFlash(price > prevPrice ? 'up' : 'down')
      setPrevPrice(price)
      const t = setTimeout(() => setFlash(null), 500)
      return () => clearTimeout(t)
    }
  }, [price, prevPrice])

  const isPositive = change24h >= 0
  const trendColor = isPositive ? 'var(--green)' : 'var(--magenta)'
  const flashColor = flash === 'up' ? 'var(--cyan)' : 'var(--magenta)'

  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    if (p >= 1) return `$${p.toFixed(4)}`
    return `$${p.toFixed(6)}`
  }

  const formatLarge = (n: number) => {
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
    return `$${n.toFixed(2)}`
  }

  // High/low bar percentage
  const rangePct = high24h && low24h ? ((price - low24h) / (high24h - low24h)) * 100 : 50

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '20px',
        background: 'linear-gradient(135deg, rgba(0, 245, 255, 0.04) 0%, rgba(10, 10, 18, 0.8) 50%, rgba(168, 85, 247, 0.04) 100%)',
        borderRadius: '12px',
        border: '1px solid rgba(0, 245, 255, 0.1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated background orb */}
      <div style={{
        position: 'absolute',
        top: '-20px',
        right: '-20px',
        width: '120px',
        height: '120px',
        borderRadius: '50%',
        background: `radial-gradient(circle, ${flash ? flashColor : trendColor}15 0%, transparent 70%)`,
        filter: 'blur(20px)',
        animation: 'float 6s ease-in-out infinite',
        pointerEvents: 'none',
      }} />

      {/* Symbol + Change */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${trendColor}30, ${trendColor}10)`,
            border: `1px solid ${trendColor}40`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            color: trendColor,
            fontFamily: 'var(--font-display)',
            letterSpacing: '0.05em',
          }}>
            {symbol}
          </div>
          <div style={{
            fontSize: '9px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
            fontWeight: 600,
          }}>
            / USD
          </div>
        </div>

        {/* 24h Change */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 10px',
          borderRadius: '20px',
          background: `${trendColor}15`,
          border: `1px solid ${trendColor}30`,
        }}>
          {isPositive ? (
            <TrendingUp size={12} color={trendColor} />
          ) : (
            <TrendingDown size={12} color={trendColor} />
          )}
          <span style={{
            fontSize: '12px',
            fontWeight: 700,
            color: trendColor,
            fontFamily: 'var(--font-mono)',
          }}>
            {isPositive ? '+' : ''}{change24h.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Price */}
      <div
        className="display-number"
        style={{
          fontSize: '2.5rem',
          fontWeight: 800,
          color: flash ? flashColor : 'var(--text-primary)',
          letterSpacing: '0.02em',
          lineHeight: 1,
          textShadow: flash ? `0 0 20px ${flashColor}` : `0 0 30px ${trendColor}30`,
          transition: 'color 0.3s, text-shadow 0.3s',
          animation: 'fade-in 0.5s ease-out',
        }}
      >
        {formatPrice(price)}
      </div>

      {/* High/Low bar */}
      {high24h !== undefined && low24h !== undefined && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '9px',
            color: 'var(--text-muted)',
            marginBottom: '4px',
            fontFamily: 'var(--font-mono)',
          }}>
            <span>LOW {formatPrice(low24h)}</span>
            <span style={{ color: 'var(--text-secondary)' }}>24H RANGE</span>
            <span>HIGH {formatPrice(high24h)}</span>
          </div>
          <div style={{
            height: '4px',
            background: 'var(--border)',
            borderRadius: '2px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              left: `${rangePct - 2}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: trendColor,
              boxShadow: `0 0 8px ${trendColor}`,
              border: '2px solid var(--void)',
            }} />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'flex',
        gap: '16px',
        paddingTop: '8px',
        borderTop: '1px solid rgba(42,42,74,0.5)',
      }}>
        {marketCap !== undefined && (
          <div>
            <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>MCap</div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatLarge(marketCap)}</div>
          </div>
        )}
        {volume24h !== undefined && (
          <div>
            <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Vol 24H</div>
            <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{formatLarge(volume24h)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
