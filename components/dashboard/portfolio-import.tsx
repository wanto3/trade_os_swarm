'use client'

import { useState, useCallback, useRef } from 'react'
import { RefreshCw, Image as ImageIcon, Upload, Check, X, Trash2 } from 'lucide-react'

interface ExtractedPosition {
  question: string
  outcome: 'Yes' | 'No'
  entryPrice: number
  quantity: number
  currentValue?: number
  pnl?: number
  status?: 'open' | 'won' | 'lost'
}

interface Props {
  onImported?: () => void  // parent reloads paper data after successful import
}

export default function PortfolioImport({ onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<ExtractedPosition[] | null>(null)
  const [importMode, setImportMode] = useState<'replace' | 'augment'>('augment')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const reset = () => {
    setExtracted(null)
    setImagePreview(null)
    setError(null)
    setHint(null)
  }

  const processImage = useCallback(async (dataUrl: string) => {
    setParsing(true)
    setError(null)
    setHint(null)
    setExtracted(null)
    setImagePreview(dataUrl)
    try {
      const res = await fetch('/api/portfolio/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Unknown error')
      setExtracted(json.positions || [])
      setHint(json.hint || null)
      if ((json.positions || []).length === 0 && (json.errors || []).length > 0) {
        setError('Vision model returned no positions. See hint below for details.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setParsing(false)
  }, [])

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('File must be an image (PNG, JPEG, etc.)')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Crop or resize to under 6MB.`)
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      if (dataUrl) processImage(dataUrl)
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsDataURL(file)
  }, [processImage])

  // Paste image from clipboard
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || [])
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) handleFile(file)
        return
      }
    }
  }, [handleFile])

  // Drag-drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const updateExtracted = (idx: number, field: keyof ExtractedPosition, value: unknown) => {
    if (!extracted) return
    const copy = [...extracted]
    copy[idx] = { ...copy[idx], [field]: value } as ExtractedPosition
    setExtracted(copy)
  }

  const removeExtracted = (idx: number) => {
    if (!extracted) return
    setExtracted(extracted.filter((_, i) => i !== idx))
  }

  const confirmImport = async () => {
    if (!extracted || extracted.length === 0) return
    if (!window.confirm(
      `${importMode === 'replace' ? 'REPLACE' : 'ADD'} ${extracted.length} position${extracted.length === 1 ? '' : 's'} ` +
      `${importMode === 'replace' ? '— this will clear your current paper portfolio first.' : '— added on top of existing positions.'}\n\nProceed?`
    )) return

    setImporting(true)
    setError(null)
    try {
      const res = await fetch('/api/portfolio/import', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions: extracted, mode: importMode }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Unknown error')
      // Clear UI + notify parent
      setExtracted(null)
      setImagePreview(null)
      setOpen(false)
      onImported?.()
      window.alert(
        `Imported ${json.inserted} position${json.inserted === 1 ? '' : 's'}` +
        (json.skipped > 0 ? ` (${json.skipped} skipped — see console)` : '') +
        `. Bankroll now $${json.portfolio.bankroll.toFixed(2)}.`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setImporting(false)
  }

  return (
    <div style={{ marginBottom: '1rem' }}>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(88,101,242,0.10)',
            border: '1px solid rgba(88,101,242,0.35)',
            borderRadius: '8px', padding: '0.5rem 0.85rem',
            fontSize: '0.65rem', fontWeight: 700, color: '#8ba3ff',
            cursor: 'pointer',
          }}
        >
          <ImageIcon size={12} /> Import portfolio from screenshot
        </button>
      ) : (
        <div style={{
          backgroundColor: '#0d1117',
          border: '1px solid rgba(88,101,242,0.3)',
          borderRadius: '12px',
          padding: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e6edf3', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <ImageIcon size={14} color='#8ba3ff' /> Import positions from Polymarket screenshot
            </h4>
            <button
              onClick={() => { setOpen(false); reset() }}
              style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: '1.1rem' }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ fontSize: '0.6rem', color: '#8b949e', lineHeight: 1.5, marginBottom: '0.75rem' }}>
            Take a screenshot of your Polymarket portfolio page (Cmd+Shift+4 on Mac, Win+Shift+S on Windows). Paste here with Cmd+V,
            drag-and-drop the file, or click to upload. Groq Llama 4 Vision extracts positions (~3-5s, no Max-sub burn).
          </div>

          {/* Drop / paste / upload zone */}
          {!extracted && !parsing && (
            <div
              ref={dropRef}
              tabIndex={0}
              onPaste={handlePaste}
              onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed #30363d',
                borderRadius: '8px',
                padding: '1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                outline: 'none',
                color: '#8b949e',
                background: '#161b22',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#5865f2' }}
              onBlur={e => { e.currentTarget.style.borderColor = '#30363d' }}
            >
              <Upload size={20} style={{ opacity: 0.5, marginBottom: '6px' }} />
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#c9d1d9', marginBottom: '4px' }}>
                Drop, paste (Cmd+V), or click to upload screenshot
              </div>
              <div style={{ fontSize: '0.55rem', color: '#6e7681' }}>
                PNG / JPEG · max 6MB · click anywhere in this box to focus then paste
              </div>
              <input
                ref={fileInputRef}
                type='file'
                accept='image/*'
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />
            </div>
          )}

          {/* Parsing state */}
          {parsing && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '1rem', color: '#8b949e', fontSize: '0.7rem' }}>
              <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Parsing screenshot with Groq vision...
            </div>
          )}

          {/* Image preview */}
          {imagePreview && extracted && (
            <div style={{ marginBottom: '0.75rem' }}>
              <img
                src={imagePreview}
                alt='Uploaded screenshot'
                style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '6px', border: '1px solid #30363d' }}
              />
            </div>
          )}

          {/* Error/hint */}
          {error && (
            <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', borderRadius: '6px', fontSize: '0.6rem', color: '#f85149', marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}
          {hint && extracted && extracted.length === 0 && (
            <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'rgba(240,192,0,0.05)', border: '1px solid rgba(240,192,0,0.3)', borderRadius: '6px', fontSize: '0.6rem', color: '#f0c000', marginBottom: '0.75rem' }}>
              {hint}
            </div>
          )}

          {/* Extracted positions table */}
          {extracted && extracted.length > 0 && (
            <>
              <div style={{ fontSize: '0.65rem', color: '#c9d1d9', fontWeight: 600, marginBottom: '0.5rem' }}>
                {extracted.length} position{extracted.length === 1 ? '' : 's'} extracted — review and edit before importing:
              </div>
              <div style={{ overflowX: 'auto', marginBottom: '0.75rem' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.6rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #30363d' }}>
                      {['Market', 'Side', 'Entry $', 'Shares', 'Cost', ''].map((h, i) => (
                        <th key={i} style={{ padding: '6px 8px', textAlign: 'left', color: '#6e7681', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.5rem', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extracted.map((p, i) => {
                      const cost = (p.entryPrice * p.quantity).toFixed(2)
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #21262d' }}>
                          <td style={{ padding: '6px 8px', maxWidth: '300px', color: '#e6edf3' }}>
                            <input
                              type='text'
                              value={p.question}
                              onChange={e => updateExtracted(i, 'question', e.target.value)}
                              style={{ width: '100%', background: 'transparent', border: '1px solid #30363d', borderRadius: '4px', color: '#e6edf3', padding: '3px 5px', fontSize: '0.6rem' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <select
                              value={p.outcome}
                              onChange={e => updateExtracted(i, 'outcome', e.target.value)}
                              style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '4px', color: '#e6edf3', padding: '3px 5px', fontSize: '0.6rem' }}
                            >
                              <option value='Yes'>Yes</option>
                              <option value='No'>No</option>
                            </select>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              type='number'
                              step='0.01'
                              min='0.01'
                              max='0.99'
                              value={p.entryPrice}
                              onChange={e => updateExtracted(i, 'entryPrice', parseFloat(e.target.value))}
                              style={{ width: '60px', background: 'transparent', border: '1px solid #30363d', borderRadius: '4px', color: '#e6edf3', padding: '3px 5px', fontSize: '0.6rem' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              type='number'
                              step='0.01'
                              min='0.01'
                              value={p.quantity}
                              onChange={e => updateExtracted(i, 'quantity', parseFloat(e.target.value))}
                              style={{ width: '70px', background: 'transparent', border: '1px solid #30363d', borderRadius: '4px', color: '#e6edf3', padding: '3px 5px', fontSize: '0.6rem' }}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', color: '#f0883e' }}>${cost}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <button
                              onClick={() => removeExtracted(i)}
                              title='Remove from import list'
                              style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', padding: 0 }}
                            >
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.6rem', color: '#8b949e', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <span>Mode:</span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type='radio' name='mode' checked={importMode === 'augment'} onChange={() => setImportMode('augment')} />
                    Augment (add to existing)
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type='radio' name='mode' checked={importMode === 'replace'} onChange={() => setImportMode('replace')} />
                    Replace (clear existing first)
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => reset()}
                    style={{
                      background: 'transparent', border: '1px solid #30363d', borderRadius: '6px',
                      color: '#8b949e', padding: '6px 14px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmImport}
                    disabled={importing}
                    style={{
                      background: importing ? 'rgba(63,185,80,0.1)' : 'rgba(63,185,80,0.15)',
                      border: '1px solid rgba(63,185,80,0.4)',
                      borderRadius: '6px', color: '#3fb950',
                      padding: '6px 14px', fontSize: '0.65rem', fontWeight: 700,
                      cursor: importing ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    {importing ? <RefreshCw size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={11} />}
                    {importing ? 'Importing…' : `Import ${extracted.length}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
