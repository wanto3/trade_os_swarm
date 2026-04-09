import { NextRequest, NextResponse } from 'next/server'
import { getTAData } from '@/lib/services/technical-analysis.service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SUPPORTED_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT']
const SUPPORTED_INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d']

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || 'BTCUSDT').toUpperCase()
  const interval = searchParams.get('interval') || '1h'

  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return NextResponse.json({ error: `Unsupported symbol. Use one of: ${SUPPORTED_SYMBOLS.join(', ')}` }, { status: 400 })
  }
  if (!SUPPORTED_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: `Unsupported interval. Use one of: ${SUPPORTED_INTERVALS.join(', ')}` }, { status: 400 })
  }

  try {
    const data = await getTAData(symbol, interval)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('TA service error:', err)
    return NextResponse.json({ error: 'Failed to fetch market data', details: err.message }, { status: 500 })
  }
}
