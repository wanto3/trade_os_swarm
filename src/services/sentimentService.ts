import type { MarketSentiment } from '../types/index.js';

export interface PriceData {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
}

export class SentimentService {
  private priceHistory: Map<string, number[]> = new Map();

  updatePriceHistory(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol)!;
    history.push(price);

    // Keep last 50 prices
    if (history.length > 50) {
      history.shift();
    }
  }

  calculateSentiment(prices: PriceData[]): MarketSentiment {
    if (prices.length === 0) {
      return {
        overall: 'neutral',
        score: 50,
        factors: {
          fearAndGreed: 50,
          trendStrength: 50,
          volume: 50,
          volatility: 50
        }
      };
    }

    // Fear & Greed Index (0-100, higher = more greedy)
    const fearAndGreed = this.calculateFearAndGreed(prices);

    // Trend Strength (0-100)
    const trendStrength = this.calculateTrendStrength(prices);

    // Volume Score (0-100)
    const volume = this.calculateVolumeScore(prices);

    // Volatility Score (0-100)
    const volatility = this.calculateVolatilityScore(prices);

    // Overall sentiment score
    const score = Math.round(
      (100 - fearAndGreed) * 0.3 +  // Invert fear/greed (high fear = low score)
      trendStrength * 0.4 +
      volume * 0.15 +
      (100 - volatility) * 0.15  // Lower volatility = better
    );

    let overall: 'bullish' | 'bearish' | 'neutral';
    if (score >= 65) {
      overall = 'bullish';
    } else if (score <= 35) {
      overall = 'bearish';
    } else {
      overall = 'neutral';
    }

    return {
      overall,
      score: Math.max(0, Math.min(100, score)),
      factors: {
        fearAndGreed,
        trendStrength,
        volume,
        volatility
      }
    };
  }

  private calculateFearAndGreed(prices: PriceData[]): number {
    if (prices.length < 2) return 50;

    // Calculate average 24h change
    const avgChange = prices.reduce((sum, p) => sum + Math.abs(p.change24h), 0) / prices.length;

    // Calculate percentage of cryptos with positive change
    const positiveCount = prices.filter(p => p.change24h > 0).length;
    const positiveRatio = positiveCount / prices.length;

    // Combine factors (0-100 scale, higher = more greedy)
    let score = 50;

    // Positive momentum adds to greed
    if (positiveRatio > 0.5) {
      score += (positiveRatio - 0.5) * 100;
    } else {
      score -= (0.5 - positiveRatio) * 100;
    }

    // High volatility increases fear
    if (avgChange > 10) {
      score -= 20;
    } else if (avgChange < 3) {
      score += 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private calculateTrendStrength(prices: PriceData[]): number {
    if (prices.length < 2) return 50;

    // Percentage of cryptos with positive change
    const positiveCount = prices.filter(p => p.change24h > 0).length;
    const ratio = positiveCount / prices.length;

    return Math.round(ratio * 100);
  }

  private calculateVolumeScore(prices: PriceData[]): number {
    if (prices.length === 0) return 50;

    const totalVolume = prices.reduce((sum, p) => sum + p.volume24h, 0);
    const avgVolume = totalVolume / prices.length;

    // Normalize score (higher volume = higher score)
    // Assuming $500M average volume is "high" (100)
    return Math.min(100, Math.round((avgVolume / 500_000_000) * 100));
  }

  private calculateVolatilityScore(prices: PriceData[]): number {
    if (prices.length < 2) return 50;

    const changes = prices.map(p => Math.abs(p.change24h));
    const avgVolatility = changes.reduce((sum, c) => sum + c, 0) / changes.length;

    // Higher volatility = higher score (0-100)
    return Math.min(100, Math.round(avgVolatility * 3));
  }

  getHistoricalVolatility(symbol: string, periods: number = 20): number | null {
    const history = this.priceHistory.get(symbol);

    if (!history || history.length < periods) {
      return null;
    }

    const recentPrices = history.slice(-periods);
    const returns: number[] = [];

    for (let i = 1; i < recentPrices.length; i++) {
      returns.push((recentPrices[i] - recentPrices[i - 1]) / recentPrices[i - 1]);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance) * Math.sqrt(365); // Annualized volatility
  }
}
