/**
 * Autonomous Code Improver Dashboard
 *
 * Monitor and control the AI agent that actually writes code
 */

'use client';

import { useEffect, useState } from 'react';
import { Play, Pause, CheckCircle, XCircle, Clock, AlertCircle, GitBranch, Code, Settings } from 'lucide-react';

interface ImprovementCycle {
  id: string;
  timestamp: number;
  phase: 'analyzing' | 'improving' | 'testing' | 'completed' | 'failed' | 'awaiting_approval';
  opportunities: Array<{
    file: string;
    type: string;
    title: string;
    priority: string;
  }>;
  selectedImprovement: {
    file: string;
    type: string;
    title: string;
    description: string;
    priority: string;
  } | null;
  branch: string | null;
  changes: string[];
  commitHash: string | null;
  error?: string;
}

interface ImproverState {
  cycles: ImprovementCycle[];
  config: {
    enabled: boolean;
    autoApplySafeChanges: boolean;
    maxCyclesPerDay: number;
  };
  stats: {
    totalCycles: number;
    successfulImprovements: number;
    failedImprovements: number;
  };
}

export default function AutonomousDashboard() {
  const [state, setState] = useState<ImproverState | null>(null);
  const [pending, setPending] = useState<ImprovementCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchData = async () => {
    try {
      const [statusRes, pendingRes] = await Promise.all([
        fetch('/api/autonomous-control?action=status'),
        fetch('/api/autonomous-control?action=pending')
      ]);

      const statusData = await statusRes.json();
      const pendingData = await pendingRes.json();

      if (statusData.success) {
        setState(statusData.data.state);
      }
      if (pendingData.success) {
        setPending(pendingData.data.pending);
      }
    } catch (error) {
      console.error('Failed to fetch:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const runCycle = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/autonomous-control?action=run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await fetchData();
      }
    } finally {
      setRunning(false);
    }
  };

  const approve = async (cycleId: string) => {
    const res = await fetch('/api/autonomous-control?action=approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleId })
    });
    if (res.ok) {
      await fetchData();
    }
  };

  const reject = async (cycleId: string) => {
    const res = await fetch('/api/autonomous-control?action=reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cycleId })
    });
    if (res.ok) {
      await fetchData();
    }
  };

  const toggleEnabled = async () => {
    const action = state?.config.enabled ? 'disable' : 'enable';
    await fetch(`/api/autonomous-control?action=${action}`, { method: 'POST' });
    await fetchData();
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f23', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#a0aec0' }}>Loading...</div>
      </div>
    );
  }

  const recentCycles = state?.cycles?.slice(-10).reverse() || [];

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)', color: '#e2e8f0', padding: '20px', fontFamily: 'system-ui' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ width: '60px', height: '60px', borderRadius: '16px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px' }}>
              🤖
            </div>
            <div>
              <h1 style={{ fontSize: '28px', fontWeight: '800', margin: 0 }}>Autonomous Code Improver</h1>
              <p style={{ color: '#718096', margin: '4px 0 0' }}>AI agent that actually writes and commits code</p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={runCycle}
              disabled={running}
              style={{
                padding: '12px 24px',
                background: running ? '#4a5568' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontWeight: '600',
                cursor: running ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Play size={18} /> {running ? 'Running...' : 'Run Cycle'}
            </button>

            <button
              onClick={toggleEnabled}
              style={{
                padding: '12px 24px',
                background: state?.config.enabled ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' : '#4a5568',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {state?.config.enabled ? <Pause size={18} /> : <Play size={18} />}
              {state?.config.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '30px' }}>
          <div style={{ background: 'rgba(34, 197, 94, 0.1)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
            <div style={{ fontSize: '14px', color: '#22c55e', marginBottom: '8px' }}>Successful</div>
            <div style={{ fontSize: '32px', fontWeight: '700' }}>{state?.stats.successfulImprovements || 0}</div>
          </div>
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <div style={{ fontSize: '14px', color: '#ef4444', marginBottom: '8px' }}>Failed</div>
            <div style={{ fontSize: '32px', fontWeight: '700' }}>{state?.stats.failedImprovements || 0}</div>
          </div>
          <div style={{ background: 'rgba(59, 130, 246, 0.1)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
            <div style={{ fontSize: '14px', color: '#3b82f6', marginBottom: '8px' }}>Total Cycles</div>
            <div style={{ fontSize: '32px', fontWeight: '700' }}>{state?.stats.totalCycles || 0}</div>
          </div>
          <div style={{ background: 'rgba(168, 85, 247, 0.1)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
            <div style={{ fontSize: '14px', color: '#a855f7', marginBottom: '8px' }}>Pending Approval</div>
            <div style={{ fontSize: '32px', fontWeight: '700' }}>{pending.length}</div>
          </div>
        </div>

        {/* Pending Approvals */}
        {pending.length > 0 && (
          <div style={{ marginBottom: '30px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={20} color="#f59e0b" />
              Pending Approval ({pending.length})
            </h2>
            {pending.map(cycle => (
              <div key={cycle.id} style={{ background: 'rgba(245, 158, 11, 0.1)', borderRadius: '16px', padding: '20px', marginBottom: '12px', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ padding: '4px 10px', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '8px', fontSize: '12px', fontWeight: '600', color: '#f59e0b' }}>
                        {cycle.selectedImprovement?.type}
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: '600' }}>{cycle.selectedImprovement?.title}</span>
                    </div>
                    <p style={{ color: '#a0aec0', fontSize: '14px', marginBottom: '8px' }}>
                      {cycle.selectedImprovement?.description}
                    </p>
                    <div style={{ fontSize: '12px', color: '#718096' }}>
                  📁 {cycle.selectedImprovement?.file}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => approve(cycle.id)}
                      style={{ padding: '10px 20px', background: '#22c55e', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                    >
                      <CheckCircle size={16} /> Approve
                    </button>
                    <button
                      onClick={() => reject(cycle.id)}
                      style={{ padding: '10px 20px', background: '#ef4444', border: 'none', borderRadius: '10px', color: 'white', fontWeight: '600', cursor: 'pointer' }}
                    >
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Recent Cycles */}
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px' }}>Recent Activity</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recentCycles.map(cycle => {
              const phaseColors = {
                analyzing: '#3b82f6',
                improving: '#f59e0b',
                testing: '#a855f7',
                completed: '#22c55e',
                failed: '#ef4444',
                awaiting_approval: '#f59e0b'
              };

              const phaseIcons = {
                analyzing: <Clock size={16} />,
                improving: <Code size={16} />,
                testing: <Clock size={16} />,
                completed: <CheckCircle size={16} />,
                failed: <XCircle size={16} />,
                awaiting_approval: <AlertCircle size={16} />
              };

              return (
                <div key={cycle.id} style={{ background: 'rgba(30, 30, 50, 0.8)', borderRadius: '16px', padding: '20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ color: phaseColors[cycle.phase] }}>
                        {phaseIcons[cycle.phase]}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600' }}>
                          {cycle.selectedImprovement?.title || 'Analyzing codebase...'}
                        </div>
                        {cycle.selectedImprovement && (
                          <div style={{ fontSize: '12px', color: '#718096' }}>
                            📁 {cycle.selectedImprovement.file}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ padding: '6px 14px', background: `${phaseColors[cycle.phase]}20`, borderRadius: '20px', fontSize: '12px', fontWeight: '600', color: phaseColors[cycle.phase] }}>
                        {cycle.phase}
                      </span>
                      {cycle.commitHash && (
                        <span style={{ fontSize: '12px', color: '#718096', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <GitBranch size={12} /> {cycle.commitHash.slice(0, 8)}
                        </span>
                      )}
                      <span style={{ fontSize: '12px', color: '#4a5568' }}>
                        {new Date(cycle.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  {cycle.error && (
                    <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', fontSize: '13px', color: '#ef4444' }}>
                      ❌ {cycle.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '13px', color: '#718096' }}>
          <a href="/" style={{ color: '#667eea', textDecoration: 'none' }}>← Back to Trading Dashboard</a>
        </div>

      </div>
    </div>
  );
}
