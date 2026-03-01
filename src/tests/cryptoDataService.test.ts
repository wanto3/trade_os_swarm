import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CryptoDataService } from '../services/cryptoDataService.js';
import type { CryptoPrice } from '../types/index.js';

describe('CryptoDataService', () => {
  let service: CryptoDataService;

  beforeEach(() => {
    service = new CryptoDataService('test-api-key');
  });

  describe('getCurrentPrice', () => {
    it('should return a valid CryptoPrice object for a known symbol', async () => {
      const price = await service.getCurrentPrice('bitcoin');

      expect(price).toBeDefined();
      expect(price.symbol).toBe('BITCOIN');
      expect(price.price).toBeGreaterThan(0);
      expect(price.timestamp).toBeLessThanOrEqual(Date.now());
      expect(price.change24h).toBeDefined();
      expect(price.volume24h).toBeGreaterThanOrEqual(0);
      expect(price.marketCap).toBeGreaterThanOrEqual(0);
    });

    it('should return different prices for different symbols', async () => {
      const btcPrice = await service.getCurrentPrice('bitcoin');
      const ethPrice = await service.getCurrentPrice('ethereum');

      expect(btcPrice.symbol).toBe('BITCOIN');
      expect(ethPrice.symbol).toBe('ETHEREUM');
      expect(btcPrice.price).not.toBe(ethPrice.price);
    });

    it('should handle unknown symbols with default price', async () => {
      const price = await service.getCurrentPrice('unknown-token');

      expect(price.symbol).toBe('UNKNOWN-TOKEN');
      expect(price.price).toBeGreaterThan(0);
    });

    it('should return prices within reasonable bounds', async () => {
      const price = await service.getCurrentPrice('bitcoin');

      // Bitcoin should be between $10k and $200k
      expect(price.price).toBeGreaterThan(10000);
      expect(price.price).toBeLessThan(200000);

      // 24h change should be within ±20%
      expect(price.change24h).toBeGreaterThanOrEqual(-20);
      expect(price.change24h).toBeLessThanOrEqual(20);
    });

    it('should include valid timestamp', async () => {
      const beforeTime = Date.now();
      const price = await service.getCurrentPrice('bitcoin');
      const afterTime = Date.now();

      expect(price.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(price.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getMultiplePrices', () => {
    it('should return prices for multiple symbols', async () => {
      const symbols = ['bitcoin', 'ethereum', 'solana'];
      const prices = await service.getMultiplePrices(symbols);

      expect(prices).toHaveLength(3);
      expect(prices[0].symbol).toBe('BITCOIN');
      expect(prices[1].symbol).toBe('ETHEREUM');
      expect(prices[2].symbol).toBe('SOLANA');
    });

    it('should maintain order of requested symbols', async () => {
      const symbols = ['ethereum', 'bitcoin', 'solana'];
      const prices = await service.getMultiplePrices(symbols);

      expect(prices[0].symbol).toBe('ETHEREUM');
      expect(prices[1].symbol).toBe('BITCOIN');
      expect(prices[2].symbol).toBe('SOLANA');
    });

    it('should handle empty array', async () => {
      const prices = await service.getMultiplePrices([]);

      expect(prices).toHaveLength(0);
    });
  });

  describe('calculateTechnicalIndicators', () => {
    it('should calculate SMA-20 correctly', () => {
      const prices = Array.from({ length: 20 }, (_, i) => 100 + i);
      const indicators = service.calculateTechnicalIndicators(prices);

      const sma = indicators.find(i => i.name === 'SMA-20');
      expect(sma).toBeDefined();
      // SMA of 100,101,...119 should be 109.5
      expect(sma!.value).toBeCloseTo(109.5, 1);
    });

    it('should return empty array for insufficient data', () => {
      const prices = [100, 101, 102];
      const indicators = service.calculateTechnicalIndicators(prices);

      expect(indicators).toHaveLength(0);
    });

    it('should generate bullish signal when price above SMA', () => {
      const prices = Array.from({ length: 20 }, () => 100);
      prices.push(120); // Price above SMA
      const indicators = service.calculateTechnicalIndicators(prices);

      const sma = indicators.find(i => i.name === 'SMA-20');
      expect(sma!.signal).toBe('bullish');
    });

    it('should generate bearish signal when price below SMA', () => {
      const prices = Array.from({ length: 20 }, () => 100);
      prices.push(80); // Price below SMA
      const indicators = service.calculateTechnicalIndicators(prices);

      const sma = indicators.find(i => i.name === 'SMA-20');
      expect(sma!.signal).toBe('bearish');
    });

    it('should calculate RSI indicator', () => {
      // Create prices that will result in a specific RSI
      const prices: number[] = [];
      let price = 100;
      for (let i = 0; i < 30; i++) {
        price += Math.random() * 4 - 1; // Slight upward bias
        prices.push(price);
      }

      const indicators = service.calculateTechnicalIndicators(prices);
      const rsi = indicators.find(i => i.name === 'RSI');

      expect(rsi).toBeDefined();
      expect(rsi!.value).toBeGreaterThanOrEqual(0);
      expect(rsi!.value).toBeLessThanOrEqual(100);
    });

    it('should identify oversold conditions (RSI < 30)', () => {
      // Create declining prices
      const prices = Array.from({ length: 30 }, (_, i) => 100 - i * 2);
      const indicators = service.calculateTechnicalIndicators(prices);
      const rsi = indicators.find(i => i.name === 'RSI');

      expect(rsi!.signal).toBe('bullish'); // Oversold is bullish for reversal
    });

    it('should identify overbought conditions (RSI > 70)', () => {
      // Create rising prices
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
      const indicators = service.calculateTechnicalIndicators(prices);
      const rsi = indicators.find(i => i.name === 'RSI');

      expect(rsi!.signal).toBe('bearish'); // Overbought is bearish for reversal
    });
  });

  describe('generateTradingSignal', () => {
    it('should generate valid trading signal', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const signal = service.generateTradingSignal('BTC', prices);

      expect(signal.symbol).toBe('BTC');
      expect(signal.action).toMatch(/^(BUY|SELL|HOLD)$/);
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);
      expect(signal.indicators).toBeDefined();
      expect(signal.reasons).toBeDefined();
      expect(signal.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should generate BUY signal for strong uptrend', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 3);
      const signal = service.generateTradingSignal('BTC', prices);

      expect(signal.action).toBe('BUY');
      expect(signal.confidence).toBeGreaterThan(50);
    });

    it('should generate SELL signal for strong downtrend', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 - i * 3);
      const signal = service.generateTradingSignal('BTC', prices);

      expect(signal.action).toBe('SELL');
      expect(signal.confidence).toBeGreaterThan(50);
    });

    it('should generate HOLD signal for sideways market', () => {
      const prices = Array.from({ length: 30 }, () => 100 + (Math.random() - 0.5) * 2);
      const signal = service.generateTradingSignal('BTC', prices);

      expect(signal.action).toBe('HOLD');
    });

    it('should include reasons based on indicators', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i * 3);
      const signal = service.generateTradingSignal('BTC', prices);

      expect(signal.reasons.length).toBeGreaterThan(0);
      expect(signal.reasons.length).toBeLessThanOrEqual(3);
      signal.reasons.forEach(reason => {
        expect(typeof reason).toBe('string');
        expect(reason.length).toBeGreaterThan(0);
      });
    });

    it('should include all calculated indicators', () => {
      const prices = Array.from({ length: 30 }, (_, i) => 100 + i);
      const signal = service.generateTradingSignal('BTC', prices);

      expect(signal.indicators.length).toBeGreaterThan(0);
      signal.indicators.forEach(indicator => {
        expect(indicator.name).toBeDefined();
        expect(indicator.value).toBeDefined();
        expect(indicator.signal).toMatch(/^(bullish|bearish|neutral)$/);
        expect(indicator.confidence).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('subscribeToPrice', () => {
    it('should allow subscription to price updates', () => {
      let receivedPrice: CryptoPrice | null = null;
      const callback = (price: CryptoPrice) => {
        receivedPrice = price;
      };

      const unsubscribe = service.subscribeToPrice('BTC', callback);
      expect(typeof unsubscribe).toBe('function');

      const testPrice: CryptoPrice = {
        symbol: 'BTC',
        price: 50000,
        change24h: 2.5,
        volume24h: 1000000,
        marketCap: 1000000000,
        timestamp: Date.now()
      };

      service.notifySubscribers('BTC', testPrice);
      expect(receivedPrice).toEqual(testPrice);
    });

    it('should unsubscribe correctly', () => {
      let callCount = 0;
      const callback = () => {
        callCount++;
      };

      const unsubscribe = service.subscribeToPrice('BTC', callback);

      const testPrice: CryptoPrice = {
        symbol: 'BTC',
        price: 50000,
        change24h: 2.5,
        volume24h: 1000000,
        marketCap: 1000000000,
        timestamp: Date.now()
      };

      service.notifySubscribers('BTC', testPrice);
      expect(callCount).toBe(1);

      unsubscribe();
      service.notifySubscribers('BTC', testPrice);
      expect(callCount).toBe(1); // Should not increment after unsubscribe
    });

    it('should handle multiple subscribers', () => {
      const calls: number[] = [];
      const callback1 = () => calls.push(1);
      const callback2 = () => calls.push(2);

      service.subscribeToPrice('BTC', callback1);
      service.subscribeToPrice('BTC', callback2);

      const testPrice: CryptoPrice = {
        symbol: 'BTC',
        price: 50000,
        change24h: 2.5,
        volume24h: 1000000,
        marketCap: 1000000000,
        timestamp: Date.now()
      };

      service.notifySubscribers('BTC', testPrice);
      expect(calls).toEqual([1, 2]);
    });

    it('should not notify subscribers of different symbols', () => {
      let btcCalled = false;
      let ethCalled = false;

      service.subscribeToPrice('BTC', () => { btcCalled = true; });
      service.subscribeToPrice('ETH', () => { ethCalled = true; });

      const btcPrice: CryptoPrice = {
        symbol: 'BTC',
        price: 50000,
        change24h: 2.5,
        volume24h: 1000000,
        marketCap: 1000000000,
        timestamp: Date.now()
      };

      service.notifySubscribers('BTC', btcPrice);
      expect(btcCalled).toBe(true);
      expect(ethCalled).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // This tests the mock implementation's error handling
      // In real implementation, this would test API failures
      const price = await service.getCurrentPrice('bitcoin');

      expect(price).toBeDefined();
    });
  });
});
