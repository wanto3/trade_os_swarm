/**
 * Feature Implementation API
 * Trigger the self-improvement system to add new capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { generateFeature, listAvailableFeatures } from '@/lib/feature-generator';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'list';

  try {
    switch (action) {
      case 'list':
        // List all available features that can be generated
        const features = listAvailableFeatures();
        return NextResponse.json({
          success: true,
          data: {
            available: features.length,
            features
          }
        });

      case 'status':
        // Return implementation status
        return NextResponse.json({
          success: true,
          data: {
            message: 'Feature generator ready',
            availableCount: listAvailableFeatures().length
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Feature generator API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { featureId, action } = body;

    switch (action) {
      case 'implement':
        if (!featureId) {
          return NextResponse.json({
            success: false,
            error: 'featureId is required'
          }, { status: 400 });
        }

        // Generate and implement the feature
        const result = await generateFeature(featureId);

        return NextResponse.json({
          success: result.success,
          data: {
            featureId: result.featureId,
            filesCreated: result.filesCreated,
            errors: result.errors,
            timestamp: result.timestamp,
            message: result.success
              ? `Successfully implemented ${result.featureId}`
              : `Implementation completed with ${result.errors.length} errors`
          }
        });

      case 'preview':
        // Preview what would be created without actually creating files
        const { getFeatureSpec } = await import('@/lib/feature-generator');
        const spec = getFeatureSpec(featureId);

        if (!spec) {
          return NextResponse.json({
            success: false,
            error: `No feature specification found for: ${featureId}`
          }, { status: 404 });
        }

        return NextResponse.json({
          success: true,
          data: {
            featureId,
            spec,
            files: spec.files.map(f => f.path)
          }
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown action'
        }, { status: 400 });
    }
  } catch (error) {
    console.error('Feature implementation API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}