/**
 * AI Swarm Dashboard - Real Agent Activity
 * Shows actual data from running autonomous agents
 */

'use client';

import { useEffect, useState } from 'react';
import { Activity, Zap, CheckCircle, Clock, Flame, RefreshCw } from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  icon: string;
  color: string;
  role: string;
  description: string;
  status: 'idle' | 'working' | 'error';
  currentTask: string | null;
  completedTasks: number;
  successRate: number;
  lastActivity: number;
  recentWork: string[];
  cyclesCompleted: number;
  improvements?: Array<{
    file: string;
    title: string;
    description: string;
    applied: boolean;
    timestamp: number;
  }>;
  totalImprovements?: number;
}

interface ActivityItem {
  id: string;
  agentId: string;
  agentName: string;
  agentIcon: string;
  message: string;
  timestamp: number;
  type: 'task' | 'completion' | 'error' | 'status';
}

interface SwarmStatus {
  agents: Agent[];
  activities: ActivityItem[];
  isActive: boolean;
  stats: {
    activeAgents: number;
    totalCompleted: number;
    avgSuccessRate: string;
    uptime: string;
    totalCycles: number;
    totalImprovements: number;
  };
  timestamp: number;
}

export default function SwarmDashboard() {
  const [swarmData, setSwarmData] = useState<SwarmStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Fetch real data from API
  const fetchSwarmData = async () => {
    try {
      const response = await fetch('/api/swarm?action=status', { cache: 'no-store' });
      const data = await response.json();

      if (data.success && data.data) {
        setSwarmData(data.data);
        setError(null);
        setLastUpdate(new Date().toLocaleTimeString());
      } else {
        setError('Invalid response from API');
      }
    } catch (err) {
      setError('Error: ' + (err instanceof Error ? err.message : 'Unknown error'));
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchSwarmData();

    // Poll for updates every 2 seconds
    const interval = setInterval(fetchSwarmData, 2000);

    return () => clearInterval(interval);
  }, []);

  // Format timestamp
  const formatTimeAgo = (timestamp: number | string) => {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
    const now = Date.now();
    const diff = Math.abs(now - ts);
    const seconds = Math.floor(diff / 1000);

    if (isNaN(seconds) || seconds < 0) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            animation: 'pulse 2s ease-in-out infinite'
          }}>
            <span style={{ fontSize: '28px' }}>🤖</span>
          </div>
          <p style={{ color: '#a0aec0', fontSize: '14px' }}>Connecting to Agent Swarm...</p>
          <p style={{ color: '#4a5568', fontSize: '12px', marginTop: '10px' }}>Fetching from: /api/swarm?action=status</p>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  if (error || !swarmData) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '20px'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '500px' }}>
          <p style={{ color: '#ef4444', fontSize: '16px', marginBottom: '20px' }}>
            {error || 'Failed to load swarm data'}
          </p>
          <button
            onClick={() => {
              setError(null);
              setLoading(true);
              fetchSwarmData();
            }}
            style={{
              padding: '12px 24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              margin: '0 auto 20px'
            }}
          >
            <RefreshCw size={16} /> Retry
          </button>
          <div style={{ fontSize: '12px', color: '#718096', textAlign: 'left', background: 'rgba(0,0,0,0.3)', padding: '15px', borderRadius: '10px' }}>
            <strong>Debug Info:</strong><br/>
            API URL: /api/swarm?action=status<br/>
            Error: {error || 'No data returned'}<br/>
            Timestamp: {new Date().toISOString()}
          </div>
        </div>
      </div>
    );
  }

  const activeCount = swarmData.stats?.activeAgents ?? swarmData.agents?.filter(a => a.status === 'working').length ?? 0;
  const totalTasks = swarmData.stats?.totalCompleted ?? 0;
  const avgSuccess = swarmData.stats?.avgSuccessRate ?? '100.0';
  const uptime = swarmData.stats?.uptime ?? '0s';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%)',
      color: '#e2e8f0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px'
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.8; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(102, 126, 234, 0.3); }
          50% { box-shadow: 0 0 40px rgba(102, 126, 234, 0.6); }
        }
      `}</style>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '30px',
          padding: '30px',
          background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%)',
          borderRadius: '24px',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '70px',
              height: '70px',
              borderRadius: '24px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              boxShadow: '0 10px 40px rgba(102, 126, 234, 0.4)'
            }}>
              🤖
            </div>
            <div>
              <h1 style={{
                fontSize: '32px',
                fontWeight: '800',
                margin: 0,
                background: 'linear-gradient(90deg, #fff 0%, #a0aec0 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                letterSpacing: '-1px'
              }}>
                AI Agent Swarm
              </h1>
              <p style={{ color: '#718096', fontSize: '14px', margin: '4px 0 0' }}>
                Real Autonomous Agent System
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Active Agents */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 24px',
              background: 'rgba(34, 197, 94, 0.15)',
              borderRadius: '16px',
              border: '1px solid rgba(34, 197, 94, 0.3)'
            }}>
              <div style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: swarmData.isActive ? '#22c55e' : '#718096',
                animation: swarmData.isActive ? 'pulse 1.5s ease-in-out infinite' : 'none'
              }} />
              <div>
                <div style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e', lineHeight: 1 }}>
                  {activeCount}
                </div>
                <div style={{ fontSize: '11px', color: '#22c55e', opacity: 0.8 }}>
                  Active Agents
                </div>
              </div>
            </div>

            {/* Total Tasks */}
            <div style={{
              padding: '16px 24px',
              background: 'rgba(139, 92, 246, 0.15)',
              borderRadius: '16px',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#8b5cf6', lineHeight: 1 }}>
                {totalTasks}
              </div>
              <div style={{ fontSize: '11px', color: '#8b5cf6', opacity: 0.8 }}>
                Tasks Done
              </div>
            </div>

            {/* Code Improvements */}
            <div style={{
              padding: '16px 24px',
              background: 'rgba(16, 185, 129, 0.15)',
              borderRadius: '16px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981', lineHeight: 1 }}>
                {swarmData.stats?.totalImprovements ?? 0}
              </div>
              <div style={{ fontSize: '11px', color: '#10b981', opacity: 0.8 }}>
                Code Changes
              </div>
            </div>

            {/* Uptime */}
            <div style={{
              padding: '16px 24px',
              background: 'rgba(59, 130, 246, 0.15)',
              borderRadius: '16px',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#3b82f6', lineHeight: 1 }}>
                {uptime}
              </div>
              <div style={{ fontSize: '11px', color: '#3b82f6', opacity: 0.8 }}>
                Uptime
              </div>
            </div>
          </div>
        </div>

        {/* Status Bar */}
        <div style={{
          marginBottom: '30px',
          padding: '20px 30px',
          background: 'linear-gradient(90deg, rgba(34, 197, 94, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              padding: '12px',
              background: swarmData.isActive
                ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              borderRadius: '14px',
              fontSize: '20px'
            }}>
              {swarmData.isActive ? <Zap size={20} color="white" /> : <Clock size={20} color="white" />}
            </div>
            <div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: swarmData.isActive ? '#22c55e' : '#9ca3af' }}>
                {swarmData.isActive ? 'Agents Running' : 'Agents Idle'}
              </div>
              <div style={{ fontSize: '13px', color: '#a0aec0' }}>
                {swarmData.stats?.totalCycles ?? 0} cycles completed • {avgSuccess}% success rate
              </div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: '#718096' }}>
            Last update: {lastUpdate}
          </div>
        </div>

        {/* Agents Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          marginBottom: '30px'
        }}>
          {(swarmData.agents || []).map((agent) => {
            const isWorking = agent.status === 'working';
            const isError = agent.status === 'error';

            return (
              <div
                key={agent.id}
                style={{
                  background: isError
                    ? 'linear-gradient(145deg, rgba(239, 68, 68, 0.1) 0%, rgba(15, 19, 25, 1) 100%)'
                    : isWorking
                    ? 'linear-gradient(145deg, rgba(34, 197, 94, 0.1) 0%, rgba(15, 19, 25, 1) 100%)'
                    : 'linear-gradient(145deg, rgba(30, 30, 50, 0.8) 0%, rgba(15, 15, 30, 1) 100%)',
                  borderRadius: '24px',
                  padding: '24px',
                  border: isError
                    ? '1px solid rgba(239, 68, 68, 0.3)'
                    : isWorking
                    ? '1px solid rgba(34, 197, 94, 0.3)'
                    : '1px solid rgba(255,255,255,0.08)',
                  position: 'relative',
                  transition: 'all 0.3s ease'
                }}
              >
                {/* Status bar */}
                {(isWorking || isError) && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '3px',
                    background: isError ? '#ef4444' : '#22c55e',
                    animation: 'pulse 2s ease-in-out infinite'
                  }} />
                )}

                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '18px',
                      background: `linear-gradient(135deg, ${agent.color})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '26px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                    }}>
                      {agent.icon}
                    </div>
                    <div>
                      <h3 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 4px' }}>
                        {agent.name}
                      </h3>
                      <p style={{ fontSize: '12px', color: '#718096', margin: 0 }}>
                        {agent.role}
                      </p>
                    </div>
                  </div>
                  <div style={{
                    padding: '6px 14px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '600',
                    background: isError
                      ? 'rgba(239, 68, 68, 0.2)'
                      : isWorking
                      ? 'rgba(34, 197, 94, 0.2)'
                      : 'rgba(113, 128, 150, 0.2)',
                    color: isError
                      ? '#ef4444'
                      : isWorking
                      ? '#22c55e'
                      : '#718096'
                  }}>
                    {isError ? 'Error' : isWorking ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        Working
                      </span>
                    ) : 'Idle'}
                  </div>
                </div>

                {/* Description */}
                <p style={{ fontSize: '13px', color: '#718096', margin: '0 0 16px', lineHeight: '1.5' }}>
                  {agent.description}
                </p>

                {/* Current Task */}
                {agent.currentTask && (
                  <div style={{
                    padding: '16px',
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: '16px',
                    marginBottom: '16px',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    <div style={{ fontSize: '11px', color: '#718096', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Flame size={12} />
                      Currently Working On
                    </div>
                    <div style={{ fontSize: '14px', color: '#e2e8f0', fontWeight: '500' }}>
                      {agent.currentTask}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>Tasks Completed</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#a0aec0' }}>
                      {agent.completedTasks}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#718096', marginBottom: '4px' }}>Cycles</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#a0aec0' }}>
                      {agent.cyclesCompleted}
                    </div>
                  </div>
                </div>

                {/* Success Rate */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <span style={{ fontSize: '12px', color: '#718096' }}>Success Rate</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>
                    {(agent.successRate * 100).toFixed(0)}%
                  </span>
                </div>

                {/* Recent Work */}
                {agent.recentWork.length > 0 && (
                  <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', color: '#718096', marginBottom: '10px' }}>Recent Work</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {agent.recentWork.slice(0, 3).map((work, i) => (
                        <span key={i} style={{
                          fontSize: '11px',
                          padding: '4px 10px',
                          background: 'rgba(34, 197, 94, 0.1)',
                          color: '#22c55e',
                          borderRadius: '8px',
                          border: '1px solid rgba(34, 197, 94, 0.2)'
                        }}>
                          ✓ {work}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code Improvements - ACTUAL CHANGES MADE */}
                {agent.improvements && agent.improvements.length > 0 && (
                  <div style={{ paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize: '11px', color: '#718096', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={12} color="#22c55e" />
                      Code Improvements ({agent.totalImprovements || agent.improvements.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {agent.improvements.slice(0, 3).map((imp, i) => (
                        <div key={i} style={{
                          fontSize: '11px',
                          padding: '8px 12px',
                          background: imp.applied ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                          color: imp.applied ? '#22c55e' : '#ef4444',
                          borderRadius: '8px',
                          border: imp.applied ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)'
                        }}>
                          {imp.applied ? '✅' : '❌'} {imp.title}
                          <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>
                            {imp.file}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Last Activity */}
                <div style={{ marginTop: '12px', fontSize: '11px', color: '#4a5568' }}>
                  Last active: {formatTimeAgo(agent.lastActivity)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Activity Feed */}
        <div style={{
          background: 'linear-gradient(145deg, rgba(30, 30, 50, 0.8) 0%, rgba(15, 15, 30, 1) 100%)',
          borderRadius: '24px',
          padding: '24px',
          border: '1px solid rgba(255,255,255,0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                padding: '12px',
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                borderRadius: '14px',
                fontSize: '18px'
              }}>
                <Activity size={18} color="white" />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Live Activity Feed</h3>
                <p style={{ fontSize: '13px', color: '#718096', margin: '4px 0 0' }}>
                  Real-time updates from running agents
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#718096' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#22c55e',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              Live
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {(!swarmData.activities || swarmData.activities.length === 0) ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>
                Waiting for agent activity...
              </div>
            ) : (
              swarmData.activities.slice(0, 15).map((activity) => (
                <div
                  key={activity.id}
                  style={{
                    padding: '14px 20px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderLeft: `3px solid ${activity.type === 'error' ? '#ef4444' : activity.type === 'completion' ? '#22c55e' : '#667eea'}`,
                    fontSize: '14px',
                    color: '#e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{activity.agentIcon}</span>
                  <span style={{ flex: 1 }}>{activity.message}</span>
                  <span style={{ fontSize: '11px', color: '#718096' }}>{formatTimeAgo(activity.timestamp)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '30px',
          padding: '24px',
          background: 'linear-gradient(90deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.08)',
          textAlign: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: swarmData.isActive ? '#22c55e' : '#718096' }} />
            <span style={{ fontSize: '14px', color: '#a0aec0' }}>
              {swarmData.isActive ? 'Agents running autonomously' : 'Agents idle'} • Live updates every 2 seconds
            </span>
          </div>
          <p style={{ fontSize: '13px', color: '#718096', margin: '8px 0' }}>
            <a href="/" style={{ color: '#667eea', textDecoration: 'none', fontWeight: '500' }}>
              ← View Trading Dashboard
            </a>
          </p>
        </div>

      </div>
    </div>
  );
}
