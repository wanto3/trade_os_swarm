/**
 * Trading Feature Scanner - Detects missing trading indicators and features
 * Scans the app to identify what trading capabilities are missing
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getLLMClient } from '../ai/llm-client';

export interface MissingFeature {
  category: 'indicator' | 'signal' | 'data_source' | 'tool' | 'ui_element';
  name: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  implementation_complexity: 'simple' | 'moderate' | 'complex';
  rationale: string;
  suggested_location?: string;
}

export interface TradingFeatureReport {
  current_features: string[];
  missing_features: MissingFeature[];
  quick_wins: MissingFeature[];
  strategic_additions: MissingFeature[];
}

export class TradingFeatureScanner {
  private llm = getLLMClient();
  private rootDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
  }

  /**
   * Comprehensive scan of trading features
   */
  async scanTradingFeatures(): Promise<TradingFeatureReport> {
    const currentFeatures = this.identifyCurrentFeatures();
    const missingFeatures = await this.identifyMissingFeatures(currentFeatures);

    return {
      current_features: currentFeatures,
      missing_features: missingFeatures,
      quick_wins: missingFeatures.filter(f => f.implementation_complexity === 'simple'),
      strategic_additions: missingFeatures.filter(f => f.priority === 'high' || f.priority === 'critical')
    };
  }

  /**
   * Identify what trading features currently exist
   */
  private identifyCurrentFeatures(): string[] {
    const features: string[] = [];
    const appPage = join(this.rootDir, 'app/page.tsx');

    if (!existsSync(appPage)) {
      return features;
    }

    const content = readFileSync(appPage, 'utf-8').toLowerCase();

    // Check for existing indicators
    const indicators = [
      'rsi', 'macd', 'ema', 'sma', 'bollinger', 'atr', 'adx', 'stochastic',
      'obv', 'fibonacci', 'ichimoku', 'volume profile', 'vwap'
    ];

    for (const indicator of indicators) {
      if (content.includes(indicator)) {
        features.push(`indicator:${indicator}`);
      }
    }

    // Check for data sources
    const dataSources = ['price', 'volume', 'orderbook', 'funding', 'openinterest', 'liquidations'];
    for (const source of dataSources) {
      if (content.includes(source)) {
        features.push(`data:${source}`);
      }
    }

    // Check for UI elements
    const uiElements = ['position', 'order', 'trade', 'portfolio', 'alert', 'signal'];
    for (const element of uiElements) {
      if (content.includes(element)) {
        features.push(`ui:${element}`);
      }
    }

    return features;
  }

  /**
   * Use LLM to identify missing trading features
   */
  private async identifyMissingFeatures(currentFeatures: string[]): Promise<MissingFeature[]> {
    const features: MissingFeature[] = [];

    // Known high-value trading features to check for
    const featureChecklist = [
      // Indicators
      { category: 'indicator', name: 'Fibonacci Retracement', description: 'Auto Fibonacci levels for support/resistance', complexity: 'moderate' as const },
      { category: 'indicator', name: 'Ichimoku Cloud', description: 'Trend following indicator with cloud support', complexity: 'moderate' as const },
      { category: 'indicator', name: 'Volume Profile', description: 'Volume at price levels for key areas', complexity: 'complex' as const },
      { category: 'indicator', name: 'VWAP', description: 'Volume Weighted Average Price', complexity: 'simple' as const },
      { category: 'indicator', name: 'Money Flow Index (MFI)', description: 'Volume-weighted RSI', complexity: 'simple' as const },
      { category: 'indicator', name: 'Average Directional Index (ADX)', description: 'Trend strength indicator', complexity: 'simple' as const },

      // Signals & Data Sources
      { category: 'signal', name: 'Fear & Greed Index', description: 'Market sentiment indicator', complexity: 'simple' as const },
      { category: 'signal', name: 'Funding Rates', description: 'Perpetual funding rates across exchanges', complexity: 'moderate' as const },
      { category: 'signal', name: 'Liquidation Heatmap', description: 'Large liquidation levels', complexity: 'complex' as const },
      { category: 'signal', name: 'Open Interest', description: 'Total open interest by exchange', complexity: 'moderate' as const },
      { category: 'signal', name: 'Long/Short Ratio', description: 'Trading position ratios', complexity: 'simple' as const },
      { category: 'data_source', name: 'Whale Alerts', description: 'Large transaction monitoring', complexity: 'complex' as const },
      { category: 'data_source', name: 'On-chain Metrics', description: 'Exchange inflows/outflows', complexity: 'complex' as const },

      // Tools
      { category: 'tool', name: 'Position Calculator', description: 'Calculate position size based on risk', complexity: 'simple' as const },
      { category: 'tool', name: 'Risk/Reward Calculator', description: 'Visual R:R display for trades', complexity: 'simple' as const },
      { category: 'tool', name: 'Correlation Matrix', description: 'Asset correlation heatmap', complexity: 'moderate' as const },
      { category: 'tool', name: 'Strategy Backtester', description: 'Test strategies against historical data', complexity: 'complex' as const },
      { category: 'tool', name: 'Alert System', description: 'Price and indicator alerts', complexity: 'moderate' as const },

      // UI Elements
      { category: 'ui_element', name: 'Quick Trade Buttons', description: 'One-click buy/sell buttons', complexity: 'simple' as const },
      { category: 'ui_element', name: 'Market Pulse Indicator', description: 'Overall market health score', complexity: 'moderate' as const },
      { category: 'ui_element', name: 'Trade Confirmation Summary', description: 'Pre-trade risk summary', complexity: 'simple' as const },
      { category: 'ui_element', name: 'Performance Dashboard', description: 'P&L and win rate tracking', complexity: 'moderate' as const },
    ];

    // Check which features are missing
    const appPage = join(this.rootDir, 'app/page.tsx');
    const content = existsSync(appPage) ? readFileSync(appPage, 'utf-8').toLowerCase() : '';

    for (const feature of featureChecklist) {
      const featureLower = feature.name.toLowerCase();
      const hasFeature = content.includes(featureLower) ||
                        currentFeatures.some(f => f.toLowerCase().includes(featureLower));

      if (!hasFeature) {
        // Build a temporary feature object for the helper methods
        const tempFeature: MissingFeature = {
          category: feature.category as MissingFeature['category'],
          name: feature.name,
          description: feature.description,
          priority: 'medium', // temporary, will be reassigned
          implementation_complexity: feature.complexity,
          rationale: '',
          suggested_location: ''
        };

        features.push({
          category: tempFeature.category,
          name: tempFeature.name,
          description: tempFeature.description,
          priority: this.assignPriority(tempFeature),
          implementation_complexity: tempFeature.implementation_complexity,
          rationale: this.getRationale(tempFeature.name),
          suggested_location: this.suggestLocation(tempFeature.name)
        });
      }
    }

    // Use LLM to find additional missing features
    try {
      const llmSuggestions = await this.getLLMSuggestions(currentFeatures);
      features.push(...llmSuggestions);
    } catch (error) {
      console.error('LLM feature detection failed:', error);
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    features.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return features;
  }

  private assignPriority(feature: MissingFeature): MissingFeature['priority'] {
    // High-priority trading essentials
    const critical = ['Position Calculator', 'Risk/Reward Calculator', 'Funding Rates', 'Fear & Greed Index'];
    const high = ['VWAP', 'Quick Trade Buttons', 'Trade Confirmation Summary', 'Long/Short Ratio'];
    const medium = ['Fibonacci Retracement', 'Ichimoku Cloud', 'Alert System'];

    if (critical.includes(feature.name)) return 'critical';
    if (high.includes(feature.name)) return 'high';
    if (medium.includes(feature.name)) return 'medium';
    return 'low';
  }

  private getRationale(featureName: string): string {
    const rationales: Record<string, string> = {
      'Fibonacci Retracement': 'Key support/resistance levels used by most traders',
      'Ichimoku Cloud': 'Comprehensive trend indicator with built-in support/resistance',
      'Volume Profile': 'Shows where institutional liquidity sits',
      'VWAP': 'Institutional benchmark for intraday entries',
      'Fear & Greed Index': 'Helps identify contrarian opportunities',
      'Funding Rates': 'Shows market positioning and potential squeezes',
      'Liquidation Heatmap': 'Predicts price reactions at liquidation levels',
      'Position Calculator': 'Essential for proper risk management',
      'Risk/Reward Calculator': 'Visual confirmation of trade quality',
      'Quick Trade Buttons': 'Reduces execution time for fast-moving markets',
      'Trade Confirmation Summary': 'Prevents costly input errors',
      'Whale Alerts': 'Follow smart money movements',
      'Open Interest': 'Shows market participation and leverage',
      'Long/Short Ratio': 'Contrarian indicator at extremes',
    };

    return rationales[featureName] || `Valuable tool for serious traders`;
  }

  private suggestLocation(featureName: string): string {
    // Infer category from name
    const name = featureName.toLowerCase();

    if (name.includes('calculator') || name.includes('backtest')) {
      return 'Add to tools section or modal';
    }
    if (name.includes('button') || name.includes('panel') || name.includes('summary') || name.includes('display')) {
      return 'Add to main trading interface';
    }
    if (name.includes('api') || name.includes('source') || name.includes('alert') || name.includes('metric')) {
      return 'Create new data fetching service or add to data panel';
    }
    if (name.includes('index') || name.includes('rate') || name.includes('ratio') || name.includes('heatmap')) {
      return 'Add to signals/market data panel';
    }
    // Default for indicators
    return 'Add to price panel or create new indicator section';
  }

  private async getLLMSuggestions(currentFeatures: string[]): Promise<MissingFeature[]> {
    const prompt = `You are analyzing a cryptocurrency trading dashboard.

Current features detected:
${currentFeatures.map(f => `- ${f}`).join('\n')}

Identify 3-5 ADDITIONAL high-value trading features that are missing.
Focus on:
1. Professional trading tools (institutions use)
2. Real-time data that gives edge
3. Decision support features
4. Risk management tools

For each feature, provide:
- name: short descriptive name
- category: indicator|signal|data_source|tool|ui_element
- description: what it does and why valuable
- priority: critical|high|medium|low
- implementation_complexity: simple|moderate|complex

Return ONLY valid JSON array.`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a crypto trading platform architect. Suggest features that give traders an edge.');

      const parsed = JSON.parse(response.content);
      if (Array.isArray(parsed)) {
        return parsed.map((f: any) => ({
          category: f.category || 'tool',
          name: f.name,
          description: f.description,
          priority: f.priority || 'medium',
          implementation_complexity: f.implementation_complexity || 'moderate',
          rationale: f.description,
          suggested_location: 'Add to main interface'
        }));
      }
    } catch {
      // Parse failed, return empty
    }

    return [];
  }

  /**
   * Get implementation plan for a feature
   */
  async getImplementationPlan(feature: MissingFeature): Promise<{
    steps: string[];
    code_skeleton?: string;
    dependencies?: string[];
    estimated_time: string;
  }> {
    const prompt = `Create an implementation plan for adding this feature to a Next.js crypto trading app:

Feature: ${feature.name}
Description: ${feature.description}
Category: ${feature.category}

Current app uses:
- Next.js 14 with TypeScript
- Tailwind CSS
- Lucide React icons
- Recharts for charts

Provide:
1. Step-by-step implementation
2. Code skeleton for key components
3. Any npm dependencies needed
4. Estimated time to implement

Return as structured text with clear sections.`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a senior React/Next.js developer specializing in trading applications.');

      return {
        steps: this.extractSteps(response.content),
        code_skeleton: this.extractCodeBlock(response.content),
        dependencies: this.extractDependencies(response.content),
        estimated_time: this.estimateTime(feature)
      };
    } catch (error) {
      return {
        steps: ['Analyze requirements', 'Create component', 'Add to main page', 'Test'],
        estimated_time: this.estimateTime(feature)
      };
    }
  }

  private extractSteps(content: string): string[] {
    const steps: string[] = [];
    const lines = content.split('\n');
    let inSteps = false;

    for (const line of lines) {
      if (line.toLowerCase().includes('step') || line.match(/^\d+\./)) {
        inSteps = true;
      }
      if (inSteps && line.trim()) {
        steps.push(line.replace(/^\d+\.?\s*/, '').trim());
      }
      if (steps.length > 10) break;
    }

    return steps.length > 0 ? steps : ['Research', 'Implement', 'Test'];
  }

  private extractCodeBlock(content: string): string | undefined {
    const match = content.match(/```(?:typescript|tsx)?\s*\n([\s\S]+?)\n```/);
    return match ? match[1] : undefined;
  }

  private extractDependencies(content: string): string[] | undefined {
    const deps: string[] = [];
    const depRegex = /npm install\s+(.+?)(?:\n|$)/gi;
    let match;
    while ((match = depRegex.exec(content)) !== null) {
      const packages = match[1].split(/\s+/);
      deps.push(...packages);
      depRegex.lastIndex = 0;
    }
    return deps.length > 0 ? deps : undefined;
  }

  private estimateTime(feature: MissingFeature): string {
    const times: Record<string, string> = {
      simple: '1-2 hours',
      moderate: '3-6 hours',
      complex: '1-2 days'
    };
    return times[feature.implementation_complexity] || '2-4 hours';
  }

  /**
   * Generate the actual code for a feature
   */
  async generateFeatureCode(feature: MissingFeature, currentCode?: string): Promise<string> {
    const prompt = `Generate complete React/TypeScript code for:

Feature: ${feature.name}
Description: ${feature.description}

Requirements:
- TypeScript with proper types
- Tailwind CSS for styling
- Lucide React icons where appropriate
- Accessible (ARIA labels)
- Real-time data hooks where applicable
- Error handling

${currentCode ? `Current app context:\n${currentCode.substring(0, 3000)}\n` : ''}

Return ONLY the complete code, no explanations outside the code block.`;

    const response = await this.llm.generate([
      { role: 'user', content: prompt }
    ], 'You are a React/TypeScript expert. Generate production-ready trading UI components.');

    return this.extractCode(response.content) || response.content;
  }

  private extractCode(content: string): string | null {
    const match = content.match(/```(?:typescript|tsx)?\s*\n([\s\S]+?)\n```/);
    return match ? match[1].trim() : null;
  }
}

// Singleton
let scannerInstance: TradingFeatureScanner | null = null;

export function getTradingFeatureScanner(): TradingFeatureScanner {
  if (!scannerInstance) {
    scannerInstance = new TradingFeatureScanner();
  }
  return scannerInstance;
}
