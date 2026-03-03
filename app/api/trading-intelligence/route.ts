/**
 * Trading Intelligence Control API
 *
 * Monitor and control the autonomous trading intelligence system
 *
 * GET  /api/trading-intelligence?action=status - Get current state
 * GET  /api/trading-intelligence?action=recommendations - Get improvement recommendations
 * GET  /api/trading-intelligence?action=indicators - Get indicator performance
 * POST /api/trading-intelligence?action=deploy-indicator - Deploy a new indicator
 * POST /api/trading-intelligence?action=integrate-source - Integrate a data source
 * POST /api/trading-intelligence?action=run-cycle - Manually trigger improvement cycle
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradingIntelligenceImprover } from '@/lib/agents/trading-intelligence-improver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    const improver = getTradingIntelligenceImprover();

    switch (action) {
      case 'status': {
        const state = improver.getState();
        return NextResponse.json({
          success: true,
          data: { state }
        });
      }

      case 'recommendations': {
        const recommendations = improver.getRecommendations();
        return NextResponse.json({
          success: true,
          data: { recommendations }
        });
      }

      case 'indicators': {
        const performance = improver.getIndicatorPerformance();
        return NextResponse.json({
          success: true,
          data: { performance }
        });
      }

      case 'deployed': {
        const state = improver.getState();
        return NextResponse.json({
          success: true,
          data: {
            indicatorsDeployed: state.indicatorsDeployed,
            sourcesIntegrated: state.sourcesIntegrated
          }
        });
      }

      default:
        return NextResponse.json({
          success: true,
          data: {
            message: 'Trading Intelligence API',
            endpoints: {
              'GET /api/trading-intelligence?action=status': 'Get current state',
              'GET /api/trading-intelligence?action=recommendations': 'Get improvement recommendations',
              'GET /api/trading-intelligence?action=indicators': 'Get indicator performance',
              'GET /api/trading-intelligence?action=deployed': 'Get deployed improvements',
              'POST /api/trading-intelligence?action=deploy-indicator': 'Deploy a new indicator',
              'POST /api/trading-intelligence?action=integrate-source': 'Integrate a data source',
              'POST /api/trading-intelligence?action=apply-ui': 'Apply a UI improvement',
              'POST /api/trading-intelligence?action=run-cycle': 'Run improvement cycle'
            }
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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, ...params } = body;

  try {
    const improver = getTradingIntelligenceImprover();

    switch (action) {
      case 'deploy-indicator': {
        const { indicatorName } = params;
        if (!indicatorName) {
          return NextResponse.json({
            success: false,
            error: 'indicatorName required'
          }, { status: 400 });
        }
        const success = improver.deployIndicator(indicatorName);
        return NextResponse.json({
          success: true,
          data: { deployed: success }
        });
      }

      case 'integrate-source': {
        const { sourceName } = params;
        if (!sourceName) {
          return NextResponse.json({
            success: false,
            error: 'sourceName required'
          }, { status: 400 });
        }
        const success = improver.integrateSource(sourceName);
        return NextResponse.json({
          success: true,
          data: { integrated: success }
        });
      }

      case 'apply-ui': {
        const { area } = params;
        if (!area) {
          return NextResponse.json({
            success: false,
            error: 'area required'
          }, { status: 400 });
        }
        const success = improver.applyUIImprovement(area);
        return NextResponse.json({
          success: true,
          data: { applied: success }
        });
      }

      case 'run-cycle': {
        const results = await improver.runImprovementCycle();
        return NextResponse.json({
          success: true,
          data: { results }
        });
      }

      case 'update-config': {
        const { config } = params;
        if (!config) {
          return NextResponse.json({
            success: false,
            error: 'config required'
          }, { status: 400 });
        }
        improver.updateConfig(config);
        return NextResponse.json({
          success: true,
          data: { message: 'Configuration updated' }
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
