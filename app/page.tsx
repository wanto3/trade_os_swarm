"use client"

import { useState, useEffect } from "react"
import { Activity, TrendingUp, TrendingDown, DollarSign, RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react"

// Main coins data
const INITIAL_PRICES = [
  { symbol: 'BTC', name: 'Bitcoin', price: 65574, change24h: 2.3, marketCap: '1.29T', volume: '38.5B' },
  { symbol: 'ETH', name: 'Ethereum', price: 1924, change24h: 1.8, marketCap: '233B', volume: '15.5B' },
  { symbol: 'SOL', price: 82.71, change24h: -2.1, marketCap: '38B', volume: '2.5B' },
  { symbol: 'ADA', price: 0.272, change24h: -1.5, marketCap: '9.7B', volume: '350M' },
  { symbol: 'DOT', price: 1.51, change24h: -0.8, marketCap: '2.0B', volume: '180M' },
]

// Trend predictions for next few days
const TREND_PREDICTIONS = {
  BTC: {
    shortTerm: 'bullish',
    mediumTerm: 'bullish',
    direction: 'UP',
    confidence: 72,
    targets: ['$67,500', '$69,800', '$72,000'],
    timeframe: '3-5 days',
    reasoning: ['Breaking above $65K resistance', 'Strong buying volume', 'Positive momentum indicators']
  },
  ETH: {
    shortTerm: 'neutral',
    mediumTerm: 'bullish',
    direction: 'SIDEWAYS',
    confidence: 58,
    targets: ['$1,980', '$2,050', '$2,150'],
    timeframe: '3-5 days',
    reasoning: ['Consolidating near $1.9K', 'Waiting for BTC lead', 'Stable trading pattern']
  }
}

// Micro trend data
const MICRO_TRENDS = {
  BTC: {
    '1h': 'up',
    '4h': 'up',
    '24h': 'up',
    support: '$64,200',
    resistance: '$66,800',
    rsi: 58,
    momentum: 'bullish'
  },
  ETH: {
    '1h': 'down',
    '4h': 'neutral',
    '24h': 'up',
    support: '$1,850',
    resistance: '$1,980',
    rsi: 52,
    momentum: 'neutral'
  }
}

export default function DashboardPage() {
  const [prices, setPrices] = useState(INITIAL_PRICES)
  const [lastUpdate, setLastUpdate] = useState(Date.now())

  // Simulate price updates
  useEffect(() => {
    const interval = setInterval(() => {
      setPrices(prev => prev.map(p => ({
        ...p,
        price: p.price * (1 + (Math.random() - 0.5) * 0.001),
        change24h: p.change24h + (Math.random() - 0.5) * 0.1
      })))
      setLastUpdate(Date.now())
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const formatPrice = (price: number) => {
    if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    if (price >= 1) return `$${price.toFixed(2)}`
    return `$${price.toFixed(6)}`
  }

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
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
            Live
          </div>
        </div>
      </div>

      {/* BTC & ETH Main Coins */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', fontWeight: '600' }}>Top Coins to Watch</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {prices.slice(0, 2).map((coin) => {
            const btcData = coin.symbol === 'BTC' ? TREND_PREDICTIONS.BTC : coin.symbol === 'ETH' ? TREND_PREDICTIONS.ETH : null
            const microData = coin.symbol === 'BTC' ? MICRO_TRENDS.BTC : coin.symbol === 'ETH' ? MICRO_TRENDS.ETH : null
            const isPositive = coin.change24h >= 0

            return (
              <div key={coin.symbol} style={{ backgroundColor: '#1a1a1a', border: `1px solid ${isPositive ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`, borderRadius: '16px', padding: '1.5rem' }}>
                {/* Coin Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{coin.symbol}</span>
                      <span style={{ fontSize: '0.875rem', color: '#888' }}>{coin.name}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>MCap: {coin.marketCap} • Vol: {coin.volume}</div>
                  </div>
                  {isPositive ? (
                    <TrendingUp style={{ width: '24px', height: '24px', color: '#22c55e' }} />
                  ) : (
                    <TrendingDown style={{ width: '24px', height: '24px', color: '#ef4444' }} />
                  )}
                </div>

                {/* Price */}
                <div style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {formatPrice(coin.price)}
                </div>
                <div style={{ fontSize: '0.875rem', color: isPositive ? '#22c55e' : '#ef4444', fontWeight: '500', marginBottom: '1.5rem' }}>
                  {isPositive ? '+' : ''}{coin.change24h.toFixed(2)}% (24h)
                </div>

                {/* Trend Prediction */}
                {btcData && (
                  <div style={{ backgroundColor: '#111', borderRadius: '12px', padding: '1rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontWeight: '600' }}>
                      {btcData.timeframe} Forecast
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {btcData.direction === 'UP' ? (
                          <ArrowUpRight style={{ width: '20px', height: '20px', color: '#22c55e' }} />
                        ) : btcData.direction === 'DOWN' ? (
                          <ArrowDownRight style={{ width: '20px', height: '20px', color: '#ef4444' }} />
                        ) : (
                          <Minus style={{ width: '20px', height: '20px', color: '#888' }} />
                        )}
                        <span style={{ fontSize: '1.125rem', fontWeight: 'bold', color: btcData.direction === 'UP' ? '#22c55e' : btcData.direction === 'DOWN' ? '#ef4444' : '#888' }}>
                          {btcData.direction}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.875rem', color: '#888' }}>{btcData.confidence}% confidence</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.5rem' }}>Price Targets:</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {btcData.targets.map((target, i) => (
                        <span key={i} style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '6px', backgroundColor: '#1a1a1a', color: '#22c55e', fontWeight: '500' }}>
                          {target}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Micro Trend */}
                {microData && (
                  <div style={{ backgroundColor: '#111', borderRadius: '12px', padding: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem', fontWeight: '600' }}>
                      Micro Trend
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {[
                        { label: '1H', value: microData['1h'] },
                        { label: '4H', value: microData['4h'] },
                        { label: '24H', value: microData['24h'] },
                        { label: 'RSI', value: microData.rsi.toString() }
                      ].map((item) => {
                        const isUp = item.value === 'up' || (!isNaN(parseInt(item.value)) && parseInt(item.value) > 50)
                        const isDown = item.value === 'down' || (!isNaN(parseInt(item.value)) && parseInt(item.value) < 50)
                        return (
                          <div key={item.label} style={{ textAlign: 'center', padding: '0.5rem', backgroundColor: '#1a1a1a', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.625rem', color: '#666', marginBottom: '0.25rem' }}>{item.label}</div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: isUp ? '#22c55e' : isDown ? '#ef4444' : '#888' }}>
                              {item.value === 'up' ? '↑' : item.value === 'down' ? '↓' : item.value === 'neutral' ? '→' : item.value}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ color: '#666' }}>Support: <span style={{ color: '#22c55e' }}>{microData.support}</span></span>
                      <span style={{ color: '#666' }}>Resistance: <span style={{ color: '#ef4444' }}>{microData.resistance}</span></span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Other Coins */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', fontWeight: '600' }}>Other Assets</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
          {prices.slice(2).map((price) => {
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
                  {formatPrice(price.price)}
                </div>
                <div style={{ fontSize: '0.75rem', color: isPositive ? '#22c55e' : '#ef4444', fontWeight: '500' }}>
                  {isPositive ? '+' : ''}{price.change24h.toFixed(2)}%
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Portfolio */}
      <div style={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '12px', padding: '1rem', maxWidth: '400px' }}>
        <h2 style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', fontWeight: '600' }}>Portfolio</h2>

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

        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <DollarSign style={{ width: '32px', height: '32px', margin: '0 auto 0.5rem', color: '#333' }} />
          <p style={{ fontSize: '0.875rem', color: '#888', margin: 0 }}>No open positions</p>
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
