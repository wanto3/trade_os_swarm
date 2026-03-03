/**
 * Recursive Autonomous Agent System
 * Agents that continuously analyze, improve, and test the app
 *
 * This is the core orchestrator that coordinates:
 * - Vision Agent: Analyzes code and finds improvements
 * - LLM: Generates fixes and features
 * - Code Modifier: Applies changes safely
 * - Git Manager: Handles branches and rollback
 * - Testing: Validates changes
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getCodeAnalyzer } from './code-analyzer';
import { getCodeModifier } from './code-modifier';
import { getGitManager } from './git-manager';
import { getLLMClient } from '../ai/llm-client';
import { AGENT_PROMPTS } from '../ai/prompts';

interface ImprovementCycle {
  id: string;
  agent: string;
  phase: 'analyzing' | 'implementing' | 'testing' | 'completed' | 'failed';
  finding: string;
  changes: string[];
  testsPassed: boolean;
  timestamp: number;
  branch?: string;
  error?: string;
}

interface RecursiveState {
  cycles: ImprovementCycle[];
  currentIteration: number;
  lastImprovement: number;
  stats: {
    totalImprovements: number;
    successfulTests: number;
    failedTests: number;
    filesModified: string[];
    rollbacks: number;
  };
  config: {
    maxCyclesPerDay: number;
    maxChangesPerCycle: number;
    cycleDelayMs: number;
    enabledAgentTypes: string[];
    blacklistedFiles: string[];
  };
}

// State storage
const STATE_FILE = join(process.cwd(), 'data', 'recursive-state.json');

export class RecursiveAgentSwarm {
  private state: RecursiveState;
  private isRunning: boolean = false;
  private iterationCount: number = 0;
  private maxIterations: number = 100;

  // Agent instances
  private analyzer = getCodeAnalyzer();
  private modifier = getCodeModifier();
  private git = getGitManager();
  private llm = getLLMClient();

  constructor(config?: Partial<RecursiveState['config']>) {
    this.state = this.loadState();

    // Update config if provided
    if (config) {
      this.state.config = { ...this.state.config, ...config };
    }
  }

  private loadState(): RecursiveState {
    try {
      const data = readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(data);
    } catch {
      return {
        cycles: [],
        currentIteration: 0,
        lastImprovement: Date.now(),
        stats: {
          totalImprovements: 0,
          successfulTests: 0,
          failedTests: 0,
          filesModified: [],
          rollbacks: 0
        },
        config: {
          maxCyclesPerDay: 10,
          maxChangesPerCycle: 3,
          cycleDelayMs: 30000,
          enabledAgentTypes: ['vision', 'frontend', 'backend', 'research', 'testing'],
          blacklistedFiles: [
            'lib/agents/recursive-swarm.ts',
            'lib/agents/code-modifier.ts',
            'lib/agents/git-manager.ts',
            'package.json',
            'tsconfig.json',
            'next.config.js'
          ]
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
   * Start the recursive improvement loop
   */
  async startRecursiveImprovement() {
    if (this.isRunning) {
      console.log('🔄 Recursive improvement already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting recursive autonomous improvement...');
    console.log(`📊 Current iteration: ${this.state.currentIteration}`);
    console.log(`✅ Total improvements so far: ${this.state.stats.totalImprovements}`);
    console.log(`🔧 Max cycles per day: ${this.state.config.maxCyclesPerDay}`);
    console.log(`📋 Max changes per cycle: ${this.state.config.maxChangesPerCycle}`);

    // Check daily cycle limit
    if (this.exceededDailyLimit()) {
      console.log('⏸️ Daily cycle limit reached. Will resume tomorrow.');
      this.isRunning = false;
      return;
    }

    // Run improvement cycles
    while (this.isRunning && this.iterationCount < this.maxIterations) {
      this.iterationCount++;

      try {
        await this.runImprovementCycle();

        // Save state after each cycle
        this.saveState();

        // Wait before next cycle
        if (this.isRunning) {
          await this.sleep(this.state.config.cycleDelayMs);
        }

        // Check daily limit
        if (this.exceededDailyLimit()) {
          console.log('⏸️ Daily cycle limit reached. Pausing until tomorrow.');
          this.isRunning = false;
        }
      } catch (error: any) {
        console.error('❌ Cycle error:', error);

        this.state.cycles.push({
          id: `cycle-${Date.now()}`,
          agent: 'system',
          phase: 'failed',
          finding: error.message || String(error),
          changes: [],
          testsPassed: false,
          timestamp: Date.now()
        });
        this.saveState();
      }
    }

    console.log('🏁 Recursive improvement stopped');
    console.log(`📊 Final stats: ${this.state.stats.totalImprovements} improvements made`);
    console.log(`📁 Files modified: ${this.state.stats.filesModified.length}`);
    console.log(`🔙 Rollbacks performed: ${this.state.stats.rollbacks}`);
  }

  stop() {
    console.log('🛑 Stopping recursive improvement...');
    this.isRunning = false;
  }

  /**
   * Run a single improvement cycle
   */
  private async runImprovementCycle() {
    const cycleId = `cycle-${Date.now()}`;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 Starting improvement cycle #${this.iterationCount}`);
    console.log(`${'='.repeat(60)}`);

    // PHASE 1: Analyze - Find improvements
    console.log('\n📊 PHASE 1: Analyzing code for improvements...');
    const findings = await this.analyzeForImprovements();

    if (findings.length === 0) {
      console.log('✨ No immediate improvements found - app is optimal!');
      return;
    }

    // Filter out blacklisted files
    const filteredFindings = findings.filter(
      f => !this.state.config.blacklistedFiles.some(blacklisted => f.file.includes(blacklisted))
    );

    if (filteredFindings.length === 0) {
      console.log('⏭️ All findings are in blacklisted files');
      return;
    }

    // Pick top priority improvements (limit by maxChangesPerCycle)
    const improvements = filteredFindings.slice(0, this.state.config.maxChangesPerCycle);
    console.log(`💡 Found ${improvements.length} improvements to implement:`);
    improvements.forEach((imp, i) => {
      console.log(`   ${i + 1}. [${imp.severity.toUpperCase()}] ${imp.title} (${imp.file})`);
    });

    // PHASE 2: Create git branch
    console.log('\n🔀 PHASE 2: Creating git branch...');
    const branch = this.git.createImprovementBranch();
    if (!branch) {
      console.error('❌ Failed to create git branch. Skipping cycle.');
      return;
    }
    console.log(`✅ Branch created: ${branch}`);

    const modifiedFiles: string[] = [];
    const successfulImprovements: string[] = [];

    // PHASE 3: Implement changes
    console.log('\n🔧 PHASE 3: Implementing improvements...');
    for (const improvement of improvements) {
      console.log(`\n   Working on: ${improvement.title}`);

      try {
        const result = await this.implementImprovement(improvement);

        if (result.success) {
          modifiedFiles.push(result.file);
          successfulImprovements.push(improvement.title);
          console.log(`   ✅ Applied: ${improvement.title}`);
        } else {
          console.log(`   ⚠️ Skipped: ${improvement.title} - ${result.error}`);
        }
      } catch (error: any) {
        console.log(`   ❌ Failed: ${improvement.title} - ${error.message}`);
      }
    }

    if (modifiedFiles.length === 0) {
      console.log('\n⚠️ No changes were applied. Cleaning up branch.');
      this.git.rollback(branch);
      return;
    }

    // PHASE 4: Test changes
    console.log('\n🧪 PHASE 4: Testing changes...');
    const testsPassed = await this.testImprovement(modifiedFiles);

    // Record the cycle
    const cycle: ImprovementCycle = {
      id: cycleId,
      agent: 'Recursive Swarm',
      phase: testsPassed ? 'completed' : 'failed',
      finding: `Implemented ${successfulImprovements.length} improvements`,
      changes: modifiedFiles,
      testsPassed,
      timestamp: Date.now(),
      branch
    };

    this.state.cycles.push(cycle);
    this.state.currentIteration++;

    if (testsPassed) {
      // PHASE 5: Merge to main
      console.log('\n✅ PHASE 5: All tests passed! Merging to main...');
      const merged = this.git.mergeToMain(branch);

      if (merged) {
        this.state.stats.totalImprovements++;
        this.state.stats.successfulTests++;
        this.state.lastImprovement = Date.now();

        // Track modified files
        modifiedFiles.forEach(file => {
          if (!this.state.stats.filesModified.includes(file)) {
            this.state.stats.filesModified.push(file);
          }
        });

        console.log(`🎉 Improvement #${this.state.stats.totalImprovements} completed and merged!`);
        console.log(`   Files modified: ${modifiedFiles.join(', ')}`);
      } else {
        console.log('❌ Merge failed. Rolling back.');
        this.git.rollback(branch);
        this.state.stats.rollbacks++;
      }
    } else {
      console.log('\n❌ Tests failed. Rolling back changes...');
      await this.rollbackChanges(branch, modifiedFiles);
      this.state.stats.failedTests++;
      this.state.stats.rollbacks++;
    }
  }

  /**
   * Analyze codebase for improvements
   */
  private async analyzeForImprovements(): Promise<Array<{
    title: string;
    description: string;
    file: string;
    severity: string;
    type: string;
    suggestedFix?: string;
  }>> {
    const improvements: any[] = [];

    try {
      // Scan project for issues
      const results = await this.analyzer.scanProject(['app', 'components', 'lib']);

      for (const result of results) {
        for (const issue of result.issues) {
          // Skip low severity issues for now
          if (issue.severity === 'low') continue;

          improvements.push({
            title: issue.title,
            description: issue.description,
            file: result.file,
            severity: issue.severity,
            type: issue.type,
            suggestedFix: issue.suggestedFix
          });
        }
      }

      // Also use LLM to suggest strategic improvements
      try {
        const strategicSuggestions = await this.generateStrategicImprovements();
        improvements.push(...strategicSuggestions);
      } catch {
        // LLM might not be available, continue with static analysis
      }

    } catch (error: any) {
      console.error('Analysis error:', error.message);
    }

    // Sort by severity
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    improvements.sort((a, b) =>
      (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99)
    );

    return improvements;
  }

  /**
   * Generate strategic improvements using LLM
   */
  private async generateStrategicImprovements(): Promise<any[]> {
    const improvements: any[] = [];

    // Analyze the main app page for feature suggestions
    try {
      const appPagePath = join(process.cwd(), 'app/page.tsx');
      if (existsSync(appPagePath)) {
        const content = readFileSync(appPagePath, 'utf-8');

        const prompt = `You are analyzing a crypto trading dashboard app.
Suggest 2-3 high-impact improvements that would help traders make better decisions.

Current app has:
- Real-time price display for BTC/ETH
- Technical indicators (RSI, MACD, EMA, ADX, etc.)
- Position management
- Account settings

Consider: missing indicators, UX improvements, decision support tools.

Return JSON only: [{"title": "...", "description": "...", "severity": "high|medium", "file": "app/page.tsx"}]`;

        const response = await this.llm.generate([
          { role: 'user', content: prompt + '\n\nApp code:\n' + content.substring(0, 8000) }
        ], '');

        try {
          const parsed = JSON.parse(response.content);
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              improvements.push({
                title: item.title,
                description: item.description,
                file: item.file || 'app/page.tsx',
                severity: item.severity || 'medium',
                type: 'feature',
                suggestedFix: item.description
              });
            }
          }
        } catch {
          // Parse failed, skip LLM suggestions
        }
      }
    } catch {
      // App page analysis failed
    }

    return improvements;
  }

  /**
   * Implement a single improvement
   */
  private async implementImprovement(improvement: any): Promise<{
    success: boolean;
    file: string;
    error?: string;
  }> {
    try {
      const result = await this.modifier.applyFix(improvement);
      return {
        success: result.success,
        file: result.file,
        error: result.error
      };
    } catch (error: any) {
      return {
        success: false,
        file: improvement.file,
        error: error.message
      };
    }
  }

  /**
   * Test improvements by running the test suite
   */
  private async testImprovement(changes: string[]): Promise<boolean> {
    console.log(`   Running tests for ${changes.length} changed files...`);

    try {
      // First, type check
      console.log('   ▶ Type checking...');
      execSync('npm run type-check', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000
      });

      // Then run tests
      console.log('   ▶ Running unit tests...');
      execSync('npm run test', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 120000
      });

      console.log('   ✅ All tests passed!');
      return true;
    } catch (error: any) {
      const output = error.stdout?.toString() || error.stderr?.toString() || '';
      console.log('   ❌ Tests failed:');
      console.log('   ', output.split('\n').slice(0, 5).join('\n   '));
      return false;
    }
  }

  /**
   * Rollback changes from a failed improvement
   */
  private async rollbackChanges(branch: string, files: string[]) {
    console.log(`🔙 Rolling back ${files.length} file changes...`);
    this.git.rollback(branch);
  }

  /**
   * Check if daily cycle limit has been exceeded
   */
  private exceededDailyLimit(): boolean {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCycles = this.state.cycles.filter(c => c.timestamp > oneDayAgo);
    return recentCycles.length >= this.state.config.maxCyclesPerDay;
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getState(): RecursiveState {
    return this.state;
  }

  getStatus() {
    const recentCycles = this.state.cycles.slice(-10).reverse();
    return {
      isRunning: this.isRunning,
      iteration: this.iterationCount,
      recentCycles,
      stats: this.state.stats,
      config: this.state.config
    };
  }

  /**
   * Get a detailed report of all improvements
   */
  getReport(): string {
    const successfulCycles = this.state.cycles.filter(c => c.testsPassed);
    const failedCycles = this.state.cycles.filter(c => !c.testsPassed);

    return `
╔════════════════════════════════════════════════════════════╗
║         RECURSIVE AGENT SWARM - IMPROVEMENT REPORT         ║
╚════════════════════════════════════════════════════════════╝

📊 STATISTICS
─────────────────────────────────────────────────────────────
  Total Cycles Run:        ${this.state.currentIteration}
  Successful Improvements: ${this.state.stats.totalImprovements}
  Failed Improvements:     ${failedCycles.length}
  Files Modified:          ${this.state.stats.filesModified.length}
  Rollbacks Performed:     ${this.state.stats.rollbacks}

📁 MODIFIED FILES
─────────────────────────────────────────────────────────────
${this.state.stats.filesModified.map(f => `  • ${f}`).join('\n')}

🔄 RECENT CYCLES
─────────────────────────────────────────────────────────────
${this.state.cycles.slice(-5).map((c: any) => `
  ${new Date(c.timestamp).toLocaleString()}
  Status: ${c.phase.toUpperCase()}
  Finding: ${c.finding}
  Changes: ${c.changes.join(', ') || 'None'}
`).join('\n')}

⚙️  CONFIGURATION
─────────────────────────────────────────────────────────────
  Max Cycles Per Day:      ${this.state.config.maxCyclesPerDay}
  Max Changes Per Cycle:   ${this.state.config.maxChangesPerCycle}
  Cycle Delay:             ${this.state.config.cycleDelayMs / 1000}s
  Blacklisted Files:       ${this.state.config.blacklistedFiles.length}
`;
  }

  /**
   * Manually trigger a single improvement cycle
   */
  async runSingleCycle(): Promise<ImprovementCycle | null> {
    console.log('🔄 Running single improvement cycle...');

    const wasRunning = this.isRunning;
    this.isRunning = true;
    this.iterationCount = this.state.currentIteration + 1;

    try {
      await this.runImprovementCycle();
      this.saveState();

      // Return the most recent cycle
      return this.state.cycles[this.state.cycles.length - 1] || null;
    } finally {
      this.isRunning = wasRunning;
    }
  }
}

// Singleton
let swarmInstance: RecursiveAgentSwarm | null = null;

export function getRecursiveSwarm(): RecursiveAgentSwarm {
  if (!swarmInstance) {
    swarmInstance = new RecursiveAgentSwarm();
  }
  return swarmInstance;
}

export type { ImprovementCycle, RecursiveState };
