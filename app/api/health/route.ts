import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0'
  });
}
