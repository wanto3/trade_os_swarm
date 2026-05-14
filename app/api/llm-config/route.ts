/**
 * /api/llm-config — read/write the active LLM provider preference.
 *
 *   GET   → current model + availability of each provider
 *   POST  { model: LLMPreference } → set the preferred model
 *   DELETE → clear preference (falls back to env-var default)
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  loadPreferredModel,
  savePreferredModel,
  clearPreferredModel,
  getProviderAvailability,
  type LLMPreference,
} from '@/lib/services/llm-preference.service'

export const dynamic = 'force-dynamic'

const VALID_MODELS: LLMPreference[] = [
  'opus', 'sonnet', 'haiku',
  'anthropic-opus', 'anthropic-sonnet', 'anthropic-haiku',
  'groq',
]

export async function GET() {
  try {
    const [stored, availability] = await Promise.all([
      loadPreferredModel(),
      Promise.resolve(getProviderAvailability()),
    ])
    const envDefault = (process.env.SCREENING_MODEL as LLMPreference | undefined) || 'opus'
    return NextResponse.json({
      success: true,
      preferredModel: stored ?? envDefault,
      hasUserOverride: !!stored,
      envDefault,
      availability,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const model = body.model as LLMPreference
    if (!VALID_MODELS.includes(model)) {
      return NextResponse.json({
        success: false,
        error: `Invalid model. Choose one of: ${VALID_MODELS.join(', ')}`,
      }, { status: 400 })
    }
    await savePreferredModel(model)
    return NextResponse.json({
      success: true,
      preferredModel: model,
      hasUserOverride: true,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    await clearPreferredModel()
    return NextResponse.json({ success: true, preferredModel: null })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
