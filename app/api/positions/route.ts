import { NextRequest, NextResponse } from 'next/server';
import {
  getPortfolio,
  getPositions,
  createPosition,
  closePosition,
  resetPortfolio,
  updatePositionPrice
} from '@/lib/services/portfolio.service';

// GET - Retrieve positions and portfolio
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const openOnly = searchParams.get('open') === 'true';

    const positions = getPositions(!openOnly);
    const portfolio = getPortfolio();

    return NextResponse.json({
      success: true,
      data: {
        positions,
        portfolio,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now()
    }, { status: 500 });
  }
}

// POST - Create new position
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, type, entryPrice, quantity, leverage = 1 } = body;

    if (!symbol || !type || !entryPrice || !quantity) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: symbol, type, entryPrice, quantity',
        timestamp: Date.now()
      }, { status: 400 });
    }

    const position = createPosition(
      symbol.toUpperCase(),
      type,
      Number(entryPrice),
      Number(quantity),
      Number(leverage)
    );

    return NextResponse.json({
      success: true,
      data: position,
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

// PUT - Update position (close position)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, positionId, exitPrice } = body;

    if (action !== 'close' || !positionId) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request. Use: { action: "close", positionId, exitPrice? }',
        timestamp: Date.now()
      }, { status: 400 });
    }

    const position = closePosition(positionId, exitPrice);

    if (!position) {
      return NextResponse.json({
        success: false,
        error: 'Position not found',
        timestamp: Date.now()
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: position,
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
