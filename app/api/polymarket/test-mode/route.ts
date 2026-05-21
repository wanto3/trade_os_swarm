import { NextRequest, NextResponse } from 'next/server'
import { ensureInitialized, getConfig, updateConfig } from '@/lib/services/polymarket-portfolio.service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json().catch(() => ({}))
    const enabled = Boolean(body.enabled)
    // When the user FLIPS ON test mode, reset lastDailyRunAt to null so
    // the next hourly scheduler tick fires immediately (otherwise they'd
    // have to wait up to 23h for the first auto-placement). We also
    // proactively fire a screening cycle in the background so picks
    // start landing within seconds, not at the next hourly tick.
    const updates: Parameters<typeof updateConfig>[0] = { testModeEnabled: enabled }
    if (enabled) updates.lastDailyRunAt = null
    const updated = await updateConfig(updates)

    if (enabled) {
      // Fire-and-forget: trigger an immediate screening + auto-place cycle.
      // Failures are non-fatal — the next hourly tick will catch up.
      const baseUrl = process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || '3000'}`
      fetch(`${baseUrl}/api/polymarket`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      }).catch((e) => {
        console.warn('[TestMode] instant-fire screening failed (non-fatal):', e instanceof Error ? e.message : e)
      })
    }

    return NextResponse.json({
      success: true,
      testModeEnabled: updated.testModeEnabled === true,
      lastDailyRunAt: updated.lastDailyRunAt ?? null,
      instantFireTriggered: enabled,
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
