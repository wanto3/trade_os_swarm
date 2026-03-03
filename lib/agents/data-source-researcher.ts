/**
 * Data Source Researcher - Discovers and integrates new trading APIs and data sources
 * Actively researches and adds valuable trading data to the app
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getLLMClient } from '../ai/llm-client';

export interface DataSource {
  name: string;
  url: string;
  category: 'price' | 'derivatives' | 'onchain' | 'sentiment' | 'social' | 'news';
  data_available: string[];
  api_type: 'rest' | 'websocket' | 'graphql';
  auth_required: boolean;
  rate_limit?: string;
  free_tier: boolean;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface IntegratedDataSource extends DataSource {
  integration_file?: string;
  status: 'not_integrated' | 'partial' | 'complete';
  last_updated?: number;
}

export const KNOWN_DATA_SOURCES: DataSource[] = [
  // Price & Market Data
  {
    name: 'Binance API',
    url: 'https://binance-docs.github.io/apidocs',
    category: 'price',
    data_available: ['price', 'volume', 'orderbook', 'trades', 'klines'],
    api_type: 'rest',
    auth_required: false,
    rate_limit: '1200/min',
    free_tier: true,
    priority: 'critical'
  },
  {
    name: 'CoinGecko API',
    url: 'https://www.coingecko.com/api/documentation',
    category: 'price',
    data_available: ['price', 'volume', 'market_cap', 'dominance'],
    api_type: 'rest',
    auth_required: false,
    rate_limit: '50/min',
    free_tier: true,
    priority: 'high'
  },

  // Derivatives Data
  {
    name: 'Coinglass',
    url: 'https://www.coinglass.com/api',
    category: 'derivatives',
    data_available: ['funding_rates', 'open_interest', 'liquidations', 'long_short_ratio'],
    api_type: 'rest',
    auth_required: true,
    rate_limit: 'unknown',
    free_tier: true,
    priority: 'critical'
  },
  {
    name: 'Cryptocompare',
    url: 'https://min-api.cryptocompare.com/',
    category: 'derivatives',
    data_available: ['futures_data', 'index_data'],
    api_type: 'rest',
    auth_required: true,
    rate_limit: '100/min',
    free_tier: true,
    priority: 'high'
  },

  // On-chain Data
  {
    name: 'Glassnode',
    url: 'https://glassnode.com/api',
    category: 'onchain',
    data_available: ['exchange_inflow', 'exchange_outflow', 'sopr', 'nvt', 'active_addresses'],
    api_type: 'rest',
    auth_required: true,
    rate_limit: 'limited',
    free_tier: false,
    priority: 'high'
  },
  {
    name: 'Whale Alert',
    url: 'https://docs.whale-alert.io/',
    category: 'onchain',
    data_available: ['large_transactions', 'whale_movements'],
    api_type: 'websocket',
    auth_required: true,
    rate_limit: '100/day',
    free_tier: true,
    priority: 'medium'
  },

  // Sentiment & Social
  {
    name: 'Alternative.me (Fear & Greed)',
    url: 'https://alternative.me/crypto/api/',
    category: 'sentiment',
    data_available: ['fear_greed_index'],
    api_type: 'rest',
    auth_required: false,
    rate_limit: 'unlimited',
    free_tier: true,
    priority: 'high'
  },
  {
    name: 'LunarCrush',
    url: 'https://docs.lunarcrush.com/',
    category: 'social',
    data_available: ['social_sentiment', 'social_volume', 'influencer_activity'],
    api_type: 'rest',
    auth_required: true,
    rate_limit: 'limited',
    free_tier: true,
    priority: 'medium'
  },

  // News
  {
    name: 'CryptoCompare News',
    url: 'https://min-api.cryptocompare.com/',
    category: 'news',
    data_available: ['news_feed', 'news_categories'],
    api_type: 'rest',
    auth_required: true,
    rate_limit: '100/min',
    free_tier: true,
    priority: 'medium'
  }
];

export class DataSourceResearcher {
  private llm = getLLMClient();
  private rootDir: string;
  private servicesDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
    this.servicesDir = join(rootDir, 'lib', 'services');
  }

  /**
   * Find new data sources to integrate
   */
  async discoverNewSources(): Promise<DataSource[]> {
    const integrated = this.listIntegratedSources();
    const known = new Set(integrated.map(s => s.name));

    const notIntegrated = KNOWN_DATA_SOURCES.filter(s => !known.has(s.name));

    // Also use LLM to discover new sources
    try {
      const llmDiscovered = await this.llmDiscoverSources(integrated);
      notIntegrated.push(...llmDiscovered);
    } catch (error) {
      console.error('LLM discovery failed:', error);
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return notIntegrated.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * List currently integrated data sources
   */
  listIntegratedSources(): IntegratedDataSource[] {
    const integrated: IntegratedDataSource[] = [];

    try {
      if (!existsSync(this.servicesDir)) {
        return [];
      }

      // Scan services directory for data source integrations
      const files = execSync(`ls ${this.servicesDir}/*.ts 2>/dev/null || echo ""`, {
        encoding: 'utf-8'
      }).split('\n').filter(f => f.trim());

      for (const file of files) {
        const content = readFileSync(file.trim(), 'utf-8');
        const sources = this.extractSourcesFromCode(content, file);
        integrated.push(...sources);
      }
    } catch (error) {
      console.error('Error listing integrated sources:', error);
    }

    return integrated;
  }

  private extractSourcesFromCode(code: string, filePath: string): IntegratedDataSource[] {
    const sources: IntegratedDataSource[] = [];
    const fileName = filePath.split('/').pop() || '';

    // Check for known API patterns
    const patterns: Record<string, Partial<DataSource>> = {
      'binance': { name: 'Binance API', category: 'price', api_type: 'rest' },
      'coingecko': { name: 'CoinGecko API', category: 'price', api_type: 'rest' },
      'coinglass': { name: 'Coinglass', category: 'derivatives', api_type: 'rest' },
      'glassnode': { name: 'Glassnode', category: 'onchain', api_type: 'rest' },
      'whale.*alert': { name: 'Whale Alert', category: 'onchain', api_type: 'websocket' },
      'alternative\\.me': { name: 'Alternative.me (Fear & Greed)', category: 'sentiment', api_type: 'rest' },
      'lunarcrush': { name: 'LunarCrush', category: 'social', api_type: 'rest' },
    };

    const lowerCode = code.toLowerCase();
    for (const [pattern, source] of Object.entries(patterns)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(fileName) || (lowerCode.includes(pattern.toLowerCase()) && lowerCode.includes('api'))) {
        // Check if it's actually implemented (has fetch/useEffect/etc)
        const hasImplementation = code.includes('fetch') || code.includes('useEffect') ||
                                  code.includes('async') || code.includes('axios');

        sources.push({
          ...source as DataSource,
          integration_file: fileName,
          status: hasImplementation ? 'complete' : 'partial',
          last_updated: Date.now()
        });
      }
    }

    return sources;
  }

  /**
   * Use LLM to discover new data sources
   */
  private async llmDiscoverSources(integrated: IntegratedDataSource[]): Promise<DataSource[]> {
    const alreadyHave = integrated.map(s => s.name).join(', ');
    const prompt = `You are researching data sources for a crypto trading application.

Already integrated: ${alreadyHave || 'none'}

Suggest 3-5 valuable crypto data sources that would give traders an edge.
Focus on:
1. Free or generous free tiers
2. Real-time or near real-time data
3. Unique/specialized data (not just price)

For each source provide:
- name: Service name
- url: API docs URL
- category: price|derivatives|onchain|sentiment|social|news
- data_available: array of data types
- api_type: rest|websocket|graphql
- auth_required: boolean
- free_tier: boolean
- priority: critical|high|medium|low

Return ONLY valid JSON array.`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a crypto data specialist. Recommend APIs that give traders an informational edge.');

      const parsed = JSON.parse(response.content);
      if (Array.isArray(parsed)) {
        return parsed.map((s: any) => ({
          name: s.name,
          url: s.url || '',
          category: s.category || 'price',
          data_available: s.data_available || [],
          api_type: s.api_type || 'rest',
          auth_required: s.auth_required ?? false,
          free_tier: s.free_tier ?? true,
          priority: s.priority || 'medium'
        }));
      }
    } catch {
      // Parse failed
    }

    return [];
  }

  /**
   * Generate integration code for a data source
   */
  async generateIntegration(source: DataSource): Promise<{
    filename: string;
    code: string;
    hooks: string[];
    dependencies: string[];
  }> {
    const prompt = `Generate a complete TypeScript service for this crypto data source:

Source: ${source.name}
Category: ${source.category}
API Type: ${source.api_type}
Data Available: ${source.data_available.join(', ')}
Docs: ${source.url}

Requirements:
- TypeScript with proper types
- Error handling and retry logic
- Rate limiting awareness
- Export both service and React hooks
- Use fetch API (no external dependencies preferred)
- Include JSDoc comments

Generate:
1. Main service file with API calls
2. React hooks for data fetching
3. Proper TypeScript types

Return complete, production-ready code wrapped in markdown blocks.`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a backend integration specialist. Generate clean, production-ready API integration code.');

      const code = this.extractCode(response.content);

      const filename = this.suggestFileName(source);
      const hooks = this.extractHooks(code);
      const dependencies = this.extractDependencies(code);

      return {
        filename,
        code,
        hooks,
        dependencies
      };
    } catch (error: any) {
      throw new Error(`Failed to generate integration: ${error.message}`);
    }
  }

  /**
   * Create the integration file
   */
  async createIntegration(source: DataSource): Promise<boolean> {
    try {
      const { filename, code, dependencies } = await this.generateIntegration(source);

      // Create services directory if needed
      if (!existsSync(this.servicesDir)) {
        mkdirSync(this.servicesDir, { recursive: true });
      }

      // Write the integration file
      const filePath = join(this.servicesDir, filename);
      writeFileSync(filePath, code);

      // Install dependencies if any
      if (dependencies.length > 0) {
        try {
          execSync(`npm install ${dependencies.join(' ')}`, {
            cwd: this.rootDir,
            stdio: 'pipe'
          });
        } catch {
          console.warn('Failed to install dependencies:', dependencies);
        }
      }

      console.log(`✅ Created integration: ${filename}`);
      return true;
    } catch (error) {
      console.error('Failed to create integration:', error);
      return false;
    }
  }

  /**
   * Research and integrate top priority source
   */
  async researchAndIntegrateNext(): Promise<{
    source: DataSource | null;
    success: boolean;
    file?: string;
  }> {
    const sources = await this.discoverNewSources();

    if (sources.length === 0) {
      return { source: null, success: false };
    }

    const nextSource = sources[0];
    const success = await this.createIntegration(nextSource);

    return {
      source: nextSource,
      success,
      file: success ? this.suggestFileName(nextSource) : undefined
    };
  }

  /**
   * Generate a research report on available data sources
   */
  async generateResearchReport(): Promise<string> {
    const integrated = this.listIntegratedSources();
    const available = await this.discoverNewSources();

    const prompt = `Generate a comprehensive data source research report for a crypto trading app.

Currently Integrated (${integrated.length}):
${integrated.map(s => `- ${s.name} (${s.status})`).join('\n')}

Available to Integrate (${available.length}):
${available.map(s => `- ${s.name} [${s.priority}] - ${s.data_available.slice(0, 3).join(', ')}`).join('\n')}

Create a report with:
1. Executive Summary
2. Coverage Analysis (what data we have vs missing)
3. Priority Recommendations
4. Integration Roadmap

Use markdown formatting.`;

    try {
      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a data strategy analyst. Create actionable recommendations for data integration.');

      return response.content;
    } catch (error) {
      return 'Error generating report';
    }
  }

  private suggestFileName(source: DataSource): string {
    const name = source.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    if (source.api_type === 'websocket') {
      return `${name}-ws.ts`;
    }
    return `${name}-service.ts`;
  }

  private extractCode(content: string): string {
    const match = content.match(/```(?:typescript|tsx)?\s*\n([\s\S]+?)\n```/);
    return match ? match[1].trim() : content;
  }

  private extractHooks(code: string): string[] {
    const hooks: string[] = [];
    const hookRegex = /export\s+(?:const|function)\s+(use\w+)/g;
    let match;
    while ((match = hookRegex.exec(code)) !== null) {
      hooks.push(match[1]);
      hookRegex.lastIndex = 0;
    }
    return hooks;
  }

  private extractDependencies(code: string): string[] {
    const deps: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const dep = match[1];
      if (!dep.startsWith('.') && !dep.startsWith('/')) {
        deps.push(dep);
      }
    }
    // Dedupe using traditional method
    const unique: string[] = [];
    for (const dep of deps) {
      if (unique.indexOf(dep) === -1) {
        unique.push(dep);
      }
    }
    return unique;
  }
}

// Singleton
let researcherInstance: DataSourceResearcher | null = null;

export function getDataSourceResearcher(): DataSourceResearcher {
  if (!researcherInstance) {
    researcherInstance = new DataSourceResearcher();
  }
  return researcherInstance;
}
