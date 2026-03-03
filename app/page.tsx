"use client"

import { useState, useEffect } from "react"
import {
  Activity, TrendingUp, TrendingDown, Target, Shield, AlertTriangle,
  Calculator, Wallet, Zap, ArrowUpRight, ArrowDownRight, Minus,
  Settings, Sliders, PieChart, LineChart, Crosshair, Newspaper,
  BarChart3, Flame, Droplets, Globe, Coins, Layers, Eye,
  Volume2, Signal, Gauge, Waves, GitBranch, Clock, Sparkles,
  CheckCircle, XCircle, AlertCircle, Info
} from "lucide-react"

// Account settings
const ACCOUNT_SETTINGS = {
  balance: 365,
  maxRiskPerTrade: 2,
  maxDrawdown: 10,
  maxLeverage: 10,
  defaultLeverage: 5,
  stopLossBuffer: 0.2,
  takeProfitRatio: 2,
}

// Mock real-time data with all indicators (will be replaced by real data from API)
const generateMarketData = () => ({
  // BTC Data - Real prices from CoinGecko
  BTC: {
    price: 66550,
    change24h: 0.36,
    volume: "60.4B",
    // Technical Indicators
    rsi: 51.8,
    macd: { value: 2.4, signal: 1.9, histogram: 0.5 },
    bollingerBands: { upper: 69212, middle: 66550, lower: 63888, squeeze: true },
    adx: 16.8,
    atr: 998.25,
    stochastic: { k: 51.1, d: 46 },
    obv: "60.4B",
    ema: { ema9: 66597.8, ema21: 66579.87, ema50: 66569.92 },
    support: [65884.5, 63222.5, 61226],
    resistance: [67215.5, 69877.5, 71874],
    trend: "NEUTRAL",
  },
  // ETH Data
  ETH: {
    price: 1950.27,
    change24h: -0.14,
    volume: "27.0B",
    rsi: 49.3,
    macd: { value: 0, signal: 0, histogram: 0 },
    bollingerBands: { upper: 2028.28, middle: 1950.27, lower: 1872.26, squeeze: true },
    adx: 15.7,
    atr: 29.25,
    stochastic: { k: 49.6, d: 44.6 },
    obv: "27.0B",
    ema: { ema9: 1949.73, ema21: 1949.93, ema50: 1950.05 },
    support: [1930.77, 1852.76, 1794.25],
    resistance: [1969.77, 2047.78, 2106.29],
    trend: "NEUTRAL",
  },
  // SOL Data
  SOL: {
    price: 84.17,
    change24h: 0.44,
    volume: "5.79B",
    rsi: 52.2,
    macd: { value: 0, signal: 0, histogram: 0 },
    bollingerBands: { upper: 87.54, middle: 84.17, lower: 80.8, squeeze: true },
    adx: 17.2,
    atr: 1.26,
    stochastic: { k: 51.3, d: 46.2 },
    obv: "6M",
    ema: { ema9: 84.24, ema21: 84.22, ema50: 84.2 },
    support: [83.33, 79.96, 77.44],
    resistance: [85.01, 88.38, 90.9],
    trend: "NEUTRAL",
  },
})

// Market overview data
const marketOverview = {
  fearAndGreed: { value: 72, label: "Greed", change: 5 },
  btcDominance: { value: 56.8, change: 0.3 },
  totalMarketCap: { value: "3.42T", change: 2.1 },
  fundingRates: {
    BTC: { rate: 0.012, status: "positive" },
    ETH: { rate: 0.008, status: "positive" },
    SOL: { rate: -0.005, status: "negative" },
  },
  openInterest: { value: "28.5B", change: 3.2 },
  liquidationHeatmap: [
    { price: 63223, amount: "450M" },
    { price: 61226, amount: "890M" },
    { price: 68547, amount: "620M" },
    { price: 70543, amount: "1.2B" },
  ],
}

// News is now fetched in real-time from /api/news (CoinDesk, Cointelegraph, CryptoSlate RSS feeds)

// Portfolio state
const portfolioData = {
  positions: [
    {
      symbol: "BTC-PERP",
      side: "LONG",
      size: 0.005,
      entryPrice: 82500,
      currentPrice: 84752,
      leverage: 5,
      unrealizedPnl: 11.25,
      pnlPercent: 3.07,
      liquidationPrice: 66000,
    },
  ],
  totalUnrealizedPnl: 11.25,
  totalUnrealizedPnlPercent: 3.08,
  totalMarginUsed: 82.50,
  freeMargin: 282.50,
  totalRiskExposure: 22.5,
}

// 🌙 ASTRONACCI CALCULATION - Astrological + Fibonacci Analysis
const calculateAstronacci = () => {
  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000)

  // Lunar phase calculation
  const lunarCycle = 29.53
  const knownNewMoon = new Date('2024-01-11').getTime()
  const daysSinceNewMoon = (now.getTime() - knownNewMoon) / 86400000
  const lunarPhaseValue = (daysSinceNewMoon % lunarCycle) / lunarCycle

  let lunarPhase = ''
  let illumination = 0
  let lunarEmoji = ''
  if (lunarPhaseValue < 0.1) { lunarPhase = 'New Moon'; illumination = 0; lunarEmoji = '🌑'; }
  else if (lunarPhaseValue < 0.25) { lunarPhase = 'Waxing Crescent'; illumination = Math.round(lunarPhaseValue / 0.25 * 25); lunarEmoji = '🌒'; }
  else if (lunarPhaseValue < 0.35) { lunarPhase = 'First Quarter'; illumination = 50; lunarEmoji = '🌓'; }
  else if (lunarPhaseValue < 0.5) { lunarPhase = 'Waxing Gibbous'; illumination = Math.round(50 + (lunarPhaseValue - 0.35) / 0.15 * 25); lunarEmoji = '🌔'; }
  else if (lunarPhaseValue < 0.6) { lunarPhase = 'Full Moon'; illumination = 100; lunarEmoji = '🌕'; }
  else if (lunarPhaseValue < 0.75) { lunarPhase = 'Waning Gibbous'; illumination = Math.round(100 - (lunarPhaseValue - 0.6) / 0.15 * 25); lunarEmoji = '🌖'; }
  else if (lunarPhaseValue < 0.85) { lunarPhase = 'Last Quarter'; illumination = 50; lunarEmoji = '🌗'; }
  else { lunarPhase = 'Waning Crescent'; illumination = Math.round(50 - (lunarPhaseValue - 0.85) / 0.15 * 50); lunarEmoji = '🌘'; }

  const lunarSentiment = (lunarPhaseValue > 0.4 && lunarPhaseValue < 0.6) ? 'High Volatility Expected' : 'Normal Volatility'

  // Mercury retrograde (2024-2025 periods)
  const isMercuryRetrograde = () => {
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()
    if (y === 2024) {
      if (m === 3 && d >= 1) return true
      if (m === 4 && d <= 25) return true
      if (m === 7 && d >= 5) return true
      if (m === 8 && d <= 28) return true
      if (m === 10 && d >= 25) return true
      if (m === 11) return true
    }
    if (y === 2025) {
      if (m === 2 && d >= 15) return true
      if (m === 3 && d <= 7) return true
      if (m === 6 && d >= 18) return true
      if (m === 7 && d <= 11) return true
      if (m === 10 && d >= 9) return true
      if (m === 11 && d <= 1) return true
    }
    return false
  }

  const mercuryRetrograde = isMercuryRetrograde()

  // Fibonacci time cycle
  const fibSequence = [13, 21, 34, 55, 89, 144]
  const fibIndex = Math.floor(dayOfYear / 13) % fibSequence.length
  const fibCycle = fibSequence[fibIndex]
  const fibDay = Math.floor(dayOfYear % fibCycle) + 1
  const nextFibPivot = fibCycle - fibDay
  const goldenRatioAlignment = Math.round((1 - Math.abs(fibDay / fibCycle - 0.618)) * 100)

  // Calculate overall Astronacci signal
  const lunarBullish = lunarPhaseValue > 0.3 && lunarPhaseValue < 0.7
  const mercuryBullish = !mercuryRetrograde
  const fibBullish = goldenRatioAlignment > 60
  const bullishCount = [lunarBullish, mercuryBullish, fibBullish].filter(Boolean).length

  let signal = 'NEUTRAL'
  let signalEmoji = '🌗'
  let signalColor = '#9ca3af'

  if (bullishCount >= 2) {
    signal = 'BULLISH'
    signalEmoji = '🌙'
    signalColor = '#22c55e'
  } else if (bullishCount === 0) {
    signal = 'BEARISH'
    signalEmoji = '🌑'
    signalColor = '#ef4444'
  }

  const strength = Math.round(
    (lunarBullish ? 35 : 15) +
    (mercuryBullish ? 35 : 15) +
    (fibBullish ? goldenRatioAlignment / 2 : 10)
  )

  return {
    lunarPhase: `${lunarEmoji} ${lunarPhase}`,
    illumination,
    lunarSentiment,
    mercuryRetrograde,
    mercuryDaysUntilChange: mercuryRetrograde
      ? (21 - now.getDate() > 0 ? 21 - now.getDate() : 5)
      : 15,
    fibDay,
    fibCycle,
    nextFibPivot,
    goldenRatioAlignment,
    signal,
    signalEmoji,
    signalColor,
    strength,
    reasoning: [
      lunarBullish ? `Lunar phase (${lunarPhase}) supports volatility` : 'Lunar phase neutral',
      !mercuryRetrograde ? 'Mercury direct - clear market communication' : '⚠️ Mercury retrograde - expect confusion',
      goldenRatioAlignment > 60
        ? `Price aligning with golden ratio φ (${goldenRatioAlignment}% match)`
        : 'Building toward golden ratio alignment'
    ]
  }
}

// Initialize Astronacci data
const initialAstronacci = calculateAstronacci()

interface TradingRecommendation {
  symbol: string
  action: 'LONG' | 'SHORT' | 'WAIT'
  confidence: number
  entryZone: { min: number; max: number }
  stopLoss: number
  takeProfits: number[]
  positionSize: number
  leverage: number
  riskAmount: number
  potentialReward: number
  reasoning: string[]
  indicators: {
    rsiSignal: string
    macdSignal: string
    bbSignal: string
    adxSignal: string
    overallSignal: string
  }
}

export default function UltimateTradingDashboard() {
  const [marketData, setMarketData] = useState(generateMarketData())
  const [marketOverviewData, setMarketOverviewData] = useState(marketOverview)
  const [selectedAsset, setSelectedAsset] = useState<keyof typeof marketData>('BTC')
  const [leverage, setLeverage] = useState(5)
  const [riskPercent, setRiskPercent] = useState(2)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Autonomous Agent Status
  const [swarmStatus, setSwarmStatus] = useState<any>(null)

  // Real-time News
  const [newsData, setNewsData] = useState<any[]>([])

  // Astronacci Data
  const [astronacci, setAstronacci] = useState(initialAstronacci)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Fetch real-time market data from CoinGecko via /api/market
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        // /api/market fetches real prices from CoinGecko and calculates indicators
        const response = await fetch('/api/market')
        const result = await response.json()

        if (result.success && result.data) {
          setMarketData(result.data.marketData)
          setMarketOverviewData(result.data.marketOverview)
          setLastUpdate(new Date())
        }
      } catch (error) {
        console.error('Failed to fetch market data:', error)
      }
    }

    // Fetch immediately and then every 30 seconds
    fetchMarketData()
    const interval = setInterval(fetchMarketData, 30000)

    return () => clearInterval(interval)
  }, [])

  // Fetch autonomous swarm status
  useEffect(() => {
    const fetchSwarmStatus = async () => {
      try {
        const response = await fetch('/api/swarm?action=status')
        const result = await response.json()
        if (result.success) {
          setSwarmStatus(result.data)
        }
      } catch (error) {
        console.error('Failed to fetch swarm status:', error)
      }
    }

    fetchSwarmStatus()
    const interval = setInterval(fetchSwarmStatus, 3000)

    return () => clearInterval(interval)
  }, [])

  // Fetch real-time news
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/news')
        const result = await response.json()
        if (result.success && result.data) {
          setNewsData(result.data.articles || result.data)
        }
      } catch (error) {
        console.error('Failed to fetch news:', error)
      }
    }

    fetchNews()
    const interval = setInterval(fetchNews, 60000) // Refresh every minute

    return () => clearInterval(interval)
  }, [])

  // Layman explanations for indicators
  const getRSIExplanation = (rsi: number) => {
    if (rsi < 30) return "Price dropped too much, may bounce up soon"
    if (rsi > 70) return "Price rose too much, may drop soon"
    if (rsi > 55) return "More buyers than sellers right now"
    if (rsi < 45) return "More sellers than buyers right now"
    return "Balanced between buyers and sellers"
  }

  const getMACDExplanation = (macd: any) => {
    if (macd.histogram > 0 && macd.value > macd.signal) return "Momentum going UP - buyers in control"
    if (macd.histogram < 0 && macd.value < macd.signal) return "Momentum going DOWN - sellers in control"
    if (macd.histogram > 0) return "Starting to turn upward"
    return "Starting to turn downward"
  }

  const getBollingerExplanation = (price: number, bb: any) => {
    if (price < bb.lower) return "Price below lower band - very cheap, potential buy"
    if (price > bb.upper) return "Price above upper band - expensive, potential sell"
    if (bb.squeeze) return "Price squeezing - big move coming soon"
    return "Price within normal range"
  }

  const getADXExplanation = (adx: number) => {
    if (adx > 25) return `Strong trend (${adx.toFixed(0)}) - follow the trend`
    return `Weak trend (${adx.toFixed(0)}) - price ranging sideways`
  }

  const getStochasticExplanation = (k: number, d: number) => {
    if (k > d && k < 80) return "Bullish - upward momentum"
    if (k < d && k > 20) return "Bearish - downward momentum"
    if (k > 80) return "Overbought zone - price may drop"
    if (k < 20) return "Oversold zone - price may rise"
    return "Momentum building"
  }

  const getEMAExplanation = (ema9: number, ema21: number, ema50: number, price: number) => {
    if (price > ema9 && ema9 > ema21 && ema21 > ema50) return "Strong uptrend - all lines aligned up"
    if (price < ema9 && ema9 < ema21 && ema21 < ema50) return "Strong downtrend - all lines aligned down"
    if (price > ema9) return "Price above short-term average - bullish"
    if (price < ema9) return "Price below short-term average - bearish"
    return "Price near averages - deciding direction"
  }

  const getATRExplanation = (atr: number, price: number) => {
    const atrPercent = (atr / price * 100).toFixed(1)
    if (atr / price > 0.02) return `High volatility (${atrPercent}%) - use wider stops`
    return `Normal volatility (${atrPercent}%) - standard risk`
  }

  // Calculate trading recommendations with full technical analysis
  const calculateRecommendation = (symbol: keyof typeof marketData): TradingRecommendation => {
    const data = marketData[symbol]
    const { rsi, macd, bollingerBands, adx, atr, stochastic, ema } = data

    // RSI Signal
    let rsiSignal = "NEUTRAL"
    if (rsi < 30) rsiSignal = "OVERSOLD - BOUNCE LIKELY"
    else if (rsi > 70) rsiSignal = "OVERBOUGHT - REVERSAL RISK"
    else if (rsi > 50) rsiSignal = "BULLISH ZONE"
    else rsiSignal = "BEARISH ZONE"

    // MACD Signal
    let macdSignal = "NEUTRAL"
    if (macd.histogram > 0 && macd.value > macd.signal) macdSignal = "BULLISH MOMENTUM"
    else if (macd.histogram < 0 && macd.value < macd.signal) macdSignal = "BEARISH MOMENTUM"
    else if (macd.histogram > 0) macdSignal = "BULLISH DIVERGENCE"
    else macdSignal = "BEARISH DIVERGENCE"

    // Bollinger Bands Signal
    let bbSignal = "NEUTRAL"
    if (data.price < bollingerBands.lower) bbSignal = "BELOW LOWER - OVERSOLD"
    else if (data.price > bollingerBands.upper) bbSignal = "ABOVE UPPER - OVERBOUGHT"
    else if (bollingerBands.squeeze) bbSignal = "SQUEEZE - BREAKOUT PENDING"
    else bbSignal = "WITHIN BANDS - CONSOLIDATION"

    // ADX Signal
    let adxSignal = adx > 25 ? "STRONG TREND" : "WEAK TREND/RANGING"

    // EMA Analysis
    const emaBullish = ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50
    const emaSignal = emaBullish ? "BULLISH STACK" : "BEARISH STACK"

    // Overall Signal
    let action: 'LONG' | 'SHORT' | 'WAIT' = 'WAIT'
    let confidence = 50

    const bullishSignals = [
      rsi > 40 && rsi < 70,
      macd.histogram > 0,
      emaBullish,
      data.price > bollingerBands.middle,
      adx > 20,
    ].filter(Boolean).length

    const bearishSignals = [
      rsi > 70,
      macd.histogram < 0,
      !emaBullish,
      data.price < bollingerBands.middle,
    ].filter(Boolean).length

    if (bullishSignals >= 3 && rsi < 75) {
      action = 'LONG'
      confidence = Math.min(90, 50 + bullishSignals * 8)
    } else if (bearishSignals >= 3 && rsi > 25) {
      action = 'SHORT'
      confidence = Math.min(90, 50 + bearishSignals * 8)
    }

    // Calculate entry zone, stop loss, take profit
    const slBuffer = atr * ACCOUNT_SETTINGS.stopLossBuffer
    const stopLoss = action === 'LONG'
      ? data.price - atr - slBuffer
      : data.price + atr + slBuffer

    const risk = Math.abs(data.price - stopLoss)
    const takeProfit1 = action === 'LONG' ? data.price + (risk * 2) : data.price - (risk * 2)
    const takeProfit2 = action === 'LONG' ? data.price + (risk * 3) : data.price - (risk * 3)

    const riskAmount = ACCOUNT_SETTINGS.balance * (riskPercent / 100)
    const positionSizeUSD = (riskAmount / Math.abs(data.price - stopLoss)) * leverage

    return {
      symbol,
      action,
      confidence,
      entryZone: {
        min: action === 'LONG' ? data.price - (atr * 0.5) : data.price - (atr * 0.3),
        max: action === 'LONG' ? data.price + (atr * 0.3) : data.price + (atr * 0.5),
      },
      stopLoss,
      takeProfits: [takeProfit1, takeProfit2],
      positionSize: positionSizeUSD,
      leverage,
      riskAmount,
      potentialReward: risk * 2 * (positionSizeUSD / leverage),
      reasoning: [
        `RSI (${rsi.toFixed(1)}): ${rsiSignal}`,
        `MACD: ${macdSignal}`,
        `Bollinger: ${bbSignal}`,
        `ADX (${adx.toFixed(1)}): ${adxSignal}`,
        `EMA: ${emaSignal}`,
        `Stochastic: %K ${stochastic.k.toFixed(1)} / %D ${stochastic.d.toFixed(1)}`,
      ],
      indicators: {
        rsiSignal,
        macdSignal,
        bbSignal,
        adxSignal,
        overallSignal: action === 'LONG' ? 'BULLISH' : action === 'SHORT' ? 'BEARISH' : 'NEUTRAL',
      },
    }
  }

  const recommendations = Object.keys(marketData).map(
    symbol => calculateRecommendation(symbol as keyof typeof marketData)
  ).sort((a, b) => b.confidence - a.confidence)

  const renderTechnicalIndicator = (label: string, value: string | number, signal: string, color: string) => ({
    label, value, signal, color,
  })

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0f',
      color: '#e5e7eb',
      padding: '12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '13px',
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Top Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        padding: '10px 16px',
        background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
        border: '1px solid rgba(168, 85, 247, 0.2)',
        borderRadius: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Crosshair style={{ width: '18px', height: '18px', color: '#fff' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '15px', fontWeight: '700', margin: 0, letterSpacing: '-0.3px' }}>
              CRYPTO TRADING TERMINAL
            </h1>
            <p style={{ fontSize: '11px', color: '#6b7280', margin: 0 }}>
              AI-Powered Technical Analysis & Position Management
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#6b7280' }}>
            <Clock style={{ width: '12px', height: '12px' }} />
            {currentTime.toLocaleTimeString()}
          </div>
          {lastUpdate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#22c55e' }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
              Live • {lastUpdate.toLocaleTimeString()}
            </div>
          )}
          <div style={{
            background: 'rgba(34, 197, 94, 0.15)',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
          }}>
            <Wallet style={{ width: '12px', height: '12px', color: '#22c55e', display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
            ${ACCOUNT_SETTINGS.balance.toFixed(2)}
          </div>
          <div style={{
            background: '#1f2937',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '11px',
            color: '#9ca3af',
          }}>
            P&L: <span style={{ color: '#22c55e', fontWeight: '600' }}>+${portfolioData.totalUnrealizedPnl.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 🎯 MASTER INDICATOR SUMMARY - All indicators combined */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(139, 92, 246, 0.08) 50%, rgba(15, 23, 42, 1) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '16px',
        padding: '20px',
        marginBottom: '16px',
      }}>
        {(() => {
          const data = marketData[selectedAsset]

          // Calculate scores from ALL indicators (0-100 each)
          const scores = {
            // RSI Score: Best at 40-60 (oversold=good for buy, overbought=bad)
            rsi: data.rsi < 30 ? 90 : data.rsi < 40 ? 75 : data.rsi < 60 ? 50 : data.rsi < 70 ? 25 : data.rsi < 80 ? 10 : 0,

            // MACD Score: Positive histogram = bullish
            macd: data.macd.histogram > 100 ? 90 : data.macd.histogram > 50 ? 75 : data.macd.histogram > 0 ? 60 : data.macd.histogram > -50 ? 30 : 0,

            // Bollinger Bands Score: Near lower band = good buy, near upper = overbought
            bbPosition: data.price < data.bollingerBands.lower ? 90 : data.price < data.bollingerBands.middle ? 70 : data.price < data.bollingerBands.upper ? 40 : 20,

            // Bollinger Squeeze: Squeeze = potential breakout coming
            bbSqueeze: data.bollingerBands.squeeze ? 70 : 50,

            // ADX Score: Higher = stronger trend (>25 trending, <20 ranging)
            adx: data.adx > 40 ? 80 : data.adx > 25 ? 60 : data.adx > 20 ? 40 : 30,

            // Stochastic Score: K vs D
            stoch: data.stochastic.k < 20 ? 90 : data.stochastic.k < 30 ? 75 : data.stochastic.k > 80 ? 10 : data.stochastic.k > 70 ? 25 : data.stochastic.k > data.stochastic.d ? 60 : 40,

            // EMA Stack Score: Bullish stack (9 > 21 > 50) = strong uptrend
            emaStack: data.ema.ema9 > data.ema.ema21 && data.ema.ema21 > data.ema.ema50 ? 90 : data.ema.ema9 > data.ema.ema21 ? 60 : data.ema.ema9 < data.ema.ema21 && data.ema.ema21 < data.ema.ema50 ? 20 : 40,

            // Trend Direction
            trend: data.trend === 'BULLISH' ? 80 : data.trend === 'BEARISH' ? 20 : 50,

            // Astronacci Score
            astronacci: astronacci.signal === 'BULLISH' ? 80 : astronacci.signal === 'BEARISH' ? 30 : 50,

            // Fear & Greed: Extreme fear = buying opportunity
            fearGreed: marketOverviewData.fearAndGreed.value < 25 ? 80 : marketOverviewData.fearAndGreed.value < 45 ? 65 : marketOverviewData.fearAndGreed.value > 75 ? 20 : 50,
          }

          // Weighted overall score
          const weights = {
            rsi: 0.15,
            macd: 0.12,
            bbPosition: 0.12,
            bbSqueeze: 0.05,
            adx: 0.08,
            stoch: 0.10,
            emaStack: 0.12,
            trend: 0.10,
            astronacci: 0.08,
            fearGreed: 0.08,
          }

          const overallScore = Object.entries(scores).reduce((sum, [key, score]) => sum + score * weights[key as keyof typeof weights], 0)

          // Determine signal based on overall score
          let signal = 'NEUTRAL'
          let signalColor = '#f59e0b'
          let bgColor = 'rgba(245, 158, 11, 0.15)'
          let emoji = '⏸️'
          let action = 'WAIT'

          if (overallScore >= 65) {
            signal = 'BUY'
            signalColor = '#22c55e'
            bgColor = 'rgba(34, 197, 94, 0.2)'
            emoji = '🟢'
            action = 'ENTER LONG'
          } else if (overallScore <= 35) {
            signal = 'SELL'
            signalColor = '#ef4444'
            bgColor = 'rgba(239, 68, 68, 0.2)'
            emoji = '🔴'
            action = 'EXIT / SHORT'
          }

          return (
            <>
              {/* Top Row: Price | Overall Signal | Score */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', alignItems: 'center', marginBottom: '16px' }}>
                {/* Current Price */}
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>CURRENT PRICE</div>
                  <div style={{ fontSize: '32px', fontWeight: '900', color: '#fff', letterSpacing: '-1px' }}>
                    ${data.price.toLocaleString()}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: data.change24h >= 0 ? '#22c55e' : '#ef4444',
                    fontWeight: '600'
                  }}>
                    {data.change24h >= 0 ? '+' : ''}{data.change24h}% (24h)
                  </div>
                </div>

                {/* Overall Signal - BIG & PROMINENT */}
                <div style={{
                  background: bgColor,
                  border: `3px solid ${signalColor}`,
                  borderRadius: '20px',
                  padding: '20px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '4px', fontWeight: '600' }}>
                    MASTER SIGNAL ({selectedAsset})
                  </div>
                  <div style={{ fontSize: '48px', fontWeight: '900', color: signalColor, letterSpacing: '3px', lineHeight: '1' }}>
                    {emoji} {signal}
                  </div>
                  <div style={{ fontSize: '14px', color: signalColor, marginTop: '8px', fontWeight: '700' }}>
                    {action}
                  </div>
                </div>

                {/* Overall Score */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '2px' }}>COMBINED SCORE</div>
                  <div style={{ fontSize: '42px', fontWeight: '900', color: signalColor }}>
                    {overallScore.toFixed(0)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>out of 100</div>
                  {/* Score bar */}
                  <div style={{ marginTop: '8px', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${overallScore}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)`,
                      borderRadius: '4px'
                    }} />
                  </div>
                </div>
              </div>

              {/* All Indicator Scores Grid */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>
                  INDIVIDUAL INDICATOR SCORES
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  {[
                    { name: 'RSI', score: scores.rsi, label: data.rsi < 30 ? 'OVERSOLD' : data.rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL' },
                    { name: 'MACD', score: scores.macd, label: data.macd.histogram > 0 ? 'BULLISH' : 'BEARISH' },
                    { name: 'Bollinger', score: scores.bbPosition, label: data.price < data.bollingerBands.lower ? 'LOWER' : data.price > data.bollingerBands.upper ? 'UPPER' : 'MID' },
                    { name: 'BB Squeeze', score: scores.bbSqueeze, label: data.bollingerBands.squeeze ? 'ALERT' : 'NORMAL' },
                    { name: 'ADX Trend', score: scores.adx, label: data.adx > 25 ? 'TRENDING' : 'RANGING' },
                    { name: 'Stochastic', score: scores.stoch, label: data.stochastic.k > data.stochastic.d ? 'BULL' : 'BEAR' },
                    { name: 'EMA Stack', score: scores.emaStack, label: data.ema.ema9 > data.ema.ema21 ? 'BULL' : 'BEAR' },
                    { name: 'Trend', score: scores.trend, label: data.trend },
                    { name: '🌙 Astronacci', score: scores.astronacci, label: astronacci.signal },
                    { name: 'Fear/Greed', score: scores.fearGreed, label: marketOverviewData.fearAndGreed.label },
                  ].map((ind) => {
                    const scoreColor = ind.score >= 70 ? '#22c55e' : ind.score <= 30 ? '#ef4444' : '#f59e0b'
                    return (
                      <div key={ind.name} style={{
                        background: 'rgba(0,0,0,0.3)',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        border: `2px solid ${scoreColor}40`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '10px', color: '#9ca3af' }}>{ind.name}</span>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: scoreColor }}>{ind.score}</span>
                        </div>
                        {/* Score bar */}
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', marginBottom: '6px' }}>
                          <div style={{
                            width: `${ind.score}%`,
                            height: '100%',
                            background: scoreColor,
                            borderRadius: '3px'
                          }} />
                        </div>
                        <div style={{ fontSize: '10px', color: scoreColor, fontWeight: '600', textAlign: 'center' }}>
                          {ind.label}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Quick Trading Insight */}
              <div style={{
                marginTop: '16px',
                padding: '12px 16px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
              }}>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                  💡 <strong style={{ color: signalColor }}>
                    {overallScore >= 65 ? 'Strong Buy Signal: Multiple indicators aligned bullish. Consider entering long position.'
                    : overallScore <= 35 ? 'Strong Sell Signal: Multiple indicators aligned bearish. Consider exit or short.'
                    : 'Neutral Zone: Mixed signals. Wait for clearer alignment before entering.'}
                  </strong>
                </span>
              </div>
            </>
          )
        })()}
      </div>

      {/* 🎯 TRADING STRATEGIES - Actionable plans based on current conditions */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(15, 23, 42, 1) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: '16px',
        padding: '18px',
        marginBottom: '16px',
      }}>
        {(() => {
          const data = marketData[selectedAsset]

          // ========== DYNAMIC MARKET ANALYSIS ==========
          const currentPrice = data.price
          const atr = data.atr
          const atrPercent = (atr / currentPrice) * 100
          const support = data.support[0]
          const resistance = data.resistance[0]
          const bbLower = data.bollingerBands.lower
          const bbUpper = data.bollingerBands.upper
          const bbMiddle = data.bollingerBands.middle
          const bbWidth = ((bbUpper - bbLower) / bbMiddle) * 100

          // Market regime detection
          const isTrending = data.adx > 25
          const isStrongTrend = data.adx > 40
          const isRanging = !isTrending
          const trendUp = data.ema.ema9 > data.ema.ema21
          const trendDown = !trendUp

          // Volatility state
          const isHighVolatility = atrPercent > 2.5
          const isLowVolatility = atrPercent < 1
          const isSqueeze = data.bollingerBands.squeeze

          // Price position
          const nearLower = currentPrice < bbMiddle
          const nearUpper = currentPrice > bbMiddle
          const atLower = currentPrice < bbLower * 1.01
          const atUpper = currentPrice > bbUpper * 0.99

          // RSI state
          const isOversold = data.rsi < 30
          const isOverbought = data.rsi > 70
          const rsiNeutral = !isOversold && !isOverbought

          // Momentum
          const bullishMomentum = data.macd.histogram > 0 && trendUp
          const bearishMomentum = data.macd.histogram < 0 && trendDown

          // ========== DYNAMIC STRATEGY SCORING ==========
          const scores = {
            traps: 0,
            grid: 0,
            breakout: 0,
            dca: 0,
            swing: 0,
            leverage: 0,
          }

          // Score 2 Traps
          if (isRanging) scores.traps += 30
          if (rsiNeutral) scores.traps += 25
          if (!isSqueeze) scores.traps += 20
          if (nearLower) scores.traps += 15
          if (isLowVolatility) scores.traps += 10

          // Score Grid Trading
          if (isRanging) scores.grid += 35
          if (isSqueeze) scores.grid += 25
          if (rsiNeutral) scores.grid += 20
          if (!isStrongTrend) scores.grid += 20

          // Score Breakout
          if (isTrending) scores.breakout += 30
          if (isStrongTrend) scores.breakout += 25
          if (isSqueeze) scores.breakout += 20
          if (isHighVolatility) scores.breakout += 15
          if (bullishMomentum || bearishMomentum) scores.breakout += 10

          // Score DCA
          scores.dca = 50 // Always viable
          if (trendUp) scores.dca += 20
          if (isOversold) scores.dca += 15
          if (isRanging) scores.dca += 15

          // Score Swing
          if (isTrending) scores.swing += 30
          if (!isSqueeze) scores.swing += 25
          if (atLower || atUpper) scores.swing += 25
          if (rsiNeutral) scores.swing += 20

          // Score Leverage
          if (isStrongTrend) scores.leverage += 35
          if (bullishMomentum) scores.leverage += 25
          if (isHighVolatility) scores.leverage -= 30 // Too risky
          if (!isOversold && !isOverbought) scores.leverage += 20
          if (isTrending && !isRanging) scores.leverage += 20

          // Find best strategy
          const maxScore = Math.max(...Object.values(scores))
          const bestStrategy = Object.keys(scores).find(key => scores[key as keyof typeof scores] === maxScore) as keyof typeof scores

          // Strategy display names
          const strategyNames: Record<string, { name: string; emoji: string; desc: string }> = {
            traps: { name: '2 Traps', emoji: '🪤', desc: 'Set & forget limit orders' },
            grid: { name: 'Grid Trading', emoji: '📊', desc: 'Profit from price swings' },
            breakout: { name: 'Breakout', emoji: '🚀', desc: 'Ride the momentum' },
            dca: { name: 'DCA', emoji: '🤖', desc: 'Passive accumulation' },
            swing: { name: 'Swing Trade', emoji: '🌊', desc: 'Buy support, sell resistance' },
            leverage: { name: 'Leverage', emoji: '⚡', desc: 'Amplify gains (risky!)' },
          }

          // Dynamic trap levels based on ATR
          const trapBelow = Math.max(bbLower * 0.99, currentPrice - atr * 1.5)
          const trapAbove = Math.min(bbMiddle * 1.01, currentPrice + atr * 0.8)

          // Target date
          const targetDate = new Date()
          targetDate.setDate(targetDate.getDate() + 15)
          const targetDateString = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

          return (
            <>
              {/* Header with Real-Time Market State */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '18px',
                    }}>
                      🎯
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#a78bfa' }}>TRADING STRATEGIES</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>
                        Real-time • Updates every 30s
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live Market State Indicators */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {[
                    { label: isTrending ? 'TRENDING' : 'RANGING', color: isTrending ? '#22c55e' : '#6b7280', icon: isTrending ? '📈' : '↔️' },
                    { label: trendUp ? 'BULLISH' : 'BEARISH', color: trendUp ? '#22c55e' : '#ef4444', icon: trendUp ? '🐂' : '🐻' },
                    { label: isHighVolatility ? 'HIGH VOL' : isLowVolatility ? 'LOW VOL' : 'NORMAL VOL', color: isHighVolatility ? '#ef4444' : isLowVolatility ? '#9ca3af' : '#f59e0b', icon: isHighVolatility ? '🔥' : isLowVolatility ? '❄️' : '🌡️' },
                    { label: isSqueeze ? 'SQUEEZE!' : 'EXPANDED', color: isSqueeze ? '#f59e0b' : '#6b7280', icon: isSqueeze ? '🤫' : '📊' },
                    { label: isOversold ? 'OVERSOLD' : isOverbought ? 'OVERBOUGHT' : 'NEUTRAL RSI', color: isOversold ? '#22c55e' : isOverbought ? '#ef4444' : '#6b7280', icon: isOversold ? '💚' : isOverbought ? '❤️' : '⚪' },
                  ].map((state) => (
                    <div key={state.label} style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: '600',
                      background: `${state.color}20`,
                      color: state.color,
                      border: `1px solid ${state.color}40`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      {state.icon} {state.label}
                    </div>
                  ))}
                </div>
              </div>

              {/* BEST STRATEGY HIGHLIGHT - Dynamic */}
              <div style={{
                background: `linear-gradient(135deg, ${bestStrategy === 'traps' ? 'rgba(34, 197, 94, 0.15)' : bestStrategy === 'grid' ? 'rgba(59, 130, 246, 0.15)' : bestStrategy === 'breakout' ? 'rgba(249, 115, 22, 0.15)' : bestStrategy === 'dca' ? 'rgba(168, 85, 247, 0.15)' : bestStrategy === 'swing' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)'} 0%, rgba(15, 23, 42, 1) 100%)`,
                border: `2px solid ${bestStrategy === 'traps' ? '#22c55e' : bestStrategy === 'grid' ? '#3b82f6' : bestStrategy === 'breakout' ? '#f59e0b' : bestStrategy === 'dca' ? '#a855f7' : bestStrategy === 'swing' ? '#ec4899' : '#ef4444'}`,
                borderRadius: '14px',
                padding: '16px',
                marginBottom: '16px',
                animation: 'pulse 2s infinite',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '14px',
                      background: `linear-gradient(135deg, ${bestStrategy === 'traps' ? '#22c55e' : bestStrategy === 'grid' ? '#3b82f6' : bestStrategy === 'breakout' ? '#f59e0b' : bestStrategy === 'dca' ? '#a855f7' : bestStrategy === 'swing' ? '#ec4899' : '#ef4444'} 0%, ${bestStrategy === 'traps' ? '#16a34a' : bestStrategy === 'grid' ? '#2563eb' : bestStrategy === 'breakout' ? '#d97706' : bestStrategy === 'dca' ? '#9333ea' : bestStrategy === 'swing' ? '#db2777' : '#dc2626'} 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                    }}>
                      {strategyNames[bestStrategy].emoji}
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '2px' }}>⭐ RECOMMENDED FOR CURRENT CONDITIONS</div>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: bestStrategy === 'traps' ? '#22c55e' : bestStrategy === 'grid' ? '#3b82f6' : bestStrategy === 'breakout' ? '#f59e0b' : bestStrategy === 'dca' ? '#a855f7' : bestStrategy === 'swing' ? '#ec4899' : '#ef4444' }}>
                        {strategyNames[bestStrategy].name.toUpperCase()}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {strategyNames[bestStrategy].desc} • Score: {maxScore}/100
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>WHY NOW?</div>
                    <div style={{ fontSize: '11px', color: '#d1d5db', maxWidth: '200px' }}>
                      {bestStrategy === 'traps' && `Price ranging (${isRanging ? 'Ranging' : 'Trending'}) with ${isSqueeze ? 'squeeze' : 'normal'} bands. Set traps at key levels.`}
                      {bestStrategy === 'grid' && `${isSqueeze ? 'Squeeze detected' : 'Sideways action'} - perfect for grid. Volatility: ${atrPercent.toFixed(1)}%`}
                      {bestStrategy === 'breakout' && `${isStrongTrend ? 'Strong' : 'Developing'} ${trendUp ? 'up' : 'down'} trend with ${bullishMomentum || bearishMomentum ? 'momentum' : 'building momentum'}.`}
                      {bestStrategy === 'dca' && `${trendUp ? 'Uptrend' : 'Accumulation phase'} - accumulate gradually. ${isOversold ? 'Oversold = good entry' : ''}`}
                      {bestStrategy === 'swing' && `Clear levels at ${support?.toLocaleString()} / ${resistance?.toLocaleString()}. ${atLower || atUpper ? 'At extreme - good swing entry' : 'Wait for better entry'}`}
                      {bestStrategy === 'leverage' && `${isStrongTrend ? 'Strong trend' : 'High momentum'} - leverage aligned. ⚠️ High risk!`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Strategy Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>

                {/* STRATEGY 1: The "2 Traps" (User's Favorite) */}
                <div style={{
                  background: bestStrategy === 'traps' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.08)',
                  border: bestStrategy === 'traps' ? '3px solid #22c55e' : '2px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '14px',
                  padding: '14px',
                  position: 'relative',
                  opacity: scores.traps < 40 ? 0.7 : 1,
                }}>
                  {bestStrategy === 'traps' && (
                    <div style={{ position: 'absolute', top: '-10px', right: '10px', background: '#22c55e', color: '#fff', fontSize: '9px', fontWeight: '700', padding: '3px 10px', borderRadius: '10px' }}>
                      ⭐ BEST MATCH
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '20px' }}>🪤</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>THE &quot;2 TRAPS&quot; STRATEGY</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>Set & forget limit orders</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '10px', background: scores.traps >= 70 ? 'rgba(34, 197, 94, 0.2)' : scores.traps >= 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(107, 114, 128, 0.2)', color: scores.traps >= 70 ? '#22c55e' : scores.traps >= 40 ? '#f59e0b' : '#6b7280', padding: '4px 10px', borderRadius: '6px', fontWeight: '700' }}>
                      Score: {scores.traps}
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#d1d5db', lineHeight: '1.6', marginBottom: '12px' }}>
                    Set two limit orders to catch price swings. One below for bounce buys, one above for momentum confirmation.
                  </div>

                  {/* Dynamic Trap 1: Lower Trap - Adjusted by ATR */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '10px',
                    padding: '10px',
                    marginBottom: '8px',
                    borderLeft: '3px solid #22c55e'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e' }}>🔻 TRAP 1: BOUNCE BUY</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
                        ${trapBelow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                      {isOversold ? '⚡ RSI oversold - high probability bounce!' : `ATR-based entry (${(atr * 1.5).toFixed(0)} below current)`}
                    </div>
                    {currentPrice < trapBelow * 1.01 && (
                      <div style={{ fontSize: '9px', color: '#22c55e', marginTop: '4px', fontWeight: '600' }}>
                        ✓ Price near this level NOW!
                      </div>
                    )}
                  </div>

                  {/* Dynamic Trap 2: Upper Trap - Momentum */}
                  <div style={{
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '10px',
                    padding: '10px',
                    marginBottom: '10px',
                    borderLeft: '3px solid #3b82f6'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: '#3b82f6' }}>🔺 TRAP 2: MOMENTUM ENTRY</span>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
                        ${trapAbove.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                      Confirm up-move above current. Target: ${resistance?.toLocaleString()}
                    </div>
                    {bullishMomentum && (
                      <div style={{ fontSize: '9px', color: '#3b82f6', marginTop: '4px', fontWeight: '600' }}>
                        ↑ Bullish momentum - set this trap!
                      </div>
                    )}
                  </div>

                  {/* Dynamic Condition Display */}
                  <div style={{
                    background: isRanging ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    border: `1px dashed ${isRanging ? 'rgba(34, 197, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                  }}>
                    <div style={{ fontSize: '10px', color: isRanging ? '#22c55e' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{isRanging ? '✅' : '⚠️'}</span>
                      <span><strong>Conditions:</strong> {isRanging ? 'Ranging market - PERFECT for traps' : 'Trending - adjust traps wider'}</span>
                    </div>
                  </div>
                </div>

                {/* STRATEGY 2: Grid Trading (Dynamic based on volatility) */}
                <div style={{
                  background: bestStrategy === 'grid' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
                  border: bestStrategy === 'grid' ? '3px solid #3b82f6' : '2px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '14px',
                  padding: '14px',
                  position: 'relative',
                  opacity: scores.grid < 40 ? 0.7 : 1,
                }}>
                  {bestStrategy === 'grid' && (
                    <div style={{ position: 'absolute', top: '-10px', right: '10px', background: '#3b82f6', color: '#fff', fontSize: '9px', fontWeight: '700', padding: '3px 10px', borderRadius: '10px' }}>
                      ⭐ BEST MATCH
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '20px' }}>📊</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#3b82f6' }}>GRID TRADING</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>Profit from swings</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '10px', background: scores.grid >= 70 ? 'rgba(59, 130, 246, 0.2)' : scores.grid >= 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(107, 114, 128, 0.2)', color: scores.grid >= 70 ? '#3b82f6' : scores.grid >= 40 ? '#f59e0b' : '#6b7280', padding: '4px 10px', borderRadius: '6px', fontWeight: '700' }}>
                      Score: {scores.grid}
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#d1d5db', lineHeight: '1.6', marginBottom: '12px' }}>
                    Place orders at regular intervals. Grid spacing: <strong>{(atrPercent / 2).toFixed(1)}%</strong> (based on ATR)
                  </div>

                  {/* Dynamic Grid Levels */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px' }}>
                      GRID LEVELS ({isHighVolatility ? 'WIDER SPACING' : 'NORMAL SPACING'}):
                    </div>
                    {(() => {
                      const gridSpacing = isHighVolatility ? atr * 0.8 : atr * 0.5
                      const levels = [-3, -2, -1, 0, 1, 2, 3].map(i => currentPrice * (1 + i * gridSpacing / currentPrice))
                      return levels.map((levelPrice, i) => {
                        const offset = i - 3
                        const isBelow = offset < 0
                        const isCurrent = offset === 0
                        return (
                          <div key={i} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '4px 8px',
                            marginBottom: '3px',
                            borderRadius: '6px',
                            background: isCurrent ? 'rgba(245, 158, 11, 0.2)' : 'rgba(0,0,0,0.2)',
                            fontSize: '10px',
                          }}>
                            <span style={{ color: isBelow ? '#22c55e' : isCurrent ? '#f59e0b' : '#ef4444' }}>
                              {isBelow ? '🟢 BUY' : isCurrent ? '⚪ CURRENT' : '🔴 SELL'}
                            </span>
                            <span style={{ fontWeight: '600', color: '#e5e7eb' }}>
                              ${levelPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        )
                      })
                    })()}
                  </div>

                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                    💡 {isSqueeze ? '🤫 Squeeze detected - grid may be less effective' : isRanging ? '✅ Ranging - PERFECT for grid trading' : '⚠️ Trending - use fewer levels'}
                  </div>
                </div>

                {/* STRATEGY 3: Breakout Capture (Dynamic) */}
                <div style={{
                  background: bestStrategy === 'breakout' ? 'rgba(249, 115, 22, 0.15)' : 'rgba(249, 115, 22, 0.08)',
                  border: bestStrategy === 'breakout' ? '3px solid #f59e0b' : '2px solid rgba(249, 115, 22, 0.3)',
                  borderRadius: '14px',
                  padding: '14px',
                  position: 'relative',
                  opacity: scores.breakout < 40 ? 0.7 : 1,
                }}>
                  {bestStrategy === 'breakout' && (
                    <div style={{ position: 'absolute', top: '-10px', right: '10px', background: '#f59e0b', color: '#fff', fontSize: '9px', fontWeight: '700', padding: '3px 10px', borderRadius: '10px' }}>
                      ⭐ BEST MATCH
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '20px' }}>🚀</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#f59e0b' }}>BREAKOUT CAPTURE</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>Ride the momentum</div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: '10px', background: scores.breakout >= 70 ? 'rgba(249, 115, 22, 0.2)' : scores.breakout >= 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(107, 114, 128, 0.2)', color: scores.breakout >= 70 ? '#f59e0b' : scores.breakout >= 40 ? '#f59e0b' : '#6b7280', padding: '4px 10px', borderRadius: '6px', fontWeight: '700' }}>
                      Score: {scores.breakout}
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#d1d5db', lineHeight: '1.6', marginBottom: '12px' }}>
                    Enter when price breaks key levels with momentum. Use trailing stop to lock profits.
                  </div>

                  {/* Dynamic Entry Levels */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px' }}>
                      ENTRY LEVELS ({trendUp ? 'LOOKING UP' : 'LOOKING DOWN'}):
                    </div>
                    <div style={{
                      background: trendUp ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      padding: '10px 10px',
                      borderRadius: '8px',
                      marginBottom: '6px',
                      border: `1px solid ${trendUp ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                        <span style={{ color: trendUp ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                          {trendUp ? '🟢 LONG ENTRY' : '🔴 SHORT ENTRY'}
                        </span>
                        <span style={{ color: '#e5e7eb', fontWeight: '700' }}>
                          ${trendUp ? bbUpper.toLocaleString(undefined, { maximumFractionDigits: 0 }) : bbLower.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '2px' }}>
                        {trendUp ? 'Break above BB Upper with volume' : 'Break below BB Lower with volume'}
                      </div>
                    </div>
                    <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                      🎯 Trailing Stop: {(atr * 2).toLocaleString(undefined, { maximumFractionDigits: 0 })} from entry
                    </div>
                  </div>

                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                    💡 {isStrongTrend ? '✅ Strong trend detected - good for breakout' : isSqueeze ? '🤫 Squeeze - breakout imminent!' : '⚠️ Weak trend - wait'}
                  </div>
                </div>

                {/* STRATEGY 4: Dollar Cost Average (DCA) */}
                <div style={{
                  background: 'rgba(168, 85, 247, 0.08)',
                  border: '2px solid rgba(168, 85, 247, 0.3)',
                  borderRadius: '14px',
                  padding: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '20px' }}>🤖</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#a855f7' }}>SMART DCA</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>Passive accumulation</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#d1d5db', lineHeight: '1.6', marginBottom: '12px' }}>
                    Buy fixed amounts regularly. Lower your average cost over time. Perfect for long-term holders.
                  </div>

                  {/* DCA Schedule */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px' }}>WEEKLY DCA PLAN:</div>
                    {['Monday', 'Wednesday', 'Friday'].map((day, i) => (
                      <div key={day} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        marginBottom: '4px',
                        borderRadius: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        fontSize: '10px',
                      }}>
                        <span style={{ color: '#9ca3af' }}>{day}</span>
                        <span style={{ fontWeight: '600', color: '#a855f7' }}>$100 • Market Order</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                    💡 Total weekly: $300. Adjust based on your budget. Auto-invest removes emotion.
                  </div>
                </div>

                {/* STRATEGY 5: Swing Trading */}
                <div style={{
                  background: 'rgba(236, 72, 153, 0.08)',
                  border: '2px solid rgba(236, 72, 153, 0.3)',
                  borderRadius: '14px',
                  padding: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '20px' }}>🌊</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#ec4899' }}>SWING TRADING</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>Catch the waves</div>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: '#d1d5db', lineHeight: '1.6', marginBottom: '12px' }}>
                    Enter at support, exit at resistance. Hold for days to weeks. Use indicators for timing.
                  </div>

                  {/* Swing Trade Setup */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px' }}>CURRENT SWING SETUP:</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div style={{
                        background: 'rgba(34, 197, 94, 0.15)',
                        padding: '10px',
                        borderRadius: '8px',
                        textAlign: 'center',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      }}>
                        <div style={{ fontSize: '9px', color: '#22c55e', marginBottom: '4px' }}>📉 BUY ZONE</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
                          ${(support * 0.98).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        <div style={{ fontSize: '9px', color: '#9ca3af' }}>to {support.toLocaleString()}</div>
                      </div>
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        padding: '10px',
                        borderRadius: '8px',
                        textAlign: 'center',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}>
                        <div style={{ fontSize: '9px', color: '#ef4444', marginBottom: '4px' }}>📈 SELL ZONE</div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#fff' }}>
                          ${resistance.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '9px', color: '#9ca3af' }}>to {(resistance * 1.02).toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: '10px', color: '#9ca3af' }}>
                    💡 Target: 5-10% per swing. Use RSI {'<'} 30 for buy, {'>'} 70 for sell signals.
                  </div>
                </div>

                {/* STRATEGY 6: Options/Leverage (Advanced) */}
                <div style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '2px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '14px',
                  padding: '14px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ fontSize: '20px' }}>⚡</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#ef4444' }}>LEVERAGED PLAYS</div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>High risk, high reward</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '9px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '3px 8px', borderRadius: '6px', fontWeight: '600' }}>
                      ADVANCED
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: '#d1d5db', lineHeight: '1.6', marginBottom: '12px' }}>
                    Use leverage to amplify gains. Only for experienced traders with strict risk management.
                  </div>

                  {/* Leverage Setup */}
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#9ca3af', marginBottom: '6px' }}>LEVERAGE TIERS:</div>
                    {[
                      { lev: '3x', risk: 'Moderate', size: '$1,000 → $3,000' },
                      { lev: '5x', risk: 'High', size: '$1,000 → $5,000' },
                      { lev: '10x', risk: 'Extreme', size: '$1,000 → $10,000' },
                    ].map((t) => (
                      <div key={t.lev} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        marginBottom: '4px',
                        borderRadius: '6px',
                        background: 'rgba(0,0,0,0.3)',
                        fontSize: '10px',
                      }}>
                        <span style={{ color: t.risk === 'Moderate' ? '#22c55e' : t.risk === 'High' ? '#f59e0b' : '#ef4444' }}>
                          {t.lev}
                        </span>
                        <span style={{ color: '#9ca3af' }}>{t.risk}</span>
                        <span style={{ fontWeight: '600', color: '#e5e7eb' }}>{t.size}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px dashed rgba(239, 68, 68, 0.4)',
                    fontSize: '10px',
                    color: '#ef4444'
                  }}>
                    ⚠️ Warning: 10% move = liquidation at 10x leverage. Use stop-loss strictly!
                  </div>
                </div>

              </div>

              {/* Strategy Comparison Table */}
              <div style={{
                marginTop: '16px',
                padding: '14px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#a78bfa', marginBottom: '10px' }}>
                  📋 STRATEGY COMPARISON
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px', fontSize: '10px' }}>
                  <div style={{ color: '#6b7280' }}>
                    <span style={{ color: '#9ca3af', fontWeight: '600' }}>Strategy</span>
                  </div>
                  <div style={{ color: '#6b7280' }}>
                    <span style={{ color: '#9ca3af', fontWeight: '600' }}>Risk</span>
                  </div>
                  <div style={{ color: '#6b7280' }}>
                    <span style={{ color: '#9ca3af', fontWeight: '600' }}>Best Market</span>
                  </div>
                  <div style={{ color: '#6b7280' }}>
                    <span style={{ color: '#9ca3af', fontWeight: '600' }}>Timeframe</span>
                  </div>

                  {/* 2 Traps */}
                  <div style={{ fontWeight: '600', color: '#22c55e' }}>🪤 2 Traps</div>
                  <div style={{ color: '#22c55e' }}>Low</div>
                  <div style={{ color: '#9ca3af' }}>Trending</div>
                  <div style={{ color: '#9ca3af' }}>Days-Weeks</div>

                  {/* Grid */}
                  <div style={{ fontWeight: '600', color: '#3b82f6' }}>📊 Grid</div>
                  <div style={{ color: '#22c55e' }}>Low</div>
                  <div style={{ color: '#9ca3af' }}>Ranging</div>
                  <div style={{ color: '#9ca3af' }}>Continuous</div>

                  {/* Breakout */}
                  <div style={{ fontWeight: '600', color: '#f59e0b' }}>🚀 Breakout</div>
                  <div style={{ color: '#f59e0b' }}>Medium</div>
                  <div style={{ color: '#9ca3af' }}>Volatile</div>
                  <div style={{ color: '#9ca3af' }}>Hours-Days</div>

                  {/* DCA */}
                  <div style={{ fontWeight: '600', color: '#a855f7' }}>🤖 DCA</div>
                  <div style={{ color: '#22c55e' }}>Very Low</div>
                  <div style={{ color: '#9ca3af' }}>Any</div>
                  <div style={{ color: '#9ca3af' }}>Months+</div>

                  {/* Swing */}
                  <div style={{ fontWeight: '600', color: '#ec4899' }}>🌊 Swing</div>
                  <div style={{ color: '#f59e0b' }}>Medium</div>
                  <div style={{ color: '#9ca3af' }}>Trending</div>
                  <div style={{ color: '#9ca3af' }}>Days-Weeks</div>

                  {/* Leverage */}
                  <div style={{ fontWeight: '600', color: '#ef4444' }}>⚡ Leverage</div>
                  <div style={{ color: '#ef4444' }}>Very High</div>
                  <div style={{ color: '#9ca3af' }}>Strong Trend</div>
                  <div style={{ color: '#9ca3af' }}>Hours</div>
                </div>
              </div>
            </>
          )
        })()}
      </div>

      {/* 📊 CONFIDENCE INTERVAL & LIQUIDATION RISK - What price WON&apos;T reach */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(15, 23, 42, 1) 100%)',
        border: '1px solid rgba(34, 197, 94, 0.3)',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              📊
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>
                PRICE CONFIDENCE INTERVALS
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                Where price WON&apos;T go with 95% and 99% confidence
              </div>
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>
            Based on {selectedAsset} volatility (ATR: ${marketData[selectedAsset].atr})
          </div>
        </div>

        {(() => {
          const data = marketData[selectedAsset]
          const atr = data.atr
          const currentPrice = data.price

          // Calculate confidence intervals using ATR as proxy for standard deviation
          // 95% confidence = ~2 standard deviations
          // 99% confidence = ~2.6 standard deviations
          const volatility95 = atr * 2
          const volatility99 = atr * 2.6

          // Price ranges with confidence
          const wontGoBelow95 = Math.max(0, currentPrice - volatility95)
          const wontGoAbove95 = currentPrice + volatility95
          const wontGoBelow99 = Math.max(0, currentPrice - volatility99)
          const wontGoAbove99 = currentPrice + volatility99

          // Calculate liquidation prices based on current settings
          const riskAmount = ACCOUNT_SETTINGS.balance * (riskPercent / 100)
          const leverageSize = currentPrice * leverage
          const liquidationPriceLong = currentPrice - (riskAmount / leverageSize) * currentPrice
          const liquidationPriceShort = currentPrice + (riskAmount / leverageSize) * currentPrice

          // Entry confidence - how confident are we at this price level?
          const inOversold = data.rsi < 30 && data.price < data.bollingerBands.lower
          const inOverbought = data.rsi > 70 && data.price > data.bollingerBands.upper
          const trendAligned = data.ema.ema9 > data.ema.ema21
          const entryConfidence = Math.min(95, Math.max(50,
            (inOversold ? 30 : 0) +
            (trendAligned ? 25 : 0) +
            (data.adx > 25 ? 20 : 0) +
            (data.macd.histogram > 0 ? 15 : 0) +
            (inOverbought ? -25 : 0)
          ))

          return (
            <div>
              {/* Main Confidence Display */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                {/* 95% Won&apos;t Go Below */}
                <div style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '12px',
                  padding: '12px',
                }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>📉 95% Won&apos;t Go BELOW</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: '#22c55e' }}>
                    ${wontGoBelow95.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>High confidence downside protection</div>
                </div>

                {/* 95% Won&apos;t Go Above */}
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '12px',
                  padding: '12px',
                }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>📈 95% Won&apos;t Go ABOVE</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: '#ef4444' }}>
                    ${wontGoAbove95.toLocaleString()}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>High confidence upside resistance</div>
                </div>

                {/* Liquidation Risk */}
                <div style={{
                  background: currentPrice > data.bollingerBands.middle ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                  border: currentPrice > data.bollingerBands.middle ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '12px',
                  padding: '12px',
                }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>⚠️ LIQUIDATION PRICE</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: '#f59e0b' }}>
                    ${liquidationPriceLong.toLocaleString(undefined, {maximumFractionDigits: 0})}
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>With ${leverage}x leverage @ {riskPercent}% risk</div>
                </div>

                {/* Entry Confidence */}
                <div style={{
                  background: entryConfidence > 70 ? 'rgba(34, 197, 94, 0.1)' : entryConfidence < 50 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                  border: entryConfidence > 70 ? '1px solid rgba(34, 197, 94, 0.3)' : entryConfidence < 50 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '12px',
                  padding: '12px',
                }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>🎯 ENTRY CONFIDENCE</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: entryConfidence > 70 ? '#22c55e' : entryConfidence < 50 ? '#ef4444' : '#f59e0b' }}>
                    {entryConfidence}%
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>
                    {entryConfidence > 70 ? '✓ Good entry zone' : entryConfidence < 50 ? '✗ Wait for better level' : '⚠️ Moderate'}
                  </div>
                </div>
              </div>

              {/* Visual Price Range Display */}
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '12px',
                padding: '14px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '10px' }}>
                  📍 99% CONFIDENCE PRICE RANGE
                </div>

                {/* Visual range bar */}
                <div style={{ position: 'relative', height: '40px', marginBottom: '8px' }}>
                  {/* Background track */}
                  <div style={{
                    position: 'absolute',
                    left: '0%',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '100%',
                    height: '24px',
                    background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 20%, #22c55e 40%, #10b981 60%, #f59e0b 80%, #ef4444 100%)',
                    borderRadius: '12px',
                  }} />

                  {/* Current price marker */}
                  <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10,
                  }}>
                    <div style={{
                      background: '#fff',
                      padding: '4px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                      whiteSpace: 'nowrap'
                    }}>
                      ${currentPrice.toLocaleString()}
                    </div>
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      fontSize: '10px',
                      color: '#fff',
                      marginTop: '2px',
                      fontWeight: '600'
                    }}>
                      CURRENT
                    </div>
                  </div>

                  {/* 95% Lower bound */}
                  <div style={{
                    position: 'absolute',
                    left: '10%',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}>
                    <div style={{ fontSize: '10px', color: '#fff', opacity: 0.8 }}>95% low</div>
                  </div>

                  {/* 95% Upper bound */}
                  <div style={{
                    position: 'absolute',
                    right: '10%',
                    top: '50%',
                    transform: 'translateY(-50%)',
                  }}>
                    <div style={{ fontSize: '10px', color: '#fff', opacity: 0.8 }}>95% high</div>
                  </div>
                </div>

                {/* Range labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9ca3af' }}>
                  <span>🔴 Safe Zone (Won&apos;t break below): ${wontGoBelow99.toLocaleString()}</span>
                  <span>🔴 Safe Zone (Won&apos;t exceed): ${wontGoAbove99.toLocaleString()}</span>
                </div>
              </div>

              {/* Quick Trading Guidance */}
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: entryConfidence > 70
                  ? 'rgba(34, 197, 94, 0.1)'
                  : entryConfidence < 50
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(245, 158, 11, 0.1)',
                borderRadius: '10px',
                border: `1px solid ${entryConfidence > 70 ? '#22c55e' : entryConfidence < 50 ? '#ef4444' : '#f59e0b'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <Info style={{ width: '14px', height: '14px', color: entryConfidence > 70 ? '#22c55e' : entryConfidence < 50 ? '#ef4444' : '#f59e0b' }} />
                  <span style={{ fontSize: '12px', fontWeight: '600', color: entryConfidence > 70 ? '#22c55e' : entryConfidence < 50 ? '#ef4444' : '#f59e0b' }}>
                    TRADING GUIDANCE
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#d1d5db', lineHeight: '1.5' }}>
                  {entryConfidence > 70
                    ? `✓ Entry opportunity detected. Consider small position. Stop loss: $${wontGoBelow95.toLocaleString()} (95% confidence)`
                    : entryConfidence < 50
                    ? `✗ Wait for better entry. Current zone has high uncertainty. Consider ${data.price < data.bollingerBands.lower ? 'waiting for oversold' : data.price > data.bollingerBands.upper ? 'waiting for overbought' : 'waiting for clearer signals'}`
                    : `⚠️ Moderate confidence. Consider smaller position size. Set stop loss below $${wontGoBelow95.toLocaleString()}`
                  }
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* 📊 SIMPLE INDICATOR SUMMARY - Easy to understand */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(15, 23, 42, 1) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '16px',
        padding: '16px',
        marginBottom: '12px',
      }}>
        {/* Header with Price and Overall Signal */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '2px' }}>CURRENT PRICE</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#fff', letterSpacing: '-1px' }}>
                ${marketData[selectedAsset].price.toLocaleString()}
              </div>
              <div style={{
                fontSize: '14px',
                color: marketData[selectedAsset].change24h >= 0 ? '#22c55e' : '#ef4444',
                fontWeight: '600'
              }}>
                {marketData[selectedAsset].change24h >= 0 ? '+' : ''}{marketData[selectedAsset].change24h}%
              </div>
            </div>
          </div>

          {/* Overall Signal - Big and Clear */}
          {(() => {
            const data = marketData[selectedAsset]
            const bullishCount = [
              data.rsi > 30 && data.rsi < 70,
              data.macd.histogram > 0,
              data.ema.ema9 > data.ema.ema21,
              data.price > data.bollingerBands.middle,
              data.adx > 20
            ].filter(Boolean).length

            const bearishCount = [
              data.rsi > 70,
              data.macd.histogram < 0,
              data.ema.ema9 < data.ema.ema21,
              data.price < data.bollingerBands.middle
            ].filter(Boolean).length

            let signal = 'NEUTRAL'
            let signalColor = '#f59e0b'
            let bgColor = 'rgba(245, 158, 11, 0.2)'
            let emoji = '⏸️'

            if (bullishCount >= 3) {
              signal = 'BUY'
              signalColor = '#22c55e'
              bgColor = 'rgba(34, 197, 94, 0.2)'
              emoji = '🟢'
            } else if (bearishCount >= 3) {
              signal = 'SELL'
              signalColor = '#ef4444'
              bgColor = 'rgba(239, 68, 68, 0.2)'
              emoji = '🔴'
            }

            return (
              <div style={{
                background: bgColor,
                border: `2px solid ${signalColor}`,
                borderRadius: '16px',
                padding: '16px 32px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '4px' }}>OVERALL SIGNAL</div>
                <div style={{ fontSize: '32px', fontWeight: '900', color: signalColor, letterSpacing: '2px' }}>
                  {emoji} {signal}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Simple Traffic Light Indicators */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {([
            { name: 'RSI', value: marketData[selectedAsset].rsi, good: marketData[selectedAsset].rsi > 30 && marketData[selectedAsset].rsi < 70 },
            { name: 'MACD', value: marketData[selectedAsset].macd.histogram, good: marketData[selectedAsset].macd.histogram > 0, format: (v: number) => v > 0 ? '+' : '' + v.toFixed(1) },
            { name: 'Trend', value: marketData[selectedAsset].adx, good: marketData[selectedAsset].adx > 25, format: (v: number) => v.toFixed(0) },
            { name: 'Astronacci', value: astronacci.strength, good: astronacci.signal === 'BULLISH', format: (v: number) => v },
          ] as const).map((ind, i) => (
            <div key={i} style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '10px',
              padding: '10px 16px',
              textAlign: 'center',
              minWidth: '100px',
              border: ind.good ? '2px solid #22c55e' : '2px solid #374151'
            }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>{ind.name}</div>
              <div style={{ fontSize: '20px', fontWeight: '700', color: ind.good ? '#22c55e' : '#9ca3af' }}>
                {'format' in ind && ind.format ? ind.format(ind.value) : ind.value}
              </div>
              <div style={{ fontSize: '10px', color: ind.good ? '#22c55e' : '#6b7280' }}>
                {ind.good ? '✓ Good' : 'Wait'}
              </div>
            </div>
          ))}
        </div>

        {/* Simple explanation */}
        <div style={{
          marginTop: '12px',
          padding: '12px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '10px',
          fontSize: '12px',
          color: '#9ca3af',
          textAlign: 'center',
          border: '1px solid rgba(255,255,255,0.05)'
        }}>
          <span style={{ color: '#a78bfa' }}>💡 Tip:</span> Green = Good for buying, Red = Wait, Yellow = Neutral
        </div>
      </div>

      {/* 🤖 AUTONOMY INDICATOR - Shows Agent Activity */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(15, 23, 42, 0.95) 100%)',
        border: '1px solid rgba(99, 102, 241, 0.3)',
        borderRadius: '14px',
        padding: '14px 16px',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Sparkles style={{ width: '16px', height: '16px', color: '#fff' }} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#e5e7eb' }}>
                {selectedAsset} INDICATOR SUMMARY
              </div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>
                Real-time technical & astronomical analysis
              </div>
            </div>
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#fff' }}>
            ${marketData[selectedAsset].price.toLocaleString()}
          </div>
        </div>

        {/* Two-row grid for indicators */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
          {/* RSI */}
          {(() => {
            const rsi = marketData[selectedAsset].rsi
            const rsiSignal = rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL'
            const rsiColor = rsi < 30 ? '#22c55e' : rsi > 70 ? '#ef4444' : '#9ca3af'
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>RSI (14)</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: rsiColor }}>{rsi.toFixed(1)}</div>
                <div style={{ fontSize: '9px', color: rsiColor }}>{rsiSignal}</div>
              </div>
            )
          })()}

          {/* MACD */}
          {(() => {
            const macd = marketData[selectedAsset].macd
            const macdSignal = macd.histogram > 0 ? 'BULLISH' : 'BEARISH'
            const macdColor = macd.histogram > 0 ? '#22c55e' : '#ef4444'
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>MACD</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: macdColor }}>{macdSignal.charAt(0)}</div>
                <div style={{ fontSize: '9px', color: macdColor }}>{macd.histogram.toFixed(1)}</div>
              </div>
            )
          })()}

          {/* Bollinger Bands */}
          {(() => {
            const bb = marketData[selectedAsset].bollingerBands
            const bbPosition = marketData[selectedAsset].price > bb.upper ? 'ABOVE UPPER'
              : marketData[selectedAsset].price < bb.lower ? 'BELOW LOWER'
              : bb.squeeze ? 'SQUEEZE' : 'MID BAND'
            const bbColor = bbPosition === 'BELOW LOWER' ? '#22c55e' : bbPosition === 'ABOVE UPPER' ? '#ef4444' : '#9ca3af'
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Bollinger</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: bbColor }}>{bbPosition}</div>
                <div style={{ fontSize: '9px', color: bb.squeeze ? '#f59e0b' : '#6b7280' }}>
                  {bb.squeeze ? 'Squeeze Alert!' : `${bb.lower.toLocaleString()} - ${bb.upper.toLocaleString()}`}
                </div>
              </div>
            )
          })()}

          {/* ADX/Trend */}
          {(() => {
            const adx = marketData[selectedAsset].adx
            const trend = adx > 25 ? 'TRENDING' : 'RANGING'
            const trendColor = adx > 25 ? '#22c55e' : '#9ca3af'
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>ADX (Trend)</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: trendColor }}>{adx.toFixed(1)}</div>
                <div style={{ fontSize: '9px', color: trendColor }}>{trend}</div>
              </div>
            )
          })()}

          {/* Stochastic */}
          {(() => {
            const stoch = marketData[selectedAsset].stochastic
            const stochSignal = stoch.k > stoch.d ? 'BULLISH' : 'BEARISH'
            const stochColor = stoch.k > 80 ? '#ef4444' : stoch.k < 20 ? '#22c55e' : '#9ca3af'
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Stochastic</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: stochColor }}>
                  {stoch.k.toFixed(0)}% / {stoch.d.toFixed(0)}%
                </div>
                <div style={{ fontSize: '9px', color: stochColor }}>{stochSignal}</div>
              </div>
            )
          })()}

          {/* EMA Stack */}
          {(() => {
            const ema = marketData[selectedAsset].ema
            const emaBullish = ema.ema9 > ema.ema21 && ema.ema21 > ema.ema50
            const emaSignal = emaBullish ? 'BULLISH STACK' : 'BEARISH STACK'
            const emaColor = emaBullish ? '#22c55e' : '#ef4444'
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>EMA Stack</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: emaColor }}>{emaBullish ? '▲▲▲' : '▼▼▼'}</div>
                <div style={{ fontSize: '9px', color: emaColor }}>{emaSignal}</div>
              </div>
            )
          })()}

          {/* OBV */}
          {(() => {
            const obv = marketData[selectedAsset].obv
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>OBV</div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: '#e5e7eb' }}>{obv}</div>
                <div style={{ fontSize: '9px', color: '#6b7280' }}>Volume Flow</div>
              </div>
            )
          })()}

          {/* Trend Direction */}
          {(() => {
            const trend = marketData[selectedAsset].trend
            const trendColor = trend === 'BULLISH' ? '#22c55e' : trend === 'BEARISH' ? '#ef4444' : '#9ca3af'
            return (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>Trend</div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: trendColor }}>
                  {trend === 'BULLISH' ? '▲' : trend === 'BEARISH' ? '▼' : '▬'} {trend}
                </div>
                <div style={{ fontSize: '9px', color: trendColor }}>Overall Direction</div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* 🤖 AUTONOMY INDICATOR - Shows Agent Activity */}
      {swarmStatus && (
        <div style={{
          background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: swarmStatus.isActive ? 'rgba(34, 197, 94, 0.2)' : 'rgba(107, 114, 128, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}>
                🤖
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#10b981' }}>
                  Autonomous Agents {swarmStatus.isActive ? 'ACTIVE' : 'IDLE'}
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                  {swarmStatus.stats?.activeAgents || 0} agents working • {swarmStatus.stats?.totalImprovements || 0} improvements made
                </div>
              </div>
            </div>

            {/* Agent Status Pills */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {swarmStatus.agents?.slice(0, 4).map((agent: any) => (
                <div key={agent.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  background: agent.status === 'working'
                    ? 'rgba(34, 197, 94, 0.2)'
                    : 'rgba(107, 114, 128, 0.2)',
                  border: agent.status === 'working'
                    ? '1px solid rgba(34, 197, 94, 0.3)'
                    : '1px solid rgba(107, 114, 128, 0.2)',
                }}>
                  <span>{agent.icon}</span>
                  <span style={{
                    color: agent.status === 'working' ? '#22c55e' : '#6b7280',
                    fontSize: '10px',
                  }}>
                    {agent.status === 'working' ? 'Working' : 'Idle'}
                  </span>
                </div>
              ))}
            </div>

            {/* View Swarm Link */}
            <a
              href="/swarm"
              style={{
                fontSize: '11px',
                color: '#8b5cf6',
                textDecoration: 'none',
                background: 'rgba(139, 92, 246, 0.1)',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(139, 92, 246, 0.2)',
              }}
            >
              View Dashboard →
            </a>
          </div>

          {/* Recent Agent Activity */}
          {swarmStatus.activities && swarmStatus.activities.length > 0 && (
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>
                Latest Agent Activity:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {swarmStatus.activities.slice(0, 3).map((activity: any) => (
                  <div key={activity.id} style={{
                    fontSize: '10px',
                    padding: '4px 10px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    borderRadius: '6px',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    <span>{activity.agentIcon}</span>
                    <span>{activity.message.length > 50 ? activity.message.substring(0, 50) + '...' : activity.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 🌙 ASTRONACCI INDICATOR - Astrological + Fibonacci Analysis */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(16, 185, 129, 0.1) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
        borderRadius: '14px',
        padding: '16px',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}>
              🌙
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#a78bfa' }}>ASTRONACCI</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Astrological + Fibonacci Cycles</div>
            </div>
          </div>
          <div style={{
            background: 'rgba(139, 92, 246, 0.2)',
            padding: '8px 16px',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: '700',
            color: '#a78bfa',
            border: '1px solid rgba(139, 92, 246, 0.3)',
          }}>
            {astronacci.signal} ({astronacci.strength}/100)
          </div>
        </div>

        {/* Astronacci Components */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {/* Lunar Phase */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '10px',
            padding: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              🌕 Lunar Phase
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#e5e7eb', marginBottom: '4px' }}>
              {astronacci.lunarPhase}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Illumination: {astronacci.illumination}%
            </div>
            <div style={{ fontSize: '10px', color: astronacci.lunarSentiment.includes('High') ? '#f59e0b' : '#6b7280', marginTop: '4px' }}>
              {astronacci.lunarSentiment}
            </div>
          </div>

          {/* Mercury Retrograde */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '10px',
            padding: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ☿ Mercury Status
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: astronacci.mercuryRetrograde ? '#f59e0b' : '#22c55e', marginBottom: '4px' }}>
              {astronacci.mercuryRetrograde ? '⚠️ RETROGRADE' : '✅ DIRECT'}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              {astronacci.mercuryRetrograde ? 'Market confusion likely' : 'Clear communication favored'}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
              Days until change: {astronacci.mercuryDaysUntilChange}
            </div>
          </div>

          {/* Fibonacci Time Cycle */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '10px',
            padding: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              📐 Fibonacci Cycle
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#10b981', marginBottom: '4px' }}>
              Day {astronacci.fibDay} of {astronacci.fibCycle}
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Fibonacci sequence: {astronacci.fibCycle}-day cycle
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
              Next pivot in ~{astronacci.nextFibPivot} days
            </div>
          </div>

          {/* Golden Ratio Alignment */}
          <div style={{
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '10px',
            padding: '12px',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ✨ Golden Ratio (φ)
            </div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#f59e0b', marginBottom: '4px' }}>
              {astronacci.goldenRatioAlignment}%
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              {astronacci.goldenRatioAlignment > 80 ? '🎯 Near φ perfection!' : 'Building toward φ'}
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
              Target: 1.618 (61.8% retracement)
            </div>
          </div>
        </div>

        {/* Astronacci Signal & Reasoning */}
        <div style={{
          marginTop: '12px',
          padding: '12px',
          background: astronacci.signal === 'BULLISH'
            ? 'rgba(34, 197, 94, 0.1)'
            : astronacci.signal === 'BEARISH'
            ? 'rgba(239, 68, 68, 0.1)'
            : 'rgba(107, 114, 128, 0.1)',
          borderRadius: '10px',
          border: `1px solid ${astronacci.signalColor}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '20px' }}>{astronacci.signalEmoji}</span>
            <span style={{ fontSize: '13px', fontWeight: '700', color: astronacci.signalColor }}>
              ASTRONACCI SIGNAL: {astronacci.signal}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#9ca3af', lineHeight: '1.6' }}>
            {astronacci.reasoning.join(' • ')}
          </div>
        </div>
      </div>

      {/* 📈 BTC 4-YEAR HALVING CYCLE - Historical chart showing where we are in the cycle */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.12) 0%, rgba(15, 23, 42, 1) 100%)',
        border: '1px solid rgba(249, 115, 22, 0.3)',
        borderRadius: '14px',
        padding: '16px',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}>
              ₿
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#fb923c' }}>BTC 4-YEAR HALVING CYCLE</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>Historical price action with cycle phases</div>
            </div>
          </div>
          <div style={{
            background: 'rgba(249, 115, 22, 0.2)',
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#fb923c',
          }}>
            {(() => {
              const lastHalving = new Date('2024-04-19')
              const now = new Date()
              const daysSince = Math.floor((now.getTime() - lastHalving.getTime()) / (1000 * 60 * 60 * 24))
              const cycleDay = Math.floor((daysSince / 1461) * 100)
              return `Day ${daysSince} of 1461 (${cycleDay}% of cycle)`
            })()}
          </div>
        </div>

        {/* Historical Price Chart with Cycle Phases */}
        <div style={{
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '12px',
          padding: '16px',
          border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: '12px',
        }}>
          {/* Timeline Chart - Visual representation */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px', fontWeight: '600' }}>
              BTC Price History & Cycle Phases (2019-2025)
            </div>

            {/* Simplified Visual Chart */}
            <div style={{ position: 'relative', height: '120px', marginBottom: '12px' }}>
              {/* Y-axis labels */}
              <div style={{ position: 'absolute', left: '-5px', top: 0, fontSize: '9px', color: '#6b7280' }}>$100K</div>
              <div style={{ position: 'absolute', left: '-5px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: '#6b7280' }}>$50K</div>
              <div style={{ position: 'absolute', left: '-5px', bottom: 0, fontSize: '9px', color: '#6b7280' }}>$0</div>

              {/* Chart grid lines */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: '25%', height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '1px', background: 'rgba(255,255,255,0.1)' }} />
              <div style={{ position: 'absolute', left: 0, right: 0, top: '75%', height: '1px', background: 'rgba(255,255,255,0.1)' }} />

              {/* SVG Line Chart showing BTC history */}
              <svg viewBox="0 0 800 120" style={{ width: '100%', height: '100%' }}>
                {/* 2019-2020 Pre-halving accumulation */}
                <polyline
                  points="0,100 50,95 100,85 150,90 200,80"
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="2"
                />
                {/* 2020 Halving to 2021 Peak */}
                <polyline
                  points="200,80 250,60 300,40 350,20 380,5"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="3"
                />
                {/* 2021-2022 Bear market */}
                <polyline
                  points="380,5 420,30 460,60 500,80 540,90"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                />
                {/* 2022-2023 Accumulation */}
                <polyline
                  points="540,90 580,85 620,80 640,75"
                  fill="none"
                  stroke="#6b7280"
                  strokeWidth="2"
                />
                {/* 2024 Halving rally */}
                <polyline
                  points="640,75 680,50 720,30 750,25 780,15"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="3"
                />
                {/* Current position marker */}
                <circle cx="780" cy="15" r="6" fill="#f97316" stroke="#fff" strokeWidth="2" />

                {/* Halving markers */}
                <line x1="200" y1="0" x2="200" y2="120" stroke="#f97316" strokeWidth="2" strokeDasharray="4,4" />
                <line x1="640" y1="0" x2="640" y2="120" stroke="#f97316" strokeWidth="2" strokeDasharray="4,4" />
              </svg>

              {/* X-axis labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '9px', color: '#6b7280' }}>
                <span>2019</span>
                <span style={{ color: '#f97316', fontWeight: '600' }}>2020 Halving</span>
                <span>2021 Peak</span>
                <span>2022 Low</span>
                <span style={{ color: '#f97316', fontWeight: '600' }}>2024 Halving</span>
                <span style={{ color: '#f97316', fontWeight: '600' }}>Now</span>
              </div>
            </div>
          </div>

          {/* Cycle Phase Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            {[
              { phase: 'Post-Halving', color: '#f97316', period: '0-6 months', desc: 'Supply shock kicks in' },
              { phase: 'Accumulation', color: '#6b7280', period: '6-12 months', desc: 'Smart money builds position' },
              { phase: 'Markup', color: '#22c55e', period: '12-24 months', desc: 'Price discovery phase' },
              { phase: 'Bull Run', color: '#10b981', period: '18-30 months', desc: 'Parabolic advance' },
              { phase: 'Distribution', color: '#ef4444', period: '30-42 months', desc: 'Peak and decline' },
              { phase: 'Bear Market', color: '#991b1b', period: '42-48 months', desc: 'Capitulation phase' },
            ].map((p, i) => (
              <div key={i} style={{
                background: 'rgba(0,0,0,0.4)',
                borderRadius: '8px',
                padding: '10px',
                border: `1px solid ${p.color}40`,
                opacity: (() => {
                  const lastHalving = new Date('2024-04-19')
                  const now = new Date()
                  const monthsSince = (now.getTime() - lastHalving.getTime()) / (1000 * 60 * 60 * 24 * 30)
                  if (monthsSince < 6) return i === 0 ? 1 : 0.4
                  if (monthsSince < 12) return i <= 1 ? 1 : 0.4
                  if (monthsSince < 24) return i <= 2 ? 1 : 0.4
                  if (monthsSince < 30) return i <= 3 ? 1 : 0.4
                  if (monthsSince < 42) return i <= 4 ? 1 : 0.4
                  return 1
                })(),
              }}>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginBottom: '4px' }}>{p.period}</div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: p.color, marginBottom: '2px' }}>{p.phase}</div>
                <div style={{ fontSize: '9px', color: '#6b7280' }}>{p.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Current Cycle Analysis & Projections */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {/* Where We Are Now */}
          <div style={{
            background: 'rgba(249, 115, 22, 0.1)',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '10px',
            padding: '12px',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>📍 CURRENT CYCLE PHASE</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#fb923c', marginBottom: '4px' }}>
              Post-Halving Markup
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              ~11 months since April 2024 halving. Historically, this is when BTC begins major price discovery.
            </div>
          </div>

          {/* Historical Pattern */}
          <div style={{
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '10px',
            padding: '12px',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>📊 HISTORICAL PATTERN</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e', marginBottom: '4px' }}>
              12-18 Month Peak
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Previous cycles saw peaks 12-18 months post-halving. Target window: Q2-Q4 2025
            </div>
          </div>

          {/* Price Projection */}
          <div style={{
            background: 'rgba(139, 92, 246, 0.1)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '10px',
            padding: '12px',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>🎯 CYCLE PROJECTION</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#a78bfa', marginBottom: '4px' }}>
              $120K - $180K
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Based on previous cycle multiples. Conservative: +50%, Aggressive: +150%
            </div>
          </div>

          {/* Risk Assessment */}
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '10px',
            padding: '12px',
          }}>
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px' }}>⚠️ CYCLE RISK</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#ef4444', marginBottom: '4px' }}>
              2026 Bear Coming
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af' }}>
              Next halving: 2028. Expect peak in late 2025, bear throughout 2026-2027
            </div>
          </div>
        </div>

        {/* Key Dates Timeline */}
        <div style={{
          marginTop: '12px',
          padding: '12px',
          background: 'rgba(0,0,0,0.3)',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', fontWeight: '600' }}>
            📅 BITCOIN HALVING HISTORY
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {[
              { date: 'Nov 2012', reward: '25 BTC', peak: '$1,150 (2013)' },
              { date: 'Jul 2016', reward: '12.5 BTC', peak: '$19,700 (2017)' },
              { date: 'May 2020', reward: '6.25 BTC', peak: '$69,000 (2021)' },
              { date: 'Apr 2024', reward: '3.125 BTC', peak: 'TBD (Expected 2025)' },
            ].map((h, i) => (
              <div key={i} style={{
                padding: '8px 12px',
                background: i === 3 ? 'rgba(249, 115, 22, 0.2)' : 'rgba(107, 114, 128, 0.1)',
                borderRadius: '8px',
                border: i === 3 ? '1px solid rgba(249, 115, 22, 0.4)' : '1px solid rgba(107, 114, 128, 0.2)',
              }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: i === 3 ? '#fb923c' : '#9ca3af' }}>{h.date}</div>
                <div style={{ fontSize: '10px', color: '#6b7280' }}>{h.reward}</div>
                <div style={{ fontSize: '10px', color: i === 3 ? '#fb923c' : '#22c55e' }}>{h.peak}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Market Overview Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '10px',
        marginBottom: '12px',
      }}>
        {/* Fear & Greed */}
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '10px',
          padding: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Flame style={{ width: '12px', height: '12px' }} />
              Fear & Greed
            </span>
            <span style={{ fontSize: '10px', color: marketOverviewData.fearAndGreed.change > 0 ? '#22c55e' : '#ef4444' }}>
              {marketOverviewData.fearAndGreed.change > 0 ? '+' : ''}{marketOverviewData.fearAndGreed.change}
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
            {marketOverviewData.fearAndGreed.value}
          </div>
          <div style={{
            fontSize: '11px',
            color: marketOverviewData.fearAndGreed.value > 50 ? '#22c55e' : '#ef4444',
            fontWeight: '500',
          }}>
            {marketOverviewData.fearAndGreed.label}
          </div>
          <div style={{ marginTop: '8px', height: '4px', background: '#1f2937', borderRadius: '2px' }}>
            <div style={{
              width: `${marketOverviewData.fearAndGreed.value}%`,
              height: '100%',
              background: `linear-gradient(90deg, #ef4444 0%, #f59e0b 50%, #22c55e 100%)`,
              borderRadius: '2px',
            }} />
          </div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            {marketOverviewData.fearAndGreed.value > 60 ? '😊 Greedy = prices may drop soon' : marketOverviewData.fearAndGreed.value < 40 ? '😰 Fearful = buying opportunity' : '😐 Neutral market sentiment'}
          </div>
        </div>

        {/* BTC Dominance */}
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '10px',
          padding: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Coins style={{ width: '12px', height: '12px' }} />
              BTC Dominance
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
            {marketOverviewData.btcDominance.value}%
          </div>
          <div style={{
            fontSize: '11px',
            color: marketOverviewData.btcDominance.change > 0 ? '#22c55e' : '#ef4444',
          }}>
            {marketOverviewData.btcDominance.change > 0 ? '+' : ''}{marketOverviewData.btcDominance.change}%
          </div>
          <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '6px', fontStyle: 'italic' }}>
            BTC&apos;s share of crypto market. High = alts struggling, Low = alts rallying
          </div>
        </div>

        {/* Total Market Cap */}
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '10px',
          padding: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Globe style={{ width: '12px', height: '12px' }} />
              Total Market Cap
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
            ${marketOverviewData.totalMarketCap.value}
          </div>
          <div style={{
            fontSize: '11px',
            color: marketOverviewData.totalMarketCap.change > 0 ? '#22c55e' : '#ef4444',
          }}>
            {marketOverviewData.totalMarketCap.change > 0 ? '+' : ''}{marketOverviewData.totalMarketCap.change}%
          </div>
        </div>

        {/* Open Interest */}
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '10px',
          padding: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers style={{ width: '12px', height: '12px' }} />
              Open Interest
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '700', marginBottom: '4px' }}>
            ${marketOverviewData.openInterest.value}
          </div>
          <div style={{
            fontSize: '11px',
            color: marketOverviewData.openInterest.change > 0 ? '#22c55e' : '#ef4444',
          }}>
            {marketOverviewData.openInterest.change > 0 ? '+' : ''}{marketOverviewData.openInterest.change}%
          </div>
        </div>

        {/* Funding Rates */}
        <div style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '10px',
          padding: '12px',
        }}>
          <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity style={{ width: '12px', height: '12px' }} />
            Funding Rates
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#6b7280' }}>BTC:</span>
              <span style={{ color: marketOverviewData.fundingRates.BTC.rate > 0 ? '#22c55e' : '#ef4444', marginLeft: '4px', fontWeight: '600' }}>
                {marketOverviewData.fundingRates.BTC.rate > 0 ? '+' : ''}{marketOverviewData.fundingRates.BTC.rate}%
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>ETH:</span>
              <span style={{ color: marketOverviewData.fundingRates.ETH.rate > 0 ? '#22c55e' : '#ef4444', marginLeft: '4px', fontWeight: '600' }}>
                {marketOverviewData.fundingRates.ETH.rate > 0 ? '+' : ''}{marketOverviewData.fundingRates.ETH.rate}%
              </span>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>SOL:</span>
              <span style={{ color: marketOverviewData.fundingRates.SOL.rate > 0 ? '#22c55e' : '#ef4444', marginLeft: '4px', fontWeight: '600' }}>
                {marketOverviewData.fundingRates.SOL.rate > 0 ? '+' : ''}{marketOverviewData.fundingRates.SOL.rate}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '12px' }}>
        {/* Left Column - Trading Cards */}
        <div>
          {/* Asset Tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {Object.keys(marketData).map((symbol) => {
              const data = marketData[symbol as keyof typeof marketData]
              const isSelected = selectedAsset === symbol
              return (
                <button
                  key={symbol}
                  onClick={() => setSelectedAsset(symbol as keyof typeof marketData)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: isSelected ? 'rgba(99, 102, 241, 0.2)' : '#111827',
                    border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid #1f2937',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '700', fontSize: '13px' }}>{symbol}</span>
                    <span style={{
                      fontSize: '11px',
                      color: data.change24h > 0 ? '#22c55e' : '#ef4444',
                      fontWeight: '600',
                    }}>
                      {data.change24h > 0 ? '+' : ''}{data.change24h}%
                    </span>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '700', marginTop: '4px' }}>
                    ${data.price.toLocaleString()}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Selected Asset Detail */}
          {(() => {
            const asset = marketData[selectedAsset]
            const rec = calculateRecommendation(selectedAsset)
            const isLong = rec.action === 'LONG'

            return (
              <div style={{
                background: '#111827',
                border: '1px solid #1f2937',
                borderRadius: '14px',
                padding: '16px',
                marginBottom: '12px',
              }}>
                {/* Asset Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '28px', fontWeight: '800' }}>{selectedAsset}</span>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: isLong ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: isLong ? '#22c55e' : '#ef4444',
                      }}>
                        {rec.action} {rec.confidence}%
                      </span>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: '600',
                        background: asset.trend === 'BULLISH' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: asset.trend === 'BULLISH' ? '#22c55e' : '#ef4444',
                      }}>
                        {asset.trend}
                      </span>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
                      ${asset.price.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: asset.change24h > 0 ? '#22c55e' : '#ef4444' }}>
                      {asset.change24h > 0 ? '+' : ''}{asset.change24h}% (24h)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: '11px', color: '#6b7280' }}>
                    <div>Vol: ${asset.volume}</div>
                    <div>ATR: ${asset.atr}</div>
                    <div>OBV: {asset.obv}</div>
                  </div>
                </div>

                {/* Technical Indicators Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {/* RSI */}
                  <div style={{
                    background: '#0f1319',
                    border: '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>RSI (14)</div>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: asset.rsi > 70 ? '#ef4444' : asset.rsi < 30 ? '#22c55e' : '#f59e0b' }}>
                      {asset.rsi.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                      {asset.rsi > 70 ? 'Overbought' : asset.rsi < 30 ? 'Oversold' : 'Neutral'}
                    </div>
                    <div style={{ marginTop: '6px', height: '3px', background: '#1f2937', borderRadius: '2px' }}>
                      <div style={{
                        width: `${asset.rsi}%`,
                        height: '100%',
                        background: asset.rsi > 70 ? '#ef4444' : asset.rsi < 30 ? '#22c55e' : '#f59e0b',
                        borderRadius: '2px',
                      }} />
                    </div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '6px', fontStyle: 'italic' }}>
                      {getRSIExplanation(asset.rsi)}
                    </div>
                  </div>

                  {/* MACD */}
                  <div style={{
                    background: '#0f1319',
                    border: '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>MACD</div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: asset.macd.value > asset.macd.signal ? '#22c55e' : '#ef4444' }}>
                      {asset.macd.value.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                      Signal: {asset.macd.signal.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '10px', marginTop: '4px', fontWeight: '600', color: asset.macd.histogram > 0 ? '#22c55e' : '#ef4444' }}>
                      Hist: {asset.macd.histogram > 0 ? '+' : ''}{asset.macd.histogram.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                      {getMACDExplanation(asset.macd)}
                    </div>
                  </div>

                  {/* Bollinger Bands */}
                  <div style={{
                    background: '#0f1319',
                    border: '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>Bollinger Bands</div>
                    <div style={{ fontSize: '12px', color: '#ef4444' }}>
                      Upper: ${asset.bollingerBands.upper.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      Mid: ${asset.bollingerBands.middle.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#22c55e' }}>
                      Lower: ${asset.bollingerBands.lower.toLocaleString()}
                    </div>
                    {asset.bollingerBands.squeeze && (
                      <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '4px' }}>SQUEEZE!</div>
                    )}
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                      {getBollingerExplanation(asset.price, asset.bollingerBands)}
                    </div>
                  </div>

                  {/* ADX */}
                  <div style={{
                    background: '#0f1319',
                    border: '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>ADX (Trend)</div>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: asset.adx > 25 ? '#22c55e' : '#6b7280' }}>
                      {asset.adx.toFixed(1)}
                    </div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                      {asset.adx > 25 ? 'Strong Trend' : 'Weak/Ranging'}
                    </div>
                    <div style={{ marginTop: '6px', height: '3px', background: '#1f2937', borderRadius: '2px' }}>
                      <div style={{
                        width: `${Math.min(asset.adx * 2, 100)}%`,
                        height: '100%',
                        background: asset.adx > 25 ? '#22c55e' : '#6b7280',
                        borderRadius: '2px',
                      }} />
                    </div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                      {getADXExplanation(asset.adx)}
                    </div>
                  </div>
                </div>

                {/* Secondary Indicators */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                  {/* Stochastic */}
                  <div style={{
                    background: '#0f1319',
                    border: '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>Stochastic</div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#6b7280' }}>%K:</span>
                      <span style={{ fontWeight: '600', marginLeft: '4px' }}>{asset.stochastic.k.toFixed(1)}</span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#6b7280' }}>%D:</span>
                      <span style={{ fontWeight: '600', marginLeft: '4px' }}>{asset.stochastic.d.toFixed(1)}</span>
                    </div>
                    <div style={{
                      fontSize: '10px',
                      marginTop: '4px',
                      color: asset.stochastic.k > asset.stochastic.d ? '#22c55e' : '#ef4444',
                    }}>
                      {asset.stochastic.k > asset.stochastic.d ? 'Bullish Cross' : 'Bearish Cross'}
                    </div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                      {getStochasticExplanation(asset.stochastic.k, asset.stochastic.d)}
                    </div>
                  </div>

                  {/* EMAs */}
                  <div style={{
                    background: '#0f1319',
                    border: '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>Moving Averages</div>
                    <div style={{ fontSize: '11px' }}>
                      <span style={{ color: '#6b7280' }}>EMA 9:</span>
                      <span style={{ fontWeight: '600', marginLeft: '4px' }}>${asset.ema.ema9.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '11px' }}>
                      <span style={{ color: '#6b7280' }}>EMA 21:</span>
                      <span style={{ fontWeight: '600', marginLeft: '4px' }}>${asset.ema.ema21.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '11px' }}>
                      <span style={{ color: '#6b7280' }}>EMA 50:</span>
                      <span style={{ fontWeight: '600', marginLeft: '4px' }}>${asset.ema.ema50.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                      {getEMAExplanation(asset.ema.ema9, asset.ema.ema21, asset.ema.ema50, asset.price)}
                    </div>
                  </div>

                  {/* ATR */}
                  <div style={{
                    background: '#0f1319',
                    border: '1px solid #1f2937',
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '6px' }}>ATR (Volatility)</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#f59e0b' }}>
                      ${asset.atr}
                    </div>
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                      {(asset.atr / asset.price * 100).toFixed(2)}% of price
                    </div>
                    <div style={{
                      fontSize: '10px',
                      color: asset.atr > asset.price * 0.02 ? '#ef4444' : '#22c55e',
                      marginTop: '4px',
                    }}>
                      {asset.atr > asset.price * 0.02 ? 'High Volatility' : 'Normal Volatility'}
                    </div>
                    <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                      {getATRExplanation(asset.atr, asset.price)}
                    </div>
                  </div>
                </div>

                {/* Support & Resistance */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                    Support & Resistance Levels
                    <span style={{ fontSize: '9px', color: '#6b7280', fontStyle: 'italic', marginLeft: '6px' }}>
                      (Resistance = price may drop from here, Support = price may bounce up from here)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '10px', color: '#ef4444', marginBottom: '4px' }}>RESISTANCE (Sell Zones)</div>
                      {asset.resistance.map((r, i) => (
                        <div key={i} style={{
                          background: 'rgba(239, 68, 68, 0.1)',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          marginBottom: '4px',
                          fontSize: '11px',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                        }}>
                          ${r.toLocaleString()}
                        </div>
                      ))}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '10px', color: '#22c55e', marginBottom: '4px' }}>SUPPORT (Buy Zones)</div>
                      {asset.support.map((s, i) => (
                        <div key={i} style={{
                          background: 'rgba(34, 197, 94, 0.1)',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          marginBottom: '4px',
                          fontSize: '11px',
                          border: '1px solid rgba(34, 197, 94, 0.2)',
                        }}>
                          ${s.toLocaleString()}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Trading Decision Panel */}
                <div style={{
                  background: isLong ? 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(15, 19, 25, 1) 100%)' : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(15, 19, 25, 1) 100%)',
                  border: `1px solid ${isLong ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  borderRadius: '12px',
                  padding: '16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Target style={{ width: '16px', height: '16px', color: isLong ? '#22c55e' : '#ef4444' }} />
                    <span style={{ fontSize: '13px', fontWeight: '700' }}>TRADING DECISION FOR ${ACCOUNT_SETTINGS.balance} BALANCE</span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                    {/* Entry Zone */}
                    <div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>ENTRY ZONE (Limit)</div>
                      <div style={{ fontSize: '14px', fontWeight: '700' }}>
                        ${rec.entryZone.min.toFixed(0)} - ${rec.entryZone.max.toFixed(0)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                        Current: ${asset.price.toLocaleString()}
                      </div>
                    </div>

                    {/* Stop Loss */}
                    <div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>STOP LOSS (ATR-Buffered)</div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#ef4444' }}>
                        ${rec.stopLoss.toFixed(0)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                        {((Math.abs(asset.price - rec.stopLoss) / asset.price) * 100).toFixed(2)}% risk
                      </div>
                    </div>

                    {/* Take Profit */}
                    <div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>TAKE PROFIT (2:1)</div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>
                        ${rec.takeProfits[0].toFixed(0)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                        TP2: ${rec.takeProfits[1].toFixed(0)}
                      </div>
                    </div>

                    {/* Position Size */}
                    <div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '4px' }}>POSITION SIZE</div>
                      <div style={{ fontSize: '14px', fontWeight: '700' }}>
                        ${rec.positionSize.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '2px' }}>
                        {rec.leverage}x lev • ${rec.riskAmount.toFixed(2)} risk
                      </div>
                    </div>
                  </div>

                  {/* Risk Analysis */}
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    background: '#0f1319',
                    borderRadius: '8px',
                    fontSize: '11px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#6b7280' }}>Potential Reward:</span>
                      <span style={{ color: '#22c55e', fontWeight: '600' }}>+${rec.potentialReward.toFixed(2)} ({(rec.potentialReward / ACCOUNT_SETTINGS.balance * 100).toFixed(1)}%)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ color: '#6b7280' }}>Risk/Reward Ratio:</span>
                      <span style={{ fontWeight: '600' }}>1:2 (TP1) / 1:3 (TP2)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>Liquidation Price:</span>
                      <span style={{ color: '#ef4444', fontWeight: '600' }}>
                        ${isLong ? (asset.price * (1 - 1/rec.leverage - 0.01)).toFixed(0) : (asset.price * (1 + 1/rec.leverage + 0.01)).toFixed(0)}
                      </span>
                    </div>
                  </div>
                  {/* Simple explanation */}
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '8px',
                    fontSize: '11px',
                    color: '#d1d5db',
                    fontStyle: 'italic',
                  }}>
                    {rec.action === 'LONG' && (
                      <span>💡 Signal suggests prices may rise. Set limit order in green zone, stop loss below red level. Risk: ${rec.riskAmount.toFixed(2)} to gain ${rec.potentialReward.toFixed(2)}.</span>
                    )}
                    {rec.action === 'SHORT' && (
                      <span>💡 Signal suggests prices may fall. Set limit order in red zone, stop loss above green level. Risk: ${rec.riskAmount.toFixed(2)} to gain ${rec.potentialReward.toFixed(2)}.</span>
                    )}
                    {rec.action === 'WAIT' && (
                      <span>💡 Market uncertain. Wait for clearer signals before entering. Current indicators don&apos;t agree strongly on direction.</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Liquidation Heatmap */}
          <div style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame style={{ width: '14px', height: '14px', color: '#ef4444' }} />
              LIQUIDATION HEATMAP (BTC)
            </div>
            <div style={{ fontSize: '10px', color: '#6b7280', marginBottom: '12px', fontStyle: 'italic' }}>
              💡 Large trader positions may get liquidated at these levels, causing price to bounce or reverse. Higher bars = more liquidity.
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '80px' }}>
              {marketOverviewData.liquidationHeatmap.map((level, i) => {
                const height = parseInt(level.amount) / 15
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '100%',
                      height: `${height}px`,
                      background: `linear-gradient(180deg, rgba(239, 68, 68, 0.6) 0%, rgba(239, 68, 68, 0.2) 100%)`,
                      borderRadius: '4px 4px 0 0',
                      minHeight: '20px',
                    }} />
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '6px' }}>
                      ${level.price.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>
                      {level.amount}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* All Recommendations */}
          <div style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '14px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles style={{ width: '14px', height: '14px', color: '#a855f7' }} />
              ALL TRADE SIGNALS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {recommendations.map((rec) => {
                const isLong = rec.action === 'LONG'
                const isWait = rec.action === 'WAIT'
                return (
                  <div key={rec.symbol} style={{
                    background: isWait ? '#0f1319' : isLong ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                    border: isWait ? '1px solid #1f2937' : `1px solid ${isLong ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    borderRadius: '10px',
                    padding: '12px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '700' }}>{rec.symbol}</span>
                      <span style={{
                        fontSize: '10px',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: '700',
                        background: isWait ? '#1f2937' : isLong ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: isWait ? '#6b7280' : isLong ? '#22c55e' : '#ef4444',
                      }}>
                        {rec.action}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>
                      Confidence: <span style={{ color: '#e5e7eb', fontWeight: '600' }}>{rec.confidence}%</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#6b7280' }}>
                      Entry: <span style={{ color: '#e5e7eb' }}>${rec.entryZone.min.toFixed(0)}-${rec.entryZone.max.toFixed(0)}</span>
                    </div>
                    <div style={{ fontSize: '10px', color: '#6b7280' }}>
                      TP: <span style={{ color: '#22c55e' }}>${rec.takeProfits[0].toFixed(0)}</span>
                      <span style={{ color: '#ef4444', marginLeft: '8px' }}>SL: ${rec.stopLoss.toFixed(0)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column - News, Portfolio, Settings */}
        <div>
          {/* News Feed - Real-time from Crypto News Sources */}
          <div style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Newspaper style={{ width: '14px', height: '14px', color: '#3b82f6' }} />
              LIVE CRYPTO NEWS
              <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#22c55e', fontWeight: '600' }}>
                ● LIVE
              </span>
            </div>

            {newsData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📡</div>
                <div style={{ fontSize: '11px' }}>Loading real-time news...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {newsData.slice(0, 8).map((news) => {
                  const sentiment = news.sentiment || 'neutral'
                  const sentimentColor = sentiment === 'positive' ? '#22c55e' : sentiment === 'negative' ? '#ef4444' : '#9ca3af'
                  const sentimentLabel = sentiment === 'positive' ? 'BULLISH' : sentiment === 'negative' ? 'BEARISH' : 'NEUTRAL'

                  // Format time
                  const timeAgo = news.publishedAt
                    ? (() => {
                        const minutes = Math.floor((Date.now() - news.publishedAt) / 60000)
                        if (minutes < 60) return `${minutes}m ago`
                        if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
                        return `${Math.floor(minutes / 1440)}d ago`
                      })()
                    : news.time || 'Unknown'

                  return (
                    <a
                      key={news.id}
                      href={news.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none' }}
                    >
                      <div style={{
                        background: '#0f1319',
                        border: `1px solid ${sentimentColor}40`,
                        borderLeftWidth: '3px',
                        borderRadius: '8px',
                        padding: '12px',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#1a1f29'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#0f1319'}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '6px' }}>
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '600',
                            background: `${sentimentColor}20`,
                            color: sentimentColor,
                          }}>
                            {sentimentLabel}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {news.relatedSymbols && news.relatedSymbols.length > 0 && (
                              <>
                                {news.relatedSymbols.slice(0, 2).map((sym: string) => (
                                  <span key={sym} style={{
                                    fontSize: '9px',
                                    padding: '2px 4px',
                                    borderRadius: '3px',
                                    background: 'rgba(99, 102, 241, 0.2)',
                                    color: '#818cf8',
                                  }}>
                                    {sym}
                                  </span>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '4px', lineHeight: '1.4', color: '#e5e7eb' }}>
                          {news.title}
                        </div>
                        {news.description && (
                          <div style={{
                            fontSize: '10px',
                            color: '#9ca3af',
                            marginBottom: '4px',
                            lineHeight: '1.4',
                          }}>
                            {news.description.substring(0, 100)}{news.description.length > 100 ? '...' : ''}
                          </div>
                        )}
                        <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: '500' }}>{news.source}</span>
                          <span>{timeAgo}</span>
                        </div>
                      </div>
                    </a>
                  )
                })}
              </div>
            )}
          </div>

          {/* Portfolio */}
          <div style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PieChart style={{ width: '14px', height: '14px', color: '#22c55e' }} />
              PORTFOLIO
            </div>

            {/* Portfolio Summary */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(15, 19, 25, 1) 100%)',
              border: '1px solid rgba(34, 197, 94, 0.2)',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '12px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Total Balance</span>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>${ACCOUNT_SETTINGS.balance.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Margin Used</span>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>${portfolioData.totalMarginUsed.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Free Margin</span>
                <span style={{ fontSize: '12px', fontWeight: '600', color: '#22c55e' }}>${portfolioData.freeMargin.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Unrealized P&L</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>
                  +${portfolioData.totalUnrealizedPnl.toFixed(2)} ({portfolioData.totalUnrealizedPnlPercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            {/* Open Positions */}
            <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>OPEN POSITIONS</div>
            {portfolioData.positions.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '20px',
                color: '#6b7280',
                fontSize: '12px',
              }}>
                No open positions
              </div>
            ) : (
              portfolioData.positions.map((pos, i) => (
                <div key={i} style={{
                  background: '#0f1319',
                  border: `1px solid ${pos.unrealizedPnl >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                  borderRadius: '10px',
                  padding: '12px',
                  marginBottom: '8px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '700' }}>{pos.symbol}</div>
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontWeight: '600',
                        background: pos.side === 'LONG' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: pos.side === 'LONG' ? '#22c55e' : '#ef4444',
                      }}>
                        {pos.side} {pos.leverage}x
                      </span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '700',
                        color: pos.unrealizedPnl >= 0 ? '#22c55e' : '#ef4444',
                      }}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '10px', color: '#6b7280' }}>
                        {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.pnlPercent}%
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '10px', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Size: {pos.size}</span>
                    <span>Entry: ${pos.entryPrice.toLocaleString()}</span>
                    <span>Liq: ${pos.liquidationPrice.toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}

            {/* Risk Metrics */}
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #1f2937' }}>
              <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>RISK METRICS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div style={{ background: '#0f1319', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>Total Exposure</div>
                  <div style={{ fontSize: '12px', fontWeight: '600' }}>${portfolioData.totalRiskExposure}</div>
                </div>
                <div style={{ background: '#0f1319', padding: '8px', borderRadius: '8px' }}>
                  <div style={{ fontSize: '10px', color: '#6b7280' }}>Max Drawdown</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444' }}>
                    {ACCOUNT_SETTINGS.maxDrawdown}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Settings */}
          <div style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '14px',
            padding: '16px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sliders style={{ width: '14px', height: '14px', color: '#f59e0b' }} />
              RISK SETTINGS
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Risk Per Trade</span>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>{riskPercent}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={riskPercent}
                onChange={(e) => setRiskPercent(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  background: '#1f2937',
                  outline: 'none',
                  appearance: 'none',
                }}
              />
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                ${(ACCOUNT_SETTINGS.balance * riskPercent / 100).toFixed(2)} at risk per trade
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: '#6b7280' }}>Max Leverage</span>
                <span style={{ fontSize: '12px', fontWeight: '600' }}>{leverage}x</span>
              </div>
              <input
                type="range"
                min={1}
                max={ACCOUNT_SETTINGS.maxLeverage}
                value={leverage}
                onChange={(e) => setLeverage(Number(e.target.value))}
                style={{
                  width: '100%',
                  height: '4px',
                  borderRadius: '2px',
                  background: '#1f2937',
                  outline: 'none',
                  appearance: 'none',
                }}
              />
              <div style={{ fontSize: '10px', color: '#6b7280', marginTop: '4px' }}>
                Max liquidation risk: {(100 / leverage).toFixed(0)}% from entry
              </div>
            </div>

            <div style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '10px',
              color: '#f59e0b',
            }}>
              <AlertTriangle style={{ width: '12px', height: '12px', display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
              Never risk more than you can afford to lose. Crypto trading involves significant risk.
            </div>
          </div>
        </div>
      </div>

      {/* Footer AI Summary */}
      <div style={{
        marginTop: '12px',
        background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
        border: '1px solid rgba(34, 197, 94, 0.2)',
        borderRadius: '12px',
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Zap style={{ width: '16px', height: '16px', color: '#22c55e' }} />
          <span style={{ fontSize: '13px', fontWeight: '700' }}>AI MARKET SYNTHESIS</span>
        </div>
        <div style={{ fontSize: '12px', color: '#d1d5db', lineHeight: '1.6' }}>
          Market sentiment is <strong style={{ color: '#22c55e' }}>bullish</strong> with Fear & Greed at {marketOverviewData.fearAndGreed.value} ({marketOverviewData.fearAndGreed.label}).
          BTC showing strength with ADX of {marketData.BTC.adx.toFixed(1)} indicating a{' '}
          <strong>{marketData.BTC.adx > 25 ? 'trending' : 'ranging'}</strong> market.
          RSI at {marketData.BTC.rsi.toFixed(1)} suggests <strong>{marketData.BTC.rsi < 30 ? 'oversold conditions - buying opportunity' : marketData.BTC.rsi > 70 ? 'overbought - take profits' : 'neutral momentum'}</strong>.
          Institutional inflows via ETFs remain supportive. Recommended approach: <strong>Wait for pullbacks to support levels before entering long positions</strong>.
        </div>
      </div>

    </div>
  )
}
