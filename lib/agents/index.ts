/**
 * Agents Module - Exports all agent-related functionality
 */

// Base agent classes
export { BaseAgent } from './agents/base-agent';
export type { AgentExecuteResult, Recommendation } from './agents/base-agent';

// Individual agents
export { VisionAgent } from './agents/vision-agent';
export { FrontendAgent } from './agents/frontend-agent';
export { ResearchAgent } from './agents/research-agent';
export { BackendAgent } from './agents/backend-agent';
export { TestingAgent } from './agents/testing-agent';

// Swarm configuration
export { AGENT_SWARM_CONFIG, SWARM_COORDINATION_CONFIG } from './swarm-config';
export type { AgentConfig, AgentTask, SwarmConfigType } from './swarm-config';

// Swarm coordinator
export { SwarmCoordinator } from './swarm-coordinator';

// Recursive swarm
export { RecursiveAgentSwarm, getRecursiveSwarm } from './recursive-swarm';
export type { ImprovementCycle, RecursiveState } from './recursive-swarm';

// Autonomous trading swarm
export { AutonomousTradingSwarm, getAutonomousTradingSwarm } from './autonomous-trading-swarm';
export type { AutonomousCycle, AutonomousState } from './autonomous-trading-swarm';

// Code analysis and modification
export { CodeAnalyzer, getCodeAnalyzer } from './code-analyzer';
export type { CodeIssue, AnalysisResult, FileAnalysis } from './code-analyzer';

export { CodeModifier, getCodeModifier } from './code-modifier';
export type { ModificationResult, CodePatch, PatchChange } from './code-modifier';

export { GitManager, getGitManager } from './git-manager';
export type { GitStatus, GitCommit, BranchInfo } from './git-manager';

// Trading-focused agents
export { TradingFeatureScanner, getTradingFeatureScanner } from './trading-feature-scanner';
export type { MissingFeature, TradingFeatureReport } from './trading-feature-scanner';

export { DataSourceResearcher, getDataSourceResearcher } from './data-source-researcher';
export type { DataSource, IntegratedDataSource, KNOWN_DATA_SOURCES } from './data-source-researcher';

export { StrategyGenerator, getStrategyGenerator } from './strategy-generator';
export type { TradingStrategy, BacktestResult, StrategySignal } from './strategy-generator';

export { TradingUXOptimizer, getTradingUXOptimizer } from './trading-ux-optimizer';
export type { UXImprovement, DecisionSupportElement } from './trading-ux-optimizer';
