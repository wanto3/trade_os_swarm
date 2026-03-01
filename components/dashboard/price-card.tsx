"use client"

import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { formatPrice, formatPercentage } from "@/lib/utils"

interface ApiPrice {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  marketCap: number
  timestamp: number
}

interface PriceCardProps {
  data: ApiPrice
}

export function PriceCard({ data }: PriceCardProps) {
  const [previousPrice, setPreviousPrice] = useState(data.price)
  const [pulseClass, setPulseClass] = useState("")

  useEffect(() => {
    if (data.price !== previousPrice) {
      const isUp = data.price > previousPrice
      setPulseClass(isUp ? "pulse-bullish" : "pulse-bearish")
      setPreviousPrice(data.price)
      const timer = setTimeout(() => setPulseClass(""), 500)
      return () => clearTimeout(timer)
    }
  }, [data.price, previousPrice])

  const isPositive = data.change24h >= 0

  return (
    <div className="p-4 rounded-xl border border-border/50 bg-card hover:border-border transition-colors">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg">{data.symbol}</h3>
          <p className={`text-xl font-bold ${pulseClass}`}>
            {formatPrice(data.price)}
          </p>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium ${
          isPositive ? "bg-bullish/20 text-bullish" : "bg-bearish/20 text-bearish"
        }`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {formatPercentage(data.change24h)}
        </div>
      </div>
    </div>
  )
}
