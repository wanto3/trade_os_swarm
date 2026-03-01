import axios from 'axios';
import type { CryptoPrice, TechnicalIndicator, TradingSignal } from '../types/index.js';

export class CryptoDataService {
  private apiKey: string;
  private baseUrl: string;
  private priceCache: Map<string, CryptoPrice>;
  private subscribers: Map<string, Set<(price: CryptoPrice) => void>>;

  constructor(apiKey: string = '') {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.coingecko.com/api/v3';
    this.priceCache = new Map();
    this.subscribers = new Map();
  }

  async getCurrentPrice(symbol: string): Promise<CryptoPrice> {
    try {
      // In production, use real API
      // For testing, we can return mock data
      return this.getMockPrice(symbol);
    } catch (error) {
      throw new Error(`Failed to fetch price for ${symbol}: ${error}`);
    }
  }

  async getMultiplePrices(symbols: string[]): Promise<CryptoPrice[]> {
    const prices = await Promise.all(
      symbols.map(s => this.getCurrentPrice(s))
    );
    return prices;
  }

  subscribeToPrice(symbol: string, callback: (price: CryptoPrice) => void): () => void {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
    }
    this.subscribers.get(symbol)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(symbol)?.delete(callback);
    };
  }

  notifySubscribers(symbol: string, price: CryptoPrice): void {
    this.subscribers.get(symbol)?.forEach(callback => callback(price));
  }

  getMockPrice(symbol: string): CryptoPrice {
    const basePrices: Record<string, number> = {
      'bitcoin': 67500,
      'ethereum': 3450,
      'solana': 145,
      'cardano': 0.55,
      'polkadot': 7.25
    };

    const basePrice = basePrices[symbol.toLowerCase()] || 100;
    const randomChange = (Math.random() - 0.5) * 0.02; // ±1% variation
    const price = basePrice * (1 + randomChange);

    return {
      symbol: symbol.toUpperCase(),
      price,
      change24h: (Math.random() - 0.5) * 10,
      volume24h: Math.random() * 1000000000,
      marketCap: price * (Math.random() * 20000000),
      timestamp: Date.now()
    };
  }

  calculateTechnicalIndicators(prices: number[]): TechnicalIndicator[] {
    if (prices.length < 20) return [];

    const indicators: TechnicalIndicator[] = [];

    // Simple Moving Average (SMA)
    const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const currentPrice = prices[prices.length - 1];
    const smaConfidence = Math.abs(currentPrice - sma20) / sma20 * 100;

    indicators.push({
      name: 'SMA-20',
      value: sma20,
      signal: currentPrice > sma20 ? 'bullish' : 'bearish',
      confidence: smaConfidence
    });

    // RSI (Relative Strength Index) - simplified
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

    // Momentum indicator
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

  generateTradingSignal(symbol: string, prices: number[]): TradingSignal {
    const indicators = this.calculateTechnicalIndicators(prices);

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

    // Calculate trend strength
    const recentPrices = prices.slice(-10);
    const trend = (recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0];
    
    if (trend > 0.02) { // Strong uptrend
      bullishScore += 30;
      reasons.push('Strong upward trend detected');
    } else if (trend < -0.02) { // Strong downtrend
      bearishScore += 30;
      reasons.push('Strong downward trend detected');
    }

    let action: 'BUY' | 'SELL' | 'HOLD';
    let confidence: number;

    const threshold = 20; // Lower threshold for more responsive signals

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
}
