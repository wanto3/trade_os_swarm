import { NextRequest, NextResponse } from 'next/server';
import { calculatePosition } from '@/lib/services/position-calculator.service';
import { generateTradingSignal, getPriceHistory } from '@/lib/services/crypto-data.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, currentPrice, stopLossPercent = 2, targetPercent = 5 } = body;

    if (!symbol || currentPrice === undefined) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: symbol, currentPrice',
        timestamp: Date.now()
      }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();

    // Generate signal for the symbol
    const history = getPriceHistory(upperSymbol);

    if (!history || history.length < 20) {
      // Use a neutral signal if no history
      const mockSignal = {
        symbol: upperSymbol,
        action: 'HOLD' as const,
        confidence: 50,
        reasons: ['Using default recommendation'],
        indicators: [],
        timestamp: Date.now()
      };

      const position = calculatePosition(
        mockSignal,
        Number(currentPrice),
        Number(stopLossPercent),
        Number(targetPercent)
      );

      return NextResponse.json({
        success: true,
        data: position,
        timestamp: Date.now()
      });
    }

    const signal = generateTradingSignal(upperSymbol, history);
    const position = calculatePosition(
      signal,
      Number(currentPrice),
      Number(stopLossPercent),
      Number(targetPercent)
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
