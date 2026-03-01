import { NextRequest, NextResponse } from 'next/server';
import {
  getPortfolio,
  getPositions,
  resetPortfolio
} from '@/lib/services/portfolio.service';

// GET - Retrieve portfolio
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const includePositions = searchParams.get('includePositions') === 'true';

    const portfolio = getPortfolio();
    const positions = includePositions ? getPositions(false) : [];

    return NextResponse.json({
      success: true,
      data: {
        ...portfolio,
        positions: includePositions ? positions : undefined
      },
      timestamp: Date.now()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 });
  }
}

// DELETE - Reset portfolio
export async function DELETE() {
  try {
    await resetPortfolio();
    const portfolio = getPortfolio();

    return NextResponse.json({
      success: true,
      data: portfolio,
      timestamp: Date.now()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 });
  }
}
