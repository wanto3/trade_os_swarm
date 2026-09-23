import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchKalshiMarkets, fetchPolymarketMarkets, findCrossVenueCandidates,
  type PredictionMarket,
} from '../../lib/services/prediction-markets.service'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('prediction market feeds', () => {
  it('uses Kalshi dollar asks, not last price or implied midpoint', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ markets: [
      { ticker: 'KX-1', title: 'Will event happen?', market_type: 'binary', yes_ask_dollars: '0.6200',
        no_ask_dollars: '0.4100', yes_ask_size_fp: '15.00', volume_24h_fp: '42.00', last_price_dollars: '0.31' },
    ] }) }) as typeof fetch
    const [market] = await fetchKalshiMarkets()
    expect(market.yesAsk).toBe(0.62)
    expect(market.noAsk).toBe(0.41)
    expect(market.yesAskSize).toBe(15)
    expect(market.quoteSource).toBe('market-summary')
  })

  it('reads Polymarket CLOB asks and ignores last traded prices', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/books') ? [
        { asset_id: 'yes-token', asks: [{ price: '0.57', size: '20' }, { price: '0.56', size: '10' }] },
        { asset_id: 'no-token', asks: [{ price: '0.46', size: '5' }] },
      ] : [{ id: '1', question: 'Will event happen?', outcomes: '["Yes","No"]',
        clobTokenIds: '["yes-token","no-token"]', volume24hr: '1000', slug: 'event-happen' }],
    })) as typeof fetch
    const [market] = await fetchPolymarketMarkets()
    expect(market.yesAsk).toBe(0.56)
    expect(market.outcomes).toEqual(['Yes', 'No'])
    expect(market.yesAskSize).toBe(10)
    expect(market.noAsk).toBe(0.46)
    expect(market.quoteSource).toBe('orderbook')
  })

  it('never labels matched titles as verified arbitrage', () => {
    const base: PredictionMarket = {
      id: '1', venue: 'polymarket', title: 'Will event happen by Friday?', outcomes: ['Yes', 'No'], url: 'https://polymarket.com',
      yesAsk: 0.4, noAsk: 0.7, yesAskSize: 10, noAskSize: 10, volume24h: 100,
      closeTime: '2026-09-25T00:00:00Z', updatedAt: null, rules: null, quoteSource: 'orderbook',
    }
    const matched = findCrossVenueCandidates([base, { ...base, id: 'KX-1', venue: 'kalshi',
      yesAsk: 0.5, noAsk: 0.5, quoteSource: 'market-summary' }])
    expect(matched).toHaveLength(1)
    expect(matched[0].bestOppositeAskSum).toBe(0.9)
    expect(matched[0].verifiedArbitrage).toBe(false)
  })

  it('rejects same-title matches with materially different close times', () => {
    const base: PredictionMarket = {
      id: '1', venue: 'polymarket', title: 'Will event happen by Friday?', outcomes: ['Yes', 'No'], url: 'https://polymarket.com',
      yesAsk: 0.4, noAsk: 0.7, yesAskSize: 10, noAskSize: 10, volume24h: 100,
      closeTime: '2026-09-25T00:00:00Z', updatedAt: null, rules: null, quoteSource: 'orderbook',
    }
    expect(findCrossVenueCandidates([base, { ...base, id: 'KX-1', venue: 'kalshi',
      closeTime: '2026-10-25T00:00:00Z' }])).toHaveLength(0)
  })
})
