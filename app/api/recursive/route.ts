/**
 * Recursive Swarm API - For autonomous continuous improvement
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecursiveSwarm } from '@/lib/agents/recursive-swarm';

let recursiveIsRunning = false;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/recursive?action=start - Start recursive improvement
 * GET /api/recursive?action=status - Get improvement status
 * GET /api/recursive?action=stop - Stop recursive improvement
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  const swarm = getRecursiveSwarm();

  try {
    switch (action) {
      case 'start':
        if (!recursiveIsRunning) {
          recursiveIsRunning = true;
          // Start in background without awaiting
          swarm.startRecursiveImprovement().finally(() => {
            recursiveIsRunning = false;
          });
          return NextResponse.json({
            success: true,
            data: { message: 'Recursive improvement started' }
          });
        }
        return NextResponse.json({
          success: true,
          data: { message: 'Already running' }
        });

      case 'status':
        return NextResponse.json({
          success: true,
          data: swarm.getStatus()
        });

      case 'stop':
        swarm.stop();
        recursiveIsRunning = false;
        return NextResponse.json({
          success: true,
          data: { message: 'Recursive improvement stopped' }
        });

      default:
        return NextResponse.json({
          success: true,
          data: {
            message: 'Recursive Swarm API',
            endpoints: [
              'GET /api/recursive?action=start - Start autonomous improvement',
              'GET /api/recursive?action=status - Get cycle status',
              'GET /api/recursive?action=stop - Stop improvement'
            ],
            stats: swarm.getState().stats
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
