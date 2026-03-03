/**
 * Autonomous Code Improvement Cron Job
 *
 * This endpoint runs periodically to:
 * 1. Analyze codebase for improvements
 * 2. Generate actual code changes using AI
 * 3. Run tests to validate
 * 4. Commit and push successful changes
 *
 * VERCEL CRON: Schedule to run every hour or daily
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAutonomousCodeImprover } from '@/lib/agents/autonomous-code-improver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Security check
function verifyCronRequest(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    // Allow in development
    return process.env.NODE_ENV !== 'production';
  }

  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret
  if (!verifyCronRequest(req)) {
    return NextResponse.json({
      success: false,
      error: 'Unauthorized'
    }, { status: 401 });
  }

  try {
    const improver = getAutonomousCodeImprover();
    const state = improver.getState();

    // Check if enabled
    if (!state.config.enabled) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'Autonomous improvement is disabled',
          state: improver.getState()
        }
      });
    }

    // Check daily limit
    const today = new Date().toDateString();
    const todayCycles = state.cycles.filter(c =>
      new Date(c.timestamp).toDateString() === today
    );

    if (todayCycles.length >= state.config.maxCyclesPerDay) {
      return NextResponse.json({
        success: true,
        data: {
          message: 'Daily limit reached',
          limit: state.config.maxCyclesPerDay,
          state: improver.getState()
        }
      });
    }

    // Run improvement cycle
    console.log('🤖 Starting autonomous improvement cycle...');
    const cycle = await improver.runCycle();

    return NextResponse.json({
      success: true,
      data: {
        cycle,
        state: improver.getState(),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Autonomous improvement error:', error);
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
