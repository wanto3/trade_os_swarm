#!/bin/bash
# Simple tmux practice session

SESSION="tmux-practice"

# Kill existing practice session
tmux kill-session -t $SESSION 2>/dev/null

# Create new session
tmux new-session -d -s $SESSION -n "Window1"
tmux send-keys -t $SESSION "echo 'You are in Window 1'" C-m

# Create 3 more windows
tmux new-window -t $SESSION:1 -n "Window2"
tmux send-keys -t $SESSION:1 "echo 'You are in Window 2 - Press Ctrl+B then 0 to go back'" C-m

tmux new-window -t $SESSION:2 -n "Window3"
tmux send-keys -t $SESSION:2 "echo 'You are in Window 3'" C-m

tmux new-window -t $SESSION:3 -n "Window4"
tmux send-keys -t $SESSION:3 "echo 'You are in Window 4'" C-m

# Go back to first window
tmux select-window -t $SESSION:0

echo "✅ Practice session created!"
echo ""
echo "Now attach with: tmux attach -t $SESSION"
echo ""
echo "Once inside, try:"
echo "  Ctrl+B then 1 → Go to Window 2"
echo "  Ctrl+B then 2 → Go to Window 3"
echo "  Ctrl+B then 3 → Go to Window 4"
echo "  Ctrl+B then 0 → Go back to Window 1"
echo "  Ctrl+B then n → Next window"
echo "  Ctrl+B then p → Previous window"
echo "  Ctrl+B then d → Detach (exit)"
