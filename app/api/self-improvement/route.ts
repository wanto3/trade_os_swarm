/**
 * Self-Improvement API
 * Provides capability analysis and improvement suggestions
 */

import { NextRequest, NextResponse } from 'next/server';
import { buildCapabilityRegistry, getKnownGaps } from '@/lib/capability-registry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'status';

  try {
    switch (action) {
      case 'registry':
        // Build and return the capability registry
        const registry = await buildCapabilityRegistry(process.cwd());
        return NextResponse.json({
          success: true,
          data: registry
        });

      case 'gaps':
        // Return known missing capabilities
        return NextResponse.json({
          success: true,
          data: {
            gaps: getKnownGaps(),
            count: getKnownGaps().length
          }
        });

      case 'status':
      default:
        // Return current status
        const currentRegistry = await buildCapabilityRegistry(process.cwd());
        return NextResponse.json({
          success: true,
          data: {
            status: 'operational',
            lastUpdate: currentRegistry.lastUpdated,
            totalCapabilities: currentRegistry.totalCapabilities,
            categories: currentRegistry.categories.map(c => ({
              name: c.name,
              count: c.capabilities.length,
              score: c.coverageScore
            })),
            suggestions: currentRegistry.improvementSuggestions.length,
            improvements: currentRegistry.improvementSuggestions
          }
        });
    }
  } catch (error) {
    console.error('Self-improvement API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, capabilityId, implementation } = body;

    switch (action) {
      case 'implement':
        // This would trigger the feature generator
        // For now, return a stub response
        return NextResponse.json({
          success: true,
          data: {
            message: `Implementation requested for: ${capabilityId}`,
            status: 'queued',
            implementation
          }
        });

      case 'analyze':
        // Trigger a fresh analysis
        const registry = await buildCapabilityRegistry(process.cwd());
        return NextResponse.json({
          success: true,
          data: {
            message: 'Analysis complete',
            registry
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Self-improvement POST error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}