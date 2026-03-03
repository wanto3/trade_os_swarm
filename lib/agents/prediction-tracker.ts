/**
 * Prediction Tracker - Automatically tracks trading predictions and outcomes
 *
 * This service:
 * 1. Records all trading predictions with their indicators
 * 2. Monitors price movements to determine outcomes
 * 3. Automatically scores the accuracy of predictions
 * 4. Feeds data to the TradingImprovementSystem
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface PendingPrediction {
  id: string;
  timestamp: number;
  symbol: string;
  predictedPrice: number;
  predictedAction: 'LONG' | 'SHORT' | 'WAIT';
  predictedMove: number; // Expected percentage move
  confidence: number;
  indicators: Array<{
    name: string;
    value: number;
    signal: string;
  }>;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  resolved: boolean;
  outcome?: {
    actualAction: 'LONG' | 'SHORT' | 'WAIT';
    maxProfit: number;
    maxLoss: number;
    actualMove: number;
    wasCorrect: boolean;
    confidenceMatch: number;
  };
}

const PREDICTIONS_FILE = join(process.cwd(), 'data', 'pending-predictions.json');

class PredictionTracker {
  private predictions: PendingPrediction[] = [];

  constructor() {
    this.loadPredictions();
    this.startOutcomeChecker();
  }

  private loadPredictions() {
    try {
      if (existsSync(PREDICTIONS_FILE)) {
        const data = readFileSync(PREDICTIONS_FILE, 'utf-8');
        this.predictions = JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load predictions:', e);
      this.predictions = [];
    }
  }

  private savePredictions() {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      writeFileSync(PREDICTIONS_FILE, JSON.stringify(this.predictions, null, 2));
    } catch (e) {
      console.error('Failed to save predictions:', e);
    }
  }

  /**
   * Record a new prediction
   */
  recordPrediction(params: {
    symbol: string;
    currentPrice: number;
    predictedAction: 'LONG' | 'SHORT' | 'WAIT';
    confidence: number;
    indicators: Array<{
      name: string;
      value: number;
      signal: string;
    }>;
    stopLoss?: number;
    takeProfit?: number;
  }): string {
    const prediction: PendingPrediction = {
      id: `pred-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      symbol: params.symbol,
      predictedPrice: params.currentPrice,
      predictedAction: params.predictedAction,
      predictedMove: params.predictedAction === 'LONG' ? 0.02 : params.predictedAction === 'SHORT' ? -0.02 : 0,
      confidence: params.confidence,
      indicators: params.indicators,
      entryPrice: params.currentPrice,
      stopLoss: params.stopLoss,
      takeProfit: params.takeProfit,
      resolved: false
    };

    this.predictions.push(prediction);
    this.savePredictions();

    return prediction.id;
  }

  /**
   * Update with current prices and check for outcomes
   */
  async updateWithCurrentPrice(symbol: string, currentPrice: number) {
    const now = Date.now();
    const resolutionWindow = 4 * 60 * 60 * 1000; // 4 hours

    for (const prediction of this.predictions) {
      if (prediction.symbol !== symbol || prediction.resolved) continue;

      const timeSincePrediction = now - prediction.timestamp;

      // Skip if too recent
      if (timeSincePrediction < resolutionWindow / 4) continue;

      // Calculate outcome
      const priceMove = (currentPrice - prediction.entryPrice) / prediction.entryPrice;
      const maxProfit = Math.max(0, prediction.predictedAction === 'LONG' ? priceMove : -priceMove);
      const maxLoss = Math.min(0, prediction.predictedAction === 'LONG' ? priceMove : -priceMove);

      // Determine if prediction was correct
      let wasCorrect = false;
      if (prediction.predictedAction === 'LONG' && priceMove > 0.005) wasCorrect = true;
      if (prediction.predictedAction === 'SHORT' && priceMove < -0.005) wasCorrect = true;
      if (prediction.predictedAction === 'WAIT' && Math.abs(priceMove) < 0.01) wasCorrect = true;

      // Check if stop loss or take profit was hit
      let stopLossHit = false;
      let takeProfitHit = false;

      if (prediction.stopLoss) {
        if (prediction.predictedAction === 'LONG' && currentPrice <= prediction.stopLoss) stopLossHit = true;
        if (prediction.predictedAction === 'SHORT' && currentPrice >= prediction.stopLoss) stopLossHit = true;
      }

      if (prediction.takeProfit) {
        if (prediction.predictedAction === 'LONG' && currentPrice >= prediction.takeProfit) takeProfitHit = true;
        if (prediction.predictedAction === 'SHORT' && currentPrice <= prediction.takeProfit) takeProfitHit = true;
      }

      // Resolve if:
      // 1. Take profit hit
      // 2. Stop loss hit
      // 3. Time window expired
      const shouldResolve = takeProfitHit || stopLossHit || timeSincePrediction >= resolutionWindow;

      if (shouldResolve) {
        prediction.resolved = true;
        prediction.outcome = {
          actualAction: priceMove > 0.01 ? 'LONG' : priceMove < -0.01 ? 'SHORT' : 'WAIT',
          maxProfit: maxProfit * 100,
          maxLoss: maxLoss * 100,
          actualMove: priceMove * 100,
          wasCorrect,
          confidenceMatch: wasCorrect ? prediction.confidence : 100 - prediction.confidence
        };

        // Send to improvement system
        await this.sendOutcomeToSystem(prediction);

        this.savePredictions();
      }
    }

    // Clean up old predictions
    this.cleanupOldPredictions();
  }

  /**
   * Send outcome to the trading improvement system
   */
  private async sendOutcomeToSystem(prediction: PendingPrediction) {
    if (!prediction.outcome) return;

    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/improvement?action=outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          predictionId: prediction.id,
          outcome: prediction.outcome
        })
      });
    } catch (e) {
      console.error('Failed to send outcome:', e);
    }
  }

  private cleanupOldPredictions() {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.predictions = this.predictions.filter(p => p.timestamp > oneWeekAgo || !p.resolved);
    this.savePredictions();
  }

  /**
   * Start periodic outcome checking
   */
  private startOutcomeChecker() {
    setInterval(() => {
      this.checkOutcomes();
    }, 60 * 1000); // Every minute
  }

  private async checkOutcomes() {
    // This would be called with actual current prices
    // For now, it's a placeholder for when market data updates
  }

  /**
   * Get prediction statistics
   */
  getStatistics() {
    const resolved = this.predictions.filter(p => p.resolved && p.outcome);
    const correct = resolved.filter(p => p.outcome?.wasCorrect);

    return {
      total: this.predictions.length,
      resolved: resolved.length,
      pending: this.predictions.filter(p => !p.resolved).length,
      correct: correct.length,
      accuracy: resolved.length > 0 ? correct.length / resolved.length : 0,
      avgProfit: resolved.length > 0
        ? resolved.reduce((sum, p) => sum + (p.outcome?.maxProfit || 0), 0) / resolved.length
        : 0
    };
  }

  /**
   * Get recent predictions
   */
  getRecentPredictions(limit: number = 10) {
    return this.predictions
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }
}

// Singleton
let trackerInstance: PredictionTracker | null = null;

export function getPredictionTracker(): PredictionTracker {
  if (!trackerInstance) {
    trackerInstance = new PredictionTracker();
  }
  return trackerInstance;
}
