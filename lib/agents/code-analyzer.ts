/**
 * Code Analyzer - Scans source files for issues and improvement opportunities
 * Uses AST parsing and regex patterns to find problems
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getLLMClient } from '../ai/llm-client';

export interface CodeIssue {
  type: 'bug' | 'performance' | 'feature' | 'ux' | 'type' | 'todo' | 'error_handling' | 'security' | 'accessibility';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file: string;
  line?: number;
  suggestedFix?: string;
}

export interface AnalysisResult {
  file: string;
  issues: CodeIssue[];
  metrics: {
    lines: number;
    complexity: number;
    hasTests: boolean;
    hasTypes: boolean;
  };
}

export interface FileAnalysis {
  path: string;
  content: string;
  issues: CodeIssue[];
}

export class CodeAnalyzer {
  private llm = getLLMClient();
  private rootDir: string;
  private maxFileSize = 100000; // 100KB max
  private blacklist = [
    'node_modules',
    '.next',
    '.git',
    'dist',
    'build',
    'coverage',
    '.backups'
  ];

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
  }

  /**
   * Scan all source files and find issues
   */
  async scanProject(directories: string[] = ['app', 'components', 'lib']): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = [];

    for (const dir of directories) {
      const fullPath = join(this.rootDir, dir);
      if (!existsSync(fullPath)) continue;

      const files = this.findFiles(fullPath, ['.ts', '.tsx', '.js', '.jsx']);
      console.log(`📁 Scanning ${files.length} files in ${dir}/`);

      for (const file of files) {
        const result = await this.analyzeFile(file);
        if (result.issues.length > 0) {
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath: string): Promise<AnalysisResult> {
    const relativePath = filePath.replace(this.rootDir + '/', '');
    const content = this.readFile(filePath);

    if (!content) {
      return {
        file: relativePath,
        issues: [],
        metrics: { lines: 0, complexity: 0, hasTests: false, hasTypes: false }
      };
    }

    const issues = await this.findIssues(content, relativePath);
    const metrics = this.calculateMetrics(content, relativePath);

    return {
      file: relativePath,
      issues,
      metrics
    };
  }

  /**
   * Find issues in code content
   */
  async findIssues(content: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    // Pattern-based checks
    issues.push(...this.checkForTODOs(content, filePath, lines));
    issues.push(...this.checkForConsoleLogs(content, filePath, lines));
    issues.push(...this.checkForErrorHandling(content, filePath, lines));
    issues.push(...this.checkForTypeIssues(content, filePath, lines));
    issues.push(...this.checkForAccessibility(content, filePath, lines));
    issues.push(...this.checkForPerformance(content, filePath, lines));
    issues.push(...this.checkForSecurity(content, filePath, lines));
    issues.push(...this.checkForHardcodedValues(content, filePath, lines));

    // LLM-based analysis for deeper issues
    try {
      const llmIssues = await this.analyzeWithLLM(content, filePath);
      issues.push(...llmIssues);
    } catch (error) {
      // LLM might not be available, continue with pattern-based findings
      console.debug('LLM analysis not available');
    }

    return issues;
  }

  /**
   * Check for TODO/FIXME comments
   */
  private checkForTODOs(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const todoRegex = /(TODO|FIXME|HACK|XXX|BUG)(?::|\s)(.*)/gi;

    lines.forEach((line, index) => {
      const match = line.match(todoRegex);
      if (match) {
        const type = match[1].toUpperCase();
        issues.push({
          type: 'todo',
          severity: type === 'BUG' || type === 'FIXME' ? 'high' : 'medium',
          title: `Unresolved ${type}`,
          description: match[2].trim() || 'Task needs to be completed',
          file: filePath,
          line: index + 1
        });
      }
    });

    return issues;
  }

  /**
   * Check for console.log statements (should use proper logging)
   */
  private checkForConsoleLogs(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const consoleRegex = /console\.(log|debug|info|warn|error)\s*\(/g;

    // Skip if this is a test file
    if (filePath.includes('.test.') || filePath.includes('.spec.')) {
      return issues;
    }

    lines.forEach((line, index) => {
      let match;
      const regex = new RegExp(consoleRegex);
      while ((match = regex.exec(line)) !== null) {
        issues.push({
          type: 'bug',
          severity: 'low',
          title: 'Console statement in production code',
          description: 'Consider using a proper logging library or remove',
          file: filePath,
          line: index + 1,
          suggestedFix: 'Replace with proper logger or remove'
        });
      }
    });

    return issues;
  }

  /**
   * Check for missing error handling
   */
  private checkForErrorHandling(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Check for async functions without try-catch
    const asyncRegex = /async\s+(\w+)\s*\([^)]*\)\s*{/g;
    let match;

    while ((match = asyncRegex.exec(content)) !== null) {
      const funcStart = match.index;
      const funcEnd = this.findMatchingBrace(content, funcStart + match[0].length - 1);
      const funcContent = content.substring(funcStart, funcEnd);

      // Skip if it has try-catch
      if (funcContent.includes('try {') || funcContent.includes('catch')) {
        continue;
      }

      // Skip if it's just returning a promise
      if (funcContent.includes('return ') && !funcContent.includes('await')) {
        continue;
      }

      issues.push({
        type: 'error_handling',
        severity: 'medium',
        title: 'Async function without error handling',
        description: 'Consider adding try-catch for error handling',
        file: filePath,
        suggestedFix: 'Wrap async operations in try-catch'
      });
    }

    // Check for fetch without error handling
    const fetchRegex = /fetch\s*\([^)]+\)/g;
    lines.forEach((line, index) => {
      if (fetchRegex.test(line) && !line.includes('catch') && !line.includes('try')) {
        issues.push({
          type: 'error_handling',
          severity: 'high',
          title: 'Fetch call without error handling',
          description: 'Network requests should handle errors',
          file: filePath,
          line: index + 1
        });
      }
    });

    return issues;
  }

  /**
   * Check for TypeScript type issues
   */
  private checkForTypeIssues(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Check for any types
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      const anyRegex = /:\s*any\b/g;
      lines.forEach((line, index) => {
        if (anyRegex.test(line) && !line.trim().startsWith('//')) {
          issues.push({
            type: 'type',
            severity: 'medium',
            title: 'Using "any" type',
            description: 'Consider using specific types for better type safety',
            file: filePath,
            line: index + 1
          });
        }
      });

      // Check for missing return types
      const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*{/g;
      let match;
      while ((match = functionRegex.exec(content)) !== null) {
        const beforeMatch = content.substring(match.index - 10, match.index);
        if (!beforeMatch.includes(':')) {
          issues.push({
            type: 'type',
            severity: 'low',
            title: 'Missing return type annotation',
            description: `Function "${match[1]}" should have explicit return type`,
            file: filePath
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check for accessibility issues
   */
  private checkForAccessibility(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Only check JSX/TSX files
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) {
      return issues;
    }

    // Check for onClick handlers without keyboard handlers
    const onClickRegex = /onClick\s*=/g;
    lines.forEach((line, index) => {
      if (onClickRegex.test(line)) {
        // Check surrounding context for keyboard handlers
        const contextStart = Math.max(0, index - 3);
        const contextEnd = Math.min(lines.length, index + 3);
        const context = lines.slice(contextStart, contextEnd).join('\n');

        if (!context.includes('onKeyDown') && !context.includes('onKeyPress') &&
            !line.includes('button') && !line.includes('role="button"')) {
          issues.push({
            type: 'accessibility',
            severity: 'medium',
            title: 'Click handler without keyboard support',
            description: 'Interactive elements should be keyboard accessible',
            file: filePath,
            line: index + 1,
            suggestedFix: 'Add onKeyDown or use a <button> element'
          });
        }
      }
    });

    // Check for images without alt
    const imgRegex = /<img\s+(?!.*alt\s*=)[^>]+>/g;
    lines.forEach((line, index) => {
      if (imgRegex.test(line)) {
        issues.push({
          type: 'accessibility',
          severity: 'high',
          title: 'Image missing alt attribute',
          description: 'Images should have alt text for screen readers',
          file: filePath,
          line: index + 1,
          suggestedFix: 'Add alt attribute with descriptive text'
        });
      }
    });

    return issues;
  }

  /**
   * Check for performance issues
   */
  private checkForPerformance(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Check for missing React.memo, useMemo, useCallback
    if (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) {
      // Large components without memo
      const componentRegex = /function\s+(\w+)\s*\([^)]*\)\s*{/g;
      let match;
      while ((match = componentRegex.exec(content)) !== null) {
        const componentName = match[1];
        if (!componentName.startsWith('use')) {
          // Check component size
          const funcStart = match.index;
          const funcEnd = this.findMatchingBrace(content, funcStart + match[0].length - 1);
          const funcSize = funcEnd - funcStart;

          if (funcSize > 2000) { // Large component
            issues.push({
              type: 'performance',
              severity: 'low',
              title: `Large component "${componentName}" could benefit from memoization`,
              description: 'Consider using React.memo or splitting into smaller components',
              file: filePath
            });
          }
        }
      }

      // Check for expensive operations in render
      lines.forEach((line, index) => {
        if ((line.includes('.map(') || line.includes('.filter(') || line.includes('.sort(')) &&
            !line.includes('useMemo') && !line.includes('useCallback')) {
          // Check if it's a large array operation
          if (line.match(/\.(map|filter|sort)\([^)]+=>/)) {
            issues.push({
              type: 'performance',
              severity: 'low',
              title: 'Array operation in render without memoization',
              description: 'Consider using useMemo for expensive computations',
              file: filePath,
              line: index + 1
            });
          }
        }
      });
    }

    return issues;
  }

  /**
   * Check for security issues
   */
  private checkForSecurity(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Check for dangerouslySetInnerHTML
    lines.forEach((line, index) => {
      if (line.includes('dangerouslySetInnerHTML')) {
        issues.push({
          type: 'security',
          severity: 'high',
          title: 'Use of dangerouslySetInnerHTML',
          description: 'This can lead to XSS vulnerabilities if not sanitized',
          file: filePath,
          line: index + 1
        });
      }

      // Check for eval
      if (line.includes('eval(')) {
        issues.push({
          type: 'security',
          severity: 'critical',
          title: 'Use of eval()',
          description: 'eval() is dangerous and should be avoided',
          file: filePath,
          line: index + 1
        });
      }

      // Check for hardcoded secrets
      const secretPattern = /(api[_-]?key|secret|password|token)\s*[:=]\s*['"`][^'"`]+['"`]/i;
      if (secretPattern.test(line)) {
        issues.push({
          type: 'security',
          severity: 'critical',
          title: 'Possible hardcoded secret',
          description: 'Secrets should be stored in environment variables',
          file: filePath,
          line: index + 1
        });
      }
    });

    return issues;
  }

  /**
   * Check for hardcoded values that should be configurable
   */
  private checkForHardcodedValues(content: string, filePath: string, lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    // Check for hardcoded URLs
    const urlPattern = /['"`]https?:\/\/[^'"`]+['"`]/g;
    lines.forEach((line, index) => {
      let match;
      const urlRegex = new RegExp(urlPattern);
      while ((match = urlRegex.exec(line)) !== null) {
        const url = match[0];
        // Skip if it's a well-known service or localhost
        if (!url.includes('localhost') && !url.includes('127.0.0.1') &&
            !url.includes('api.anthropic.com')) {
          issues.push({
            type: 'feature',
            severity: 'low',
            title: 'Hardcoded URL',
            description: 'Consider moving to environment variables',
            file: filePath,
            line: index + 1,
            suggestedFix: 'Use process.env.NEXT_PUBLIC_API_URL'
          });
        }
        urlRegex.lastIndex = 0; // Reset for next line
      }
    });

    // Check for magic numbers
    const magicNumberPattern = /\b\d{4,}\b/g;
    lines.forEach((line, index) => {
      // Skip if it's a timestamp, port, or CSS value
      if (!line.includes('px') && !line.includes('ms') && !line.includes('port')) {
        let match;
        const numRegex = new RegExp(magicNumberPattern);
        while ((match = numRegex.exec(line)) !== null) {
          const num = parseInt(match[0]);
          if (num > 1000 && num < 1000000) {
            issues.push({
              type: 'feature',
              severity: 'low',
              title: 'Possible magic number',
              description: 'Consider using a named constant',
              file: filePath,
              line: index + 1
            });
          }
        }
      }
    });

    return issues;
  }

  /**
   * Use LLM for deeper code analysis
   */
  private async analyzeWithLLM(content: string, filePath: string): Promise<CodeIssue[]> {
    try {
      const response = await this.llm.analyzeCode({
        code: this.truncateContent(content),
        filePath,
        context: 'Crypto trading application - analyze for bugs, missing features, and UX issues'
      });

      // Parse LLM response for structured issues
      const issues: CodeIssue[] = [];

      try {
        const parsed = JSON.parse(response);
        if (parsed.issues && Array.isArray(parsed.issues)) {
          for (const issue of parsed.issues) {
            issues.push({
              type: issue.type || 'feature',
              severity: issue.severity || 'medium',
              title: issue.title || 'Improvement needed',
              description: issue.description || '',
              file: filePath,
              line: issue.line,
              suggestedFix: issue.suggestedFix
            });
          }
        }
      } catch {
        // LLM didn't return valid JSON, try to extract info from text
        if (response.includes('issue') || response.includes('problem') || response.includes('improvement')) {
          issues.push({
            type: 'feature',
            severity: 'medium',
            title: 'AI-suggested improvement',
            description: response.substring(0, 500),
            file: filePath
          });
        }
      }

      return issues;
    } catch (error) {
      console.debug('LLM analysis failed:', error);
      return [];
    }
  }

  /**
   * Calculate code metrics
   */
  private calculateMetrics(content: string, filePath: string): AnalysisResult['metrics'] {
    const lines = content.split('\n');

    // Simple complexity estimation
    const complexity = (content.match(/if|for|while|switch|case|catch|\?/g) || []).length;

    // Check if tests exist
    const testPath = filePath
      .replace(/^app\//, 'src/tests/')
      .replace(/^components\//, 'src/tests/components/')
      .replace(/^lib\//, 'src/tests/lib/')
      .replace(/\.(ts|tsx)$/, '.test.ts');

    const hasTests = existsSync(join(this.rootDir, testPath));

    // Check if types are used (not JS file)
    const hasTypes = !filePath.endsWith('.js') && !filePath.endsWith('.jsx');

    return {
      lines: lines.length,
      complexity,
      hasTests,
      hasTypes
    };
  }

  /**
   * Find all files in a directory recursively
   */
  private findFiles(dir: string, extensions: string[]): string[] {
    const files: string[] = [];

    const traverse = (currentDir: string) => {
      const items = readdirSync(currentDir);

      for (const item of items) {
        const fullPath = join(currentDir, item);
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          // Skip blacklisted directories
          if (!this.blacklist.some(b => fullPath.includes(b))) {
            traverse(fullPath);
          }
        } else if (stat.isFile()) {
          const ext = `.${item.split('.').pop()}`;
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    try {
      traverse(dir);
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
    }

    return files;
  }

  /**
   * Read file content safely
   */
  private readFile(filePath: string): string | null {
    try {
      const stat = statSync(filePath);
      if (stat.size > this.maxFileSize) {
        console.warn(`File too large: ${filePath}`);
        return null;
      }

      return readFileSync(filePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Truncate content for LLM processing
   */
  private truncateContent(content: string, maxLength = 15000): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '\n// ... (truncated)';
  }

  /**
   * Find matching closing brace
   */
  private findMatchingBrace(content: string, startPos: number): number {
    let depth = 1;
    let pos = startPos + 1;

    while (depth > 0 && pos < content.length) {
      if (content[pos] === '{') depth++;
      if (content[pos] === '}') depth--;
      pos++;
    }

    return pos;
  }

  /**
   * Get all issues grouped by type
   */
  groupIssuesByType(issues: CodeIssue[]): Map<string, CodeIssue[]> {
    const grouped = new Map<string, CodeIssue[]>();

    for (const issue of issues) {
      const existing = grouped.get(issue.type) || [];
      existing.push(issue);
      grouped.set(issue.type, existing);
    }

    return grouped;
  }

  /**
   * Get issues by severity
   */
  getIssuesBySeverity(issues: CodeIssue[], severity: CodeIssue['severity']): CodeIssue[] {
    return issues.filter(i => i.severity === severity);
  }

  /**
   * Get critical and high priority issues
   */
  getCriticalIssues(issues: CodeIssue[]): CodeIssue[] {
    return issues.filter(i => i.severity === 'critical' || i.severity === 'high');
  }
}

// Singleton
let analyzerInstance: CodeAnalyzer | null = null;

export function getCodeAnalyzer(): CodeAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new CodeAnalyzer();
  }
  return analyzerInstance;
}
