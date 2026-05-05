/**
 * Auto-Improvement Scheduler
 * Automatically runs self-improvement on a schedule
 */

import { generateFeature, listAvailableFeatures } from './feature-generator';
import { buildCapabilityRegistry } from './capability-registry';
import * as fs from 'fs';
import * as path from 'path';

export interface AutoImproveConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxPerCycle: number;
  implementedFeatures: string[];
  lastRun: string | null;
  totalImplemented: number;
}

const STATE_FILE = path.join(process.cwd(), 'data', 'auto-improve-state.json');

const DEFAULT_CONFIG: AutoImproveConfig = {
  enabled: false,
  intervalMinutes: 30,
  maxPerCycle: 2,
  implementedFeatures: [],
  lastRun: null,
  totalImplemented: 0
};

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Load the auto-improve configuration
 */
export function loadConfig(): AutoImproveConfig {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Failed to load auto-improve config:', error);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Save the auto-improve configuration
 */
export function saveConfig(config: AutoImproveConfig): void {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save auto-improve config:', error);
  }
}

/**
 * Run the auto-improvement cycle
 */
export async function runAutoImproveCycle(): Promise<{
  success: boolean;
  implemented: string[];
  errors: string[];
  timestamp: string;
}> {
  const config = loadConfig();
  const results = {
    success: true,
    implemented: [] as string[],
    errors: [] as string[],
    timestamp: new Date().toISOString()
  };

  // Get all available features
  const availableFeatures = listAvailableFeatures();

  // Find features that haven't been implemented yet
  const unimprovedFeatures = availableFeatures.filter(
    f => !config.implementedFeatures.includes(f.id)
  );

  // Implement up to maxPerCycle features
  const featuresToImplement = unimprovedFeatures.slice(0, config.maxPerCycle);

  for (const feature of featuresToImplement) {
    try {
      const result = await generateFeature(feature.id);

      if (result.success) {
        config.implementedFeatures.push(feature.id);
        results.implemented.push(feature.id);
      } else {
        results.errors.push(...result.errors);
      }
    } catch (error) {
      results.errors.push(`Failed to implement ${feature.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      results.success = false;
    }
  }

  // Update config
  config.lastRun = results.timestamp;
  config.totalImplemented = config.implementedFeatures.length;
  saveConfig(config);

  // Build new capability registry
  try {
    await buildCapabilityRegistry(process.cwd());
  } catch (e) {
    // Ignore registry errors
  }

  return results;
}

/**
 * Start the auto-improvement scheduler
 */
export function startScheduler(): void {
  const config = loadConfig();

  if (schedulerInterval) {
    console.log('Scheduler already running');
    return;
  }

  if (!config.enabled) {
    console.log('Auto-improve is disabled');
    return;
  }

  const intervalMs = config.intervalMinutes * 60 * 1000;

  // Run immediately on start
  runAutoImproveCycle().then(() => {
    console.log(`Auto-improvement cycle completed`);
  });

  // Schedule regular runs
  schedulerInterval = setInterval(() => {
    runAutoImproveCycle().then(() => {
      console.log(`Auto-improvement cycle completed`);
    });
  }, intervalMs);

  console.log(`Auto-improvement scheduler started (every ${config.intervalMinutes} minutes)`);
}

/**
 * Stop the auto-improvement scheduler
 */
export function stopScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('Auto-improvement scheduler stopped');
  }
}

/**
 * Enable and start the scheduler
 */
export function enableAutoImprove(intervalMinutes = 30, maxPerCycle = 2): AutoImproveConfig {
  const config = loadConfig();
  config.enabled = true;
  config.intervalMinutes = intervalMinutes;
  config.maxPerCycle = maxPerCycle;
  saveConfig(config);

  startScheduler();

  return config;
}

/**
 * Disable and stop the scheduler
 */
export function disableAutoImprove(): AutoImproveConfig {
  stopScheduler();

  const config = loadConfig();
  config.enabled = false;
  saveConfig(config);

  return config;
}

/**
 * Get current scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean;
  config: AutoImproveConfig;
} {
  return {
    running: schedulerInterval !== null,
    config: loadConfig()
  };
}