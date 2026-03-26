'use client'

import React, { useEffect, useRef, useState } from 'react'

interface RadarAxis {
  label: string
  value: number
  max: number
}

interface SignalRadarProps {
  axes: RadarAxis[]
  title?: string
  size?: number
}

export function SignalRadar({ axes, title = 'Signal Radar', size = 180 }: SignalRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const maxR = (size / 2) - 20
    const n = axes.length
    const levels = 5

    ctx.clearRect(0, 0, size, size)

    // Draw grid rings
    for (let l = 1; l <= levels; l++) {
      const r = (l / levels) * maxR
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i / n) - Math.PI / 2
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.strokeStyle = 'rgba(42, 42, 74, 0.5)'
      ctx.lineWidth = 0.5
      ctx.stroke()
    }

    // Draw axis lines
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2
      const x = cx + maxR * Math.cos(angle)
      const y = cy + maxR * Math.sin(angle)
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(x, y)
      ctx.strokeStyle = 'rgba(42, 42, 74, 0.6)'
      ctx.lineWidth = 0.5
      ctx.stroke()

      // Labels
      const labelR = maxR + 14
      const lx = cx + labelR * Math.cos(angle)
      const ly = cy + labelR * Math.sin(angle)
      ctx.fillStyle = 'var(--text-muted)'
      ctx.font = '8px "Space Grotesk", sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(axes[i].label, lx, ly)
    }

    // Draw data polygon
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2
      const r = (axes[i].value / axes[i].max) * maxR
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()

    // Fill
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR)
    gradient.addColorStop(0, 'rgba(0, 245, 255, 0.15)')
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.05)')
    ctx.fillStyle = gradient
    ctx.fill()

    // Stroke with glow
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.6)'
    ctx.lineWidth = 1.5
    ctx.shadowColor = 'rgba(0, 245, 255, 0.5)'
    ctx.shadowBlur = 8
    ctx.stroke()
    ctx.shadowBlur = 0

    // Data points
    for (let i = 0; i < n; i++) {
      const angle = (Math.PI * 2 * i / n) - Math.PI / 2
      const r = (axes[i].value / axes[i].max) * maxR
      const x = cx + r * Math.cos(angle)
      const y = cy + r * Math.sin(angle)
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'var(--cyan)'
      ctx.shadowColor = 'var(--cyan)'
      ctx.shadowBlur = 6
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // Center score
    const avgScore = axes.reduce((s, a) => s + (a.value / a.max), 0) / n
    const score = Math.round(avgScore * 100)
    const scoreColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--orange)' : 'var(--magenta)'
    ctx.fillStyle = scoreColor
    ctx.font = 'bold 18px "JetBrains Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = scoreColor
    ctx.shadowBlur = 12
    ctx.fillText(String(score), cx, cy)
    ctx.shadowBlur = 0
  }, [axes, size, mounted])

  if (!mounted) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="shimmer" style={{ width: size - 20, height: size - 20, borderRadius: '50%' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <canvas ref={canvasRef} />
      {title && (
        <div style={{
          fontSize: '9px',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text-muted)',
          fontWeight: 600,
        }}>
          {title}
        </div>
      )}
    </div>
  )
}
