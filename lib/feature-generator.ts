/**
 * Feature Generator - Core of recursive self-improvement
 * Generates and implements new features based on specifications
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FeatureSpec {
  id: string;
  name: string;
  type: 'component' | 'api' | 'feature';
  category: string;
  description: string;
  files: FileSpec[];
}

export interface FileSpec {
  path: string;
  content: string;
}

export interface GenerationResult {
  success: boolean;
  featureId: string;
  filesCreated: string[];
  errors: string[];
  timestamp: string;
}

// Template generators for different feature types
const TEMPLATES = {
  component: (name: string, description: string) => `/**
 * ${name} Component
 * ${description}
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ${name.replace(/[^a-zA-Z]/g, '')}Props {
  className?: string;
}

export function ${name.replace(/[^a-zA-Z]/g, '')}({ className }: ${name.replace(/[^a-zA-Z]/g, '')}Props) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">${name}</h3>
        <p className="text-sm text-muted-foreground">${description}</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
`,

  api: (name: string, endpoint: string) => `/**
 * ${name} API Endpoint
 * Auto-generated self-improvement feature
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Auto-generated endpoint
  return NextResponse.json({
    success: true,
    data: {
      message: '${name} endpoint',
      endpoint: '${endpoint}',
      timestamp: new Date().toISOString()
    }
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    return NextResponse.json({
      success: true,
      data: {
        message: '${name} - data processed',
        received: body
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Invalid request body'
    }, { status: 400 });
  }
}
`,

  feature: (name: string, title: string, description: string) => `/**
 * ${name} Page
 * Auto-generated self-improvement feature
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ${name.replace(/[^a-zA-Z]/g, '')}Page() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">${title}</h1>
          <p className="text-muted-foreground mt-2">${description}</p>
        </div>
        <Badge variant="default">Auto-generated</Badge>
      </div>

      <div className="grid gap-4">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Feature Information</h2>
          <div className="space-y-2">
            <p><strong>Feature ID:</strong> ${name.toLowerCase().replace(/\s+/g, '-')}</p>
            <p><strong>Type:</strong> Self-improved capability</p>
            <p><strong>Generated:</strong> {new Date().toISOString()}</p>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Actions</h2>
          <div className="flex gap-2">
            <Button variant="outline">Analyze Performance</Button>
            <Button variant="outline">Optimize</Button>
            <Button variant="outline">Generate Improvements</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
`
};

// Pre-defined feature implementations for known gaps
const FEATURE_IMPLEMENTATIONS: Record<string, () => FeatureSpec> = {
  'portfolio-analytics': () => ({
    id: 'portfolio-analytics',
    name: 'Portfolio Analytics',
    type: 'feature',
    category: 'Analytics',
    description: 'Advanced portfolio analytics with P&L tracking, allocation charts, and risk metrics',
    files: [
      {
        path: 'app/portfolio-analytics/page.tsx',
        content: TEMPLATES.feature('portfolio-analytics', 'Portfolio Analytics', 'Track your portfolio performance, P&L, and risk metrics')
      },
      {
        path: 'components/dashboard/portfolio-chart.tsx',
        content: TEMPLATES.component('Portfolio Chart', 'Visualize portfolio allocation and performance')
      },
      {
        path: 'app/api/portfolio/analytics/route.ts',
        content: TEMPLATES.api('Portfolio Analytics', '/api/portfolio/analytics')
      }
    ]
  }),

  'alert-system': () => ({
    id: 'alert-system',
    name: 'Alert System',
    type: 'feature',
    category: 'Notifications',
    description: 'Custom price alerts and notifications',
    files: [
      {
        path: 'app/alerts/page.tsx',
        content: TEMPLATES.feature('alert-system', 'Price Alerts', 'Create and manage custom price alerts')
      },
      {
        path: 'components/dashboard/alert-manager.tsx',
        content: TEMPLATES.component('Alert Manager', 'Manage price alerts and notifications')
      },
      {
        path: 'app/api/alerts/route.ts',
        content: TEMPLATES.api('Alerts', '/api/alerts')
      }
    ]
  }),

  'order-book': () => ({
    id: 'order-book',
    name: 'Order Book',
    type: 'component',
    category: 'Trading',
    description: 'Real-time order book visualization',
    files: [
      {
        path: 'components/dashboard/order-book.tsx',
        content: TEMPLATES.component('Order Book', 'Real-time order book with bid/ask visualization')
      },
      {
        path: 'app/api/market/orderbook/route.ts',
        content: TEMPLATES.api('Order Book', '/api/market/orderbook')
      }
    ]
  }),

  'trading-history': () => ({
    id: 'trading-history',
    name: 'Trading History',
    type: 'feature',
    category: 'Analytics',
    description: 'Historical trade log with filters and export',
    files: [
      {
        path: 'app/trading-history/page.tsx',
        content: TEMPLATES.feature('trading-history', 'Trading History', 'View and export your trading history')
      },
      {
        path: 'components/dashboard/trade-log.tsx',
        content: TEMPLATES.component('Trade Log', 'Display historical trades with filtering')
      },
      {
        path: 'app/api/trading/history/route.ts',
        content: TEMPLATES.api('Trading History', '/api/trading/history')
      }
    ]
  }),

  'market-screener': () => ({
    id: 'market-screener',
    name: 'Market Screener',
    type: 'feature',
    category: 'Discovery',
    description: 'Screen and filter cryptocurrencies by multiple criteria',
    files: [
      {
        path: 'app/market-screener/page.tsx',
        content: TEMPLATES.feature('market-screener', 'Market Screener', 'Filter and discover cryptocurrencies by criteria')
      },
      {
        path: 'components/dashboard/crypto-screener.tsx',
        content: TEMPLATES.component('Crypto Screener', 'Filter coins by market cap, volume, price')
      },
      {
        path: 'app/api/market/screener/route.ts',
        content: TEMPLATES.api('Market Screener', '/api/market/screener')
      }
    ]
  }),

  'arbitrage-detector': () => ({
    id: 'arbitrage-detector',
    name: 'Arbitrage Detector',
    type: 'feature',
    category: 'Trading',
    description: 'Identify price differences across exchanges',
    files: [
      {
        path: 'app/arbitrage/page.tsx',
        content: TEMPLATES.feature('arbitrage-detector', 'Arbitrage Detector', 'Find price differences across exchanges')
      },
      {
        path: 'components/dashboard/arbitrage-viewer.tsx',
        content: TEMPLATES.component('Arbitrage Viewer', 'Display arbitrage opportunities')
      },
      {
        path: 'app/api/market/arbitrage/route.ts',
        content: TEMPLATES.api('Arbitrage', '/api/market/arbitrage')
      }
    ]
  }),

  'backtesting': () => ({
    id: 'backtesting',
    name: 'Backtesting Engine',
    type: 'feature',
    category: 'Trading',
    description: 'Test trading strategies against historical data',
    files: [
      {
        path: 'app/backtesting/page.tsx',
        content: TEMPLATES.feature('backtesting', 'Backtesting Engine', 'Test your strategies against historical data')
      },
      {
        path: 'components/dashboard/strategy-tester.tsx',
        content: TEMPLATES.component('Strategy Tester', 'Configure and run backtests')
      },
      {
        path: 'app/api/backtest/route.ts',
        content: TEMPLATES.api('Backtest', '/api/backtest')
      }
    ]
  }),

  'social-sentiment': () => ({
    id: 'social-sentiment',
    name: 'Social Sentiment',
    type: 'feature',
    category: 'Sentiment',
    description: 'Track social media sentiment for crypto assets',
    files: [
      {
        path: 'app/social-sentiment/page.tsx',
        content: TEMPLATES.feature('social-sentiment', 'Social Sentiment', 'Track social media sentiment')
      },
      {
        path: 'components/dashboard/sentiment-tracker.tsx',
        content: TEMPLATES.component('Sentiment Tracker', 'Monitor social sentiment trends')
      },
      {
        path: 'app/api/sentiment/social/route.ts',
        content: TEMPLATES.api('Social Sentiment', '/api/sentiment/social')
      }
    ]
  })
};

/**
 * Generate a feature based on its ID
 */
export async function generateFeature(featureId: string): Promise<GenerationResult> {
  const timestamp = new Date().toISOString();
  const filesCreated: string[] = [];
  const errors: string[] = [];

  try {
    // Check if we have a pre-defined implementation
    const implementation = FEATURE_IMPLEMENTATIONS[featureId];

    if (!implementation) {
      // Generate a generic implementation
      return {
        success: false,
        featureId,
        filesCreated: [],
        errors: [`No implementation found for: ${featureId}`],
        timestamp
      };
    }

    const feature = implementation();
    const basePath = process.cwd();

    // Create each file
    for (const file of feature.files) {
      try {
        const fullPath = path.join(basePath, file.path);
        const dir = path.dirname(fullPath);

        // Ensure directory exists
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Write the file
        fs.writeFileSync(fullPath, file.content, 'utf-8');
        filesCreated.push(file.path);
      } catch (err) {
        errors.push(`Failed to create ${file.path}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return {
      success: errors.length === 0,
      featureId,
      filesCreated,
      errors,
      timestamp
    };
  } catch (error) {
    return {
      success: false,
      featureId,
      filesCreated,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      timestamp
    };
  }
}

/**
 * List all available feature implementations
 */
export function listAvailableFeatures(): { id: string; name: string; category: string; description: string }[] {
  return Object.entries(FEATURE_IMPLEMENTATIONS).map(([id, factory]) => {
    const spec = factory();
    return {
      id,
      name: spec.name,
      category: spec.category,
      description: spec.description
    };
  });
}

/**
 * Get a specific feature specification without implementing
 */
export function getFeatureSpec(featureId: string): FeatureSpec | null {
  const implementation = FEATURE_IMPLEMENTATIONS[featureId];
  return implementation ? implementation() : null;
}