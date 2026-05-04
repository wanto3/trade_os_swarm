#!/usr/bin/env node
/**
 * Quick direct test of the LLM on a geopolitical market with manual evidence
 */
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? ''
if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY env var is required. Set it in .env.local or via the shell.')
  process.exit(1)
}

async function main() {
  const models = [
    'meta-llama/llama-4-scout-17b-16e-instruct',
    'qwen/qwen3-32b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
  ]

  const prompt = `You are a prediction market analyst. Answer in JSON.

MARKET: "Will Russia and Ukraine reach a ceasefire agreement by end of 2026?"
CURRENT PRICE: 24.0% for YES
CATEGORY: policy
CLOSES IN: 22 day(s)
LIQUIDITY: $764K

EVIDENCE FOR YES:
1. US-Russia ceasefire talks reportedly resumed in early 2026
2. European mediators pushing for 30-day ceasefire proposal
3. Ukraine signals openness to territorial compromise

EVIDENCE AGAINST YES:
1. Russia continues air strikes on Ukrainian cities as of April 2026
2. Ceasefire negotiations stalled in March — no agreement reached
3. Both sides publicly stated conditions neither will accept

Answer with JSON: { "decision": "bet" or "skip", "confidence": "high" or "medium" or "low", "reasoning": "2-3 sentences", "estimatedProbability": 0.0-1.0 }`

  for (const model of models) {
    const start = Date.now()
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 300,
          response_format: { type: 'json_object' },
        }),
      })

      const data = await res.json()
      const ms = Date.now() - start

      if (res.status !== 200) {
        console.log(`❌ ${model}: ${res.status} ${data.error?.message || ''}`)
        continue
      }

      const content = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(content)
      console.log(`✅ ${model}`)
      console.log(`   Latency: ${ms}ms`)
      console.log(`   Decision: ${parsed.decision || '?'}`)
      console.log(`   Confidence: ${parsed.confidence || '?'}`)
      console.log(`   Est: ${parsed.estimatedProbability ? (parsed.estimatedProbability * 100).toFixed(1) + '%' : '?'}`)
      console.log(`   Reason: ${(parsed.reasoning || '').substring(0, 150)}`)
      console.log()
    } catch (e) {
      console.log(`❌ ${model}: ${e instanceof Error ? e.message : String(e)}`)
    }
    await new Promise(r => setTimeout(r, 1500))
  }
}

main()
