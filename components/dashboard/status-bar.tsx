'use client'

import React, { useState, useEffect } from 'react'
import { Wifi, WifiOff, Clock, Cpu, Database } from 'lucide-react'

interface StatusBarProps {
  lastUpdated?: number
  dataSource?: string
}

export function StatusBar({ lastUpdated, dataSource = 'coingecko' }: StatusBarProps) {
  const [time, setTime] = useState(Date.now())
  const [connected, setConnected] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    // Simulate connection check
    const id = setInterval(() => {
      setConnected(Math.random() > 0.02) // 98% uptime simulation
    }, 30000)
    return () => clearInterval(id)
  }, [])

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const formatAge = (ts: number) => {
    const secs = Math.floor((Date.now() - ts) / 1000)
    if (secs < 60) return `${secs}s ago`
    return `${Math.floor(secs / 60)}m ago`
  }

  return (
    <div
      className="status-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        padding: '6px 24px',
        borderTop: '1px solid rgba(42,42,74,0.5)',
        background: 'rgba(5,5,8,0.9)',
        backdropFilter: 'blur(8px)',
        fontSize: '9px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-muted)',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      {/* Connection */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {connected ? (
          <Wifi size={10} color="var(--green)" style={{ filter: 'drop-shadow(0 0 3px var(--green))' }} />
        ) : (
          <WifiOff size={10} color="var(--magenta)" />
        )}
        <span style={{ color: connected ? 'var(--green)' : 'var(--magenta)' }}>
          {connected ? 'Connected' : 'Reconnecting...'}
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '12px', background: 'var(--border)' }} />

      {/* Clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Clock size={10} />
        <span style={{ color: 'var(--text-secondary)' }}>{formatTime(time)}</span>
      </div>

      {/* Divider */}
      <div style={{ width: '1px', height: '12px', background: 'var(--border)' }} />

      {/* Last update */}
      {lastUpdated && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Database size={10} />
            <span>Updated {formatAge(lastUpdated)}</span>
          </div>
          <div style={{ width: '1px', height: '12px', background: 'var(--border)' }} />
        </>
      )}

      {/* Data source */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span>Source:</span>
        <span style={{
          color: dataSource === 'coingecko' ? 'var(--cyan)' : 'var(--orange)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {dataSource}
        </span>
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* System info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Cpu size={10} />
        <span>Crypto Trader OS v1.0</span>
      </div>
    </div>
  )
}
