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
  getPositions,
  getPortfolio,
  setBankroll,
  recomputePortfolioPnl,
  type ImportedPositionInput,
} from '@/lib/services/polymarket-portfolio.service'
import { computeCalibration, saveCalibration, emitAutoLessons } from '@/lib/services/calibration.service'

export const dynamic = 'force-dynamic'

const ACCOUNT_FILE = path.resolve(process.cwd(), 'data/polymarket-account.json')
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * Default Polymarket address — used as a fallback when no address has
 * been saved to disk yet. Single-user app; on Render's ephemeral disk
 * the saved address gets wiped on every deploy, so without this
 * fallback the user would have to re-paste after every push. The
 * address is already public on-chain (read-only access from this
 * endpoint anyway), so no security risk to hardcode.
 *
 * Override on a different machine / different wallet by setting the
 * POLYMARKET_WALLET_ADDRESS env var.
 */
const DEFAULT_ADDRESS = (
  process.env.POLYMARKET_WALLET_ADDRESS
  || '0x4523A57E1D1D674c937c1e85C1e496fA60FD9146'
).toLowerCase()

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

/**
 * Polymarket's /value endpoint returns ONLY the mark-to-market value of
 * open positions. Free USDC sitting in the user's wallet (deposited but
 * not deployed in positions) isn't included. To get the user's true
 * total bankroll, we also need to query the USDC balance on Polygon
 * directly at the user's address.
 *
 * Returns 0 on any failure — the bankroll math degrades to "positions
 * only" which matches the old behavior.
 */
async function fetchFreeUSDC(address: string): Promise<number> {
  // Polymarket settles in USDC.e (bridged) — most users have this.
  // Newer accounts may have native USDC. Query both at the user's EOA.
  const USDC_POLYGON_E = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
  const USDC_POLYGON_NATIVE = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
  const POLYGON_RPCS = [
    'https://rpc.ankr.com/polygon',
    'https://polygon.drpc.org',
    'https://polygon.blockpi.network/v1/rpc/public',
  ]
  const PAD = address.toLowerCase().replace(/^0x/, '')
  const balanceOfData = '0x70a08231' + '0'.repeat(24) + PAD

  async function balanceOf(rpc: string, token: string): Promise<number> {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{ to: token, data: balanceOfData }, 'latest'],
          id: 1,
        }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) return 0
      const data = await res.json() as { result?: string }
      if (!data.result || data.result === '0x' || data.result === '0x0') return 0
      // USDC has 6 decimals on Polygon
      return Number(BigInt(data.result)) / 1e6
    } catch {
      return 0
    }
  }

  let total = 0
  for (const token of [USDC_POLYGON_E, USDC_POLYGON_NATIVE]) {
    for (const rpc of POLYGON_RPCS) {
      const bal = await balanceOf(rpc, token)
      if (bal > 0) {
        total += bal
        break  // got a successful read for this token, no need to try other RPCs
      }
    }
  }
  return total
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
        // Capture live market price + Polymarket's reported PnL so open
        // positions can render real mark-to-market PnL instead of "—".
        currentMarketPrice: typeof p.curPrice === 'number' ? p.curPrice : undefined,
        livePnl: typeof p.cashPnl === 'number' ? p.cashPnl : undefined,
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

    // Reconcile bankroll with Polymarket's actual portfolio value. This
    // is the headline figure the user sees on polymarket.com — total
    // portfolio value = free USDC + sum(open position current values).
    //
    // Previous version set bankroll to "free USDC only" (polymarketValue
    // − lockedValue), which collapsed to ~$0 for a user who was fully
    // invested. Display was technically accurate but didn't match the
    // user's mental model — they expect "balance" to equal what
    // Polymarket shows them. Now bankroll = polymarketValue directly,
    // which means the dashboard headline matches Polymarket exactly.
    //
    // Kelly sizing on opportunity cards still works — the maxBetSizePercent
    // cap keeps suggested stakes within reason (e.g. 15% of $4 = $0.60,
    // not the whole stack).
    let polymarketValue: number | null = null
    let freeUsdc = 0
    let reconcileNote = ''
    try {
      // Fetch in parallel: positions value + free cash on-chain. Both
      // contribute to the real bankroll the user sees on Polymarket.
      const [pmValue, cash] = await Promise.all([
        fetchPolymarketValue(address),
        fetchFreeUSDC(address),
      ])
      polymarketValue = pmValue
      freeUsdc = cash

      if (polymarketValue !== null || freeUsdc > 0) {
        const positionsValue = polymarketValue ?? 0
        const trueTotalBankroll = positionsValue + freeUsdc

        const before = getPortfolio()
        // Reset startingBankroll when it looks broken — either still at
        // the $1000 default (never imported) OR stuck at the tiny value
        // from a previous version of this endpoint that computed
        // bankroll incorrectly.
        const startingLooksBroken = before.startingBankroll === 1000 || before.startingBankroll < 0.01
        const shouldResetStarting = mode === 'replace' && startingLooksBroken
        setBankroll(trueTotalBankroll, shouldResetStarting)
        reconcileNote = `Bankroll set to $${trueTotalBankroll.toFixed(2)} = $${positionsValue.toFixed(2)} open positions + $${freeUsdc.toFixed(2)} free USDC on-chain (matches polymarket.com cash + portfolio total)`
        console.log(`[ImportFromAddress] ${reconcileNote}${shouldResetStarting ? ` (also reset startingBankroll from $${before.startingBankroll})` : ''}`)
      }
    } catch (e) {
      console.warn('[ImportFromAddress] bankroll reconcile failed (positions imported anyway):', e instanceof Error ? e.message : e)
    }

    // Recompute totalPnl now that open positions carry unrealizedPnl
    // from Polymarket's live cashPnl. Without this step the dashboard
    // headline only reflects resolved-position PnL, missing the
    // unrealized gain/loss on the open positions that dominate for a
    // small bankroll heavily invested in current markets.
    recomputePortfolioPnl()

    // Closed-loop learning step: compute per-tier W/L from the freshly
    // imported & resolved positions and save it so the next screening
    // run can inject calibration data into Opus's prompt. The result is
    // "Opus sees its own track record per category" — when the user has
    // lost 8/8 on lower-tier CS, the next screening tells Opus exactly
    // that, so it defaults to skip on similar markets even when an
    // apparent edge looks attractive.
    try {
      const allPositions = getPositions(false /* include closed */)
      const summary = computeCalibration(
        allPositions.map(p => ({
          question: p.question,
          category: p.category,
          status: p.status,
          pnl: p.pnl,
          cost: p.cost,
          outcome: p.outcome,
          aiEdge: (p as { aiEdge?: 'strong' | 'user' | 'weak' }).aiEdge,
          source: p.source,
        }))
      )
      await saveCalibration(summary)
      console.log(`[ImportFromAddress] Calibration saved: ${summary.totalResolved} resolved bets across ${summary.tiers.length} tiers, total PnL $${summary.totalPnl.toFixed(2)}`)

      // RECURSIVE LEARNING STEP — the system writes its own lessons.
      // When calibration shows a clear pattern (0-for-N on a tier,
      // <30% hit rate, ≥70% hit rate), emit/refresh an auto-lesson
      // tagged `auto-calibration`. These get injected into the next
      // screening prompt alongside the user-curated lessons, so every
      // resolved position cycles back into how Opus reasons about
      // future picks. No human-in-the-loop required.
      try {
        const emitResult = await emitAutoLessons(summary)
        if (emitResult.added + emitResult.refreshed > 0) {
          console.log(`[ImportFromAddress] Auto-lessons: ${emitResult.added} new, ${emitResult.refreshed} refreshed, ${emitResult.skipped} skipped (not stale/significant enough)`)
        }
      } catch (e) {
        console.warn('[ImportFromAddress] auto-lesson emit failed (non-fatal):', e instanceof Error ? e.message : e)
      }
    } catch (e) {
      console.warn('[ImportFromAddress] calibration save failed (non-fatal):', e instanceof Error ? e.message : e)
    }

    return NextResponse.json({
      success: true,
      address,
      inserted,
      skipped,
      resolved: resolvedCount,
      polymarketValue,
      freeUsdc,
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
      // No persisted address — fall back to the hardcoded/env-var
      // default so the dashboard auto-syncs without requiring a paste
      // after every Render redeploy (ephemeral disk wipes the json
      // file each time). isDefault=true signals the frontend that
      // this came from the fallback, not a user-confirmed save.
      if (DEFAULT_ADDRESS && ADDRESS_RE.test(DEFAULT_ADDRESS)) {
        return NextResponse.json({
          success: true,
          address: DEFAULT_ADDRESS,
          savedAt: null,
          isDefault: true,
        })
      }
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
