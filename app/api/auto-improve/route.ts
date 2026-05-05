/**
 * Auto-Improve Scheduler API
 * Control the automatic self-improvement scheduler
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  startScheduler,
  stopScheduler,
  enableAutoImprove,
  disableAutoImprove,
  getSchedulerStatus,
  runAutoImproveCycle
} from '@/lib/auto-improvement';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'status';

  try {
    switch (action) {
      case 'status':
        const status = getSchedulerStatus();
        return NextResponse.json({
          success: true,
          data: status
        });

      case 'run':
        // Manually trigger an improvement cycle
        const result = await runAutoImproveCycle();
        return NextResponse.json({
          success: result.success,
          data: {
            implemented: result.implemented,
            errors: result.errors,
            timestamp: result.timestamp
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Auto-improve API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, intervalMinutes, maxPerCycle } = body;

    switch (action) {
      case 'enable':
        const enabledConfig = enableAutoImprove(
          intervalMinutes || 30,
          maxPerCycle || 2
        );
        return NextResponse.json({
          success: true,
          data: {
            message: 'Auto-improvement scheduler enabled',
            config: enabledConfig
          }
        });

      case 'disable':
        const disabledConfig = disableAutoImprove();
        return NextResponse.json({
          success: true,
          data: {
            message: 'Auto-improvement scheduler disabled',
            config: disabledConfig
          }
        });

      case 'start':
        startScheduler();
        return NextResponse.json({
          success: true,
          data: { message: 'Scheduler started' }
        });

      case 'stop':
        stopScheduler();
        return NextResponse.json({
          success: true,
          data: { message: 'Scheduler stopped' }
        });

      case 'run':
        // Run a single cycle
        const result = await runAutoImproveCycle();
        return NextResponse.json({
          success: result.success,
          data: {
            implemented: result.implemented,
            errors: result.errors,
            timestamp: result.timestamp
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Auto-improve POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}