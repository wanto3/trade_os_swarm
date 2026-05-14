'use client'

/**
 * One-click portfolio import from a Polymarket wallet address, plus
 * auto-sync every 5 min and a "Sync now" button once an address is saved.
 *
 * UX after first import:
 *   - Saved address loaded on dashboard open
 *   - One auto-sync runs in background if last sync > 5min ago
 *   - A compact "💼 Synced 2m ago [🔄 Sync now]" strip stays visible
 *     so the user can force-refresh without reopening the full panel
 *
 * No re-pasting the address ever. Disk wipes on Render still erase
 * positions, but auto-sync re-populates them on the next page load
 * within seconds.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Wallet, RefreshCw, X, Check } from 'lucide-react'

interface Props {
  onImported?: () => void
}

const AUTO_SYNC_INTERVAL_MS = 5 * 60_000

function relativeTime(ms: number): string {
  const dt = Date.now() - ms
  if (dt < 30_000) return 'just now'
  if (dt < 60_000) return `${Math.round(dt / 1000)}s ago`
  if (dt < 3600_000) return `${Math.round(dt / 60_000)}m ago`
  if (dt < 86400_000) return `${Math.round(dt / 3600_000)}h ago`
  return `${Math.round(dt / 86400_000)}d ago`
}

export default function PortfolioImportFromAddress({ onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [address, setAddress] = useState('')
  const [savedAddress, setSavedAddress] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null)
  const [mode, setMode] = useState<'augment' | 'replace'>('replace')
  const [importing, setImporting] = useState(false)
  const [autoSyncing, setAutoSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    inserted: number
    skipped: number
    resolved: number
    bankroll: number
  } | null>(null)
  // Tick state used only to force a re-render so "Xm ago" updates live.
  const [, setTick] = useState(0)
  const autoSyncedThisMount = useRef(false)

  // Load the saved address on first render so the "Sync now" strip can
  // appear without the user opening the full panel. Auto-trigger a
  // sync if it's been >5min since the last one.
  useEffect(() => {
    let cancelled = false
    fetch('/api/portfolio/import-from-address')
      .then(r => r.json())
      .then(j => {
        if (cancelled || !j.success || !j.address) return
        setSavedAddress(j.address)
        setAddress(j.address)
        setSavedAt(j.savedAt ?? null)

        // Auto-sync on mount if stale. Guard with a ref so the effect
        // doesn't double-fire during dev-mode StrictMode double-render.
        if (autoSyncedThisMount.current) return
        autoSyncedThisMount.current = true
        const last = j.savedAt ?? 0
        if (Date.now() - last > AUTO_SYNC_INTERVAL_MS) {
          syncNow(j.address, 'replace', /* silent */ true)
        }
      })
      .catch(() => { /* ignore */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recurring auto-sync while the page is open. Bypassed when a manual
  // import is already in flight to avoid clobbering it.
  useEffect(() => {
    if (!savedAddress) return
    const id = setInterval(() => {
      if (importing || autoSyncing) return
      syncNow(savedAddress, 'replace', /* silent */ true)
    }, AUTO_SYNC_INTERVAL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddress, importing, autoSyncing])

  // Tick every 30s so the "Synced Xm ago" relative time stays current
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const syncNow = useCallback(async (addr: string, syncMode: 'augment' | 'replace', silent = false) => {
    if (!silent) setImporting(true)
    else setAutoSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/import-from-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, mode: syncMode }),
      })
      const json = await res.json()
      if (!json.success) {
        if (!silent) setError(json.error || 'Sync failed')
        return
      }
      setLastSyncAt(Date.now())
      setSavedAddress(addr)
      if (!silent) {
        setResult({
          inserted: json.inserted,
          skipped: json.skipped,
          resolved: json.resolved,
          bankroll: json.portfolio?.bankroll ?? 0,
        })
      }
      onImported?.()
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (!silent) setImporting(false)
      else setAutoSyncing(false)
    }
  }, [onImported])

  const doImport = useCallback(async () => {
    const trimmed = address.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      setError('Address must be 0x + 40 hex chars. Find it on polymarket.com → profile.')
      return
    }
    setResult(null)
    await syncNow(trimmed, mode, /* silent */ false)
  }, [address, mode, syncNow])

  // Once an address is saved, the compact status strip replaces the
  // big "Import" button — it shows last-sync time and a one-click
  // refresh, with the full panel still reachable via "edit address".
  if (!open && savedAddress) {
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: 'rgba(63,185,80,0.08)',
        border: '1px solid rgba(63,185,80,0.3)',
        borderRadius: '8px', padding: '0.4rem 0.7rem',
        fontSize: '0.65rem', color: '#c9d1d9',
      }}>
        <Wallet size={11} color='#3fb950' />
        <span style={{ color: '#3fb950', fontWeight: 700 }}>Live</span>
        <span style={{ color: '#6e7681', fontFamily: 'monospace', fontSize: '0.6rem' }}>
          {savedAddress.slice(0, 6)}…{savedAddress.slice(-4)}
        </span>
        <span style={{ color: '#6e7681' }}>
          ·  Synced {lastSyncAt ? relativeTime(lastSyncAt) : (savedAt ? relativeTime(savedAt) : 'never')}
        </span>
        <button
          onClick={() => syncNow(savedAddress, 'replace', /* silent */ false)}
          disabled={importing || autoSyncing}
          title='Force a re-sync from Polymarket now (bypasses the 5-min auto-sync cycle)'
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            background: importing || autoSyncing ? 'rgba(63,185,80,0.06)' : 'rgba(63,185,80,0.18)',
            border: '1px solid rgba(63,185,80,0.4)',
            borderRadius: '5px', padding: '3px 8px',
            fontSize: '0.6rem', fontWeight: 700, color: '#3fb950',
            cursor: importing || autoSyncing ? 'not-allowed' : 'pointer',
          }}
        >
          <RefreshCw size={9} style={importing || autoSyncing ? { animation: 'spin 1s linear infinite' } : undefined} />
          {importing ? 'Syncing…' : autoSyncing ? 'Auto-syncing…' : 'Sync now'}
        </button>
        <button
          onClick={() => setOpen(true)}
          title='Change saved address or import options'
          style={{
            background: 'none', border: 'none', color: '#6e7681',
            cursor: 'pointer', fontSize: '0.58rem', textDecoration: 'underline',
          }}
        >
          edit
        </button>
      </div>
    )
  }

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
