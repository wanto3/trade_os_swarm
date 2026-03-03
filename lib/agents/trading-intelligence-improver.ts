/**
 * Trading Intelligence Improver - Improves trading capabilities over time
 *
 * This system focuses on:
 * 1. Prediction accuracy - Learn what works and adjust
 * 2. Information quality - Add valuable data sources
 * 3. Information quantity - More indicators, metrics, insights
 * 4. Decision support - Better UI for traders
 *
 * NOT focused on: code bugs, refactoring, technical improvements
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getLLMClient } from '../ai/llm-client';

// ============================================================================
// TYPES
// ============================================================================

interface PredictionRecord {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  prediction: {
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    confidence: number;
    targetPrice: number;
    stopLoss: number;
    timeframeHorizon: string;
  };
  indicatorsUsed: {
    name: string;
    value: number;
    signal: string;
    weight: number;
  }[];
  marketContext: {
    trend: string;
    volatility: number;
    volume: string;
  };
  outcome?: {
    actualDirection: 'UP' | 'DOWN' | 'FLAT';
    actualMove: number; // percentage
    maxProfit: number;
    maxLoss: number;
    wasCorrect: boolean;
    confidenceMatch: number; // how well confidence predicted outcome
  };
}

interface IndicatorPerformance {
  name: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  avgConfidenceWhenCorrect: number;
  avgConfidenceWhenWrong: number;
  profitabilityWhenCorrect: number;
  profitabilityWhenWrong: number;
  lastUpdated: number;
  trend: 'improving' | 'declining' | 'stable';
  currentWeight: number;
  suggestedWeight: number;
}

interface DiscoveredDataSource {
  name: string;
  type: 'on-chain' | 'sentiment' | 'whale' | 'funding' | 'liquidation' | 'macro';
  url: string;
  description: string;
  valueScore: number; // 0-100
  integrationStatus: 'discovered' | 'evaluating' | 'integrating' | 'integrated';
  integrationCode?: string;
}

interface GeneratedIndicator {
  name: string;
  description: string;
  formula: string;
  code: string;
  expectedValue: number;
  backtestResults?: {
    accuracy: number;
    profitability: number;
    sampleSize: number;
  };
  generatedAt: number;
  status: 'proposed' | 'testing' | 'deployed' | 'rejected';
}

interface UIImprovement {
  area: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  status: 'proposed' | 'implementing' | 'deployed';
}

interface IntelligenceState {
  predictions: PredictionRecord[];
  indicatorPerformance: Map<string, IndicatorPerformance>;
  discoveredSources: DiscoveredDataSource[];
  generatedIndicators: GeneratedIndicator[];
  uiImprovements: UIImprovement[];
  config: {
    autoDeployIndicators: boolean;
    autoIntegrateSources: boolean;
    minAccuracyThreshold: number;
    minPredictionsBeforeLearning: number;
    maxIndicators: number;
    maxSources: number;
  };
  stats: {
    totalPredictions: number;
    trackedOutcomes: number;
    overallAccuracy: number;
    bestIndicator: string | null;
    worstIndicator: string | null;
    indicatorsDeployed: number;
    sourcesIntegrated: number;
  };
}

const STATE_FILE = join(process.cwd(), 'data', 'trading-intelligence-state.json');

// ============================================================================
// MAIN SYSTEM
// ============================================================================

export class TradingIntelligenceImprover {
  private state: IntelligenceState;
  private llm = getLLMClient();

  constructor() {
    this.state = this.loadState();
    this.startContinuousLearning();
  }

  private loadState(): IntelligenceState {
    try {
      if (existsSync(STATE_FILE)) {
        const data = readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(data);

        return {
          predictions: parsed.predictions || [],
          indicatorPerformance: new Map(Object.entries(parsed.indicatorPerformance || {})),
          discoveredSources: parsed.discoveredSources || [],
          generatedIndicators: parsed.generatedIndicators || [],
          uiImprovements: parsed.uiImprovements || [],
          config: parsed.config || {
            autoDeployIndicators: false, // Require manual approval for new indicators
            autoIntegrateSources: false,
            minAccuracyThreshold: 0.55,
            minPredictionsBeforeLearning: 50,
            maxIndicators: 30,
            maxSources: 10
          },
          stats: parsed.stats || {
            totalPredictions: 0,
            trackedOutcomes: 0,
            overallAccuracy: 0,
            bestIndicator: null,
            worstIndicator: null,
            indicatorsDeployed: 0,
            sourcesIntegrated: 0
          }
        };
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }

    return {
      predictions: [],
      indicatorPerformance: new Map(),
      discoveredSources: [],
      generatedIndicators: [],
      uiImprovements: [],
      config: {
        autoDeployIndicators: false,
        autoIntegrateSources: false,
        minAccuracyThreshold: 0.55,
        minPredictionsBeforeLearning: 50,
        maxIndicators: 30,
        maxSources: 10
      },
      stats: {
        totalPredictions: 0,
        trackedOutcomes: 0,
        overallAccuracy: 0,
        bestIndicator: null,
        worstIndicator: null,
        indicatorsDeployed: 0,
        sourcesIntegrated: 0
      }
    };
  }

  private saveState() {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });

      const toSave = {
        predictions: this.state.predictions,
        indicatorPerformance: Object.fromEntries(this.state.indicatorPerformance),
        discoveredSources: this.state.discoveredSources,
        generatedIndicators: this.state.generatedIndicators,
        uiImprovements: this.state.uiImprovements,
        config: this.state.config,
        stats: this.state.stats
      };

      writeFileSync(STATE_FILE, JSON.stringify(toSave, null, 2));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }

  // ========================================================================
  // PREDICTION TRACKING
  // ========================================================================

  /**
   * Record a trading prediction
   */
  recordPrediction(params: {
    symbol: string;
    timeframe: string;
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    confidence: number;
    targetPrice: number;
    stopLoss: number;
    timeframeHorizon: string;
    indicators: Array<{ name: string; value: number; signal: string; weight: number }>;
    marketContext: { trend: string; volatility: number; volume: string };
  }): string {
    const prediction: PredictionRecord = {
      id: `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      symbol: params.symbol,
      timeframe: params.timeframe,
      prediction: {
        direction: params.direction,
        confidence: params.confidence,
        targetPrice: params.targetPrice,
        stopLoss: params.stopLoss,
        timeframeHorizon: params.timeframeHorizon
      },
      indicatorsUsed: params.indicators,
      marketContext: params.marketContext
    };

    this.state.predictions.push(prediction);

    // Track indicator usage
    for (const indicator of params.indicators) {
      this.updateIndicatorPerformance(indicator.name, null);
    }

    this.state.stats.totalPredictions++;
    this.saveState();

    return prediction.id;
  }

  /**
   * Record the outcome of a prediction
   */
  recordOutcome(predictionId: string, outcome: {
    actualDirection: 'UP' | 'DOWN' | 'FLAT';
    actualMove: number;
    maxProfit: number;
    maxLoss: number;
  }) {
    const prediction = this.state.predictions.find(p => p.id === predictionId);
    if (!prediction) return;

    const wasCorrect =
      (prediction.prediction.direction === 'LONG' && outcome.actualMove > 0.5) ||
      (prediction.prediction.direction === 'SHORT' && outcome.actualMove < -0.5) ||
      (prediction.prediction.direction === 'NEUTRAL' && Math.abs(outcome.actualMove) < 0.5);

    prediction.outcome = {
      actualDirection: outcome.actualDirection,
      actualMove: outcome.actualMove,
      maxProfit: outcome.maxProfit,
      maxLoss: outcome.maxLoss,
      wasCorrect,
      confidenceMatch: Math.abs(prediction.prediction.confidence - (wasCorrect ? 100 : 0))
    };

    this.state.stats.trackedOutcomes++;

    // Update overall accuracy
    const trackedPredictions = this.state.predictions.filter(p => p.outcome !== undefined);
    const correctCount = trackedPredictions.filter(p => p.outcome?.wasCorrect).length;
    this.state.stats.overallAccuracy = correctCount / trackedPredictions.length;

    // Update indicator performance
    for (const indicator of prediction.indicatorsUsed) {
      this.updateIndicatorPerformance(indicator.name, {
        wasCorrect,
        confidence: prediction.prediction.confidence,
        profitability: outcome.maxProfit
      });
    }

    this.saveState();
  }

  // ========================================================================
  // INDICATOR PERFORMANCE TRACKING
  // ========================================================================

  private updateIndicatorPerformance(
    indicatorName: string,
    outcome: { wasCorrect: boolean; confidence: number; profitability: number } | null
  ) {
    let perf = this.state.indicatorPerformance.get(indicatorName);

    if (!perf) {
      perf = {
        name: indicatorName,
        totalPredictions: 0,
        correctPredictions: 0,
        accuracy: 0,
        avgConfidenceWhenCorrect: 0,
        avgConfidenceWhenWrong: 0,
        profitabilityWhenCorrect: 0,
        profitabilityWhenWrong: 0,
        lastUpdated: Date.now(),
        trend: 'stable',
        currentWeight: 1.0,
        suggestedWeight: 1.0
      };
      this.state.indicatorPerformance.set(indicatorName, perf);
    }

    perf.totalPredictions++;

    if (outcome) {
      if (outcome.wasCorrect) {
        perf.correctPredictions++;
        perf.avgConfidenceWhenCorrect =
          (perf.avgConfidenceWhenCorrect * (perf.correctPredictions - 1) + outcome.confidence) /
          perf.correctPredictions;
        perf.profitabilityWhenCorrect =
          (perf.profitabilityWhenCorrect * (perf.correctPredictions - 1) + outcome.profitability) /
          perf.correctPredictions;
      } else {
        const wrongCount = perf.totalPredictions - perf.correctPredictions;
        perf.avgConfidenceWhenWrong =
          (perf.avgConfidenceWhenWrong * (wrongCount - 1) + outcome.confidence) / wrongCount;
        perf.profitabilityWhenWrong =
          (perf.profitabilityWhenWrong * (wrongCount - 1) + outcome.profitability) / wrongCount;
      }
    }

    perf.accuracy = perf.correctPredictions / perf.totalPredictions;
    perf.lastUpdated = Date.now();

    // Update suggested weight based on performance
    if (perf.totalPredictions >= 10) {
      if (perf.accuracy > 0.6) {
        perf.suggestedWeight = Math.min(2.0, 1.0 + (perf.accuracy - 0.5));
      } else if (perf.accuracy < 0.45) {
        perf.suggestedWeight = Math.max(0.5, perf.accuracy);
      } else {
        perf.suggestedWeight = 1.0;
      }
    }

    // Update best/worst
    this.updateBestWorstIndicators();
  }

  private updateBestWorstIndicators() {
    let bestAccuracy = 0;
    let worstAccuracy = 1;
    let bestIndicator: string | null = null;
    let worstIndicator: string | null = null;

    for (const [name, perf] of this.state.indicatorPerformance) {
      if (perf.totalPredictions < 10) continue;

      if (perf.accuracy > bestAccuracy) {
        bestAccuracy = perf.accuracy;
        bestIndicator = name;
      }

      if (perf.accuracy < worstAccuracy) {
        worstAccuracy = perf.accuracy;
        worstIndicator = name;
      }
    }

    this.state.stats.bestIndicator = bestIndicator;
    this.state.stats.worstIndicator = worstIndicator;
  }

  // ========================================================================
  // INTELLIGENCE GENERATION
  // ========================================================================

  /**
   * Run an improvement cycle - generate new trading intelligence
   */
  async runImprovementCycle(): Promise<{
    newIndicators: GeneratedIndicator[];
    newSources: DiscoveredDataSource[];
    uiImprovements: UIImprovement[];
    weightAdjustments: Array<{ name: string; oldWeight: number; newWeight: number }>;
  }> {
    const results = {
      newIndicators: [] as GeneratedIndicator[],
      newSources: [] as DiscoveredDataSource[],
      uiImprovements: [] as UIImprovement[],
      weightAdjustments: [] as Array<{ name: string; oldWeight: number; newWeight: number }>
    };

    // Only run if we have enough data
    if (this.state.stats.trackedOutcomes < this.state.config.minPredictionsBeforeLearning) {
      console.log(`Not enough data yet: ${this.state.stats.trackedOutcomes}/${this.state.config.minPredictionsBeforeLearning} predictions tracked`);
      return results;
    }

    console.log('🧠 Running trading intelligence improvement cycle...');

    // 1. Generate new indicators based on what's working
    if (this.state.generatedIndicators.length < this.state.config.maxIndicators) {
      const newIndicator = await this.generateNewIndicator();
      if (newIndicator) {
        this.state.generatedIndicators.push(newIndicator);
        results.newIndicators.push(newIndicator);
        console.log(`✨ Generated new indicator: ${newIndicator.name}`);
      }
    }

    // 2. Discover new data sources
    if (this.state.discoveredSources.length < this.state.config.maxSources) {
      const newSources = await this.discoverDataSources();
      this.state.discoveredSources.push(...newSources);
      results.newSources = newSources;
      console.log(`📊 Discovered ${newSources.length} new data sources`);
    }

    // 3. Generate UI improvements
    const uiImprovements = await this.generateUIImprovements();
    this.state.uiImprovements.push(...uiImprovements);
    results.uiImprovements = uiImprovements;

    // 4. Adjust indicator weights based on performance
    for (const [name, perf] of this.state.indicatorPerformance) {
      if (perf.totalPredictions >= 10 && perf.suggestedWeight !== perf.currentWeight) {
        results.weightAdjustments.push({
          name,
          oldWeight: perf.currentWeight,
          newWeight: perf.suggestedWeight
        });
        perf.currentWeight = perf.suggestedWeight;
      }
    }

    this.saveState();
    return results;
  }

  /**
   * Generate a new trading indicator based on what's working
   */
  private async generateNewIndicator(): Promise<GeneratedIndicator | null> {
    try {
      // Get the best performing existing indicators
      const topIndicators = Array.from(this.state.indicatorPerformance.entries())
        .filter(([_, p]) => p.totalPredictions >= 10)
        .sort((a, b) => b[1].accuracy - a[1].accuracy)
        .slice(0, 3)
        .map(([name, _]) => name);

      // Get market conditions that matter
      const profitableContexts = this.analyzeProfitableContexts();

      const prompt = `You are a trading expert. Generate a NEW, innovative trading indicator.

Best performing existing indicators: ${topIndicators.join(', ') || 'RSI, MACD, EMA'}

Market contexts that show profitability:
${profitableContexts.map(c => `- ${c.context}: ${c.avgProfitability.toFixed(1)}% avg profit`).join('\n')}

Requirements:
1. Must be NOVEL - not RSI, MACD, EMA, Bollinger Bands, etc.
2. Should combine multiple data points (price, volume, time, patterns)
3. Must be calculable from OHLCV data
4. Should help predict price movements
5. Provide clear bullish/bearish signals

Return JSON:
{
  "name": "Creative indicator name",
  "description": "What it measures and why it's useful",
  "formula": "Mathematical description",
  "parameters": ["param1: description", "param2: description"],
  "interpretation": "How to read signals",
  "code": "TypeScript function implementation"
}`;

      const response = await this.llm.generate([{ role: 'user', content: prompt }], '');

      try {
        const parsed = JSON.parse(response.content);

        return {
          name: parsed.name || 'AI Generated Indicator',
          description: parsed.description || '',
          formula: parsed.formula || '',
          code: parsed.code || '',
          expectedValue: 50,
          generatedAt: Date.now(),
          status: 'proposed'
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
   * Discover new data sources that could improve trading
   */
  private async discoverDataSources(): Promise<DiscoveredDataSource[]> {
    const sources: DiscoveredDataSource[] = [];

    // Potential data sources to discover
    const potentialSources = [
      {
        name: 'Whale Alert API',
        type: 'whale' as const,
        url: 'https://api.whale-alert.io/v1',
        description: 'Track large cryptocurrency transactions',
        valueScore: 85
      },
      {
        name: 'Glassnode On-Chain Metrics',
        type: 'on-chain' as const,
        url: 'https://api.glassnode.io',
        description: 'MVRV, NVT, SOPR and other on-chain indicators',
        valueScore: 90
      },
      {
        name: 'CryptoQuant Analytics',
        type: 'on-chain' as const,
        url: 'https://cryptoquant.com/api',
        description: 'Exchange flows, miner metrics, stablecoin metrics',
        valueScore: 88
      },
      {
        name: 'LunarCrush Social Sentiment',
        type: 'sentiment' as const,
        url: 'https://api.lunarcrush.com',
        description: 'Social media sentiment and buzz metrics',
        valueScore: 75
      },
      {
        name: 'Coinglass Liquidation Data',
        type: 'liquidation' as const,
        url: 'https://api.coinglass.com',
        description: 'Real-time liquidation heatmap and data',
        valueScore: 80
      },
      {
        name: 'Binance Funding Rates',
        type: 'funding' as const,
        url: 'https://fapi.binance.com',
        description: 'Real-time funding rates across perpetual contracts',
        valueScore: 82
      }
    ];

    // Filter out already discovered sources
    for (const source of potentialSources) {
      if (!this.state.discoveredSources.find(s => s.name === source.name)) {
        sources.push({
          ...source,
          integrationStatus: 'discovered'
        });
      }
    }

    return sources;
  }

  /**
   * Generate UI improvements for better decision making
   */
  private async generateUIImprovements(): Promise<UIImprovement[]> {
    const improvements: UIImprovement[] = [];

    // Analyze what information would be most valuable
    const topIndicator = this.state.stats.bestIndicator;
    const worstIndicator = this.state.stats.worstIndicator;
    const accuracy = this.state.stats.overallAccuracy;

    // Suggestion 1: Show indicator accuracy
    if (topIndicator && accuracy > 0) {
      improvements.push({
        area: 'Signal Display',
        suggestion: `Show historical accuracy (${(accuracy * 100).toFixed(0)}%) next to each trading signal`,
        priority: 'high',
        status: 'proposed'
      });
    }

    // Suggestion 2: Highlight best indicator
    if (topIndicator) {
      const perf = this.state.indicatorPerformance.get(topIndicator);
      if (perf && perf.accuracy > 0.6) {
        improvements.push({
          area: 'Indicator Highlighting',
          suggestion: `Highlight ${topIndicator} signals - it has ${(perf.accuracy * 100).toFixed(0)}% accuracy`,
          priority: 'high',
          status: 'proposed'
        });
      }
    }

    // Suggestion 3: Downplay worst indicator
    if (worstIndicator) {
      const perf = this.state.indicatorPerformance.get(worstIndicator);
      if (perf && perf.accuracy < 0.45 && perf.totalPredictions > 20) {
        improvements.push({
          area: 'Indicator Deprioritization',
          suggestion: `Reduce visibility of ${worstIndicator} - only ${(perf.accuracy * 100).toFixed(0)}% accurate`,
          priority: 'medium',
          status: 'proposed'
        });
      }
    }

    // Suggestion 4: Add confidence visualization
    improvements.push({
      area: 'Confidence Display',
      suggestion: 'Add visual confidence meter to each signal based on historical accuracy',
      priority: 'high',
      status: 'proposed'
    });

    // Suggestion 5: Show what top traders are watching
    improvements.push({
      area: 'Social Signals',
      suggestion: 'Add section showing what the best performing indicators are saying right now',
      priority: 'medium',
      status: 'proposed'
    });

    return improvements;
  }

  /**
   * Analyze which market contexts are most profitable
   */
  private analyzeProfitableContexts(): Array<{ context: string; avgProfitability: number }> {
    const contexts = new Map<string, { totalProfit: number; count: number }>();

    for (const prediction of this.state.predictions) {
      if (!prediction.outcome) continue;

      const context = `${prediction.marketContext.trend} volatility:${prediction.marketContext.volatility.toFixed(2)}`;
      const existing = contexts.get(context) || { totalProfit: 0, count: 0 };
      existing.totalProfit += prediction.outcome.maxProfit;
      existing.count += 1;
      contexts.set(context, existing);
    }

    return Array.from(contexts.entries())
      .map(([context, data]) => ({
        context,
        avgProfitability: data.totalProfit / data.count
      }))
      .sort((a, b) => b.avgProfitability - a.avgProfitability)
      .slice(0, 5);
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================

  /**
   * Get weighted indicators for a prediction
   */
  getWeightedIndicators(indicators: Array<{
    name: string;
    value: number;
    signal: string;
  }>): Array<{
    name: string;
    value: number;
    signal: string;
    weight: number;
    accuracy?: number;
  }> {
    return indicators.map(ind => {
      const perf = this.state.indicatorPerformance.get(ind.name);

      let weight = 1.0;
      let accuracy = 0.5;

      if (perf && perf.totalPredictions >= 5) {
        weight = perf.currentWeight;
        accuracy = perf.accuracy;
      }

      return {
        ...ind,
        weight,
        accuracy
      };
    });
  }

  /**
   * Get indicator performance summary
   */
  getIndicatorPerformance(): Array<{
    name: string;
    accuracy: number;
    predictions: number;
    weight: number;
    profitability: number;
  }> {
    return Array.from(this.state.indicatorPerformance.entries())
      .filter(([_, p]) => p.totalPredictions >= 5)
      .map(([name, perf]) => ({
        name,
        accuracy: perf.accuracy,
        predictions: perf.totalPredictions,
        weight: perf.currentWeight,
        profitability: (perf.profitabilityWhenCorrect * perf.correctPredictions +
                       perf.profitabilityWhenWrong * (perf.totalPredictions - perf.correctPredictions)) /
                       perf.totalPredictions
      }))
      .sort((a, b) => b.accuracy - a.accuracy);
  }

  /**
   * Get recommended improvements
   */
  getRecommendations(): {
    indicatorsToAdd: GeneratedIndicator[];
    sourcesToIntegrate: DiscoveredDataSource[];
    uiImprovements: UIImprovement[];
    indicatorWeights: Array<{ name: string; currentWeight: number; suggestedWeight: number }>;
  } {
    return {
      indicatorsToAdd: this.state.generatedIndicators.filter(i => i.status === 'proposed'),
      sourcesToIntegrate: this.state.discoveredSources.filter(s => s.integrationStatus === 'discovered'),
      uiImprovements: this.state.uiImprovements.filter(u => u.status === 'proposed'),
      indicatorWeights: Array.from(this.state.indicatorPerformance.entries())
        .filter(([_, p]) => p.totalPredictions >= 10 && Math.abs(p.currentWeight - p.suggestedWeight) > 0.1)
        .map(([name, p]) => ({
          name,
          currentWeight: p.currentWeight,
          suggestedWeight: p.suggestedWeight
        }))
    };
  }

  /**
   * Deploy a proposed indicator
   */
  deployIndicator(indicatorName: string): boolean {
    const indicator = this.state.generatedIndicators.find(i => i.name === indicatorName);
    if (indicator) {
      indicator.status = 'deployed';
      this.state.stats.indicatorsDeployed++;
      this.saveState();
      return true;
    }
    return false;
  }

  /**
   * Integrate a data source
   */
  integrateSource(sourceName: string): boolean {
    const source = this.state.discoveredSources.find(s => s.name === sourceName);
    if (source) {
      source.integrationStatus = 'integrated';
      this.state.stats.sourcesIntegrated++;
      this.saveState();
      return true;
    }
    return false;
  }

  /**
   * Apply a UI improvement
   */
  applyUIImprovement(area: string): boolean {
    const improvement = this.state.uiImprovements.find(u => u.area === area && u.status === 'proposed');
    if (improvement) {
      improvement.status = 'deployed';
      this.saveState();
      return true;
    }
    return false;
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<IntelligenceState['config']>) {
    this.state.config = { ...this.state.config, ...config };
    this.saveState();
  }

  /**
   * Get state
   */
  getState() {
    return {
      predictions: this.state.predictions.length,
      trackedOutcomes: this.state.stats.trackedOutcomes,
      overallAccuracy: this.state.stats.overallAccuracy,
      bestIndicator: this.state.stats.bestIndicator,
      worstIndicator: this.state.stats.worstIndicator,
      indicatorsTracked: this.state.indicatorPerformance.size,
      generatedIndicators: this.state.generatedIndicators.length,
      discoveredSources: this.state.discoveredSources.length,
      config: this.state.config
    };
  }

  /**
   * Start continuous learning
   */
  private startContinuousLearning() {
    // Run improvement cycle every hour
    setInterval(() => {
      this.runImprovementCycle().catch(console.error);
    }, 60 * 60 * 1000);

    console.log('🧠 Trading Intelligence Improver started');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: TradingIntelligenceImprover | null = null;

export function getTradingIntelligenceImprover(): TradingIntelligenceImprover {
  if (!instance) {
    instance = new TradingIntelligenceImprover();
  }
  return instance;
}
