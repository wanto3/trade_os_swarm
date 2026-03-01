import { NextRequest, NextResponse } from 'next/server';
import { getNews, getNewsForSymbol } from '@/lib/services/news.service';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    let articles;

    if (symbol) {
      articles = await getNewsForSymbol(symbol.toUpperCase(), limit);
    } else {
      articles = await getNews(limit);
    }

    return NextResponse.json({
      success: true,
      data: articles,
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
