/**
 * Base Agent class - All agents extend this
 */

import { AgentTask } from '../swarm-config';

export interface AgentExecuteResult {
  success: boolean;
  data?: any;
  error?: string;
  recommendations?: Recommendation[];
}

export interface Recommendation {
  type: string;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  agent?: string;
  timestamp?: number;
}

export abstract class BaseAgent {
  abstract readonly name: string;
  abstract readonly role: string;

  /**
   * Execute a task - main entry point for agent work
   */
  abstract execute(task: AgentTask): Promise<AgentExecuteResult>;

  /**
   * Analyze current state and suggest improvements
   */
  abstract analyzeAndSuggest(): Promise<string[]>;

  /**
   * Get agent's current context and capabilities
   */
  getContext(): Record<string, any> {
    return {
      name: this.name,
      role: this.role,
      timestamp: Date.now()
    };
  }

  /**
   * Log agent activity
   */
  protected log(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    const prefix = {
      info: '📋',
      warning: '⚠️',
      error: '❌'
    }[level];

    console.log(`${prefix} [${this.name}] ${message}`);
  }

  /**
   * Create a recommendation
   */
  protected createRecommendation(
    type: string,
    title: string,
    description: string,
    priority: 'critical' | 'high' | 'medium' | 'low'
  ): Recommendation {
    return {
      type,
      title,
      description,
      priority,
      agent: this.name,
      timestamp: Date.now()
    };
  }
}
