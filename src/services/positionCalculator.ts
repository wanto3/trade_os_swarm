import type { PositionRecommendation, TradingSignal } from '../types/index.js';

export interface PositionCalculatorConfig {
  accountBalance: number;
  maxRiskPerTrade: number; // Percentage
  maxLeverage: number;
  minRiskReward: number;
}

export class PositionCalculator {
  private config: PositionCalculatorConfig;

  constructor(config: PositionCalculatorConfig) {
    this.config = config;
  }

  calculatePosition(
    signal: TradingSignal,
    currentPrice: number,
    stopLossPercent: number = 2,
    targetPercent: number = 5
  ): PositionRecommendation {
    const riskAmount = this.config.accountBalance * (this.config.maxRiskPerTrade / 100);

    let positionSize: number;
    let leverage: number;
    let entryPrice = currentPrice;
    let stopLoss: number;
    let targetPrice: number;

    if (signal.action === 'BUY') {
      stopLoss = currentPrice * (1 - stopLossPercent / 100);
      targetPrice = currentPrice * (1 + targetPercent / 100);
    } else if (signal.action === 'SELL') {
      stopLoss = currentPrice * (1 + stopLossPercent / 100);
      targetPrice = currentPrice * (1 - targetPercent / 100);
    } else {
      stopLoss = currentPrice * (1 - stopLossPercent / 100);
      targetPrice = currentPrice * (1 + targetPercent / 100);
    }

    const riskPerUnit = Math.abs(currentPrice - stopLoss);
    positionSize = riskAmount / riskPerUnit;

    const maxPositionSize = (this.config.accountBalance * this.config.maxLeverage) / currentPrice;
    positionSize = Math.min(positionSize, maxPositionSize);

    const totalValue = positionSize * currentPrice;
    leverage = totalValue / this.config.accountBalance;
    leverage = Math.min(leverage, this.config.maxLeverage);

    const marginRequired = totalValue / leverage;
    const riskReward = Math.abs(targetPrice - currentPrice) / Math.abs(currentPrice - stopLoss);

    return {
      symbol: signal.symbol,
      action: signal.action,
      entryPrice,
      targetPrice,
      stopLoss,
      positionSize: Math.floor(positionSize * 100) / 100,
      marginRequired: Math.floor(marginRequired * 100) / 100,
      riskReward: Math.floor(riskReward * 100) / 100,
      leverage: Math.floor(leverage * 10) / 10,
      timestamp: Date.now()
    };
  }

  validatePosition(recommendation: PositionRecommendation): boolean {
    if (recommendation.marginRequired > this.config.accountBalance) {
      return false;
    }

    if (recommendation.leverage > this.config.maxLeverage) {
      return false;
    }

    if (recommendation.riskReward < this.config.minRiskReward) {
      return false;
    }

    return true;
  }

  updateConfig(newConfig: Partial<PositionCalculatorConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
