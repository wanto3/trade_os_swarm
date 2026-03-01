import type { PositionRecommendation, TradingSignal } from '@/src/types';

export interface PositionCalculatorConfig {
  accountBalance: number;
  maxRiskPerTrade: number; // Percentage
  maxLeverage: number;
  minRiskReward: number;
}

let config: PositionCalculatorConfig = {
  accountBalance: 10000,
  maxRiskPerTrade: 2,
  maxLeverage: 10,
  minRiskReward: 2
};

export function getPositionConfig(): PositionCalculatorConfig {
  return { ...config };
}

export function updatePositionConfig(newConfig: Partial<PositionCalculatorConfig>): void {
  config = { ...config, ...newConfig };
}

export function calculatePosition(
  signal: TradingSignal,
  currentPrice: number,
  stopLossPercent: number = 2,
  targetPercent: number = 5
): PositionRecommendation {
  const riskAmount = config.accountBalance * (config.maxRiskPerTrade / 100);

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

  const maxPositionSize = (config.accountBalance * config.maxLeverage) / currentPrice;
  positionSize = Math.min(positionSize, maxPositionSize);

  const totalValue = positionSize * currentPrice;
  leverage = totalValue / config.accountBalance;
  leverage = Math.min(leverage, config.maxLeverage);

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

export function validatePosition(recommendation: PositionRecommendation): boolean {
  if (recommendation.marginRequired > config.accountBalance) {
    return false;
  }

  if (recommendation.leverage > config.maxLeverage) {
    return false;
  }

  if (recommendation.riskReward < config.minRiskReward) {
    return false;
  }

  return true;
}
