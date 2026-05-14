import { NextResponse } from 'next/server'

const POLYMARKET_API_KEY = process.env.POLYMARKET_API_KEY
const WALLET = process.env.POLYMARKET_WALLET_ADDRESS
  || process.env.POLYMARKET_WALLET
  || '0x4523a57e1d1d674c937c1e85C1e496fa60fd9146'
// Polymarket settles in USDC.e on Polygon (the bridged-USDC contract).
// Previous version queried USDT — wrong token, always returned 0.
const USDC_POLYGON_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'  // USDC.e bridged
const USDC_POLYGON_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'  // Newer native USDC (some users)
const USDC_GNOSIS = '0x2aC5e8a11415F16b6047C27aAEb94FdbB411C00C'

const PAD = WALLET.toLowerCase().replace('0x', '')
const BALANCE_OF = '0x70a08231' + '0'.repeat(24) + PAD

async function getTokenBalance(rpc: string, token: string): Promise<number> {
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_call',
        params: [{ to: token, data: BALANCE_OF }, 'latest'],
        id: 1
      }),
      signal: AbortSignal.timeout(8000)
    })
    if (res.ok) {
      const data = await res.json()
      const hex = data.result || '0x0'
      if (hex && hex !== '0x0' && hex !== '0x') {
        // ERC-20: last 0-padded uint256. Need to check decimals per token.
        const val = BigInt(hex)
        // USDT/USDC: 6 decimals on Polygon, 18 on Gnosis
        const chainDecimals = token === USDC_GNOSIS ? 18 : 6
        return Number(val) / Math.pow(10, chainDecimals)
      }
    }
  } catch {}
  return 0
}

async function fetchPolymarketData(endpoint: string): Promise<unknown[]> {
  if (!POLYMARKET_API_KEY) return []
  try {
    const res = await fetch(
      `https://data-api.polymarket.com/${endpoint}?user=${WALLET}`,
      {
        headers: { 'Authorization': `Bearer ${POLYMARKET_API_KEY}`, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      }
    )
    if (res.ok) {
      const data = await res.json()
      return Array.isArray(data) ? data : []
    }
  } catch {}
  return []
}

export async function GET() {
  const GNOSIS_RPCS = [
    'https://rpc.ankr.com/gnosis',
    'https://rpc.gnosischain.com',
  ]

  const POLYGON_RPCS = [
    'https://rpc.ankr.com/polygon',
    'https://polygon.drpc.org',
    'https://polygon.blockpi.network/v1/rpc/public',
  ]

  // Fetch Polymarket data
  const [positions, trades] = await Promise.all([
    fetchPolymarketData('positions'),
    fetchPolymarketData('trades'),
  ])

  // Try to get on-chain balances. Polymarket-relevant USDC lives on
  // Polygon (USDC.e bridged is what most Polymarket users hold; some
  // newer users have native USDC). Check both, sum, and that's the
  // free cash sitting on top of any open-position values.
  const [gnosisUSDC, polygonUSDCe, polygonUSDCnative] = await Promise.all([
    (async () => {
      for (const rpc of GNOSIS_RPCS) {
        const bal = await getTokenBalance(rpc, USDC_GNOSIS)
        if (bal > 0) return { balance: bal, chain: 'gnosis', rpc }
      }
      return { balance: 0, chain: 'gnosis', rpc: 'unavailable' }
    })(),
    (async () => {
      for (const rpc of POLYGON_RPCS) {
        const bal = await getTokenBalance(rpc, USDC_POLYGON_E)
        if (bal > 0) return { balance: bal, chain: 'polygon', rpc }
      }
      return { balance: 0, chain: 'polygon', rpc: 'unavailable' }
    })(),
    (async () => {
      for (const rpc of POLYGON_RPCS) {
        const bal = await getTokenBalance(rpc, USDC_POLYGON_NATIVE)
        if (bal > 0) return { balance: bal, chain: 'polygon-native', rpc }
      }
      return { balance: 0, chain: 'polygon-native', rpc: 'unavailable' }
    })(),
  ])

  const polymarketBalance = (positions as { balance?: number }[]).reduce(
    (sum, p) => sum + (p.balance || 0), 0
  )

  const polygonUSDCTotal = polygonUSDCe.balance + polygonUSDCnative.balance
  const totalUSD = Math.round((polymarketBalance + gnosisUSDC.balance + polygonUSDCTotal) * 100) / 100

  return NextResponse.json({
    success: true,
    address: WALLET,
    polymarket: {
      positions: (positions as unknown[]).length,
      trades: (trades as unknown[]).length,
      balanceUSD: Math.round(polymarketBalance * 100) / 100,
    },
    chains: {
      gnosisUSDC: Math.round(gnosisUSDC.balance * 100) / 100,
      polygonUSDCe: Math.round(polygonUSDCe.balance * 100) / 100,
      polygonUSDCNative: Math.round(polygonUSDCnative.balance * 100) / 100,
      // Keep legacy key alive for any older consumer of this endpoint —
      // it's the SUM of both USDC variants on Polygon now, since USDT
      // was always 0 (wrong token).
      polygonUSDT: Math.round(polygonUSDCTotal * 100) / 100,
    },
    totalUSD,
    // Free USDC the user has access to outside open positions. This is
    // what gets added to Polymarket's /value endpoint to compute the
    // user's true total bankroll (cash + positions).
    freeUSDC: Math.round(polygonUSDCTotal * 100) / 100,
    recommendedBankroll: Math.round(totalUSD * 0.3 * 100) / 100,
    timestamp: Date.now(),
  })
}
