/**
 * RSI Momentum
 * Momentum strategy using RSI oversold/overbought with trend confirmation
 *
 * Type: momentum
 * Timeframes: 1h, 4h
 */

export interface StrategyConfig {
  name: string;
  type: 'momentum';
  timeframes: string[];
  indicators: string[];
}

export const rSIMomentumStrategy: StrategyConfig = {
  name: 'RSI Momentum',
  type: 'momentum',
  timeframes: ["1h","4h"],
  indicators: ["RSI","EMA","MACD"]
};

export interface StrategyRules {
  entry: string[];
  exit: string[];
  riskManagement: {
    stopLoss: string;
    takeProfit: string;
    positionSizing: string;
  };
}

export const rSIMomentumRules: StrategyRules = {
  entry: [
  "RSI below 30 (oversold) in uptrend",
  "Price above EMA 200",
  "MACD histogram turning positive"
],
  exit: [
  "RSI above 70 (overbought)",
  "Price crosses below EMA 50",
  "Stop loss hit"
],
  riskManagement: {
    stopLoss: '2%',
    takeProfit: '4%',
    positionSizing: '1% of capital'
  }
};
