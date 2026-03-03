/**
 * AI Agent Swarm Configuration for Crypto Trading OS
 *
 * This system orchestrates multiple AI agents working together to improve the app recursively.
 */

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  capabilities: string[];
  priority: number;
  sleepInterval: number; // seconds between active work cycles
  dependencies: string[]; // other agents this agent depends on
}

export interface AgentTask {
  id: string;
  agentId: string;
  type: 'improvement' | 'feature' | 'bugfix' | 'research' | 'test';
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  createdAt: number;
  completedAt?: number;
  result?: any;
}

export const AGENT_SWARM_CONFIG: AgentConfig[] = [
  {
    id: 'ui-vision-agent',
    name: 'Vision Agent',
    role: 'ui_ux_vision',
    description: 'Analyzes the current app state and identifies significant improvements and features to help users make informed decisions in the moment.',
    capabilities: [
      'visual_analysis',
      'user_experience_evaluation',
      'feature_identification',
      'decision_support_optimization',
      'real_time_context_analysis'
    ],
    priority: 1,
    sleepInterval: 60, // Check every minute for improvements
    dependencies: []
  },
  {
    id: 'frontend-agent',
    name: 'Frontend Agent',
    role: 'frontend_developer',
    description: 'Works on frontend implementation, UI components, responsive design, and user interactions.',
    capabilities: [
      'component_development',
      'styling_and_layout',
      'responsive_design',
      'state_management',
      'animation_and_transitions',
      'accessibility'
    ],
    priority: 2,
    sleepInterval: 30,
    dependencies: ['ui-vision-agent'] // Waits for vision agent recommendations
  },
  {
    id: 'research-agent',
    name: 'Research Agent',
    role: 'market_researcher',
    description: 'Continuously researches and integrates best indicators, influencer sentiment, top trader positions, and market intelligence.',
    capabilities: [
      'indicator_research',
      'social_sentiment_tracking',
      'influencer_analysis',
      'whale_tracking',
      'market_data_aggregation',
      'trading_strategy_research'
    ],
    priority: 3,
    sleepInterval: 120, // Research every 2 minutes
    dependencies: []
  },
  {
    id: 'testing-agent',
    name: 'Testing Agent',
    role: 'qa_engineer',
    description: 'Continuously tests the application to ensure all features work correctly, performs regression testing, and reports issues.',
    capabilities: [
      'automated_testing',
      'integration_testing',
      'e2e_testing',
      'regression_testing',
      'performance_monitoring',
      'bug_detection'
    ],
    priority: 4,
    sleepInterval: 90,
    dependencies: ['frontend-agent', 'backend-agent'] // Tests after changes
  },
  {
    id: 'backend-agent',
    name: 'Backend Agent',
    role: 'backend_developer',
    description: 'Works on API development, data processing, business logic, performance optimization, and database operations.',
    capabilities: [
      'api_development',
      'data_processing',
      'service_optimization',
      'caching_strategies',
      'websocket_streams',
      'data_persistence'
    ],
    priority: 5,
    sleepInterval: 45,
    dependencies: ['research-agent'] // Uses research data
  }
];

export const SWARM_COORDINATION_CONFIG = {
  // Port for agent coordination server (avoiding 3001 and 3005)
  coordinationPort: 4000,

  // How often the swarm evaluates its overall progress
  swarmEvaluationInterval: 300, // 5 minutes

  // Maximum concurrent agents allowed to work
  maxConcurrentAgents: 3,

  // Task queue settings
  taskQueue: {
    maxPendingTasks: 50,
    taskRetentionDays: 30,
    autoPruneCompleted: true
  },

  // Communication settings
  communication: {
    enableBroadcast: true,
    enableDirectMessaging: true,
    messageHistoryLimit: 100
  },

  // Learning and improvement
  learning: {
    trackSuccessRate: true,
    learnFromFailures: true,
    adaptivePrioritization: true
  }
};

export type SwarmConfigType = typeof SWARM_COORDINATION_CONFIG;
