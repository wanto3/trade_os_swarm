'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Trash2, Send, Bookmark, Instagram } from 'lucide-react'

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
  source: 'paste' | 'bookmarklet'
  rawText: string
  postCount: number
  analysis: TradingAnalysis
  analyzedAt: number
}

interface ApiResponse {
  success: boolean
  influencer: string
  handle: string
  batches: AnalyzedBatch[]
  latest: AnalyzedBatch | null
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
  return `${Math.round(hr / 24)}d ago`
}

/**
 * Bookmarklet for Instagram. IG's DOM is more aggressively obfuscated than
 * Discord's — class names rotate frequently. So instead of targeting specific
 * post elements, we grab the visible text content within <main> (which
 * contains the feed) and let Sonnet identify post boundaries from the text
 * structure (timestamps, hashtags, line breaks).
 *
 * This "shotgun" approach is more brittle to noise but more robust to IG's
 * UI churn — works on profile pages, the main feed, individual post pages,
 * and Reels view.
 */
function buildBookmarklet(apiUrl: string): string {
  const code = `(async()=>{try{
const main=document.querySelector('main')||document.body;
const articles=main.querySelectorAll('article');
let text='';
if(articles.length){
text=Array.from(articles).map(a=>a.innerText.trim()).filter(t=>t.length>30).join('\\n\\n---\\n\\n');
}else{
text=main.innerText.trim();
}
text=text.replace(/\\n{3,}/g,'\\n\\n').slice(0,30000);
if(text.length<30){alert('Trader OS: Could not find Instagram post content. Try scrolling, then click again.');return;}
const tEl=document.createElement('div');
tEl.style.cssText='position:fixed;bottom:24px;right:24px;background:#161b22;color:#e6edf3;padding:12px 18px;border-radius:8px;border:1px solid #30363d;font-size:13px;z-index:99999;font-family:Inter,system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
tEl.textContent='Trader OS: analyzing IG content ('+text.length+' chars)...';document.body.appendChild(tEl);
const r=await fetch(${JSON.stringify(apiUrl)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,source:'bookmarklet'})});
const j=await r.json();
tEl.textContent=j.success?'Trader OS: IG content analyzed. Open dashboard to view.':('Trader OS error: '+(j.error||'unknown').slice(0,150));
tEl.style.background=j.success?'#0a3a1f':'#3a0a0a';
setTimeout(()=>tEl.remove(),5000);
}catch(e){alert('Trader OS bookmarklet error: '+e.message);}})();`
  const minified = code.replace(/\n\s*/g, '').replace(/\s+/g, ' ')
  return `javascript:${encodeURIComponent(minified)}`
}

export default function InstagramAnalysis() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [pasting, setPasting] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [bookmarkletOpen, setBookmarkletOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [bookmarklet, setBookmarklet] = useState<string>('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const apiUrl = `${window.location.origin}/api/instagram-influencer`
      setBookmarklet(buildBookmarklet(apiUrl))
    }
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/instagram-influencer', { cache: 'no-store' })
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
    if (text.length < 20) { setError('Paste at least 20 chars'); return }
    setPasting(true); setError(null)
    try {
      const res = await fetch('/api/instagram-influencer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: 'paste' }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Unknown error')
      setPasteText(''); setPasteOpen(false)
      await fetchData()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    setPasting(false)
  }

  const deleteBatch = async (id: string) => {
    if (!window.confirm('Delete this analysis?')) return
    try {
      await fetch(`/api/instagram-influencer?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
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
            background: 'linear-gradient(135deg, #f58529 0%, #dd2a7b 50%, #8134af 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Instagram size={11} color='#fff' />
          </div>
          <div>
            <h3 style={{ fontSize: '0.7rem', fontWeight: 700, color: '#e6edf3', margin: 0 }}>
              Instagram Analysis
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '1px' }}>
              <span style={{ fontSize: '0.52rem', color: '#6e7681' }}>
                {data?.handle ? `@${data.handle}` : data?.influencer || 'paste mode'}
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
              {batches.length}
            </span>
          )}
          <button
            onClick={() => { setBookmarkletOpen(o => !o); setPasteOpen(false) }}
            title='Set up the Trader OS browser bookmarklet — one-click scrape from any Instagram page'
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
            title='Paste IG post captions to analyze'
            style={{
              background: pasteOpen ? 'rgba(221,42,123,0.15)' : 'none',
              border: `1px solid ${pasteOpen ? 'rgba(221,42,123,0.4)' : '#30363d'}`,
              borderRadius: '7px', cursor: 'pointer',
              color: pasteOpen ? '#dd2a7b' : '#6e7681',
              fontSize: '0.55rem', fontWeight: 700,
              padding: '5px 10px',
            }}
          >
            ✎ Paste
          </button>
          <button
            onClick={fetchData}
            disabled={loading}
            title='Reload stored analyses'
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
            <Bookmark size={12} color='#f0c000' /> One-click Instagram scraper
          </div>
          <div style={{ fontSize: '0.6rem', color: '#8b949e', lineHeight: 1.5, marginBottom: '0.6rem' }}>
            Drag the orange button to your bookmarks bar. While viewing any Instagram profile or post page,
            click the bookmark — it scrapes the visible content and sends it for Sonnet analysis. Same one-click
            UX as the Discord scraper, just tuned for Instagram&apos;s feed/profile layout.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
            <a
              href={bookmarklet || '#'}
              draggable
              onClick={e => e.preventDefault()}
              title='Drag me to your bookmarks bar'
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'linear-gradient(135deg, #f58529, #dd2a7b)',
                color: '#fff',
                padding: '8px 14px',
                borderRadius: '6px',
                fontSize: '0.7rem', fontWeight: 700,
                textDecoration: 'none',
                cursor: 'grab',
                userSelect: 'none',
                boxShadow: '0 2px 8px rgba(221,42,123,0.4)',
              }}
            >
              <Bookmark size={12} /> Send IG to Trader OS
            </a>
            <span style={{ fontSize: '0.55rem', color: '#6e7681', fontStyle: 'italic' }}>
              ← drag this to your bookmarks bar
            </span>
            <button
              onClick={async () => {
                if (!bookmarklet) return
                try {
                  await navigator.clipboard.writeText(bookmarklet)
                  alert('Bookmarklet code copied. If drag-and-drop doesn\'t work, manually create a bookmark with this as the URL.')
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
          <div style={{ fontSize: '0.58rem', color: '#8b949e', lineHeight: 1.6, paddingLeft: '4px' }}>
            <strong style={{ color: '#c9d1d9' }}>Setup (one time):</strong>
            <div>1. Show your bookmarks bar (Cmd/Ctrl+Shift+B in most browsers).</div>
            <div>2. Drag the orange button above into your bookmarks bar.</div>
            <div>3. Open Instagram in browser → navigate to the trader&apos;s profile (or recent post) → scroll to load the posts you want analyzed.</div>
            <div>4. Click the <strong>Send IG to Trader OS</strong> bookmark. Toast confirms analysis.</div>
            <div>5. Open this dashboard → fresh batch appears with structured signal.</div>
          </div>
        </div>
      )}

      {/* Paste textarea */}
      {pasteOpen && (
        <div style={{ padding: '0.6rem 0.9rem', borderBottom: '1px solid rgba(42,42,74,0.6)' }}>
          <textarea
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={`Paste recent Instagram post captions here. One post per block, separate with blank lines or "---". Sonnet 4.6 analyzes (~30s).\n\nExample:\nNext buying opportunity: Dec 17-18. Big peak: April-June 2026. Bottom of bottoms: Nov 2026. #Bitcoin #Crypto\n\n---\n\nXRP setup looking strong. Pouring more in. Mid-summer revisit. #XRP #HODL`}
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
                background: pasting ? 'rgba(63,185,80,0.1)' : 'rgba(221,42,123,0.15)',
                border: `1px solid ${pasting ? 'rgba(63,185,80,0.3)' : 'rgba(221,42,123,0.4)'}`,
                borderRadius: '6px', padding: '5px 12px',
                color: pasting ? '#3fb950' : '#dd2a7b',
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
          <div style={{ padding: '1rem', textAlign: 'center', color: '#f85149', fontSize: '0.65rem' }}>{error}</div>
        ) : batches.length === 0 ? (
          <div style={{ padding: '1.25rem 0.5rem', textAlign: 'center', color: '#6e7681', fontSize: '0.65rem', lineHeight: 1.5 }}>
            <Instagram size={20} style={{ opacity: 0.4, marginBottom: '6px' }} />
            <div>No Instagram analyses yet.</div>
            <div style={{ fontSize: '0.55rem', color: '#484f58', marginTop: '4px' }}>
              Click <strong>📌 Bookmarklet</strong> for one-click setup, or <strong>✎ Paste</strong> to analyze captions directly.
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: sigColor, backgroundColor: `${sigColor}22`, padding: '2px 7px', borderRadius: '4px', letterSpacing: '0.04em' }}>
                      {batch.analysis.signal}
                    </span>
                    <span style={{ fontSize: '0.5rem', fontWeight: 700, color: sentColor, backgroundColor: `${sentColor}1f`, padding: '2px 6px', borderRadius: '4px' }}>
                      {batch.analysis.sentiment}
                    </span>
                    <span style={{ fontSize: '0.5rem', color: '#6e7681' }}>
                      conf: {batch.analysis.confidence} · risk: {batch.analysis.riskLevel} · score: {batch.analysis.overallScore >= 0 ? '+' : ''}{batch.analysis.overallScore}
                    </span>
                    <span style={{ fontSize: '0.5rem', color: '#484f58', marginLeft: 'auto' }}>
                      {batch.source} · {batch.postCount} posts · {formatRelativeTime(batch.analyzedAt)}
                    </span>
                    <button
                      onClick={() => deleteBatch(batch.id)}
                      title='Delete'
                      style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', padding: '0', display: 'flex' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  {batch.analysis.summary && (
                    <div style={{ fontSize: '0.65rem', color: '#c9d1d9', lineHeight: 1.4, marginBottom: '0.4rem' }}>
                      {batch.analysis.summary}
                    </div>
                  )}
                  {batch.analysis.keyInsights.length > 0 && (
                    <div style={{ marginBottom: '0.4rem' }}>
                      {batch.analysis.keyInsights.map((insight, i) => (
                        <div key={i} style={{ fontSize: '0.6rem', color: '#8b949e', lineHeight: 1.4, marginBottom: '2px', paddingLeft: '8px', position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 0, color: '#dd2a7b' }}>•</span> {insight}
                        </div>
                      ))}
                    </div>
                  )}
                  {(batch.analysis.priceTargets.length > 0 || batch.analysis.mentionedAssets.length > 0 || batch.analysis.keyDates.length > 0) && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                      {batch.analysis.priceTargets.map((pt, i) => (
                        <span key={`pt-${i}`} style={{ fontSize: '0.5rem', color: '#f0c000', backgroundColor: 'rgba(240,192,0,0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                          {pt.type === 'support' ? '🛡' : pt.type === 'resistance' ? '🚧' : '🎯'} {pt.price}{pt.date ? ` · ${pt.date}` : ''}
                        </span>
                      ))}
                      {batch.analysis.keyDates.map((kd, i) => (
                        <span key={`kd-${i}`} style={{ fontSize: '0.5rem', color: '#58a6ff', backgroundColor: 'rgba(88,166,255,0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                          📅 {kd.date}{kd.event ? ` · ${kd.event.slice(0, 30)}` : ''}
                        </span>
                      ))}
                      {batch.analysis.mentionedAssets.map((a, i) => {
                        const c = a.direction === 'bullish' ? '#3fb950' : a.direction === 'bearish' ? '#f85149' : '#8b949e'
                        return (
                          <span key={`a-${i}`} style={{ fontSize: '0.5rem', color: c, backgroundColor: `${c}1a`, padding: '1px 6px', borderRadius: '3px' }}>
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
      </div>
    </div>
  )
}
