import { NextRequest, NextResponse } from 'next/server';
import { getCurrentPrice, getMultiplePrices, getSupportedSymbols } from '@/lib/services/crypto-data.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbolsParam = searchParams.get('symbols');

    let prices;

    if (symbolsParam) {
      const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase());
      prices = await getMultiplePrices(symbols);
    } else {
      // Return all supported symbols
      const supportedSymbols = getSupportedSymbols();
      prices = await getMultiplePrices(supportedSymbols);
    }

    return NextResponse.json({
      success: true,
      data: prices,
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
