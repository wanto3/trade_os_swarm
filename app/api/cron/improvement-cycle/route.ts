/**
 * Cron Job: Improvement Cycle
 *
 * Runs every 6 hours to:
 * 1. Analyze prediction accuracy
 * 2. Update feature importance
 * 3. Generate new strategies if needed
 * 4. Check for regime changes
 *
 * VERCEL CRON: 0 */6 * * *
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradingImprovementSystem } from '@/lib/agents/trading-improvement-system';
import { getAdaptiveStrategyGenerator } from '@/lib/agents/adaptive-strategy-generator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Verify cron secret
function verifyCronRequest(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) return true; // Allow if not set (development)
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  // Only allow cron requests
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const results: any = {};

  try {
    // 1. Run improvement cycle
    const system = getTradingImprovementSystem();
    const report = system.getPerformanceReport();
    results.performance = report;

    // 2. Get feature analysis
    const features = system.getFeatureAnalysis();
    results.topFeatures = features.slice(0, 5).map(f => ({
      name: f.name,
      accuracy: f.accuracy,
      recommendation: f.recommendation
    }));

    // 3. Check regime and generate strategies if needed
    const generator = getAdaptiveStrategyGenerator();
    const regime = generator.getCurrentRegime();
    results.regime = regime;

    const strategy = generator.getStrategyForCurrentRegime();
    if (strategy) {
      results.recommendedStrategy = {
        name: strategy.name,
        regime: strategy.regime
      };
    }

    // 4. Get UI suggestions
    const uiSuggestions = system.getUIOptimizations();
    results.uiOptimizations = uiSuggestions.slice(0, 3);

    results.duration = Date.now() - startTime;
    results.timestamp = new Date().toISOString();

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

// Also support POST for testing
export async function POST(req: NextRequest) {
  return GET(req);
}
