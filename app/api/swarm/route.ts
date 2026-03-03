/**
 * Swarm API - Real autonomous improvement system
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAutonomousImprover } from '@/lib/agents/autonomous-improver';
import { getRealAgentCoordinator } from '@/lib/agents/real-agent-coordinator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/swarm - Get real swarm status
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  const coordinator = getRealAgentCoordinator();
  const improver = getAutonomousImprover();

  try {
    switch (action) {
      case 'status': {
        const state = coordinator.getState();
        const improverState = improver.getState();
        const stats = coordinator.getStats();

        // Merge real agent data with improvements (exclude large code field)
        const agentsWithImprovements = state.agents.map(agent => {
          const agentImprover = improverState.agents?.find?.(a => a.id === agent.id.split('-')[0]);
          const improvements = (agentImprover?.improvements || []).map(({ code, ...rest }) => rest);
          return {
            ...agent,
            improvements: improvements,
            totalImprovements: improvements.filter(i => i.applied).length
          };
        });

        return NextResponse.json({
          success: true,
          data: {
            agents: agentsWithImprovements,
            activities: state.activities.slice(0, 20),
            isActive: state.isActive,
            stats: {
              ...stats,
              totalImprovements: improverState.totalImprovements
            },
            timestamp: Date.now()
          }
        });
      }

      case 'activities': {
        const state = coordinator.getState();
        return NextResponse.json({
          success: true,
          data: {
            activities: state.activities.slice(0, 20),
            count: state.activities.length
          }
        });
      }

      case 'improvements': {
        const improverState = improver.getState();
        const agents = improverState.agents || [];
        const allImprovements = agents.flatMap(agent =>
          (agent.improvements || []).map(imp => {
            const { code, ...rest } = imp;
            return {
              ...rest,
              agentName: agent.name,
              agentIcon: agent.icon
            };
          })
        );

        return NextResponse.json({
          success: true,
          data: {
            improvements: allImprovements.slice(0, 20),
            count: allImprovements.length
          }
        });
      }

      case 'recommendations': {
        const state = coordinator.getState();
        const recommendations = (state.agents || []).flatMap(agent =>
          (agent.recentWork || []).slice(0, 3).map(work => ({
            agent: agent.name,
            icon: agent.icon,
            title: work,
            type: 'completed',
            priority: 'high' as const,
            timestamp: agent.lastActivity
          }))
        ).slice(0, 15);

        return NextResponse.json({
          success: true,
          data: {
            recommendations,
            count: recommendations.length
          }
        });
      }

      case 'health': {
        const state = coordinator.getState();
        const improverState = improver.getState();
        return NextResponse.json({
          success: true,
          data: {
            status: 'healthy',
            isActive: state.isActive,
            lastUpdate: state.lastUpdate,
            improvementsApplied: improverState.totalImprovements,
            timestamp: Date.now()
          }
        });
      }

      case 'start': {
        coordinator.start();
        return NextResponse.json({
          success: true,
          data: { message: 'Swarm started' }
        });
      }

      case 'stop': {
        coordinator.stop();
        improver.stop();
        return NextResponse.json({
          success: true,
          data: { message: 'Swarm stopped' }
        });
      }

      default:
        return NextResponse.json({
          success: true,
          data: {
            message: 'AI Agent Swarm API',
            endpoints: [
              'GET /api/swarm?action=status - Get swarm status',
              'GET /api/swarm?action=improvements - Get actual code improvements',
              'GET /api/swarm?action=activities - Get activity feed',
              'GET /api/swarm?action=start - Start agents',
              'GET /api/swarm?action=stop - Stop agents',
              'GET /api/swarm?action=health - Health check'
            ]
          }
        });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}

/**
 * POST /api/swarm - Control swarm
 */
export async function POST(req: NextRequest) {
  const coordinator = getRealAgentCoordinator();
  const improver = getAutonomousImprover();

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'start':
        coordinator.start();
        improver.start();
        return NextResponse.json({
          success: true,
          data: { message: 'Swarm started with autonomous improvements' }
        });

      case 'stop':
        coordinator.stop();
        improver.stop();
        return NextResponse.json({
          success: true,
          data: { message: 'Swarm stopped' }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: String(error)
    }, { status: 500 });
  }
}
