/**
 * Lessons-learned service — closes the feedback loop between resolved
 * positions and future Opus screening prompts.
 *
 * Concept: when a position resolves "wrong" (Opus predicted A, market
 * settled !A), the user can log a one-line "what Opus got wrong" note.
 * Future pipeline runs prepend the latest 10-15 lessons to the screening
 * prompt as a "RECENT LESSONS" section, so Opus learns from past failures
 * without manual prompt rewrites.
 *
 * Storage: data/lessons-learned.json (disk-backed, persists across deploys
 * because it's checked into the data dir).
 */

import { promises as fs } from 'fs'
import path from 'path'

const STORE_PATH = path.resolve(process.cwd(), 'data/lessons-learned.json')

export interface Lesson {
  id: string                  // unique
  loggedAt: number            // unix ms
  /** Reference to the position that triggered this lesson (if applicable). */
  positionId?: string
  /** The market question text (so Opus can pattern-match similar markets). */
  question: string
  /** What Opus predicted that turned out wrong. */
  opusPrediction: string      // e.g. "Reform UK winning most Welsh Senedd seats at 30% real prob"
  /** What actually happened. */
  actualOutcome: string       // e.g. "Reform UK got 12 seats, Labour kept majority — Opus over-extrapolated UK-national polling"
  /** One-sentence takeaway for future picks. */
  takeaway: string            // e.g. "Welsh devolved politics ≠ UK-wide momentum"
  /** Loose category tag — helps the prompt-builder pick relevant lessons. */
  category?: string           // e.g. 'regional-politics', 'box-office', 'esports'
}

interface LessonStore {
  lessons: Lesson[]
}

let cache: LessonStore | null = null

async function load(): Promise<LessonStore> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as LessonStore
    if (parsed.lessons && Array.isArray(parsed.lessons)) {
      cache = parsed
      return cache
    }
  } catch { /* missing or corrupt */ }
  cache = { lessons: [] }
  return cache
}

async function save(store: LessonStore): Promise<void> {
  cache = store
  try {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2))
  } catch (e) {
    console.warn('[LessonsLearned] save failed:', e instanceof Error ? e.message : e)
  }
}

export async function logLesson(input: Omit<Lesson, 'id' | 'loggedAt'>): Promise<Lesson> {
  const store = await load()
  const lesson: Lesson = {
    id: `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    loggedAt: Date.now(),
    ...input,
  }
  // Cap at 100 lessons (keep newest); older ones are unlikely to be cited
  // and would make the prompt context grow unbounded.
  store.lessons.unshift(lesson)
  store.lessons = store.lessons.slice(0, 100)
  await save(store)
  console.log(`[LessonsLearned] Logged: ${lesson.takeaway.slice(0, 80)}`)
  return lesson
}

export async function getAllLessons(): Promise<Lesson[]> {
  const store = await load()
  return store.lessons
}

export async function deleteLesson(id: string): Promise<boolean> {
  const store = await load()
  const before = store.lessons.length
  store.lessons = store.lessons.filter(l => l.id !== id)
  if (store.lessons.length === before) return false
  await save(store)
  return true
}

/** Build a "RECENT LESSONS" prompt block to prepend to the polymarket
 *  screening prompt. Capped at the most recent 12 lessons + 1500 chars
 *  so the prompt context doesn't bloat. Returns empty string if no
 *  lessons are recorded. */
export async function getLessonsPromptBlock(maxLessons = 12, maxChars = 1500): Promise<string> {
  const lessons = await getAllLessons()
  if (lessons.length === 0) return ''
  const recent = lessons.slice(0, maxLessons)
  const lines: string[] = []
  let totalChars = 0
  for (const l of recent) {
    const line = `- "${l.question.slice(0, 80)}" — ${l.takeaway.slice(0, 200)}`
    if (totalChars + line.length > maxChars) break
    lines.push(line)
    totalChars += line.length
  }
  if (lines.length === 0) return ''
  return `\n📚 RECENT LESSONS — past picks the user reviewed and flagged as wrong reasoning. Pattern-match against new markets and apply these takeaways:\n${lines.join('\n')}\n\nUse these to recalibrate your reads. If a current market matches a past failure pattern, default to lower confidence or skip.\n`
}
