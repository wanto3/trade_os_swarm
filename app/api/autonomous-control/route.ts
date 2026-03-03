/**
 * Autonomous Improver Control API
 *
 * Endpoints for monitoring and controlling the autonomous code improver
 *
 * GET  /api/autonomous-control?action=status - Get current state
 * GET  /api/autonomous-control?action=pending - Get pending approvals
 * POST /api/autonomous-control?action=approve&cycleId=xxx - Approve a change
 * POST /api/autonomous-control?action=reject&cycleId=xxx - Reject a change
 * POST /api/autonomous-control?action=run - Manually trigger a cycle
 * POST /api/autonomous-control?action=configure - Update config
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAutonomousCodeImprover } from '@/lib/agents/autonomous-code-improver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    const improver = getAutonomousCodeImprover();

    switch (action) {
      case 'status': {
        const state = improver.getState();
        return NextResponse.json({
          success: true,
          data: {
            state,
            summary: {
              totalCycles: state.stats.totalCycles,
              successful: state.stats.successfulImprovements,
              failed: state.stats.failedImprovements,
              filesModified: state.stats.filesModified.length,
              pendingApprovals: state.cycles.filter(c => c.phase === 'awaiting_approval').length,
              enabled: state.config.enabled
            }
          }
        });
      }

      case 'pending': {
        const pending = improver.getPendingApprovals();
        return NextResponse.json({
          success: true,
          data: {
            pending,
            count: pending.length
          }
        });
      }

      case 'history': {
        const limit = parseInt(searchParams.get('limit') || '20');
        const state = improver.getState();
        return NextResponse.json({
          success: true,
          data: {
            cycles: state.cycles.slice(-limit),
            total: state.cycles.length
          }
        });
      }

      case 'health': {
        const state = improver.getState();
        return NextResponse.json({
          success: true,
          data: {
            status: 'healthy',
            enabled: state.config.enabled,
            currentCycle: state.currentCycle,
            pendingApprovals: state.cycles.filter(c => c.phase === 'awaiting_approval').length,
            lastUpdate: state.cycles.length > 0 ? state.cycles[state.cycles.length - 1].timestamp : null
          }
        });
      }

      default:
        return NextResponse.json({
          success: true,
          data: {
            message: 'Autonomous Improver Control API',
            endpoints: {
              'GET /api/autonomous-control?action=status': 'Get current state',
              'GET /api/autonomous-control?action=pending': 'Get pending approvals',
              'GET /api/autonomous-control?action=history': 'Get improvement history',
              'GET /api/autonomous-control?action=health': 'Health check',
              'POST /api/autonomous-control?action=run': 'Manually trigger cycle',
              'POST /api/autonomous-control?action=approve': 'Approve a pending change',
              'POST /api/autonomous-control?action=reject': 'Reject a pending change',
              'POST /api/autonomous-control?action=configure': 'Update configuration'
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
  const { action, cycleId, config } = body;

  try {
    const improver = getAutonomousCodeImprover();

    switch (action) {
      case 'run': {
        const cycle = await improver.runCycle();
        return NextResponse.json({
          success: true,
          data: { cycle }
        });
      }

      case 'approve': {
        if (!cycleId) {
          return NextResponse.json({
            success: false,
            error: 'cycleId required'
          }, { status: 400 });
        }

        const cycle = await improver.approveImprovement(cycleId);
        return NextResponse.json({
          success: true,
          data: { cycle }
        });
      }

      case 'reject': {
        if (!cycleId) {
          return NextResponse.json({
            success: false,
            error: 'cycleId required'
          }, { status: 400 });
        }

        improver.rejectImprovement(cycleId);
        return NextResponse.json({
          success: true,
          data: { message: 'Improvement rejected' }
        });
      }

      case 'configure': {
        if (!config) {
          return NextResponse.json({
            success: false,
            error: 'config required'
          }, { status: 400 });
        }

        improver.updateConfig(config);
        return NextResponse.json({
          success: true,
          data: {
            message: 'Configuration updated',
            config: improver.getState().config
          }
        });
      }

      case 'enable': {
        improver.updateConfig({ enabled: true });
        return NextResponse.json({
          success: true,
          data: { message: 'Autonomous improver enabled' }
        });
      }

      case 'disable': {
        improver.updateConfig({ enabled: false });
        return NextResponse.json({
          success: true,
          data: { message: 'Autonomous improver disabled' }
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
