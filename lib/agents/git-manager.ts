/**
 * Git Manager - Safe git operations for autonomous code modification
 * Handles branching, commits, rollback, and merge operations
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

export interface GitStatus {
  branch: string;
  hasChanges: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface BranchInfo {
  name: string;
  current: boolean;
  commit?: string;
}

export class GitManager {
  private repoRoot: string;
  private enabled: boolean;

  constructor() {
    this.repoRoot = process.cwd();
    this.enabled = this.isGitRepo();
  }

  private isGitRepo(): boolean {
    return existsSync(join(this.repoRoot, '.git'));
  }

  private exec(command: string, throwOnError = false): string {
    try {
      return execSync(command, {
        cwd: this.repoRoot,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      }).trim();
    } catch (error: any) {
      if (throwOnError) throw error;
      console.error(`Git command failed: ${command}`, error.message);
      return '';
    }
  }

  /**
   * Get current git status
   */
  getStatus(): GitStatus {
    if (!this.enabled) {
      return {
        branch: 'none',
        hasChanges: false,
        staged: [],
        unstaged: [],
        untracked: []
      };
    }

    try {
      const branch = this.exec('git rev-parse --abbrev-ref HEAD');
      const status = this.exec('git status --porcelain');

      const staged: string[] = [];
      const unstaged: string[] = [];
      const untracked: string[] = [];

      status.split('\n').forEach(line => {
        if (!line) return;
        const statusCode = line.substring(0, 2);
        const filePath = line.substring(3);

        if (statusCode[0] !== ' ' && statusCode[0] !== '?') {
          staged.push(filePath);
        }
        if (statusCode[1] !== ' ') {
          unstaged.push(filePath);
        }
        if (statusCode === '??') {
          untracked.push(filePath);
        }
      });

      return {
        branch,
        hasChanges: status.length > 0,
        staged,
        unstaged,
        untracked
      };
    } catch (error) {
      console.error('Failed to get git status:', error);
      return {
        branch: 'unknown',
        hasChanges: false,
        staged: [],
        unstaged: [],
        untracked: []
      };
    }
  }

  /**
   * Create a new branch for improvements
   */
  createBranch(name: string): boolean {
    if (!this.enabled) return false;

    try {
      // First, ensure we're on main and it's clean
      const currentBranch = this.exec('git rev-parse --abbrev-ref HEAD');
      if (currentBranch !== 'main') {
        this.exec('git checkout main', true);
      }

      // Pull latest changes
      try {
        this.exec('git pull --ff-only');
      } catch {
        // Pull might fail if remote doesn't exist or is up to date
      }

      // Create and checkout new branch
      this.exec(`git checkout -b ${name}`, true);
      console.log(`✅ Created branch: ${name}`);
      return true;
    } catch (error: any) {
      console.error(`Failed to create branch ${name}:`, error.message);
      return false;
    }
  }

  /**
   * Create an improvement branch with timestamp
   */
  createImprovementBranch(): string | null {
    const timestamp = Date.now();
    const branchName = `improvement-${timestamp}`;
    return this.createBranch(branchName) ? branchName : null;
  }

  /**
   * Stage and commit changes
   */
  commit(files: string[], message: string): boolean {
    if (!this.enabled) return false;

    try {
      // Stage files
      if (files.length > 0) {
        this.exec(`git add ${files.join(' ')}`, true);
      } else {
        this.exec('git add -A', true);
      }

      // Commit
      this.exec(`git commit -m "${message}"`, true);
      console.log(`✅ Committed: ${message}`);
      return true;
    } catch (error: any) {
      console.error('Failed to commit:', error.message);
      return false;
    }
  }

  /**
   * Rollback changes - reset to before changes
   */
  rollback(branch: string, cleanup = true): boolean {
    if (!this.enabled) return false;

    try {
      // Switch back to main
      this.exec('git checkout main', true);

      // Delete the improvement branch
      if (cleanup) {
        this.exec(`git branch -D ${branch}`, true);
        console.log(`🔙 Rolled back and deleted branch: ${branch}`);
      }

      return true;
    } catch (error: any) {
      console.error(`Failed to rollback branch ${branch}:`, error.message);
      return false;
    }
  }

  /**
   * Merge improvement branch into main
   */
  mergeToMain(sourceBranch: string, deleteAfter = true): boolean {
    if (!this.enabled) return false;

    try {
      // Switch to main
      this.exec('git checkout main', true);

      // Merge the improvement branch
      this.exec(`git merge ${sourceBranch} --no-edit`, true);
      console.log(`✅ Merged ${sourceBranch} into main`);

      // Delete the source branch if requested
      if (deleteAfter) {
        this.exec(`git branch -d ${sourceBranch}`, true);
      }

      return true;
    } catch (error: any) {
      console.error(`Failed to merge ${sourceBranch}:`, error.message);

      // Abort merge if it failed
      try {
        this.exec('git merge --abort');
      } catch {}

      return false;
    }
  }

  /**
   * Get diff between commits or branches
   */
  getDiff(from?: string, to = 'HEAD'): string {
    if (!this.enabled) return '';

    try {
      const ref = from ? `${from}...${to}` : to;
      return this.exec(`git diff ${ref}`);
    } catch {
      return '';
    }
  }

  /**
   * Get diff for a specific file
   */
  getFileDiff(filePath: string, from = 'HEAD'): string {
    if (!this.enabled) return '';

    try {
      return this.exec(`git diff ${from} -- ${filePath}`);
    } catch {
      return '';
    }
  }

  /**
   * Stash current changes
   */
  stash(message = 'WIP'): boolean {
    if (!this.enabled) return false;

    try {
      this.exec(`git stash push -m "${message}"`, true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Pop stashed changes
   */
  stashPop(): boolean {
    if (!this.enabled) return false;

    try {
      this.exec('git stash pop', true);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all branches
   */
  listBranches(): BranchInfo[] {
    if (!this.enabled) return [];

    try {
      const output = this.exec('git branch -a');
      const current = this.exec('git rev-parse --abbrev-ref HEAD');

      return output.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const name = line.replace(/^\*?\s*/, '').trim();
          return {
            name: name.replace('remotes/origin/', ''),
            current: name === current
          };
        });
    } catch {
      return [];
    }
  }

  /**
   * Get recent commits
   */
  getRecentCommits(count = 10): GitCommit[] {
    if (!this.enabled) return [];

    try {
      const output = this.exec(`git log -${count} --pretty=format:"%H|%s|%an|%ad" --date=iso`);

      return output.split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
    } catch {
      return [];
    }
  }

  /**
   * Check if a file has uncommitted changes
   */
  fileHasChanges(filePath: string): boolean {
    const status = this.getStatus();
    return [
      ...status.staged,
      ...status.unstaged,
      ...status.untracked
    ].some(f => f === filePath || f.endsWith(filePath));
  }

  /**
   * Revert a specific commit
   */
  revertCommit(commitHash: string): boolean {
    if (!this.enabled) return false;

    try {
      this.exec(`git revert ${commitHash} --no-edit`, true);
      console.log(`✅ Reverted commit ${commitHash}`);
      return true;
    } catch (error: any) {
      console.error(`Failed to revert commit ${commitHash}:`, error.message);
      return false;
    }
  }

  /**
   * Create a backup of a file before modification
   */
  backupFile(filePath: string): string | null {
    try {
      const backupDir = join(this.repoRoot, '.backups');
      if (!existsSync(backupDir)) {
        mkdirSync(backupDir, { recursive: true });
      }

      const timestamp = Date.now();
      const backupPath = join(backupDir, `${filePath.replace(/\//g, '_')}.${timestamp}.bak`);
      const fullPath = join(this.repoRoot, filePath);

      if (existsSync(fullPath)) {
        const content = readFileSync(fullPath, 'utf-8');
        writeFileSync(backupPath, content);
        return backupPath;
      }

      return null;
    } catch (error) {
      console.error('Failed to backup file:', error);
      return null;
    }
  }

  /**
   * Restore a file from backup
   */
  restoreFile(filePath: string, backupPath: string): boolean {
    try {
      const content = readFileSync(backupPath, 'utf-8');
      const fullPath = join(this.repoRoot, filePath);
      writeFileSync(fullPath, content);
      return true;
    } catch (error) {
      console.error('Failed to restore file:', error);
      return false;
    }
  }

  /**
   * Get the current commit hash
   */
  getCurrentCommit(): string {
    if (!this.enabled) return 'unknown';
    return this.exec('git rev-parse HEAD') || 'unknown';
  }

  /**
   * Check if we're on main branch
   */
  isOnMain(): boolean {
    if (!this.enabled) return false;
    const branch = this.exec('git rev-parse --abbrev-ref HEAD');
    return branch === 'main';
  }

  /**
   * Get files modified since a commit
   */
  getFilesModifiedSince(commitHash: string): string[] {
    if (!this.enabled) return [];

    try {
      const output = this.exec(`git diff --name-only ${commitHash} HEAD`);
      return output.split('\n').filter(f => f.trim());
    } catch {
      return [];
    }
  }
}

// Singleton
let gitInstance: GitManager | null = null;

export function getGitManager(): GitManager {
  if (!gitInstance) {
    gitInstance = new GitManager();
  }
  return gitInstance;
}
