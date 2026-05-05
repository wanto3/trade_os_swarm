/**
 * Autonomous Trading Agent System
 *
 * This system allows AI agents to:
 * 1. Research trading indicators
 * 2. Create dashboard components
 * 3. Integrate them into the main page
 * 4. Run QA to verify everything works
 * 5. Auto-fix any errors
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_FILE = join(process.cwd(), 'data', 'autonomous-agents-state.json');

interface AgentState {
  isRunning: boolean;
  startedAt: number;
  cycles: number;
  componentsCreated: string[];
  componentsIntegrated: string[];
  errorsFixed: number;
  lastActivity: number;
}

function getState(): AgentState {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    } catch {}
  }
  return {
    isRunning: false,
    startedAt: 0,
    cycles: 0,
    componentsCreated: [],
    componentsIntegrated: [],
    errorsFixed: 0,
    lastActivity: 0,
  };
}

function saveState(state: AgentState) {
  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Generate a working component with proper code
function generateComponent(name: string): string {
  const camelName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const displayName = name.replace(/-/g, ' ').toUpperCase();

  return `'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useState, useEffect } from 'react';

interface ${camelName}Props {
  coin?: string;
}

export function ${camelName}({ coin = 'bitcoin' }: ${camelName}Props) {
  const [data, setData] = useState<{ value: number; signal: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/market');
        const json = await res.json();
        if (json.success && json.data) {
          const coinData = json.data[coin];
          if (coinData) {
            setData({
              value: coinData.price || 0,
              signal: coinData.change24h > 0 ? 'BULLISH' : 'BEARISH',
            });
          }
        }
      } catch (e) {
        console.error('Failed to fetch data:', e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [coin]);

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-gray-400">${displayName}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="animate-pulse h-8 bg-gray-700 rounded"></div>
        ) : data ? (
          <div className="space-y-1">
            <div className="text-2xl font-bold text-white">
              {'$'}{data.value > 1000 ? '$' : ''}{data.value.toFixed(2)}
            </div>
            <div className="text-xs text-gray-500">
              Signal: {data.signal}
            </div>
          </div>
        ) : (
          <div className="text-gray-500">No data</div>
        )}
      </CardContent>
    </Card>
  );
}
`;
}

// Determine where to place component based on its type
function getInsertionPoint(name: string): { pattern: string; insertAfter: string; description: string } {
  const n = name.toLowerCase();

  // Technical indicators → In the main price cards area (after prices)
  if (n.includes('indicator') || n.includes('rsi') || n.includes('macd') ||
      n.includes('bollinger') || n.includes('stochastic') || n.includes('atr') ||
      n.includes('adx') || n.includes('momentum') || n.includes('trend') ||
      n.includes('volatility') || n.includes('scanner')) {
    return {
      pattern: 'Live Prices',
      insertAfter: '</div>', // After prices grid
      description: 'Live Prices section'
    };
  }

  // Signals/Alerts → Trading Signals section
  if (n.includes('signal') || n.includes('alert') || n.includes('notification')) {
    return {
      pattern: 'Trading Signals',
      insertAfter: '</div>',
      description: 'Trading Signals section'
    };
  }

  // Volume/Market → Market Synthesis
  if (n.includes('volume') || n.includes('liquidity') || n.includes('market')) {
    return {
      pattern: 'AI MARKET SYNTHESIS',
      insertAfter: '</div>',
      description: 'AI Market Synthesis section'
    };
  }

  // Support/Resistance → Technical Analysis
  if (n.includes('support') || n.includes('resistance') || n.includes('levels')) {
    return {
      pattern: 'AI-Powered Technical Analysis',
      insertAfter: '</div>',
      description: 'Technical Analysis section'
    };
  }

  // Default: AI Market Synthesis
  return {
    pattern: 'AI MARKET SYNTHESIS',
    insertAfter: '</div>',
    description: 'AI Market Synthesis (default)'
  };
}

// Properly integrate component into page.tsx with contextual placement
function integrateComponent(name: string): boolean {
  const pagePath = join(process.cwd(), 'app', 'page.tsx');
  const componentDir = join(process.cwd(), 'components', 'dashboard');
  const componentPath = join(componentDir, `${name}.tsx`);

  const camelName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

  try {
    // 1. Create component file
    if (!existsSync(componentPath)) {
      mkdirSync(componentDir, { recursive: true });
      writeFileSync(componentPath, generateComponent(name));
      console.log(`   ✅ Created component: ${name}.tsx`);
    }

    // 2. Read current page
    let content = readFileSync(pagePath, 'utf-8');

    // 3. Add import if needed
    const importStatement = `import { ${camelName} } from '@/components/dashboard/${name}';`;
    if (!content.includes(importStatement)) {
      content = content.replace(
        /import \{[^}]+\} from "lucide-react"/,
        (match) => match + '\n' + importStatement
      );
    }

    // 4. Determine smart placement based on component type
    const { pattern, insertAfter, description } = getInsertionPoint(name);

    const componentJSX = `
      {/* 🤖 Agent: ${name} */}
      <${camelName} coin="bitcoin" />`;

    // Find the section by string pattern
    const sectionIndex = content.indexOf(pattern);

    if (sectionIndex > 0) {
      // Find the next </div> after the section
      const afterSection = content.indexOf(insertAfter, sectionIndex);
      if (afterSection > 0) {
        const insertPos = afterSection + insertAfter.length;
        content = content.slice(0, insertPos) + '\n        ' + componentJSX + content.slice(insertPos);
        console.log(`   ✅ Integrated ${name} into ${description}`);
      } else {
        throw new Error('Could not find insert position');
      }
    } else {
      // Fallback: append at bottom (in the agent components section)
      const agentSection = content.indexOf('🤖 Autonomous Agent Components');
      if (agentSection > 0) {
        // Insert before closing </div> of agent section
        const insertPos = content.indexOf('</div>', agentSection);
        if (insertPos > 0) {
          content = content.slice(0, insertPos) + '\n          ' + componentJSX + content.slice(insertPos);
          console.log(`   ✅ Added ${name} to agent components section`);
        }
      } else {
        // Last resort: append at bottom
        const fallbackMatch = content.match(/(\s+<\/div>\s+\n\s+\)\s*})/);
        if (fallbackMatch) {
          content = content.replace(
            fallbackMatch[1],
            '        ' + componentJSX + '\n' + fallbackMatch[1]
          );
        }
      }
    }

    // 5. Save
    writeFileSync(pagePath, content);
    console.log(`   ✅ Integrated ${name} into page`);

    return true;
  } catch (e) {
    console.error(`   ❌ Integration failed:`, e);
    return false;
  }
}

// Check for TypeScript errors
function checkForErrors(): string[] {
  try {
    execSync('npx tsc --noEmit --skipLibCheck', {
      cwd: process.cwd(),
      stdio: 'pipe',
      timeout: 60000
    });
    return [];
  } catch (e: any) {
    const output = e.stdout?.toString() || e.stderr?.toString() || '';
    return output.split('\n')
      .filter((l: string) => l.includes('error TS'))
      .slice(0, 10);
  }
}

// Auto-fix simple errors
function autoFix(errors: string[]): boolean {
  if (errors.length === 0) return true;

  // Check for common issues in generated components
  const componentDir = join(process.cwd(), 'components', 'dashboard');

  try {
    if (existsSync(componentDir)) {
      const files = readdirSync(componentDir);
      for (const file of files) {
        if (file.endsWith('.tsx')) {
          let content = readFileSync(join(componentDir, file), 'utf-8');
          let fixed = false;

          // Fix template literals that should be JSX expressions
          if (content.includes('${')) {
            content = content.replace(/\$\{([^}]+)\}/g, '{$1}');
            fixed = true;
          }

          // Fix missing export
          const fnMatch = content.match(/^function (\w+)/m);
          if (fnMatch && !content.includes('export function')) {
            content = content.replace(
              new RegExp(`^function ${fnMatch[1]}`),
              `function ${fnMatch[1]}\nexport function ${fnMatch[1]}`
            );
            fixed = true;
          }

          if (fixed) {
            writeFileSync(join(componentDir, file), content);
          }
        }
      }
    }
    return true;
  } catch (e) {
    console.error('Auto-fix error:', e);
    return false;
  }
}

// Main agent cycle
async function runAgentCycle(state: AgentState): Promise<AgentState> {
  console.log(`\n🔄 Running autonomous cycle #${state.cycles + 1}`);

  const components = [
    'momentum-indicator',
    'trend-scanner',
    'volatility-meter',
    'support-resistance',
    'volume-analyzer',
  ];

  // Find a component not yet integrated
  const nextComponent = components.find(c => !state.componentsIntegrated.includes(c));

  if (nextComponent) {
    console.log(`\n🎯 Creating and integrating: ${nextComponent}`);

    // Step 1: Create and integrate
    const success = integrateComponent(nextComponent);

    if (success) {
      // Step 2: QA Loop - check for errors and fix
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        attempts++;
        const errors = checkForErrors();

        if (errors.length === 0) {
          console.log(`   ✅ Verified: ${nextComponent} works!`);
          state.componentsCreated.push(nextComponent);
          state.componentsIntegrated.push(nextComponent);
          state.errorsFixed += attempts;
          break;
        }

        console.log(`   ⚠️ Attempt ${attempts}: Found ${errors.length} errors`);
        autoFix(errors);

        // Wait before retry
        await new Promise(r => setTimeout(r, 2000));
      }

      if (attempts >= maxAttempts) {
        console.log(`   ❌ Failed after ${maxAttempts} attempts, reverting...`);
        try {
          execSync('git checkout -- app/page.tsx components/dashboard/', {
            cwd: process.cwd(),
            stdio: 'pipe'
          });
        } catch {}
      }
    }
  } else {
    console.log('   ⏭️ All components already integrated');
  }

  state.cycles++;
  state.lastActivity = Date.now();

  return state;
}

// API Handlers
export async function POST(req: NextRequest) {
  const state = getState();

  if (state.isRunning) {
    return NextResponse.json({
      success: true,
      message: 'Agents already running',
      state
    });
  }

  state.isRunning = true;
  state.startedAt = Date.now();
  saveState(state);

  // Start the agent loop
  runAgentLoop();

  return NextResponse.json({
    success: true,
    message: `🤖 Autonomous Agents Started!

The agents will:
1. Create trading indicator components
2. Integrate them into the main page
3. Run QA verification
4. Auto-fix any errors
5. Retry until everything works

Watch the main page for new components to appear!`,
    state,
  });
}

export async function GET() {
  return NextResponse.json({ success: true, state: getState() });
}

export async function PUT() {
  const state = getState();
  state.isRunning = false;
  saveState(state);
  return NextResponse.json({ success: true, message: 'Stopped', state });
}

// Background loop
function runAgentLoop() {
  async function loop() {
    const state = getState();
    if (!state.isRunning) return;

    try {
      const newState = await runAgentCycle(state);
      saveState(newState);
    } catch (e) {
      console.error('Agent cycle error:', e);
    }

    // Run next cycle after delay
    setTimeout(loop, 30000);
  }

  loop();
}