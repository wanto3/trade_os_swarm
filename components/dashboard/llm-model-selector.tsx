'use client'

/**
 * Compact AI-engine selector. Lives in the dashboard header — collapsed
 * to a tiny chip that shows the active model, expands to a dropdown when
 * clicked. Stays out of the way until the user actually wants to swap.
 *
 * Design intent: invisible until you need it. The user only ever opens
 * this when Max sub runs out or they want to test a different provider.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Cpu, Check } from 'lucide-react'

type ModelId =
  | 'opus' | 'sonnet' | 'haiku'
  | 'anthropic-opus' | 'anthropic-sonnet' | 'anthropic-haiku'
  | 'groq'

interface Availability {
  maxSub: boolean
  anthropicApi: boolean
  groq: boolean
}

interface ConfigResponse {
  success: boolean
  preferredModel: ModelId
  hasUserOverride: boolean
  envDefault: ModelId
  availability: Availability
}

interface ModelOption {
  id: ModelId
  label: string
  tier: 'max-sub' | 'anthropic-api' | 'groq'
  description: string
}

const OPTIONS: ModelOption[] = [
  // Max-sub tier — free per call, requires claude-code binary
  { id: 'opus',    label: 'Claude Opus 4.7',    tier: 'max-sub', description: 'Max sub · smartest · ~60-120s per batch · default' },
  { id: 'sonnet',  label: 'Claude Sonnet 4.6',  tier: 'max-sub', description: 'Max sub · faster · ~30-60s · good fallback' },
  { id: 'haiku',   label: 'Claude Haiku 4.5',   tier: 'max-sub', description: 'Max sub · fastest Claude · ~10s · quick screens' },
  // Anthropic direct API — pay per token, requires ANTHROPIC_API_KEY
  { id: 'anthropic-opus',    label: 'Opus 4.7 (Anthropic API)',    tier: 'anthropic-api', description: 'Pay per token · use when Max sub expires' },
  { id: 'anthropic-sonnet',  label: 'Sonnet 4.6 (Anthropic API)',  tier: 'anthropic-api', description: 'Pay per token · cheaper than Opus' },
  { id: 'anthropic-haiku',   label: 'Haiku 4.5 (Anthropic API)',   tier: 'anthropic-api', description: 'Pay per token · cheapest Claude' },
  // Free fallback
  { id: 'groq',    label: 'Groq Llama 3.3 70B', tier: 'groq', description: 'Free tier · lower quality but always available' },
]

const TIER_LABEL: Record<ModelOption['tier'], string> = {
  'max-sub':       'Max subscription',
  'anthropic-api': 'Anthropic API (pay-per-token)',
  'groq':          'Free fallback',
}

export default function LLMModelSelector() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState<ConfigResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/llm-config')
      const json = await res.json()
      if (json.success) setConfig(json)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const setModel = async (id: ModelId) => {
    setSaving(true)
    try {
      await fetch('/api/llm-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: id }),
      })
      await loadConfig()
      setOpen(false)
    } catch (e) {
      alert(`Failed to switch model: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  const clearOverride = async () => {
    setSaving(true)
    try {
      await fetch('/api/llm-config', { method: 'DELETE' })
      await loadConfig()
    } catch (e) {
      alert(`Failed to clear: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  if (!config) return null

  const active = OPTIONS.find(o => o.id === config.preferredModel) || OPTIONS[0]
  const isAvailable = (o: ModelOption): boolean => {
    if (o.tier === 'max-sub')       return config.availability.maxSub
    if (o.tier === 'anthropic-api') return config.availability.anthropicApi
    return config.availability.groq
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`Active AI engine: ${active.label}. Click to switch — useful when Max sub expires or you want a faster/cheaper provider.`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: 'rgba(139,92,246,0.08)',
          border: '1px solid rgba(139,92,246,0.3)',
          borderRadius: '6px', padding: '4px 8px',
          fontSize: '0.6rem', fontWeight: 600, color: '#a371f7',
          cursor: 'pointer',
        }}
      >
        <Cpu size={10} />
        {active.label.replace('Claude ', '').replace(' (Anthropic API)', ' (api)')}
        {config.hasUserOverride && (
          <span style={{ fontSize: '0.45rem', color: '#f0883e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            override
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0,
          minWidth: '300px',
          backgroundColor: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '8px',
          zIndex: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: '0.55rem', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px 6px', borderBottom: '1px solid #21262d' }}>
            AI engine — affects screening / decision recs
          </div>

          {(['max-sub', 'anthropic-api', 'groq'] as const).map(tier => {
            const tierOptions = OPTIONS.filter(o => o.tier === tier)
            const tierAvailable = tierOptions.some(o => isAvailable(o))
            return (
              <div key={tier}>
                <div style={{
                  fontSize: '0.5rem', color: tierAvailable ? '#8b949e' : '#484f58',
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                  padding: '8px 8px 4px',
                }}>
                  {TIER_LABEL[tier]} {!tierAvailable && '· not configured'}
                </div>
                {tierOptions.map(o => {
                  const avail = isAvailable(o)
                  const selected = o.id === config.preferredModel
                  return (
                    <button
                      key={o.id}
                      onClick={() => avail && !saving && setModel(o.id)}
                      disabled={!avail || saving}
                      style={{
                        width: '100%', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 8px', borderRadius: '4px',
                        background: selected ? 'rgba(163,113,247,0.12)' : 'transparent',
                        border: '1px solid transparent',
                        color: avail ? '#c9d1d9' : '#484f58',
                        fontSize: '0.6rem', cursor: avail ? 'pointer' : 'not-allowed',
                      }}
                    >
                      <span style={{ minWidth: '12px' }}>
                        {selected && <Check size={10} color='#a371f7' />}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: selected ? 700 : 500 }}>{o.label}</div>
                        <div style={{ fontSize: '0.5rem', color: avail ? '#6e7681' : '#484f58', marginTop: '1px' }}>
                          {o.description}
                          {!avail && (
                            <span style={{ color: '#f0883e', marginLeft: '4px' }}>
                              · {tier === 'anthropic-api' ? 'set ANTHROPIC_API_KEY' : tier === 'groq' ? 'set GROQ_API_KEY' : 'serverless env'}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {config.hasUserOverride && (
            <div style={{ padding: '8px', borderTop: '1px solid #21262d', marginTop: '4px' }}>
              <button
                onClick={clearOverride}
                disabled={saving}
                style={{
                  width: '100%', fontSize: '0.55rem',
                  padding: '5px 8px', borderRadius: '4px',
                  background: 'transparent', border: '1px solid #30363d',
                  color: '#8b949e', cursor: 'pointer',
                }}
              >
                Reset to env default ({config.envDefault})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
