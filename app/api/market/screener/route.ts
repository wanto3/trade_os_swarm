/**
 * Market Screener API Endpoint
 * Auto-generated self-improvement feature
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auto-generated endpoint
  return NextResponse.json({
    success: true,
    data: {
      message: 'Market Screener endpoint',
      endpoint: '/api/market/screener',
      timestamp: new Date().toISOString()
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({
      success: true,
      data: {
        message: 'Market Screener - data processed',
        received: body
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Invalid request body'
    }, { status: 400 });
  }
}
