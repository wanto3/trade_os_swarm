import { NextResponse } from 'next/server'

const CHANNEL_ID = 'UCsT-PrX_ZgxXngz7kZsKJTw'
const CHANNEL_HANDLE = 'ElcaroTrade'
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''
const ANTHROPIC_BASE_URL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
const GROQ_API_KEY = process.env.GROQ_API_KEY || ''

interface TradingAnalysis {
  signal: 'BUY' | 'HOLD' | 'SHORT' | 'NEUTRAL'
  confidence: 'high' | 'medium' | 'low'
  summary: string
  keyInsights: string[]
  priceTargets: { price: string; date?: string; type: 'entry' | 'target' | 'stop' | 'support' | 'resistance'; confidence: 'high' | 'low' }[]
  keyDates: { date: string; event: string }[]
  sentiment: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high'
  mentionedAssets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[]
  watchMinutes: { minute: string; topic: string }[]
}

async function analyzeWithAI(
  title: string,
  description: string,
  timestamps: { time: string; label: string; seconds: number }[],
  viewCount: number
): Promise<TradingAnalysis> {
  // Try Anthropic first, then Groq, then fallback
  const chapters = timestamps.slice(0, 10).map(t => `[${t.time}] ${t.label}`).join('\n')
  const descriptionSnip = description.slice(0, 4000)
  const viewStr = viewCount > 0 ? `${(viewCount / 1000).toFixed(0)}K views` : ''

  const prompt = `You are a crypto trading analyst. Analyze this YouTube video from @ElcaroTrade and extract structured trading insights.

Return ONLY valid JSON (no markdown, no code fences) with EXACTLY these fields:
{
  "signal": "BUY" | "HOLD" | "SHORT" | "NEUTRAL",
  "confidence": "high" | "medium" | "low",
  "summary": "2-3 sentence summary of the key trading thesis. Max 250 chars. Be specific about what action to take.",
  "keyInsights": ["Specific insight 1", "Specific insight 2", ...],
  "priceTargets": [{"price": "$100K", "date": "Q2 2026", "type": "target", "confidence": "high"}, ...],
  "keyDates": [{"date": "Q2 2026", "event": "Phase 4 prediction"}],
  "sentiment": "bullish" | "bearish" | "neutral",
  "overallScore": 50,
  "riskLevel": "low" | "medium" | "high",
  "mentionedAssets": [{"name": "Bitcoin", "direction": "bullish"}, ...],
  "watchMinutes": [{"minute": "2:36", "topic": "2024 Predictions"}, ...]
}

Rules:
- signal: BUY if bullish with clear entries, SHORT if bearish with clear exits, HOLD if mixed/unclear, NEUTRAL if no trading content
- confidence: high if multiple specific price levels and dates are mentioned, medium if vague, low if mostly narrative
- summary: Be direct about what the influencer recommends - specific actions not generic statements
- keyInsights: Extract the 3-5 most important claims with actual numbers (prices, percentages, dates)
- priceTargets: Include ALL specific dollar prices from description - $109K, $126K, $60K, etc. type=target for upside, support for downside levels
- keyDates: All specific dates mentioned (earnings, halving, policy events, predictions like "Phase 4", "summer 2026")
- overallScore: -100 (extremely bearish) to +100 (extremely bullish). Phase descriptions, price targets, and directional claims all factor in
- riskLevel: high if no specifics, medium if mixed, low if clear and specific
- mentionedAssets: BTC, ETH, gold, oil, S&P, silver with directional bias from context
- watchMinutes: Top 5 chapter timestamps from the video - what sections to watch

TITLE: ${title}
${viewStr ? `VIEWS: ${viewStr}` : ''}
CHAPTERS:
${chapters || 'No chapters available'}
DESCRIPTION:
${descriptionSnip}`

  // Try Anthropic
  if (ANTHROPIC_API_KEY) {
    try {
      const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        method: 'POST',
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.content?.[0]?.text || ''
        const clean = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim()
        try {
          return JSON.parse(clean) as TradingAnalysis
        } catch {
          console.warn('Anthropic returned invalid JSON, using fallback')
        }
      } else {
        const err = await res.text()
        console.warn('Anthropic API error:', err.slice(0, 200))
      }
    } catch (err) {
      console.warn('Anthropic error:', err)
    }
  }

  // Try Groq
  if (GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        method: 'POST',
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 2048,
          temperature: 0.3,
          messages: [
            { role: 'system', content: 'You are a crypto trading analyst. Return ONLY valid JSON.' },
            { role: 'user', content: prompt }
          ]
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content || ''
        const clean = text.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim()
        try {
          return JSON.parse(clean) as TradingAnalysis
        } catch {
          console.warn('Groq returned invalid JSON, using fallback')
        }
      }
    } catch (err) {
      console.warn('Groq error:', err)
    }
  }

  // Fallback: parse description directly
  return buildFallbackAnalysis(title, description)
}

function buildFallbackAnalysis(title: string, description: string): TradingAnalysis {
  const lower = description.toLowerCase()

  // Extract prices with full value including K/M suffix
  const priceRegex = /\$([0-9,]+(?:\.[0-9]+)?)\s*(k|K|million|M)?/g
  const prices: { price: string; type: 'target' | 'support' | 'resistance'; confidence: 'low' }[] = []
  let match
  const seen = new Set<string>()
  while ((match = priceRegex.exec(description)) !== null) {
    const raw = match[1].replace(',', '')
    const unit = match[2] || ''
    const num = parseFloat(raw)
    let formatted: string
    if (unit.toLowerCase() === 'million' || unit.toLowerCase() === 'm') {
      formatted = `$${(num / 1).toFixed(0)}M`
    } else if (unit.toLowerCase() === 'k') {
      formatted = `$${(num / 1).toFixed(0)}K`
    } else if (num >= 1000) {
      formatted = num >= 1_000_000 ? `$${(num / 1_000_000).toFixed(1)}M` : `$${(num / 1000).toFixed(0)}K`
    } else {
      formatted = `$${num}`
    }
    if (!seen.has(formatted) && num > 10) {
      seen.add(formatted)
      // Infer type from surrounding context
      const idx = match.index
      const context = description.slice(Math.max(0, idx - 30), idx + 40).toLowerCase()
      const type: 'target' | 'support' | 'resistance' =
        context.includes('crash') || context.includes('drop') || context.includes('support') || context.includes('bottom') ? 'support' :
        context.includes('resistance') || context.includes('target') || context.includes('pump') || context.includes('high') ? 'target' :
        context.includes('wall') ? 'resistance' : 'target'
      prices.push({ price: formatted, type, confidence: 'low' })
    }
  }

  // Parse timestamps into watchMinutes
  const timestamps = extractTimestampsFromDescription(description)
  const watchMinutes = timestamps.slice(0, 6).map(t => ({ minute: t.time, topic: t.label }))

  // Sentiment analysis
  const bullish = /\b(bull(ish)?|long|buy|break(out|above)|pump|surge|uptrend|high|green|breakout|accumulate|call|recover|outperform)\b/gi
  const bearish = /\b(bear(ish)?|short|sell|dump|crash|downtrend|red|rug|pullback|break(ing)? down|liquidation|underperform)\b/gi
  const bullCount = (lower.match(bullish) || []).length
  const bearCount = (lower.match(bearish) || []).length
  const total = bullCount + bearCount
  const sentiment = total > 0 ? (bullCount > bearCount ? 'bullish' : bearCount > bullCount ? 'bearish' : 'neutral') : 'neutral'
  const score = total > 0 ? Math.round(((bullCount - bearCount) / total) * 100) : 0

  // Extract key dates from description
  const keyDates = extractKeyDates(description)

  // Detect assets with direction
  const mentionedAssets = detectAssetsWithDirection(description)

  return {
    signal: bullCount > bearCount + 2 ? 'BUY' : bearCount > bullCount + 2 ? 'SHORT' : 'HOLD',
    confidence: 'low',
    summary: title.slice(0, 250),
    keyInsights: extractKeyInsights(description),
    priceTargets: prices.slice(0, 8),
    keyDates,
    sentiment,
    overallScore: score,
    riskLevel: 'high',
    mentionedAssets,
    watchMinutes,
  }
}

function extractKeyDates(description: string): { date: string; event: string }[] {
  const dates: { date: string; event: string }[] = []
  // Match patterns like "Phase X: Name", "On March 11th", "Q2 2026", "summer 2026"
  const patterns = [
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}(?:st|nd|rd|th)?),?\s*(\d{4})/gi,
    /\b(Q[1-4]\s+\d{4}|Q[1-4]\s*\d{2})/gi,
    /\b(summer|winter|fall|autumn|spring)\s+(\d{4})/gi,
    /\b(Phase\s+\d+):?\s*([^.\n]{5,60})/gi,
    /\b(202[4-9]|203[0-9])\b/g,
  ]

  const seen = new Set<string>()
  for (const pattern of patterns) {
    let match
    pattern.lastIndex = 0
    while ((match = pattern.exec(description)) !== null) {
      let dateStr = match[0]
      let event = ''
      if (match[1] && /Phase/i.test(match[1])) {
        dateStr = match[1]
        event = match[2] || match[1]
      } else if (match[2]) {
        event = match[1]
        dateStr = match[2]
      } else {
        // For other matches, use surrounding text
        const start = Math.max(0, match.index - 30)
        const end = Math.min(description.length, match.index + match[0].length + 20)
        const snippet = description.slice(start, end)
        const parts = snippet.split(/[,.:\n]/).filter(s => s.trim().length > 3)
        event = parts[parts.length - 1]?.trim().slice(0, 50) || dateStr
      }
      if (!seen.has(dateStr)) {
        seen.add(dateStr)
        dates.push({ date: dateStr.slice(0, 30), event: event.slice(0, 60) })
      }
    }
  }
  return dates.slice(0, 6)
}

function detectAssetsWithDirection(description: string): { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[] {
  const lower = description.toLowerCase()
  const assets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[] = []

  const assetRules: { pattern: RegExp; name: string; bullishTerms: string[]; bearishTerms: string[] }[] = [
    { pattern: /\b(bitcoin|btc|xbt)\b/gi, name: 'Bitcoin', bullishTerms: ['btc pump', 'btc outperform', 'btc to $', 'bitcoin strength', 'bitcoin etf'], bearishTerms: ['btc crash', 'btc dump', 'bitcoin collapsing'] },
    { pattern: /\b(ethereum|eth)\b/gi, name: 'Ethereum', bullishTerms: [], bearishTerms: [] },
    { pattern: /\b(gold|xau)\b/gi, name: 'Gold', bullishTerms: ['gold pump', 'gold to $'], bearishTerms: ['gold trap', 'gold crash', 'gold top', 'gold fell', 'gold crashed'] },
    { pattern: /\b(silver|xag)\b/gi, name: 'Silver', bullishTerms: [], bearishTerms: ['silver crash', 'silver fell'] },
    { pattern: /\b(oil|wti|brent|crude)\b/gi, name: 'Oil', bullishTerms: ['oil shock', 'oil up', 'oil pump'], bearishTerms: [] },
    { pattern: /\b(s&p 500|s&p500|sp500|spy|es1!)\b/gi, name: 'S&P 500', bullishTerms: [], bearishTerms: [] },
  ]

  for (const rule of assetRules) {
    if (rule.pattern.test(lower)) {
      let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral'
      // Look for directional context within ±100 chars of mention
      const matches = Array.from(lower.matchAll(new RegExp(rule.pattern.source, 'gi')))
      for (const m of matches) {
        const idx = m.index || 0
        const context = lower.slice(Math.max(0, idx - 80), Math.min(lower.length, idx + 80))
        for (const bt of rule.bullishTerms) {
          if (context.includes(bt)) { direction = 'bullish'; break }
        }
        for (const brt of rule.bearishTerms) {
          if (context.includes(brt)) { direction = 'bearish'; break }
        }
        if (direction !== 'neutral') break
      }
      assets.push({ name: rule.name, direction })
    }
  }
  return assets
}

function extractKeyInsights(description: string): string[] {
  const insights: string[] = []
  const sentences = description.split(/[.!?\n]/).filter(s => s.trim().length > 15)
  for (const sentence of sentences.slice(0, 15)) {
    const clean = sentence.trim()
    if (clean.length > 15 && clean.length < 250) {
      // Find sentences with specific numbers, claims, or phase descriptions
      if (/\$\d|%|\d+\s*(percent|jobs|trillion|million|k\b)|Phase\s*\d|Algorithm/i.test(clean)) {
        insights.push(clean.slice(0, 200))
      }
    }
  }
  return insights.slice(0, 5)
}

function extractTimestampsFromDescription(description: string): { time: string; label: string; seconds: number }[] {
  const timestamps: { time: string; label: string; seconds: number }[] = []
  const lines = description.split('\n')
  for (const line of lines) {
    // Allow leading whitespace (timestamps often have leading spaces in YouTube descriptions)
    const match = line.match(/^\s*(\d{1,2}:)?(\d{1,2}):(\d{2})\s*[-–]?\s*(.+)/)
    if (match) {
      const hours = match[1] ? parseInt(match[1].replace(':', '')) : 0
      const minutes = parseInt(match[2])
      const seconds = parseInt(match[3])
      const totalSeconds = hours * 3600 + minutes * 60 + seconds
      const label = match[4].trim()
      if (label && totalSeconds < 24 * 3600) {
        timestamps.push({
          time: `${hours > 0 ? hours + ':' : ''}${minutes}:${seconds.toString().padStart(2, '0')}`,
          label,
          seconds: totalSeconds,
        })
      }
    }
  }
  return timestamps.slice(0, 15)
}

async function fetchLatestVideos(): Promise<any[]> {
  // First get the uploads playlist ID for the channel
  const channelRes = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${YOUTUBE_API_KEY}`
  )
  if (!channelRes.ok) return []
  const channelData = await channelRes.json()
  const uploadsId = channelData.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!uploadsId) return []

  // Fetch latest videos from uploads playlist
  const playlistRes = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails,status&maxResults=5&playlistId=${uploadsId}&key=${YOUTUBE_API_KEY}`
  )
  if (!playlistRes.ok) return []
  const playlistData = await playlistRes.json()

  // Filter to only public videos and get their full details
  const publicItems = (playlistData.items || []).filter((item: any) => {
    const status = item.status?.privacyStatus || item.snippet?.thumbnails ? 'public' : 'private'
    return status === 'public' || item.snippet?.thumbnails?.default
  })

  // Get video IDs and fetch statistics
  const videoIds = publicItems.map((item: any) => item.snippet.resourceId?.videoId).filter(Boolean)
  if (videoIds.length === 0) return []

  const statsRes = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoIds.join(',')}&key=${YOUTUBE_API_KEY}`
  )
  const statsData = statsRes.ok ? await statsRes.json() : { items: [] }
  const statsMap = new Map((statsData.items || []).map((item: any) => [item.id, item.statistics]))

  return publicItems.map((item: any) => {
    const videoId = item.snippet.resourceId?.videoId
    return {
      snippet: item.snippet,
      statistics: statsMap.get(videoId) || {},
      videoId,
    }
  })
}

export async function GET() {
  try {
    const videos = await fetchLatestVideos()
    if (videos.length === 0) {
      return NextResponse.json({ success: false, error: 'Could not fetch channel videos' })
    }

    // Analyze each video
    const analyzedVideos = await Promise.all(
      videos.map(async ({ snippet, statistics, videoId }) => {
        const description = snippet.description || ''
        const timestamps = extractTimestampsFromDescription(description)
        const viewCount = parseInt(statistics.viewCount || '0')
        const analysis = await analyzeWithAI(snippet.title, description, timestamps, viewCount)

        let publishedDisplay = ''
        try {
          const d = new Date(snippet.publishedAt)
          publishedDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        } catch { publishedDisplay = 'Recently' }

        return {
          id: videoId,
          title: snippet.title,
          description,
          published: snippet.publishedAt,
          publishedDisplay,
          thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          channelTitle: snippet.channelTitle,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          handle: CHANNEL_HANDLE,
          viewCount,
          likeCount: parseInt(statistics.likeCount || '0'),
          analysis,
          timestamps,
        }
      })
    )

    return NextResponse.json({
      success: true,
      videos: analyzedVideos,
      latest: analyzedVideos[0],
      channel: CHANNEL_HANDLE,
      channelUrl: `https://www.youtube.com/@${CHANNEL_HANDLE}`,
      timestamp: Date.now(),
    })
  } catch (err) {
    console.error('Influencer API error:', err)
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
