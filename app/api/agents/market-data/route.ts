import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      name: 'market-data',
      value: Math.random() * 100,
      signal: ['BUY', 'SELL', 'HOLD'][Math.floor(Math.random() * 3)],
      timestamp: Date.now(),
    },
  });
}
