import { NextRequest, NextResponse } from 'next/server'
import { isTradingEnabled, getWalletAddress, placeOrder as doPlaceOrder, cancelOrder as doCancelOrder, getOpenOrders, getFills, getBalance } from '@/lib/services/polymarket-trading.service'
import type { TradeOrder } from '@/lib/services/polymarket-trading.service'

export const dynamic = 'force-dynamic'

// GET: Check trading status and balance
export async function GET() {
  const enabled = isTradingEnabled()
  const address = getWalletAddress()
  let balance = { usdc: 0, eth: 0 }
  let openOrders: any[] = []
  let fills: any[] = []

  if (enabled) {
    try {
      const [bal, orders, f] = await Promise.allSettled([
        getBalance(),
        getOpenOrders(),
        getFills(),
      ])

      if (bal.status === 'fulfilled') balance = bal.value
      if (orders.status === 'fulfilled') openOrders = orders.value
      if (f.status === 'fulfilled') fills = f.value
    } catch (err) {
      console.error('Failed to fetch trading data:', err)
    }
  }

  return NextResponse.json({
    enabled,
    address,
    balance,
    openOrdersCount: openOrders.length,
    fillsCount: fills.length,
    // Expose non-sensitive summary
    openOrders: openOrders.slice(0, 10).map((o: any) => ({
      orderId: o.orderID || o.id,
      tokenId: o.tokenID || o.token_id,
      side: o.side,
      size: o.size || o.amount,
      price: o.price,
      filled: o.filled || 0,
      status: o.status,
      createdAt: o.createdAt || o.timestamp,
    })),
    fills: fills.slice(0, 10).map((f: any) => ({
      orderId: f.orderID || f.id,
      tokenId: f.tokenID || f.token_id,
      side: f.side,
      size: f.size || f.amount,
      price: f.price,
      timestamp: f.timestamp || f.createdAt,
      transactionHash: f.txHash || f.transaction_hash,
    })),
    timestamp: Date.now(),
  })
}

// POST: Place a real trade on Polymarket CLOB
export async function POST(request: NextRequest) {
  if (!isTradingEnabled()) {
    return NextResponse.json({
      success: false,
      error: 'Live trading is not configured. Set POLYMARKET_TRADING_KEY, POLYMARKET_API_KEY, and POLYMARKET_API_SECRET in .env.local',
      hint: 'Add these to your .env.local file, then restart the dev server.',
    }, { status: 400 })
  }

  try {
    const body = await request.json()
    const { tokenId, side, price, amount, marketId, outcome } = body

    if (!tokenId) {
      return NextResponse.json({
        success: false,
        error: 'Missing tokenId. The market may not be available on the CLOB yet.',
        hint: 'Only CLOB-available markets can be traded. Check if this market is on the orderbook.',
      }, { status: 400 })
    }

    if (!price || price <= 0 || price >= 1) {
      return NextResponse.json({
        success: false,
        error: 'Invalid price. Must be between 0 and 1 (e.g., 0.65 for 65%).',
      }, { status: 400 })
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({
        success: false,
        error: 'Invalid amount. Must be greater than 0.',
      }, { status: 400 })
    }

    const order: TradeOrder = {
      marketId: marketId || '',
      conditionId: '',
      tokenId,
      outcome: outcome || '',
      price: parseFloat(price),
      amount: parseFloat(amount),
      side: side === 'SELL' ? 'SELL' : 'BUY',
    }

    const result = await doPlaceOrder(order)

    if (result.success) {
      return NextResponse.json({
        success: true,
        orderId: result.orderId,
        transactionHash: result.transactionHash,
        message: `Order placed: ${side} ${amount} shares at ${(price * 100).toFixed(1)}%`,
        tokenId,
        side,
        price,
        amount,
        timestamp: Date.now(),
      })
    } else {
      return NextResponse.json({
        success: false,
        error: result.error || 'Failed to place order',
      }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

// DELETE: Cancel an order
export async function DELETE(request: NextRequest) {
  if (!isTradingEnabled()) {
    return NextResponse.json({ success: false, error: 'Trading not enabled' }, { status: 400 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('orderId')

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 400 })
    }

    const result = await doCancelOrder(orderId)

    if (result.success) {
      return NextResponse.json({ success: true, orderId })
    } else {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
