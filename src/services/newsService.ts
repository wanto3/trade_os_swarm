import axios from 'axios';

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  relatedSymbols: string[];
}

// RSS to JSON converter (free, no API key needed)
const RSS2JSON_URL = 'https://api.rss2json.com/v1/api.json';

const RSS_FEEDS = [
  { name: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', source: 'coindesk' },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss', source: 'cointelegraph' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com/feed/', source: 'cryptoslate' },
];

const POSITIVE_KEYWORDS = [
  'surge', 'rally', 'bull', 'bullish', 'gain', 'rise', 'soar',
  'breakthrough', 'adoption', 'launch', 'partnership', 'growth',
  'recovery', 'break', 'high', 'profit', 'win', 'success', 'upgrade'
];

const NEGATIVE_KEYWORDS = [
  'crash', 'dump', 'bear', 'bearish', 'fall', 'drop', 'plunge',
  'hack', 'ban', 'regulation', 'sec', 'concern', 'fear', 'loss',
  'low', 'decline', 'risk', 'warning', 'fraud', 'scam', 'downgrade'
];

const CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'Bitcoin', 'Ethereum', 'BNB', 'Binance', 'ADA', 'Cardano',
  'SOL', 'Solana', 'XRP', 'Ripple', 'DOGE', 'Dogecoin', 'DOT', 'Polkadot',
  'MATIC', 'Polygon', 'AVAX', 'Avalanche', 'LINK', 'Chainlink', 'UNI', 'Uniswap'
];

export class NewsService {
  private articleCache: NewsArticle[] = [];
  private lastFetch: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes

  async getNews(limit: number = 20): Promise<NewsArticle[]> {
    const now = Date.now();

    // Return cached data if still fresh
    if (this.articleCache.length > 0 && now - this.lastFetch < this.cacheTTL) {
      return this.articleCache.slice(0, limit);
    }

    try {
      // Fetch from all RSS feeds in parallel
      const feedPromises = RSS_FEEDS.map(feed => this.fetchRSSFeed(feed.url, feed.source));
      const results = await Promise.allSettled(feedPromises);

      const allNews: NewsArticle[] = [];
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          allNews.push(...result.value);
        }
      });

      // Sort by date (newest first)
      allNews.sort((a, b) => b.publishedAt - a.publishedAt);

      this.articleCache = allNews;
      this.lastFetch = now;

      return allNews.slice(0, limit);
    } catch (error) {
      console.error('Error fetching news:', error);
      // Return cached data on error
      return this.articleCache.slice(0, limit);
    }
  }

  async getNewsForSymbol(symbol: string, limit: number = 5): Promise<NewsArticle[]> {
    const allNews = await this.getNews(50);
    const upperSymbol = symbol.toUpperCase();

    return allNews
      .filter(article =>
        article.relatedSymbols.includes(upperSymbol) ||
        article.title.toUpperCase().includes(upperSymbol) ||
        article.description.toUpperCase().includes(upperSymbol)
      )
      .slice(0, limit);
  }

  private async fetchRSSFeed(feedUrl: string, source: string): Promise<NewsArticle[]> {
    try {
      const response = await axios.get(RSS2JSON_URL, {
        params: { rss_url: feedUrl },
        timeout: 10000
      });

      const items = response.data?.items || [];

      return items.slice(0, 10).map((item: any, index: number) => {
        const title = item.title || '';
        const description = this.stripHtml(item.description || '').substring(0, 200);
        const combinedText = `${title} ${description}`;

        return {
          id: `${source}-${index}-${Date.now()}`,
          title,
          description,
          url: item.link || '',
          source,
          publishedAt: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
          sentiment: this.analyzeSentiment(combinedText),
          relatedSymbols: this.extractSymbols(combinedText)
        };
      });
    } catch (error) {
      console.error(`Error fetching RSS feed ${source}:`, error);
      return [];
    }
  }

  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const lowerText = text.toLowerCase();
    let positiveScore = 0;
    let negativeScore = 0;

    for (const keyword of POSITIVE_KEYWORDS) {
      if (lowerText.includes(keyword)) positiveScore++;
    }

    for (const keyword of NEGATIVE_KEYWORDS) {
      if (lowerText.includes(keyword)) negativeScore++;
    }

    if (positiveScore > negativeScore) return 'positive';
    if (negativeScore > positiveScore) return 'negative';
    return 'neutral';
  }

  private extractSymbols(text: string): string[] {
    const symbols: string[] = [];
    const upperText = text.toUpperCase();

    for (const crypto of CRYPTO_SYMBOLS) {
      if (upperText.includes(crypto.toUpperCase()) && !symbols.includes(crypto.toUpperCase())) {
        symbols.push(crypto.toUpperCase());
      }
    }

    return symbols.slice(0, 3);
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  }

  clearCache(): void {
    this.articleCache = [];
    this.lastFetch = 0;
  }
}
