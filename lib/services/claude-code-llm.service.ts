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
      child.kill('SIGTERM')
      reject(new Error(`claude -p timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

    child.on('close', (code: number) => {
      clearTimeout(timer)

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
