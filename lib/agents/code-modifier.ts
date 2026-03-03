/**
 * Code Modifier - Safe code patching and modification
 * Applies AI-generated changes with validation and rollback support
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getLLMClient } from '../ai/llm-client';
import { getGitManager } from './git-manager';
import type { CodeIssue } from './code-analyzer';

export interface ModificationResult {
  success: boolean;
  file: string;
  originalContent?: string;
  newContent?: string;
  diff?: string;
  error?: string;
  needsReview?: boolean;
}

export interface CodePatch {
  file: string;
  description: string;
  changes: PatchChange[];
}

export interface PatchChange {
  type: 'replace' | 'insert' | 'delete';
  search?: string;
  replace?: string;
  position?: number;
  content: string;
}

export class CodeModifier {
  private llm = getLLMClient();
  private git = getGitManager();
  private rootDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
  }

  /**
   * Apply a fix for a specific issue
   */
  async applyFix(issue: CodeIssue): Promise<ModificationResult> {
    const filePath = join(this.rootDir, issue.file);

    if (!existsSync(filePath)) {
      return {
        success: false,
        file: issue.file,
        error: 'File not found'
      };
    }

    const originalContent = readFileSync(filePath, 'utf-8');

    try {
      // Create backup
      this.git.backupFile(issue.file);

      // Generate the fix using LLM
      const fixedCode = await this.llm.generateImprovement({
        prompt: `Fix this issue:\n${issue.title}\n${issue.description}\n${issue.suggestedFix || ''}`,
        currentCode: originalContent,
        filePath: issue.file
      });

      // Extract code from markdown
      const newContent = this.extractCode(fixedCode);

      if (!newContent || newContent === originalContent) {
        return {
          success: false,
          file: issue.file,
          error: 'No changes generated'
        };
      }

      // Validate the new code
      const validation = await this.validateCode(newContent, filePath);
      if (!validation.valid) {
        return {
          success: false,
          file: issue.file,
          error: validation.error
        };
      }

      // Write the new content
      writeFileSync(filePath, newContent, 'utf-8');

      const diff = this.git.getFileDiff(issue.file);

      return {
        success: true,
        file: issue.file,
        originalContent,
        newContent,
        diff,
        needsReview: issue.severity !== 'low'
      };
    } catch (error: any) {
      return {
        success: false,
        file: issue.file,
        error: error.message
      };
    }
  }

  /**
   * Apply a generated feature or improvement
   */
  async applyFeature(
    feature: string,
    description: string,
    targetFile: string,
    context?: string
  ): Promise<ModificationResult> {
    const filePath = join(this.rootDir, targetFile);

    if (!existsSync(filePath)) {
      return {
        success: false,
        file: targetFile,
        error: 'File not found'
      };
    }

    const originalContent = readFileSync(filePath, 'utf-8');

    try {
      // Create backup
      this.git.backupFile(targetFile);

      // Generate the feature code
      const code = await this.llm.generateImprovement({
        prompt: `Implement this feature:\n${feature}\n\n${description}`,
        currentCode: originalContent,
        filePath: targetFile,
        context: context ? [context] : undefined
      });

      const newContent = this.extractCode(code);

      if (!newContent) {
        return {
          success: false,
          file: targetFile,
          error: 'No code generated'
        };
      }

      // Validate
      const validation = await this.validateCode(newContent, filePath);
      if (!validation.valid) {
        return {
          success: false,
          file: targetFile,
          error: validation.error
        };
      }

      // Write changes
      writeFileSync(filePath, newContent, 'utf-8');

      const diff = this.git.getFileDiff(targetFile);

      return {
        success: true,
        file: targetFile,
        originalContent,
        newContent,
        diff,
        needsReview: true
      };
    } catch (error: any) {
      return {
        success: false,
        file: targetFile,
        error: error.message
      };
    }
  }

  /**
   * Create a new file
   */
  async createFile(
    filePath: string,
    content: string,
    description: string
  ): Promise<ModificationResult> {
    const fullPath = join(this.rootDir, filePath);

    try {
      // Create directory if needed
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      execSync(`mkdir -p "${dir}"`, { cwd: this.rootDir });

      // Check if file already exists
      if (existsSync(fullPath)) {
        return {
          success: false,
          file: filePath,
          error: 'File already exists'
        };
      }

      writeFileSync(fullPath, content, 'utf-8');

      return {
        success: true,
        file: filePath,
        newContent: content
      };
    } catch (error: any) {
      return {
        success: false,
        file: filePath,
        error: error.message
      };
    }
  }

  /**
   * Apply a simple string replacement
   */
  applyReplacement(
    filePath: string,
    search: string,
    replace: string
  ): ModificationResult {
    const fullPath = join(this.rootDir, filePath);

    if (!existsSync(fullPath)) {
      return {
        success: false,
        file: filePath,
        error: 'File not found'
      };
    }

    try {
      const originalContent = readFileSync(fullPath, 'utf-8');

      if (!originalContent.includes(search)) {
        return {
          success: false,
          file: filePath,
          error: 'Search string not found in file'
        };
      }

      const newContent = originalContent.replace(search, replace);
      writeFileSync(fullPath, newContent, 'utf-8');

      const diff = this.git.getFileDiff(filePath);

      return {
        success: true,
        file: filePath,
        originalContent,
        newContent,
        diff
      };
    } catch (error: any) {
      return {
        success: false,
        file: filePath,
        error: error.message
      };
    }
  }

  /**
   * Insert code at a specific position
   */
  insertAtLine(
    filePath: string,
    lineNumber: number,
    content: string
  ): ModificationResult {
    const fullPath = join(this.rootDir, filePath);

    if (!existsSync(fullPath)) {
      return {
        success: false,
        file: filePath,
        error: 'File not found'
      };
    }

    try {
      const originalContent = readFileSync(fullPath, 'utf-8');
      const lines = originalContent.split('\n');

      if (lineNumber < 1 || lineNumber > lines.length) {
        return {
          success: false,
          file: filePath,
          error: `Invalid line number: ${lineNumber}`
        };
      }

      lines.splice(lineNumber - 1, 0, content);
      const newContent = lines.join('\n');

      writeFileSync(fullPath, newContent, 'utf-8');

      const diff = this.git.getFileDiff(filePath);

      return {
        success: true,
        file: filePath,
        originalContent,
        newContent,
        diff
      };
    } catch (error: any) {
      return {
        success: false,
        file: filePath,
        error: error.message
      };
    }
  }

  /**
   * Revert a modification
   */
  revert(filePath: string, originalContent: string): boolean {
    try {
      const fullPath = join(this.rootDir, filePath);
      writeFileSync(fullPath, originalContent, 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to revert changes:', error);
      return false;
    }
  }

  /**
   * Validate TypeScript code
   */
  private async validateCode(code: string, filePath: string): Promise<{
    valid: boolean;
    error?: string;
  }> {
    // Basic syntax check
    try {
      // Check for balanced braces
      const openBraces = (code.match(/\{/g) || []).length;
      const closeBraces = (code.match(/\}/g) || []).length;
      if (openBraces !== closeBraces) {
        return {
          valid: false,
          error: 'Unbalanced braces in generated code'
        };
      }

      // Check for balanced parentheses
      const openParens = (code.match(/\(/g) || []).length;
      const closeParens = (code.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        return {
          valid: false,
          error: 'Unbalanced parentheses in generated code'
        };
      }

      // Run TypeScript compiler check
      try {
        execSync('npx tsc --noEmit --skipLibCheck', {
          cwd: this.rootDir,
          stdio: 'pipe',
          timeout: 30000
        });
      } catch (tscError: any) {
        const errorOutput = tscError.stderr?.toString() || tscError.stdout?.toString() || '';
        // Check if the error is related to our file
        if (errorOutput.includes(filePath.replace(this.rootDir + '/', ''))) {
          return {
            valid: false,
            error: `TypeScript error: ${errorOutput.split('\n').slice(0, 3).join('\n')}`
          };
        }
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Extract code from markdown response
   */
  private extractCode(response: string): string | null {
    // Try to extract from ```typescript or ```tsx blocks
    const tsMatch = response.match(/```(?:typescript|tsx|ts)\s*\n([\s\S]+?)\n```/);
    if (tsMatch) {
      return tsMatch[1].trim();
    }

    // Try generic code block
    const genericMatch = response.match(/```\s*\n([\s\S]+?)\n```/);
    if (genericMatch) {
      return genericMatch[1].trim();
    };

    // If no code blocks, return as-is (might already be code)
    const trimmed = response.trim();
    if (trimmed.startsWith('import') || trimmed.startsWith('export') ||
        trimmed.startsWith('function') || trimmed.startsWith('const') ||
        trimmed.startsWith('class') || trimmed.startsWith('interface')) {
      return trimmed;
    }

    return null;
  }

  /**
   * Format code using prettier if available
   */
  async formatCode(filePath: string): Promise<boolean> {
    try {
      execSync(`npx prettier --write "${filePath}"`, {
        cwd: this.rootDir,
        stdio: 'pipe'
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Apply multiple changes in batch
   */
  async applyBatch(changes: Array<{
    file: string;
    issue: CodeIssue;
  }>): Promise<ModificationResult[]> {
    const results: ModificationResult[] = [];

    // Create a git branch for all changes
    const branch = this.git.createImprovementBranch();
    if (!branch) {
      throw new Error('Failed to create improvement branch');
    }

    for (const change of changes) {
      const result = await this.applyFix(change.issue);
      results.push(result);

      // Stop if a critical change fails
      if (!result.success && change.issue.severity === 'critical') {
        // Rollback all changes
        this.git.rollback(branch);
        throw new Error(`Critical change failed: ${result.error}`);
      }
    }

    return results;
  }

  /**
   * Get a summary of changes
   */
  summarizeChanges(results: ModificationResult[]): {
    successful: number;
    failed: number;
    files: string[];
    needsReview: string[];
  } {
    return {
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      files: results.filter(r => r.success).map(r => r.file),
      needsReview: results.filter(r => r.needsReview).map(r => r.file)
    };
  }
}

// Singleton
let modifierInstance: CodeModifier | null = null;

export function getCodeModifier(): CodeModifier {
  if (!modifierInstance) {
    modifierInstance = new CodeModifier();
  }
  return modifierInstance;
}
