/**
 * /api/portfolio/import — extract positions from a Polymarket screenshot
 * via Groq vision, then optionally save them to the paper portfolio.
 *
 * Two-step flow so the user can review before committing:
 *   POST { image }              → returns extracted positions for preview
 *   PUT  { positions, mode }    → saves positions to portfolio
 *
 * Why Groq vision (Llama 4 Scout) and not Sonnet:
 *   - Free tier on Groq covers thousands of vision calls/day
 *   - User explicit: "only use Max sub when looking for opportunities"
 *   - Position extraction is deterministic OCR-ish work — Sonnet's
 *     reasoning advantage isn't needed here. Llama 4 Scout's vision is
 *     plenty for parsing a screenshot of structured market positions.
 *
 * Body size: Polymarket screenshots run 200KB-1.5MB. We allow up to 4MB
 * via Next.js App Router default; reject larger.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  ensureInitialized,
  addImportedPosition,
  clearAllPositions,
  reLookupImportedPositions,
  getPortfolio,
  type ImportedPositionInput,
} from '@/lib/services/polymarket-portfolio.service'

const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

// Vision-capable models on Groq, tried in order. Llama 4 Scout is current
// best-quality vision model; fall back to Llama 3.2 90B vision if Scout
// gets renamed or removed.
const GROQ_VISION_MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.2-90b-vision-preview',
  'llama-3.2-11b-vision-preview',
]

interface ExtractedPosition {
  question: string
  outcome: 'Yes' | 'No'
  entryPrice: number      // 0-1
  quantity: number        // shares
  currentValue?: number   // 0-1, current market price if visible
  pnl?: number            // dollar PnL if visible
  status?: 'open' | 'won' | 'lost'
}

const VISION_PROMPT = `You are parsing a screenshot of a Polymarket portfolio page. The user is showing you their list of open positions (or resolved ones).

Extract every position visible. For each, return JSON with these fields:
- question: the market question text (verbatim, max 200 chars)
- outcome: "Yes" or "No" — which side of the binary market the user holds. For multi-outcome markets, use "Yes" if they hold the team/option named in the bet (since route.ts side-aware logic treats outcome-0 as the YES side).
- entryPrice: number 0.01-0.99 — the price per share they paid (often labeled "Avg" or "Avg price"). If shown as cents like "84¢", convert to 0.84.
- quantity: number — shares/contracts held (often labeled "Shares" or "Qty"). Convert "1.19 shares" to 1.19.
- currentValue: optional number 0.01-0.99 — current market price for this side, if visible.
- pnl: optional number — dollar P&L if visible (positive for profit, negative for loss).
- status: "open" if position is still active, "won"/"lost" if resolved (often shown by green/red badges or "Settled" labels).

Return ONLY a JSON array, no markdown fences, no prose. Empty array [] if no positions are visible. Skip any partial/cut-off positions where you can't read the price or quantity reliably.

Example output:
[
  {"question": "Will Bitcoin be above $76,000 on May 7?", "outcome": "Yes", "entryPrice": 0.84, "quantity": 1.19, "currentValue": 0.92, "status": "open"},
  {"question": "US x Iran permanent peace deal by May 31", "outcome": "No", "entryPrice": 0.18, "quantity": 5.55, "status": "open"}
]`

async function parseImageWithGroq(imageDataUrl: string): Promise<{ positions: ExtractedPosition[]; modelUsed: string; errors: string[] }> {
  const errors: string[] = []
  if (!GROQ_API_KEY) {
    return { positions: [], modelUsed: 'none', errors: ['GROQ_API_KEY env var not set on server'] }
  }
  for (const model of GROQ_VISION_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: VISION_PROMPT },
                { type: 'image_url', image_url: { url: imageDataUrl } },
              ],
            },
          ],
        }),
      })
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300)
        errors.push(`${model}: ${res.status} ${body}`)
        continue
      }
      const data = await res.json()
      const text = data.choices?.[0]?.message?.content || ''
      const cleaned = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim()
      // Try to extract JSON array — vision models sometimes wrap in prose
      const arrMatch = cleaned.match(/\[\s*[\s\S]*\]/)
      const jsonText = arrMatch ? arrMatch[0] : cleaned
      try {
        const parsed = JSON.parse(jsonText)
        if (Array.isArray(parsed)) {
          // Sanitize each entry
          const positions: ExtractedPosition[] = parsed
            .filter(p => p && typeof p === 'object')
            .map(p => sanitize(p))
            .filter((p): p is ExtractedPosition => p !== null)
          return { positions, modelUsed: model, errors }
        }
        errors.push(`${model}: response was not a JSON array (got ${typeof parsed})`)
      } catch (e) {
        errors.push(`${model}: parse failed — ${e instanceof Error ? e.message.slice(0, 150) : 'unknown'} — preview: ${cleaned.slice(0, 200)}`)
      }
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.message.slice(0, 150) : 'unknown'}`)
    }
  }
  return { positions: [], modelUsed: 'none', errors }
}

function sanitize(raw: unknown): ExtractedPosition | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const question = typeof r.question === 'string' ? r.question.trim().slice(0, 250) : ''
  if (!question || question.length < 3) return null
  const outcome = (r.outcome === 'Yes' || r.outcome === 'No') ? r.outcome : 'Yes'
  const entryPrice = typeof r.entryPrice === 'number' ? r.entryPrice : NaN
  const quantity = typeof r.quantity === 'number' ? r.quantity : NaN
  if (!isFinite(entryPrice) || entryPrice <= 0 || entryPrice >= 1) return null
  if (!isFinite(quantity) || quantity <= 0) return null
  const status = ['open', 'won', 'lost'].includes(r.status as string) ? r.status as ExtractedPosition['status'] : 'open'
  const currentValue = typeof r.currentValue === 'number' && r.currentValue > 0 && r.currentValue < 1 ? r.currentValue : undefined
  const pnl = typeof r.pnl === 'number' && isFinite(r.pnl) ? r.pnl : undefined
  return { question, outcome: outcome as 'Yes' | 'No', entryPrice, quantity, currentValue, pnl, status }
}

export const dynamic = 'force-dynamic'
// Allow up to ~6MB request body for high-res screenshots from retina displays.
export const maxDuration = 60

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PUT, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

/** POST { image: "data:image/...;base64,..." } — preview parse, doesn't save. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const imageDataUrl = String(body.image || '')
    if (!imageDataUrl.startsWith('data:image/')) {
      return NextResponse.json({
        success: false,
        error: 'Body must include `image` as a data URL ("data:image/png;base64,..." etc.)',
      }, { status: 400, headers: CORS_HEADERS })
    }
    // Rough size check — base64 ~33% larger than binary; reject >8MB encoded
    if (imageDataUrl.length > 8 * 1024 * 1024) {
      return NextResponse.json({
        success: false,
        error: `Image too large (${(imageDataUrl.length / 1024 / 1024).toFixed(1)}MB). Resize to under 6MB or crop the screenshot.`,
      }, { status: 413, headers: CORS_HEADERS })
    }

    const { positions, modelUsed, errors } = await parseImageWithGroq(imageDataUrl)
    return NextResponse.json({
      success: true,
      positions,
      modelUsed,
      errors,
      hint: positions.length === 0 && errors.length > 0
        ? 'Vision model returned no positions. Try a sharper screenshot or one with fewer cropped edges. See errors[] for details.'
        : positions.length === 0
          ? 'No positions detected in the image. Make sure the screenshot shows your portfolio page with at least one open position.'
          : `Extracted ${positions.length} position${positions.length === 1 ? '' : 's'}. Review and PUT to save.`,
    }, { headers: CORS_HEADERS })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500, headers: CORS_HEADERS })
  }
}

/** PUT { positions: [...], mode: 'replace' | 'augment' } — save to portfolio. */
export async function PUT(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json()
    const positions = Array.isArray(body.positions) ? body.positions : []
    const mode: 'replace' | 'augment' = body.mode === 'replace' ? 'replace' : 'augment'

    if (positions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No positions provided',
      }, { status: 400, headers: CORS_HEADERS })
    }

    if (mode === 'replace') {
      clearAllPositions()
    }

    const inserted: Awaited<ReturnType<typeof addImportedPosition>>[] = []
    const skipped: { reason: string; input: unknown }[] = []
    let matchedCount = 0
    let unmatchedCount = 0
    for (const p of positions) {
      const input: ImportedPositionInput = {
        question: String(p.question || ''),
        outcome: p.outcome === 'No' ? 'No' : 'Yes',
        entryPrice: Number(p.entryPrice),
        quantity: Number(p.quantity),
        url: typeof p.url === 'string' ? p.url : undefined,
        placedAtIso: typeof p.placedAtIso === 'string' ? p.placedAtIso : undefined,
        note: typeof p.note === 'string' ? p.note : `Imported from Polymarket screenshot ${new Date().toISOString().slice(0, 10)}`,
      }
      const created = await addImportedPosition(input)
      if (created) {
        inserted.push(created)
        if (created.marketId.startsWith('imported-')) {
          unmatchedCount++
        } else {
          matchedCount++
        }
      } else {
        skipped.push({ reason: 'Validation failed (price out of range, quantity ≤ 0, or question too short)', input: p })
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      inserted: inserted.length,
      skipped: skipped.length,
      autoResolveMatched: matchedCount,
      autoResolveUnmatched: unmatchedCount,
      portfolio: getPortfolio(),
      ...(skipped.length > 0 ? { skippedDetails: skipped } : {}),
    }, { headers: CORS_HEADERS })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500, headers: CORS_HEADERS })
  }
}


/** PATCH — re-run market lookups for any imported positions still on
 *  synthetic ids. Useful after an initial import where Gamma API was
 *  flaky, OR for positions imported before this lookup feature shipped. */
export async function PATCH() {
  try {
    await ensureInitialized()
    const result = await reLookupImportedPositions()
    return NextResponse.json({
      success: true,
      ...result,
      portfolio: getPortfolio(),
    }, { headers: CORS_HEADERS })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500, headers: CORS_HEADERS })
  }
}
