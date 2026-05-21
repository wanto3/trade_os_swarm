import { NextRequest, NextResponse } from 'next/server'
import { ensureInitialized, getConfig, updateConfig } from '@/lib/services/polymarket-portfolio.service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json().catch(() => ({}))
    const enabled = Boolean(body.enabled)
    const updated = await updateConfig({ testModeEnabled: enabled })
    return NextResponse.json({
      success: true,
      testModeEnabled: updated.testModeEnabled === true,
      lastDailyRunAt: updated.lastDailyRunAt ?? null,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    await ensureInitialized()
    const cfg = getConfig()
    return NextResponse.json({
      success: true,
      testModeEnabled: cfg.testModeEnabled === true,
      lastDailyRunAt: cfg.lastDailyRunAt ?? null,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
