import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

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

const exchanges = ['Binance', 'Coinbase', 'Kraken', 'Bybit', 'OKX', 'Bitfinex', 'Deribit', 'Bitstamp', 'dYdX']
const symbols = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT']
const types: WhaleAlert['type'][] = ['exchange', 'transfer', 'funding']
const directions: WhaleAlert['direction'][] = ['in', 'out']

function generateWhales(): WhaleAlert[] {
  const count = 8 + Math.floor(Math.random() * 8)
  const now = Date.now()
  const alerts: WhaleAlert[] = []

  for (let i = 0; i < count; i++) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)]
    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)]
    const direction = directions[Math.floor(Math.random() * directions.length)]
    const type = types[Math.floor(Math.random() * types.length)]
    const minsAgo = Math.floor(Math.random() * 180)

    let amountUsd: number
    const btcPrice = 84000
    if (symbol === 'BTC') {
      amountUsd = (50 + Math.random() * 500) * btcPrice
    } else if (symbol === 'ETH') {
      amountUsd = (500 + Math.random() * 5000) * 2000
    } else {
      amountUsd = (5000 + Math.random() * 50000) * 100
    }

    const mins = minsAgo
    const timeAgo = mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`

    alerts.push({
      id: `whale-${Date.now()}-${i}`,
      amount: amountUsd / (symbol === 'BTC' ? btcPrice : symbol === 'ETH' ? 2000 : 100),
      amountUsd,
      exchange,
      direction,
      type,
      timeAgo,
      symbol,
    })
  }

  return alerts.sort((a, b) => {
    const aMins = parseInt(a.timeAgo)
    const bMins = parseInt(b.timeAgo)
    return aMins - bMins
  })
}

export async function GET() {
  const data = generateWhales()
  return NextResponse.json({
    success: true,
    data,
    timestamp: Date.now(),
  })
}
