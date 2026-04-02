"use client"

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, ExternalLink, Play, TrendingUp, TrendingDown, Minus, Calendar, Target, DollarSign, ChevronDown, ChevronUp, Eye, BarChart2, AlertTriangle, Clock, Zap, Instagram, Megaphone, Users, MessageCircle } from 'lucide-react'

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

interface Video {
  id: string
  title: string
  published: string
  publishedDisplay: string
  thumbnail: string
  channelTitle: string
  url: string
  handle: string
  analysis: TradingAnalysis
  timestamps: { time: string; label: string; seconds: number }[]
  viewCount: number
  likeCount: number
}

interface ApiResponse {
  success: boolean
  videos: Video[]
  latest: Video
  channel: string
  channelUrl: string
  error?: string
}

interface InstagramProfile {
  handle: string
  displayName: string
  bio: string
  predictions: string[]
  followers: string
  postsCount: string
  posts: { caption: string; hashtags: string[]; type: 'reel' | 'post' | 'story' }[]
  recentReels: { caption: string; hashtags: string[]; type: string }[]
  lastUpdated: number
}

interface InstagramApiResponse {
  success: boolean
  source: string
  profile: InstagramProfile
  warning?: string
  fetchedAt?: string
}

const SIGNAL_CONFIG: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
  BUY: { color: '#3fb950', bg: 'rgba(63,185,80,0.12)', border: 'rgba(63,185,80,0.3)', icon: TrendingUp, label: 'BUY' },
  HOLD: { color: '#f0c000', bg: 'rgba(240,192,0,0.12)', border: 'rgba(240,192,0,0.3)', icon: Minus, label: 'HOLD' },
  SHORT: { color: '#f85149', bg: 'rgba(248,81,73,0.12)', border: 'rgba(248,81,73,0.3)', icon: TrendingDown, label: 'SHORT' },
  NEUTRAL: { color: '#6e7681', bg: 'rgba(110,118,129,0.08)', border: 'rgba(110,118,129,0.2)', icon: Minus, label: 'NEUTRAL' },
}

const TYPE_COLORS: Record<string, string> = {
  entry: '#3fb950',
  target: '#58a6ff',
  stop: '#f85149',
  support: '#3fb950',
  resistance: '#f85149',
}

const CONFIDENCE_COLORS = { high: '#3fb950', medium: '#f0c000', low: '#6e7681' }
const RISK_COLORS = { low: '#3fb950', medium: '#f0c000', high: '#f85149' }
const DIRECTION_COLORS = { bullish: '#3fb950', bearish: '#f85149', neutral: '#6e7681' }

function ScoreBar({ score }: { score: number }) {
  const pct = ((score + 100) / 200) * 100
  const isBullish = score > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <BarChart2 size={9} color='#6e7681' />
      <div style={{ flex: 1, height: 4, backgroundColor: 'rgba(42,42,74,0.6)', borderRadius: 2, overflow: 'hidden', maxWidth: 60 }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: isBullish ? 'linear-gradient(90deg, #3fb950, #2ea043)' : 'linear-gradient(90deg, #da3633, #f85149)',
          borderRadius: 2,
        }} />
      </div>
      <span style={{
        fontSize: '0.52rem', fontWeight: 700,
        color: isBullish ? '#3fb950' : '#f85149',
        minWidth: 28,
      }}>
        {score > 0 ? '+' : ''}{score}
      </span>
    </div>
  )
}

function formatViewCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return n.toString()
}

function VideoCard({ video, isLatest }: { video: Video; isLatest: boolean }) {
  const [expanded, setExpanded] = useState(isLatest)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [chaptersOpen, setChaptersOpen] = useState(false)
  const sig = SIGNAL_CONFIG[video.analysis.signal]
  const SigIcon = sig.icon

  return (
    <div style={{
      backgroundColor: '#161b22',
      border: `1px solid ${sig.border}`,
      borderRadius: '10px',
      overflow: 'hidden',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: isLatest ? `0 0 16px ${sig.color}10` : 'none',
    }}>
      {/* Header — clickable thumbnail */}
      <a href={video.url} target='_blank' rel='noopener noreferrer' style={{ textDecoration: 'none', display: 'block' }}>
        <div style={{ position: 'relative' }}>
          <img
            src={video.thumbnail}
            alt={video.title}
            style={{ width: '100%', height: '130px', objectFit: 'cover', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).src = `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg` }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}>
              <Play size={14} fill='#1a1a1a' color='#1a1a1a' style={{ marginLeft: '2px' }} />
            </div>
          </div>
          {isLatest && (
            <div style={{
              position: 'absolute', top: 7, left: 7,
              backgroundColor: '#f85149',
              color: '#fff', fontSize: '0.48rem', fontWeight: 700,
              padding: '2px 5px', borderRadius: '4px', letterSpacing: '0.05em',
            }}>
              LATEST
            </div>
          )}
          {video.viewCount > 0 && (
            <div style={{
              position: 'absolute', bottom: 6, right: 6,
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: '#fff', fontSize: '0.48rem', fontWeight: 600,
              padding: '2px 5px', borderRadius: '4px',
            }}>
              {formatViewCount(video.viewCount)} views
            </div>
          )}
        </div>
      </a>

      {/* Content */}
      <div style={{ padding: '0.7rem' }}>
        {/* Channel + date */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '5px', fontWeight: 700, color: '#fff',
            }}>E</div>
            <span style={{ fontSize: '0.58rem', color: '#8b949e', fontWeight: 600 }}>@{video.handle}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#484f58', fontSize: '0.52rem' }}>
            <Calendar size={8} />
            {video.publishedDisplay}
          </div>
        </div>

        {/* Title */}
        <a href={video.url} target='_blank' rel='noopener noreferrer' style={{ textDecoration: 'none' }}>
          <h4 style={{
            fontSize: '0.68rem', fontWeight: 600, color: '#e6edf3',
            margin: '0 0 0.4rem', lineHeight: 1.4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {video.title}
          </h4>
        </a>

        {/* Signal row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '3px',
            backgroundColor: sig.bg, border: `1px solid ${sig.border}`,
            borderRadius: '5px', padding: '2px 7px',
          }}>
            <SigIcon size={9} color={sig.color} />
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: sig.color, letterSpacing: '0.04em' }}>
              {sig.label}
            </span>
          </div>
          {/* Confidence dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {[1,2,3].map(i => (
              <div key={i} style={{
                width: 5, height: 5, borderRadius: '50%',
                background: i <= (video.analysis.confidence === 'high' ? 3 : video.analysis.confidence === 'medium' ? 2 : 1)
                  ? CONFIDENCE_COLORS[video.analysis.confidence]
                  : 'rgba(42,42,74,0.8)',
              }} />
            ))}
            <span style={{ fontSize: '0.48rem', color: '#6e7681', marginLeft: '1px' }}>
              {video.analysis.confidence}
            </span>
          </div>
          {/* Sentiment */}
          {video.analysis.sentiment !== 'neutral' && (
            <span style={{
              fontSize: '0.52rem', fontWeight: 600,
              color: video.analysis.sentiment === 'bullish' ? '#3fb950' : '#f85149',
            }}>
              {video.analysis.sentiment === 'bullish' ? '↑ bullish' : '↓ bearish'}
            </span>
          )}
          {/* Risk */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            <AlertTriangle size={7} color={RISK_COLORS[video.analysis.riskLevel]} />
            <span style={{ fontSize: '0.48rem', color: RISK_COLORS[video.analysis.riskLevel] }}>
              {video.analysis.riskLevel} risk
            </span>
          </div>
        </div>

        {/* Score bar */}
        <div style={{ marginBottom: '0.4rem' }}>
          <ScoreBar score={video.analysis.overallScore} />
        </div>

        {/* Summary */}
        <p style={{
          fontSize: '0.58rem', color: '#8b949e', margin: '0 0 0.3rem', lineHeight: 1.45,
          display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: expanded ? 999 : 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {video.analysis.summary}
        </p>

        {/* Mentioned assets */}
        {video.analysis.mentionedAssets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.4rem' }}>
            {video.analysis.mentionedAssets.slice(0, 5).map((asset, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                background: `rgba(${asset.direction === 'bullish' ? '63,185,80' : asset.direction === 'bearish' ? '248,81,73' : '110,118,129'},0.08)`,
                border: `1px solid ${DIRECTION_COLORS[asset.direction]}22`,
                borderRadius: '4px', padding: '1px 5px',
              }}>
                <span style={{ fontSize: '0.5rem', fontWeight: 600, color: DIRECTION_COLORS[asset.direction] }}>
                  {asset.direction === 'bullish' ? '↑' : asset.direction === 'bearish' ? '↓' : '→'}
                </span>
                <span style={{ fontSize: '0.5rem', color: '#8b949e' }}>{asset.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Price targets */}
        {video.analysis.priceTargets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.4rem' }}>
            {video.analysis.priceTargets.slice(0, 5).map((pt, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                background: 'rgba(88,166,255,0.07)',
                border: '1px solid rgba(88,166,255,0.18)',
                borderRadius: '4px', padding: '1px 5px',
              }}>
                <DollarSign size={7} color={TYPE_COLORS[pt.type] || '#58a6ff'} />
                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: TYPE_COLORS[pt.type] || '#58a6ff' }}>
                  {pt.price}
                </span>
                <span style={{ fontSize: '0.45rem', color: '#484f58', textTransform: 'capitalize' }}>{pt.type}</span>
                {pt.date && <span style={{ fontSize: '0.45rem', color: '#6e7681' }}>{pt.date.slice(0, 10)}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Key dates */}
        {video.analysis.keyDates.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.4rem' }}>
            {video.analysis.keyDates.slice(0, 3).map((kd, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: '2px',
                background: 'rgba(163,113,247,0.07)',
                border: '1px solid rgba(163,113,247,0.18)',
                borderRadius: '4px', padding: '1px 5px',
              }}>
                <Calendar size={7} color='#a371f7' />
                <span style={{ fontSize: '0.52rem', color: '#a371f7' }}>
                  {kd.date.length > 18 ? kd.date.slice(0, 16) + '…' : kd.date}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Key Insights (expandable) */}
        {video.analysis.keyInsights.length > 0 && (
          <div>
            <button
              onClick={() => setInsightsOpen(!insightsOpen)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6e7681', fontSize: '0.55rem', padding: '2px 0',
                display: 'flex', alignItems: 'center', gap: '3px', marginBottom: '3px',
              }}
            >
              <Zap size={8} />
              {insightsOpen ? 'Hide' : 'Key'} Insights ({video.analysis.keyInsights.length})
              {insightsOpen ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
            </button>
            {insightsOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {video.analysis.keyInsights.map((insight, i) => (
                  <div key={i} style={{
                    fontSize: '0.55rem', color: '#8b949e',
                    lineHeight: 1.4, paddingLeft: '8px',
                    borderLeft: `2px solid ${sig.border}`,
                  }}>
                    {insight.slice(0, 200)}{insight.length > 200 ? '…' : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Watch minutes / chapters (expandable) */}
        {video.timestamps.length > 0 && (
          <div>
            <button
              onClick={() => setChaptersOpen(!chaptersOpen)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6e7681', fontSize: '0.55rem', padding: '2px 0',
                display: 'flex', alignItems: 'center', gap: '3px',
              }}
            >
              <Clock size={8} />
              {chaptersOpen ? 'Hide' : 'Watch'} Chapters ({video.timestamps.length})
              {chaptersOpen ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
            </button>
            {chaptersOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px' }}>
                {video.timestamps.slice(0, 10).map((ts, i) => (
                  <a
                    key={i}
                    href={`${video.url}&t=${ts.seconds}`}
                    target='_blank'
                    rel='noopener noreferrer'
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      textDecoration: 'none', padding: '2px 4px',
                      borderRadius: '3px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(42,42,74,0.4)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ fontSize: '0.52rem', color: '#58a6ff', fontWeight: 600, minWidth: 28 }}>
                      {ts.time}
                    </span>
                    <span style={{ fontSize: '0.52rem', color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ts.label}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Expand/collapse main */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6e7681', fontSize: '0.55rem', padding: '3px 0',
            display: 'flex', alignItems: 'center', gap: '3px', marginTop: '3px',
          }}
        >
          {expanded ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
          {expanded ? 'Show less' : 'Show more'}
        </button>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.35rem 0.7rem',
        borderTop: '1px solid rgba(42,42,74,0.5)',
      }}>
        <a href={video.url} target='_blank' rel='noopener noreferrer'
          style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', color: '#6e7681', fontSize: '0.52rem' }}>
          <Play size={8} />Watch on YouTube <ExternalLink size={7} />
        </a>
        {video.likeCount > 0 && (
          <span style={{ fontSize: '0.48rem', color: '#484f58' }}>
            ♥ {formatViewCount(video.likeCount)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function InfluencerInsights() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [igData, setIgData] = useState<InstagramApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastFetched, setLastFetched] = useState<number>(0)
  const [predictionsOpen, setPredictionsOpen] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch YouTube and Instagram in parallel
      const [ytRes, igRes] = await Promise.all([
        fetch('/api/influencer', { cache: 'no-store' }),
        fetch('/api/instagram', { cache: 'no-store' }),
      ])
      const ytJson: ApiResponse = await ytRes.json()
      const igJson: InstagramApiResponse = await igRes.json()
      if (ytJson.success) {
        setData(ytJson)
        setLastFetched(Date.now())
      } else {
        setError(ytJson.error || 'Failed to fetch influencer insights')
      }
      if (igJson.success) {
        setIgData(igJson)
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const timeSinceFetch = lastFetched > 0 ? Math.round((Date.now() - lastFetched) / 60000) : 0

  return (
    <div style={{
      backgroundColor: '#161b22',
      border: '1px solid rgba(42,42,74,0.8)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.7rem 0.9rem',
        borderBottom: '1px solid rgba(42,42,74,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: 22, height: 22, borderRadius: '6px',
            background: 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Play size={11} fill='#fff' color='#fff' style={{ marginLeft: '1px' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>
              Influencer Insights
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
              <span style={{ fontSize: '0.52rem', color: '#6e7681' }}>
                @{data?.channel || '...'}
              </span>
              {lastFetched > 0 && (
                <span style={{ fontSize: '0.48rem', color: '#484f58' }}>
                  {timeSinceFetch < 1 ? 'just now' : `${timeSinceFetch}m ago`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {data && (
            <div style={{
              fontSize: '0.52rem', color: '#484f58',
              backgroundColor: 'rgba(42,42,74,0.4)',
              padding: '2px 8px', borderRadius: '10px',
            }}>
              {data.videos.length} videos
            </div>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            title="Refresh"
            style={{
              background: loading ? 'rgba(63,185,80,0.08)' : 'none',
              border: `1px solid ${loading ? 'rgba(63,185,80,0.3)' : '#30363d'}`,
              borderRadius: '7px', cursor: loading ? 'not-allowed' : 'pointer',
              color: loading ? '#3fb950' : '#6e7681',
              display: 'flex', alignItems: 'center', padding: '5px 8px',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '0.75rem' }}>
        {loading && !data ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '180px', color: '#6e7681', fontSize: '0.72rem', gap: '8px',
          }}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            Analyzing latest videos...
          </div>
        ) : error ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '140px', gap: '8px', color: '#6e7681',
          }}>
            <div style={{ fontSize: '0.68rem', color: '#f85149' }}>Failed to load</div>
            <button onClick={fetchData} style={{
              background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)',
              borderRadius: '6px', padding: '5px 12px', cursor: 'pointer',
              color: '#3fb950', fontSize: '0.58rem', fontWeight: 600,
            }}>
              Retry
            </button>
          </div>
        ) : data ? (
          <>
            {/* Instagram Section */}
            {igData?.success && igData.profile && (
              <div style={{ marginBottom: '0.75rem' }}>
                {/* Instagram Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: '0.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '5px',
                      background: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #F77737 100%)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Instagram size={10} color='#fff' />
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#e6edf3' }}>
                      @{igData.profile.handle}
                    </span>
                    <span style={{ fontSize: '0.5rem', color: '#484f58' }}>
                      {igData.profile.followers} followers · {igData.profile.postsCount} posts
                    </span>
                  </div>
                  <a href={`https://instagram.com/${igData.profile.handle}/`} target='_blank' rel='noopener noreferrer'
                    style={{ textDecoration: 'none', color: '#6e7681', fontSize: '0.5rem', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <Instagram size={8} />Open <ExternalLink size={7} />
                  </a>
                </div>

                {/* Bio */}
                {igData.profile.bio && (
                  <p style={{
                    fontSize: '0.58rem', color: '#8b949e', margin: '0 0 0.5rem',
                    background: 'rgba(42,42,74,0.3)', borderRadius: '6px',
                    padding: '0.4rem 0.5rem', lineHeight: 1.4,
                    borderLeft: '2px solid rgba(248,81,73,0.3)',
                  }}>
                    {igData.profile.bio}
                  </p>
                )}

                {/* Key Predictions — collapsible */}
                {igData.profile.predictions.length > 0 && (
                  <div>
                    <button
                      onClick={() => setPredictionsOpen(!predictionsOpen)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#8b949e', fontSize: '0.58rem', padding: '2px 0',
                        display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px',
                      }}
                    >
                      <Megaphone size={9} color='#f85149' />
                      <span style={{ fontWeight: 700, color: '#f85149' }}>Key Predictions</span>
                      <span style={{ color: '#484f58' }}>({igData.profile.predictions.length})</span>
                      {predictionsOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                    </button>
                    {predictionsOpen && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {igData.profile.predictions.map((pred, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', gap: '3px',
                            background: 'rgba(248,81,73,0.08)',
                            border: '1px solid rgba(248,81,73,0.2)',
                            borderRadius: '5px', padding: '2px 7px',
                          }}>
                            <Calendar size={7} color='#f85149' />
                            <span style={{ fontSize: '0.55rem', color: '#e6edf3', fontWeight: 500 }}>
                              {pred}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Recent Instagram Posts */}
                {igData.profile.posts.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.52rem', color: '#484f58', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MessageCircle size={8} />Recent posts ({igData.profile.posts.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      {igData.profile.posts.slice(0, 5).map((post, i) => (
                        <div key={i} style={{
                          background: 'rgba(42,42,74,0.25)',
                          border: '1px solid rgba(42,42,74,0.5)',
                          borderRadius: '6px', padding: '0.35rem 0.5rem',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                            <span style={{
                              fontSize: '0.42rem', fontWeight: 700, color: '#fff',
                              background: post.type === 'reel' ? 'rgba(163,113,247,0.8)' : 'rgba(63,185,80,0.8)',
                              padding: '1px 4px', borderRadius: '3px',
                            }}>
                              {post.type.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '0.48rem', color: '#484f58' }}>
                              {post.hashtags.slice(0, 3).join(' ')}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.52rem', color: '#8b949e', margin: 0, lineHeight: 1.4,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {post.caption}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* YouTube Videos */}
            <div style={{ marginTop: igData?.success ? '0.5rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '5px',
                  background: 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Play size={10} fill='#fff' color='#fff' style={{ marginLeft: '1px' }} />
                </div>
                <span style={{ fontSize: '0.58rem', fontWeight: 600, color: '#6e7681' }}>
                  Latest Videos ({data.videos.length})
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))',
                gap: '0.75rem',
              }}>
                {data.videos.map((video, i) => (
                  <VideoCard key={video.id} video={video} isLatest={i === 0} />
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* Footer */}
      {!loading && data && (
        <div style={{
          padding: '0.35rem 0.75rem',
          borderTop: '1px solid rgba(42,42,74,0.4)',
          fontSize: '0.48rem', color: '#484f58',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>AI from video descriptions + Instagram bio — verify all claims</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <a href={data.channelUrl} target='_blank' rel='noopener noreferrer'
              style={{ color: '#6e7681', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
              YouTube <ExternalLink size={7} />
            </a>
            {igData?.success && (
              <a href={`https://instagram.com/${igData.profile.handle}/`} target='_blank' rel='noopener noreferrer'
                style={{ color: '#6e7681', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}>
                Instagram <ExternalLink size={7} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
