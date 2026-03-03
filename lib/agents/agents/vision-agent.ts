/**
 * Vision Agent - Analyzes app state and identifies improvements
 * Focuses on helping users make informed decisions in the moment
 */

import { BaseAgent, AgentExecuteResult, Recommendation } from './base-agent';
import { AgentTask } from '../swarm-config';
import { getCodeAnalyzer } from '../code-analyzer';
import { getLLMClient } from '../../ai/llm-client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export class VisionAgent extends BaseAgent {
  readonly name = 'Vision Agent';
  readonly role = 'ui_ux_vision';

  private readonly appPagePath = 'app/page.tsx';
  private readonly componentsPath = 'components/';
  private analyzer = getCodeAnalyzer();
  private llm = getLLMClient();

  async execute(task: AgentTask): Promise<AgentExecuteResult> {
    this.log(`Executing task: ${task.title}`);

    try {
      switch (task.type) {
        case 'improvement':
          return await this.analyzeImprovements();
        case 'feature':
          return await this.suggestFeatures();
        case 'bugfix':
          return await this.findBugs();
        default:
          return await this.generalAnalysis();
      }
    } catch (error) {
      this.log(`Error executing task: ${error}`, 'error');
      return {
        success: false,
        error: String(error)
      };
    }
  }

  async analyzeAndSuggest(): Promise<string[]> {
    const result = await this.generalAnalysis();
    return result.recommendations?.map(r => r.title) || [];
  }

  private async generalAnalysis(): Promise<AgentExecuteResult> {
    this.log('Analyzing current app state...');

    // Real code analysis
    const codeIssues = await this.analyzeCurrentCode();

    // UI/UX analysis via LLM
    const uxSuggestions = await this.analyzeUX();

    // Combine findings
    const allRecommendations = [
      ...this.convertIssuesToRecommendations(codeIssues),
      ...uxSuggestions
    ];

    return {
      success: true,
      data: {
        analysis: 'Complete UI/UX analysis',
        issuesFound: codeIssues.length,
        uxSuggestions: uxSuggestions.length,
        timestamp: Date.now()
      },
      recommendations: allRecommendations
    };
  }

  private async analyzeImprovements(): Promise<AgentExecuteResult> {
    // Real code analysis
    const codeIssues = await this.analyzeCurrentCode();

    const recommendations = this.convertIssuesToRecommendations(codeIssues);

    return {
      success: true,
      data: {
        improvementsFound: recommendations.length,
        analysis: 'UI/UX improvements identified via code analysis'
      },
      recommendations
    };
  }

  private async suggestFeatures(): Promise<AgentExecuteResult> {
    // Use LLM to suggest features based on current app state
    const appContent = this.readAppPage();

    let features: Recommendation[] = [];

    if (appContent && this.llm) {
      try {
        const prompt = `Analyze this crypto trading app and suggest 3-5 high-impact features that would help traders make better decisions.

Current app code:
\`\`\`typescript
${appContent.substring(0, 5000)}
\`\`\`

Consider:
- Missing technical indicators
- Decision support tools
- Risk management features
- Market information aggregation

Return JSON: {"features": [{"title": "...", "description": "...", "priority": "high|medium|low"}]}`;

        const response = await this.llm.generate([
          { role: 'user', content: prompt }
        ], 'You are a crypto trading UX expert. Suggest features that improve decision making.');

        try {
          const parsed = JSON.parse(response.content);
          if (parsed.features) {
            features = parsed.features.map((f: any) => ({
              type: 'feature',
              title: f.title,
              description: f.description,
              priority: f.priority || 'medium',
              agent: this.name,
              timestamp: Date.now()
            }));
          }
        } catch {
          // Parse failed, use fallback
        }
      } catch (error) {
        this.log('LLM feature suggestion failed, using fallback', 'warning');
      }
    }

    // Fallback features if LLM fails
    if (features.length === 0) {
      features = await this.findFeatureOpportunities();
    }

    return {
      success: true,
      data: {
        featuresFound: features.length,
        analysis: 'New feature opportunities identified'
      },
      recommendations: features
    };
  }

  private async findBugs(): Promise<AgentExecuteResult> {
    const codeIssues = await this.analyzeCurrentCode();
    const bugs = codeIssues.filter(i => i.type === 'bug' || i.type === 'security');

    return {
      success: true,
      data: {
        bugsFound: bugs.length,
        analysis: 'Bugs and security issues identified'
      },
      recommendations: this.convertIssuesToRecommendations(bugs)
    };
  }

  /**
   * Perform real code analysis
   */
  private async analyzeCurrentCode(): Promise<any[]> {
    const issues: any[] = [];

    try {
      // Analyze main app page
      const appPath = join(process.cwd(), this.appPagePath);
      if (existsSync(appPath)) {
        const result = await this.analyzer.analyzeFile(appPath);
        issues.push(...result.issues.map((i: any) => ({ ...i, file: this.appPagePath })));
      }

      // Analyze components directory if it exists
      const componentsPath = join(process.cwd(), this.componentsPath);
      if (existsSync(componentsPath)) {
        const results = await this.analyzer.scanProject(['components']);
        for (const result of results) {
          issues.push(...result.issues);
        }
      }
    } catch (error) {
      this.log(`Code analysis failed: ${error}`, 'error');
    }

    return issues;
  }

  /**
   * Analyze UX using LLM
   */
  private async analyzeUX(): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const appContent = this.readAppPage();

    if (!appContent) return recommendations;

    try {
      const prompt = `Analyze this crypto trading dashboard for UX improvements.

Current app code:
\`\`\`typescript
${appContent.substring(0, 8000)}
\`\`\`

Identify:
1. Missing decision support elements
2. Information that could be clearer
3. Opportunities for better visual hierarchy
4. Missing quick-actions for traders

Return JSON: {"improvements": [{"title": "...", "description": "...", "priority": "high|medium|low"}]}`;

      const response = await this.llm.generate([
        { role: 'user', content: prompt }
      ], 'You are a UX expert specializing in trading applications. Focus on decision support and clarity.');

      try {
        const parsed = JSON.parse(response.content);
        if (parsed.improvements) {
          for (const imp of parsed.improvements) {
            recommendations.push({
              type: 'improvement',
              title: imp.title,
              description: imp.description,
              priority: imp.priority || 'medium',
              agent: this.name,
              timestamp: Date.now()
            });
          }
        }
      } catch {
        // Parse failed
      }
    } catch (error) {
      this.log('UX analysis failed', 'warning');
    }

    return recommendations;
  }

  /**
   * Convert code issues to recommendations
   */
  private convertIssuesToRecommendations(issues: any[]): Recommendation[] {
    return issues.map(issue => ({
      type: issue.type === 'todo' ? 'improvement' : issue.type,
      title: issue.title,
      description: issue.description,
      priority: issue.severity,
      agent: this.name,
      timestamp: Date.now()
    }));
  }

  /**
   * Read the main app page
   */
  private readAppPage(): string | null {
    try {
      const appPath = join(process.cwd(), this.appPagePath);
      if (existsSync(appPath)) {
        return readFileSync(appPath, 'utf-8');
      }
    } catch (error) {
      this.log('Failed to read app page', 'error');
    }
    return null;
  }

  /**
   * Find new features that would enhance decision making (fallback)
   */
  private async findFeatureOpportunities(): Promise<Recommendation[]> {
    const features: Recommendation[] = [];

    features.push(
      this.createRecommendation(
        'feature',
        'Trader Sentiment Dashboard',
        'Aggregate and display sentiment from top crypto traders and influencers',
        'high'
      )
    );

    features.push(
      this.createRecommendation(
        'feature',
        'Whale Activity Monitor',
        'Real-time tracking of large transactions to follow smart money',
        'high'
      )
    );

    features.push(
      this.createRecommendation(
        'feature',
        'AI Trade Suggestions',
        'AI-powered trade entry/exit suggestions based on multi-factor analysis',
        'high'
      )
    );

    features.push(
      this.createRecommendation(
        'feature',
        'Portfolio Health Score',
        'Single metric showing portfolio diversification and risk level',
        'medium'
      )
    );

    return features;
  }

  /**
   * Get actionable improvement plan
   */
  getImprovementPlan(): string {
    return `
🎯 VISION AGENT IMPROVEMENT PLAN
================================

ANALYSIS APPROACH:
------------------
The Vision Agent now performs REAL code analysis:

1. Static Code Analysis:
   - Scans for TODO/FIXME comments
   - Detects console.log statements
   - Identifies missing error handling
   - Checks TypeScript type issues
   - Finds accessibility problems
   - Detects security vulnerabilities

2. LLM-Powered Analysis:
   - Deep code understanding via Claude
   - UX/UX improvement suggestions
   - Feature recommendations
   - Trading-specific enhancements

3. Safety Measures:
   - All changes go through git branches
   - Tests must pass before merging
   - Automatic rollback on failure
   - File blacklist for critical files

IMMEDIATE (Next Session):
--------------------------
1. Review critical issues found
2. Apply high-priority bug fixes
3. Implement missing decision support

ONGOING:
---------
1. Continuous code scanning
2. A/B test new features
3. Gather feedback and iterate
    `;
  }

  /**
   * Get current analysis results
   */
  async getCurrentAnalysis(): Promise<{
    issues: any[];
    recommendations: Recommendation[];
    summary: string;
  }> {
    const issues = await this.analyzeCurrentCode();
    const recommendations = this.convertIssuesToRecommendations(issues);

    return {
      issues,
      recommendations,
      summary: `Found ${issues.length} issues requiring attention`
    };
  }
}
