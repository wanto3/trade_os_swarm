'use client'

import React from 'react'

interface GlassPanelProps {
  children: React.ReactNode
  className?: string
  glow?: 'cyan' | 'green' | 'magenta' | 'purple' | 'none'
  padding?: string
  cornerBrackets?: boolean
  hoverable?: boolean
  style?: React.CSSProperties
}

export function GlassPanel({
  children,
  className = '',
  glow = 'none',
  padding = '16px',
  cornerBrackets = false,
  hoverable = false,
  style = {},
}: GlassPanelProps) {
  const glowMap = {
    cyan: '0 0 20px rgba(0, 245, 255, 0.15), 0 0 1px rgba(0, 245, 255, 0.3)',
    green: '0 0 20px rgba(0, 255, 136, 0.15), 0 0 1px rgba(0, 255, 136, 0.3)',
    magenta: '0 0 20px rgba(255, 0, 128, 0.15), 0 0 1px rgba(255, 0, 128, 0.3)',
    purple: '0 0 20px rgba(168, 85, 247, 0.15), 0 0 1px rgba(168, 85, 247, 0.3)',
    none: '0 4px 24px rgba(0, 0, 0, 0.4)',
  }

  const hoverEffects = hoverable ? {
    transform: 'translateY(-2px)',
    borderColor: 'rgba(0, 245, 255, 0.4)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(0, 245, 255, 0.12), 0 0 1px rgba(0, 245, 255, 0.3)',
    transition: 'all 0.2s ease-out',
  } : {}

  return (
    <div
      className={`corner-brackets ${className}`}
      style={{
        background: 'rgba(10, 10, 18, 0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(42, 42, 74, 0.8)',
        borderRadius: '12px',
        padding,
        boxShadow: glowMap[glow],
        position: 'relative',
        ...hoverEffects,
        ...style,
      }}
    >
      {cornerBrackets && (
        <>
          <div style={{
            position: 'absolute',
            top: '-1px',
            left: '-1px',
            width: '14px',
            height: '14px',
            borderTop: '2px solid rgba(0, 245, 255, 0.5)',
            borderLeft: '2px solid rgba(0, 245, 255, 0.5)',
            borderRadius: '2px 0 0 0',
          }} />
          <div style={{
            position: 'absolute',
            top: '-1px',
            right: '-1px',
            width: '14px',
            height: '14px',
            borderTop: '2px solid rgba(0, 245, 255, 0.5)',
            borderRight: '2px solid rgba(0, 245, 255, 0.5)',
            borderRadius: '0 2px 0 0',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-1px',
            left: '-1px',
            width: '14px',
            height: '14px',
            borderBottom: '2px solid rgba(0, 245, 255, 0.5)',
            borderLeft: '2px solid rgba(0, 245, 255, 0.5)',
            borderRadius: '0 0 0 2px',
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-1px',
            right: '-1px',
            width: '14px',
            height: '14px',
            borderBottom: '2px solid rgba(0, 245, 255, 0.5)',
            borderRight: '2px solid rgba(0, 245, 255, 0.5)',
            borderRadius: '0 0 2px 0',
          }} />
        </>
      )}
      {children}
    </div>
  )
}
