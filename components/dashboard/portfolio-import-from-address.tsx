'use client'

/**
 * One-click portfolio import from a Polymarket wallet address.
 *
 * Replaces the screenshot+OCR flow for the common case where the user
 * has their address handy: paste it, click import, done. No vision
 * model burn, no manual review — Polymarket's public Data API IS the
 * source of truth.
 *
 * Companion to portfolio-import.tsx (screenshot-based). Both buttons
 * live in the Paper Trades tab header. Address-based is the
 * recommended path; screenshot is the fallback for users who'd rather
 * not paste their wallet.
 */

import { useState, useEffect, useCallback } from 'react'
import { Wallet, RefreshCw, X, Check } from 'lucide-react'

interface Props {
  onImported?: () => void
}

export default function PortfolioImportFromAddress({ onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [savedAddress, setSavedAddress] = useState<string | null>(null)
  const [mode, setMode] = useState<'augment' | 'replace'>('replace')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    inserted: number
    skipped: number
    resolved: number
    bankroll: number
  } | null>(null)

  // Prefill saved address on mount, so re-imports are zero-friction
  useEffect(() => {
    if (!open) return
    fetch('/api/portfolio/import-from-address')
      .then(r => r.json())
      .then(j => {
        if (j.success && j.address) {
          setSavedAddress(j.address)
          setAddress(j.address)
        }
      })
      .catch(() => { /* ignore */ })
  }, [open])

  const doImport = useCallback(async () => {
    const trimmed = address.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setError('Address must be 0x + 40 hex chars. Find it on polymarket.com → profile.')
      return
    }
    setImporting(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/portfolio/import-from-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed, mode }),
      })
      const json = await res.json()
      if (!json.success) {
        setError(json.error || 'Import failed')
        return
      }
      setResult({
        inserted: json.inserted,
        skipped: json.skipped,
        resolved: json.resolved,
        bankroll: json.portfolio?.bankroll ?? 0,
      })
      setSavedAddress(trimmed)
      onImported?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }, [address, mode, onImported])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title='Import your real Polymarket positions by pasting your wallet address (read-only; we never need your private key)'
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'rgba(63,185,80,0.10)',
          border: '1px solid rgba(63,185,80,0.4)',
          borderRadius: '8px', padding: '0.5rem 0.85rem',
          fontSize: '0.65rem', fontWeight: 700, color: '#3fb950',
          cursor: 'pointer',
        }}
      >
        <Wallet size={12} /> Import from Polymarket address
      </button>
    )
  }

  return (
    <div style={{
      backgroundColor: '#0d1117',
      border: '1px solid rgba(63,185,80,0.3)',
      borderRadius: '12px',
      padding: '1rem',
      marginBottom: '1rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{
          fontSize: '0.75rem', fontWeight: 700, color: '#e6edf3', margin: 0,
          display: 'inline-flex', alignItems: 'center', gap: '6px',
        }}>
          <Wallet size={14} color='#3fb950' /> Import from Polymarket address
        </h4>
        <button
          onClick={() => { setOpen(false); setError(null); setResult(null) }}
          style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer' }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ fontSize: '0.6rem', color: '#8b949e', lineHeight: 1.5, marginBottom: '0.75rem' }}>
        Find your address on <a href='https://polymarket.com/profile' target='_blank' rel='noopener noreferrer' style={{ color: '#58a6ff' }}>polymarket.com → profile</a>. It&apos;s the <code style={{ color: '#a5d6ff' }}>0x...</code> shown at the top — public on-chain, read-only here.
        We pull positions + outcomes via Polymarket&apos;s free Data API. No keys needed. No funds at risk.
        {savedAddress && <span style={{ color: '#3fb950' }}> Last imported: <code>{savedAddress.slice(0, 10)}…{savedAddress.slice(-4)}</code>.</span>}
      </div>

      <input
        type='text'
        value={address}
        onChange={e => setAddress(e.target.value)}
        placeholder='0x4523A57E1D1D674c937c1e85C1e496fA60FD9146'
        style={{
          width: '100%', background: '#161b22',
          border: '1px solid #30363d', borderRadius: '6px',
          color: '#e6edf3', padding: '8px 10px',
          fontSize: '0.7rem', fontFamily: 'monospace',
          marginBottom: '0.75rem',
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '0.6rem', color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span>Mode:</span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type='radio' name='addr-mode' checked={mode === 'replace'} onChange={() => setMode('replace')} />
            Replace (clear paper portfolio first)
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input type='radio' name='addr-mode' checked={mode === 'augment'} onChange={() => setMode('augment')} />
            Augment (add on top)
          </label>
        </div>
        <button
          onClick={doImport}
          disabled={importing}
          style={{
            background: importing ? 'rgba(63,185,80,0.1)' : 'rgba(63,185,80,0.15)',
            border: '1px solid rgba(63,185,80,0.4)',
            borderRadius: '6px', color: '#3fb950',
            padding: '6px 14px', fontSize: '0.65rem', fontWeight: 700,
            cursor: importing ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
          }}
        >
          {importing ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={11} />}
          {importing ? 'Importing…' : 'Import positions'}
        </button>
      </div>

      {error && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'rgba(248,81,73,0.1)',
          border: '1px solid rgba(248,81,73,0.3)',
          borderRadius: '6px',
          fontSize: '0.6rem',
          color: '#f85149',
        }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{
          marginTop: '0.75rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'rgba(63,185,80,0.08)',
          border: '1px solid rgba(63,185,80,0.3)',
          borderRadius: '6px',
          fontSize: '0.6rem',
          color: '#3fb950',
          lineHeight: 1.5,
        }}>
          ✓ Imported {result.inserted} position{result.inserted === 1 ? '' : 's'}
          {result.resolved > 0 && ` (${result.resolved} already resolved — marked won/lost)`}
          {result.skipped > 0 && ` · ${result.skipped} skipped`}
          {' · '}Bankroll now <strong>${result.bankroll.toFixed(2)}</strong>
        </div>
      )}
    </div>
  )
}
