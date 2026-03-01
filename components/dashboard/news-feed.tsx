"use client"

import { useState, useEffect } from "react"
import { ExternalLink, AlertCircle, RefreshCw, Newspaper } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ApiNewsItem {
  id: string
  title: string
  source: string
  publishedAt: number
  sentiment: "positive" | "negative" | "neutral"
  url?: string
  relatedSymbols?: string[]
}

interface ApiNewsResponse {
  success: boolean
  data?: ApiNewsItem[]
  error?: string
}

export function NewsFeed() {
  const [news, setNews] = useState<ApiNewsItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchNews = async () => {
    try {
      setError(null)
      const response = await fetch('/api/news')
      const result: ApiNewsResponse = await response.json()

      if (result.success && result.data) {
        setNews(result.data)
      } else {
        setError(result.error || 'Failed to fetch news')
      }
    } catch (err) {
      setError('Network error')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, 120000)
    return () => clearInterval(interval)
  }, [])

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  if (isLoading) {
    return (
      <div className="border border-border/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold flex items-center gap-2">
            <Newspaper className="w-4 h-4" />
            News
          </h2>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 rounded-lg bg-muted/20 animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-500">{error}</p>
          <Button variant="outline" size="sm" onClick={() => { setIsRefreshing(true); fetchNews() }} className="ml-auto h-7">
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold flex items-center gap-2">
          <Newspaper className="w-4 h-4" />
          Latest News
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setIsRefreshing(true); fetchNews() }}
          disabled={isRefreshing}
          className="h-7"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="space-y-2">
        {news.slice(0, 5).map(item => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 rounded-lg hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium line-clamp-2">{item.title}</p>
              {item.url && <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-1" />}
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{item.source}</span>
              <span>•</span>
              <span>{formatTimestamp(item.publishedAt)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
