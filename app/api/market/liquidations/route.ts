import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface Liquidation {
  side: 'long' | 'short'
  price: number
  size: number
  exchange: string
}

const exchanges = ['Binance', 'Bybit', 'OKX', 'Deribit', 'dYdX']

function generateLiquidations(): Liquidation[] {
  const count = 5 + Math.floor(Math.random() * 10)
  const liqs: Liquidation[] = []
  const btcPrice = 84000
  const baseLongLiq = btcPrice * 0.82
  const baseShortLiq = btcPrice * 1.18

  for (let i = 0; i < count; i++) {
    const side: 'long' | 'short' = Math.random() > 0.5 ? 'long' : 'short'
    const exchange = exchanges[Math.floor(Math.random() * exchanges.length)]
    const offset = (Math.random() - 0.5) * 0.08
    const price = side === 'long'
      ? baseLongLiq * (1 + offset)
      : baseShortLiq * (1 - offset)
    const size = (1 + Math.random() * 10) * 100000

    liqs.push({ side, price, size, exchange })
  }

  return liqs.sort((a, b) => b.size - a.size)
}

export async function GET() {
  const data = generateLiquidations()
  return NextResponse.json({
    success: true,
    data,
    timestamp: Date.now(),
  })
}
