import { NextResponse } from 'next/server';
import {
  getSupportedSymbols,
  getPriceHistory,
  updateLastPrice,
  updatePriceHistory,
  generateTradingSignal,
} from '@/lib/services/crypto-data.service';

export const dynamic = 'force-dynamic';

// CoinGecko simple price API — free, no key required
const COINGECKO_URL =
  'https://api.coingecko.com/api/v3/simple/price' +
  '?ids=bitcoin,ethereum,solana,cardano,polkadot' +
  '&vs_currencies=usd' +
  '&include_24hr_change=true';

const SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  cardano: 'ADA',
  polkadot: 'DOT',
};

interface CoinGeckoPrice {
  usd: number;
  usd_24h_change?: number;
}

interface CoinGeckoData {
  [key: string]: CoinGeckoPrice;
}

// Server-side cache — survives across requests but resets on server restart
const CACHE_TTL = 60_000; // 1 minute — respects CoinGecko free tier limits
let cachedResult: {
  prices: Array<{ symbol: string; price: number; change24h: number }>;
  source: string;
  timestamp: number;
} | null = null;

async function fetchPricesFromCoinGecko(): Promise<{
  prices: Array<{ symbol: string; price: number; change24h: number }>;
  source: string;
}> {
  // Return cached data if still fresh
  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
    return { prices: cachedResult.prices, source: cachedResult.source };
  }

  try {
    const res = await fetch(COINGECKO_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`CoinGecko responded ${res.status}`);

    const data: CoinGeckoData = await res.json();
    const prices = Object.entries(data).map(([id, value]) => ({
      symbol: SYMBOL_MAP[id] ?? id.toUpperCase(),
      price: value.usd,
      change24h: value.usd_24h_change ?? 0,
    }));

    cachedResult = { prices, source: 'coingecko', timestamp: Date.now() };
    return { prices, source: 'coingecko' };
  } catch (err) {
    console.warn('CoinGecko unavailable, using cached or fallback:', err);
    // Return stale cache if available
    if (cachedResult) {
      return { prices: cachedResult.prices, source: cachedResult.source + '-stale' };
    }
    return { prices: [], source: 'local' };
  }
}

export async function GET() {
  const symbols = getSupportedSymbols();
  const { prices: coinGeckoPrices, source } = await fetchPricesFromCoinGecko();

  // Update service price history with real prices
  for (const cp of coinGeckoPrices) {
    updateLastPrice(cp.symbol, cp.price);
  }

  // Build response: real prices from CoinGecko + technical signals from service
  const data = coinGeckoPrices.length > 0
    ? coinGeckoPrices
    : symbols.map((symbol) => {
        const history = getPriceHistory(symbol);
        const price = history ? history[history.length - 1] : 0;
        const prev = history && history.length > 1 ? history[history.length - 2] : price;
        return {
          symbol,
          price,
          change24h: prev > 0 ? ((price - prev) / prev) * 100 : 0,
        };
      });

  // Attach trading signals from service
  const signals = symbols
    .map((symbol) => {
      const history = getPriceHistory(symbol);
      if (!history || history.length < 5) return null;
      return generateTradingSignal(symbol, history);
    })
    .filter(Boolean);

  // Update price history with synthetic data if using local fallback
  if (coinGeckoPrices.length === 0) {
    for (const symbol of symbols) {
      const history = getPriceHistory(symbol);
      if (history && history.length > 0) {
        const lastPrice = history[history.length - 1];
        const variation = (Math.random() - 0.5) * 0.003;
        updatePriceHistory(symbol, lastPrice * (1 + variation));
      }
    }
  }

  return NextResponse.json({
    success: true,
    data: data.map((p) => ({ ...p, volume24h: 0, marketCap: 0, timestamp: Date.now() })),
    source,
    signals,
    timestamp: Date.now(),
  });
}
