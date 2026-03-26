import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

interface FundingRate {
  exchange: string
  rate: number
  nextFunding: string
}

const exchanges = [
  { name: 'Binance', baseRate: 0.0001 },
  { name: 'Bybit', baseRate: 0.00015 },
  { name: 'OKX', baseRate: 0.00008 },
  { name: 'Deribit', baseRate: -0.00005 },
  { name: 'dYdX', baseRate: 0.00022 },
  { name: 'GMX', baseRate: 0.00018 },
  { name: 'Apex', baseRate: 0.00012 },
]

function generateFundingRates(): FundingRate[] {
  return exchanges.map(ex => {
    const rate = ex.baseRate + (Math.random() - 0.5) * 0.0001
    const hours = Math.floor(Math.random() * 8)
    const mins = Math.floor(Math.random() * 60)
    const nextFunding = `${hours}h ${mins}m`
    return { exchange: ex.name, rate, nextFunding }
  })
}

export async function GET() {
  const data = generateFundingRates()
  return NextResponse.json({
    success: true,
    data,
    timestamp: Date.now(),
  })
}
