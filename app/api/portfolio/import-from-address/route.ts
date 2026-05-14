/**
 * POST /api/portfolio/import-from-address
 * Body: { address: string, mode?: 'augment' | 'replace' }
 *
 * Pulls the user's positions directly from Polymarket's public Data API
 * (no auth, no keys, read-only — the address is public on-chain anyway).
 * Maps each position to the paper-portfolio shape and saves via the same
 * addImportedPosition flow the screenshot importer uses, so:
 *   - source='imported' tag flows through unchanged
 *   - real Polymarket marketId gets resolved automatically (no synthetic
 *     'imported-…' ids — the cron auto-resolves them when the market
 *     closes, same as app-recommended picks)
 *   - resolved positions (curPrice == 0 or 1) get marked won/lost
 *     immediately rather than imported as open
 *
 * Replaces the screenshot+vision-model dance: no manual review required,
 * no token burn on Groq, no OCR errors. The on-chain data IS the source
 * of truth.
 *
 * The address is persisted to data/polymarket-account.json so the user
 * can re-import (or auto-refresh) without re-pasting.
 *
 * Spec: docs/superpowers/specs/2026-05-12-polymarket-account-mirror-design.md
 *       (this is the minimal Phase A — single-shot import; the live mirror
 *        is a separate follow-up.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import {
  ensureInitialized,
  addImportedPosition,
  clearAllPositions,
  resolvePosition,
  getPortfolio,
  setBankroll,
  type ImportedPositionInput,
} from '@/lib/services/polymarket-portfolio.service'

export const dynamic = 'force-dynamic'

const ACCOUNT_FILE = path.resolve(process.cwd(), 'data/polymarket-account.json')
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

interface LivePosition {
  conditionId: string
  asset?: string
  slug?: string
  title?: string
  eventSlug?: string
  outcome: string
  outcomeIndex?: number
  size: number
  avgPrice: number
  curPrice: number
  initialValue?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
  redeemable?: boolean
}

async function fetchPolymarketPositions(address: string): Promise<LivePosition[]> {
  const url = `https://data-api.polymarket.com/positions?user=${address}&sizeThreshold=0.1&limit=200`
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) {
    throw new Error(`Polymarket Data API ${res.status} — try again in a moment, or verify the address is correct`)
  }
  const arr = await res.json()
  if (!Array.isArray(arr)) {
    throw new Error('Unexpected response shape from Polymarket Data API')
  }
  return arr as LivePosition[]
}

/**
 * Fetch the user's total portfolio value from Polymarket. This is the
 * number the user sees on their Polymarket profile — free USDC + sum of
 * open position current values. We use it to reconcile our paper
 * bankroll so the displayed balance matches Polymarket exactly.
 *
 * Returns null on failure so the caller can fall back to addImportedPosition's
 * default bankroll math (not perfect, but acceptable).
 */
async function fetchPolymarketValue(address: string): Promise<number | null> {
  try {
    const res = await fetch(`https://data-api.polymarket.com/value?user=${address}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const arr = await res.json()
    if (!Array.isArray(arr) || arr.length === 0) return null
    const v = Number(arr[0]?.value)
    return isFinite(v) ? v : null
  } catch {
    return null
  }
}

async function savePersistedAddress(address: string): Promise<void> {
  try {
    await fs.mkdir(path.dirname(ACCOUNT_FILE), { recursive: true })
    await fs.writeFile(ACCOUNT_FILE, JSON.stringify({ address, savedAt: Date.now() }, null, 2))
  } catch (e) {
    console.warn('[ImportFromAddress] failed to persist address (continuing anyway):', e instanceof Error ? e.message : e)
  }
}

/**
 * Classify a live position's resolution status. Polymarket's Data API
 * marks resolved positions by collapsing curPrice to 0 (lost side) or
 * 1 (won side). Anything in-between is still open.
 */
function inferResolution(p: LivePosition): 'open' | 'won' | 'lost' {
  if (typeof p.curPrice !== 'number') return 'open'
  if (p.curPrice <= 0.005) return 'lost'
  if (p.curPrice >= 0.995) return 'won'
  return 'open'
}

export async function POST(request: NextRequest) {
  try {
    await ensureInitialized()
    const body = await request.json()
    const rawAddr = String(body.address || '').trim()
    const mode: 'augment' | 'replace' = body.mode === 'replace' ? 'replace' : 'augment'

    if (!ADDRESS_RE.test(rawAddr)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid Polymarket address. Expected a 0x-prefixed 40-char hex string (e.g. 0x4523A57E1D1D674c937c1e85C1e496fA60FD9146). Find yours on polymarket.com → profile.',
      }, { status: 400 })
    }
    const address = rawAddr.toLowerCase()

    // Pull live positions
    let livePositions: LivePosition[]
    try {
      livePositions = await fetchPolymarketPositions(address)
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: `Failed to fetch from Polymarket: ${e instanceof Error ? e.message : String(e)}`,
      }, { status: 502 })
    }

    if (livePositions.length === 0) {
      return NextResponse.json({
        success: true,
        address,
        message: 'No positions found on this address. If you have positions on Polymarket, double-check the address — it should match what shows on polymarket.com → profile.',
        inserted: 0,
        skipped: 0,
        resolved: 0,
        portfolio: getPortfolio(),
      })
    }

    // Save the address for future re-imports
    await savePersistedAddress(address)

    if (mode === 'replace') {
      clearAllPositions()
    }

    let inserted = 0
    let skipped = 0
    let resolvedCount = 0
    const skippedDetails: Array<{ question: string; reason: string }> = []

    for (const p of livePositions) {
      // Validate the live position has the fields we need to import.
      const question = String(p.title || '').trim()
      const outcomeName = String(p.outcome || '').trim()
      const avgPrice = Number(p.avgPrice)
      const size = Number(p.size)
      if (!question || question.length < 5) {
        skipped++
        skippedDetails.push({ question: question || '(no title)', reason: 'no question text' })
        continue
      }
      if (!isFinite(avgPrice) || avgPrice <= 0 || avgPrice >= 1) {
        skipped++
        skippedDetails.push({ question, reason: `avgPrice out of range: ${avgPrice}` })
        continue
      }
      if (!isFinite(size) || size <= 0) {
        skipped++
        skippedDetails.push({ question, reason: `size invalid: ${size}` })
        continue
      }

      // We always import as outcome='Yes' from the user's perspective —
      // the underlying paper-portfolio schema's outcomeIndex maps 0='Yes',
      // 1='No' but our import is side-aware via question text. The
      // `outcome` field in addImportedPosition reflects which SIDE of
      // the binary the user holds. For multi-outcome markets where the
      // user holds the named team, that's equivalent to 'Yes' on that
      // side's binary token. The outcome NAME (team) is stored in the
      // question via the placeOnSide flow downstream.
      const input: ImportedPositionInput = {
        question: outcomeName && !question.toLowerCase().includes(outcomeName.toLowerCase())
          ? `${question} — ${outcomeName}`
          : question,
        outcome: 'Yes',  // user holds this side regardless of label
        entryPrice: avgPrice,
        quantity: size,
        url: p.slug ? `https://polymarket.com/event/${p.eventSlug || p.slug}` : undefined,
        note: `Imported from Polymarket address ${address.slice(0, 8)}…${address.slice(-4)} on ${new Date().toISOString().slice(0, 10)}`,
      }

      const created = await addImportedPosition(input)
      if (!created) {
        skipped++
        skippedDetails.push({ question, reason: 'addImportedPosition validation rejected' })
        continue
      }
      inserted++

      // Resolve immediately if the live position is already settled.
      const resolution = inferResolution(p)
      if (resolution !== 'open') {
        // Map back to the position's outcome side. Since we always pass
        // outcome='Yes' above, a 'won' live position resolves to 'yes'.
        const mapped = resolution === 'won' ? 'yes' : 'no'
        const settled = resolvePosition(created.id, mapped)
        if (settled) resolvedCount++
      }
    }

    // Reconcile bankroll with Polymarket's actual portfolio value.
    // Without this step, the displayed balance was wrong: addImportedPosition
    // decrements from the $1000 default bankroll on each import, leaving
    // ~$988 instead of the user's real $4.12. Fix: pull Polymarket's
    // own portfolio value (free USDC + open-position current value, the
    // same number the user sees on polymarket.com) and split it into
    //   bankroll (free)        = polymarketValue - sumOpenCurrentValue
    //   open position values   = sumOpenCurrentValue
    // so the dashboard total = polymarketValue, matching Polymarket exactly.
    let polymarketValue: number | null = null
    let reconcileNote = ''
    try {
      polymarketValue = await fetchPolymarketValue(address)
      if (polymarketValue !== null) {
        // Sum current value of OPEN positions only — won/lost positions
        // either redeem to free USDC or are gone, neither contributes to
        // "locked-in-positions" today.
        const lockedValue = livePositions
          .filter(p => isFinite(Number(p.curPrice)) && Number(p.curPrice) > 0.005 && Number(p.curPrice) < 0.995)
          .reduce((acc, p) => acc + (Number(p.size) * Number(p.curPrice)), 0)
        const freeUsdc = Math.max(0, polymarketValue - lockedValue)

        // First import (we replaced everything and starting was the $1000
        // default) — also lock starting bankroll to the live value so the
        // compounding-growth chart has a meaningful baseline.
        const before = getPortfolio()
        const isFirstReplace = mode === 'replace' && before.startingBankroll === 1000
        setBankroll(freeUsdc, isFirstReplace)
        reconcileNote = `Bankroll set to $${freeUsdc.toFixed(2)} (Polymarket value $${polymarketValue.toFixed(2)} − $${lockedValue.toFixed(2)} locked in ${livePositions.filter(p => Number(p.curPrice) > 0.005 && Number(p.curPrice) < 0.995).length} open positions)`
        console.log(`[ImportFromAddress] ${reconcileNote}`)
      }
    } catch (e) {
      console.warn('[ImportFromAddress] bankroll reconcile failed (positions imported anyway):', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({
      success: true,
      address,
      inserted,
      skipped,
      resolved: resolvedCount,
      polymarketValue,
      reconcileNote,
      portfolio: getPortfolio(),
      ...(skippedDetails.length > 0 ? { skippedDetails } : {}),
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

/**
 * GET /api/portfolio/import-from-address
 * Returns the previously-saved Polymarket address (if any) so the UI
 * can prefill the input field on subsequent re-imports.
 */
export async function GET() {
  try {
    const raw = await fs.readFile(ACCOUNT_FILE, 'utf-8').catch(() => null)
    if (!raw) {
      return NextResponse.json({ success: true, address: null })
    }
    const parsed = JSON.parse(raw) as { address?: string; savedAt?: number }
    return NextResponse.json({
      success: true,
      address: parsed.address || null,
      savedAt: parsed.savedAt || null,
    })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
