'use client'

import React, { useEffect, useState } from 'react'

interface FundingRate {
  exchange: string
  rate: number
  nextFunding: string
}

interface OpenInterest {
  exchange: string
  btc: number
  change24h: number
}

interface LiquidationData {
  side: 'long' | 'short'
  price: number
  size: number
  exchange: string
}

interface MarginHealthProps {
  marginUsed?: number
  marginAvailable?: number
  liquidationLevel?: number
  unrealizedPnl?: number
}

export function MarginHealth({
  marginUsed = 2500,
  marginAvailable = 7500,
  liquidationLevel = 84.2,
  unrealizedPnl = 320,
}: MarginHealthProps) {
  const total = marginUsed + marginAvailable
  const usedPct = (marginUsed / total) * 100
  const healthColor = usedPct < 50 ? 'var(--green)' : usedPct < 75 ? 'var(--orange)' : 'var(--magenta)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Health gauge */}
      <div style={{ position: 'relative' }}>
        {/* Bar */}
        <div style={{
          height: '8px',
          background: 'var(--border)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative',
        }}>
          <div style={{
            width: `${usedPct}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${healthColor}, ${healthColor}aa)`,
            borderRadius: '4px',
            boxShadow: `0 0 8px ${healthColor}60`,
            transition: 'width 0.5s ease-out',
          }} />
          {/* Liquidation marker */}
          <div style={{
            position: 'absolute',
            left: `${liquidationLevel}%`,
            top: '-4px',
            bottom: '-4px',
            width: '2px',
            background: 'var(--magenta)',
            boxShadow: '0 0 4px var(--magenta)',
          }} />
        </div>
        {/* Labels */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '6px',
          fontSize: '8px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
        }}>
          <span style={{ color: 'var(--magenta)' }}>LIQ @ {liquidationLevel}%</span>
          <span>Margin Used: {usedPct.toFixed(1)}%</span>
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div style={{
          padding: '8px',
          background: 'rgba(10,10,18,0.5)',
          borderRadius: '6px',
          border: '1px solid rgba(42,42,74,0.5)',
        }}>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Used</div>
          <div style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: healthColor }}>${marginUsed.toLocaleString()}</div>
        </div>
        <div style={{
          padding: '8px',
          background: 'rgba(10,10,18,0.5)',
          borderRadius: '6px',
          border: '1px solid rgba(42,42,74,0.5)',
        }}>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Available</div>
          <div style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan)' }}>${marginAvailable.toLocaleString()}</div>
        </div>
        <div style={{
          padding: '8px',
          background: 'rgba(10,10,18,0.5)',
          borderRadius: '6px',
          border: '1px solid rgba(42,42,74,0.5)',
        }}>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Total</div>
          <div style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>${total.toLocaleString()}</div>
        </div>
        <div style={{
          padding: '8px',
          background: 'rgba(10,10,18,0.5)',
          borderRadius: '6px',
          border: '1px solid rgba(42,42,74,0.5)',
        }}>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Unrealized</div>
          <div style={{
            fontSize: '14px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            color: unrealizedPnl >= 0 ? 'var(--green)' : 'var(--magenta)',
          }}>
            {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  )
}

export function FundingRates() {
  const [rates, setRates] = useState<FundingRate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/market/funding-rates')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.length) setRates(json.data)
        else {
          setRates([
            { exchange: 'Binance', rate: 0.00012, nextFunding: '2h 15m' },
            { exchange: 'Bybit', rate: 0.00015, nextFunding: '1h 45m' },
            { exchange: 'OKX', rate: 0.00008, nextFunding: '3h 30m' },
            { exchange: 'Deribit', rate: -0.00005, nextFunding: '4h 00m' },
            { exchange: 'dYdX', rate: 0.00022, nextFunding: '2h 00m' },
          ])
        }
      })
      .catch(() => {
        setRates([
          { exchange: 'Binance', rate: 0.00012, nextFunding: '2h 15m' },
          { exchange: 'Bybit', rate: 0.00015, nextFunding: '1h 45m' },
        ])
      })
      .finally(() => setLoading(false))
  }, [])

  const avgRate = rates.length > 0 ? rates.reduce((s, r) => s + r.rate, 0) / rates.length : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* Average rate */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px',
        background: 'rgba(10,10,18,0.5)',
        borderRadius: '8px',
        border: '1px solid rgba(42,42,74,0.5)',
      }}>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg BTC Funding</span>
        <span style={{
          fontSize: '12px',
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          color: avgRate >= 0 ? 'var(--orange)' : 'var(--green)',
        }}>
          {avgRate >= 0 ? '+' : ''}{(avgRate * 100 * 365).toFixed(2)}% APR
        </span>
      </div>

      {/* Per-exchange */}
      {loading ? (
        <div className="shimmer" style={{ height: '60px', borderRadius: '8px' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {rates.map((r, i) => {
            const isPositive = r.rate >= 0
            const barPct = Math.min(Math.abs(r.rate) / 0.001 * 50, 100)
            return (
              <div key={i} style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 50px',
                gap: '8px',
                alignItems: 'center',
                padding: '4px 0',
              }}>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{r.exchange}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    height: '4px',
                    flex: 1,
                    background: 'var(--border)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${barPct}%`,
                      height: '100%',
                      background: isPositive ? 'var(--orange)' : 'var(--green)',
                      borderRadius: '2px',
                    }} />
                  </div>
                </div>
                <span style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 600,
                  color: isPositive ? 'var(--orange)' : 'var(--green)',
                  textAlign: 'right',
                }}>
                  {isPositive ? '+' : ''}{(r.rate * 100 * 8).toFixed(4)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function OpenInterest() {
  const [data, setData] = useState<OpenInterest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/market/arbitrage')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.length) setData(json.data.slice(0, 5))
        else {
          setData([
            { exchange: 'Binance', btc: 12400, change24h: 5.2 },
            { exchange: 'Bybit', btc: 8200, change24h: 8.1 },
            { exchange: 'OKX', btc: 6100, change24h: -2.4 },
            { exchange: 'Deribit', btc: 9800, change24h: 3.7 },
            { exchange: 'CME', btc: 4500, change24h: -1.2 },
          ])
        }
      })
      .catch(() => {
        setData([
          { exchange: 'Binance', btc: 12400, change24h: 5.2 },
          { exchange: 'Bybit', btc: 8200, change24h: 8.1 },
        ])
      })
      .finally(() => setLoading(false))
  }, [])

  const total = data.reduce((s, d) => s + d.btc, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px',
        background: 'rgba(10,10,18,0.5)',
        borderRadius: '8px',
        border: '1px solid rgba(42,42,74,0.5)',
      }}>
        <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total OI (BTC)</span>
        <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--cyan)' }}>
          {total.toLocaleString()}
        </span>
      </div>

      {loading ? (
        <div className="shimmer" style={{ height: '80px', borderRadius: '8px' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {data.map((d, i) => {
            const pct = (d.btc / total) * 100
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 60px', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{d.exchange}</span>
                <div style={{ position: 'relative', height: '6px', background: 'var(--border)', borderRadius: '3px' }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, var(--cyan), var(--purple))',
                    borderRadius: '3px',
                    boxShadow: '0 0 4px rgba(0,245,255,0.3)',
                  }} />
                </div>
                <span style={{
                  fontSize: '9px',
                  fontFamily: 'var(--font-mono)',
                  color: d.change24h >= 0 ? 'var(--green)' : 'var(--magenta)',
                  textAlign: 'right',
                }}>
                  {d.change24h >= 0 ? '+' : ''}{d.change24h.toFixed(1)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Liquidations() {
  const [data, setData] = useState<LiquidationData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/market/liquidations')
      .then(r => r.json())
      .then(json => {
        if (json.success && json.data?.length) setData(json.data)
        else {
          setData([
            { side: 'long', price: 68420, size: 2850000, exchange: 'Binance' },
            { side: 'short', price: 72150, size: 4200000, exchange: 'Bybit' },
            { side: 'long', price: 68200, size: 1850000, exchange: 'OKX' },
            { side: 'short', price: 72400, size: 3100000, exchange: 'Deribit' },
            { side: 'long', price: 68150, size: 2200000, exchange: 'Binance' },
          ])
        }
      })
      .catch(() => {
        setData([
          { side: 'long', price: 68420, size: 2850000, exchange: 'Binance' },
          { side: 'short', price: 72150, size: 4200000, exchange: 'Bybit' },
        ])
      })
      .finally(() => setLoading(false))
  }, [])

  const longs = data.filter(d => d.side === 'long').reduce((s, d) => s + d.size, 0)
  const shorts = data.filter(d => d.side === 'short').reduce((s, d) => s + d.size, 0)

  const formatSize = (n: number) => {
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
    if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
    return `$${n}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '8px',
      }}>
        <div style={{
          padding: '8px',
          borderRadius: '8px',
          background: 'rgba(255,0,128,0.06)',
          border: '1px solid rgba(255,0,128,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--magenta)' }} />
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Long Liqs</span>
          </div>
          <div style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--magenta)' }}>{formatSize(longs)}</div>
        </div>
        <div style={{
          padding: '8px',
          borderRadius: '8px',
          background: 'rgba(0,255,136,0.06)',
          border: '1px solid rgba(0,255,136,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--green)' }} />
            <span style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Short Liqs</span>
          </div>
          <div style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--green)' }}>{formatSize(shorts)}</div>
        </div>
      </div>

      {/* Recent liquidations */}
      {loading ? (
        <div className="shimmer" style={{ height: '80px', borderRadius: '8px' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {data.slice(0, 5).map((l, i) => (
            <div key={i} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 8px',
              borderRadius: '4px',
              background: l.side === 'long' ? 'rgba(255,0,128,0.04)' : 'rgba(0,255,136,0.04)',
              borderLeft: `2px solid ${l.side === 'long' ? 'var(--magenta)' : 'var(--green)'}`,
            }}>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: l.side === 'long' ? 'var(--magenta)' : 'var(--green)' }}>
                {l.side.toUpperCase()}
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
                @ ${l.price.toLocaleString()}
              </span>
              <span style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {formatSize(l.size)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
