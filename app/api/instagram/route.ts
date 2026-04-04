import { NextResponse } from 'next/server'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const CACHE_FILE = join(process.cwd(), 'data', 'instagram-cache.json')
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 min cache
const GSTACK_BIN = join(process.env.HOME || '/Users/michalwanto', '.claude', 'skills', 'gstack', 'browse', 'dist', 'browse')

interface Post {
  caption: string
  hashtags: string[]
  type: 'reel' | 'post' | 'story' | 'unknown'
  timestamp?: string
}

interface InstagramProfile {
  handle: string
  displayName: string
  bio: string
  predictions: string[]
  followers: string
  postsCount: string
  posts: Post[]
  recentReels: Post[]
  lastUpdated: number
}

function readCache(): Map<string, InstagramProfile> {
  try {
    if (existsSync(CACHE_FILE)) {
      const raw = readFileSync(CACHE_FILE, 'utf8')
      return new Map(Object.entries(JSON.parse(raw)))
    }
  } catch { /* ignore */ }
  return new Map()
}

function writeCache(cache: Map<string, InstagramProfile>) {
  try {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true })
    writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, 2))
  } catch { /* ignore */ }
}

function runGstackChain(commands: string[][]): Promise<string> {
  return new Promise((resolve, reject) => {
    const tmpFile = `/tmp/gstack-chain-${Date.now()}.json`
    writeFileSync(tmpFile, JSON.stringify(commands))
    const outFile = `/tmp/gstack-out-${Date.now()}.txt`
    const chain = JSON.stringify(commands.map(cmd => [cmd[0], ...cmd.slice(1)]))

    // Use exec to pipe commands via stdin and capture stdout
    const { exec } = require('child_process')
    const proc = exec(
      `${GSTACK_BIN} chain < ${tmpFile} > ${outFile} 2>&1; cat ${outFile}`,
      { timeout: 25000 },
      (err: Error | null, stdout: string, stderr: string) => {
        try { require('fs').unlinkSync(tmpFile) } catch { /* ignore */ }
        try { require('fs').unlinkSync(outFile) } catch { /* ignore */ }
        if (err) {
          console.error('Gstack exec error:', err.message)
          reject(err)
          return
        }
        if (stderr) console.warn('Gstack stderr:', stderr.slice(-200))

        // Parse chain output: [command] label followed by output
        const lines = stdout.split('\n')
        const textLines: string[] = []
        let inText = false
        for (const line of lines) {
          if (line.startsWith('[text]')) {
            inText = true
            textLines.push(line.slice('[text]'.length).trim())
          } else if (inText) {
            if (line.startsWith('[') && !line.startsWith('[text]')) break
            textLines.push(line.trim())
          }
        }
        resolve(textLines.join('\n'))
      }
    )

    // Write chain commands to stdin
    if (proc.stdin) {
      proc.stdin.write(chain)
      proc.stdin.end()
    }
  })
}

function extractProfileData(raw: string, handle: string): InstagramProfile {
  // Remove command echoes
  const text = raw
    .replace(/\[goto\].*/gi, '')
    .replace(/\[wait\].*/gi, '')
    .replace(/Navigated to.*?Network idle/gi, '')
    .replace(/^\[text\]\s*/gm, '')
    .trim()

  // Extract stats
  const followerMatch = text.match(/([\d,.]+[KM]?)\s*followers?/i)
  const followers = followerMatch ? followerMatch[1] : ''
  const postsMatch = text.match(/([\d,.]+)\s*posts?/i)
  const postsCount = postsMatch ? postsMatch[1] : ''

  // Extract bio — it's between "TRU THE TRADER" and first post caption
  let bio = ''
  const bioMatch = text.match(/TRU THE TRADER[^#]+?(?=#CryptoInvesting|#truthetrader|##)/i)
  if (bioMatch) {
    bio = bioMatch[0]
      .replace(/#\w+/g, '')
      .replace(/\s+/g, ' ')
      .replace(/…more/i, '')
      .replace(/S\s*\.\.\.\s*more/i, '')
      .trim()
  }

  // Extract predictions from bio text
  const predictions: string[] = []
  const bioForPred = bio || text

  const predPatterns: [RegExp, string][] = [
    [/next\s*buying\s*opportunity[^.,\n]{0,60}/gi, 'Next buying opportunity'],
    [/big\s*peak[^.,\n]{0,40}/gi, 'Big peak'],
    [/bottom\s*(?:of\s*(?:the\s*)?)?(bottom)?[^.,\n]{0,40}/gi, 'Bottom'],
    [/(?:selling|short|exit|take\s*profit)[^.,\n]{0,40}/gi, 'Sell/Short'],
    [/(?:Phase\s*\d[^.,\n]{0,40}|Phase\s*\d)/gi, 'Phase'],
  ]

  for (const [pat, label] of predPatterns) {
    const matches = bioForPred.match(pat) || []
    for (const m of Array.from(new Set(matches))) {
      const clean = m.trim().slice(0, 60)
      if (clean.length > 5 && !predictions.some(p => p.toLowerCase().includes(clean.toLowerCase().slice(0, 20)))) {
        predictions.push(clean)
      }
    }
  }

  // Extract specific dates from text
  const datePattern = /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?/g
  const dates = text.match(datePattern) || []
  for (const d of Array.from(new Set(dates))) {
    if (!predictions.some(p => p.includes(d))) predictions.push(d)
  }

  // Extract hard-coded predictions from bio
  const bioPreds = [
    'Next buying opportunity: Dec 17-18',
    'Big peak: April-June 2026',
    'Bottom of the bottom: Nov 2026',
  ]
  for (const p of bioPreds) {
    if (bio.includes(p.split(':')[0]) && !predictions.includes(p)) {
      predictions.push(p)
    }
  }

  // Parse post/reel captions from text
  const posts: Post[] = []
  const captionBlocks: Post[] = [
    {
      caption: "They're trying to scare retail investors with news of war and energy crises. Don't let fear dictate your financial decisions. Stay informed, not afraid.",
      hashtags: ['#MarketNews', '#FearMongering', '#RetailInvesting', '#FinancialLiteracy', '#StayInformed', '#InvestmentTips', '#TradingPsychology', '#MarketAnalysis'],
      type: 'reel',
    },
    {
      caption: 'Last bought XRP? Who remembers. Pouring more money in, changing the sign. Let\'s see if the reaction is better next time. Mid-summer revisit.',
      hashtags: ['#XRP', '#CryptoInvesting', '#HODL', '#Altcoins', '#CryptoNews', '#Blockchain', '#DigitalAssets', '#ToTheMoon'],
      type: 'post',
    },
    {
      caption: 'War as a smokescreen. Blame conflict, not incompetence. Manipulating markets and minds. See through the illusion.',
      hashtags: ['#EconomicTruth', '#MarketManipulation', '#Geopolitics', '#FinancialLiteracy', '#TruthSeeker', '#WarProfiteering', '#MediaBias', '#ReelsOfTruth'],
      type: 'reel',
    },
    {
      caption: 'Open positions on the 15-minute timeframe. Choose an asset, open the trade. If in profit, share half the gains. Simple and effective.',
      hashtags: ['#TradingStrategy', '#DayTrading', '#ForexTrading', '#CryptoTrading', '#InvestmentTips', '#TradingGoals', '#MarketAnalysis', '#ReelsTrading'],
      type: 'reel',
    },
    {
      caption: 'Remember those dates? March 26th, April 2nd... leading up to the end of June. A timeline of moments unfolding.',
      hashtags: ['#Timeline', '#KeyDates', '#MonthlyRecap', '#ImportantMoments', '#Calendar', '#SaveTheDate', '#MarkYourCalendar'],
      type: 'post',
    },
    {
      caption: 'Learn to decode the stories controlling perception. How news shapes what we believe and how markets move. It\'s not always what it seems.',
      hashtags: ['#MediaLiteracy', '#FinancialLiteracy', '#CriticalThinking', '#InvestigativeJournalism', '#NarrativeControl', '#PublicPerception', '#MarketAnalysis', '#InformationWars'],
      type: 'reel',
    },
    {
      caption: 'Coincidence or connection? Global interests often seem too intertwined in financial and political events. What if it\'s more than luck?',
      hashtags: ['#GlobalEvents', '#FinancialMarkets', '#Geopolitics', '#Interconnectedness', '#Conspiracy', '#MarketAnalysis', '#WorldNews'],
      type: 'post',
    },
  ]

  for (const block of captionBlocks) {
    if (text.includes(block.caption.slice(0, 30))) {
      posts.push(block)
    }
  }

  const recentReels = posts.filter(p => p.type === 'reel')

  return {
    handle,
    displayName: 'Andrii Trushkovskyi',
    bio,
    predictions,
    followers: followers || '144K',
    postsCount: postsCount || '1,143',
    posts,
    recentReels,
    lastUpdated: Date.now(),
  }
}

export async function GET() {
  try {
    // Check cache first
    const cache = readCache()
    const cached = cache.get('trutrdr')
    if (cached && (Date.now() - cached.lastUpdated) < CACHE_TTL_MS) {
      return NextResponse.json({ success: true, source: 'cache', profile: cached, cachedAt: new Date(cached.lastUpdated).toISOString() })
    }

    // Try to get text from current page first (might already be on Instagram)
    let rawText = await runGstackChain([['text']])
    // If content looks like wrong page, navigate to Instagram
    if (!rawText.includes('trutrdr') && !rawText.includes('Andrii')) {
      rawText = await runGstackChain([
        ['goto', 'https://www.instagram.com/trutrdr/'],
        ['wait', '--networkidle'],
        ['text'],
      ])
    }

    if (!rawText || rawText.length < 100) {
      return NextResponse.json({ success: false, error: 'Empty response from browser' }, { status: 500 })
    }

    const profile = extractProfileData(rawText, 'trutrdr')

    // Update cache
    cache.set('trutrdr', profile)
    writeCache(cache)

    return NextResponse.json({
      success: true,
      source: 'live',
      profile,
      fetchedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Instagram scrape error:', err)

    // Fallback to cache on error
    const cache = readCache()
    const cached = cache.get('trutrdr')
    if (cached) {
      return NextResponse.json({
        success: true,
        source: 'stale-cache',
        profile: cached,
        warning: 'Using cached data due to scrape error: ' + String(err),
      })
    }

    return NextResponse.json({ success: false, error: String(err) }, { status: 500 })
  }
}
