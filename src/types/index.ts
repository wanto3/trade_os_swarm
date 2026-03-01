// Core types for the crypto trading application

export interface CryptoPrice {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  timestamp: number;
}

export interface TechnicalIndicator {
  name: string;
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
}

export interface TradingSignal {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reasons: string[];
  indicators: TechnicalIndicator[];
  timestamp: number;
}

export interface PositionRecommendation {
  symbol: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  positionSize: number;
  marginRequired: number;
  riskReward: number;
  leverage: number;
  timestamp: number;
}

export interface MarketSentiment {
  overall: 'bullish' | 'bearish' | 'neutral';
  score: number;
  factors: {
    fearAndGreed: number;
    trendStrength: number;
    volume: number;
    volatility: number;
  };
}

export interface WebSocketMessage {
  type: 'price' | 'signal' | 'sentiment' | 'error';
  data: any;
  timestamp: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}
