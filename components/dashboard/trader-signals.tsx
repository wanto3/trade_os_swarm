'use client';

import { useState, useEffect } from 'react';
import { Users, TrendingUp, MessageCircle, Youtube, Twitter } from 'lucide-react';

interface TraderSignal {
  id: string;
  trader: string;
  platform: string;
  symbol: string;
  signal: string;
  price: number;
  target: number;
  reason: string;
  timestamp: number;
  followers: string;
}

export function TraderSignals() {
  const [signals, setSignals] = useState<TraderSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulated trader signals based on common trading influencers
    // In production, this could integrate with social APIs
    const mockSignals: TraderSignal[] = [
      {
        id: '1',
        trader: 'CryptoCred',
        platform: 'YouTube',
        symbol: 'BTC',
        signal: 'BUY',
        price: 70700,
        target: 75000,
        reason: 'Weekly support holding, accumulation zone',
        timestamp: Date.now() - 3600000,
        followers: '1.2M'
      },
      {
        id: '2',
        trader: 'AltcoinBuzz',
        platform: 'YouTube',
        symbol: 'ETH',
        signal: 'HOLD',
        price: 2145,
        target: 2500,
        reason: 'Waiting for confirmation above $2200',
        timestamp: Date.now() - 7200000,
        followers: '800K'
      },
      {
        id: '3',
        trader: 'BenjaminCowen',
        platform: 'YouTube',
        symbol: 'BTC',
        signal: 'SELL',
        price: 70800,
        target: 68000,
        reason: 'RSI divergence on 4H, risk management',
        timestamp: Date.now() - 10800000,
        followers: '950K'
      },
      {
        id: '4',
        trader: 'CoinBureau',
        platform: 'YouTube',
        symbol: 'SOL',
        signal: 'BUY',
        price: 89,
        target: 110,
        reason: 'Strong support, DeFi growth catalyst',
        timestamp: Date.now() - 14400000,
        followers: '1.5M'
      },
      {
        id: '5',
        trader: 'TraderCizzle',
        platform: 'Twitter',
        symbol: 'ADA',
        signal: 'BUY',
        price: 0.27,
        target: 0.35,
        reason: 'Chart pattern breakout imminent',
        timestamp: Date.now() - 1800000,
        followers: '250K'
      }
    ];

    setTimeout(() => {
      setSignals(mockSignals);
      setLoading(false);
    }, 500);
  }, []);

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'BUY': return { bg: 'rgba(63, 185, 80, 0.15)', border: '#3fb950', text: '#3fb950' };
      case 'SELL': return { bg: 'rgba(248, 81, 73, 0.15)', border: '#f85149', text: '#f85149' };
      default: return { bg: 'rgba(139, 148, 158, 0.15)', border: '#8b949e', text: '#8b949e' };
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'YouTube': return <Youtube style={{ width: 12, height: 12 }} />;
      case 'Twitter': return <Twitter style={{ width: 12, height: 12 }} />;
      default: return <MessageCircle style={{ width: 12, height: 12 }} />;
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div style={{ padding: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Users style={{ width: 14, height: 14, color: '#8b5cf6' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e6edf3' }}>Top Traders</span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: '3rem', backgroundColor: 'rgba(139, 148, 158, 0.1)', borderRadius: '8px', animation: 'pulse 2s infinite' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <Users style={{ width: 14, height: 14, color: '#8b5cf6' }} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e6edf3' }}>Top Traders Signals</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
        {signals.map(signal => {
          const colors = getSignalColor(signal.signal);
          const potential = ((signal.target - signal.price) / signal.price * 100).toFixed(1);
          return (
            <div
              key={signal.id}
              style={{
                backgroundColor: 'rgba(139, 148, 158, 0.08)',
                borderRadius: '8px',
                padding: '0.6rem',
                borderLeft: `3px solid ${colors.border}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#e6edf3' }}>{signal.trader}</span>
                  <span style={{ color: '#6e7681', fontSize: '0.6rem' }}>{getPlatformIcon(signal.platform)}</span>
                </div>
                <span style={{ fontSize: '0.6rem', color: '#6e7681' }}>{formatTime(signal.timestamp)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#fff' }}>{signal.symbol}</span>
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.4rem',
                  borderRadius: '4px',
                  backgroundColor: colors.bg,
                  color: colors.text
                }}>
                  {signal.signal}
                </span>
              </div>
              <div style={{ fontSize: '0.6rem', color: '#8b949e', lineHeight: 1.3 }}>
                {signal.reason}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.55rem', color: '#6e7681' }}>
                <span>Entry: ${signal.price.toLocaleString()}</span>
                <span style={{ color: signal.signal === 'BUY' ? '#3fb950' : signal.signal === 'SELL' ? '#f85149' : '#8b949e' }}>
                  Target: {signal.signal === 'SELL' ? '-' : '+'}{potential}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: '0.55rem', color: '#6e7681', marginTop: '0.5rem', textAlign: 'center', fontStyle: 'italic' }}>
        Based on popular traders. Do your own research.
      </div>
    </div>
  );
}
