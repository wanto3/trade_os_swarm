'use client'

import React, { useState } from 'react'
import { TrendingUp, TrendingDown, X } from 'lucide-react'

interface Position {
  id: string
  symbol: string
  side: 'LONG' | 'SHORT'
  size: number
  entryPrice: number
  markPrice: number
  pnl: number
  pnlPct: number
  leverage: number
  liqPrice: number
  margin: number
}

const FALLBACK_POSITIONS: Position[] = [
  { id: '1', symbol: 'BTC', side: 'LONG', size: 0.5, entryPrice: 68200, markPrice: 70650, pnl: 1225, pnlPct: 3.59, leverage: 5, liqPrice: 54400, margin: 6820 },
  { id: '2', symbol: 'ETH', side: 'LONG', size: 3.2, entryPrice: 1820, markPrice: 1845, pnl: 80, pnlPct: 1.37, leverage: 3, liqPrice: 1210, margin: 1941 },
  { id: '3', symbol: 'SOL', side: 'SHORT', size: 150, entryPrice: 132, markPrice: 128.5, pnl: 525, pnlPct: 2.65, leverage: 8, liqPrice: 148, margin: 2400 },
]

export function PositionManager() {
  const [positions, setPositions] = useState<Position[]>(FALLBACK_POSITIONS)
  const [collapsed, setCollapsed] = useState(false)

  const totalPnl = positions.reduce((s, p) => s + p.pnl, 0)
  const totalMargin = positions.reduce((s, p) => s + p.margin, 0)

  const formatPrice = (p: number) => {
    if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    return `$${p.toFixed(2)}`
  }

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          padding: '12px',
          background: 'rgba(10,10,18,0.5)',
          borderRadius: '8px',
          border: '1px solid rgba(42,42,74,0.5)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>
            Positions ({positions.length})
          </div>
          <div style={{
            fontSize: '14px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: totalPnl >= 0 ? 'var(--green)' : 'var(--magenta)',
          }}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Click to expand →</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: '8px',
        padding: '10px',
        background: 'rgba(10,10,18,0.5)',
        borderRadius: '8px',
        border: '1px solid rgba(42,42,74,0.5)',
      }}>
        <div>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Positions</div>
          <div style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan)' }}>{positions.length}</div>
        </div>
        <div>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total PnL</div>
          <div style={{
            fontSize: '16px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: totalPnl >= 0 ? 'var(--green)' : 'var(--magenta)',
          }}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Margin Used</div>
          <div style={{ fontSize: '16px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>
            ${totalMargin.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Position rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {positions.map((pos) => (
          <div
            key={pos.id}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              background: pos.side === 'LONG' ? 'rgba(0,255,136,0.03)' : 'rgba(255,0,128,0.03)',
              border: `1px solid ${pos.side === 'LONG' ? 'rgba(0,255,136,0.15)' : 'rgba(255,0,128,0.15)'}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                }}>
                  {pos.symbol}
                </span>
                <span style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '4px',
                  background: pos.side === 'LONG' ? 'rgba(0,255,136,0.15)' : 'rgba(255,0,128,0.15)',
                  color: pos.side === 'LONG' ? 'var(--green)' : 'var(--magenta)',
                  border: `1px solid ${pos.side === 'LONG' ? 'rgba(0,255,136,0.3)' : 'rgba(255,0,128,0.3)'}`,
                }}>
                  {pos.side} {pos.leverage}x
                </span>
              </div>
              <span style={{
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                color: pos.pnl >= 0 ? 'var(--green)' : 'var(--magenta)',
              }}>
                {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                <span style={{ fontSize: '9px', color: pos.pnl >= 0 ? 'var(--green)' : 'var(--magenta)', opacity: 0.7 }}>
                  {' '}({pos.pnl >= 0 ? '+' : ''}{pos.pnlPct.toFixed(2)}%)
                </span>
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '4px',
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
            }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Size </span>
                <span style={{ color: 'var(--text-secondary)' }}>{pos.size}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Entry </span>
                <span style={{ color: 'var(--text-secondary)' }}>{formatPrice(pos.entryPrice)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Mark </span>
                <span style={{ color: pos.markPrice > pos.entryPrice ? 'var(--green)' : 'var(--magenta)' }}>{formatPrice(pos.markPrice)}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Liq </span>
                <span style={{ color: 'var(--orange)' }}>{formatPrice(pos.liqPrice)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => setCollapsed(true)}
        style={{
          fontSize: '9px',
          color: 'var(--text-muted)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'center',
          padding: '4px',
        }}
      >
        Collapse ↑
      </button>
    </div>
  )
}
