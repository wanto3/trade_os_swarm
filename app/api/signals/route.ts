import { NextRequest, NextResponse } from 'next/server';
import { generateTradingSignal, getPriceHistory, getSupportedSymbols } from '@/lib/services/crypto-data.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');

    if (symbol) {
      // Get signal for specific symbol
      const upperSymbol = symbol.toUpperCase();
      const history = getPriceHistory(upperSymbol);

      if (!history || history.length < 20) {
        return NextResponse.json({
          success: false,
          error: 'Insufficient price data for signal generation',
          timestamp: Date.now()
        }, { status: 400 });
      }

      const signal = generateTradingSignal(upperSymbol, history);

      return NextResponse.json({
        success: true,
        data: [signal],
        timestamp: Date.now()
      });
    }

    // Get signals for all supported symbols
    const supportedSymbols = getSupportedSymbols();
    const signals = supportedSymbols
      .map(sym => {
        const history = getPriceHistory(sym);
        if (!history || history.length < 20) return null;
        return generateTradingSignal(sym, history);
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    return NextResponse.json({
      success: true,
      data: signals,
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
