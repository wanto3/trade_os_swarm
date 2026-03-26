'use client'

import React, { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react'

interface WhaleAlert {
  id: string
  amount: number
  amountUsd: number
  exchange: string
  direction: 'in' | 'out'
  type: 'exchange' | 'transfer' | 'funding'
  timeAgo: string
  symbol: string
}

const FALLBACK_WHALES: WhaleAlert[] = [
  { id: '1', amount: 1250, amountUsd: 105300000, exchange: 'Binance', direction: 'in', type: 'exchange', timeAgo: '2m ago', symbol: 'BTC' },
  { id: '2', amount: 4800, amountUsd: 9720000, exchange: 'Coinbase', direction: 'out', type: 'exchange', timeAgo: '5m ago', symbol: 'ETH' },
  { id: '3', amount: 85000, amountUsd: 10895000, exchange: 'Kraken', direction: 'in', type: 'exchange', timeAgo: '12m ago', symbol: 'SOL' },
  { id: '4', amount: 2.5, amountUsd: 210750000, exchange: 'Bitfinex', direction: 'out', type: 'transfer', timeAgo: '18m ago', symbol: 'BTC' },
  { id: '5', amount: 150000, amountUsd: 19200000, exchange: 'OKX', direction: 'in', type: 'exchange', timeAgo: '31m ago', symbol: 'ETH' },
  { id: '6', amount: 320000, amountUsd: 41024000, exchange: 'Bybit', direction: 'out', type: 'funding', timeAgo: '45m ago', symbol: 'BTC' },
  { id: '7', amount: 12000, amountUsd: 1536000, exchange: 'Bitstamp', direction: 'in', type: 'exchange', timeAgo: '1h ago', symbol: 'ETH' },
  { id: '8', amount: 450000, amountUsd: 58500000, exchange: 'Deribit', direction: 'in', type: 'funding', timeAgo: '1h ago', symbol: 'BTC' },
]

function formatUsd(n: number) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toFixed(0)}`
}

export function WhaleAlerts() {
  const [alerts, setAlerts] = useState<WhaleAlert[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/market/whales')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.length) {
          setAlerts(json.data)
        } else {
          setAlerts(FALLBACK_WHALES)
        }
      })
      .catch(() => setAlerts(FALLBACK_WHALES))
      .finally(() => setLoading(false))
  }, [])

  const inflow = alerts.filter(a => a.direction === 'in').reduce((s, a) => s + a.amountUsd, 0)
  const outflow = alerts.filter(a => a.direction === 'out').reduce((s, a) => s + a.amountUsd, 0)
  const netFlow = inflow - outflow

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Summary bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        gap: '8px',
        padding: '8px 12px',
        background: 'rgba(10,10,18,0.6)',
        borderRadius: '8px',
        border: '1px solid rgba(42,42,74,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <ArrowDownLeft size={10} color="var(--green)" />
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>In</span>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--green)' }}>{formatUsd(inflow)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Net</span>
          <span style={{
            fontSize: '11px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: netFlow >= 0 ? 'var(--green)' : 'var(--magenta)',
          }}>
            {netFlow >= 0 ? '+' : ''}{formatUsd(netFlow)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Out</span>
          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--magenta)' }}>{formatUsd(outflow)}</span>
          <ArrowUpRight size={10} color="var(--magenta)" />
        </div>
      </div>

      {/* Feed */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="shimmer" style={{ height: '28px', borderRadius: '6px' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '200px', overflowY: 'auto' }}>
          {alerts.slice(0, 8).map((alert) => (
            <div
              key={alert.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 8px',
                borderRadius: '6px',
                background: alert.direction === 'in' ? 'rgba(0,255,136,0.04)' : 'rgba(255,0,128,0.04)',
                border: `1px solid ${alert.direction === 'in' ? 'rgba(0,255,136,0.1)' : 'rgba(255,0,128,0.1)'}`,
                animation: 'slide-in-right 0.3s ease-out',
              }}
            >
              {/* Direction icon */}
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: alert.direction === 'in' ? 'rgba(0,255,136,0.15)' : 'rgba(255,0,128,0.15)',
                flexShrink: 0,
              }}>
                {alert.direction === 'in' ? (
                  <ArrowDownLeft size={10} color="var(--green)" />
                ) : (
                  <ArrowUpRight size={10} color="var(--magenta)" />
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    color: alert.direction === 'in' ? 'var(--green)' : 'var(--magenta)',
                  }}>
                    {formatUsd(alert.amountUsd)}
                  </span>
                  <span style={{
                    fontSize: '8px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)',
                    textTransform: 'uppercase',
                  }}>
                    {alert.symbol}
                  </span>
                </div>
              </div>

              {/* Exchange */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                <span style={{ fontSize: '8px', color: 'var(--text-secondary)' }}>{alert.exchange}</span>
                <span style={{ fontSize: '7px', color: 'var(--text-muted)' }}>{alert.timeAgo}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
