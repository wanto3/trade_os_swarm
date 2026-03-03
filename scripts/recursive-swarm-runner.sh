#!/bin/bash
# Recursive Swarm Runner - Runs the autonomous improvement agents
# This script runs the recursive swarm that continuously improves the app

set -e

cd "$(dirname "$0")/.."

echo "🚀 Starting Recursive Agent Swarm..."
echo "   This will run autonomous improvement cycles"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build if needed
if [ ! -d ".next" ]; then
    echo "🔨 Building Next.js..."
    npm run build
fi

# Run the recursive swarm via TypeScript
npx tsx --tsconfig tsconfig.json lib/agents/recursive-swarm-runner.ts
