"use client"

import { useState, useEffect } from "react"
import { Activity, TrendingUp, TrendingDown, DollarSign, RefreshCw } from "lucide-react"

// Simulated price data (based on real market prices)
const INITIAL_PRICES = [
  { symbol: 'BTC', price: 65574, change24h: 2.3 },
  { symbol: 'ETH', price: 1924, change24h: 1.8 },
  { symbol: 'SOL', price: 82.71, change24h: -2.1 },
  { symbol: 'ADA', price: 0.272, change24h: -1.5 },
  { symbol: 'DOT', price: 1.51, change24h: -0.8 },
]

// Simulated signals data
const INITIAL_SIGNALS = [
  { symbol: 'BTC', action: 'HOLD', confidence: 75 },
  { symbol: 'ETH', action: 'HOLD', confidence: 68 },
  { symbol: 'SOL', action: 'HOLD', confidence: 62 },
  { symbol: 'ADA', action: 'HOLD', confidence: 58 },
]

export default function DashboardPage() {
  const [prices, setPrices] = useState(INITIAL_PRICES)
  const [signals, setSignals] = useState(INITIAL_SIGNALS)
  const [lastUpdate, setLastUpdate] = useState(Date.now())

  // Simulate price updates with small variations
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => prev.map(p => ({
        ...p,
        price: p.price * (1 + (Math.random() - 0.5) * 0.001), // Small fluctuation
        change24h: p.change24h + (Math.random() - 0.5) * 0.1
      })))
      setLastUpdate(Date.now())
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0a0a0a', color: '#ffffff', padding: '2rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', backgroundColor: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity style={{ width: '20px', height: '20px', color: '#8b5cf6' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Crypto Trader OS</h1>
              <p style={{ fontSize: '0.75rem', color: '#888', margin: 0 }}>Real-time trading dashboard</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#888' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 2s infinite' }} />
            Live
          </div>
        </div>
      </div>

      {/* Prices Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', fontWeight: '600' }}>Live Prices</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
          {prices.map((price) => {
            const isPositive = price.change24h >= 0
            return (
              <div key={price.symbol} style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>{price.symbol}</span>
                  {isPositive ? (
                    <TrendingUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                  ) : (
                    <TrendingDown style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                  )}
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {price.price >= 1000
                    ? `$${price.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : price.price >= 1
                    ? `$${price.price.toFixed(2)}`
                    : `$${price.price.toFixed(6)}`
                  }
                </div>
                <div style={{ fontSize: '0.75rem', color: isPositive ? '#22c55e' : '#ef4444', fontWeight: '500' }}>
                  {isPositive ? '+' : ''}{price.change24h.toFixed(2)}%
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Two Column Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {/* Trading Signals */}
        <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1rem' }}>
          <h2 style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', fontWeight: '600' }}>Trading Signals</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {signals.map((signal) => {
              const isBullish = signal.action === 'BUY'
              const isBearish = signal.action === 'SELL'
              const bgColor = isBullish ? 'rgba(34, 197, 94, 0.1)' : isBearish ? 'rgba(239, 68, 68, 0.1)' : '#2a2a2a'
              const borderColor = isBullish ? 'rgba(34, 197, 94, 0.3)' : isBearish ? 'rgba(239, 68, 68, 0.3)' : '#333'
              const actionColor = isBullish ? '#22c55e' : isBearish ? '#ef4444' : '#888'

              return (
                <div key={signal.symbol} style={{ backgroundColor: bgColor, border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {isBullish ? (
                      <TrendingUp style={{ width: '16px', height: '16px', color: '#22c55e' }} />
                    ) : isBearish ? (
                      <TrendingDown style={{ width: '16px', height: '16px', color: '#ef4444' }} />
                    ) : (
                      <div style={{ width: '16px', height: '16px', backgroundColor: '#333', borderRadius: '4px' }} />
                    )}
                    <div>
                      <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>{signal.symbol}</span>
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: bgColor, color: actionColor, border: `1px solid ${borderColor}` }}>
                        {signal.action}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#fff' }}>{signal.confidence}%</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Portfolio */}
        <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1rem' }}>
          <h2 style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', fontWeight: '600' }}>Portfolio</h2>

          {/* Balance */}
          <div style={{ backgroundColor: '#2a2a2a', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.25rem 0' }}>Total Balance</p>
                <p style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>$10,000</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.25rem 0' }}>P&L</p>
                <p style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0, color: '#888' }}>$0.00</p>
              </div>
            </div>
          </div>

          {/* No Positions */}
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <DollarSign style={{ width: '32px', height: '32px', margin: '0 auto 0.5rem', color: '#333' }} />
            <p style={{ fontSize: '0.875rem', color: '#888', margin: 0 }}>No open positions</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
