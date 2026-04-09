import { Wallet } from 'ethers'

export interface TradeOrder {
  marketId: string
  conditionId: string
  tokenId: string
  outcome: string
  price: number
  amount: number
  side: 'BUY' | 'SELL'
}

export interface TradeResult {
  success: boolean
  orderId?: string
  transactionHash?: string
  error?: string
}

export interface Position {
  marketId: string
  question: string
  outcome: string
  size: number
  price: number
  side: 'BUY' | 'SELL'
  orderId?: string
  transactionHash?: string
  timestamp: number
  status: 'open' | 'filled' | 'cancelled' | 'settled'
  pnl?: number
  resolved?: boolean
  result?: 'yes' | 'no' | null
}

const CLOB_HOST = 'https://clob.polymarket.com'
const CHAIN_ID = 137 // Polygon

let _client: any = null
let _wallet: Wallet | null = null

async function getClient() {
  if (_client) return _client

  const privateKey = process.env.POLYMARKET_TRADING_KEY
  const apiKey = process.env.POLYMARKET_CLOB_API_KEY || process.env.POLYMARKET_API_KEY
  const apiSecret = process.env.POLYMARKET_CLOB_API_SECRET

  if (!privateKey) {
    throw new Error('POLYMARKET_TRADING_KEY (wallet private key) is not set in environment')
  }

  if (!apiKey || !apiSecret) {
    throw new Error('POLYMARKET_API_KEY and POLYMARKET_API_SECRET are not set in environment')
  }

  _wallet = new Wallet(privateKey)
  const address = _wallet.address

  const { ClobClient, Side } = await import('@polymarket/clob-client')

  _client = new ClobClient(
    CLOB_HOST,
    CHAIN_ID,
    _wallet,
    {
      key: apiKey,
      secret: apiSecret,
      passphrase: '',
    }
  )

  return _client
}

export function isTradingEnabled(): boolean {
  return !!(
    process.env.POLYMARKET_TRADING_KEY &&
    (process.env.POLYMARKET_CLOB_API_KEY || process.env.POLYMARKET_API_KEY) &&
    process.env.POLYMARKET_CLOB_API_SECRET
  )
}

export function getWalletAddress(): string | null {
  if (!process.env.POLYMARKET_TRADING_KEY) return null
  try {
    const wallet = new Wallet(process.env.POLYMARKET_TRADING_KEY)
    return wallet.address
  } catch {
    return null
  }
}

export async function placeOrder(order: TradeOrder): Promise<TradeResult> {
  if (!isTradingEnabled()) {
    return { success: false, error: 'Trading is not enabled. Set POLYMARKET_TRADING_KEY, POLYMARKET_API_KEY, and POLYMARKET_API_SECRET.' }
  }

  try {
    const client = await getClient()
    const { Side } = await import('@polymarket/clob-client')

    const side = order.side === 'BUY' ? Side.BUY : Side.SELL

    // Create and submit the order
    const result = await client.createAndPostOrder(
      {
        tokenID: order.tokenId,
        price: order.price,
        size: order.amount,
        side,
      },
      {
        // Order options
        tickSize: '0.01',
        // negRiskId: order.conditionId, // for neg risk markets
      }
    )

    if (result) {
      return {
        success: true,
        orderId: result.orderID || result.id || result.orderID || JSON.stringify(result),
        transactionHash: result.txHash || '',
      }
    }

    return { success: true, orderId: JSON.stringify(result) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Polymarket trade error:', msg)
    return { success: false, error: msg }
  }
}

export async function cancelOrder(orderId: string): Promise<TradeResult> {
  if (!isTradingEnabled()) {
    return { success: false, error: 'Trading not enabled' }
  }

  try {
    const client = await getClient()
    await client.cancelOrder(orderId)
    return { success: true, orderId }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function getOpenOrders(): Promise<any[]> {
  if (!isTradingEnabled()) return []

  try {
    const client = await getClient()
    const orders = await client.getOpenOrders()
    return orders || []
  } catch {
    return []
  }
}

export async function getOrdersHistory(): Promise<any[]> {
  if (!isTradingEnabled()) return []

  try {
    const client = await getClient()
    const history = await client.getOrderHistory()
    return history || []
  } catch {
    return []
  }
}

export async function getFills(): Promise<any[]> {
  if (!isTradingEnabled()) return []

  try {
    const client = await getClient()
    const fills = await client.getFills()
    return fills || []
  } catch {
    return []
  }
}

export async function getBalance(): Promise<{ usdc: number; eth: number }> {
  if (!isTradingEnabled()) return { usdc: 0, eth: 0 }

  try {
    const client = await getClient()
    const bal = await client.getBalance()
    return {
      usdc: parseFloat(bal.USDC || '0'),
      eth: parseFloat(bal.ETH || '0'),
    }
  } catch {
    return { usdc: 0, eth: 0 }
  }
}
