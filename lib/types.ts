export interface CryptoPrice {
  id: string
  symbol: string
  name: string
  price: number
  change24h: number
  marketCap: number
  volume24h: number
  sparkline?: number[]
  lastUpdate: string
}

export interface TradingSignal {
  id: string
  symbol: string
  signal: "bullish" | "bearish" | "neutral"
  confidence: number // 0-100
  timeframe: string // e.g., "1H", "4H", "1D"
  reasons: string[]
  entryPrice?: number
  targets?: number[]
  stopLoss?: number
  timestamp: string
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
