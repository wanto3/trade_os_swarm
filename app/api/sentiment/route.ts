import { NextRequest, NextResponse } from 'next/server';
import { calculateSentiment, updateSentimentPriceHistory } from '@/lib/services/sentiment.service';
import { getCurrentPrice, getSupportedSymbols } from '@/lib/services/crypto-data.service';

export async function GET(request: NextRequest) {
  try {
    const symbols = getSupportedSymbols();

    // Fetch current prices for all symbols
    const prices = await Promise.all(
      symbols.map(async (symbol) => {
        const price = await getCurrentPrice(symbol);
        updateSentimentPriceHistory(symbol, price.price);
        return {
          symbol: price.symbol,
          price: price.price,
          change24h: price.change24h,
          volume24h: price.volume24h
        };
      })
    );

    const sentiment = calculateSentiment(prices);

    return NextResponse.json({
      success: true,
      data: sentiment,
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
