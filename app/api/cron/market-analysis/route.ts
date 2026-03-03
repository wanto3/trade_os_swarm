/**
 * Cron Job: Market Analysis
 *
 * Runs every hour to:
 * 1. Fetch current market data
 * 2. Generate trading predictions
 * 3. Record predictions for later outcome tracking
 * 4. Detect market regime changes
 *
 * VERCEL CRON: 0 * * * *
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPredictionTracker } from '@/lib/agents/prediction-tracker';
import { getAdaptiveStrategyGenerator } from '@/lib/agents/adaptive-strategy-generator';
import { generateTradingSignal } from '@/lib/services/crypto-data.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifyCronRequest(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const symbols = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT'];
  const results: any = {
    predictions: [],
    regime: null,
    timestamp: new Date().toISOString()
  };

  try {
    // Generate predictions for each symbol
    for (const symbol of symbols) {
      try {
        // Get price history
        const { getPriceHistory, getCurrentPrice } = await import('@/lib/services/crypto-data.service');
        const prices = getPriceHistory(symbol) || [];
        const priceData = await getCurrentPrice(symbol);

        if (prices.length > 0) {
          // Generate trading signal
          const signal = generateTradingSignal(symbol, prices);

          // Record the prediction
          const tracker = getPredictionTracker();
          const predictionId = tracker.recordPrediction({
            symbol,
            currentPrice: priceData.price,
            predictedAction: signal.action as 'LONG' | 'SHORT' | 'WAIT',
            confidence: signal.confidence,
            indicators: signal.indicators.map(ind => ({
              name: ind.name,
              value: ind.value,
              signal: ind.signal
            })),
            stopLoss: priceData.price * (1 - 0.02),
            takeProfit: priceData.price * (1 + 0.04)
          });

          results.predictions.push({
            symbol,
            action: signal.action,
            confidence: signal.confidence,
            reasons: signal.reasons,
            predictionId
          });
        }
      } catch (error: any) {
        results.predictions.push({
          symbol,
          error: error.message
        });
      }
    }

    // Detect market regime
    const generator = getAdaptiveStrategyGenerator();
    const btcHistory = await (await import('@/lib/services/crypto-data.service')).getPriceHistory('BTC');
    if (btcHistory && btcHistory.length >= 40) {
      const regime = generator.detectRegime(btcHistory);
      results.regime = regime;
    }

    results.duration = Date.now() - startTime;
    results.count = results.predictions.length;

    return NextResponse.json({
      success: true,
      data: results
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
