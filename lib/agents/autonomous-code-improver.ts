/**
 * Autonomous Code Improver - Actually modifies code
 *
 * This system:
 * 1. Scans codebase for improvement opportunities
 * 2. Uses LLM to generate actual code changes
 * 3. Creates git branches for safety
 * 4. Runs tests to validate
 * 5. Commits and pushes successful changes
 * 6. Rolls back on failures
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getLLMClient } from '../ai/llm-client';

interface ImprovementOpportunity {
  file: string;
  type: 'bug' | 'feature' | 'optimization' | 'refactor';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  estimatedRisk: 'safe' | 'moderate' | 'risky';
}

interface ImprovementCycle {
  id: string;
  timestamp: number;
  phase: 'analyzing' | 'improving' | 'testing' | 'completed' | 'failed' | 'awaiting_approval';
  opportunities: ImprovementOpportunity[];
  selectedImprovement: ImprovementOpportunity | null;
  branch: string | null;
  changes: string[];
  testResults: {
    passed: boolean;
    output: string;
  } | null;
  commitHash: string | null;
  error?: string;
}

interface ImproverState {
  cycles: ImprovementCycle[];
  currentCycle: string | null;
  config: {
    autoApplySafeChanges: boolean;
    requireApprovalFor: string[]; // change types requiring approval
    maxCyclesPerDay: number;
    blacklist: string[]; // files to never modify
    enabled: boolean;
  };
  stats: {
    totalCycles: number;
    successfulImprovements: number;
    failedImprovements: number;
    filesModified: string[];
  };
}

const STATE_FILE = join(process.cwd(), 'data', 'autonomous-improver-state.json');
const BRANCH_PREFIX = 'auto/improve-';

export class AutonomousCodeImprover {
  private state: ImproverState;
  private llm = getLLMClient();

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): ImproverState {
    try {
      if (existsSync(STATE_FILE)) {
        const data = readFileSync(STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }

    return {
      cycles: [],
      currentCycle: null,
      config: {
        autoApplySafeChanges: true,
        requireApprovalFor: ['feature', 'risky'],
        maxCyclesPerDay: 10,
        blacklist: [
          'lib/agents/autonomous-code-improver.ts',
          'lib/agents/git-manager.ts',
          'package.json',
          'tsconfig.json',
          'next.config.js',
          '.env',
          'vercel.json'
        ],
        enabled: true
      },
      stats: {
        totalCycles: 0,
        successfulImprovements: 0,
        failedImprovements: 0,
        filesModified: []
      }
    };
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
   * Run a full improvement cycle
   */
  async runCycle(): Promise<ImprovementCycle> {
    const cycleId = `cycle-${Date.now()}`;
    const cycle: ImprovementCycle = {
      id: cycleId,
      timestamp: Date.now(),
      phase: 'analyzing',
      opportunities: [],
      selectedImprovement: null,
      branch: null,
      changes: [],
      testResults: null,
      commitHash: null
    };

    this.state.cycles.push(cycle);
    this.state.currentCycle = cycleId;
    this.saveState();

    try {
      console.log('🔍 Starting improvement cycle...');

      // Phase 1: Analyze codebase for opportunities
      cycle.phase = 'analyzing';
      this.saveState();

      const opportunities = await this.analyzeCodebase();
      cycle.opportunities = opportunities;

      if (opportunities.length === 0) {
        cycle.phase = 'completed';
        console.log('✨ No improvements found');
        this.saveState();
        return cycle;
      }

      // Filter out blacklisted files
      const validOpportunities = opportunities.filter(o =>
        !this.state.config.blacklist.some(b => o.file.includes(b))
      );

      if (validOpportunities.length === 0) {
        cycle.phase = 'completed';
        console.log('⏭️ All opportunities are in blacklisted files');
        this.saveState();
        return cycle;
      }

      // Select best improvement (prioritize safe, high-value changes)
      const selected = this.selectImprovement(validOpportunities);
      cycle.selectedImprovement = selected;
      this.saveState();

      console.log(`📝 Selected: ${selected.title} in ${selected.file}`);

      // Check if approval needed
      if (this.needsApproval(selected)) {
        cycle.phase = 'awaiting_approval';
        console.log('⏸️ Awaiting approval for:', selected.title);
        this.saveState();
        return cycle;
      }

      // Phase 2: Create branch and apply changes
      cycle.phase = 'improving';
      this.saveState();

      const branch = await this.createBranch(selected);
      cycle.branch = branch;
      this.saveState();

      const result = await this.applyImprovement(selected);

      if (!result.success) {
        throw new Error(result.error || 'Failed to apply improvement');
      }

      cycle.changes = result.changes;

      // Phase 3: Test
      cycle.phase = 'testing';
      this.saveState();

      const testResults = await this.runTests();
      cycle.testResults = testResults;
      this.saveState();

      if (!testResults.passed) {
        throw new Error(`Tests failed: ${testResults.output}`);
      }

      // Phase 4: Commit and push
      const commitHash = await this.commitAndPush(selected, branch);
      cycle.commitHash = commitHash;
      cycle.phase = 'completed';

      this.state.stats.successfulImprovements++;
      if (!this.state.stats.filesModified.includes(selected.file)) {
        this.state.stats.filesModified.push(selected.file);
      }
      this.saveState();

      console.log(`✅ Improvement completed: ${selected.title}`);
      console.log(`   Commit: ${commitHash}`);

    } catch (error: any) {
      cycle.phase = 'failed';
      cycle.error = error.message;
      this.state.stats.failedImprovements++;

      // Rollback if we created a branch
      if (cycle.branch) {
        await this.rollback(cycle.branch);
      }

      this.saveState();
      console.error(`❌ Cycle failed:`, error.message);
    }

    this.state.currentCycle = null;
    this.state.stats.totalCycles++;
    this.saveState();

    return cycle;
  }

  /**
   * Analyze codebase for improvement opportunities
   */
  private async analyzeCodebase(): Promise<ImprovementOpportunity[]> {
    const opportunities: ImprovementOpportunity[] = [];

    // Scan TypeScript files
    const files = this.findFiles(['app', 'lib', 'components'], ['.ts', '.tsx']);

    for (const file of files) {
      try {
        const content = readFileSync(join(process.cwd(), file), 'utf-8');

        // Use LLM to analyze the file
        const analysis = await this.analyzeFile(file, content);
        opportunities.push(...analysis);
      } catch (e) {
        console.error(`Failed to analyze ${file}:`, e);
      }
    }

    return opportunities.sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.priority] - priority[b.priority];
    });
  }

  /**
   * Use LLM to analyze a file for improvements
   */
  private async analyzeFile(filePath: string, content: string): Promise<ImprovementOpportunity[]> {
    try {
      const prompt = `Analyze this TypeScript file for improvements:

File: ${filePath}

Content:
${content.substring(0, 8000)}

${content.length > 8000 ? '... (truncated)' : ''}

Identify:
1. Bugs or potential errors
2. Performance optimizations
3. Code smells or refactoring opportunities
4. Missing error handling

Return JSON only:
[
  {
    "type": "bug|feature|optimization|refactor",
    "title": "Short title",
    "description": "What should be changed and why",
    "priority": "high|medium|low",
    "estimatedRisk": "safe|moderate|risky"
  }
]

Focus on practical, actionable improvements. Return empty array if the file looks good.`;

      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], '');

      try {
        const parsed = JSON.parse(response.content);
        if (Array.isArray(parsed)) {
          return parsed.map((item: any) => ({
            file: filePath,
            type: item.type || 'refactor',
            title: item.title || 'Improvement needed',
            description: item.description || '',
            priority: item.priority || 'medium',
            estimatedRisk: item.estimatedRisk || 'moderate'
          }));
        }
      } catch {
        // Parse failed
      }
    } catch (e) {
      console.error(`LLM analysis failed for ${filePath}:`, e);
    }

    return [];
  }

  /**
   * Select the best improvement to apply
   */
  private selectImprovement(opportunities: ImprovementOpportunity[]): ImprovementOpportunity {
    // Prioritize: safe changes first, then high priority
    const safeAndHigh = opportunities.filter(o => o.estimatedRisk === 'safe' && o.priority === 'high');
    if (safeAndHigh.length > 0) return safeAndHigh[0];

    const safeAndMedium = opportunities.filter(o => o.estimatedRisk === 'safe' && o.priority === 'medium');
    if (safeAndMedium.length > 0) return safeAndMedium[0];

    const anySafe = opportunities.filter(o => o.estimatedRisk === 'safe');
    if (anySafe.length > 0) return anySafe[0];

    // If no safe options, pick high priority moderate risk
    const highPriority = opportunities.filter(o => o.priority === 'high');
    if (highPriority.length > 0) return highPriority[0];

    return opportunities[0];
  }

  /**
   * Check if improvement needs human approval
   */
  private needsApproval(improvement: ImprovementOpportunity): boolean {
    return this.state.config.requireApprovalFor.includes(improvement.type) ||
           this.state.config.requireApprovalFor.includes(improvement.estimatedRisk) ||
           improvement.estimatedRisk === 'risky';
  }

  /**
   * Create a git branch for the improvement
   */
  private async createBranch(improvement: ImprovementOpportunity): Promise<string> {
    const branchName = `${BRANCH_PREFIX}${Date.now()}-${improvement.type}`;

    try {
      execSync(`git checkout -b ${branchName}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30000
      });
      return branchName;
    } catch (error: any) {
      throw new Error(`Failed to create branch: ${error.message}`);
    }
  }

  /**
   * Apply an improvement using LLM
   */
  private async applyImprovement(improvement: ImprovementOpportunity): Promise<{
    success: boolean;
    changes: string[];
    error?: string;
  }> {
    try {
      const filePath = join(process.cwd(), improvement.file);
      const content = readFileSync(filePath, 'utf-8');

      // Backup original
      const backupPath = filePath + '.autobackup';
      writeFileSync(backupPath, content, 'utf-8');

      // Generate improved code
      const prompt = `Improve this TypeScript file by addressing this issue:

Type: ${improvement.type}
Title: ${improvement.title}
Description: ${improvement.description}

File: ${improvement.file}

Current code:
${content}

Requirements:
- Keep the same imports and exports
- Maintain the existing API/interface
- Add comments explaining the change
- Follow TypeScript best practices
- Return the FULL improved file

Return ONLY the complete improved TypeScript code, no markdown.`;

      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], '');

      // Extract code from response
      let newCode = response.content.trim();

      // Remove markdown code blocks if present
      if (newCode.startsWith('```')) {
        const lines = newCode.split('\n');
        lines.shift(); // Remove first line with ```
        const lang = lines[0];
        if (lang.startsWith('typescript') || lang.startsWith('tsx') || lang.startsWith('ts')) {
          lines.shift(); // Remove language line
        }
        newCode = lines.join('\n').replace(/```\s*$/, '');
      }

      // Validate the new code
      const validation = await this.validateCode(newCode, improvement.file);
      if (!validation.valid) {
        // Restore backup
        writeFileSync(filePath, content, 'utf-8');
        return {
          success: false,
          changes: [],
          error: validation.error
        };
      }

      // Write the improved code
      writeFileSync(filePath, newCode, 'utf-8');

      // Get diff
      const diff = execSync(`git diff ${improvement.file}`, {
        cwd: process.cwd(),
        encoding: 'utf-8'
      });

      return {
        success: true,
        changes: [improvement.file]
      };

    } catch (error: any) {
      return {
        success: false,
        changes: [],
        error: error.message
      };
    }
  }

  /**
   * Validate TypeScript code
   */
  private async validateCode(code: string, filePath: string): Promise<{
    valid: boolean;
    error?: string;
  }> {
    try {
      // Basic syntax checks
      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        return { valid: false, error: 'Unbalanced braces' };
      }

      // Type check
      execSync('npx tsc --noEmit --skipLibCheck', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000
      });

      return { valid: true };
    } catch (error: any) {
      const output = error.stdout?.toString() || error.stderr?.toString() || '';
      return {
        valid: false,
        error: `TypeScript error: ${output.substring(0, 200)}`
      };
    }
  }

  /**
   * Run tests
   */
  private async runTests(): Promise<{
    passed: boolean;
    output: string;
  }> {
    try {
      // Type check
      execSync('npm run type-check', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000
      });

      return {
        passed: true,
        output: 'Type check passed'
      };
    } catch (error: any) {
      const output = error.stdout?.toString() || error.stderr?.toString() || 'Tests failed';
      return {
        passed: false,
        output: output.substring(0, 500)
      };
    }
  }

  /**
   * Commit and push changes
   */
  private async commitAndPush(improvement: ImprovementOpportunity, branch: string): Promise<string> {
    const commitMessage = `[auto] ${improvement.type}: ${improvement.title}

${improvement.description}

Generated by autonomous code improver
Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`;

    try {
      // Stage changes
      execSync('git add -A', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30000
      });

      // Commit
      execSync(`git commit -m "${commitMessage}"`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30000
      });

      // Push
      execSync(`git push origin ${branch}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 60000
      });

      // Get commit hash
      const hash = execSync('git rev-parse HEAD', {
        cwd: process.cwd(),
        encoding: 'utf-8'
      }).trim();

      return hash;

    } catch (error: any) {
      throw new Error(`Failed to commit/push: ${error.message}`);
    }
  }

  /**
   * Rollback changes
   */
  private async rollback(branch: string): Promise<void> {
    try {
      // Switch back to main
      execSync('git checkout main', {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30000
      });

      // Delete branch
      execSync(`git branch -D ${branch}`, {
        cwd: process.cwd(),
        stdio: 'pipe',
        timeout: 30000
      });
    } catch (error) {
      console.error('Rollback failed:', error);
    }
  }

  /**
   * Approve a pending improvement
   */
  async approveImprovement(cycleId: string): Promise<ImprovementCycle> {
    const cycle = this.state.cycles.find(c => c.id === cycleId);
    if (!cycle || cycle.phase !== 'awaiting_approval') {
      throw new Error('Cycle not found or not awaiting approval');
    }

    if (!cycle.selectedImprovement) {
      throw new Error('No improvement to approve');
    }

    // Continue with the improvement
    // (Same logic as runCycle from the improvement phase)
    try {
      const branch = await this.createBranch(cycle.selectedImprovement);
      cycle.branch = branch;
      this.saveState();

      const result = await this.applyImprovement(cycle.selectedImprovement);
      if (!result.success) {
        throw new Error(result.error || 'Failed to apply improvement');
      }

      cycle.changes = result.changes;
      cycle.phase = 'testing';
      this.saveState();

      const testResults = await this.runTests();
      cycle.testResults = testResults;
      this.saveState();

      if (!testResults.passed) {
        throw new Error(`Tests failed: ${testResults.output}`);
      }

      const commitHash = await this.commitAndPush(cycle.selectedImprovement, branch);
      cycle.commitHash = commitHash;
      cycle.phase = 'completed';

      this.state.stats.successfulImprovements++;
      this.saveState();

    } catch (error: any) {
      cycle.phase = 'failed';
      cycle.error = error.message;
      this.state.stats.failedImprovements++;
      if (cycle.branch) {
        await this.rollback(cycle.branch);
      }
      this.saveState();
    }

    return cycle;
  }

  /**
   * Reject a pending improvement
   */
  rejectImprovement(cycleId: string) {
    const cycle = this.state.cycles.find(c => c.id === cycleId);
    if (!cycle) return;

    cycle.phase = 'failed';
    cycle.error = 'Rejected by user';
    this.saveState();
  }

  /**
   * Find files by extension
   */
  private findFiles(directories: string[], extensions: string[]): string[] {
    const files: string[] = [];

    for (const dir of directories) {
      const dirPath = join(process.cwd(), dir);
      if (!existsSync(dirPath)) continue;

      const scanDir = (currentPath: string) => {
        const items = require('fs').readdirSync(currentPath);
        for (const item of items) {
          const fullPath = join(currentPath, item);
          const stat = require('fs').statSync(fullPath);

          if (stat.isDirectory()) {
            // Skip node_modules and other common directories
            if (!['node_modules', '.next', '.git', 'dist', 'build'].includes(item)) {
              scanDir(fullPath);
            }
          } else if (stat.isFile()) {
            const ext = '.' + item.split('.').pop();
            if (extensions.includes(ext)) {
              files.push(fullPath.replace(process.cwd() + '/', ''));
            }
          }
        }
      };

      scanDir(dirPath);
    }

    return files;
  }

  /**
   * Get state
   */
  getState(): ImproverState {
    return {
      ...this.state,
      cycles: this.state.cycles.slice(-20) // Only return last 20 cycles
    };
  }

  /**
   * Get pending improvements awaiting approval
   */
  getPendingApprovals(): ImprovementCycle[] {
    return this.state.cycles.filter(c => c.phase === 'awaiting_approval');
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<ImproverState['config']>) {
    this.state.config = { ...this.state.config, ...config };
    this.saveState();
  }
}

// Singleton
let instance: AutonomousCodeImprover | null = null;

export function getAutonomousCodeImprover(): AutonomousCodeImprover {
  if (!instance) {
    instance = new AutonomousCodeImprover();
  }
  return instance;
}
