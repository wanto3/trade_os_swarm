/**
 * /polymarket-test — Local test page for the fast LLM pipeline
 *
 * Shows real-time LLM analysis as markets are processed.
 * Visit: http://localhost:4000/polymarket-test
 */
'use client'

import { useEffect, useState, useRef } from 'react'

interface Market {
  id: string
  question: string
  outcomes: string[]
  outcomePrices: number[]
  volumeNum: number
  liquidityNum: number
  volume24hr: number
  spread: number
  endDateIso: string | null
  slug: string | null
  competitive: number
  url: string
}

interface Opportunity {
  id: string
  question: string
  category: string
  outcome: string
  outcomeIndex: number
  odds: number
  safetyScore: number
  riskLevel: 'low' | 'medium' | 'high'
  maxBet: number
  kellyFraction: number
  timeTier: string
  daysToClose: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  market: Market
  llmEstimate: number | null
  llmConfidence: 'high' | 'medium' | 'low' | null
  llmDirection: 'yes' | 'no' | 'skip' | null
  llmShouldBet: boolean | null
  llmReasoning: string | null
  llmEdge: number | null
  llmModel: string | null
  llmLatencyMs: number | null
  updatedAt: number | null
}

interface SSEUpdate {
  opportunity: Opportunity
}

export default function PolymarketTestPage() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [status, setStatus] = useState<string>('Connecting...')
  const [processed, setProcessed] = useState(0)
  const [betCount, setBetCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [lastHeartbeat, setLastHeartbeat] = useState<number | null>(null)
  const startTime = useRef(Date.now())
  const processedRef = useRef(new Set<string>())

  useEffect(() => {
    const eventSource = new EventSource('/api/polymarket/stream')

    eventSource.addEventListener('init', (e) => {
      const data = JSON.parse(e.data)
      setOpportunities(data.opportunities)
      setTotal(data.opportunities.length)
      setStatus(`Loaded ${data.opportunities.length} markets — analyzing...`)
      startTime.current = Date.now()
    })

    eventSource.addEventListener('update', (e) => {
      const data: SSEUpdate = JSON.parse(e.data)
      const updated = data.opportunity

      setOpportunities(prev => {
        const idx = prev.findIndex(o => o.id === updated.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = updated
          return next
        }
        return prev
      })

      if (!processedRef.current.has(updated.id)) {
        processedRef.current.add(updated.id)
        setProcessed(p => p + 1)
        if (updated.llmShouldBet) setBetCount(b => b + 1)
      }

      setElapsed(Date.now() - startTime.current)
      setStatus(
        `Analyzed ${processedRef.current.size}/${total} | ` +
        `${betCount + (updated.llmShouldBet ? 1 : 0)} bet signals | ` +
        `${((Date.now() - startTime.current) / 1000).toFixed(0)}s elapsed`
      )
    })

    eventSource.addEventListener('heartbeat', (e) => {
      setLastHeartbeat(Date.now())
    })

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data)
      setStatus(`✅ Done! ${data.processed} markets analyzed | ${data.betCount} bet signals`)
      setProcessed(data.processed)
      setBetCount(data.betCount)
      eventSource.close()
    })

    eventSource.addEventListener('error', (e) => {
      const data = JSON.parse((e as any).data)
      setStatus(`❌ Error: ${data.message}`)
      eventSource.close()
    })

    return () => eventSource.close()
  }, [])

  const bets = opportunities.filter(o => o.llmShouldBet)
  const pending = opportunities.filter(o => !o.llmShouldBet && o.llmConfidence === null)
  const skips = opportunities.filter(o => !o.llmShouldBet && o.llmConfidence !== null)

  return (
    <div style={{ fontFamily: 'system-ui, monospace', padding: '20px', maxWidth: '1200px', margin: '0 auto', background: '#0a0a0a', color: '#e0e0e0', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #333', paddingBottom: '15px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px', color: '#00ff88' }}>⚡ Polymarket Fast LLM Pipeline</h1>
          <p style={{ margin: '5px 0 0', color: '#888', fontSize: '13px' }}>Real-time LLM analysis via SSE — no blocking</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', color: status.includes('✅') ? '#00ff88' : status.includes('❌') ? '#ff4444' : '#ffaa00' }}>{status}</div>
          {lastHeartbeat && <div style={{ fontSize: '11px', color: '#555' }}>Last heartbeat: {((Date.now() - lastHeartbeat) / 1000).toFixed(0)}s ago</div>}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        <StatBox label="Markets" value={total} />
        <StatBox label="Analyzed" value={processed} color="#ffaa00" />
        <StatBox label="Bet Signals" value={betCount} color="#00ff88" />
        <StatBox label="Elapsed" value={`${(elapsed / 1000).toFixed(1)}s`} />
      </div>

      {/* BET OPPORTUNITIES */}
      {bets.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ color: '#00ff88', fontSize: '16px', marginBottom: '10px', borderLeft: '3px solid #00ff88', paddingLeft: '10px' }}>
            ✅ BET SIGNALS ({bets.length})
          </h2>
          {bets.map(opp => (
            <OpportunityCard key={opp.id} opp={opp} variant="bet" />
          ))}
        </div>
      )}

      {/* PENDING */}
      {pending.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ color: '#888', fontSize: '16px', marginBottom: '10px', borderLeft: '3px solid #555', paddingLeft: '10px' }}>
            ⏳ PENDING LLM ANALYSIS ({pending.length})
          </h2>
          {pending.slice(0, 10).map(opp => (
            <OpportunityCard key={opp.id} opp={opp} variant="pending" />
          ))}
          {pending.length > 10 && <div style={{ color: '#555', fontSize: '12px' }}>+ {pending.length - 10} more pending</div>}
        </div>
      )}

      {/* SKIPS */}
      {skips.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <h2 style={{ color: '#555', fontSize: '16px', marginBottom: '10px', borderLeft: '3px solid #333', paddingLeft: '10px' }}>
            ⏭️ SKIP / WATCH ({skips.length})
          </h2>
          {skips.slice(0, 10).map(opp => (
            <OpportunityCard key={opp.id} opp={opp} variant="skip" />
          ))}
          {skips.length > 10 && <div style={{ color: '#555', fontSize: '12px' }}>+ {skips.length - 10} more skipped</div>}
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color = '#fff' }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#111', border: '1px solid #333', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
      <div style={{ fontSize: '24px', fontWeight: 'bold', color }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function OpportunityCard({ opp, variant }: { opp: Opportunity; variant: 'bet' | 'skip' | 'pending' }) {
  const borderColor = variant === 'bet' ? '#00ff88' : variant === 'skip' ? '#ff4444' : '#555'
  const confidenceColor = opp.llmConfidence === 'high' ? '#00ff88' : opp.llmConfidence === 'medium' ? '#ffaa00' : '#888'

  return (
    <div style={{
      background: variant === 'bet' ? '#001a0f' : '#111',
      border: `1px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '8px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10px', background: '#222', color: '#888', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
              {opp.category}
            </span>
            <span style={{ fontSize: '10px', color: '#555' }}>{opp.timeTier} | {opp.daysToClose}d</span>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: variant === 'bet' ? '#00ff88' : '#ccc', marginBottom: '4px' }}>
            {opp.question}
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            {opp.outcome} @ {(opp.odds * 100).toFixed(1)}% | Score: {opp.safetyScore} | Liq: ${(opp.market.liquidityNum / 1000).toFixed(0)}K
          </div>
          {opp.llmConfidence && (
            <div style={{ fontSize: '12px', marginTop: '6px', color: confidenceColor }}>
              <span style={{ fontWeight: 'bold' }}>{opp.llmConfidence.toUpperCase()}</span>
              {' | Est: '}
              {opp.llmEstimate !== null ? `${(opp.llmEstimate * 100).toFixed(1)}%` : '?'}
              {' | Edge: '}
              {opp.llmEdge !== null ? `${(opp.llmEdge * 100).toFixed(1)}%` : '?'}
              {opp.llmLatencyMs && ` | ${opp.llmLatencyMs}ms`}
            </div>
          )}
          {opp.llmReasoning && (
            <div style={{ fontSize: '11px', color: '#666', marginTop: '4px', lineHeight: '1.4' }}>
              {opp.llmReasoning.substring(0, 200)}
            </div>
          )}
          {!opp.llmConfidence && (
            <div style={{ fontSize: '11px', color: '#444', marginTop: '4px' }}>
              {opp.reasoning}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', minWidth: '100px' }}>
          {opp.llmShouldBet ? (
            <div style={{ color: '#00ff88', fontWeight: 'bold', fontSize: '16px' }}>BET</div>
          ) : opp.llmConfidence ? (
            <div style={{ color: '#ff4444', fontSize: '14px' }}>SKIP</div>
          ) : (
            <div style={{ color: '#555', fontSize: '14px' }}>...</div>
          )}
        </div>
      </div>
    </div>
  )
}
