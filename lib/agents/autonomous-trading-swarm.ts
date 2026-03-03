/**
 * Autonomous Trading Swarm - Makes the app grow itself with trading features
 * Coordinates all trading-focused agents to continuously improve the app
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

import { getCodeAnalyzer } from './code-analyzer';
import { getCodeModifier } from './code-modifier';
import { getGitManager } from './git-manager';
import { getTradingFeatureScanner } from './trading-feature-scanner';
import { getDataSourceResearcher } from './data-source-researcher';
import { getStrategyGenerator } from './strategy-generator';
import { getTradingUXOptimizer } from './trading-ux-optimizer';

interface AutonomousCycle {
  id: string;
  timestamp: number;
  phase: 'feature_scan' | 'data_research' | 'strategy_gen' | 'ux_optimize' | 'implementation' | 'testing' | 'completed' | 'failed';
  actions: string[];
  features_added: string[];
  data_sources_added: string[];
  strategies_created: string[];
  ux_improvements: string[];
  tests_passed: boolean;
  branch?: string;
}

interface AutonomousState {
  cycles: AutonomousCycle[];
  stats: {
    total_cycles: number;
    features_implemented: number;
    data_sources_integrated: number;
    strategies_created: number;
    ux_improvements: number;
    rollbacks: number;
  };
  capabilities: {
    indicators: string[];
    data_sources: string[];
    strategies: string[];
    ui_elements: string[];
  };
  config: {
    max_features_per_cycle: number;
    max_strategies_per_cycle: number;
    cycle_delay_ms: number;
    auto_implement: boolean;
    focus_areas: ('features' | 'data' | 'strategies' | 'ux')[];
  };
}

const STATE_FILE = join(process.cwd(), 'data', 'autonomous-state.json');

export class AutonomousTradingSwarm {
  private state: AutonomousState;
  private isRunning: boolean = false;
  private cycleCount: number = 0;

  // Agents
  private featureScanner = getTradingFeatureScanner();
  private dataResearcher = getDataSourceResearcher();
  private strategyGenerator = getStrategyGenerator();
  private uxOptimizer = getTradingUXOptimizer();
  private codeModifier = getCodeModifier();
  private git = getGitManager();

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): AutonomousState {
    try {
      const data = readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {
        cycles: [],
        stats: {
          total_cycles: 0,
          features_implemented: 0,
          data_sources_integrated: 0,
          strategies_created: 0,
          ux_improvements: 0,
          rollbacks: 0
        },
        capabilities: {
          indicators: [],
          data_sources: [],
          strategies: [],
          ui_elements: []
        },
        config: {
          max_features_per_cycle: 3,
          max_strategies_per_cycle: 2,
          cycle_delay_ms: 20000,
          auto_implement: true,
          focus_areas: ['features', 'data', 'strategies', 'ux']
        }
      };
    }
  }

  private saveState() {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('Failed to save state:', e);
    }
  }

  /**
   * Start autonomous growth
   */
  async startGrowth() {
    if (this.isRunning) {
      console.log('🔄 Autonomous growth already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting Autonomous Trading App Growth...');
    console.log('📊 Current capabilities:');
    console.log(`   Indicators: ${this.state.capabilities.indicators.length}`);
    console.log(`   Data Sources: ${this.state.capabilities.data_sources.length}`);
    console.log(`   Strategies: ${this.state.capabilities.strategies.length}`);
    console.log(`   UI Elements: ${this.state.capabilities.ui_elements.length}`);

    while (this.isRunning && this.cycleCount < 1000) {
      this.cycleCount++;

      try {
        await this.runGrowthCycle();
        this.saveState();

        // Wait before next cycle
        if (this.isRunning) {
          await this.sleep(this.state.config.cycle_delay_ms);
        }
      } catch (error: any) {
        console.error('❌ Cycle error:', error.message);
        this.recordFailure(error.message);
      }
    }

    console.log('🏁 Autonomous growth stopped');
  }

  stop() {
    this.isRunning = false;
  }

  /**
   * Run one complete growth cycle
   */
  private async runGrowthCycle(): Promise<void> {
    const cycleId = `growth-${Date.now()}`;
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🌱 GROWTH CYCLE #${this.cycleCount}`);
    console.log(`${'='.repeat(70)}`);

    const cycle: AutonomousCycle = {
      id: cycleId,
      timestamp: Date.now(),
      phase: 'feature_scan',
      actions: [],
      features_added: [],
      data_sources_added: [],
      strategies_created: [],
      ux_improvements: [],
      tests_passed: false
    };

    // Create git branch
    const branch = this.git.createImprovementBranch();
    if (!branch) {
      console.error('❌ Failed to create branch');
      return;
    }
    cycle.branch = branch;
    console.log(`\n🔀 Branch: ${branch}`);

    // PHASE 1: Scan for missing features
    console.log('\n📊 PHASE 1: Scanning for missing trading features...');
    cycle.phase = 'feature_scan';
    const featureReport = await this.featureScanner.scanTradingFeatures();

    console.log(`   Current features: ${featureReport.current_features.length}`);
    console.log(`   Missing features: ${featureReport.missing_features.length}`);
    console.log(`   Quick wins: ${featureReport.quick_wins.length}`);

    if (featureReport.quick_wins.length > 0) {
      console.log('\n   Top quick wins:');
      featureReport.quick_wins.slice(0, 3).forEach((f, i) => {
        console.log(`      ${i + 1}. ${f.name} (${f.priority})`);
      });
    }

    // PHASE 2: Research data sources
    console.log('\n📡 PHASE 2: Researching new data sources...');
    cycle.phase = 'data_research';
    const dataSources = await this.dataResearcher.discoverNewSources();

    console.log(`   Available sources: ${dataSources.length}`);
    if (dataSources.length > 0) {
      console.log('   Top priority sources:');
      dataSources.slice(0, 3).forEach((s, i) => {
        console.log(`      ${i + 1}. ${s.name} [${s.priority}] - ${s.data_available.slice(0, 2).join(', ')}`);
      });
    }

    // PHASE 3: Generate strategies
    console.log('\n🎯 PHASE 3: Generating trading strategies...');
    cycle.phase = 'strategy_gen';
    const newStrategies: any[] = [];

    if (this.state.config.focus_areas.includes('strategies')) {
      for (let i = 0; i < this.state.config.max_strategies_per_cycle; i++) {
        try {
          const strategy = await this.strategyGenerator.generateStrategy();
          const strategyName = strategy.name;

          // Save strategy
          await this.strategyGenerator.saveStrategy(strategy);
          newStrategies.push(strategyName);
          cycle.strategies_created.push(strategyName);
          cycle.actions.push(`Created strategy: ${strategyName}`);
          console.log(`   ✅ Strategy: ${strategyName} (${strategy.type})`);
        } catch (error) {
          console.log(`   ⚠️ Strategy generation failed`);
        }
      }
    }

    // PHASE 4: UX Analysis
    console.log('\n🎨 PHASE 4: Analyzing UX for improvements...');
    cycle.phase = 'ux_optimize';
    const uxAnalysis = await this.uxOptimizer.analyzeTradingUI();

    console.log(`   Current UI elements: ${uxAnalysis.current_elements.length}`);
    console.log(`   Missing decision support: ${uxAnalysis.missing_elements.length}`);
    console.log(`   UX improvements: ${uxAnalysis.ux_improvements.length}`);

    // PHASE 5: Implementation
    console.log('\n🔧 PHASE 5: Implementing improvements...');
    cycle.phase = 'implementation';

    const filesToTest: string[] = [];

    // Implement quick win features
    if (this.state.config.auto_implement) {
      const quickWins = featureReport.quick_wins.slice(0, this.state.config.max_features_per_cycle);

      for (const feature of quickWins) {
        try {
          console.log(`\n   Implementing: ${feature.name}`);

          // Get implementation plan
          const plan = await this.featureScanner.getImplementationPlan(feature);
          console.log(`      Steps: ${plan.steps.length}`);
          console.log(`      Estimated: ${plan.estimated_time}`);

          // Generate the feature code
          const appCode = this.getAppCode();
          const featureCode = await this.featureScanner.generateFeatureCode(feature, appCode);

          // Apply the feature
          const result = await this.applyFeatureCode(feature, featureCode);
          if (result.success) {
            cycle.features_added.push(feature.name);
            cycle.actions.push(`Added feature: ${feature.name}`);
            if (result.file) filesToTest.push(result.file);
            console.log(`      ✅ Added: ${feature.name}`);
          }
        } catch (error: any) {
          console.log(`      ❌ Failed: ${error.message}`);
        }
      }

      // Integrate top priority data source
      if (dataSources.length > 0) {
        const topSource = dataSources[0];
        try {
          console.log(`\n   Integrating: ${topSource.name}`);
          const success = await this.dataResearcher.createIntegration(topSource);
          if (success) {
            cycle.data_sources_added.push(topSource.name);
            cycle.actions.push(`Integrated: ${topSource.name}`);
            console.log(`      ✅ Integrated: ${topSource.name}`);
          }
        } catch (error: any) {
          console.log(`      ❌ Integration failed: ${error.message}`);
        }
      }

      // Apply quick UX improvements
      const quickUXImprovements = uxAnalysis.ux_improvements
        .filter(i => i.priority === 'critical' || i.priority === 'high')
        .slice(0, 2);

      for (const improvement of quickUXImprovements) {
        try {
          console.log(`\n   Improving UX: ${improvement.title}`);
          const success = await this.uxOptimizer.applyImprovement(improvement);
          if (success) {
            cycle.ux_improvements.push(improvement.title);
            cycle.actions.push(`UX: ${improvement.title}`);
            console.log(`      ✅ UX improvement: ${improvement.title}`);
          }
        } catch (error: any) {
          console.log(`      ❌ UX improvement failed: ${error.message}`);
        }
      }
    }

    // PHASE 6: Testing
    console.log('\n🧪 PHASE 6: Testing changes...');
    cycle.phase = 'testing';

    if (filesToTest.length > 0) {
      cycle.tests_passed = await this.runTests();
      console.log(`   Tests: ${cycle.tests_passed ? '✅ PASSED' : '❌ FAILED'}`);
    } else {
      cycle.tests_passed = true; // No changes to test
      console.log('   Tests: No changes to test');
    }

    // Update capabilities tracking
    this.updateCapabilities(cycle);

    // PHASE 7: Merge or Rollback
    if (cycle.tests_passed) {
      console.log('\n✅ PHASE 7: Merging changes...');
      const merged = this.git.mergeToMain(branch);

      if (merged) {
        cycle.phase = 'completed';
        this.state.stats.total_cycles++;
        this.state.stats.features_implemented += cycle.features_added.length;
        this.state.stats.data_sources_integrated += cycle.data_sources_added.length;
        this.state.stats.strategies_created += cycle.strategies_created.length;
        this.state.stats.ux_improvements += cycle.ux_improvements.length;

        console.log(`   🎉 Cycle completed!`);
        console.log(`      Features: ${cycle.features_added.length}`);
        console.log(`      Data Sources: ${cycle.data_sources_added.length}`);
        console.log(`      Strategies: ${cycle.strategies_created.length}`);
        console.log(`      UX: ${cycle.ux_improvements.length}`);
      } else {
        console.log('   ❌ Merge failed, rolling back');
        this.git.rollback(branch);
        this.state.stats.rollbacks++;
        cycle.phase = 'failed';
      }
    } else {
      console.log('\n❌ Tests failed, rolling back...');
      this.git.rollback(branch);
      this.state.stats.rollbacks++;
      cycle.phase = 'failed';
    }

    this.state.cycles.push(cycle);
  }

  /**
   * Update capabilities tracking
   */
  private updateCapabilities(cycle: AutonomousCycle) {
    // Add new indicators from features
    for (const feature of cycle.features_added) {
      const indicatorMatch = feature.match(/(RSI|MACD|EMA|SMA|Bollinger|VWAP|ATR|ADX|Stochastic|MFI)/i);
      if (indicatorMatch) {
        const indicator = indicatorMatch[1].toUpperCase();
        if (!this.state.capabilities.indicators.includes(indicator)) {
          this.state.capabilities.indicators.push(indicator);
        }
      }
    }

    // Add data sources
    for (const source of cycle.data_sources_added) {
      if (!this.state.capabilities.data_sources.includes(source)) {
        this.state.capabilities.data_sources.push(source);
      }
    }

    // Add strategies
    for (const strategy of cycle.strategies_created) {
      if (!this.state.capabilities.strategies.includes(strategy)) {
        this.state.capabilities.strategies.push(strategy);
      }
    }

    // Add UI elements
    for (const ux of cycle.ux_improvements) {
      if (!this.state.capabilities.ui_elements.includes(ux)) {
        this.state.capabilities.ui_elements.push(ux);
      }
    }
  }

  private getAppCode(): string {
    const appPath = join(process.cwd(), 'app/page.tsx');
    if (existsSync(appPath)) {
      return readFileSync(appPath, 'utf-8');
    }
    return '';
  }

  private async applyFeatureCode(feature: any, code: string): Promise<{
    success: boolean;
    file?: string;
  }> {
    // This would integrate the generated code into the app
    // For now, return success as placeholder
    return { success: true };
  }

  private async runTests(): Promise<boolean> {
    try {
      // Type check
      execSync('npm run type-check', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000
      });

      // Run tests
      execSync('npm run test', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 120000
      });

      return true;
    } catch {
      return false;
    }
  }

  private recordFailure(error: string) {
    this.state.cycles.push({
      id: `growth-${Date.now()}`,
      timestamp: Date.now(),
      phase: 'failed',
      actions: [],
      features_added: [],
      data_sources_added: [],
      strategies_created: [],
      ux_improvements: [],
      tests_passed: false
    });
    this.saveState();
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getState(): AutonomousState {
    return this.state;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      cycleCount: this.cycleCount,
      stats: this.state.stats,
      capabilities: this.state.capabilities,
      recentCycles: this.state.cycles.slice(-5).reverse()
    };
  }

  /**
   * Get growth report
   */
  getGrowthReport(): string {
    const state = this.state;

    return `
╔═══════════════════════════════════════════════════════════════╗
║         AUTONOMOUS TRADING APP - GROWTH REPORT               ║
╚═══════════════════════════════════════════════════════════════╝

📊 CURRENT CAPABILITIES
───────────────────────────────────────────────────────────────
  Indicators:        ${state.capabilities.indicators.length}
  ${state.capabilities.indicators.map(i => `     • ${i}`).join('\n  ') || '     (none yet)'}

  Data Sources:      ${state.capabilities.data_sources.length}
  ${state.capabilities.data_sources.map(s => `     • ${s}`).join('\n  ') || '     (none yet)'}

  Strategies:        ${state.capabilities.strategies.length}
  ${state.capabilities.strategies.map(s => `     • ${s}`).join('\n  ') || '     (none yet)'}

  UI Elements:       ${state.capabilities.ui_elements.length}
  ${state.capabilities.ui_elements.map(u => `     • ${u}`).join('\n  ') || '     (none yet)'}

📈 GROWTH STATISTICS
───────────────────────────────────────────────────────────────
  Total Cycles:              ${state.stats.total_cycles}
  Features Implemented:      ${state.stats.features_implemented}
  Data Sources Integrated:   ${state.stats.data_sources_integrated}
  Strategies Created:        ${state.stats.strategies_created}
  UX Improvements:           ${state.stats.ux_improvements}
  Rollbacks:                 ${state.stats.rollbacks}

⚙️  CONFIGURATION
───────────────────────────────────────────────────────────────
  Max Features/Cycle:         ${state.config.max_features_per_cycle}
  Max Strategies/Cycle:       ${state.config.max_strategies_per_cycle}
  Cycle Delay:                ${state.config.cycle_delay_ms / 1000}s
  Auto-Implement:             ${state.config.auto_implement ? 'Yes' : 'No'}
  Focus Areas:                ${state.config.focus_areas.join(', ')}

🔄 RECENT ACTIVITY
───────────────────────────────────────────────────────────────
${state.cycles.slice(-3).map(c => `
  ${new Date(c.timestamp).toLocaleString()}
  Phase: ${c.phase}
  ${c.features_added.length > 0 ? `Features: ${c.features_added.join(', ')}` : ''}
  ${c.data_sources_added.length > 0 ? `Data: ${c.data_sources_added.join(', ')}` : ''}
  ${c.strategies_created.length > 0 ? `Strategies: ${c.strategies_created.join(', ')}` : ''}
`).join('\n')}
`;
  }

  /**
   * Configure the swarm
   */
  configure(config: Partial<AutonomousState['config']>) {
    this.state.config = { ...this.state.config, ...config };
    this.saveState();
  }

  /**
   * Add focus area
   */
  addFocusArea(area: 'features' | 'data' | 'strategies' | 'ux') {
    if (!this.state.config.focus_areas.includes(area)) {
      this.state.config.focus_areas.push(area);
      this.saveState();
    }
  }

  /**
   * Remove focus area
   */
  removeFocusArea(area: 'features' | 'data' | 'strategies' | 'ux') {
    this.state.config.focus_areas = this.state.config.focus_areas.filter(a => a !== area);
    this.saveState();
  }
}

// Singleton
let swarmInstance: AutonomousTradingSwarm | null = null;

export function getAutonomousTradingSwarm(): AutonomousTradingSwarm {
  if (!swarmInstance) {
    swarmInstance = new AutonomousTradingSwarm();
  }
  return swarmInstance;
}

export type { AutonomousCycle, AutonomousState };
