import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeMarketWithEdgeEngine, _clearEdgeEngineCache } from '../edge-engine'
import type { MarketForAnalysis, CategoryEvidence } from '../groq-market-analysis'

vi.mock('../claude-code-llm.service', () => ({
  callClaudeCode: vi.fn(),
  ClaudeCodeRateLimitError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'ClaudeCodeRateLimitError'
    }
  },
}))

vi.mock('../groq-market-analysis', async (importOriginal) => {
  const original = await importOriginal<typeof import('../groq-market-analysis')>()
  return {
    ...original,
    analyzeMarketWithLLM: vi.fn(),
  }
})

const baseMarket: MarketForAnalysis = {
  question: 'Will Trump win the 2026 election?',
  currentPrice: 0.55,
  outcomes: ['Yes', 'No'],
  endDate: '2026-11-03',
  volume: 1000000,
  liquidity: 500000,
}

const baseEvidence: CategoryEvidence = {
  category: 'policy',
  bullishFindings: [{ text: 'Recent poll shows Trump leading by 5pts', source: 'news' }],
  bearishFindings: [],
  neutralFindings: [],
  overallSignal: 'bullish',
  signalStrength: 60,
  keyInsights: [],
}

describe('analyzeMarketWithEdgeEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _clearEdgeEngineCache()
    delete process.env.EDGE_ENGINE_USE_CLAUDE_CODE
  })

  it('routes high-DPS markets to Sonnet via claude-code-llm when EDGE_ENGINE_USE_CLAUDE_CODE=1', async () => {
    process.env.EDGE_ENGINE_USE_CLAUDE_CODE = '1'
    const { callClaudeCode } = await import('../claude-code-llm.service')
    ;(callClaudeCode as any).mockResolvedValue({
      keyDrivers: ['polls'],
      yourEstimate: 0.62,
      direction: 'yes',
      confidence: 'high',
      reasoning: 'Polls strong',
      citedEvidence: ['poll'],
      shouldBet: true,
    })

    const result = await analyzeMarketWithEdgeEngine(baseMarket, baseEvidence)

    expect(callClaudeCode).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-sonnet-4-6' }))
    expect(result.analysis.estimatedProbability).toBeCloseTo(0.62, 2)
    expect(result.modelUsed).toBe('sonnet')
    expect(result.dps.tier).toBe('high')
  })

  it('defaults to Groq direct path (no claude-code) for high-DPS', async () => {
    const { callClaudeCode } = await import('../claude-code-llm.service')
    const { analyzeMarketWithLLM } = await import('../groq-market-analysis')
    ;(analyzeMarketWithLLM as any).mockResolvedValue({
      estimatedProbability: 0.62,
      reasoning: 'Groq direct',
      confidence: 'high',
      evidence: [],
      shouldBet: true,
      direction: 'yes',
      edgeSize: 0.07,
      evidenceCount: 1,
      signalStrength: 60,
    })

    const result = await analyzeMarketWithEdgeEngine(baseMarket, baseEvidence)

    expect(callClaudeCode).not.toHaveBeenCalled()
    expect(analyzeMarketWithLLM).toHaveBeenCalled()
    expect(result.modelUsed).toBe('groq-fallback')
    expect(result.dps.tier).toBe('high')
  })

  it('skips low-DPS markets entirely', async () => {
    const lowMarket = { ...baseMarket, question: 'Will the Lakers beat the Celtics tonight?' }
    const result = await analyzeMarketWithEdgeEngine(lowMarket, baseEvidence)

    expect(result.modelUsed).toBe('skip')
    expect(result.analysis.shouldBet).toBe(false)
    expect(result.analysis.direction).toBe('skip')
    expect(result.dps.tier).toBe('low')
  })

  it('falls back to Groq when Opus rate-limits', async () => {
    process.env.EDGE_ENGINE_USE_CLAUDE_CODE = '1'
    const { callClaudeCode, ClaudeCodeRateLimitError } = await import('../claude-code-llm.service')
    const { analyzeMarketWithLLM } = await import('../groq-market-analysis')
    ;(callClaudeCode as any).mockRejectedValue(new ClaudeCodeRateLimitError('5-hour window exhausted'))
    ;(analyzeMarketWithLLM as any).mockResolvedValue({
      estimatedProbability: 0.58,
      reasoning: 'Groq fallback',
      confidence: 'medium',
      evidence: [],
      shouldBet: true,
      direction: 'yes',
      edgeSize: 0.03,
      evidenceCount: 1,
      signalStrength: 60,
    })

    const result = await analyzeMarketWithEdgeEngine(baseMarket, baseEvidence)

    expect(analyzeMarketWithLLM).toHaveBeenCalled()
    expect(result.modelUsed).toBe('groq-fallback')
    expect(result.analysis.reasoning).toBe('Groq fallback')
  })

  it('applies DPS conviction multiplier to medium-DPS markets', async () => {
    process.env.EDGE_ENGINE_USE_CLAUDE_CODE = '1'
    const { callClaudeCode } = await import('../claude-code-llm.service')
    const medMarket = { ...baseMarket, question: 'Will some random thing happen?' }
    ;(callClaudeCode as any).mockResolvedValue({
      keyDrivers: ['x'],
      yourEstimate: 0.62,
      direction: 'yes',
      confidence: 'high',
      reasoning: 'reasoning',
      citedEvidence: [],
      shouldBet: true,
    })

    const result = await analyzeMarketWithEdgeEngine(medMarket, baseEvidence)

    expect(result.dps.tier).toBe('medium')
    expect(result.modelUsed).toBe('sonnet')
    expect(result.dpsMultiplierApplied).toBe(0.85)
  })
})
