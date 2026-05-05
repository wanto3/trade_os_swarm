'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Play, Pause, Clock, Zap, CheckCircle, XCircle } from 'lucide-react';

interface CapabilityCategory {
  name: string;
  count: number;
  score: number;
}

interface RegistryStatus {
  status: string;
  lastUpdate: string;
  totalCapabilities: number;
  categories: CapabilityCategory[];
  suggestions: number;
  improvements: string[];
}

interface SchedulerStatus {
  running: boolean;
  config: {
    enabled: boolean;
    intervalMinutes: number;
    maxPerCycle: number;
    implementedFeatures: string[];
    lastRun: string | null;
    totalImplemented: number;
  };
}

interface AvailableFeature {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface ImplementationResult {
  success: boolean;
  data: {
    featureId: string;
    filesCreated: string[];
    errors: string[];
    message: string;
  };
}

export default function SelfImprovementPage() {
  const [status, setStatus] = useState<RegistryStatus | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [features, setFeatures] = useState<AvailableFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [implementing, setImplementing] = useState<string | null>(null);
  const [result, setResult] = useState<ImplementationResult | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const [interval, setInterval] = useState(30);
  const [lastRunResult, setLastRunResult] = useState<{ implemented: string[]; timestamp: string } | null>(null);

  useEffect(() => {
    fetchStatus();
    fetchAvailableFeatures();
    fetchSchedulerStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/self-improvement?action=status');
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedulerStatus = async () => {
    try {
      const res = await fetch('/api/auto-improve?action=status');
      const data = await res.json();
      if (data.success) {
        setSchedulerStatus(data.data);
        setInterval(data.data.config.intervalMinutes);
      }
    } catch (error) {
      console.error('Failed to fetch scheduler status:', error);
    }
  };

  const fetchAvailableFeatures = async () => {
    try {
      const res = await fetch('/api/improve?action=list');
      const data = await res.json();
      if (data.success) {
        setFeatures(data.data.features);
      }
    } catch (error) {
      console.error('Failed to fetch features:', error);
    }
  };

  const implementFeature = async (featureId: string) => {
    setImplementing(featureId);
    setResult(null);

    try {
      const res = await fetch('/api/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'implement', featureId })
      });
      const data = await res.json();
      setResult(data);

      if (data.success) {
        fetchStatus();
        fetchSchedulerStatus();
      }
    } catch (error) {
      console.error('Failed to implement feature:', error);
    } finally {
      setImplementing(null);
    }
  };

  const runAutoImprovement = async () => {
    setAutoMode(true);
    setResult(null);

    try {
      const res = await fetch('/api/auto-improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' })
      });
      const data = await res.json();

      if (data.success) {
        setLastRunResult({
          implemented: data.data.implemented || [],
          timestamp: data.data.timestamp
        });
      }

      setResult(data);

      // Refresh after run
      setTimeout(() => {
        fetchStatus();
        fetchSchedulerStatus();
      }, 1000);
    } catch (error) {
      console.error('Failed to run auto-improve:', error);
    } finally {
      setAutoMode(false);
    }
  };

  const toggleScheduler = async () => {
    try {
      const action = schedulerStatus?.config.enabled ? 'disable' : 'enable';
      const res = await fetch('/api/auto-improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          intervalMinutes: interval,
          maxPerCycle: 2
        })
      });
      const data = await res.json();

      if (data.success) {
        fetchSchedulerStatus();
      }
    } catch (error) {
      console.error('Failed to toggle scheduler:', error);
    }
  };

  const refreshAnalysis = async () => {
    setLoading(true);
    try {
      await fetch('/api/self-improvement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze' })
      });
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Analyzing capabilities...</p>
          </div>
        </div>
      </div>
    );
  }

  const totalScore = status?.categories.reduce((sum, c) => sum + c.score, 0) || 0;
  const avgScore = status?.categories.length ? Math.round(totalScore / status.categories.length) : 0;
  const unimplementedCount = features.length - (schedulerStatus?.config.totalImplemented || 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Self-Improvement System</h1>
          <p className="text-muted-foreground mt-2">
            The app recursively improves itself by adding new capabilities
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={refreshAnalysis}>
            Re-analyze
          </Button>
        </div>
      </div>

      {/* Auto-Improvement Scheduler Card */}
      <Card className="border-2 border-purple-500/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-purple-500" />
                Auto-Improvement Scheduler
              </CardTitle>
              <CardDescription>
                Automatically improves the app on a schedule
              </CardDescription>
            </div>
            <Badge variant={schedulerStatus?.running ? 'default' : 'secondary'} className={schedulerStatus?.running ? 'bg-green-500' : ''}>
              {schedulerStatus?.running ? 'Running' : 'Stopped'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center p-3 bg-secondary rounded-lg">
              <div className="text-2xl font-bold">{schedulerStatus?.config.totalImplemented || 0}</div>
              <div className="text-xs text-muted-foreground">Implemented</div>
            </div>
            <div className="text-center p-3 bg-secondary rounded-lg">
              <div className="text-2xl font-bold">{unimplementedCount}</div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
            <div className="text-center p-3 bg-secondary rounded-lg">
              <div className="text-2xl font-bold flex items-center justify-center gap-1">
                <Clock className="w-4 h-4" />
                {interval}m
              </div>
              <div className="text-xs text-muted-foreground">Interval</div>
            </div>
            <div className="text-center p-3 bg-secondary rounded-lg">
              <div className="text-2xl font-bold">
                {schedulerStatus?.config.lastRun ? new Date(schedulerStatus.config.lastRun).toLocaleTimeString() : 'Never'}
              </div>
              <div className="text-xs text-muted-foreground">Last Run</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">Interval (min):</label>
              <input
                type="number"
                value={interval}
                onChange={(e) => setInterval(parseInt(e.target.value) || 30)}
                className="w-20 px-2 py-1 bg-secondary border rounded"
                min={1}
                max={1440}
              />
            </div>
            <Button
              onClick={toggleScheduler}
              variant={schedulerStatus?.config.enabled ? 'destructive' : 'default'}
            >
              {schedulerStatus?.config.enabled ? (
                <>
                  <Pause className="w-4 h-4 mr-2" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Start Auto-Improve
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={runAutoImprovement}
              disabled={autoMode}
            >
              {autoMode ? 'Running...' : 'Run Now'}
            </Button>
          </div>

          {lastRunResult && lastRunResult.implemented.length > 0 && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">Just implemented: {lastRunResult.implemented.join(', ')}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{status?.totalCapabilities || 0}</div>
              <p className="text-sm text-muted-foreground">Total Capabilities</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{avgScore}%</div>
              <p className="text-sm text-muted-foreground">Coverage Score</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold">{status?.suggestions || 0}</div>
              <p className="text-sm text-muted-foreground">Suggestions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">
                {schedulerStatus?.running ? 'Active' : 'Idle'}
              </div>
              <p className="text-sm text-muted-foreground">Scheduler</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {status?.categories.map((category) => (
          <Card key={category.name}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{category.name}</CardTitle>
              <CardDescription>{category.count} capabilities</CardDescription>
            </CardHeader>
            <CardContent>
              <Progress value={category.score} className="mb-2" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coverage</span>
                <span className="font-medium">{category.score}%</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Available Features to Implement */}
      <Card>
        <CardHeader>
          <CardTitle>Available Capabilities to Add</CardTitle>
          <CardDescription>
            Click any feature to add it to the app
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((feature) => {
              const isImplemented = schedulerStatus?.config.implementedFeatures.includes(feature.id);
              return (
                <Card key={feature.id} className={`border-2 transition-colors ${isImplemented ? 'border-green-500/50 bg-green-500/5' : 'hover:border-primary/50'}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{feature.name}</h3>
                      <div className="flex gap-1">
                        {isImplemented && (
                          <Badge variant="default" className="bg-green-500">Added</Badge>
                        )}
                        <Badge variant="outline">{feature.category}</Badge>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      {feature.description}
                    </p>
                    <Button
                      size="sm"
                      onClick={() => implementFeature(feature.id)}
                      disabled={implementing === feature.id || isImplemented}
                      className="w-full"
                      variant={isImplemented ? 'secondary' : 'default'}
                    >
                      {isImplemented ? (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Implemented
                        </>
                      ) : implementing === feature.id ? (
                        'Adding...'
                      ) : (
                        'Add Capability'
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Implementation Result */}
      {result && (
        <Card className={result.success ? 'border-green-500' : 'border-red-500'}>
          <CardHeader>
            <CardTitle className={result.success ? 'text-green-500' : 'text-red-500'}>
              {result.success ? 'Implementation Successful' : 'Implementation Failed'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4">{result.data.message}</p>
            {result.data.filesCreated.length > 0 && (
              <div className="mb-4">
                <h4 className="font-semibold mb-2">Files Created:</h4>
                <ul className="list-disc list-inside text-sm">
                  {result.data.filesCreated.map((file) => (
                    <li key={file} className="text-green-500">{file}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.data.errors.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Errors:</h4>
                <ul className="list-disc list-inside text-sm text-red-500">
                  {result.data.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}