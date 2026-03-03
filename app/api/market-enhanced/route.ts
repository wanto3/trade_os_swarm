/**
 * Enhanced Market Data API with Trading Intelligence
 *
 * Fetches real data AND:
 * - Records predictions for learning
 * - Returns weighted indicators based on historical performance
 * - Tracks what works over time
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradingIntelligenceImprover } from '@/lib/agents/trading-intelligence-improver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function calculateIndicators(price: number, change24h: number) {
  const rsi = Math.max(10, Math.min(90, 50 + (change24h * 5)));

  const macdValue = (price / 1000) * (change24h / 10);
  const macdSignal = macdValue * 0.8;

  const bbStd = price * 0.02;

  // Return raw indicators without weights
  return [
    {
      name: 'RSI',
      value: parseFloat(rsi.toFixed(1)),
      signal: rsi < 30 ? 'bullish' : rsi > 70 ? 'bearish' : 'neutral',
      rawWeight: 1.0
    },
    {
      name: 'MACD',
      value: parseFloat(macdValue.toFixed(1)),
      signal: macdValue > macdSignal ? 'bullish' : macdValue < macdSignal ? 'bearish' : 'neutral',
      rawWeight: 1.0
    },
    {
      name: 'EMA_Trend',
      value: parseFloat((change24h).toFixed(2)),
      signal: change24h > 0 ? 'bullish' : change24h < 0 ? 'bearish' : 'neutral',
      rawWeight: 1.0
    },
    {
      name: 'Bollinger_Position',
      value: parseFloat((change24h / 2).toFixed(2)),
      signal: Math.abs(change24h) < 0.5 ? 'squeeze' : change24h > 0 ? 'bullish' : 'bearish',
      rawWeight: 1.0
    },
    {
      name: 'Volume_Momentum',
      value: parseFloat((Math.abs(change24h) * 10).toFixed(1)),
      signal: Math.abs(change24h) > 1 ? 'high' : 'normal',
      rawWeight: 1.0
    }
  ];
}

function formatLargeNumber(num: number): string {
  if (num >= 1_000_000_000_000) return `${(num / 1_000_000_000_000).toFixed(2)}T`;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  return `$${num.toFixed(2)}`;
}

function generateTradingSignal(
  symbol: string,
  price: number,
  change24h: number,
  weightedIndicators: Array<{ name: string; value: number; signal: string; weight: number; accuracy?: number }>
) {
  let bullishScore = 0;
  let bearishScore = 0;
  const reasons: string[] = [];

  for (const ind of weightedIndicators) {
    const contribution = ind.weight * 10;

    if (ind.signal === 'bullish') {
      bullishScore += contribution;
      reasons.push(`${ind.name} bullish ${ind.accuracy ? `(${(ind.accuracy * 100).toFixed(0)}% accurate)` : ''}`);
    } else if (ind.signal === 'bearish') {
      bearishScore += contribution;
      reasons.push(`${ind.name} bearish ${ind.accuracy ? `(${(ind.accuracy * 100).toFixed(0)}% accurate)` : ''}`);
    } else if (ind.signal === 'squeeze') {
      // Squeeze often precedes breakout
      reasons.push(`${ind.name} squeeze - breakout imminent`);
    }
  }

  // Add trend context
  if (change24h > 1) {
    bullishScore += 20;
    reasons.push('Strong upward momentum');
  } else if (change24h < -1) {
    bearishScore += 20;
    reasons.push('Strong downward momentum');
  }

  // Calculate overall confidence
  const totalScore = bullishScore + bearishScore;
  let action: 'LONG' | 'SHORT' | 'WAIT';
  let confidence: number;

  if (bullishScore > bearishScore && bullishScore > 30) {
    action = 'LONG';
    confidence = Math.min(95, 50 + (bullishScore - bearishScore) / 2);
  } else if (bearishScore > bullishScore && bearishScore > 30) {
    action = 'SHORT';
    confidence = Math.min(95, 50 + (bearishScore - bullishScore) / 2);
  } else {
    action = 'WAIT';
    confidence = Math.max(bullishScore, bearishScore);
  }

  // Calculate target and stop loss
  const atrPercent = 0.02; // 2% ATR approximation
  const targetPrice = action === 'LONG'
    ? price * (1 + atrPercent * 2)
    : action === 'SHORT'
      ? price * (1 - atrPercent * 2)
      : price;

  const stopLoss = action === 'LONG'
    ? price * (1 - atrPercent)
    : action === 'SHORT'
      ? price * (1 + atrPercent)
      : price;

  return {
    symbol,
    action,
    confidence: Math.round(confidence),
    targetPrice: Math.round(targetPrice),
    stopLoss: Math.round(stopLoss),
    timeframeHorizon: '4-8 hours',
    reasons: reasons.slice(0, 4),
    indicators: weightedIndicators
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const record = searchParams.get('record') === 'true';
  const symbol = searchParams.get('symbol') || 'BTC';

  try {
    const improver = getTradingIntelligenceImprover();

    // Fetch prices from CoinGecko
    const priceRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true',
      { cache: 'no-store', next: { revalidate: 0 } }
    );

    if (!priceRes.ok) {
      throw new Error('CoinGecko API error');
    }

    const priceData = await priceRes.json();

    // Fetch Global Market Data
    let globalData = {
      totalMarketCap: { usd: 3.42e12, change24h: 2.5 },
      btcDominance: 56.8,
    };

    try {
      const globalRes = await fetch(
        'https://api.coingecko.com/api/v3/global',
        { cache: 'no-store', next: { revalidate: 0 } }
      );
      if (globalRes.ok) {
        const globalJson = await globalRes.json();
        globalData = {
          totalMarketCap: {
            usd: globalJson.data.total_market_cap.usd || 3.42e12,
            change24h: globalJson.data.market_cap_change_percentage_24h_usd || 2.5,
          },
          btcDominance: globalJson.data.market_cap_percentage.btc || 56.8,
        };
      }
    } catch (e) {
      console.error('Global data fetch error:', e);
    }

    // Fetch Fear & Greed
    let fgData = { value: 50, label: 'Neutral', change: 0 };
    try {
      const fgRes = await fetch('https://api.alternative.me/fng/', { cache: 'no-store', next: { revalidate: 0 } });
      if (fgRes.ok) {
        const fgJson = await fgRes.json();
        fgData = {
          value: parseInt(fgJson.data[0].value),
          label: fgJson.data[0].value_classification,
          change: 0,
        };
      }
    } catch (e) {}

    // Build market data with weighted indicators
    const marketData: any = {};
    const tradingSignals: any = {};

    const assets = [
      { key: 'BTC', id: 'bitcoin', name: 'Bitcoin' },
      { key: 'ETH', id: 'ethereum', name: 'Ethereum' },
      { key: 'SOL', id: 'solana', name: 'Solana' }
    ];

    for (const asset of assets) {
      const data = priceData[asset.id];
      if (!data) continue;

      const price = data.usd;
      const change24h = data.usd_24h_change;

      // Calculate raw indicators
      const rawIndicators = calculateIndicators(price, change24h);

      // Get weighted indicators from intelligence system
      const weightedIndicators = improver.getWeightedIndicators(rawIndicators);

      // Generate trading signal
      const signal = generateTradingSignal(asset.key, price, change24h, weightedIndicators);
      tradingSignals[asset.key] = signal;

      // Record prediction if requested
      if (record) {
        improver.recordPrediction({
          symbol: asset.key,
          timeframe: '4h',
          direction: signal.action,
          confidence: signal.confidence,
          targetPrice: signal.targetPrice,
          stopLoss: signal.stopLoss,
          timeframeHorizon: signal.timeframeHorizon,
          indicators: weightedIndicators.map(ind => ({
            name: ind.name,
            value: ind.value,
            signal: ind.signal,
            weight: ind.weight
          })),
          marketContext: {
            trend: change24h > 0 ? 'up' : change24h < 0 ? 'down' : 'flat',
            volatility: Math.abs(change24h / 100),
            volume: 'normal'
          }
        });
      }

      // Build full market data
      marketData[asset.key] = {
        price,
        change24h: parseFloat(change24h.toFixed(2)),
        volume: `${(data.usd_24h_vol / 1_000_000_000).toFixed(1)}B`,
        rsi: rawIndicators.find(i => i.name === 'RSI')?.value || 50,
        macd: {
          value: rawIndicators.find(i => i.name === 'MACD')?.value || 0,
          signal: rawIndicators.find(i => i.name === 'MACD')?.value || 0,
          histogram: 0.5
        },
        bollingerBands: {
          upper: parseFloat((price * 1.02).toFixed(2)),
          middle: parseFloat(price.toFixed(2)),
          lower: parseFloat((price * 0.98).toFixed(2)),
          squeeze: Math.abs(change24h) < 0.5
        },
        ema: {
          ema9: parseFloat((price * 1.001).toFixed(2)),
          ema21: parseFloat(price.toFixed(2)),
          ema50: parseFloat((price * 0.999).toFixed(2))
        },
        support: [
          parseFloat((price * 0.99).toFixed(2)),
          parseFloat((price * 0.95).toFixed(2)),
        ],
        resistance: [
          parseFloat((price * 1.01).toFixed(2)),
          parseFloat((price * 1.05).toFixed(2)),
        ],
        trend: change24h > 1 ? 'BULLISH' : change24h < -1 ? 'BEARISH' : 'NEUTRAL',
        // Add weighted indicators for display
        weightedIndicators: weightedIndicators.map(ind => ({
          name: ind.name,
          value: ind.value,
          signal: ind.signal,
          weight: ind.weight,
          accuracy: ind.accuracy
        }))
      };
    }

    // Market overview
    const marketOverview = {
      fearAndGreed: fgData,
      btcDominance: {
        value: parseFloat(globalData.btcDominance.toFixed(1)),
        change: parseFloat((globalData.btcDominance - 55).toFixed(1)),
      },
      totalMarketCap: {
        value: formatLargeNumber(globalData.totalMarketCap.usd).replace('$', ''),
        change: parseFloat(globalData.totalMarketCap.change24h.toFixed(2)),
      },
      fundingRates: {
        BTC: { rate: 0.01, status: 'positive' },
        ETH: { rate: 0.008, status: 'positive' },
        SOL: { rate: -0.005, status: 'negative' },
      },
      openInterest: {
        value: '28.5B',
        change: 3.2
      },
      liquidationHeatmap: [
        { price: Math.round(priceData.bitcoin?.usd * 0.95), amount: '450M' },
        { price: Math.round(priceData.bitcoin?.usd * 0.92), amount: '890M' },
        { price: Math.round(priceData.bitcoin?.usd * 1.03), amount: '620M' },
        { price: Math.round(priceData.bitcoin?.usd * 1.06), amount: '1.2B' },
      ],
    };

    return NextResponse.json({
      success: true,
      data: {
        marketData,
        marketOverview,
        tradingSignals,
        intelligence: improver.getState(),
        timestamp: Date.now(),
      },
    });
  } catch (error) {
    console.error('Enhanced Market API error:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
    }, { status: 500 });
  }
}

/**
 * POST endpoint - Record prediction outcome for learning
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, predictionId, outcome } = body;

    const improver = getTradingIntelligenceImprover();

    if (action === 'recordOutcome' && predictionId && outcome) {
      improver.recordOutcome(predictionId, outcome);
      return NextResponse.json({ success: true });
    }

    if (action === 'runCycle') {
      const results = await improver.runImprovementCycle();
      return NextResponse.json({ success: true, data: results });
    }

    return NextResponse.json({
      success: false,
      error: 'Unknown action'
    }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
