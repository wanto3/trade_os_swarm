/**
 * Trading Intelligence Cron Job
 *
 * Runs every 12 hours to:
 * 1. Analyze which indicators work best
 * 2. Generate new trading indicators
 * 3. Discover new data sources
 * 4. Suggest UI improvements for better decisions
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradingIntelligenceImprover } from '@/lib/agents/trading-intelligence-improver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function verifyCronRequest(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();

  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const improver = getTradingIntelligenceImprover();
    const state = improver.getState();

    // Run improvement cycle
    console.log('🧠 Running trading intelligence cycle...');
    const results = await improver.runImprovementCycle();

    return NextResponse.json({
      success: true,
      data: {
        results,
        state: improver.getState(),
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
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
