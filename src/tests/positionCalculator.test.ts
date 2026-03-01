import { describe, it, expect, beforeEach } from 'vitest';
import { PositionCalculator } from '../services/positionCalculator.js';
import type { TradingSignal } from '../types/index.js';

describe('PositionCalculator', () => {
  let calculator: PositionCalculator;
  const defaultConfig = {
    accountBalance: 10000,
    maxRiskPerTrade: 2,
    maxLeverage: 10,
    minRiskReward: 2
  };

  beforeEach(() => {
    calculator = new PositionCalculator(defaultConfig);
  });

  describe('calculatePosition', () => {
    const mockBuySignal: TradingSignal = {
      symbol: 'BTC',
      action: 'BUY',
      confidence: 80,
      reasons: ['Strong uptrend', 'RSI shows momentum'],
      indicators: [],
      timestamp: Date.now()
    };

    const mockSellSignal: TradingSignal = {
      symbol: 'BTC',
      action: 'SELL',
      confidence: 75,
      reasons: ['Resistance level reached'],
      indicators: [],
      timestamp: Date.now()
    };

    const mockHoldSignal: TradingSignal = {
      symbol: 'BTC',
      action: 'HOLD',
      confidence: 50,
      reasons: ['Market consolidating'],
      indicators: [],
      timestamp: Date.now()
    };

    it('should calculate position size based on risk', () => {
      const currentPrice = 50000;
      const position = calculator.calculatePosition(mockBuySignal, currentPrice);

      expect(position.symbol).toBe('BTC');
      expect(position.action).toBe('BUY');
      expect(position.positionSize).toBeGreaterThan(0);
      expect(position.entryPrice).toBe(currentPrice);
    });

    it('should set correct stop loss for BUY signal', () => {
      const currentPrice = 50000;
      const stopLossPercent = 2;
      const position = calculator.calculatePosition(mockBuySignal, currentPrice, stopLossPercent);

      expect(position.stopLoss).toBeCloseTo(49000, 0);
    });

    it('should set correct stop loss for SELL signal', () => {
      const currentPrice = 50000;
      const stopLossPercent = 2;
      const position = calculator.calculatePosition(mockSellSignal, currentPrice, stopLossPercent);

      expect(position.stopLoss).toBeCloseTo(51000, 0);
    });

    it('should set correct target price for BUY signal', () => {
      const currentPrice = 50000;
      const targetPercent = 5;
      const position = calculator.calculatePosition(mockBuySignal, currentPrice, 2, targetPercent);

      expect(position.targetPrice).toBeCloseTo(52500, 0);
    });

    it('should set correct target price for SELL signal', () => {
      const currentPrice = 50000;
      const targetPercent = 5;
      const position = calculator.calculatePosition(mockSellSignal, currentPrice, 2, targetPercent);

      expect(position.targetPrice).toBeCloseTo(47500, 0);
    });

    it('should calculate margin required correctly', () => {
      const currentPrice = 50000;
      const position = calculator.calculatePosition(mockBuySignal, currentPrice);

      expect(position.marginRequired).toBeGreaterThan(0);
      expect(position.marginRequired).toBeLessThanOrEqual(defaultConfig.accountBalance);
    });

    it('should calculate risk-reward ratio correctly', () => {
      const currentPrice = 50000;
      const stopLossPercent = 2;
      const targetPercent = 5;
      const position = calculator.calculatePosition(mockBuySignal, currentPrice, stopLossPercent, targetPercent);

      const expectedRR = targetPercent / stopLossPercent;
      expect(position.riskReward).toBeCloseTo(expectedRR, 1);
    });

    it('should respect max leverage limit', () => {
      const currentPrice = 100; // Low price to test high leverage scenarios
      const position = calculator.calculatePosition(mockBuySignal, currentPrice);

      expect(position.leverage).toBeLessThanOrEqual(defaultConfig.maxLeverage);
    });

    it('should limit position size for high volatility scenarios', () => {
      const currentPrice = 50000;
      const tightStopLoss = 0.5; // Very tight stop loss
      const position = calculator.calculatePosition(mockBuySignal, currentPrice, tightStopLoss);

      const maxAllowed = (defaultConfig.accountBalance * defaultConfig.maxLeverage) / currentPrice;
      expect(position.positionSize).toBeLessThanOrEqual(maxAllowed);
    });

    it('should calculate risk amount correctly', () => {
      const currentPrice = 50000;
      const stopLossPercent = 2;
      const maxRisk = defaultConfig.accountBalance * (defaultConfig.maxRiskPerTrade / 100);
      const position = calculator.calculatePosition(mockBuySignal, currentPrice, stopLossPercent);

      const riskPerUnit = currentPrice - position.stopLoss;
      const totalRisk = riskPerUnit * position.positionSize;

      expect(totalRisk).toBeCloseTo(maxRisk, 0);
    });

    it('should handle HOLD signal', () => {
      const currentPrice = 50000;
      const position = calculator.calculatePosition(mockHoldSignal, currentPrice);

      expect(position.action).toBe('HOLD');
      expect(position.positionSize).toBeGreaterThanOrEqual(0);
    });

    it('should produce reasonable position sizes', () => {
      const currentPrice = 50000;
      const position = calculator.calculatePosition(mockBuySignal, currentPrice);

      // Position should not be zero or negative
      expect(position.positionSize).toBeGreaterThan(0);

      // Position should not exceed account
      const totalValue = position.positionSize * currentPrice;
      expect(totalValue).toBeLessThanOrEqual(defaultConfig.accountBalance * defaultConfig.maxLeverage);
    });

    it('should include timestamp', () => {
      const currentPrice = 50000;
      const beforeTime = Date.now();
      const position = calculator.calculatePosition(mockBuySignal, currentPrice);
      const afterTime = Date.now();

      expect(position.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(position.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('validatePosition', () => {
    it('should validate correct position', () => {
      const position = {
        symbol: 'BTC',
        action: 'BUY' as const,
        entryPrice: 50000,
        targetPrice: 52500,
        stopLoss: 49000,
        positionSize: 0.1,
        marginRequired: 5000,
        riskReward: 2.5,
        leverage: 5,
        timestamp: Date.now()
      };

      expect(calculator.validatePosition(position)).toBe(true);
    });

    it('should reject position exceeding account balance', () => {
      const position = {
        symbol: 'BTC',
        action: 'BUY' as const,
        entryPrice: 50000,
        targetPrice: 52500,
        stopLoss: 49000,
        positionSize: 1,
        marginRequired: 20000, // More than account balance
        riskReward: 2.5,
        leverage: 2,
        timestamp: Date.now()
      };

      expect(calculator.validatePosition(position)).toBe(false);
    });

    it('should reject position with excessive leverage', () => {
      const position = {
        symbol: 'BTC',
        action: 'BUY' as const,
        entryPrice: 50000,
        targetPrice: 52500,
        stopLoss: 49000,
        positionSize: 0.1,
        marginRequired: 5000,
        riskReward: 2.5,
        leverage: 15, // More than max leverage
        timestamp: Date.now()
      };

      expect(calculator.validatePosition(position)).toBe(false);
    });

    it('should reject position with poor risk-reward', () => {
      const position = {
        symbol: 'BTC',
        action: 'BUY' as const,
        entryPrice: 50000,
        targetPrice: 51000,
        stopLoss: 49000,
        positionSize: 0.1,
        marginRequired: 5000,
        riskReward: 1, // Less than min risk-reward
        leverage: 5,
        timestamp: Date.now()
      };

      expect(calculator.validatePosition(position)).toBe(false);
    });

    it('should accept position with minimum acceptable risk-reward', () => {
      const position = {
        symbol: 'BTC',
        action: 'BUY' as const,
        entryPrice: 50000,
        targetPrice: 52000,
        stopLoss: 49000,
        positionSize: 0.1,
        marginRequired: 5000,
        riskReward: 2, // Exactly min risk-reward
        leverage: 5,
        timestamp: Date.now()
      };

      expect(calculator.validatePosition(position)).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('should update account balance', () => {
      const newBalance = 20000;
      calculator.updateConfig({ accountBalance: newBalance });

      const currentPrice = 50000;
      const position = calculator.calculatePosition({
        symbol: 'BTC',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice);

      expect(position.marginRequired).toBeLessThanOrEqual(newBalance);
    });

    it('should update max risk per trade', () => {
      calculator.updateConfig({ maxRiskPerTrade: 5 });

      const currentPrice = 50000;
      const position = calculator.calculatePosition({
        symbol: 'BTC',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice);

      // Higher risk should allow larger position
      expect(position.positionSize).toBeGreaterThan(0);
    });

    it('should update max leverage', () => {
      calculator.updateConfig({ maxLeverage: 20 });

      const currentPrice = 100;
      const position = calculator.calculatePosition({
        symbol: 'BTC',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice);

      expect(position.leverage).toBeLessThanOrEqual(20);
    });

    it('should update min risk-reward', () => {
      calculator.updateConfig({ minRiskReward: 3 });

      const position = {
        symbol: 'BTC',
        action: 'BUY' as const,
        entryPrice: 50000,
        targetPrice: 52000,
        stopLoss: 49000,
        positionSize: 0.1,
        marginRequired: 5000,
        riskReward: 2.5, // Less than new min
        leverage: 5,
        timestamp: Date.now()
      };

      expect(calculator.validatePosition(position)).toBe(false);
    });

    it('should handle multiple config updates', () => {
      calculator.updateConfig({
        accountBalance: 15000,
        maxRiskPerTrade: 3,
        maxLeverage: 15
      });

      const currentPrice = 50000;
      const position = calculator.calculatePosition({
        symbol: 'BTC',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice);

      expect(position.marginRequired).toBeLessThanOrEqual(15000);
      expect(position.leverage).toBeLessThanOrEqual(15);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small prices', () => {
      const currentPrice = 0.01;
      const position = calculator.calculatePosition({
        symbol: 'SHITCOIN',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice);

      expect(position.positionSize).toBeGreaterThan(0);
      expect(position.entryPrice).toBe(currentPrice);
    });

    it('should handle very large prices', () => {
      const currentPrice = 1000000;
      const position = calculator.calculatePosition({
        symbol: 'EXPENSIVE',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice);

      expect(position.positionSize).toBeGreaterThanOrEqual(0);
      expect(position.entryPrice).toBe(currentPrice);
    });

    it('should handle zero stop loss percentage', () => {
      const currentPrice = 50000;
      const position = calculator.calculatePosition({
        symbol: 'BTC',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice, 0);

      expect(position.stopLoss).toBe(currentPrice);
    });

    it('should handle very small stop loss percentage', () => {
      const currentPrice = 50000;
      const stopLossPercent = 0.1;
      const position = calculator.calculatePosition({
        symbol: 'BTC',
        action: 'BUY',
        confidence: 80,
        reasons: [],
        indicators: [],
        timestamp: Date.now()
      }, currentPrice, stopLossPercent);

      expect(position.stopLoss).toBeCloseTo(49950, 0);
    });
  });
});
