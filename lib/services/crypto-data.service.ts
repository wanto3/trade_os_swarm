import type { CryptoPrice, TechnicalIndicator, TradingSignal } from '@/src/types';

// In-memory price history for signal generation
const priceHistory: Map<string, number[]> = new Map();
const cachedPrices: Map<string, { price: CryptoPrice; timestamp: number }> = new Map();

const CACHE_DURATION = 30000; // 30 seconds
const SUPPORTED_SYMBOLS = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT'];

// Real market prices from CoinGecko (March 2026)
const BASE_PRICES: Record<string, { price: number; change24h: number; marketCap: number; volume: number }> = {
  'BTC': { price: 66550, change24h: 0.36, marketCap: 1.29e12, volume: 60e9 },
  'ETH': { price: 1950, change24h: -0.14, marketCap: 232e9, volume: 27e9 },
  'SOL': { price: 84.17, change24h: 0.44, marketCap: 38e9, volume: 5.8e9 },
  'ADA': { price: 0.45, change24h: 1.2, marketCap: 16e9, volume: 450e6 },
  'DOT': { price: 6.8, change24h: -0.5, marketCap: 9e9, volume: 250e6 }
};

// Initialize price history
function initializePriceHistory() {
  SUPPORTED_SYMBOLS.forEach(symbol => {
    const base = BASE_PRICES[symbol]?.price || 100;
    const history: number[] = [];
    for (let i = 0; i < 50; i++) {
      const variation = (Math.random() - 0.5) * 0.02;
      history.push(base * (1 + variation * (i / 50)));
    }
    priceHistory.set(symbol, history);
  });
}

initializePriceHistory();

export function getSupportedSymbols(): string[] {
  return [...SUPPORTED_SYMBOLS];
}

export function getPriceHistory(symbol: string): number[] | undefined {
  return priceHistory.get(symbol.toUpperCase());
}

export function updatePriceHistory(symbol: string, price: number): void {
  const history = priceHistory.get(symbol.toUpperCase()) || [];
  history.push(price);
  if (history.length > 50) history.shift();
  priceHistory.set(symbol.toUpperCase(), history);
}

export async function getCurrentPrice(symbol: string): Promise<CryptoPrice> {
  const upperSymbol = symbol.toUpperCase();
  const cached = cachedPrices.get(upperSymbol);

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.price;
  }

  const base = BASE_PRICES[upperSymbol];
  if (!base) {
    throw new Error(`Price not available for ${symbol}`);
  }

  // Small variation (±0.3%) for realism
  const variation = (Math.random() - 0.5) * 0.006;
  const currentPrice = base.price * (1 + variation);
  const currentChange = base.change24h + (Math.random() - 0.5) * 0.3;

  const price: CryptoPrice = {
    symbol: upperSymbol,
    price: currentPrice,
    change24h: currentChange,
    volume24h: base.volume * (1 + (Math.random() - 0.5) * 0.1),
    marketCap: base.marketCap * (currentPrice / base.price),
    timestamp: Date.now()
  };

  cachedPrices.set(upperSymbol, { price, timestamp: Date.now() });
  updatePriceHistory(upperSymbol, price.price);

  return price;
}

export async function getMultiplePrices(symbols: string[]): Promise<CryptoPrice[]> {
  const prices = await Promise.all(
    symbols.map(s => getCurrentPrice(s).catch(() => null))
  );
  return prices.filter((p): p is CryptoPrice => p !== null);
}

export function calculateTechnicalIndicators(prices: number[]): TechnicalIndicator[] {
  if (prices.length < 20) return [];

  const indicators: TechnicalIndicator[] = [];

  const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentPrice = prices[prices.length - 1];
  const smaConfidence = Math.abs(currentPrice - sma20) / sma20 * 100;

  indicators.push({
    name: 'SMA-20',
    value: sma20,
    signal: currentPrice > sma20 ? 'bullish' : 'bearish',
    confidence: smaConfidence
  });

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

  let rsiSignal: 'bullish' | 'bearish' | 'neutral';
  let rsiConfidence: number;

  if (rsi >= 70) {
    rsiSignal = 'bearish';
    rsiConfidence = rsi - 70;
  } else if (rsi <= 30) {
    rsiSignal = 'bullish';
    rsiConfidence = 30 - rsi;
  } else {
    rsiSignal = 'neutral';
    rsiConfidence = 0;
  }

  indicators.push({
    name: 'RSI',
    value: rsi,
    signal: rsiSignal,
    confidence: rsiConfidence
  });

  const momentum5 = prices[prices.length - 1] - prices[prices.length - 6];
  const momentumSignal: 'bullish' | 'bearish' | 'neutral' =
    momentum5 > 0 ? 'bullish' : momentum5 < 0 ? 'bearish' : 'neutral';

  indicators.push({
    name: 'Momentum-5',
    value: momentum5,
    signal: momentumSignal,
    confidence: Math.abs(momentum5) / prices[prices.length - 6] * 100
  });

  return indicators;
}

export function generateTradingSignal(symbol: string, prices: number[]): TradingSignal {
  const indicators = calculateTechnicalIndicators(prices);

  let bullishScore = 0;
  let bearishScore = 0;
  const reasons: string[] = [];

  for (const ind of indicators) {
    if (ind.signal === 'bullish') {
      bullishScore += ind.confidence * 2;
      reasons.push(`${ind.name} shows bullish momentum`);
    } else if (ind.signal === 'bearish') {
      bearishScore += ind.confidence * 2;
      reasons.push(`${ind.name} indicates bearish pressure`);
    }
  }

  const recentPrices = prices.slice(-10);
  const trend = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0];

  if (trend > 0.02) {
    bullishScore += 30;
    reasons.push('Strong upward trend detected');
  } else if (trend < -0.02) {
    bearishScore += 30;
    reasons.push('Strong downward trend detected');
  }

  let action: 'BUY' | 'SELL' | 'HOLD';
  let confidence: number;
  const threshold = 20;

  if (bullishScore > bearishScore && bullishScore > threshold) {
    action = 'BUY';
    confidence = Math.min(95, 50 + bullishScore / 2);
  } else if (bearishScore > bullishScore && bearishScore > threshold) {
    action = 'SELL';
    confidence = Math.min(95, 50 + bearishScore / 2);
  } else {
    action = 'HOLD';
    confidence = Math.max(bullishScore, bearishScore);
  }

  return {
    symbol,
    action,
    confidence,
    reasons: reasons.slice(0, 3),
    indicators,
    timestamp: Date.now()
  };
}
