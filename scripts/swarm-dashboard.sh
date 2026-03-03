#!/bin/bash
# Crypto Trader OS - AI Agent Swarm Live Dashboard

SESSION_NAME="crypto-swarm"

# Kill existing session
tmux kill-session -t "$SESSION_NAME" 2>/dev/null
sleep 0.5

echo "🤖 Creating AI Swarm Dashboard..."

# Create monitoring function
cat > /tmp/monitor.sh << 'EOF'
#!/bin/bash
NAME="$1"
ID="$2"
while true; do
    clear
    curl -s http://localhost:4000/api/swarm?action=status | jq -r "
        .data.agents[] | select(.id == \"$ID\") |
        \"\n\033[1;36m$NAME\033[0m
\033[0;37m═════════════════════════════\033[0m
Status:  \(.status | ascii_upcase)
Task:    \(.currentTask // \"None\")
Done:    \(.completedTasks) tasks
Success: \((.successRate * 100) | floor)%%
\033[0;90mLive updating...\033[0m\"
    " 2>/dev/null || echo "\033[1;31m⚠️  API Offline\033[0m"
    sleep 2
done
EOF
chmod +x /tmp/monitor.sh

# Create 2x3 grid manually
# Top row
tmux new-session -d -s "$SESSION_NAME" "/tmp/monitor.sh '👁️ VISION' 'ui-vision-agent'"
tmux split-window -h -t "$SESSION_NAME:0" "/tmp/monitor.sh '💻 FRONTEND' 'frontend-agent'"
tmux split-window -h -t "$SESSION_NAME:0" "/tmp/monitor.sh '📚 RESEARCH' 'research-agent'"

# Bottom row - split each pane vertically
tmux select-pane -t "$SESSION_NAME:0.0"
tmux split-window -v -t "$SESSION_NAME:0" "/tmp/monitor.sh '⚙️ BACKEND' 'backend-agent'"

tmux select-pane -t "$SESSION_NAME:0.1"
tmux split-window -v -t "$SESSION_NAME:0" "/tmp/monitor.sh '🧪 TESTING' 'testing-agent'"

tmux select-pane -t "$SESSION_NAME:0.2"
tmux split-window -v -t "$SESSION_NAME:0" "/tmp/monitor.sh '📊 OVERVIEW' 'overview-agent'"

# Set tiled layout
tmux select-layout -t "$SESSION_NAME:0" tiled

echo "✅ Dashboard ready!"
echo "Attach: tmux attach -t $SESSION_NAME"
echo "Exit pane: type 'exit' or Ctrl+B then d"
