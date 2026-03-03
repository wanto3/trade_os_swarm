#!/bin/bash
# Autonomous Agents Dashboard - 4 Agents Running in Parallel
# Each agent works independently to improve the app

SESSION_NAME="autonomous-agents"

echo -e "\033[0;36m🤖 Starting Autonomous Agents Dashboard...\033[0m"

# Kill existing session
tmux kill-session -t "$SESSION_NAME" 2>/dev/null
sleep 0.5

# Create monitoring scripts directory
MONITOR_DIR="/tmp/autonomous-agents"
rm -rf "$MONITOR_DIR"
mkdir -p "$MONITOR_DIR"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ============================================================================
# AGENT 1: FRONTEND AGENT - Works on UI/UX improvements
# ============================================================================
cat > "$MONITOR_DIR/frontend-agent.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"

while true; do
    clear
    echo -e "\033[1;36m╔════════════════════════════════════════════════════════════╗\033[0m"
    echo -e "\033[1;36m║  💻 FRONTEND AGENT                                     \033[0m\033[1;36m║\033[0m"
    echo -e "\033[1;36m║  Working on: UI components, styling, responsiveness      \033[0m\033[1;36m║\033[0m"
    echo -e "\033[1;36m╚════════════════════════════════════════════════════════════╝\033[0m"
    echo ""

    echo -e "\033[1;33m🔄 Current Cycle:\033[0m"
    echo "   Scanning frontend codebase for improvements..."
    echo ""

    # Run the frontend agent
    npx tsx -e "
        const { FrontendAgent } = require('./lib/agents/agents/frontend-agent');
        const agent = new FrontendAgent();

        (async () => {
            const result = await agent.execute({
                id: 'fe-' + Date.now(),
                agentId: 'frontend-agent',
                type: 'improvement',
                title: 'Scan for Frontend Improvements',
                description: 'Review UI components and suggest enhancements',
                priority: 'medium',
                status: 'pending',
                createdAt: Date.now()
            });

            console.log('');
            console.log('✅ Cycle Complete');
            console.log('');
            console.log('📊 Results:');
            console.log('   Improvements Found:', result.data?.improvementsFound || 0);
            console.log('   Review Completed:', result.data?.reviewCompleted || false);
            console.log('');

            if (result.recommendations && result.recommendations.length > 0) {
                console.log('💡 Recommendations:');
                result.recommendations.slice(0, 5).forEach((rec, i) => {
                    console.log('   ' + (i+1) + '. [' + rec.priority.toUpperCase() + '] ' + rec.title);
                    console.log('      ' + rec.description.substring(0, 60) + '...');
                });
            }
        })();
    " 2>&1

    echo ""
    echo -e "\033[0;90m⏸️  Waiting 30s before next cycle... (Ctrl+C to stop)\033[0m"
    sleep 30
done
EOF

# ============================================================================
# AGENT 2: BACKEND AGENT - Works on API and services
# ============================================================================
cat > "$MONITOR_DIR/backend-agent.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"

while true; do
    clear
    echo -e "\033[1;34m╔════════════════════════════════════════════════════════════╗\033[0m"
    echo -e "\033[1;34m║  ⚙️  BACKEND AGENT                                     \033[0m\033[1;34m║\033[0m"
    echo -e "\033[1;34m║  Working on: APIs, services, optimization                \033[0m\033[1;34m║\033[0m"
    echo -e "\033[1;34m╚════════════════════════════════════════════════════════════╝\033[0m"
    echo ""

    echo -e "\033[1;33m🔄 Current Cycle:\033[0m"
    echo "   Reviewing backend architecture and APIs..."
    echo ""

    # Run the backend agent
    npx tsx -e "
        const { BackendAgent } = require('./lib/agents/agents/backend-agent');
        const agent = new BackendAgent();

        (async () => {
            const result = await agent.execute({
                id: 'be-' + Date.now(),
                agentId: 'backend-agent',
                type: 'improvement',
                title: 'Scan for Backend Improvements',
                description: 'Review API endpoints and services',
                priority: 'medium',
                status: 'pending',
                createdAt: Date.now()
            });

            console.log('');
            console.log('✅ Cycle Complete');
            console.log('');
            console.log('📊 Results:');
            console.log('   Improvements Found:', result.data?.improvementsFound || 0);
            console.log('   Review Completed:', result.data?.reviewCompleted || false);
            console.log('');

            if (result.recommendations && result.recommendations.length > 0) {
                console.log('💡 Recommendations:');
                result.recommendations.slice(0, 5).forEach((rec, i) => {
                    console.log('   ' + (i+1) + '. [' + rec.priority.toUpperCase() + '] ' + rec.title);
                    console.log('      ' + rec.description.substring(0, 60) + '...');
                });
            }
        })();
    " 2>&1

    echo ""
    echo -e "\033[0;90m⏸️  Waiting 30s before next cycle... (Ctrl+C to stop)\033[0m"
    sleep 30
done
EOF

# ============================================================================
# AGENT 3: RESEARCH AGENT - Researches improvements
# ============================================================================
cat > "$MONITOR_DIR/research-agent.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"

while true; do
    clear
    echo -e "\033[1;32m╔════════════════════════════════════════════════════════════╗\033[0m"
    echo -e "\033[1;32m║  📚 RESEARCH AGENT                                     \033[0m\033[1;32m║\033[0m"
    echo -e "\033[1;32m║  Working on: indicators, strategies, data sources        \033[0m\033[1;32m║\033[0m"
    echo -e "\033[1;32m╚════════════════════════════════════════════════════════════╝\033[0m"
    echo ""

    echo -e "\033[1;33m🔄 Current Cycle:\033[0m"
    echo "   Researching best practices and new features..."
    echo ""

    # Run the research agent
    npx tsx -e "
        const { ResearchAgent } = require('./lib/agents/agents/research-agent');
        const agent = new ResearchAgent();

        (async () => {
            const result = await agent.execute({
                id: 'res-' + Date.now(),
                agentId: 'research-agent',
                type: 'research',
                title: 'Conduct Market Research',
                description: 'Find best indicators, strategies, and data sources',
                priority: 'medium',
                status: 'pending',
                createdAt: Date.now()
            });

            console.log('');
            console.log('✅ Research Complete');
            console.log('');
            console.log('📊 Results:');
            console.log('   Findings Count:', result.data?.findingsCount || 0);
            console.log('   Total Findings:', result.data?.totalFindings || 0);
            console.log('');

            if (result.recommendations && result.recommendations.length > 0) {
                console.log('🔍 Top Findings:');
                result.recommendations.slice(0, 5).forEach((rec, i) => {
                    console.log('   ' + (i+1) + '. [' + rec.priority.toUpperCase() + '] ' + rec.title);
                    console.log('      ' + rec.description.substring(0, 60) + '...');
                });
            }
        })();
    " 2>&1

    echo ""
    echo -e "\033[0;90m⏸️  Waiting 30s before next cycle... (Ctrl+C to stop)\033[0m"
    sleep 30
done
EOF

# ============================================================================
# AGENT 4: TESTING AGENT - Runs tests and QA
# ============================================================================
cat > "$MONITOR_DIR/testing-agent.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"

while true; do
    clear
    echo -e "\033[1;35m╔════════════════════════════════════════════════════════════╗\033[0m"
    echo -e "\033[1;35m║  🧪 TESTING AGENT                                     \033[0m\033[1;35m║\033[0m"
    echo -e "\033[1;35m║  Working on: tests, QA, validation                     \033[0m\033[1;35m║\033[0m"
    echo -e "\033[1;35m╚════════════════════════════════════════════════════════════╝\033[0m"
    echo ""

    echo -e "\033[1;33m🔄 Current Cycle:\033[0m"
    echo "   Running test suite and health checks..."
    echo ""

    # Run the testing agent
    npx tsx -e "
        const { TestingAgent } = require('./lib/agents/agents/testing-agent');
        const agent = new TestingAgent();

        (async () => {
            const result = await agent.execute({
                id: 'test-' + Date.now(),
                agentId: 'testing-agent',
                type: 'test',
                title: 'Run Test Suite',
                description: 'Execute all tests and report results',
                priority: 'high',
                status: 'pending',
                createdAt: Date.now()
            });

            console.log('');
            console.log('✅ Testing Complete');
            console.log('');

            if (result.data?.suite) {
                const suite = result.data.suite;
                const passRate = ((suite.passed / suite.totalTests) * 100).toFixed(1);

                console.log('📊 Test Results:');
                console.log('   Total Tests:', suite.totalTests);
                console.log('   ✅ Passed:', suite.passed);
                console.log('   ❌ Failed:', suite.failed);
                console.log('   Duration:', suite.duration + 'ms');
                console.log('   Pass Rate:', passRate + '%');
                console.log('');

                if (suite.failed > 0) {
                    console.log('⚠️  Failed Tests:');
                    suite.results.filter(r => r.status === 'fail').forEach(r => {
                        console.log('   -', r.name);
                    });
                }
            }

            if (result.recommendations && result.recommendations.length > 0) {
                console.log('');
                console.log('💡 Recommendations:');
                result.recommendations.forEach(rec => {
                    console.log('   [' + rec.priority.toUpperCase() + ']', rec.title);
                });
            }
        })();
    " 2>&1

    echo ""
    echo -e "\033[0;90m⏸️  Waiting 30s before next cycle... (Ctrl+C to stop)\033[0m"
    sleep 30
done
EOF

# ============================================================================
# AGENT 5: COORDINATOR - Shows overall swarm status
# ============================================================================
cat > "$MONITOR_DIR/coordinator.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"

while true; do
    sleep 0.1
    clear
    echo -e "\033[1;33m╔════════════════════════════════════════════════════════════╗\033[0m"
    echo -e "\033[1;33m║  🤖 SWARM COORDINATOR                                 \033[0m\033[1;33m║\033[0m"
    echo -e "\033[1;33m║  Overall progress and coordination                     \033[0m\033[1;33m║\033[0m"
    echo -e "\033[1;33m╚════════════════════════════════════════════════════════════╝\033[0m"
    echo ""

    echo -e "\033[1;33m🤖 Active Agents:\033[0m"
    echo "   💻 Frontend Agent  - Analyzing UI components"
    echo "   ⚙️  Backend Agent  - Reviewing API architecture"
    echo "   📚 Research Agent  - Finding new indicators"
    echo "   🧪 Testing Agent   - Running test suite"
    echo ""

    # Check git status
    echo -e "\033[1;33m📁 Git Status:\033[0m"
    BRANCH=$(git branch --show-current 2>/dev/null)
    echo "   Branch: $BRANCH"

    CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
    if [ "$CHANGES" -gt 0 ]; then
        echo "   Changes: $CHANGES file(s) modified"
    else
        echo "   Changes: Working directory clean"
    fi
    echo ""

    # Recent commits by agents
    echo -e "\033[1;33m📋 Recent Agent Activity:\033[0m"
    git log --oneline --all -5 2>/dev/null | sed 's/^/   /' || echo "   No recent commits"
    echo ""

    # Check if dev server is running
    echo -e "\033[1;33m🔌 Services:\033[0m"
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo "   ✅ Dev Server (localhost:4000)"
    else
        echo "   ⚠️  Dev Server not running"
    fi

    if curl -s http://localhost:4000/api/swarm?action=status > /dev/null 2>&1; then
        echo "   ✅ Swarm API responding"
    else
        echo "   ⚠️  Swarm API not responding"
    fi
    echo ""

    echo -e "\033[1;33m⏱️  Uptime:\033[0m"
    UPTIME=$(ps -o etime= -p $$ | tr -d ' ')
    echo "   Dashboard running for: ${UPTIME:-unknown}"
    echo ""

    echo -e "\033[0;90mUpdating every 2s... Ctrl+C to exit\033[0m"
    sleep 2
done
EOF

# Make all scripts executable
chmod +x "$MONITOR_DIR"/*.sh

# ============================================================================
# Create 2x3 Tmux Grid Layout
# ============================================================================

# Row 1: Frontend, Backend, Research
tmux new-session -d -s "$SESSION_NAME" -n "Agents" "$MONITOR_DIR/frontend-agent.sh"
tmux split-window -h -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/backend-agent.sh"
tmux split-window -h -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/research-agent.sh"

# Row 2: Testing, Coordinator (spanning 2 panes)
tmux select-pane -t "$SESSION_NAME:0.0"
tmux split-window -v -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/testing-agent.sh"

tmux select-pane -t "$SESSION_NAME:0.1"
tmux split-window -v -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/coordinator.sh"

# Merge the bottom-right panes for coordinator
tmux select-pane -t "$SESSION_NAME:0.4"
tmux kill-pane -a -t "$SESSION_NAME:0.4" 2>/dev/null || true
tmux split-window -h -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/coordinator.sh"

# Actually, let's redo this properly - equal 2x3 grid
tmux kill-session -t "$SESSION_NAME" 2>/dev/null

# Create proper 2x3 grid
tmux new-session -d -s "$SESSION_NAME" -n "Agents" "$MONITOR_DIR/frontend-agent.sh"
tmux split-window -h -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/backend-agent.sh"
tmux split-window -h -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/research-agent.sh"

tmux select-pane -t "$SESSION_NAME:0.0"
tmux split-window -v -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/testing-agent.sh"

tmux select-pane -t "$SESSION_NAME:0.1"
tmux split-window -v -p 50 -t "$SESSION_NAME:0" "$MONITOR_DIR/coordinator.sh"

tmux select-pane -t "$SESSION_NAME:0.2"
tmux split-window -v -p 50 -t "$MONITOR_DIR/coordinator.sh"

# Use tiled layout for equal sizing
tmux select-layout -t "$SESSION_NAME:0" tiled

# Enable mouse
tmux set-option -t "$SESSION_NAME" mouse on

# Better pane borders
tmux set-option -t "$SESSION_NAME" pane-border-style "fg=brightblack"
tmux set-option -t "$SESSION_NAME" pane-active-border-style "fg=green"

# Status bar
tmux set-option -t "$SESSION_NAME" status-left-length 40
tmux set-option -t "$SESSION_NAME" status-left " #[fg=green,bold]🤖 AUTONOMOUS AGENTS #[default]|#[fg=cyan] 4 Agents Running #[default]"
tmux set-option -t "$SESSION_NAME" status-right " #[fg=cyan]%H:%M:%S "

# Show pane numbers
tmux display-pane -t "$SESSION_NAME:0" -d 2000

echo ""
echo -e "\033[0;32m✅ Autonomous Agents Dashboard Started!\033[0m"
echo ""
echo -e "\033[0;36m┌─────────────────────┬─────────────────────┬─────────────────────┐\033[0m"
echo -e "\033[0;36m│  💻 FRONTEND       │  ⚙️  BACKEND        │  📚 RESEARCH       │\033[0m"
echo -e "\033[0;36m│  UI/UX Improvements │  API & Services     │  Indicators & Data  │\033[0m"
echo -e "\033[0;36m├─────────────────────┼─────────────────────┼─────────────────────┤\033[0m"
echo -e "\033[0;36m│  🧪 TESTING        │  🤖 COORDINATOR     │  (extra space)     │\033[0m"
echo -e "\033[0;36m│  QA & Validation    │  Swarm Status       │                    │\033[0m"
echo -e "\033[0;36m└─────────────────────┴─────────────────────┴─────────────────────┘\033[0m"
echo ""
echo -e "\033[1;33mEach agent:\033[0m"
echo "  • Runs autonomously in continuous 30-second cycles"
echo "  • Analyzes code and generates recommendations"
echo "  • Works in parallel with other agents"
echo ""
echo -e "\033[1;33mCommands:\033[0m"
echo -e "  \033[0;32mtmux attach -t $SESSION_NAME\033[0m  - Attach to dashboard"
echo -e "  \033[0;32mCtrl+B then d\033[0m                 - Detach (keeps running)"
echo -e "  \033[0;32mCtrl+B then 0-4\033[0m               - Jump to pane"
echo ""
echo -e "\033[1;33mTip:\033[0m Mouse enabled - click panes to select"
echo ""

read -p "Attach now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    exec tmux attach -t "$SESSION_NAME"
else
    echo -e "\n\033[0;32mRunning in background\033[0m - attach with: tmux attach -t $SESSION_NAME"
fi
