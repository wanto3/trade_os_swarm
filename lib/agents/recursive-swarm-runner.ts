#!/usr/bin/env tsx
/**
 * Recursive Swarm Runner - Standalone script to run autonomous improvement
 *
 * This script runs the RecursiveAgentSwarm that:
 * 1. Analyzes code for improvements
 * 2. Creates git branches for changes
 * 3. Implements improvements
 * 4. Tests changes
 * 5. Merges if tests pass, rolls back if they fail
 */

import { getRecursiveSwarm } from './recursive-swarm';

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║     RECURSIVE AUTONOMOUS AGENT SWARM - RUNNER             ║
╚════════════════════════════════════════════════════════════╝
  `);

  const swarm = getRecursiveSwarm();

  // Show current state
  const state = swarm.getState();
  console.log(`📊 Current State:`);
  console.log(`   Iterations: ${state.currentIteration}`);
  console.log(`   Total Improvements: ${state.stats.totalImprovements}`);
  console.log(`   Files Modified: ${state.stats.filesModified.length}`);
  console.log(`   Rollbacks: ${state.stats.rollbacks}`);
  console.log(`   Max Cycles/Day: ${state.config.maxCyclesPerDay}`);
  console.log(`   Cycle Delay: ${state.config.cycleDelayMs / 1000}s`);
  console.log('');

  // Handle command line args
  const args = process.argv.slice(1);
  const command = args[0] || 'run';

  if (command === 'status' || command === '--status' || args.includes('--status')) {
    console.log(swarm.getReport());
    process.exit(0);
  }

  if (command === 'single' || args.includes('--single')) {
    console.log('🔄 Running single improvement cycle...\n');
    const result = await swarm.runSingleCycle();
    if (result) {
      console.log(`\n✅ Cycle completed: ${result.phase}`);
      if (result.changes.length > 0) {
        console.log(`   Files: ${result.changes.join(', ')}`);
      }
    }
    process.exit(0);
  }

  if (command === 'help' || command === '--help') {
    console.log(`
Usage: npx tsx lib/agents/recursive-swarm-runner.ts [command]

Commands:
  run              Run continuous improvement loop (default)
  single --single  Run a single improvement cycle
  status --status  Show current state and report
  help --help      Show this help

Config:
  Edit data/recursive-state.json to change:
  - maxCyclesPerDay: Maximum improvement cycles per day
  - maxChangesPerCycle: Max files to change per cycle
  - cycleDelayMs: Delay between cycles (default 30000 = 30s)
  - blacklistedFiles: Files to never modify

Example:
  npx tsx lib/agents/recursive-swarm-runner.ts run
  npx tsx lib/agents/recursive-swarm-runner.ts --single
    `);
    process.exit(0);
  }

  // Run continuous improvement
  console.log('🔄 Starting continuous improvement loop...');
  console.log('   Press Ctrl+C to stop\n');

  await swarm.startRecursiveImprovement();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Received interrupt signal...');
  const swarm = getRecursiveSwarm();
  swarm.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received terminate signal...');
  const swarm = getRecursiveSwarm();
  swarm.stop();
  process.exit(0);
});

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
