/**
 * Bitcoin Historical Data & Cycle Analysis
 * Shows BTC price history with halving cycles
 */

// Bitcoin halving dates and cycle phases
const HALVING_DATES = [
  { date: '2012-11-28', reward: 25, block: 210000 },
  { date: '2016-07-09', reward: 12.5, block: 420000 },
  { date: '2020-05-11', reward: 6.25, block: 840000 },
  { date: '2024-04-19', reward: 3.125, block: 840000 },
]

// Historical BTC price data (monthly averages from 2019-2025)
const BTC_HISTORICAL = [
  { date: '2019-01', price: 3500, phase: 'accumulation' },
  { date: '2019-07', price: 10000, phase: 'markup' },
  { date: '2020-03', price: 6500, phase: 'crash' },
  { date: '2020-05', price: 8800, phase: 'halving' },
  { date: '2020-12', price: 29000, phase: 'bull_run' },
  { date: '2021-04', price: 58000, phase: 'peak' },
  { date: '2021-07', price: 35000, phase: 'bear' },
  { date: '2021-12', price: 46000, phase: 'accumulation' },
  { date: '2022-01', price: 36000, phase: 'accumulation' },
  { date: '2022-06', price: 30000, phase: 'accumulation' },
  { date: '2022-11', price: 16000, phase: 'accumulation' },
  { date: '2023-01', price: 16500, phase: 'accumulation' },
  {  date: '2023-06', price: 27000, phase: 'recovery' },
  { date: '2023-12', price: 42000, phase: 'pre_halving' },
  { date: '2024-01', price: 45000, phase: 'pre_halving' },
  { date: '2024-04', price: 66000, phase: 'halving' },
  { date: '2024-07', price: 64000, phase: 'correction' },
  { date: '2024-10', price: 67000, phase: 'markup' },
  { date: '2025-01', price: 95000, phase: 'bull_run' },
  { date: '2025-03', price: 84752, phase: 'consolidation' },
]

// Calculate cycle phase based on days since halving
function getCurrentCyclePhase() {
  const lastHalving = new Date('2024-04-19')
  const now = new Date()
  const daysSinceHalving = Math.floor((now.getTime() - lastHalving.getTime()) / (1000 * 60 * 60 * 24))

  // 4-year cycle = 1461 days
  const cycleDay = daysSinceHalving
  const cycleYear = Math.floor(daysSinceHalving / 365)

  // Determine phase
  if (cycleDay < 180) return { phase: 'Post-Halving Stabilization', cycleYear, description: 'Market stabilizing after halving shock' }
  if (cycleDay < 365) return { phase: 'Accumulation', cycleYear, description: 'Smart money accumulating' }
  if (cycleDay < 730) return { phase: 'Markup', cycleYear: 'Year 1', description: 'Price discovery phase' }
  if (cycleDay < 1095) return { phase: 'Bull Run', cycleYear: 'Year 2', description: 'Parabolic run potential' }
  return { phase: 'Distribution', cycleYear: 'Year 3+', description: 'Distribution and bear market' }
}

// Generate price projection based on previous cycles
function generatePriceProjection() {
  const currentPrice = 84752
  const phase = getCurrentCyclePhase()

  // Conservative projections based on cycle phase
  const projections = {
    conservative: currentPrice * 1.2,  // +20%
    moderate: currentPrice * 1.5,         // +50%
    aggressive: currentPrice * 2.5,       // +150%
    parabolic: currentPrice * 4          // +300% (if Year 2)
  }

  return {
    current: currentPrice,
    ...projections,
    peakTiming: phase.phase === 'Bull Run' ? 'Q4 2025' : phase.phase === 'Markup' ? 'Q2 2025' : 'Q1 2026'
  }
}

export { HALVING_DATES, BTC_HISTORICAL, getCurrentCyclePhase, generatePriceProjection }
