/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * Why this exists:
 *   On a cold start the first dashboard request has to (1) fetch ~1500 Polymarket markets,
 *   (2) gather evidence, and (3) hit Groq's free-tier 8B model. On free tier Groq throttles
 *   aggressively, so the first cycle often returns mostly "PENDING" cards while users wait.
 *
 *   By kicking the pipeline once on boot, by the time the user opens the page the quick-cache
 *   already holds a few real verdicts and the dashboard renders analyzed picks immediately.
 *
 * Implementation note:
 *   We can't `import('./app/api/polymarket/route')` here because Next bundles the
 *   instrumentation file in an edge-compatible context, which can't resolve `fs`/`path`
 *   used by the file-backed cache layer. A localhost fetch is the safer trigger — it routes
 *   through the normal Node runtime and exercises the exact same cold-path the user would.
 */

export async function register() {
  // Only run server-side (Node runtime).
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // Skip in test runs so vitest startups stay fast.
  if (process.env.NODE_ENV === 'test') return

  // Don't block boot — fire after a short delay so the HTTP server is listening.
  setTimeout(() => {
    const port = process.env.PORT || '3000'
    const url = `http://127.0.0.1:${port}/api/polymarket`
    console.log(`[Instrumentation] Pre-warming Polymarket pipeline via ${url}...`)

    const startedAt = Date.now()
    fetch(url, { cache: 'no-store' })
      .then(res => {
        console.log(`[Instrumentation] Pre-warm trigger returned ${res.status} in ${Date.now() - startedAt}ms — quick verdicts will populate over the next ~30s`)
      })
      .catch(err => {
        // Pre-warm is best-effort — never fail boot just because Polymarket or Groq is down.
        console.error('[Instrumentation] Pre-warm failed (non-fatal):', err instanceof Error ? err.message : err)
      })
  }, 4000)
}
