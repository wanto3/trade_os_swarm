import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AGENTS_STATE_FILE = join(process.cwd(), 'data', 'agents-running-state.json');
const AUTONOMOUS_STATE_FILE = join(process.cwd(), 'data', 'autonomous-agents-state.json');
const IMPROVER_STATE_FILE = join(process.cwd(), 'data', 'autonomous-improver-state.json');

interface Agent {
  name: string;
  status: string;
  type: string;
}

interface SwarmStatus {
  isActive: boolean;
  agents: Agent[];
  activities: { action: string; detail: string; time: number }[];
  stats: {
    activeAgents: number;
    totalImprovements: number;
    cyclesCompleted: number;
  };
}

function getState(filePath: string): any {
  if (existsSync(filePath)) {
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8'));
    } catch {}
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'status') {
    const agentsState = getState(AGENTS_STATE_FILE);
    const autonomousState = getState(AUTONOMOUS_STATE_FILE);
    const improverState = getState(IMPROVER_STATE_FILE);

    const isActive = (agentsState?.isRunning) || (autonomousState?.isRunning) || false;

    // Build agents list
    const agents: Agent[] = [];

    if (agentsState?.isRunning) {
      agents.push({ name: 'Research Agent', status: 'running', type: 'research' });
      agents.push({ name: 'Builder Agent', status: 'running', type: 'builder' });
    }

    if (autonomousState?.isRunning) {
      agents.push({ name: 'Component Agent', status: 'running', type: 'component' });
    }

    if (improverState?.config?.enabled) {
      agents.push({ name: 'Code Improver', status: improverState.currentCycle ? 'running' : 'idle', type: 'improver' });
    }

    // Build activities
    const activities: { action: string; detail: string; time: number }[] = [];

    if (agentsState?.cycles) {
      activities.push({
        action: 'Research Cycles',
        detail: `${agentsState.cycles} cycles completed`,
        time: agentsState.lastActivity || Date.now()
      });
    }

    if (autonomousState?.cycles) {
      activities.push({
        action: 'Component Integration',
        detail: `${autonomousState.componentsIntegrated?.length || 0} components integrated`,
        time: autonomousState.lastActivity || Date.now()
      });
    }

    if (improverState?.cycles?.length) {
      const lastCycle = improverState.cycles[improverState.cycles.length - 1];
      activities.push({
        action: 'Code Improvement',
        detail: `Last: ${lastCycle.phase}`,
        time: improverState.stats?.totalCycles || Date.now()
      });
    }

    const status: SwarmStatus = {
      isActive,
      agents,
      activities: activities.length > 0 ? activities : [
        { action: 'Idle', detail: 'No agents running', time: Date.now() }
      ],
      stats: {
        activeAgents: agents.length,
        totalImprovements: (autonomousState?.componentsIntegrated?.length || 0) + (improverState?.stats?.successfulImprovements || 0),
        cyclesCompleted: (agentsState?.cycles || 0) + (autonomousState?.cycles || 0)
      }
    };

    return NextResponse.json({ success: true, data: status });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'start') {
    // This would start the swarm - for now just return status
    return NextResponse.json({
      success: true,
      message: 'Swarm control endpoint. Use /api/agents/start to start autonomous agents.',
      data: { isActive: true }
    });
  }

  return NextResponse.json({ success: false, error: 'Invalid action' });
}
