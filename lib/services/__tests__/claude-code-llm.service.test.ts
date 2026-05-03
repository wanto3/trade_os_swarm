import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callClaudeCode, ClaudeCodeRateLimitError } from '../claude-code-llm.service'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

function makeMockChild() {
  return {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    stdin: { write: vi.fn(), end: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  } as any
}

function emit(child: any, stream: 'stdout' | 'stderr', data: string) {
  const handler = child[stream].on.mock.calls.find((c: any[]) => c[0] === 'data')[1]
  handler(Buffer.from(data))
}

function close(child: any, code: number) {
  const handler = child.on.mock.calls.find((c: any[]) => c[0] === 'close')[1]
  handler(code)
}

describe('callClaudeCode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed JSON from a successful claude -p response', async () => {
    const { spawn } = await import('child_process')
    const child = makeMockChild()
    ;(spawn as any).mockReturnValue(child)

    const promise = callClaudeCode<{ answer: string }>({
      prompt: 'test',
      model: 'claude-haiku-4-5',
    })

    emit(child, 'stdout', JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '{"answer":"42"}',
    }))
    close(child, 0)

    expect(await promise).toEqual({ answer: '42' })
  })

  it('strips markdown code fences from the model result', async () => {
    const { spawn } = await import('child_process')
    const child = makeMockChild()
    ;(spawn as any).mockReturnValue(child)

    const promise = callClaudeCode<{ status: string }>({
      prompt: 'test',
      model: 'claude-opus-4-7',
    })

    emit(child, 'stdout', JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: '```json\n{"status":"ok"}\n```',
    }))
    close(child, 0)

    expect(await promise).toEqual({ status: 'ok' })
  })

  it('rejects with the inner result text when wrapper.is_error is true', async () => {
    const { spawn } = await import('child_process')
    const child = makeMockChild()
    ;(spawn as any).mockReturnValue(child)

    const promise = callClaudeCode({
      prompt: 'test',
      model: 'claude-opus-4-7',
    })

    emit(child, 'stdout', JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'There is an issue with the selected model.',
    }))
    close(child, 0)

    await expect(promise).rejects.toThrow(/issue with the selected model/i)
  })

  it('rejects with ClaudeCodeRateLimitError when stderr indicates rate limiting', async () => {
    const { spawn } = await import('child_process')
    const child = makeMockChild()
    ;(spawn as any).mockReturnValue(child)

    const promise = callClaudeCode({
      prompt: 'test',
      model: 'claude-opus-4-7',
    })

    emit(child, 'stderr', 'Error: rate limit exceeded for 5-hour window')
    close(child, 1)

    await expect(promise).rejects.toBeInstanceOf(ClaudeCodeRateLimitError)
  })

  it('rejects with ClaudeCodeRateLimitError when wrapper is_error contains rate limit text', async () => {
    const { spawn } = await import('child_process')
    const child = makeMockChild()
    ;(spawn as any).mockReturnValue(child)

    const promise = callClaudeCode({
      prompt: 'test',
      model: 'claude-opus-4-7',
    })

    emit(child, 'stdout', JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'You have exceeded your 5-hour rate limit window.',
    }))
    close(child, 0)

    await expect(promise).rejects.toBeInstanceOf(ClaudeCodeRateLimitError)
  })

  it('passes --tools "" and --system-prompt to the spawned subprocess', async () => {
    const { spawn } = await import('child_process')
    const child = makeMockChild()
    ;(spawn as any).mockReturnValue(child)

    const promise = callClaudeCode({
      prompt: 'test',
      model: 'claude-haiku-4-5',
    })
    emit(child, 'stdout', JSON.stringify({ type: 'result', is_error: false, result: '{}' }))
    close(child, 0)
    await promise

    const args = (spawn as any).mock.calls[0][1] as string[]
    expect(args).toContain('--tools')
    expect(args).toContain('')
    expect(args).toContain('--system-prompt')
  })

  it('strips CLAUDECODE env vars from the subprocess', async () => {
    const { spawn } = await import('child_process')
    const child = makeMockChild()
    ;(spawn as any).mockReturnValue(child)

    process.env.CLAUDECODE = '1'
    process.env.CLAUDE_CODE_ENTRYPOINT = 'cli'

    const promise = callClaudeCode({ prompt: 'x', model: 'claude-haiku-4-5' })
    emit(child, 'stdout', JSON.stringify({ type: 'result', is_error: false, result: '{}' }))
    close(child, 0)
    await promise

    const opts = (spawn as any).mock.calls[0][2] as { env: Record<string, string> }
    expect(opts.env.CLAUDECODE).toBeUndefined()
    expect(opts.env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
  })
})
