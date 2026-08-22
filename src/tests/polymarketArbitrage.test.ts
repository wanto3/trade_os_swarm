import { describe, expect, it } from 'vitest'
import {
  calculateCompleteSetArbitrage,
  consumeAsks,
} from '../../lib/services/polymarket-arbitrage.service'

describe('Polymarket complete-set arbitrage', () => {
  it('walks multiple ask levels for executable cost', () => {
    const fill = consumeAsks([
      { price: '0.46', size: '5' },
      { price: '0.48', size: '10' },
    ], 10, 0)

    expect(fill.fillable).toBe(true)
    expect(fill.filledShares).toBe(10)
    expect(fill.cost).toBeCloseTo(4.7)
    expect(fill.averagePrice).toBeCloseTo(0.47)
    expect(fill.worstPrice).toBeCloseTo(0.48)
  })

  it('identifies a locked complete-set profit after buffers', () => {
    const result = calculateCompleteSetArbitrage({
      yesAsks: [{ price: 0.46, size: 100 }],
      noAsks: [{ price: 0.51, size: 100 }],
      requestedShares: 10,
      feeRate: 0,
      gasBuffer: 0.03,
      executionBufferBps: 10,
    })

    expect(result.fillable).toBe(true)
    expect(result.payout).toBe(10)
    expect(result.acquisitionCost).toBeCloseTo(9.7)
    expect(result.grossProfit).toBeCloseTo(0.3)
    expect(result.netProfit).toBeCloseTo(0.2603)
  })

  it('subtracts taker fees on both legs', () => {
    const result = calculateCompleteSetArbitrage({
      yesAsks: [{ price: 0.46, size: 100 }],
      noAsks: [{ price: 0.51, size: 100 }],
      requestedShares: 10,
      feeRate: 0.05,
      gasBuffer: 0,
      executionBufferBps: 0,
    })

    const expectedFees = 10 * 0.05 * 0.46 * 0.54 + 10 * 0.05 * 0.51 * 0.49
    expect(result.fees).toBeCloseTo(expectedFees)
    expect(result.netProfit).toBeCloseTo(0.3 - expectedFees)
  })

  it('rejects a candidate when either leg lacks depth', () => {
    const result = calculateCompleteSetArbitrage({
      yesAsks: [{ price: 0.46, size: 10 }],
      noAsks: [{ price: 0.51, size: 4 }],
      requestedShares: 10,
      feeRate: 0,
    })

    expect(result.fillable).toBe(false)
    expect(result.fillableShares).toBe(4)
    expect(result.payout).toBe(0)
    expect(result.netProfit).toBeLessThan(0)
  })

  it('shows no arbitrage when the combined asks exceed one dollar', () => {
    const result = calculateCompleteSetArbitrage({
      yesAsks: [{ price: 0.53, size: 100 }],
      noAsks: [{ price: 0.51, size: 100 }],
      requestedShares: 10,
      feeRate: 0,
      gasBuffer: 0,
      executionBufferBps: 0,
    })

    expect(result.fillable).toBe(true)
    expect(result.grossProfit).toBeCloseTo(-0.4)
    expect(result.netProfit).toBeCloseTo(-0.4)
  })
})
