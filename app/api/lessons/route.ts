/**
 * /api/lessons — manage user-curated lessons-learned that get injected
 * into future Opus screening prompts as context.
 *
 *   GET                                    — list all lessons (newest first)
 *   POST { question, opusPrediction,       — log a new lesson
 *          actualOutcome, takeaway,
 *          category?, positionId? }
 *   DELETE ?id=<id>                        — remove a lesson
 *
 * Stored at data/lessons-learned.json (disk-backed). The screening
 * pipeline reads the latest 12 lessons + 1500 chars on every Opus run
 * and prepends them to the prompt as a "RECENT LESSONS" block.
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  logLesson,
  getAllLessons,
  deleteLesson,
} from '@/lib/services/lessons-learned.service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const lessons = await getAllLessons()
    return NextResponse.json({ success: true, lessons })
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
    const question = String(body.question || '').trim()
    const opusPrediction = String(body.opusPrediction || '').trim()
    const actualOutcome = String(body.actualOutcome || '').trim()
    const takeaway = String(body.takeaway || '').trim()
    const category = body.category ? String(body.category).slice(0, 60) : undefined
    const positionId = body.positionId ? String(body.positionId) : undefined

    if (!question || question.length < 5) {
      return NextResponse.json({ success: false, error: 'question must be ≥5 chars' }, { status: 400 })
    }
    if (!takeaway || takeaway.length < 5) {
      return NextResponse.json({ success: false, error: 'takeaway must be ≥5 chars (one-sentence rule for future picks)' }, { status: 400 })
    }

    const lesson = await logLesson({
      question: question.slice(0, 250),
      opusPrediction: opusPrediction.slice(0, 250),
      actualOutcome: actualOutcome.slice(0, 250),
      takeaway: takeaway.slice(0, 250),
      category,
      positionId,
    })

    return NextResponse.json({ success: true, lesson })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ success: false, error: 'missing ?id' }, { status: 400 })
    }
    const ok = await deleteLesson(id)
    if (!ok) {
      return NextResponse.json({ success: false, error: 'lesson not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
