#!/bin/bash
# Recursive Swarm Tmux Dashboard - Fixed Equal Layout
# 6 equal panes in a 2x3 grid

SESSION_NAME="recursive-swarm"

# Kill existing session
echo -e "\033[0;36m🧹 Cleaning up existing session...\033[0m"
tmux kill-session -t "$SESSION_NAME" 2>/dev/null
sleep 0.5

echo -e "\033[0;32m🤖 Creating 2x3 Grid Dashboard...\033[0m"

# Create monitoring scripts directory
MONITOR_DIR="/tmp/recursive-swarm-monitor"
rm -rf "$MONITOR_DIR"
mkdir -p "$MONITOR_DIR"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ============================================================================
# Panel Labels - Each pane will show which agent it is
# ============================================================================

# 1. MAIN SWARM RUNNER (Bottom Left)
cat > "$MONITOR_DIR/01-main-runner.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"
while true; do
    clear
    echo -e "\033[1;36m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\033[0m"
    echo -e "\033[1;36m┃  🚀 MAIN SWARM RUNNER (Autonomous Improvement)       ┃\033[0m"
    echo -e "\033[1;36m┃  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ┃\033[0m"
    echo -e "\033[1;36m┃  Analyzes → Implements → Tests → Merges/Rolls back   ┃\033[0m"
    echo -e "\033[1;36m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\033[0m"
    echo ""
    npx tsx lib/agents/recursive-swarm-runner.ts run 2>&1
    echo -e "\033[0;90mRestarting in 3s...\033[0m"
    sleep 3
done
EOF

# 2. STATE MONITOR (Top Left)
cat > "$MONITOR_DIR/02-state-monitor.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"
STATE_FILE="data/recursive-state.json"
while true; do
    sleep 0.1
    clear
    echo -e "\033[1;35m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\033[0m"
    echo -e "\033[1;35m┃  📊 STATE MONITOR AGENT                             ┃\033[0m"
    echo -e "\033[1;35m┃  Tracks: iterations, improvements, rollbacks         ┃\033[0m"
    echo -e "\033[1;35m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\033[0m"
    echo ""
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE" 2>/dev/null | jq -r '
            "  \033[1;33m▶ Iterations:\033[0m          \(.currentIteration)",
            "  \033[1;33m▶ Improvements:\033[0m        \(.stats.totalImprovements)",
            "  \033[1;33m▶ Tests Passed:\033[0m        \(.stats.successfulTests)",
            "  \033[1;33m▶ Tests Failed:\033[0m        \(.stats.failedTests)",
            "  \033[1;33m▶ Files Modified:\033[0m      \(.stats.filesModified | length)",
            "  \033[1;33m▶ Rollbacks:\033[0m           \(.stats.rollbacks)",
            "",
            "  \033[1;33m▶ Max Cycles/Day:\033[0m      \(.config.maxCyclesPerDay)",
            "  \033[1;33m▶ Cycle Delay:\033[0m         \(.config.cycleDelayMs / 1000)s"
        ' 2>/dev/null || echo "Error reading state"
    else
        echo -e "\033[31m  ⚠ State file not found\033[0m"
    fi
    echo ""
    echo -e "\033[0;90mUpdating every 2s...\033[0m"
    sleep 2
done
EOF

# 3. ACTIVITY LOG (Top Middle)
cat > "$MONITOR_DIR/03-activity-log.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"
STATE_FILE="data/recursive-state.json"
while true; do
    sleep 0.1
    clear
    echo -e "\033[1;32m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\033[0m"
    echo -e "\033[1;32m┃  📋 ACTIVITY LOG AGENT                              ┃\033[0m"
    echo -e "\033[1;32m┃  Shows: recent cycles, findings, results            ┃\033[0m"
    echo -e "\033[1;32m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\033[0m"
    echo ""
    if [ -f "$STATE_FILE" ]; then
        CYCLES=$(cat "$STATE_FILE" | jq -r '.cycles | length' 2>/dev/null)
        if [ "$CYCLES" -gt 0 ]; then
            cat "$STATE_FILE" 2>/dev/null | jq -r '
                .cycles[-4:] | reverse[] |
                "
\(.phase | if . == "completed" then "✅" elif . == "failed" then "❌" elif . == "analyzing" then "🔍" elif . == "implementing" then "🔧" elif . == "testing" then "🧪" else "🔄" end) Cycle

  \(.finding // "No description" | .[0:60] if length > 60 else .)

  Files: \([.changes[]] | join(", ") // "None" | .[0:50] if length > 50 else .)"
            ' 2>/dev/null
        else
            echo -e "\033[33m  ⏳ No cycles yet...\033[0m"
        fi
    else
        echo -e "\033[31m  ⚠ No activity yet\033[0m"
    fi
    echo ""
    echo -e "\033[0;90mUpdating every 2s...\033[0m"
    sleep 2
done
EOF

# 4. GIT MONITOR (Top Right)
cat > "$MONITOR_DIR/04-git-monitor.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"
while true; do
    sleep 0.1
    clear
    echo -e "\033[1;34m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\033[0m"
    echo -e "\033[1;34m┃  🔍 GIT MONITOR AGENT                               ┃\033[0m"
    echo -e "\033[1;34m┃  Tracks: branches, commits, changes                 ┃\033[0m"
    echo -e "\033[1;34m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\033[0m"
    echo ""
    echo -e "\033[1;33m▶ Current Branch:\033[0m"
    echo "   $(git branch --show-current 2>/dev/null || echo 'Not a git repo')"
    echo ""
    echo -e "\033[1;33m▶ Last 3 Commits:\033[0m"
    git log --oneline -3 2>/dev/null | sed 's/^/   /' || echo "   No commits"
    echo ""
    echo -e "\033[1;33m▶ Swarm Branches:\033[0m"
    BRANCHES=$(git branch 2>/dev/null | grep -E "improvement|autonomous|swarm" | tail -2)
    if [ -n "$BRANCHES" ]; then
        echo "$BRANCHES" | sed 's/^/   /'
    else
        echo "   None"
    fi
    echo ""
    echo -e "\033[1;33m▶ Changes:\033[0m"
    CHANGES=$(git status --short 2>/dev/null)
    if [ -n "$CHANGES" ]; then
        echo "$CHANGES" | sed 's/^/   /' | head -2
        [ $(echo "$CHANGES" | wc -l) -gt 2 ] && echo "   ... ($(echo "$CHANGES" | wc -l) total)"
    else
        echo -e "   \033[32m✅ Clean\033[0m"
    fi
    echo ""
    echo -e "\033[0;90mUpdating every 2s...\033[0m"
    sleep 2
done
EOF

# 5. FILE WATCHER (Bottom Middle)
cat > "$MONITOR_DIR/05-file-watcher.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"
while true; do
    sleep 0.1
    clear
    echo -e "\033[1;36m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\033[0m"
    echo -e "\033[1;36m┃  📁 FILE WATCHER AGENT                              ┃\033[0m"
    echo -e "\033[1;36m┃  Monitors: recently modified files, code stats       ┃\033[0m"
    echo -e "\033[1;36m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\033[0m"
    echo ""
    echo -e "\033[1;33m▶ Modified (24h):\033[0m"
    FILES=$(find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.next/*" -mtime -1 -printf "%T@ %p\n" 2>/dev/null | sort -r | head -6 | cut -d' ' -f2-)
    if [ -n "$FILES" ]; then
        echo "$FILES" | while read -r f; do
            [ -f "$f" ] && echo "   ${f#./}" | cut -c1-45
        done
    else
        echo "   No recent changes"
    fi
    echo ""
    echo -e "\033[1;33m▶ Code Stats:\033[0m"
    TS=$(find . -name "*.ts" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null | wc -l | tr -d ' ')
    TSX=$(find . -name "*.tsx" -not -path "*/node_modules/*" -not -path "*/.next/*" 2>/dev/null | wc -l | tr -d ' ')
    echo "   TS: $TS  |  TSX: $TSX"
    echo ""
    echo -e "\033[0;90mUpdating every 2s...\033[0m"
    sleep 2
done
EOF

# 6. API STATUS (Bottom Right)
cat > "$MONITOR_DIR/06-api-monitor.sh" << 'EOF'
#!/bin/bash
cd "$PROJECT_ROOT"
while true; do
    sleep 0.1
    clear
    echo -e "\033[1;33m┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\033[0m"
    echo -e "\033[1;33m┃  🔌 API MONITOR AGENT                               ┃\033[0m"
    echo -e "\033[1;33m┃  Checks: dev server, swarm API, agent status        ┃\033[0m"
    echo -e "\033[1;33m┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\033[0m"
    echo ""
    echo -e "\033[1;33m▶ Dev Server:\033[0m"
    if curl -s http://localhost:4000 > /dev/null 2>&1; then
        echo -e "   \033[32m✅ Running\033[0m (localhost:4000)"
    else
        echo -e "   \033[31m❌ Not running\033[0m"
    fi
    echo ""
    echo -e "\033[1;33m▶ Swarm API:\033[0m"
    SWARM=$(curl -s http://localhost:4000/api/swarm?action=status 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$SWARM" ]; then
        echo -e "   \033[32m✅ Responding\033[0m"
        ACTIVE=$(echo "$SWARM" | jq -r '.data.isActive // false' 2>/dev/null)
        [ "$ACTIVE" = "true" ] && echo -e "   \033[32m● Swarm ACTIVE\033[0m" || echo -e "   \033[33m○ Swarm IDLE\033[0m"
        echo ""
        echo -e "\033[1;33m▶ Agents:\033[0m"
        echo "$SWARM" | jq -r '.data.agents[] | "   \(.status | if . == "working" then "🔵" elif . == "idle" then "⚪" else "🔴" end) \(.name)"' 2>/dev/null | head -4
    else
        echo -e "   \033[31m❌ Not responding\033[0m"
        echo "   Run: npm run dev"
    fi
    echo ""
    echo -e "\033[0;90mUpdating every 2s...\033[0m"
    sleep 2
done
EOF

# Make all scripts executable
chmod +x "$MONITOR_DIR"/*.sh

# ============================================================================
# Create 2x3 Tmux Grid (using tiled layout for equal sizing)
# ============================================================================

# Create session with first window
tmux new-session -d -s "$SESSION_NAME" -n "Swarm" "$MONITOR_DIR/02-state-monitor.sh"

# Add 5 more windows (we'll tile them later)
for script in 03-activity-log.sh 04-git-monitor.sh 01-main-runner.sh 05-file-watcher.sh 06-api-monitor.sh; do
    tmux new-window -t "$SESSION_NAME" "$MONITOR_DIR/$script"
done

# Now tile all windows evenly in the first window
tmux select-window -t "$SESSION_NAME:0"

# Move all panes into window 0 and tile them
tmux move-pane -s "$SESSION_NAME:1" -t "$SESSION_NAME:0"
tmux move-pane -s "$SESSION_NAME:2" -t "$SESSION_NAME:0"
tmux move-pane -s "$SESSION_NAME:3" -t "$SESSION_NAME:0"
tmux move-pane -s "$SESSION_NAME:4" -t "$SESSION_NAME:0"

# Apply tiled layout (even grid)
tmux select-layout -t "$SESSION_NAME:0" tiled

# Enable mouse
tmux set-option -t "$SESSION_NAME" mouse on

# Better pane borders
tmux set-option -t "$SESSION_NAME" pane-border-style "fg=brightblack"
tmux set-option -t "$SESSION_NAME" pane-active-border-style "fg=green"

# Status bar
tmux set-option -t "$SESSION_NAME" status-left-length 40
tmux set-option -t "$SESSION_NAME" status-left " #[fg=green,bold]🤖 RECURSIVE SWARM #[default]|#[fg=cyan] 2x3 Grid #[default]"
tmux set-option -t "$SESSION_NAME" status-right " #[fg=cyan]%H:%M:%S "

# Show pane numbers on startup
tmux display-pane -t "$SESSION_NAME:0" -d 3000

echo ""
echo -e "\033[0;32m✅ Dashboard created with 2x3 equal grid!\033[0m"
echo ""
echo -e "\033[0;36m┌─────────────────────┬─────────────────────┬─────────────────────┐\033[0m"
echo -e "\033[0;36m│  📊 STATE MONITOR   │  📋 ACTIVITY LOG    │  🔍 GIT MONITOR     │\033[0m"
echo -e "\033[0;36m│  (Pane 0)           │  (Pane 1)           │  (Pane 2)           │\033[0m"
echo -e "\033[0;36m├─────────────────────┼─────────────────────┼─────────────────────┤\033[0m"
echo -e "\033[0;36m│  🚀 MAIN RUNNER     │  📁 FILE WATCHER    │  🔌 API MONITOR     │\033[0m"
echo -e "\033[0;36m│  (Pane 3)           │  (Pane 4)           │  (Pane 5)           │\033[0m"
echo -e "\033[0;36m└─────────────────────┴─────────────────────┴─────────────────────┘\033[0m"
echo ""
echo -e "\033[1;33mCommands:\033[0m"
echo -e "  \033[0;32mtmux attach -t $SESSION_NAME\033[0m  - Attach to dashboard"
echo -e "  \033[0;32mCtrl+B then 0-5\033[0m               - Jump to pane"
echo -e "  \033[0;32mCtrl+B then q\033[0m                 - Show pane numbers"
echo -e "  \033[0;32mCtrl+B then d\033[0m                 - Detach"
echo ""
echo -e "\033[1;33mTips:\033[0m"
echo -e "  • All panes are \033[0;32mequal size\033[0m"
echo -e "  • Mouse \033[0;32menabled\033[0m - click to select"
echo -e "  • Each panel has its agent name in header"
echo ""

read -p "Attach now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    exec tmux attach -t "$SESSION_NAME"
else
    echo -e "\n\033[0;32mRunning in background\033[0m - attach with: tmux attach -t $SESSION_NAME"
fi
