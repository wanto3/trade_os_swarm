#!/bin/bash
# Live swarm monitor - updates activity in real-time

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
RED='\033[0;31m'
NC='\033[0m'

clear

while true; do
    clear
    echo -e "${CYAN}📜 SWARM ACTIVITY LOG${NC}"
    echo "═══════════════════════════════════════════════════════"
    echo ""
    echo "$(date '+%Y-%m-%d %H:%M:%S')"
    echo ""

    # Fetch swarm status from API
    STATUS=$(curl -s "http://localhost:4000/api/swarm?action=status" 2>/dev/null)

    if [ $? -eq 0 ] && echo "$STATUS" | grep -q '"success":true'; then
        echo -e "${GREEN}✓ Swarm is running${NC}"
        echo ""

        # Parse and display agent status
        echo "$STATUS" | grep -o '"agents":\[.*\]' | sed 's/"agents"://' | jq -r '.[] |
            "  \(.name // "Unknown")
     Status: \(.status // "unknown")
     Task: \(.currentTask // "None")
     Completed: \(.completedTasks // 0)
     Success Rate: \((.successRate * 100) // 0 | floor)%"' 2>/dev/null || echo "  (Parsing agents...)"
    else
        echo -e "${YELLOW}⚠ Swarm API not responding on port 4000${NC}"
        echo ""
        echo "Start the app with: npm run dev -- -p 4000"
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "Refreshing in 5 seconds... (Ctrl+C to exit)"

    sleep 5
done
