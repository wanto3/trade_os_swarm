import { NextResponse } from 'next/server'

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || ''

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('videoId')

  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId' }, { status: 400 })
  }

  if (!YOUTUBE_API_KEY) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 500 })
  }

  try {
    // Fetch video details from YouTube Data API v3
    const videoRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${YOUTUBE_API_KEY}`,
      { next: { revalidate: 3600 } }
    )
    const videoData = await videoRes.json()

    if (!videoData.items || videoData.items.length === 0) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    const item = videoData.items[0]
    const snippet = item.snippet
    const stats = item.statistics || {}

    // Extract chapters from description
    const description = snippet.description || ''
    const chapters = extractChapters(description)

    // Extract key info
    const keywords = snippet.tags || []
    const viewCount = parseInt(stats.viewCount || '0')
    const likeCount = parseInt(stats.likeCount || '0')

    return NextResponse.json({
      success: true,
      videoId,
      title: snippet.title,
      description,
      publishedAt: snippet.publishedAt,
      channelTitle: snippet.channelTitle,
      channelId: snippet.channelId,
      viewCount,
      likeCount,
      chapters,
      keywords,
      thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
      // Extract timestamps mentioned in description
      timestamps: extractTimestamps(description),
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: String(err),
      videoId,
    }, { status: 500 })
  }
}

interface Chapter {
  time: string
  title: string
  seconds: number
}

interface Timestamp {
  time: string
  label: string
  seconds: number
}

function extractChapters(description: string): Chapter[] {
  const chapters: Chapter[] = []
  // Match patterns like "0:00 Intro" or "00:00 - Introduction"
  const lines = description.split('\n')
  for (const line of lines) {
    const match = line.match(/^(\d{1,2}:)?(\d{1,2}):(\d{2})\s*[-–]?\s*(.+)/)
    if (match) {
      const hours = match[1] ? parseInt(match[1].replace(':', '')) : 0
      const minutes = parseInt(match[2])
      const seconds = parseInt(match[3])
      const totalSeconds = hours * 3600 + minutes * 60 + seconds
      const title = match[4].trim()
      if (title && totalSeconds < 24 * 3600) { // skip if > 24h
        chapters.push({
          time: `${hours > 0 ? hours + ':' : ''}${minutes}:${seconds.toString().padStart(2, '0')}`,
          title,
          seconds: totalSeconds,
        })
      }
    }
  }
  return chapters.slice(0, 20) // max 20 chapters
}

function extractTimestamps(description: string): Timestamp[] {
  const timestamps: Timestamp[] = []
  // Match timestamps like "1:23" or "12:34" with context
  const pattern = /(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]?\s*([^\n]{5,60})/g
  let match
  while ((match = pattern.exec(description)) !== null) {
    const timeStr = match[1]
    const label = match[2].trim()
    const parts = timeStr.split(':').map(Number)
    let seconds = 0
    if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
    } else if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1]
    }
    if (seconds > 0 && seconds < 24 * 3600 && label.length > 3) {
      timestamps.push({ time: timeStr, label, seconds })
    }
  }
  return timestamps.slice(0, 15)
}
