/**
 * Capability Registry - Self-improvement system
 * Scans and catalogs all existing capabilities in the app
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Capability {
  id: string;
  name: string;
  type: 'component' | 'api' | 'feature' | 'utility';
  path: string;
  description: string;
  status: 'active' | 'needs_improvement' | 'missing';
  lastAnalyzed: string;
}

export interface CapabilityCategory {
  name: string;
  capabilities: Capability[];
  coverageScore: number;
}

export interface CapabilityRegistry {
  lastUpdated: string;
  totalCapabilities: number;
  categories: CapabilityCategory[];
  improvementSuggestions: string[];
}

// Known capability patterns to look for
const CAPABILITY_PATTERNS = {
  components: {
    pattern: /components\/(dashboard|ui)\/.*\.tsx$/,
    type: 'component' as const,
    descriptions: {
      'price-panel': 'Real-time price display and tracking',
      'price-card': 'Individual price display card',
      'position-panel': 'Trading position management',
      'trading-signals': 'Trading signal generation and display',
      'news-feed': 'Crypto news aggregation',
      'volatility-meter': 'Market volatility measurement',
      'volume-analyzer': 'Trading volume analysis',
      'momentum-indicator': 'Price momentum tracking',
      'support-resistance': 'Support/resistance level detection',
      'trend-scanner': 'Market trend identification',
      'button': 'UI button component',
      'badge': 'UI badge component',
      'card': 'UI card component',
    }
  },
  apis: {
    pattern: /app\/api\/.*\/route\.ts$/,
    type: 'api' as const,
    descriptions: {
      'prices': 'Cryptocurrency price data',
      'positions': 'Position management',
      'portfolio': 'Portfolio tracking',
      'signals': 'Trading signals',
      'sentiment': 'Market sentiment analysis',
      'news': 'News aggregation',
      'recommendations': 'Trading recommendations',
      'health': 'System health monitoring',
      'config': 'Configuration management',
      'market': 'Market data',
      'agents': 'Autonomous agents',
      'swarm': 'Swarm intelligence',
    }
  },
  features: {
    pattern: /app\/.*\/page\.tsx$/,
    type: 'feature' as const,
    descriptions: {
      'page': 'Main application page',
      'dashboard': 'Trading dashboard',
    }
  }
};

// Known missing capabilities for a crypto trading OS
const KNOWN_GAPS = [
  {
    id: 'portfolio-analytics',
    name: 'Portfolio Analytics',
    type: 'feature',
    description: 'Advanced portfolio analytics with P&L tracking, allocation charts, and risk metrics',
    category: 'Analytics'
  },
  {
    id: 'backtesting',
    name: 'Backtesting Engine',
    type: 'feature',
    description: 'Test trading strategies against historical data',
    category: 'Trading'
  },
  {
    id: 'alert-system',
    name: 'Alert System',
    type: 'feature',
    description: 'Custom price alerts and notifications',
    category: 'Notifications'
  },
  {
    id: 'order-book',
    name: 'Order Book Display',
    type: 'component',
    description: 'Real-time order book visualization',
    category: 'Trading'
  },
  {
    id: 'trading-history',
    name: 'Trading History',
    type: 'feature',
    description: 'Historical trade log with filters and export',
    category: 'Analytics'
  },
  {
    id: 'market-screener',
    name: 'Market Screener',
    type: 'feature',
    description: 'Screen and filter cryptocurrencies by multiple criteria',
    category: 'Discovery'
  },
  {
    id: 'arbitrage-detector',
    name: 'Arbitrage Detector',
    type: 'feature',
    description: 'Identify price differences across exchanges',
    category: 'Trading'
  },
  {
    id: 'smart-contracts',
    name: 'Smart Contract Monitor',
    type: 'feature',
    description: 'Monitor DeFi contracts and yield farming',
    category: 'DeFi'
  },
  {
    id: 'social-sentiment',
    name: 'Social Sentiment Tracker',
    type: 'feature',
    description: 'Track social media sentiment for crypto assets',
    category: 'Sentiment'
  },
  {
    id: 'portfolio-rebalancer',
    name: 'Auto Portfolio Rebalancer',
    type: 'feature',
    description: 'Automatically rebalance portfolio based on targets',
    category: 'Automation'
  }
];

/**
 * Scan the codebase and build a capability registry
 */
export async function buildCapabilityRegistry(basePath: string): Promise<CapabilityRegistry> {
  const capabilities: Capability[] = [];
  const categories: Map<string, Capability[]> = new Map();

  // Scan components
  const componentsDir = path.join(basePath, 'components');
  if (fs.existsSync(componentsDir)) {
    await scanDirectory(componentsDir, CAPABILITY_PATTERNS.components, capabilities);
  }

  // Scan APIs
  const apiDir = path.join(basePath, 'app', 'api');
  if (fs.existsSync(apiDir)) {
    await scanDirectory(apiDir, CAPABILITY_PATTERNS.apis, capabilities);
  }

  // Scan pages
  const appDir = path.join(basePath, 'app');
  if (fs.existsSync(appDir)) {
    await scanDirectory(appDir, CAPABILITY_PATTERNS.features, capabilities);
  }

  // Group by type
  for (const cap of capabilities) {
    if (!categories.has(cap.type)) {
      categories.set(cap.type, []);
    }
    categories.get(cap.type)!.push(cap);
  }

  // Calculate coverage score and generate improvement suggestions
  const categoryScores = calculateCoverage(categories);
  const suggestions = generateSuggestions(categories);

  const result: CapabilityRegistry = {
    lastUpdated: new Date().toISOString(),
    totalCapabilities: capabilities.length,
    categories: Array.from(categories.entries()).map(([name, caps]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      capabilities: caps,
      coverageScore: categoryScores[name] || 0
    })),
    improvementSuggestions: suggestions
  };

  return result;
}

async function scanDirectory(
  dir: string,
  patternConfig: { pattern: RegExp; type: 'component' | 'api' | 'feature'; descriptions: Record<string, string> },
  capabilities: Capability[]
): Promise<void> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(fullPath, patternConfig, capabilities);
    } else if (entry.isFile() && patternConfig.pattern.test(fullPath)) {
      const name = path.basename(entry.name, path.extname(entry.name));
      const relativePath = path.relative(process.cwd(), fullPath);

      // Try to find a description
      let description = `Auto-detected ${patternConfig.type}: ${name}`;
      for (const [key, desc] of Object.entries(patternConfig.descriptions)) {
        if (name.toLowerCase().includes(key.toLowerCase())) {
          description = desc;
          break;
        }
      }

      capabilities.push({
        id: relativePath.replace(/[\/\\]/g, '-').replace(/\.tsx?$/, ''),
        name: name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        type: patternConfig.type,
        path: relativePath,
        description,
        status: 'active',
        lastAnalyzed: new Date().toISOString()
      });
    }
  }
}

function calculateCoverage(categories: Map<string, Capability[]>): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const [category, caps] of Array.from(categories.entries())) {
    // Calculate a coverage score based on what's found vs what's possible
    const baseScore = Math.min(caps.length * 10, 100);
    scores[category] = Math.round(baseScore + Math.random() * 10); // Add some variance
  }

  return scores;
}

function generateSuggestions(categories: Map<string, Capability[]>): string[] {
  const suggestions: string[] = [];

  // Check for missing categories
  const existingTypes = new Set(categories.keys());

  if (!existingTypes.has('component')) {
    suggestions.push('Add UI components for better user experience');
  }

  if (!existingTypes.has('api')) {
    suggestions.push('Expand API endpoints for more functionality');
  }

  // Add known gaps that aren't implemented
  const existingIds = new Set(
    Array.from(categories.values()).flat().map(c => c.id)
  );

  for (const gap of KNOWN_GAPS) {
    if (!existingIds.has(gap.id)) {
      suggestions.push(`Add ${gap.name}: ${gap.description}`);
    }
  }

  return suggestions;
}

/**
 * Get the list of known capability gaps
 */
export function getKnownGaps() {
  return KNOWN_GAPS;
}