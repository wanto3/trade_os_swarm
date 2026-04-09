'use client'

import React, { useEffect, useState } from 'react'

interface OrderBookEntry {
  price: number
  size: number
  total: number
}

interface OrderBookDepthProps {
  bids: OrderBookEntry[]
  asks: OrderBookEntry[]
  spread?: number
  symbol?: string
}

export function OrderBookDepth({
  bids = [],
  asks = [],
  spread = 0,
  symbol = 'BTC',
}: OrderBookDepthProps) {
  const maxTotal = Math.max(
    ...bids.map(b => b.total),
    ...asks.map(a => a.total)
  )

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    if (p >= 1) return p.toFixed(2)
    return p.toFixed(4)
  }

  const formatSize = (s: number) => {
    if (s >= 1) return s.toFixed(4)
    return s.toFixed(6)
  }

  // Aggregate depth for visualization
  const bidDepth = bids.slice(0, 12).map(b => ({
    ...b,
    pct: (b.total / maxTotal) * 100,
  }))

  const askDepth = asks.slice(0, 12).map(a => ({
    ...a,
    pct: (a.total / maxTotal) * 100,
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {/* Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
        padding: '0 4px',
        marginBottom: '4px',
      }}>
        <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>Size</div>
        <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>Price</div>
        <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Size</div>
      </div>

      {/* Asks (top, red) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {[...askDepth].reverse().map((ask, i) => (
          <div key={`ask-${i}`} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: `${ask.pct}%`,
              background: 'linear-gradient(to left, rgba(255,0,128,0.12), transparent)',
              borderRadius: '2px',
              zIndex: 0,
            }} />
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'left', position: 'relative', zIndex: 1 }}>{formatSize(ask.size)}</div>
            <div style={{ fontSize: '9px', color: 'var(--magenta)', fontFamily: 'var(--font-mono)', fontWeight: 600, textAlign: 'center', position: 'relative', zIndex: 1 }}>{formatPrice(ask.price)}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'right', position: 'relative', zIndex: 1 }}></div>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 0',
        borderTop: '1px solid rgba(42,42,74,0.5)',
        borderBottom: '1px solid rgba(42,42,74,0.5)',
      }}>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spread</span>
        <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan)' }}>
          ${spread.toFixed(2)}
        </span>
        {spread > 0 && (
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            ({(spread / (asks[0]?.price || 1) * 100).toFixed(3)}%)
          </span>
        )}
      </div>

      {/* Bids (bottom, green) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {bidDepth.map((bid, i) => (
          <div key={`bid-${i}`} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '8px',
            position: 'relative',
          }}>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'left', position: 'relative', zIndex: 1 }}></div>
            <div style={{ fontSize: '9px', color: 'var(--green)', fontFamily: 'var(--font-mono)', fontWeight: 600, textAlign: 'center', position: 'relative', zIndex: 1 }}>{formatPrice(bid.price)}</div>
            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textAlign: 'right', position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <div style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${bid.pct}%`,
                background: 'linear-gradient(to right, rgba(0,255,136,0.12), transparent)',
                borderRadius: '2px',
                zIndex: 0,
              }} />
              <span style={{ position: 'relative', zIndex: 1 }}>{formatSize(bid.size)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
