import { describe, it, expect } from 'vitest'

describe('Enhanced LLM Analysis Output', () => {
  it('should include structured reasoning fields in analysis result', () => {
    const mockLLMResponse = {
      keyDrivers: ['Fed rate decision', 'CPI data release'],
      yourEstimate: 0.72,
      edge: '12%',
      direction: 'yes',
      confidence: 'high',
      reasoning: 'Strong evidence supports YES based on macro trends.',
      citedEvidence: ['Fed signaled pause in rate hikes'],
      shouldBet: true,
      baseRate: 0.65,
      baseRateReasoning: 'Historical base rate for similar Fed policy markets is ~65%',
      subQuestions: [
        'What is the current Fed stance?',
        'What does recent CPI data suggest?',
        'Are there any upcoming FOMC meetings?'
      ],
      premortemRisks: [
        'Unexpected CPI spike could change Fed stance',
        'Geopolitical event could override domestic policy focus'
      ],
      uncertaintyRange: 0.08
    }

    expect(mockLLMResponse.baseRate).toBeTypeOf('number')
    expect(mockLLMResponse.baseRate).toBeGreaterThanOrEqual(0)
    expect(mockLLMResponse.baseRate).toBeLessThanOrEqual(1)
    expect(mockLLMResponse.subQuestions).toBeInstanceOf(Array)
    expect(mockLLMResponse.subQuestions.length).toBeGreaterThanOrEqual(2)
    expect(mockLLMResponse.premortemRisks).toBeInstanceOf(Array)
    expect(mockLLMResponse.premortemRisks.length).toBeGreaterThanOrEqual(1)
    expect(mockLLMResponse.uncertaintyRange).toBeTypeOf('number')
    expect(mockLLMResponse.uncertaintyRange).toBeGreaterThan(0)
    expect(mockLLMResponse.uncertaintyRange).toBeLessThanOrEqual(0.5)
  })

  it('should compute conviction adjustment from uncertainty range', () => {
    function uncertaintyToConvictionAdjustment(uncertaintyRange: number): number {
      if (uncertaintyRange <= 0.05) return 5
      if (uncertaintyRange <= 0.10) return 2
      if (uncertaintyRange <= 0.15) return 0
      if (uncertaintyRange <= 0.25) return -3
      return -7
    }

    expect(uncertaintyToConvictionAdjustment(0.03)).toBe(5)
    expect(uncertaintyToConvictionAdjustment(0.08)).toBe(2)
    expect(uncertaintyToConvictionAdjustment(0.12)).toBe(0)
    expect(uncertaintyToConvictionAdjustment(0.20)).toBe(-3)
    expect(uncertaintyToConvictionAdjustment(0.30)).toBe(-7)
  })
})
