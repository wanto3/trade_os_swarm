/**
 * Adaptive Strategy Generator
 *
 * Uses AI to generate new trading strategies and indicators based on:
 * 1. What's currently working (high-performing features)
 * 2. Market regime changes (trending vs ranging)
 * 3. Recent prediction failures (what went wrong)
 *
 * This is the "creative" part of the recursive improvement system.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getLLMClient } from '../ai/llm-client';

interface GeneratedIndicator {
  name: string;
  formula: string;
  description: string;
  interpretation: string;
  code: string;
  expectedValue: number;
}

interface MarketRegime {
  trend: 'bullish' | 'bearish' | 'ranging' | 'volatile';
  strength: number;
  duration: number;
  lastChange: number;
}

interface StrategyFailure {
  timestamp: number;
  symbol: string;
  predictedAction: string;
  actualOutcome: string;
  reason: string;
}

interface AdaptiveStrategy {
  id: string;
  name: string;
  description: string;
  regime: MarketRegime['trend'];
  indicators: string[];
  entryRules: string[];
  exitRules: string[];
  riskManagement: {
    stopLoss: string;
    takeProfit: string;
    positionSizing: string;
  };
  generatedAt: number;
  tested: boolean;
  backtestResults?: {
    winRate: number;
    avgProfit: number;
    maxDrawdown: number;
  };
}

const STRATEGIES_FILE = join(process.cwd(), 'data', 'adaptive-strategies.json');
const FAILURES_FILE = join(process.cwd(), 'data', 'strategy-failures.json');

class AdaptiveStrategyGenerator {
  private strategies: AdaptiveStrategy[] = [];
  private failures: StrategyFailure[] = [];
  private currentRegime: MarketRegime = {
    trend: 'ranging',
    strength: 0,
    duration: 0,
    lastChange: Date.now()
  };
  private llm = getLLMClient();

  constructor() {
    this.loadState();
    this.startRegimeDetection();
  }

  private loadState() {
    try {
      if (existsSync(STRATEGIES_FILE)) {
        const data = readFileSync(STRATEGIES_FILE, 'utf-8');
        this.strategies = JSON.parse(data);
      }
      if (existsSync(FAILURES_FILE)) {
        const data = readFileSync(FAILURES_FILE, 'utf-8');
        this.failures = JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }

  private saveState() {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      writeFileSync(STRATEGIES_FILE, JSON.stringify(this.strategies, null, 2));
      writeFileSync(FAILURES_FILE, JSON.stringify(this.failures, null, 2));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }

  /**
   * Detect market regime from price data
   */
  detectRegime(prices: number[]): MarketRegime {
    if (prices.length < 20) {
      return this.currentRegime;
    }

    const recent = prices.slice(-20);
    const older = prices.slice(-40, -20);

    // Calculate trends
    const recentTrend = (recent[recent.length - 1] - recent[0]) / recent[0];
    const olderTrend = (older[older.length - 1] - older[0]) / older[0];

    // Calculate volatility
    const returns = [];
    for (let i = 1; i < recent.length; i++) {
      returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // Determine regime
    let trend: MarketRegime['trend'] = 'ranging';
    let strength = Math.abs(recentTrend) * 100;

    if (Math.abs(recentTrend) < 0.01) {
      trend = 'ranging';
    } else if (volatility > 0.03) {
      trend = 'volatile';
    } else if (recentTrend > 0.015) {
      trend = 'bullish';
    } else if (recentTrend < -0.015) {
      trend = 'bearish';
    }

    // Check for regime change
    const regimeChanged = trend !== this.currentRegime.trend;

    if (regimeChanged) {
      this.currentRegime = {
        trend,
        strength,
        duration: 0,
        lastChange: Date.now()
      };

      // Generate new strategy for new regime
      this.generateStrategyForRegime(trend);

    } else {
      this.currentRegime.duration += 1;
      this.currentRegime.strength = strength;
    }

    return this.currentRegime;
  }

  private startRegimeDetection() {
    // Check for regime changes every hour
    setInterval(() => {
      this.analyzeFailures();
    }, 60 * 60 * 1000);
  }

  /**
   * Analyze recent failures to find patterns
   */
  private async analyzeFailures() {
    const recentFailures = this.failures.slice(-20);

    if (recentFailures.length < 5) return;

    // Group by symbol
    const bySymbol = new Map<string, StrategyFailure[]>();
    for (const failure of recentFailures) {
      const existing = bySymbol.get(failure.symbol) || [];
      existing.push(failure);
      bySymbol.set(failure.symbol, existing);
    }

    // Look for patterns
    for (const [symbol, failures] of bySymbol) {
      const wrongDirection = failures.filter(f =>
        f.predictedAction === 'LONG' && f.actualOutcome === 'DOWN' ||
        f.predictedAction === 'SHORT' && f.actualOutcome === 'UP'
      );

      if (wrongDirection.length >= 3) {
        // We're consistently getting this wrong
        await this.generateCorrectiveStrategy(symbol, wrongDirection);
      }
    }
  }

  /**
   * Generate a strategy for a specific market regime
   */
  private async generateStrategyForRegime(regime: MarketRegime['trend']) {
    console.log(`🧠 Generating new ${regime} regime strategy...`);

    try {
      const prompt = `Generate a trading strategy for a ${regime} market regime.

Return JSON with:
{
  "name": "Strategy name",
  "description": "Brief description",
  "indicators": ["indicator1", "indicator2"],
  "entryRules": ["rule1", "rule2"],
  "exitRules": ["rule1", "rule2"],
  "riskManagement": {
    "stopLoss": "description",
    "takeProfit": "description",
    "positionSizing": "description"
  }
}

Consider:
- ${regime} market characteristics
- Risk management is critical
- Clear entry and exit rules
- Confirm with multiple indicators`;

      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], '');

      let strategy: AdaptiveStrategy;
      try {
        const parsed = JSON.parse(response.content);
        strategy = {
          id: `strat-${Date.now()}`,
          name: parsed.name || `${regime.toUpperCase()} Strategy`,
          description: parsed.description || `AI-generated strategy for ${regime} markets`,
          regime,
          indicators: parsed.indicators || [],
          entryRules: parsed.entryRules || [],
          exitRules: parsed.exitRules || [],
          riskManagement: parsed.riskManagement || {
            stopLoss: '2%',
            takeProfit: '4%',
            positionSizing: '1-2% of portfolio'
          },
          generatedAt: Date.now(),
          tested: false
        };
      } catch {
        // Parse failed, create basic strategy
        strategy = {
          id: `strat-${Date.now()}`,
          name: `${regime.toUpperCase()} AI Strategy`,
          description: `Auto-generated for ${regime} conditions`,
          regime,
          indicators: ['RSI', 'MACD', 'EMA'],
          entryRules: [
            regime === 'bullish' ? 'Enter on dip to support' :
            regime === 'bearish' ? 'Enter on rally to resistance' :
            'Range trade at boundaries'
          ],
          exitRules: ['Stop loss hit', 'Take profit hit', 'Regime change'],
          riskManagement: {
            stopLoss: '2%',
            takeProfit: '4%',
            positionSizing: '1% of portfolio'
          },
          generatedAt: Date.now(),
          tested: false
        };
      }

      this.strategies.push(strategy);
      this.saveState();

      console.log(`✅ Generated strategy: ${strategy.name}`);

    } catch (e) {
      console.error('Failed to generate strategy:', e);
    }
  }

  /**
   * Generate a corrective strategy for consistently wrong predictions
   */
  private async generateCorrectiveStrategy(symbol: string, failures: StrategyFailure[]) {
    console.log(`🔧 Generating corrective strategy for ${symbol}...`);

    // Analyze the failures
    const failurePatterns = failures.map(f => ({
      predicted: f.predictedAction,
      actual: f.actualOutcome,
      reason: f.reason
    }));

    try {
      const prompt = `We've been making consistently wrong predictions for ${symbol}.

Recent failures:
${JSON.stringify(failurePatterns, null, 2)}

Generate a corrective strategy that:
1. Identifies what we're doing wrong
2. Suggests opposite or different approach
3. Adds additional confirmation filters

Return JSON with:
{
  "analysis": "What went wrong",
  "correctiveAction": "How to fix it",
  "newRules": ["rule1", "rule2"],
  "additionalFilters": ["filter1", "filter2"]
}`;

      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], '');

      console.log('Corrective analysis:', response.content);

      // Store as a note for future strategy generation
      this.strategies.push({
        id: `corrective-${Date.now()}`,
        name: `${symbol} Corrective Strategy`,
        description: response.content.substring(0, 500),
        regime: this.currentRegime.trend,
        indicators: [],
        entryRules: [],
        exitRules: [],
        riskManagement: {
          stopLoss: '1%',
          takeProfit: '2%',
          positionSizing: '0.5%'
        },
        generatedAt: Date.now(),
        tested: false
      });

      this.saveState();

    } catch (e) {
      console.error('Failed to generate corrective strategy:', e);
    }
  }

  /**
   * Generate a new trading indicator
   */
  async generateIndicator(marketContext: {
    symbol: string;
    currentPrice: number;
    trend: string;
    volatility: number;
  }): Promise<GeneratedIndicator | null> {
    try {
      const prompt = `Generate a NEW, innovative trading indicator for ${marketContext.symbol}.

Context:
- Current trend: ${marketContext.trend}
- Volatility: ${(marketContext.volatility * 100).toFixed(2)}%
- Price: $${marketContext.price}

The indicator should:
1. Be novel (not RSI, MACD, EMA, etc.)
2. Combine multiple data points
3. Help predict price moves
4. Be implementable in TypeScript

Return JSON:
{
  "name": "Indicator Name",
  "formula": "Mathematical description",
  "description": "What it measures",
  "interpretation": "How to read it",
  "code": "TypeScript implementation"
}`;

      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], '');

      try {
        const parsed = JSON.parse(response.content);

        return {
          name: parsed.name || 'AI Indicator',
          formula: parsed.formula || '',
          description: parsed.description || '',
          interpretation: parsed.interpretation || '',
          code: parsed.code || '',
          expectedValue: 50
        };
      } catch {
        return null;
      }

    } catch (e) {
      console.error('Failed to generate indicator:', e);
      return null;
    }
  }

  /**
   * Record a strategy failure
   */
  recordFailure(failure: StrategyFailure) {
    this.failures.push(failure);

    // Keep only last 100 failures
    if (this.failures.length > 100) {
      this.failures = this.failures.slice(-100);
    }

    this.saveState();
  }

  /**
   * Get the best strategy for current regime
   */
  getStrategyForCurrentRegime(): AdaptiveStrategy | null {
    const regimeStrategies = this.strategies
      .filter(s => s.regime === this.currentRegime.trend)
      .filter(s => s.tested && s.backtestResults
        ? s.backtestResults.winRate > 0.5
        : true
      )
      .sort((a, b) =>
        (b.backtestResults?.winRate || 0) - (a.backtestResults?.winRate || 0)
      );

    return regimeStrategies[0] || null;
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): AdaptiveStrategy[] {
    return this.strategies;
  }

  /**
   * Update strategy backtest results
   */
  updateBacktest(strategyId: string, results: AdaptiveStrategy['backtestResults']) {
    const strategy = this.strategies.find(s => s.id === strategyId);
    if (strategy) {
      strategy.backtestResults = results;
      strategy.tested = true;
      this.saveState();
    }
  }

  /**
   * Get current regime
   */
  getCurrentRegime(): MarketRegime {
    return this.currentRegime;
  }
}

// Singleton
let generatorInstance: AdaptiveStrategyGenerator | null = null;

export function getAdaptiveStrategyGenerator(): AdaptiveStrategyGenerator {
  if (!generatorInstance) {
    generatorInstance = new AdaptiveStrategyGenerator();
  }
  return generatorInstance;
}
