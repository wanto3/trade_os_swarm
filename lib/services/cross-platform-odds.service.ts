export interface CrossPlatformOdds {
  platform: string;
  question: string;
  probability: number;
  url: string;
  lastUpdated: string;
}

export interface DivergenceAnalysis {
  polymarketProb: number;
  crossPlatformOdds: CrossPlatformOdds[];
  avgDivergence: number;
  maxDivergence: number;
  signal: 'aligned' | 'divergent' | 'no-data';
  consensusProbability: number | null;
}

// ---------------------------------------------------------------------------
// Cache (in-memory, 15-min TTL)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: CrossPlatformOdds[];
  expiresAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_MAX_SIZE = 100;
const FETCH_TIMEOUT_MS = 5_000;

const cache = new Map<string, CacheEntry>();

function getCached(key: string): CrossPlatformOdds[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: CrossPlatformOdds[]): void {
  // Evict expired entries when cache is full
  if (cache.size >= CACHE_MAX_SIZE) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    cache.forEach((v, k) => { if (now > v.expiresAt) keysToDelete.push(k); });
    keysToDelete.forEach(k => cache.delete(k));
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function questionSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeQuestion(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeQuestion(b).split(' ').filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  Array.from(wordsA).forEach(w => { if (wordsB.has(w)) overlap++; });
  return overlap / Math.max(wordsA.size, wordsB.size);
}

// ---------------------------------------------------------------------------
// Fetchers (with 5-second timeout)
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const MIN_SIMILARITY = 0.3;

async function fetchMetaculusOdds(question: string): Promise<CrossPlatformOdds[]> {
  try {
    const encoded = encodeURIComponent(question);
    const url = `https://www.metaculus.com/api2/questions/?search=${encoded}&limit=5&status=open`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];

    const data = await res.json();
    const results: CrossPlatformOdds[] = [];

    for (const q of data.results ?? []) {
      // Only binary questions with a community prediction
      const prob = q.community_prediction?.full?.q2;
      if (typeof prob !== 'number') continue;
      if (q.possibilities?.type !== 'binary') continue;

      const sim = questionSimilarity(question, q.title ?? '');
      if (sim < MIN_SIMILARITY) continue;

      results.push({
        platform: 'metaculus',
        question: q.title,
        probability: prob,
        url: `https://www.metaculus.com/questions/${q.id}/`,
        lastUpdated: q.last_activity_time ?? new Date().toISOString(),
      });
    }
    return results;
  } catch {
    return [];
  }
}

async function fetchKalshiOdds(question: string): Promise<CrossPlatformOdds[]> {
  try {
    const encoded = encodeURIComponent(question);
    const url = `https://api.elections.kalshi.com/trade-api/v2/markets?status=open&limit=5&title=${encoded}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];

    const data = await res.json();
    const results: CrossPlatformOdds[] = [];

    for (const market of data.markets ?? []) {
      const prob = market.last_price ?? market.yes_ask;
      if (typeof prob !== 'number') continue;

      const sim = questionSimilarity(question, market.title ?? '');
      if (sim < MIN_SIMILARITY) continue;

      results.push({
        platform: 'kalshi',
        question: market.title,
        probability: prob,
        url: `https://kalshi.com/markets/${market.ticker}`,
        lastUpdated: market.close_time ?? new Date().toISOString(),
      });
    }
    return results;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchCrossPlatformOdds(
  question: string,
): Promise<CrossPlatformOdds[]> {
  const cacheKey = normalizeQuestion(question);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [metaculus, kalshi] = await Promise.all([
    fetchMetaculusOdds(question),
    fetchKalshiOdds(question),
  ]);

  const combined = [...metaculus, ...kalshi];
  setCache(cacheKey, combined);
  return combined;
}

export function analyzeDivergence(
  polymarketProb: number,
  crossPlatformOdds: CrossPlatformOdds[],
): DivergenceAnalysis {
  if (crossPlatformOdds.length === 0) {
    return {
      polymarketProb,
      crossPlatformOdds,
      avgDivergence: 0,
      maxDivergence: 0,
      signal: 'no-data',
      consensusProbability: null,
    };
  }

  const divergences = crossPlatformOdds.map((o) =>
    Math.abs(polymarketProb - o.probability),
  );
  const avgDivergence =
    divergences.reduce((a, b) => a + b, 0) / divergences.length;
  const maxDivergence = Math.max(...divergences);

  const allProbs = [
    polymarketProb,
    ...crossPlatformOdds.map((o) => o.probability),
  ];
  const consensusProbability =
    allProbs.reduce((a, b) => a + b, 0) / allProbs.length;

  return {
    polymarketProb,
    crossPlatformOdds,
    avgDivergence,
    maxDivergence,
    signal: avgDivergence > 0.1 ? 'divergent' : 'aligned',
    consensusProbability,
  };
}

export async function fetchCrossPlatformOddsBatch(
  questions: string[],
): Promise<Map<string, CrossPlatformOdds[]>> {
  const results = new Map<string, CrossPlatformOdds[]>();
  const BATCH_SIZE = 3;

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((q) => fetchCrossPlatformOdds(q)),
    );
    batch.forEach((q, idx) => results.set(q, batchResults[idx]));

    // 1-second delay between batches (skip after last batch)
    if (i + BATCH_SIZE < questions.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return results;
}
