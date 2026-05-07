'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, MessageSquare, Trash2, Send, Bookmark } from 'lucide-react'

/**
 * Build a bookmarklet that scrapes the currently-visible Discord messages
 * from the user's logged-in browser session and POSTs them to our API.
 *
 * Why: Discord's API blocks user-account reads (selfbot ToS violation, can
 * get account banned). But scraping the DOM in the user's own browser
 * session is virtually undetectable — no API calls, no automation
 * fingerprint. One click while viewing a channel = fresh analysis.
 *
 * The JS is intentionally compact + self-contained. Discord's CSS classes
 * are hashed (e.g. "username_a8d4ef") but the prefix is stable, so we use
 * partial-match selectors (`[class*="username_"]`) that survive their
 * occasional updates. If Discord ever rewrites their DOM significantly
 * we update this template; bookmarklet users would re-drag a fresh copy.
 *
 * @param apiUrl Absolute URL of the /api/discord-influencer endpoint —
 *               baked into the bookmarklet so it works regardless of
 *               where the dashboard is hosted.
 */
function buildBookmarklet(apiUrl: string): string {
  const code = `(async()=>{try{
const msgs=document.querySelectorAll('[id^="chat-messages-"]');
if(!msgs.length){alert('Trader OS: No Discord messages found. Make sure you are viewing a channel and have scrolled the messages you want analyzed into view.');return;}
const lines=[];let lastAuthor='';
for(const m of msgs){
const a=m.querySelector('[class*="username_"]')||m.querySelector('h3 [class*="username_"]');
const author=a?a.textContent.trim():lastAuthor;if(author)lastAuthor=author;
const t=m.querySelector('time');
const time=t?(t.getAttribute('datetime')||t.textContent.trim()):'';
const c=m.querySelector('[class*="messageContent_"]');
const content=c?c.textContent.trim():'';
if(content){lines.push((time?'['+time+'] ':'')+author+': '+content);}}
if(!lines.length){alert('Trader OS: Could not extract messages. Try scrolling, then click again.');return;}
const text=lines.join('\\n');
const tEl=document.createElement('div');
tEl.style.cssText='position:fixed;bottom:24px;right:24px;background:#161b22;color:#e6edf3;padding:12px 18px;border-radius:8px;border:1px solid #30363d;font-size:13px;z-index:99999;font-family:Inter,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
tEl.textContent='Trader OS: analyzing '+lines.length+' messages...';document.body.appendChild(tEl);
const r=await fetch(${JSON.stringify(apiUrl)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
const j=await r.json();
tEl.textContent=j.success?('Trader OS: '+lines.length+' messages analyzed. Open dashboard to view.'):('Trader OS error: '+(j.error||'unknown').slice(0,150));
tEl.style.background=j.success?'#0a3a1f':'#3a0a0a';
setTimeout(()=>tEl.remove(),5000);
}catch(e){alert('Trader OS bookmarklet error: '+e.message);}})();`
  // Strip newlines + extra whitespace for tighter URL
  const minified = code.replace(/\n\s*/g, '').replace(/\s+/g, ' ')
  return `javascript:${encodeURIComponent(minified)}`
}

interface TradingAnalysis {
  signal: 'BUY' | 'HOLD' | 'SHORT' | 'NEUTRAL'
  confidence: 'high' | 'medium' | 'low'
  summary: string
  keyInsights: string[]
  priceTargets: { price: string; date?: string; type: string; confidence: string }[]
  keyDates: { date: string; event: string }[]
  sentiment: 'bullish' | 'bearish' | 'neutral'
  overallScore: number
  riskLevel: 'low' | 'medium' | 'high'
  mentionedAssets: { name: string; direction: 'bullish' | 'bearish' | 'neutral' }[]
}

interface AnalyzedBatch {
  id: string
  source: 'paste' | 'bot'
  rawText: string
  messageCount: number
  analysis: TradingAnalysis
  analyzedAt: number
}

interface ApiResponse {
  success: boolean
  influencer: string
  batches: AnalyzedBatch[]
  latest: AnalyzedBatch | null
  botMode: boolean
  error?: string
}

const SIGNAL_COLORS: Record<TradingAnalysis['signal'], string> = {
  BUY: '#3fb950',
  SHORT: '#f85149',
  HOLD: '#f0883e',
  NEUTRAL: '#8b949e',
}

const SENTIMENT_COLORS: Record<TradingAnalysis['sentiment'], string> = {
  bullish: '#3fb950',
  bearish: '#f85149',
  neutral: '#8b949e',
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  return `${day}d ago`
}

export default function DiscordInsights() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [bookmarkletOpen, setBookmarkletOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookmarklet, setBookmarklet] = useState<string>('')

  // Build the bookmarklet with the current origin baked in — works against
  // localhost during dev and against the deployed URL in prod without manual
  // editing.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const apiUrl = `${window.location.origin}/api/discord-influencer`
      setBookmarklet(buildBookmarklet(apiUrl))
    }
  }, [])

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const url = forceRefresh ? '/api/discord-influencer?refresh=1' : '/api/discord-influencer'
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: ApiResponse = await res.json()
      if (!json.success) throw new Error(json.error || 'Unknown error')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const submitPaste = async () => {
    const text = pasteText.trim()
    if (text.length < 20) {
      setError('Paste at least 20 chars of recent Discord activity')
      return
    }
    setPasting(true)
    setError(null)
    try {
      const res = await fetch('/api/discord-influencer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Unknown error')
      setPasteText('')
      setPasteOpen(false)
      await fetchData()  // reload list
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setPasting(false)
  }

  const deleteBatch = async (id: string) => {
    if (!window.confirm('Delete this analysis?')) return
    try {
      await fetch(`/api/discord-influencer?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      fetchData()
    } catch { /* ignore */ }
  }

  const latest = data?.latest
  const batches = data?.batches ?? []

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
            background: 'linear-gradient(135deg, #5865f2 0%, #4752c4 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <MessageSquare size={11} color='#fff' />
          </div>
          <div>
            <h3 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>
              Discord Influencer
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
              <span style={{ fontSize: '0.52rem', color: '#6e7681' }}>
                @{data?.influencer || 'Adalyn'} {data?.botMode ? '· bot' : '· paste mode'}
              </span>
              {latest && (
                <span style={{ fontSize: '0.48rem', color: '#484f58' }}>
                  {formatRelativeTime(latest.analyzedAt)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {batches.length > 0 && (
            <span style={{
              fontSize: '0.52rem', color: '#484f58',
              backgroundColor: 'rgba(42,42,74,0.4)',
              padding: '2px 8px', borderRadius: '10px',
            }}>
              {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
            </span>
          )}
          <button
            onClick={() => { setBookmarkletOpen(o => !o); setPasteOpen(false) }}
            title='Set up the Trader OS browser bookmarklet — one-click scrape from any Discord channel you can view'
            style={{
              background: bookmarkletOpen ? 'rgba(240,192,0,0.15)' : 'none',
              border: `1px solid ${bookmarkletOpen ? 'rgba(240,192,0,0.4)' : '#30363d'}`,
              borderRadius: '7px', cursor: 'pointer',
              color: bookmarkletOpen ? '#f0c000' : '#6e7681',
              fontSize: '0.55rem', fontWeight: 700,
              padding: '5px 10px',
              display: 'inline-flex', alignItems: 'center', gap: '4px',
            }}
          >
            <Bookmark size={10} /> Bookmarklet
          </button>
          <button
            onClick={() => { setPasteOpen(o => !o); setBookmarkletOpen(false) }}
            title='Paste Discord messages to analyze'
            style={{
              background: pasteOpen ? 'rgba(88,101,242,0.15)' : 'none',
              border: `1px solid ${pasteOpen ? 'rgba(88,101,242,0.4)' : '#30363d'}`,
              borderRadius: '7px', cursor: 'pointer',
              color: pasteOpen ? '#5865f2' : '#6e7681',
              fontSize: '0.55rem', fontWeight: 700,
              padding: '5px 10px',
            }}
          >
            ✎ Paste
          </button>
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            title={data?.botMode ? 'Force refresh — pulls latest messages from Discord channel' : 'Refresh stored analyses'}
            style={{
              background: loading ? 'rgba(63,185,80,0.08)' : 'none',
              border: `1px solid ${loading ? 'rgba(63,185,80,0.3)' : '#30363d'}`,
              borderRadius: '7px', cursor: loading ? 'not-allowed' : 'pointer',
              color: loading ? '#3fb950' : '#6e7681',
              display: 'flex', alignItems: 'center', padding: '5px 8px',
            }}
          >
            <RefreshCw size={11} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
      </div>

      {/* Bookmarklet setup panel */}
      {bookmarkletOpen && (
        <div style={{ padding: '0.75rem 0.9rem', borderBottom: '1px solid rgba(42,42,74,0.6)', backgroundColor: 'rgba(240,192,0,0.04)' }}>
          <div style={{ fontSize: '0.65rem', color: '#e6edf3', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Bookmark size={12} color='#f0c000' /> One-click Discord scraper bookmarklet
          </div>
          <div style={{ fontSize: '0.6rem', color: '#8b949e', lineHeight: 1.5, marginBottom: '0.6rem' }}>
            Drag the orange button below into your browser&apos;s bookmarks bar. Then while viewing any Discord channel
            (Adalyn&apos;s or any other), click the bookmark — it scrapes the visible messages from your logged-in browser
            session and sends them here for analysis. Zero copy-paste; runs only when you click.
          </div>

          {/* The draggable bookmarklet anchor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <a
              href={bookmarklet || '#'}
              draggable
              onClick={e => e.preventDefault()}
              title='Drag me to your bookmarks bar'
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'linear-gradient(135deg, #f0c000, #e09000)',
                color: '#0d1117',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '0.7rem', fontWeight: 700,
                textDecoration: 'none',
                cursor: 'grab',
                userSelect: 'none',
                boxShadow: '0 2px 8px rgba(240,192,0,0.3)',
              }}
            >
              <Bookmark size={12} /> Send Discord to Trader OS
            </a>
            <span style={{ fontSize: '0.55rem', color: '#6e7681', fontStyle: 'italic' }}>
              ← drag this to your bookmarks bar
            </span>
            <button
              onClick={async () => {
                if (!bookmarklet) return
                try {
                  await navigator.clipboard.writeText(bookmarklet)
                  alert('Bookmarklet code copied. If drag-and-drop doesn\'t work, manually create a bookmark and paste this as the URL.')
                } catch {
                  alert('Could not copy to clipboard. Right-click the orange button → Copy link address instead.')
                }
              }}
              style={{
                fontSize: '0.55rem', padding: '6px 10px',
                background: 'transparent', border: '1px solid #30363d',
                borderRadius: '6px', color: '#8b949e', cursor: 'pointer',
              }}
            >
              📋 Copy code
            </button>
          </div>

          {/* Setup steps */}
          <div style={{ fontSize: '0.58rem', color: '#8b949e', lineHeight: 1.6, paddingLeft: '4px' }}>
            <strong style={{ color: '#c9d1d9' }}>Setup (one time):</strong>
            <div>1. If your browser&apos;s bookmarks bar is hidden, show it (Cmd/Ctrl+Shift+B in most browsers).</div>
            <div>2. Drag the orange button above into your bookmarks bar. Or click <strong>📋 Copy code</strong> and create a bookmark manually with that as the URL.</div>
            <div>3. Open Discord in browser → navigate to Adalyn&apos;s trading channel → scroll the messages you want analyzed into view (last 30-50 typically).</div>
            <div>4. Click the <strong>Send Discord to Trader OS</strong> bookmark. A toast appears in the corner: &quot;analyzing N messages…&quot; → success.</div>
            <div>5. Open this dashboard → Discord Influencer card → fresh batch appears with structured analysis.</div>
          </div>

          <div style={{ marginTop: '0.6rem', padding: '0.5rem', backgroundColor: 'rgba(240,192,0,0.05)', borderLeft: '2px solid rgba(240,192,0,0.4)', fontSize: '0.55rem', color: '#8b949e', lineHeight: 1.5 }}>
            <strong style={{ color: '#f0c000' }}>Why this is safe:</strong> the bookmarklet runs ONLY when you click it. It reads
            messages already rendered in your browser (no API calls, no automation timing patterns) and sends them to your own
            server. From Discord&apos;s perspective you&apos;re just scrolling — no detection footprint. Doesn&apos;t modify Discord&apos;s UI, can&apos;t
            send messages, and you can remove the bookmark any time.
          </div>
        </div>
      )}

      {/* Paste textarea */}
      {pasteOpen && (
        <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid rgba(42,42,74,0.6)' }}>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={`Paste recent messages from Adalyn's Discord channel here. Sonnet 4.6 will extract trading signals (~30s).\n\nExample format:\n[2026-05-06 10:23] Adalyn: BTC just broke 95k resistance...\n[2026-05-06 10:31] Adalyn: looking for entry at 92k support`}
            style={{
              width: '100%', minHeight: '120px',
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: '6px',
              color: '#e6edf3',
              padding: '0.5rem',
              fontSize: '0.65rem',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <span style={{ fontSize: '0.5rem', color: '#6e7681' }}>
              {pasteText.length} chars · min 20, max 50,000
            </span>
            <button
              onClick={submitPaste}
              disabled={pasting || pasteText.trim().length < 20}
              style={{
                background: pasting ? 'rgba(63,185,80,0.1)' : 'rgba(88,101,242,0.15)',
                border: `1px solid ${pasting ? 'rgba(63,185,80,0.3)' : 'rgba(88,101,242,0.4)'}`,
                borderRadius: '6px', padding: '5px 12px',
                color: pasting ? '#3fb950' : '#5865f2',
                fontSize: '0.6rem', fontWeight: 700,
                cursor: pasting || pasteText.trim().length < 20 ? 'not-allowed' : 'pointer',
                opacity: pasteText.trim().length < 20 ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: '4px',
              }}
            >
              {pasting ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
              {pasting ? 'Analyzing…' : 'Analyze'}
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '0.75rem' }}>
        {loading && !data ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: '#6e7681', fontSize: '0.65rem', gap: '8px' }}>
            <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Loading…
          </div>
        ) : error && batches.length === 0 ? (
          <div style={{ padding: '1rem', textAlign: 'center', color: '#f85149', fontSize: '0.65rem' }}>
            {error}
          </div>
        ) : batches.length === 0 ? (
          <div style={{ padding: '1.25rem 0.5rem', textAlign: 'center', color: '#6e7681', fontSize: '0.65rem', lineHeight: 1.5 }}>
            <MessageSquare size={20} style={{ opacity: 0.4, marginBottom: '6px' }} />
            <div>No Discord analyses yet.</div>
            <div style={{ fontSize: '0.55rem', color: '#484f58', marginTop: '4px' }}>
              Click <strong>✎ Paste</strong> to analyze Adalyn&apos;s recent messages.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {batches.map(batch => {
              const sigColor = SIGNAL_COLORS[batch.analysis.signal]
              const sentColor = SENTIMENT_COLORS[batch.analysis.sentiment]
              return (
                <div key={batch.id} style={{
                  backgroundColor: '#0d1117',
                  border: '1px solid #21262d',
                  borderRadius: '8px',
                  padding: '0.6rem 0.7rem',
                }}>
                  {/* Top row: signal + meta */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.55rem', fontWeight: 700,
                      color: sigColor, backgroundColor: `${sigColor}22`,
                      padding: '2px 7px', borderRadius: '4px', letterSpacing: '0.04em',
                    }}>
                      {batch.analysis.signal}
                    </span>
                    <span style={{
                      fontSize: '0.5rem', fontWeight: 700,
                      color: sentColor, backgroundColor: `${sentColor}1f`,
                      padding: '2px 6px', borderRadius: '4px',
                    }}>
                      {batch.analysis.sentiment}
                    </span>
                    <span style={{ fontSize: '0.5rem', color: '#6e7681' }}>
                      conf: {batch.analysis.confidence} · risk: {batch.analysis.riskLevel} · score: {batch.analysis.overallScore >= 0 ? '+' : ''}{batch.analysis.overallScore}
                    </span>
                    <span style={{ fontSize: '0.5rem', color: '#484f58', marginLeft: 'auto' }}>
                      {batch.source} · {batch.messageCount} msg · {formatRelativeTime(batch.analyzedAt)}
                    </span>
                    <button
                      onClick={() => deleteBatch(batch.id)}
                      title='Delete this analysis'
                      style={{
                        background: 'none', border: 'none',
                        color: '#484f58', cursor: 'pointer',
                        padding: '0', display: 'flex',
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>

                  {/* Summary */}
                  {batch.analysis.summary && (
                    <div style={{ fontSize: '0.65rem', color: '#c9d1d9', lineHeight: 1.4, marginBottom: '0.4rem' }}>
                      {batch.analysis.summary}
                    </div>
                  )}

                  {/* Key insights */}
                  {batch.analysis.keyInsights.length > 0 && (
                    <div style={{ marginBottom: '0.4rem' }}>
                      {batch.analysis.keyInsights.map((insight, i) => (
                        <div key={i} style={{ fontSize: '0.6rem', color: '#8b949e', lineHeight: 1.4, marginBottom: '2px', paddingLeft: '8px', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 0, color: '#5865f2' }}>•</span> {insight}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Price targets + assets row */}
                  {(batch.analysis.priceTargets.length > 0 || batch.analysis.mentionedAssets.length > 0) && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                      {batch.analysis.priceTargets.map((pt, i) => (
                        <span key={`pt-${i}`} style={{
                          fontSize: '0.5rem', color: '#f0c000',
                          backgroundColor: 'rgba(240,192,0,0.1)',
                          padding: '1px 6px', borderRadius: '3px',
                        }}>
                          {pt.type === 'support' ? '🛡' : pt.type === 'resistance' ? '🚧' : '🎯'} {pt.price}{pt.date ? ` · ${pt.date}` : ''}
                        </span>
                      ))}
                      {batch.analysis.mentionedAssets.map((a, i) => {
                        const c = a.direction === 'bullish' ? '#3fb950' : a.direction === 'bearish' ? '#f85149' : '#8b949e'
                        return (
                          <span key={`a-${i}`} style={{
                            fontSize: '0.5rem', color: c,
                            backgroundColor: `${c}1a`,
                            padding: '1px 6px', borderRadius: '3px',
                          }}>
                            {a.direction === 'bullish' ? '↑' : a.direction === 'bearish' ? '↓' : '→'} {a.name}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer hint when bot mode unset */}
        {data && !data.botMode && batches.length > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.5rem', color: '#484f58', textAlign: 'center', fontStyle: 'italic' }}>
            Add DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID env vars to enable auto-poll mode
          </div>
        )}
      </div>
    </div>
  )
}
