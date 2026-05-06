import { spawn } from 'child_process'

export type ClaudeModel = 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5'

export interface ClaudeCodeCallOptions {
  prompt: string
  model: ClaudeModel
  timeoutMs?: number
  /** Optional override for the system prompt. Defaults to a minimal JSON-only instruction. */
  systemPrompt?: string
}

export class ClaudeCodeRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClaudeCodeRateLimitError'
  }
}

const DEFAULT_SYSTEM_PROMPT =
  'You are a JSON-only responder. Reply with a single valid JSON object that matches the schema implied by the user prompt. No prose, no markdown fences, no explanation outside the JSON.'

/**
 * Strip markdown code fences if the model wrapped its JSON in them.
 * Handles: ```json\n{...}\n```  and  ```\n{...}\n```
 */
function stripMarkdownFences(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

export async function callClaudeCode<T = unknown>(opts: ClaudeCodeCallOptions): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const systemPrompt = opts.systemPrompt ?? DEFAULT_SYSTEM_PROMPT

  return new Promise<T>((resolve, reject) => {
    // Strip CLAUDECODE/CLAUDE_CODE_ENTRYPOINT so the subprocess doesn't refuse to run
    // ("Claude Code cannot be launched inside another Claude Code session").
    const childEnv = { ...process.env }
    delete childEnv.CLAUDECODE
    delete childEnv.CLAUDE_CODE_ENTRYPOINT

    // Diagnostic timing: capture phase timestamps so we can see in the
    // error/log where time goes (spawn cold-start vs API streaming vs
    // post-output processing). On Render free-tier, the suspicion is that
    // parallel claude processes contend for CPU/RAM/session-state and hang;
    // first-stdout-chunk timing distinguishes "hanging at startup" from
    // "API call slow".
    const t0 = Date.now()
    let tFirstStdout = 0
    let tFirstStderr = 0

    const child = spawn('claude', [
      '-p',
      '--model', opts.model,
      '--output-format', 'json',
      '--system-prompt', systemPrompt,
      '--tools', '',  // disable all built-in tools — saves ~35K tokens of overhead per call
    ], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      // Capture diagnostics BEFORE killing — partial stdout/stderr tells us
      // what phase claude was in. "stdout=0 stderr=0" means it never
      // produced output (likely hung in startup / OAuth init / lock wait).
      // "stdout=N stderr=0" means it was streaming but didn't finish.
      const elapsed = Date.now() - t0
      const firstOutMs = tFirstStdout ? tFirstStdout - t0 : -1
      const firstErrMs = tFirstStderr ? tFirstStderr - t0 : -1
      const stdoutPreview = stdout.substring(0, 300).replace(/\s+/g, ' ')
      const stderrPreview = stderr.substring(0, 300).replace(/\s+/g, ' ')
      child.kill('SIGTERM')
      reject(new Error(
        `claude -p timed out after ${timeoutMs}ms ` +
        `(elapsed=${elapsed}ms firstStdoutMs=${firstOutMs} firstStderrMs=${firstErrMs} ` +
        `stdoutBytes=${stdout.length} stderrBytes=${stderr.length}) ` +
        `stdout="${stdoutPreview}" stderr="${stderrPreview}"`
      ))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      if (!tFirstStdout) tFirstStdout = Date.now()
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      if (!tFirstStderr) tFirstStderr = Date.now()
      stderr += chunk.toString()
    })

    child.on('close', (code: number) => {
      clearTimeout(timer)
      const elapsed = Date.now() - t0
      const firstOutMs = tFirstStdout ? tFirstStdout - t0 : -1
      // Always log timing summary so we can see in Render logs whether
      // Opus is genuinely slow vs hanging. cheap, ~80 bytes per call.
      console.log(
        `[claude-code] model=${opts.model} elapsed=${elapsed}ms firstOutMs=${firstOutMs} ` +
        `exit=${code} stdoutBytes=${stdout.length} stderrBytes=${stderr.length}`
      )

      // Non-zero exit: hard failure
      if (code !== 0) {
        const errText = (stderr + ' ' + stdout).toLowerCase()
        if (errText.includes('rate limit') || errText.includes('quota') || errText.includes('5-hour')) {
          reject(new ClaudeCodeRateLimitError((stderr || stdout).trim()))
          return
        }
        reject(new Error(`claude -p exited with code ${code}: ${(stderr || stdout).trim().substring(0, 500)}`))
        return
      }

      // Exit 0 but the wrapper signals an error in the body
      let wrapper: any
      try {
        wrapper = JSON.parse(stdout)
      } catch (e) {
        reject(new Error(`Failed to parse claude wrapper: ${(e as Error).message}\nRaw: ${stdout.substring(0, 500)}`))
        return
      }

      if (wrapper.is_error === true) {
        const inner = typeof wrapper.result === 'string' ? wrapper.result : JSON.stringify(wrapper.result)
        const lower = inner.toLowerCase()
        if (lower.includes('rate limit') || lower.includes('quota') || lower.includes('5-hour')) {
          reject(new ClaudeCodeRateLimitError(inner.trim()))
          return
        }
        reject(new Error(`claude -p reported is_error: ${inner.trim().substring(0, 500)}`))
        return
      }

      // Successful response — `wrapper.result` is the model's text output (often markdown-fenced JSON)
      const innerRaw = wrapper.result
      if (typeof innerRaw !== 'string') {
        // Some shapes may return the parsed object directly
        resolve(innerRaw as T)
        return
      }

      const cleaned = stripMarkdownFences(innerRaw)
      try {
        resolve(JSON.parse(cleaned) as T)
      } catch (e) {
        reject(new Error(`Failed to parse model output as JSON: ${(e as Error).message}\nModel returned: ${innerRaw.substring(0, 500)}`))
      }
    })

    child.stdin.write(opts.prompt)
    child.stdin.end()
  })
}
