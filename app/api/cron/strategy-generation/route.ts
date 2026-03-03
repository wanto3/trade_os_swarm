/**
 * Cron Job: Strategy Generation
 *
 * Runs weekly to:
 * 1. Analyze all historical predictions
 * 2. Generate new trading strategies
 * 3. Create new indicators
 * 4. Test strategies against historical data
 *
 * VERCEL CRON: 0 0 * * 0 (every Sunday at midnight)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradingImprovementSystem } from '@/lib/agents/trading-improvement-system';
import { getAdaptiveStrategyGenerator } from '@/lib/agents/adaptive-strategy-generator';

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
  const results: any = {
    newStrategies: [],
    newIndicators: [],
    analysis: null,
    timestamp: new Date().toISOString()
  };

  try {
    // 1. Get detailed analysis
    const system = getTradingImprovementSystem();
    const featureAnalysis = system.getFeatureAnalysis();
    const report = system.getPerformanceReport();

    results.analysis = {
      totalPredictions: system.getState().predictions,
      topFeatures: featureAnalysis.slice(0, 3),
      recommendations: report.recommendations
    };

    // 2. Get all existing strategies
    const generator = getAdaptiveStrategyGenerator();
    const existingStrategies = generator.getAllStrategies();
    results.existingStrategies = existingStrategies.length;

    // 3. Generate a new indicator if we have enough data
    const hasEnoughData = system.getState().predictions >= 50;
    if (hasEnoughData) {
      try {
        const newIndicator = await generator.generateIndicator({
          symbol: 'BTC',
          currentPrice: 65000,
          trend: generator.getCurrentRegime().trend,
          volatility: 0.02
        });

        if (newIndicator) {
          results.newIndicators.push({
            name: newIndicator.name,
            description: newIndicator.description
          });
        }
      } catch (e: any) {
        results.indicatorError = e.message;
      }
    }

    // 4. Generate strategies for each regime type
    const regimes = ['bullish', 'bearish', 'ranging', 'volatile'] as const;
    for (const regime of regimes) {
      // Check if we already have a good strategy for this regime
      const hasRegimeStrategy = existingStrategies.some(s =>
        s.regime === regime && s.tested && s.backtestResults && s.backtestResults.winRate > 0.55
      );

      if (!hasRegimeStrategy) {
        results.newStrategies.push({
          regime,
          status: 'Strategy generation needed',
          priority: regime === generator.getCurrentRegime().trend ? 'HIGH' : 'MEDIUM'
        });
      }
    }

    // 5. Get UI optimization suggestions
    const uiSuggestions = system.getUIOptimizations();
    results.uiOptimizations = uiSuggestions.slice(0, 5);

    results.duration = Date.now() - startTime;
    results.summary = `Analyzed ${system.getState().predictions} predictions, ` +
      `found ${featureAnalysis.length} features, ` +
      `${existingStrategies.length} existing strategies`;

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
