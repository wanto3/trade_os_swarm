'use client';

import { useState, useEffect } from 'react';
import { Bot, Play, Square, RefreshCw, Sparkles } from 'lucide-react';

interface AgentState {
  isRunning: boolean;
  cycles: number;
  componentsCreated: string[];
  componentsIntegrated: string[];
  errorsFixed: number;
  lastActivity: number;
}

export default function SwarmPage() {
  const [state, setState] = useState<AgentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchState() {
    try {
      const res = await fetch('/api/agents/start');
      const json = await res.json();
      if (json.success) {
        setState(json.state);
      }
    } catch (e) {
      console.error('Failed to fetch state:', e);
    } finally {
      setLoading(false);
    }
  }

  async function startAgents() {
    setStarting(true);
    try {
      const res = await fetch('/api/agents/start', { method: 'POST' });
      const json = await res.json();
      alert(json.message);
      fetchState();
    } catch (e) {
      console.error('Failed to start:', e);
    } finally {
      setStarting(false);
    }
  }

  async function stopAgents() {
    try {
      await fetch('/api/agents/start', { method: 'PUT' });
      fetchState();
    } catch (e) {
      console.error('Failed to stop:', e);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
        <RefreshCw style={{ animation: 'spin 1s linear infinite', width: 24, height: 24 }} />
        <p style={{ marginTop: 12 }}>Loading...</p>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0f',
      color: '#e5e7eb',
      padding: '24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px',
        padding: '20px 24px',
        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(59, 130, 246, 0.2) 100%)',
        borderRadius: '16px',
        border: '1px solid rgba(139, 92, 246, 0.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'rgba(139, 92, 246, 0.3)',
            borderRadius: '12px',
            padding: '12px',
          }}>
            <Bot style={{ width: 28, height: 28, color: '#a78bfa' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0 }}>
              🤖 Autonomous Trading Agents
            </h1>
            <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: '14px' }}>
              AI-powered system that builds and improves the trading dashboard
            </p>
          </div>
        </div>

        {/* Control Buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          {!state?.isRunning ? (
            <button
              onClick={startAgents}
              disabled={starting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'rgba(34, 197, 94, 0.2)',
                border: '1px solid rgba(34, 197, 94, 0.4)',
                borderRadius: '8px',
                color: '#22c55e',
                fontSize: '14px',
                fontWeight: '600',
                cursor: starting ? 'not-allowed' : 'pointer',
                opacity: starting ? 0.6 : 1,
              }}
            >
              <Play style={{ width: 16, height: 16 }} />
              {starting ? 'Starting...' : 'Start Agents'}
            </button>
          ) : (
            <button
              onClick={stopAgents}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                color: '#ef4444',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <Square style={{ width: 16, height: 16 }} />
              Stop Agents
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        <div style={{
          background: 'rgba(30, 30, 50, 0.6)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#22c55e' }}>
            {state?.cycles || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Cycles Completed</div>
        </div>

        <div style={{
          background: 'rgba(30, 30, 50, 0.6)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#a78bfa' }}>
            {state?.componentsIntegrated?.length || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Components Integrated</div>
        </div>

        <div style={{
          background: 'rgba(30, 30, 50, 0.6)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: '#3b82f6' }}>
            {state?.errorsFixed || 0}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Errors Auto-Fixed</div>
        </div>

        <div style={{
          background: 'rgba(30, 30, 50, 0.6)',
          borderRadius: '12px',
          padding: '20px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}>
          <div style={{ fontSize: '32px', fontWeight: '700', color: state?.isRunning ? '#22c55e' : '#6b7280' }}>
            {state?.isRunning ? 'Active' : 'Idle'}
          </div>
          <div style={{ fontSize: '12px', color: '#6b7280' }}>Agent Status</div>
        </div>
      </div>

      {/* Integrated Components */}
      <div style={{
        background: 'rgba(30, 30, 50, 0.6)',
        borderRadius: '12px',
        padding: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles style={{ width: 18, height: 18, color: '#a78bfa' }} />
          Integrated Components
        </h2>

        {(state?.componentsIntegrated?.length ?? 0) > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {state!.componentsIntegrated!.map((name: string) => (
              <span key={name} style={{
                background: 'rgba(139, 92, 246, 0.2)',
                color: '#a78bfa',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
              }}>
                {name}
              </span>
            ))}
          </div>
        ) : (
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            No components integrated yet. Start the agents to begin building!
          </p>
        )}
      </div>

      {/* How it works */}
      <div style={{
        marginTop: '24px',
        padding: '20px',
        background: 'rgba(30, 30, 50, 0.4)',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}>
        <h3 style={{ fontSize: '14px', color: '#6b7280', marginBottom: '8px' }}>
          How it works:
        </h3>
        <ol style={{ fontSize: '13px', color: '#9ca3af', lineHeight: 1.8, paddingLeft: '20px' }}>
          <li>Agents research trading indicators (RSI, MACD, Bollinger Bands, etc.)</li>
          <li>Create React components with proper exports</li>
          <li>Integrate components into the main dashboard page</li>
          <li>Run QA verification - check for TypeScript errors</li>
          <li>If errors found, auto-fix and retry (up to 10 attempts)</li>
          <li>Only revert if all attempts fail</li>
        </ol>
      </div>
    </div>
  );
}