'use client'

import React, { useState } from 'react'
import {
  LayoutDashboard, LineChart, Globe, BarChart3, Target,
  ChevronRight
} from 'lucide-react'

type TabId = 'overview' | 'technical' | 'onchain' | 'trading' | 'markets'

interface Tab {
  id: TabId
  label: string
  icon: React.ReactNode
}

const tabs: Tab[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} /> },
  { id: 'technical', label: 'Technical', icon: <LineChart size={14} /> },
  { id: 'onchain', label: 'On-Chain', icon: <Globe size={14} /> },
  { id: 'trading', label: 'Trading', icon: <BarChart3 size={14} /> },
  { id: 'markets', label: 'Markets', icon: <Target size={14} /> },
]

export function TabNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}) {
  return (
    <div style={{
      display: 'flex',
      gap: '2px',
      padding: '2px',
      background: 'rgba(10,10,18,0.5)',
      borderRadius: '8px',
      border: '1px solid rgba(42,42,74,0.5)',
    }}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '6px 12px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.2s ease-out',
              background: isActive ? 'rgba(0,245,255,0.1)' : 'transparent',
              color: isActive ? 'var(--cyan)' : 'var(--text-muted)',
              boxShadow: isActive ? '0 0 12px rgba(0,245,255,0.15)' : 'none',
              position: 'relative',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.background = 'rgba(42,42,74,0.3)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
              }
            }}
          >
            <span style={{
              filter: isActive ? 'drop-shadow(0 0 4px var(--cyan))' : 'none',
            }}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
            {isActive && (
              <span style={{
                position: 'absolute',
                bottom: '-1px',
                left: '8px',
                right: '8px',
                height: '2px',
                background: 'linear-gradient(90deg, var(--cyan), var(--purple))',
                borderRadius: '1px',
                boxShadow: '0 0 6px var(--cyan)',
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}
