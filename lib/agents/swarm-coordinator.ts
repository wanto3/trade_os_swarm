/**
 * Swarm Coordinator - Central orchestration for AI agent swarm
 * Manages agent lifecycle, task distribution, and inter-agent communication
 */

import { AGENT_SWARM_CONFIG, SWARM_COORDINATION_CONFIG, AgentConfig, AgentTask } from './swarm-config';

export class SwarmCoordinator {
  private agents: Map<string, AgentState>;
  private taskQueue: AgentTask[] = [];
  private completedTasks: AgentTask[] = [];
  private isRunning: boolean = false;
  private evaluationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.agents = new Map();
    this.initializeAgents();
  }

  private initializeAgents(): void {
    for (const config of AGENT_SWARM_CONFIG) {
      const agentState: AgentState = {
        config,
        status: 'idle',
        currentTask: null,
        lastActivity: Date.now(),
        completedTasks: 0,
        successRate: 1.0
      };
      this.agents.set(config.id, agentState);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('Swarm is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 AI Agent Swarm starting...');

    // Start periodic evaluation
    this.evaluationInterval = setInterval(() => {
      this.evaluateSwarmProgress();
    }, SWARM_COORDINATION_CONFIG.swarmEvaluationInterval * 1000);

    // Start each agent
    for (const [agentId, agentState] of Array.from(this.agents.entries())) {
      this.startAgent(agentId);
    }

    console.log(`✅ Swarm started with ${this.agents.size} agents`);
    this.logAgentStatus();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    console.log('🛑 AI Agent Swarm stopping...');
    console.log(`📊 Final Stats: ${this.completedTasks.length} tasks completed`);
  }

  private async startAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    const runAgentCycle = async () => {
      if (!this.isRunning) return;

      try {
        await this.executeAgentCycle(agentId);
      } catch (error) {
        console.error(`❌ Agent ${agentId} cycle error:`, error);
        agent.status = 'error';
      }

      // Schedule next cycle
      if (this.isRunning) {
        setTimeout(runAgentCycle, agent.config.sleepInterval * 1000);
      }
    };

    // Start the agent loop
    setTimeout(runAgentCycle, Math.random() * 5000); // Random start delay
  }

  private async executeAgentCycle(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status === 'working') return;

    // Check dependencies
    const dependencies = this.checkDependencies(agentId);
    if (!dependencies.satisfied) {
      console.log(`⏳ ${agent.config.name} waiting for: ${dependencies.waitingFor.join(', ')}`);
      return;
    }

    // Check for pending tasks
    const task = this.getNextTaskForAgent(agentId);
    if (!task) {
      // Generate autonomous tasks based on agent role
      await this.generateAutonomousTask(agentId);
      return;
    }

    // Execute task
    agent.status = 'working';
    agent.currentTask = task.id;
    task.status = 'in_progress';

    console.log(`🔧 ${agent.config.name} working on: ${task.title}`);

    const result = await this.executeAgentTask(agentId, task);

    // Update agent state
    agent.status = 'idle';
    agent.currentTask = null;
    agent.lastActivity = Date.now();

    if (result.success) {
      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result.data;
      this.completedTasks.push(task);
      agent.completedTasks++;

      // Update success rate
      agent.successRate = agent.successRate * 0.9 + 0.1;

      console.log(`✅ ${agent.config.name} completed: ${task.title}`);
    } else {
      task.status = 'pending';
      agent.successRate = agent.successRate * 0.9;

      console.log(`⚠️ ${agent.config.name} failed: ${task.title} - ${result.error}`);
    }

    // Remove from queue
    this.taskQueue = this.taskQueue.filter(t => t.id !== task.id);
  }

  private checkDependencies(agentId: string): { satisfied: boolean; waitingFor: string[] } {
    const agent = this.agents.get(agentId);
    if (!agent) return { satisfied: true, waitingFor: [] };

    const waitingFor: string[] = [];
    for (const depId of agent.config.dependencies) {
      const depAgent = this.agents.get(depId);
      if (!depAgent || depAgent.status === 'error') {
        waitingFor.push(depId);
      }
    }

    return {
      satisfied: waitingFor.length === 0,
      waitingFor
    };
  }

  private getNextTaskForAgent(agentId: string): AgentTask | null {
    const agent = this.agents.get(agentId);
    if (!agent) return null;

    // Find highest priority pending task for this agent
    const tasks = this.taskQueue
      .filter(t => t.agentId === agentId && t.status === 'pending')
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    return tasks[0] || null;
  }

  private async generateAutonomousTask(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Each agent type generates tasks based on its role
    switch (agent.config.role) {
      case 'ui_ux_vision':
        await this.generateVisionTask(agentId);
        break;
      case 'market_researcher':
        await this.generateResearchTask(agentId);
        break;
      case 'qa_engineer':
        await this.generateTestingTask(agentId);
        break;
    }
  }

  private async generateVisionTask(agentId: string): Promise<void> {
    // Vision agent analyzes current app state
    const task: AgentTask = {
      id: `vision-${Date.now()}`,
      agentId,
      type: 'improvement',
      title: 'Analyze current app UI/UX for improvements',
      description: 'Evaluate the current trading dashboard and identify improvements for better decision making',
      priority: 'medium',
      status: 'pending',
      createdAt: Date.now()
    };

    this.taskQueue.push(task);
    console.log(`👁️ Vision Agent generated analysis task`);
  }

  private async generateResearchTask(agentId: string): Promise<void> {
    const researchTopics = [
      'Find best technical indicators for crypto trading',
      'Research top crypto influencers and their sentiment',
      'Analyze whale tracking tools and data sources',
      'Find best performing trading strategies',
      'Research on-chain analytics tools'
    ];

    const topic = researchTopics[Math.floor(Math.random() * researchTopics.length)];

    const task: AgentTask = {
      id: `research-${Date.now()}`,
      agentId,
      type: 'research',
      title: topic,
      description: `Research and compile findings on: ${topic}`,
      priority: 'medium',
      status: 'pending',
      createdAt: Date.now()
    };

    this.taskQueue.push(task);
    console.log(`📚 Research Agent generated task: ${topic}`);
  }

  private async generateTestingTask(agentId: string): Promise<void> {
    const task: AgentTask = {
      id: `test-${Date.now()}`,
      agentId,
      type: 'test',
      title: 'Run application health check',
      description: 'Test all API endpoints and verify core functionality',
      priority: 'high',
      status: 'pending',
      createdAt: Date.now()
    };

    this.taskQueue.push(task);
    console.log(`🧪 Testing Agent generated health check task`);
  }

  private async executeAgentTask(agentId: string, task: AgentTask): Promise<{ success: boolean; data?: any; error?: string }> {
    // This would call the actual agent implementation
    // For now, simulate task execution
    const agent = this.agents.get(agentId);
    if (!agent) return { success: false, error: 'Agent not found' };

    try {
      // Import and execute agent-specific task handler
      const handler = await this.getAgentHandler(agentId);
      const result = await handler.execute(task);

      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private async getAgentHandler(agentId: string): Promise<any> {
    // Dynamic import of agent handlers
    switch (agentId) {
      case 'ui-vision-agent':
        const { VisionAgent } = await import('./agents/vision-agent');
        return new VisionAgent();
      case 'frontend-agent':
        const { FrontendAgent } = await import('./agents/frontend-agent');
        return new FrontendAgent();
      case 'research-agent':
        const { ResearchAgent } = await import('./agents/research-agent');
        return new ResearchAgent();
      case 'testing-agent':
        const { TestingAgent } = await import('./agents/testing-agent');
        return new TestingAgent();
      case 'backend-agent':
        const { BackendAgent } = await import('./agents/backend-agent');
        return new BackendAgent();
      default:
        throw new Error(`Unknown agent: ${agentId}`);
    }
  }

  private evaluateSwarmProgress(): void {
    console.log('\n📊 Swarm Progress Report');
    console.log('='.repeat(50));

    for (const [agentId, agent] of Array.from(this.agents.entries())) {
      console.log(`
${agent.config.name} (${agentId}):
  Status: ${agent.status}
  Tasks Completed: ${agent.completedTasks}
  Success Rate: ${(agent.successRate * 100).toFixed(1)}%
  Last Activity: ${new Date(agent.lastActivity).toLocaleString()}
      `);
    }

    console.log(`\nPending Tasks: ${this.taskQueue.length}`);
    console.log(`Completed Tasks: ${this.completedTasks.length}`);
    console.log('='.repeat(50) + '\n');
  }

  private logAgentStatus(): void {
    console.log('\n🤖 Agent Swarm Status:');
    console.log('─'.repeat(50));
    for (const [agentId, agent] of Array.from(this.agents.entries())) {
      console.log(`  ${agent.config.name.padEnd(20)} ${agentId}`);
      console.log(`    Role: ${agent.config.role}`);
      console.log(`    Priority: ${agent.config.priority}`);
      console.log(`    Check Interval: ${agent.config.sleepInterval}s`);
      console.log('');
    }
    console.log('─'.repeat(50) + '\n');
  }

  // Public API for task management
  addTask(task: Omit<AgentTask, 'id' | 'createdAt' | 'status'>): string {
    const newTask: AgentTask = {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: Date.now(),
      status: 'pending'
    };

    this.taskQueue.push(newTask);
    return newTask.id;
  }

  getTasks(agentId?: string): { pending: AgentTask[]; completed: AgentTask[] } {
    const pending = agentId
      ? this.taskQueue.filter(t => t.agentId === agentId)
      : this.taskQueue;

    const completed = agentId
      ? this.completedTasks.filter(t => t.agentId === agentId)
      : this.completedTasks;

    return { pending, completed };
  }

  getAgentStatus(): any[] {
    return Array.from(this.agents.entries()).map(([id, state]) => ({
      id,
      name: state.config.name,
      status: state.status,
      currentTask: state.currentTask,
      completedTasks: state.completedTasks,
      successRate: state.successRate
    }));
  }
}

interface AgentState {
  config: AgentConfig;
  status: 'idle' | 'working' | 'error';
  currentTask: string | null;
  lastActivity: number;
  completedTasks: number;
  successRate: number;
}

// Singleton instance
let coordinatorInstance: SwarmCoordinator | null = null;

export function getSwarmCoordinator(): SwarmCoordinator {
  if (!coordinatorInstance) {
    coordinatorInstance = new SwarmCoordinator();
  }
  return coordinatorInstance;
}
