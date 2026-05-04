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
}
