'use client'

import React, { useState, useEffect } from 'react'
import { Calculator, Zap } from 'lucide-react'

interface KellyInput {
  odds: number
  winRate: number
  bankroll: number
}

interface KellyResult {
  fullKelly: number
  halfKelly: number
  quarterKelly: number
  expectedValue: number
  edge: number
}

export function KellyCalculator() {
  const [input, setInput] = useState<KellyInput>({
    odds: 0.50,
    winRate: 0.55,
    bankroll: 10000,
  })
  const [result, setResult] = useState<KellyResult | null>(null)

  useEffect(() => {
    const { odds, winRate, bankroll } = input
    if (odds <= 0 || odds >= 1 || winRate <= 0 || winRate >= 1) return

    const b = (1 / odds) - 1 // payout ratio
    const p = winRate
    const q = 1 - winRate

    const fullKelly = bankroll * ((b * p - q) / b)
    const halfKelly = fullKelly * 0.5
    const quarterKelly = fullKelly * 0.25
    const expectedValue = (p * b) - q
    const edge = (p * (1 / odds) - 1) * 100

    setResult({
      fullKelly: Math.max(0, fullKelly),
      halfKelly: Math.max(0, halfKelly),
      quarterKelly: Math.max(0, quarterKelly),
      expectedValue,
      edge,
    })
  }, [input])

  const kellyColor = (pct: number) => {
    if (pct <= 2) return 'var(--green)'
    if (pct <= 5) return 'var(--orange)'
    return 'var(--magenta)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        <div>
          <label style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
            Odds (0-1)
          </label>
          <input
            type="number"
            min="0.01"
            max="0.99"
            step="0.01"
            value={input.odds}
            onChange={e => setInput(prev => ({ ...prev, odds: parseFloat(e.target.value) || 0 }))}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              background: 'rgba(10,10,18,0.8)',
              border: '1px solid rgba(42,42,74,0.8)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div>
          <label style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
            Win Rate (0-1)
          </label>
          <input
            type="number"
            min="0.01"
            max="0.99"
            step="0.01"
            value={input.winRate}
            onChange={e => setInput(prev => ({ ...prev, winRate: parseFloat(e.target.value) || 0 }))}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '12px',
              fontFamily: 'var(--font-mono)',
              background: 'rgba(10,10,18,0.8)',
              border: '1px solid rgba(42,42,74,0.8)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>

      <div>
        <label style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: '4px' }}>
          Bankroll ($)
        </label>
        <input
          type="number"
          min="1"
          value={input.bankroll}
          onChange={e => setInput(prev => ({ ...prev, bankroll: parseFloat(e.target.value) || 0 }))}
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            background: 'rgba(10,10,18,0.8)',
            border: '1px solid rgba(42,42,74,0.8)',
            borderRadius: '6px',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Results */}
      {result && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '10px',
          background: 'rgba(10,10,18,0.5)',
          borderRadius: '8px',
          border: '1px solid rgba(42,42,74,0.5)',
        }}>
          {/* EV */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Expected Value</span>
            <span style={{
              fontSize: '14px',
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              color: result.expectedValue >= 0 ? 'var(--green)' : 'var(--magenta)',
            }}>
              {result.expectedValue >= 0 ? '+' : ''}{(result.expectedValue * 100).toFixed(2)}%
            </span>
          </div>

          {/* Kelly fractions */}
          {[
            { label: 'Full Kelly', value: result.fullKelly, pct: result.fullKelly / input.bankroll * 100 },
            { label: 'Half Kelly', value: result.halfKelly, pct: result.halfKelly / input.bankroll * 100 },
            { label: '¼ Kelly', value: result.quarterKelly, pct: result.quarterKelly / input.bankroll * 100 },
          ].map(({ label, value, pct }) => (
            <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{
                  fontSize: '13px',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                  color: value > 0 ? (pct <= 2 ? 'var(--green)' : pct <= 5 ? 'var(--orange)' : 'var(--magenta)') : 'var(--text-muted)',
                }}>
                  {value > 0 ? `$${value.toFixed(2)}` : 'No edge'}
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                    ({pct.toFixed(1)}%)
                  </span>
                </span>
              </div>
              <div style={{ height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(pct, 20)}%`,
                  height: '100%',
                  background: pct <= 2 ? 'var(--green)' : pct <= 5 ? 'var(--orange)' : 'var(--magenta)',
                  borderRadius: '2px',
                  boxShadow: `0 0 4px ${pct <= 2 ? 'var(--green)' : pct <= 5 ? 'var(--orange)' : 'var(--magenta)'}60`,
                  transition: 'width 0.3s ease-out',
                }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
