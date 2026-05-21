/**
 * Next.js instrumentation hook — runs once when the server starts.
 *
 * Pre-warms the Polymarket analysis cache so the user's FIRST dashboard
 * visit after `npm run dev` is instant instead of waiting 30-50s for
 * the cold Opus pipeline.
 *
 * Background warm-up runs after a short delay to let the dev server
 * finish booting. Failures are logged but don't block startup.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const port = process.env.PORT || '3000'
  const url = `http://localhost:${port}/api/polymarket`

  // Wait 5s for the server to start accepting connections, then fire-and-forget.
  setTimeout(() => {
    console.log('[instrumentation] Pre-warming Polymarket cache (Opus 4.7 batched analysis)…')
    const start = Date.now()
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1)
        if (!res.ok) {
          console.warn(`[instrumentation] Pre-warm failed: HTTP ${res.status} after ${elapsed}s`)
          return
        }
        const data = await res.json()
        const opps = (data?.opportunities || []).length
        console.log(`[instrumentation] Pre-warm complete in ${elapsed}s — ${opps} opportunities cached, ready for first user visit`)
      })
      .catch((e) => {
        console.warn('[instrumentation] Pre-warm failed:', e instanceof Error ? e.message : e)
      })
  }, 5000)

  // Daily auto-trade scheduler — ticks every 60 minutes, fires a full
  // screening + auto-place cycle when 23h+ have elapsed since the last
  // run. Lets the algorithm test mode generate paper-trade picks once
  // per day even when the dashboard is closed. No-op when test mode
  // is disabled (the tick logs but doesn't place anything).
  //
  // Survives container restarts via persisted lastDailyRunAt in the
  // auto-trader config. If a restart happens mid-day, the next tick
  // sees the stored timestamp and waits the appropriate time.
  //
  // Uses fetch() to /api/polymarket/daily-tick instead of a dynamic
  // import so that Node.js `fs`/`path` imports inside polymarket-auto-
  // trader don't get pulled into the instrumentation bundle at build
  // time (which would cause "Module not found: Can't resolve 'fs'" on
  // the edge runtime analysis pass).
  const TICK_INTERVAL_MS = 60 * 60 * 1000  // 1 hour
  const tickPort = process.env.PORT || '3000'
  const tickUrl = process.env.INTERNAL_API_BASE
    ? `${process.env.INTERNAL_API_BASE}/api/polymarket/daily-tick`
    : `http://localhost:${tickPort}/api/polymarket/daily-tick`

  const runDailyTick = async () => {
    try {
      const res = await fetch(tickUrl, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!res.ok) {
        console.warn(`[instrumentation] Daily tick HTTP ${res.status}`)
        return
      }
      const result = await res.json()
      if (result.fired) {
        console.log(`[instrumentation] Daily scheduler fired — ${result.reason}`)
      }
    } catch (e) {
      console.warn('[instrumentation] Daily tick failed:', e instanceof Error ? e.message : e)
    }
  }

  // Fire first tick 30s after server start (gives the pre-warm above
  // time to populate the screening cache), then every hour after.
  setTimeout(() => {
    runDailyTick().catch(() => {})
    setInterval(() => {
      runDailyTick().catch(() => {})
    }, TICK_INTERVAL_MS)
  }, 30_000)
}
