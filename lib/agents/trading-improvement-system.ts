/**
 * Recursive Trading Improvement System
 *
 * This system learns and improves trading intelligence over time by:
 * 1. Tracking prediction accuracy and learning which indicators work
 * 2. Auto-generating new trading strategies based on performance
 * 3. Discovering new valuable data sources
 * 4. Optimizing UI based on trader usage patterns
 *
 * The system is self-improving - better predictions lead to better strategies,
 * which lead to more profits, which fund more data sources, creating a flywheel.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// TYPES
// ============================================================================

interface PredictionRecord {
  id: string;
  timestamp: number;
  symbol: string;
  prediction: {
    action: 'LONG' | 'SHORT' | 'WAIT';
    confidence: number;
    entryZone: { min: number; max: number };
    stopLoss: number;
    takeProfit: number;
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
    actualAction: 'LONG' | 'SHORT' | 'WAIT';
    maxProfit: number; // Max profit if taken
    maxLoss: number; // Max loss if taken
    actualMove: number; // Actual price move %
    wasCorrect: boolean;
    confidenceMatch: number; // How well confidence predicted outcome
  };
}

interface FeatureImportance {
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
}

interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  indicators: string[];
  rules: string[];
  entryConditions: string[];
  exitConditions: string[];
  performance: {
    totalTrades: number;
    winRate: number;
    avgProfit: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    sharpeRatio: number;
  };
  generatedAt: number;
  lastTested: number;
  isActive: boolean;
}

interface UIUsagePattern {
  elementId: string;
  clicks: number;
  hoverTime: number; // ms
  lastUsed: number;
  usedInTrades: number;
  tradesWhenUsed: {
    profitable: number;
    total: number;
  };
  suggestedImprovements: string[];
}

interface MarketDataScore {
  source: string;
  latency: number; // ms
  reliability: number; // 0-1
  predictivePower: number; // correlation with price moves
  costPerCall: number;
  valueScore: number; // composite score
}

// ============================================================================
// STATE
// ============================================================================

interface ImprovementState {
  predictions: PredictionRecord[];
  featureImportance: Map<string, FeatureImportance>;
  strategies: StrategyTemplate[];
  uiPatterns: Map<string, UIUsagePattern>;
  dataScores: Map<string, MarketDataScore>;
  config: {
    minPredictionsBeforeLearning: number;
    maxPredictionHistory: number;
    autoGenerateStrategies: boolean;
    autoOptimizeUI: boolean;
    learningRate: number;
  };
  statistics: {
    totalPredictions: number;
    correctPredictions: number;
    overallAccuracy: number;
    bestFeature: string | null;
    worstFeature: string | null;
    bestStrategy: string | null;
    improvementTrend: number[]; // last 30 days accuracy
  };
}

const STATE_FILE = join(process.cwd(), 'data', 'trading-improvement-state.json');

// ============================================================================
// MAIN SYSTEM
// ============================================================================

export class TradingImprovementSystem {
  private state: ImprovementState;
  private isRunning: boolean = false;

  constructor() {
    this.state = this.loadState();
  }

  // ========================================================================
  // STATE MANAGEMENT
  // ========================================================================

  private loadState(): ImprovementState {
    try {
      if (existsSync(STATE_FILE)) {
        const data = readFileSync(STATE_FILE, 'utf-8');
        const parsed = JSON.parse(data);

        return {
          predictions: parsed.predictions || [],
          featureImportance: new Map(Object.entries(parsed.featureImportance || {})),
          strategies: parsed.strategies || [],
          uiPatterns: new Map(Object.entries(parsed.uiPatterns || {})),
          dataScores: new Map(Object.entries(parsed.dataScores || {})),
          config: parsed.config || {
            minPredictionsBeforeLearning: 50,
            maxPredictionHistory: 1000,
            autoGenerateStrategies: true,
            autoOptimizeUI: true,
            learningRate: 0.1
          },
          statistics: parsed.statistics || {
            totalPredictions: 0,
            correctPredictions: 0,
            overallAccuracy: 0,
            bestFeature: null,
            worstFeature: null,
            bestStrategy: null,
            improvementTrend: []
          }
        };
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }

    return {
      predictions: [],
      featureImportance: new Map(),
      strategies: [],
      uiPatterns: new Map(),
      dataScores: new Map(),
      config: {
        minPredictionsBeforeLearning: 50,
        maxPredictionHistory: 1000,
        autoGenerateStrategies: true,
        autoOptimizeUI: true,
        learningRate: 0.1
      },
      statistics: {
        totalPredictions: 0,
        correctPredictions: 0,
        overallAccuracy: 0,
        bestFeature: null,
        worstFeature: null,
        bestStrategy: null,
        improvementTrend: []
      }
    };
  }

  private saveState() {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });

      const toSave = {
        predictions: this.state.predictions,
        featureImportance: Object.fromEntries(this.state.featureImportance),
        strategies: this.state.strategies,
        uiPatterns: Object.fromEntries(this.state.uiPatterns),
        dataScores: Object.fromEntries(this.state.dataScores),
        config: this.state.config,
        statistics: this.state.statistics
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
  recordPrediction(prediction: Omit<PredictionRecord, 'id' | 'timestamp'>): string {
    const record: PredictionRecord = {
      id: `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      ...prediction
    };

    this.state.predictions.push(record);

    // Trim history if needed
    if (this.state.predictions.length > this.state.config.maxPredictionHistory) {
      this.state.predictions = this.state.predictions.slice(-this.state.config.maxPredictionHistory);
    }

    // Update feature importance
    for (const indicator of prediction.indicatorsUsed) {
      this.updateFeatureImportance(indicator.name, null); // Will update when outcome is known
    }

    this.state.statistics.totalPredictions++;
    this.saveState();

    return record.id;
  }

  /**
   * Record the outcome of a prediction
   */
  recordOutcome(predictionId: string, outcome: PredictionRecord['outcome']) {
    if (!outcome) return;

    const prediction = this.state.predictions.find(p => p.id === predictionId);
    if (!prediction) {
      console.warn(`Prediction ${predictionId} not found`);
      return;
    }

    prediction.outcome = outcome;

    // Update statistics
    if (outcome.wasCorrect) {
      this.state.statistics.correctPredictions++;
    }

    this.state.statistics.overallAccuracy =
      this.state.statistics.correctPredictions / this.state.statistics.totalPredictions;

    // Update feature importance based on outcome
    for (const indicator of prediction.indicatorsUsed) {
      this.updateFeatureImportance(
        indicator.name,
        {
          wasCorrect: outcome.wasCorrect,
          confidence: prediction.prediction.confidence,
          profitability: outcome.maxProfit
        }
      );
    }

    // Check if we should generate new strategies
    if (this.state.config.autoGenerateStrategies &&
        this.state.statistics.totalPredictions % this.state.config.minPredictionsBeforeLearning === 0) {
      this.generateNewStrategies();
    }

    this.saveState();
  }

  // ========================================================================
  // FEATURE IMPORTANCE
  // ========================================================================

  private updateFeatureImportance(
    featureName: string,
    outcome: { wasCorrect: boolean; confidence: number; profitability: number } | null
  ) {
    let feature = this.state.featureImportance.get(featureName);

    if (!feature) {
      feature = {
        name: featureName,
        totalPredictions: 0,
        correctPredictions: 0,
        accuracy: 0,
        avgConfidenceWhenCorrect: 0,
        avgConfidenceWhenWrong: 0,
        profitabilityWhenCorrect: 0,
        profitabilityWhenWrong: 0,
        lastUpdated: Date.now(),
        trend: 'stable'
      };
      this.state.featureImportance.set(featureName, feature);
    }

    feature.totalPredictions++;

    if (outcome) {
      if (outcome.wasCorrect) {
        feature.correctPredictions++;
        feature.avgConfidenceWhenCorrect =
          (feature.avgConfidenceWhenCorrect * (feature.correctPredictions - 1) + outcome.confidence) /
          feature.correctPredictions;
        feature.profitabilityWhenCorrect =
          (feature.profitabilityWhenCorrect * (feature.correctPredictions - 1) + outcome.profitability) /
          feature.correctPredictions;
      } else {
        const wrongCount = feature.totalPredictions - feature.correctPredictions;
        feature.avgConfidenceWhenWrong =
          (feature.avgConfidenceWhenWrong * (wrongCount - 1) + outcome.confidence) / wrongCount;
        feature.profitabilityWhenWrong =
          (feature.profitabilityWhenWrong * (wrongCount - 1) + outcome.profitability) / wrongCount;
      }
    }

    feature.accuracy = feature.correctPredictions / feature.totalPredictions;
    feature.lastUpdated = Date.now();

    // Update best/worst features
    this.updateBestWorstFeatures();
  }

  private updateBestWorstFeatures() {
    let bestAccuracy = 0;
    let worstAccuracy = 1;
    let bestFeature: string | null = null;
    let worstFeature: string | null = null;

    for (const [name, feature] of this.state.featureImportance) {
      if (feature.totalPredictions < 10) continue; // Need minimum samples

      if (feature.accuracy > bestAccuracy) {
        bestAccuracy = feature.accuracy;
        bestFeature = name;
      }

      if (feature.accuracy < worstAccuracy) {
        worstAccuracy = feature.accuracy;
        worstFeature = name;
      }
    }

    this.state.statistics.bestFeature = bestFeature;
    this.state.statistics.worstFeature = worstFeature;
  }

  // ========================================================================
  // STRATEGY GENERATION
  // ========================================================================

  /**
   * Generate new trading strategies based on what's working
   */
  private generateNewStrategies() {
    console.log('🧠 Generating new trading strategies based on performance...');

    // Find the best performing indicators
    const topFeatures = Array.from(this.state.featureImportance.entries())
      .filter(([_, f]) => f.totalPredictions >= 10)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)
      .slice(0, 5)
      .map(([name, _]) => name);

    if (topFeatures.length < 2) {
      console.log('Not enough data to generate strategies');
      return;
    }

    // Generate combinations of top indicators
    const newStrategy: StrategyTemplate = {
      id: `strat-${Date.now()}`,
      name: `AI-Generated ${topFeatures.slice(0, 3).join('-')}`,
      description: `Strategy combining top performing indicators: ${topFeatures.join(', ')}`,
      indicators: topFeatures,
      rules: [
        `Enter LONG when ${topFeatures[0]} shows bullish signal`,
        `Confirm with ${topFeatures[1] || 'secondary indicator'}`,
        `Exit when any indicator reverses or take profit hit`
      ],
      entryConditions: topFeatures.map(f => `${f} bullish`),
      exitConditions: ['Stop loss hit', 'Take profit hit', 'Signal reversal'],
      performance: {
        totalTrades: 0,
        winRate: 0,
        avgProfit: 0,
        avgLoss: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        sharpeRatio: 0
      },
      generatedAt: Date.now(),
      lastTested: Date.now(),
      isActive: false // Requires human approval
    };

    this.state.strategies.push(newStrategy);

    // Keep only top 20 strategies
    if (this.state.strategies.length > 20) {
      this.state.strategies = this.state.strategies
        .sort((a, b) => b.performance.winRate - a.performance.winRate)
        .slice(0, 20);
    }

    console.log(`✅ Generated new strategy: ${newStrategy.name}`);
    this.saveState();
  }

  /**
   * Get recommended indicators for current market conditions
   */
  getRecommendedIndicators(symbol: string, marketCondition: string): string[] {
    // Return indicators that have historically performed well
    return Array.from(this.state.featureImportance.entries())
      .filter(([_, f]) => f.totalPredictions >= 10 && f.accuracy > 0.55)
      .sort((a, b) => b[1].accuracy - a[1].accuracy)
      .slice(0, 5)
      .map(([name, _]) => name);
  }

  // ========================================================================
  // UI OPTIMIZATION
  // ========================================================================

  /**
   * Track UI element usage
   */
  trackUIUsage(elementId: string, action: 'click' | 'hover', duration?: number) {
    let pattern = this.state.uiPatterns.get(elementId);

    if (!pattern) {
      pattern = {
        elementId,
        clicks: 0,
        hoverTime: 0,
        lastUsed: Date.now(),
        usedInTrades: 0,
        tradesWhenUsed: { profitable: 0, total: 0 },
        suggestedImprovements: []
      };
      this.state.uiPatterns.set(elementId, pattern);
    }

    if (action === 'click') {
      pattern.clicks++;
    } else if (action === 'hover' && duration) {
      pattern.hoverTime += duration;
    }

    pattern.lastUsed = Date.now();
    this.saveState();
  }

  /**
   * Record that a UI element was used in a trade
   */
  trackUIElementInTrade(elementId: string, wasProfitable: boolean) {
    const pattern = this.state.uiPatterns.get(elementId);
    if (!pattern) return;

    pattern.usedInTrades++;
    pattern.tradesWhenUsed.total++;
    if (wasProfitable) {
      pattern.tradesWhenUsed.profitable++;
    }

    // Generate suggestions
    if (pattern.tradesWhenUsed.total >= 5) {
      const winRate = pattern.tradesWhenUsed.profitable / pattern.tradesWhenUsed.total;

      if (winRate > 0.7) {
        pattern.suggestedImprovements.push(
          `This element has a ${Math.round(winRate * 100)}% win rate - consider making it more prominent`
        );
      } else if (winRate < 0.4 && pattern.clicks > 10) {
        pattern.suggestedImprovements.push(
          `This element correlates with losses - consider adding warning or hiding`
        );
      }
    }

    this.saveState();
  }

  /**
   * Get UI optimization suggestions
   */
  getUIOptimizations(): Array<{
    elementId: string;
    suggestion: string;
    priority: 'high' | 'medium' | 'low';
  }> {
    const optimizations: Array<{ elementId: string; suggestion: string; priority: 'high' | 'medium' | 'low' }> = [];

    for (const [elementId, pattern] of this.state.uiPatterns) {
      // High usage but low hover time - might be confusing
      if (pattern.clicks > 20 && pattern.hoverTime / pattern.clicks < 100) {
        optimizations.push({
          elementId,
          suggestion: 'High clicks but low hover time - users might be confused. Add tooltips.',
          priority: 'medium'
        });
      }

      // Never used elements
      if (Date.now() - pattern.lastUsed > 7 * 24 * 60 * 60 * 1000 && pattern.clicks < 5) {
        optimizations.push({
          elementId,
          suggestion: 'Rarely used - consider removing or relocating',
          priority: 'low'
        });
      }

      // Add custom suggestions
      for (const suggestion of pattern.suggestedImprovements) {
        optimizations.push({
          elementId,
          suggestion,
          priority: suggestion.includes('win rate') ? 'high' : 'medium'
        });
      }
    }

    return optimizations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  // ========================================================================
  // MARKET DATA DISCOVERY
  // ========================================================================

  /**
   * Score a market data source by its value
   */
  scoreMarketDataSource(source: MarketDataScore) {
    const valueScore =
      (source.predictivePower * 0.5) +
      ((1 - source.latency / 10000) * 0.2) +
      (source.reliability * 0.2) +
      ((1 - source.costPerCall / 100) * 0.1);

    this.state.dataScores.set(source.source, {
      ...source,
      valueScore
    });

    this.saveState();
  }

  /**
   * Get recommended data sources to add
   */
  getRecommendedDataSources(): string[] {
    // Return high-value sources that aren't being used
    const knownSources = [
      { name: 'coinbase-orderbook', latency: 100, reliability: 0.99, costPerCall: 0.001 },
      { name: 'binance-funding-rate', latency: 200, reliability: 0.98, costPerCall: 0 },
      { name: 'glasschain-onchain', latency: 5000, reliability: 0.95, costPerCall: 50 },
      { name: 'coinglass-liquidations', latency: 500, reliability: 0.97, costPerCall: 0.5 },
      { name: 'lunarcrush-social', latency: 1000, reliability: 0.85, costPerCall: 10 },
    ];

    return knownSources
      .filter(source => !this.state.dataScores.has(source.name))
      .map(source => source.name);
  }

  // ========================================================================
  // ANALYSIS & REPORTING
  // ========================================================================

  /**
   * Get feature importance analysis
   */
  getFeatureAnalysis(): Array<{
    name: string;
    accuracy: number;
    predictions: number;
    profitability: number;
    recommendation: string;
  }> {
    return Array.from(this.state.featureImportance.entries())
      .filter(([_, f]) => f.totalPredictions >= 5)
      .map(([name, feature]) => {
        const avgProfitability =
          (feature.profitabilityWhenCorrect * feature.correctPredictions +
           feature.profitabilityWhenWrong * (feature.totalPredictions - feature.correctPredictions)) /
          feature.totalPredictions;

        let recommendation = 'Keep using';
        if (feature.accuracy > 0.65) {
          recommendation = 'HIGH VALUE - Increase weight in decisions';
        } else if (feature.accuracy < 0.45) {
          recommendation = 'LOW VALUE - Consider removing or down-weighting';
        }

        return {
          name,
          accuracy: Math.round(feature.accuracy * 100) / 100,
          predictions: feature.totalPredictions,
          profitability: Math.round(avgProfitability * 100) / 100,
          recommendation
        };
      })
      .sort((a, b) => b.accuracy - a.accuracy);
  }

  /**
   * Get system performance report
   */
  getPerformanceReport(): {
    summary: string;
    accuracyTrend: string;
    topIndicators: string[];
    recommendations: string[];
  } {
    const recentAccuracy = this.calculateRecentAccuracy(10); // Last 10 predictions
    const overallAccuracy = this.state.statistics.overallAccuracy;

    let accuracyTrend = 'stable';
    if (recentAccuracy > overallAccuracy + 0.1) accuracyTrend = 'improving';
    if (recentAccuracy < overallAccuracy - 0.1) accuracyTrend = 'declining';

    const topIndicators = this.getFeatureAnalysis()
      .slice(0, 3)
      .map(f => f.name);

    const recommendations: string[] = [];

    // Generate recommendations based on analysis
    if (overallAccuracy < 0.5) {
      recommendations.push('Overall accuracy is below 50% - review indicator weights');
    }

    if (this.state.statistics.worstFeature) {
      const worst = this.state.featureImportance.get(this.state.statistics.worstFeature);
      if (worst && worst.accuracy < 0.45 && worst.totalPredictions > 20) {
        recommendations.push(`Consider removing ${this.state.statistics.worstFeature} - underperforming`);
      }
    }

    if (this.state.predictions.length < this.state.config.minPredictionsBeforeLearning) {
      recommendations.push(
        `Need ${this.state.config.minPredictionsBeforeLearning - this.state.predictions.length} more predictions before strategy generation`
      );
    }

    return {
      summary: `Overall accuracy: ${(overallAccuracy * 100).toFixed(1)}% (${this.state.statistics.totalPredictions} predictions)`,
      accuracyTrend,
      topIndicators,
      recommendations
    };
  }

  private calculateRecentAccuracy(n: number): number {
    const recent = this.state.predictions.slice(-n);
    if (recent.length === 0) return 0;

    const withOutcomes = recent.filter(p => p.outcome !== undefined);
    if (withOutcomes.length === 0) return 0;

    const correct = withOutcomes.filter(p => p.outcome?.wasCorrect).length;
    return correct / withOutcomes.length;
  }

  // ========================================================================
  // API FOR AUTONOMOUS OPERATION
  // ========================================================================

  /**
   * Get weighted indicator values for prediction
   * Returns indicators with adjusted weights based on historical performance
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
    reason: string;
  }> {
    return indicators.map(ind => {
      const feature = this.state.featureImportance.get(ind.name);

      if (!feature || feature.totalPredictions < 5) {
        return {
          ...ind,
          weight: 1.0,
          reason: 'Default weight - insufficient data'
        };
      }

      // Weight based on accuracy
      let weight = 1.0;
      if (feature.accuracy > 0.6) {
        weight = 1.5;
      } else if (feature.accuracy > 0.55) {
        weight = 1.2;
      } else if (feature.accuracy < 0.45) {
        weight = 0.5;
      }

      return {
        ...ind,
        weight,
        reason: `Historical accuracy: ${(feature.accuracy * 100).toFixed(0)}%`
      };
    });
  }

  /**
   * Start the autonomous improvement loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('🚀 Trading Improvement System started');

    // Periodic analysis every hour
    setInterval(() => {
      if (this.isRunning) {
        this.runAnalysisCycle();
      }
    }, 60 * 60 * 1000);
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Trading Improvement System stopped');
  }

  private runAnalysisCycle() {
    console.log('📊 Running analysis cycle...');

    // Update trend tracking for features
    for (const [name, feature] of this.state.featureImportance) {
      // Simple trend detection - could be more sophisticated
      const recentAccuracy = this.calculateRecentAccuracyForFeature(name, 10);
      if (recentAccuracy > feature.accuracy + 0.1) {
        feature.trend = 'improving';
      } else if (recentAccuracy < feature.accuracy - 0.1) {
        feature.trend = 'declining';
      } else {
        feature.trend = 'stable';
      }
    }

    this.saveState();
  }

  private calculateRecentAccuracyForFeature(featureName: string, n: number): number {
    const featurePredictions = this.state.predictions.filter(p =>
      p.indicatorsUsed.some(ind => ind.name === featureName) && p.outcome !== undefined
    );

    const recent = featurePredictions.slice(-n);
    if (recent.length === 0) return 0;

    const correct = recent.filter(p => {
      // Consider it correct if this feature's signal matched the outcome
      const feature = p.indicatorsUsed.find(ind => ind.name === featureName);
      return feature && p.outcome && (
        (feature.signal === 'bullish' && p.outcome.actualMove > 0) ||
        (feature.signal === 'bearish' && p.outcome.actualMove < 0)
      );
    }).length;

    return correct / recent.length;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      predictions: this.state.predictions.length,
      features: Array.from(this.state.featureImportance.entries()).map(([name, f]) => ({
        name,
        accuracy: f.accuracy,
        predictions: f.totalPredictions
      })),
      strategies: this.state.strategies.length,
      overallAccuracy: this.state.statistics.overallAccuracy
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: TradingImprovementSystem | null = null;

export function getTradingImprovementSystem(): TradingImprovementSystem {
  if (!instance) {
    instance = new TradingImprovementSystem();
    instance.start();
  }
  return instance;
}
