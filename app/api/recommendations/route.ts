import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPrice } from '@/lib/services/crypto-data.service';
import { generateTradingSignal, getPriceHistory } from '@/lib/services/crypto-data.service';
import { calculatePosition } from '@/lib/services/position-calculator.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const risk = parseFloat(searchParams.get('risk') || '2');

    if (!symbol) {
      return NextResponse.json({
        success: false,
        error: 'Symbol parameter is required',
        timestamp: Date.now()
      }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();

    // Get current price
    const priceData = await getCurrentPrice(upperSymbol);

    // Generate trading signal
    const history = getPriceHistory(upperSymbol);
    if (!history || history.length < 20) {
      return NextResponse.json({
        success: false,
        error: 'Insufficient price data for recommendation',
        timestamp: Date.now()
      }, { status: 400 });
    }

    const signal = generateTradingSignal(upperSymbol, history);

    // Calculate position recommendation
    const recommendation = calculatePosition(signal, priceData.price);

    return NextResponse.json({
      success: true,
      data: {
        ...recommendation,
        currentPrice: priceData.price,
        riskPercent: risk
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
