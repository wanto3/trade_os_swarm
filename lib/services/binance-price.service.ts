/**
 * Binance Price Service
 * Fetches real-time prices from Binance public API (no key required)
 */

interface BinancePrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  timestamp: number;
}

// Map our symbols to Binance trading pairs
const SYMBOL_MAP: Record<string, string> = {
  'BTC': 'BTCUSDT',
  'ETH': 'ETHUSDT',
  'SOL': 'SOLUSDT',
  'ADA': 'ADAUSDT',
  'DOT': 'DOTUSDT'
};

const BINANCE_API = 'https://api.binance.com/api/v3';

// Cache for prices
let priceCache: { prices: BinancePrice[]; timestamp: number } | null = null;
const CACHE_DURATION = 10000; // 10 seconds

/**
 * Fetch prices from Binance
 */
export async function fetchBinancePrices(): Promise<BinancePrice[]> {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache.prices;
  }

  try {
    // Fetch all prices in one call using 24hr ticker
    const response = await fetch(
      `${BINANCE_API}/ticker/24hr?symbol=BTCUSDT&symbol=ETHUSDT&symbol=SOLUSDT&symbol=ADAUSDT&symbol=DOTUSDT`,
      { next: { revalidate: 10 } }
    );

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    // If single symbol, response is object. If multiple, it's array
    const data = await response.json();
    const tickers = Array.isArray(data) ? data : [data];

    const prices: BinancePrice[] = tickers.map((ticker: Record<string, string>) => {
      const symbol = Object.entries(SYMBOL_MAP).find(([_, v]) => v === ticker.symbol)?.[0] || ticker.symbol;

      // Reverse symbol mapping for USDT pairs
      return {
        symbol,
        price: parseFloat(ticker.lastPrice),
        change24h: parseFloat(ticker.priceChangePercent),
        volume24h: parseFloat(ticker.quoteVolume),
        marketCap: parseFloat(ticker.quoteVolume) * 1000000, // Approximate
        timestamp: Date.now()
      };
    });

    // Update cache
    priceCache = { prices, timestamp: Date.now() };

    return prices;
  } catch (error) {
    console.error('Binance API error:', error);
    throw error;
  }
}

/**
 * Fetch single price from Binance
 */
export async function fetchBinancePrice(symbol: string): Promise<BinancePrice | null> {
  const pair = SYMBOL_MAP[symbol];
  if (!pair) return null;

  try {
    const response = await fetch(`${BINANCE_API}/ticker/24hr?symbol=${pair}`);

    if (!response.ok) {
      return null;
    }

    const ticker = await response.json();

    return {
      symbol,
      price: parseFloat(ticker.lastPrice),
      change24h: parseFloat(ticker.priceChangePercent),
      volume24h: parseFloat(ticker.quoteVolume),
      marketCap: parseFloat(ticker.quoteVolume) * 1000000,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error(`Binance error for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get supported symbols
 */
export function getSupportedSymbols(): string[] {
  return Object.keys(SYMBOL_MAP);
}