'use client';

import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

export function VolatilityATRIndicator({ symbol = 'BTC' }: { symbol?: string }) {
  const [data, setData] = useState<{ atr: number; level: string } | null>(null);

  useEffect(() => {
    const symbolMap: Record<string, string> = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT' }
    const mapped = symbolMap[symbol] || 'BTCUSDT'
    fetch(`/api/prices?symbol=${mapped}&interval=1h`)
      .then(r => r.json())
      .then(json => {
        if (json.price && json.indicators?.volatility) {
          const vol = json.indicators.volatility
          setData({ atr: vol.atr, level: vol.level.charAt(0).toUpperCase() + vol.level.slice(1) })
        }
      });
  }, [symbol]);

  if (!data) {
    return (
      <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem' }}>
        <div style={{ fontSize: '0.65rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>ATR</div>
        <div style={{ color: '#8b949e' }}>Loading...</div>
      </div>
    );
  }

  const color = data.level === 'High' ? '#f0883e' : data.level === 'Low' ? '#3fb950' : '#8b949e';

  return (
    <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '12px', padding: '1rem' }}>
      <div style={{ fontSize: '0.65rem', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Zap style={{ width: '12px', height: '12px' }} />
        ATR
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: color }}>${data.atr.toFixed(0)}</span>
        <span style={{ fontSize: '0.7rem', color }}>{data.level}</span>
      </div>
      <div style={{ fontSize: '0.6rem', color: '#6e7681', marginTop: '0.5rem', fontStyle: 'italic' }}>
        High ATR = volatile market, wider stop-losses needed
      </div>
    </div>
  );
}