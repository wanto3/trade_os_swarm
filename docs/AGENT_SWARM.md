# AI Agent Swarm - Crypto Trading OS

An autonomous swarm of AI agents that work together to improve the crypto trading app over time.

## 🤖 The Agents

### 1. Vision Agent (UI/UX)
- **Role**: Analyzes current app state and identifies improvements
- **Focus**: Decision support features, UX improvements
- **Check Interval**: Every 60 seconds

### 2. Frontend Agent
- **Role**: Implements UI components and features
- **Focus**: Component development, styling, responsiveness
- **Check Interval**: Every 30 seconds

### 3. Research Agent
- **Role**: Market intelligence and data source research
- **Focus**: Best indicators, influencer sentiment, whale tracking
- **Check Interval**: Every 120 seconds

### 4. Backend Agent
- **Role**: API development and optimization
- **Focus**: Endpoints, data processing, caching, WebSockets
- **Check Interval**: Every 45 seconds

### 5. Testing Agent
- **Role**: Quality assurance and automated testing
- **Focus**: Health checks, regression testing, bug detection
- **Check Interval**: Every 90 seconds

## 🚀 Usage

### Start the Swarm Dashboard (tmux)

```bash
npm run dev:swarm
```

This opens a tmux session with live views of all agents:
- **Window 0**: Main dashboard overview
- **Windows 1-5**: Individual agent activity
- **Window 6**: API server logs
- **Window 7**: Live activity feed

### Start Development Server

```bash
npm run dev
```

Server runs on port **4000** (avoiding conflicts with 3001/3005).

### Monitor Only

```bash
npm run swarm:monitor
```

Shows live swarm activity in your terminal.

## 📡 API Endpoints

### Get Swarm Status
```bash
curl http://localhost:4000/api/swarm?action=status
```

### Get Tasks
```bash
curl http://localhost:4000/api/swarm?action=tasks
```

### Get Recommendations
```bash
curl http://localhost:4000/api/swarm?action=recommendations
```

### Start Swarm
```bash
curl -X POST http://localhost:4000/api/swarm \
  -H "Content-Type: application/json" \
  -d '{"action": "start"}'
```

### Add Custom Task
```bash
curl -X POST http://localhost:4000/api/swarm \
  -H "Content-Type: application/json" \
  -d '{
    "action": "task",
    "agentId": "frontend-agent",
    "type": "feature",
    "title": "Add dark mode",
    "description": "Implement dark/light theme toggle",
    "priority": "medium"
  }'
```

## 📁 File Structure

```
lib/agents/
├── swarm-config.ts          # Agent configuration and coordination settings
├── swarm-coordinator.ts     # Main orchestrator for agent lifecycle
└── agents/
    ├── base-agent.ts        # Base class all agents extend
    ├── vision-agent.ts      # UI/UX analysis agent
    ├── frontend-agent.ts    # Frontend implementation agent
    ├── research-agent.ts    # Market research agent
    ├── backend-agent.ts     # Backend development agent
    ├── testing-agent.ts     # QA/testing agent
    └── index.ts             # Export all agents
```

## 🔄 How It Works

1. **Vision Agent** analyzes the app and identifies improvements
2. **Research Agent** continuously gathers market intelligence
3. **Frontend/Backend Agents** implement recommended features
4. **Testing Agent** ensures everything works correctly
5. **Cycle repeats** - the swarm continuously improves the app

## 🛠️ tmux Commands

Once in the dashboard:
- `Ctrl+B` then `1-5` - Switch to specific agent window
- `Ctrl+B` then `0` - Back to main dashboard
- `Ctrl+B` then `d` - Detach (keeps swarm running)
- `Ctrl+B` then `q` - Quit (detach and close)
- `exit` - Close current window

To reattach later:
```bash
tmux attach -t crypto-swarm
```

To kill the session:
```bash
tmux kill-session -t crypto-swarm
```

## 📊 Agent Status Indicators

- 🟢 **Idle** - Agent waiting for work
- 🟡 **Working** - Agent actively processing
- 🔴 **Error** - Agent encountered an issue
- 🔵 **Waiting** - Agent waiting for dependencies

## 🎯 Priority Levels

- **Critical** - Immediate attention required
- **High** - Important, should be done soon
- **Medium** - Normal priority tasks
- **Low** - Nice to have improvements

## 🔧 Configuration

Edit `lib/agents/swarm-config.ts` to customize:
- Agent check intervals
- Task queue limits
- Communication settings
- Swarm coordination settings
