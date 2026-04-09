export interface CryptoPrice {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  marketCap: number
  timestamp: number
}

export interface TechnicalIndicator {
  name: string
  value: number
  signal: 'bullish' | 'bearish' | 'neutral'
  confidence: number
}

export interface TradingSignal {
  symbol: string
  action: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reasons: string[]
  indicators: TechnicalIndicator[]
  timestamp: number
}

export interface Position {
  id: string
  symbol: string
  type: "long" | "short"
  size: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercentage: number
  leverage: number
  marginUsed: number
  liquidationPrice: number
  openedAt: string
}

export interface NewsItem {
  id: string
  title: string
  source: string
  impact: "high" | "medium" | "low"
  timestamp: string
  url?: string
  relatedSymbols?: string[]
}

export interface AccountSummary {
  totalBalance: number
  availableMargin: number
  usedMargin: number
  unrealizedPnl: number
  dailyPnl: number
  dailyPnlPercentage: number
}
