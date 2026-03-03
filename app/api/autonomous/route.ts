/**
 * Autonomous Trading Swarm API
 * Controls the self-growing trading application
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAutonomousTradingSwarm } from '@/lib/agents/autonomous-trading-swarm';
import { getTradingFeatureScanner } from '@/lib/agents/trading-feature-scanner';
import { getDataSourceResearcher } from '@/lib/agents/data-source-researcher';
import { getStrategyGenerator } from '@/lib/agents/strategy-generator';
import { getTradingUXOptimizer } from '@/lib/agents/trading-ux-optimizer';

let autonomousIsRunning = false;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handle POST requests for autonomous operations
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, config } = body;

  const swarm = getAutonomousTradingSwarm();

  try {
    switch (action) {
      case 'start': {
        if (!autonomousIsRunning) {
          autonomousIsRunning = true;

          // Apply config if provided
          if (config) {
            swarm.configure(config);
          }

          // Start in background
          swarm.startGrowth().finally(() => {
            autonomousIsRunning = false;
          });

          return NextResponse.json({
            success: true,
            data: { message: 'Autonomous growth started' }
          });
        }
        return NextResponse.json({
          success: true,
          data: { message: 'Already running' }
        });
      }

      case 'stop': {
        swarm.stop();
        autonomousIsRunning = false;
        return NextResponse.json({
          success: true,
          data: { message: 'Autonomous growth stopped' }
        });
      }

      case 'configure': {
        if (!config) {
          return NextResponse.json({
            success: false,
            error: 'Config required'
          }, { status: 400 });
        }
        swarm.configure(config);
        return NextResponse.json({
          success: true,
          data: { message: 'Configuration updated', config: swarm.getState().config }
        });
      }

      case 'cycle': {
        const result = await runSingleCycle();
        return NextResponse.json({
          success: true,
          data: result
        });
      }

      case 'scan-features': {
        const scanner = getTradingFeatureScanner();
        const report = await scanner.scanTradingFeatures();
        return NextResponse.json({
          success: true,
          data: report
        });
      }

      case 'scan-data-sources': {
        const researcher = getDataSourceResearcher();
        const sources = await researcher.discoverNewSources();
        return NextResponse.json({
          success: true,
          data: { sources, count: sources.length }
        });
      }

      case 'generate-strategy': {
        const generator = getStrategyGenerator();
        const strategy = await generator.generateStrategy(body.marketConditions);
        return NextResponse.json({
          success: true,
          data: strategy
        });
      }

      case 'analyze-ux': {
        const optimizer = getTradingUXOptimizer();
        const analysis = await optimizer.analyzeTradingUI();
        return NextResponse.json({
          success: true,
          data: analysis
        });
      }

      case 'integrate-source': {
        const { sourceName } = body;
        if (!sourceName) {
          return NextResponse.json({
            success: false,
            error: 'sourceName required'
          }, { status: 400 });
        }

        const researcher = getDataSourceResearcher();
        const sources = await researcher.discoverNewSources();
        const source = sources.find(s => s.name === sourceName);

        if (!source) {
          return NextResponse.json({
            success: false,
            error: 'Source not found'
          }, { status: 404 });
        }

        const success = await researcher.createIntegration(source);
        return NextResponse.json({
          success,
          data: { source: sourceName, integrated: success }
        });
      }

      case 'add-feature': {
        const { featureName } = body;
        if (!featureName) {
          return NextResponse.json({
            success: false,
            error: 'featureName required'
          }, { status: 400 });
        }

        const scanner = getTradingFeatureScanner();
        const report = await scanner.scanTradingFeatures();
        const feature = report.missing_features.find(f => f.name === featureName);

        if (!feature) {
          return NextResponse.json({
            success: false,
            error: 'Feature not found in missing features'
          }, { status: 404 });
        }

        const plan = await scanner.getImplementationPlan(feature);
        const code = await scanner.generateFeatureCode(feature);

        return NextResponse.json({
          success: true,
          data: { feature, plan, code }
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
 * Handle GET requests for status and reports
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  const swarm = getAutonomousTradingSwarm();

  try {
    switch (action) {
      case 'status':
        return NextResponse.json({
          success: true,
          data: swarm.getStatus()
        });

      case 'report':
        return NextResponse.json({
          success: true,
          data: {
            report: swarm.getGrowthReport(),
            state: swarm.getState()
          }
        });

      case 'health':
        const isRunning = swarm.getStatus().isRunning;
        const capabilities = swarm.getState().capabilities;
        return NextResponse.json({
          success: true,
          data: {
            running: isRunning || autonomousIsRunning,
            capabilities,
            summary: `${capabilities.indicators.length} indicators, ${capabilities.data_sources.length} data sources, ${capabilities.strategies.length} strategies`
          }
        });

      case 'capabilities':
        return NextResponse.json({
          success: true,
          data: swarm.getState().capabilities
        });

      default:
        return NextResponse.json({
          success: true,
          data: {
            message: 'Autonomous Trading Swarm API',
            endpoints: {
              'POST /api/autonomous?action=start': 'Start autonomous growth',
              'POST /api/autonomous?action=stop': 'Stop autonomous growth',
              'POST /api/autonomous?action=cycle': 'Run one growth cycle',
              'POST /api/autonomous?action=configure': 'Update configuration',
              'POST /api/autonomous?action=scan-features': 'Scan for missing features',
              'POST /api/autonomous?action=scan-data-sources': 'Find new data sources',
              'POST /api/autonomous?action=generate-strategy': 'Generate trading strategy',
              'POST /api/autonomous?action=analyze-ux': 'Analyze UX for improvements',
              'POST /api/autonomous?action=integrate-source': 'Integrate a data source',
              'POST /api/autonomous?action=add-feature': 'Add a specific feature',
              'GET /api/autonomous?action=status': 'Get current status',
              'GET /api/autonomous?action=report': 'Get growth report',
              'GET /api/autonomous?action=health': 'Health check',
              'GET /api/autonomous?action=capabilities': 'Get current capabilities'
            },
            status: swarm.getStatus(),
            capabilities: swarm.getState().capabilities
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

/**
 * Run a single autonomous cycle
 */
async function runSingleCycle() {
  const swarm = getAutonomousTradingSwarm();
  const wasRunning = swarm.getStatus().isRunning;

  if (!wasRunning) {
    // Run one cycle synchronously
    await swarm['runGrowthCycle']();
  }

  return {
    complete: true,
    status: swarm.getStatus(),
    capabilities: swarm.getState().capabilities
  };
}
