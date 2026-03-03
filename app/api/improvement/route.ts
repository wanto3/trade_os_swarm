/**
 * Trading Improvement API
 *
 * Provides endpoints for:
 * - Recording trading predictions and outcomes
 * - Getting weighted indicators based on historical performance
 * - Getting feature importance analysis
 * - Getting UI optimization suggestions
 * - Getting performance reports
 *
 * POST /api/improvement?action=predict - Record a prediction
 * POST /api/improvement?action=outcome - Record an outcome
 * GET  /api/improvement?action=weighted - Get weighted indicators
 * GET  /api/improvement?action=analysis - Get feature analysis
 * GET  /api/improvement?action=ui - Get UI optimization suggestions
 * GET  /api/improvement?action=report - Get performance report
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradingImprovementSystem } from '@/lib/agents/trading-improvement-system';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handle POST requests
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, ...data } = body;

  try {
    const system = getTradingImprovementSystem();

    switch (action) {
      case 'predict': {
        // Record a trading prediction
        const { symbol, prediction, indicators, marketContext } = data;

        if (!symbol || !prediction) {
          return NextResponse.json({
            success: false,
            error: 'symbol and prediction required'
          }, { status: 400 });
        }

        const predictionId = system.recordPrediction({
          symbol,
          prediction,
          indicators: indicators || [],
          marketContext: marketContext || {}
        });

        return NextResponse.json({
          success: true,
          data: {
            predictionId,
            message: 'Prediction recorded'
          }
        });
      }

      case 'outcome': {
        // Record the outcome of a prediction
        const { predictionId, outcome } = data;

        if (!predictionId || !outcome) {
          return NextResponse.json({
            success: false,
            error: 'predictionId and outcome required'
          }, { status: 400 });
        }

        system.recordOutcome(predictionId, outcome);

        return NextResponse.json({
          success: true,
          data: { message: 'Outcome recorded' }
        });
      }

      case 'track-ui': {
        // Track UI element usage
        const { elementId, action, duration } = data;

        if (!elementId || !action) {
          return NextResponse.json({
            success: false,
            error: 'elementId and action required'
          }, { status: 400 });
        }

        system.trackUIUsage(elementId, action, duration);

        return NextResponse.json({
          success: true,
          data: { message: 'UI usage tracked' }
        });
      }

      case 'track-trade': {
        // Track that a UI element was used in a trade
        const { elementId, wasProfitable } = data;

        if (!elementId) {
          return NextResponse.json({
            success: false,
            error: 'elementId required'
          }, { status: 400 });
        }

        system.trackUIElementInTrade(elementId, wasProfitable);

        return NextResponse.json({
          success: true,
          data: { message: 'Trade tracked' }
        });
      }

      case 'score-data-source': {
        // Score a market data source
        const { source } = data;

        if (!source) {
          return NextResponse.json({
            success: false,
            error: 'source data required'
          }, { status: 400 });
        }

        system.scoreMarketDataSource(source);

        return NextResponse.json({
          success: true,
          data: { message: 'Data source scored' }
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * Handle GET requests
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    const system = getTradingImprovementSystem();

    switch (action) {
      case 'weighted': {
        // Get weighted indicators for a symbol
        const symbol = searchParams.get('symbol') || 'BTC';
        const indicators = JSON.parse(searchParams.get('indicators') || '[]');

        const weighted = system.getWeightedIndicators(indicators);

        return NextResponse.json({
          success: true,
          data: {
            symbol,
            weightedIndicators: weighted
          }
        });
      }

      case 'analysis': {
        // Get feature importance analysis
        const analysis = system.getFeatureAnalysis();

        return NextResponse.json({
          success: true,
          data: { analysis }
        });
      }

      case 'ui': {
        // Get UI optimization suggestions
        const suggestions = system.getUIOptimizations();

        return NextResponse.json({
          success: true,
          data: { suggestions }
        });
      }

      case 'report': {
        // Get performance report
        const report = system.getPerformanceReport();

        return NextResponse.json({
          success: true,
          data: { report }
        });
      }

      case 'state': {
        // Get current system state
        const state = system.getState();

        return NextResponse.json({
          success: true,
          data: { state }
        });
      }

      case 'recommendations': {
        // Get recommended data sources
        const sources = system.getRecommendedDataSources();

        return NextResponse.json({
          success: true,
          data: { sources }
        });
      }

      case 'indicators': {
        // Get recommended indicators for current conditions
        const symbol = searchParams.get('symbol') || 'BTC';
        const marketCondition = searchParams.get('condition') || 'neutral';

        const indicators = system.getRecommendedIndicators(symbol, marketCondition);

        return NextResponse.json({
          success: true,
          data: {
            symbol,
            marketCondition,
            recommendedIndicators: indicators
          }
        });
      }

      default:
        return NextResponse.json({
          success: true,
          data: {
            message: 'Trading Improvement API',
            endpoints: {
              'POST /api/improvement?action=predict': 'Record a trading prediction',
              'POST /api/improvement?action=outcome': 'Record prediction outcome',
              'POST /api/improvement?action=track-ui': 'Track UI element usage',
              'POST /api/improvement?action=track-trade': 'Track UI element used in trade',
              'GET /api/improvement?action=weighted': 'Get weighted indicators',
              'GET /api/improvement?action=analysis': 'Get feature importance analysis',
              'GET /api/improvement?action=ui': 'Get UI optimization suggestions',
              'GET /api/improvement?action=report': 'Get performance report',
              'GET /api/improvement?action=state': 'Get system state',
              'GET /api/improvement?action=indicators': 'Get recommended indicators'
            },
            state: system.getState()
          }
        });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
