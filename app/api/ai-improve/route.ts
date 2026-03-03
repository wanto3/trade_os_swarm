/**
 * AI Improvement API - Manual trigger for autonomous improvements
 *
 * Endpoints:
 * POST /api/ai-improve?action=analyze - Analyze code for issues
 * POST /api/ai-improve?action=fix - Apply a specific fix
 * POST /api/ai-improve?action=cycle - Run one improvement cycle
 * GET  /api/ai-improve?action=status - Get current status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRecursiveSwarm } from '@/lib/agents/recursive-swarm';
import { getCodeAnalyzer } from '@/lib/agents/code-analyzer';
import { getCodeModifier } from '@/lib/agents/code-modifier';
import { getLLMClient } from '@/lib/ai/llm-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Handle POST requests for AI improvements
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { action, file, issueId, improvement } = body;

  try {
    switch (action) {
      case 'analyze': {
        // Analyze codebase for issues
        const analyzer = getCodeAnalyzer();
        const results = await analyzer.scanProject(['app', 'components', 'lib']);

        const issues = results.flatMap(r => r.issues);
        const critical = issues.filter(i => i.severity === 'critical' || i.severity === 'high');

        return NextResponse.json({
          success: true,
          data: {
            totalIssues: issues.length,
            criticalIssues: critical.length,
            filesAnalyzed: results.length,
            issues: critical.slice(0, 10), // Return top 10 critical issues
            summary: {
              bySeverity: {
                critical: issues.filter(i => i.severity === 'critical').length,
                high: issues.filter(i => i.severity === 'high').length,
                medium: issues.filter(i => i.severity === 'medium').length,
                low: issues.filter(i => i.severity === 'low').length
              },
              byType: {
                bug: issues.filter(i => i.type === 'bug').length,
                performance: issues.filter(i => i.type === 'performance').length,
                feature: issues.filter(i => i.type === 'feature').length,
                ux: issues.filter(i => i.type === 'ux').length,
                todo: issues.filter(i => i.type === 'todo').length
              }
            }
          }
        });
      }

      case 'fix': {
        // Apply a specific fix
        if (!file) {
          return NextResponse.json({
            success: false,
            error: 'File path required'
          }, { status: 400 });
        }

        const modifier = getCodeModifier();
        const result = await modifier.applyFix({
          file,
          title: improvement?.title || 'Manual fix',
          description: improvement?.description || '',
          severity: improvement?.severity || 'medium',
          type: improvement?.type || 'bug',
          suggestedFix: improvement?.suggestedFix
        });

        return NextResponse.json({
          success: result.success,
          data: result
        });
      }

      case 'cycle': {
        // Run a single improvement cycle
        const swarm = getRecursiveSwarm();
        const cycle = await swarm.runSingleCycle();

        return NextResponse.json({
          success: true,
          data: {
            cycle,
            status: swarm.getStatus()
          }
        });
      }

      case 'generate': {
        // Generate code for a feature
        const { prompt, targetFile, description } = body;

        if (!prompt || !targetFile) {
          return NextResponse.json({
            success: false,
            error: 'Prompt and targetFile required'
          }, { status: 400 });
        }

        const modifier = getCodeModifier();
        const result = await modifier.applyFeature(prompt, description, targetFile);

        return NextResponse.json({
          success: result.success,
          data: result
        });
      }

      case 'trading-insight': {
        // Generate AI trading insight
        const { marketData, context } = body;

        const llm = getLLMClient();
        const insight = await llm.generateTradingInsight(marketData, context || []);

        return NextResponse.json({
          success: true,
          data: { insight }
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}

/**
 * Handle GET requests for status
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    const swarm = getRecursiveSwarm();

    switch (action) {
      case 'status':
        return NextResponse.json({
          success: true,
          data: swarm.getStatus()
        });

      case 'report':
        return NextResponse.json({
          success: true,
          data: {
            report: swarm.getReport(),
            state: swarm.getState()
          }
        });

      case 'health':
        const llmConfigured = !!process.env.ANTHROPIC_API_KEY;
        return NextResponse.json({
          success: true,
          data: {
            llm: llmConfigured ? 'configured' : 'not configured',
            git: swarm.getState().cycles.length > 0 ? 'active' : 'idle',
            cycles: swarm.getState().currentIteration
          }
        });

      default:
        return NextResponse.json({
          success: true,
          data: {
            message: 'AI Improvement API',
            endpoints: {
              'POST /api/ai-improve?action=analyze': 'Analyze code for issues',
              'POST /api/ai-improve?action=fix': 'Apply a specific fix',
              'POST /api/ai-improve?action=cycle': 'Run one improvement cycle',
              'POST /api/ai-improve?action=generate': 'Generate code for a feature',
              'POST /api/ai-improve?action=trading-insight': 'Generate AI trading insight',
              'GET /api/ai-improve?action=status': 'Get current status',
              'GET /api/ai-improve?action=report': 'Get improvement report',
              'GET /api/ai-improve?action=health': 'Health check'
            },
            health: {
              llm: !!process.env.ANTHROPIC_API_KEY,
              status: swarm.getStatus()
            }
          }
        });
    }
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
