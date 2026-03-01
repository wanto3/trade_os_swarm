import { promises as fs } from 'fs';
import { join } from 'path';

export interface Position {
  id: string;
  symbol: string;
  type: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  leverage: number;
  marginUsed: number;
  pnl: number;
  pnlPercent: number;
  timestamp: number;
  status: 'open' | 'closed';
}

export interface Portfolio {
  totalBalance: number;
  availableMargin: number;
  usedMargin: number;
  positions: Position[];
  totalPnl: number;
  lastUpdate: number;
}

const DATA_DIR = join(process.cwd(), 'data');
const POSITIONS_FILE = join(DATA_DIR, 'positions.json');
const PORTFOLIO_FILE = join(DATA_DIR, 'portfolio.json');

const DEFAULT_PORTFOLIO: Portfolio = {
  totalBalance: 10000,
  availableMargin: 10000,
  usedMargin: 0,
  positions: [],
  totalPnl: 0,
  lastUpdate: Date.now(),
};

// In-memory state
let portfolio: Portfolio = { ...DEFAULT_PORTFOLIO };
let positions: Position[] = [];

// Initialize by loading data
async function initializePortfolio() {
  try {
    await ensureDataDir();

    // Load portfolio
    try {
      const portfolioData = await fs.readFile(PORTFOLIO_FILE, 'utf-8');
      portfolio = JSON.parse(portfolioData);
    } catch {
      await savePortfolioData();
    }

    // Load positions
    try {
      const positionsData = await fs.readFile(POSITIONS_FILE, 'utf-8');
      positions = JSON.parse(positionsData);
    } catch {
      positions = [];
      await savePositionsData();
    }
  } catch (error) {
    console.error('Error loading portfolio data:', error);
  }
}

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function savePortfolioData(): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
  } catch (error) {
    console.error('Error saving portfolio:', error);
  }
}

async function savePositionsData(): Promise<void> {
  try {
    await ensureDataDir();
    await fs.writeFile(POSITIONS_FILE, JSON.stringify(positions, null, 2));
  } catch (error) {
    console.error('Error saving positions:', error);
  }
}

// Initialize on module load
initializePortfolio();

export function getPortfolio(): Portfolio {
  return { ...portfolio };
}

export function getPositions(includeClosed: boolean = false): Position[] {
  if (includeClosed) {
    return [...positions];
  }
  return positions.filter(p => p.status === 'open');
}

export function getPosition(id: string): Position | undefined {
  return positions.find(p => p.id === id);
}

export function createPosition(
  symbol: string,
  type: 'long' | 'short',
  entryPrice: number,
  quantity: number,
  leverage: number = 1
): Position {
  const marginUsed = (entryPrice * quantity) / leverage;

  if (marginUsed > portfolio.availableMargin) {
    throw new Error('Insufficient margin available');
  }

  const position: Position = {
    id: `pos-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    symbol,
    type,
    entryPrice,
    currentPrice: entryPrice,
    quantity,
    leverage,
    marginUsed,
    pnl: 0,
    pnlPercent: 0,
    timestamp: Date.now(),
    status: 'open',
  };

  positions.push(position);
  portfolio.usedMargin += marginUsed;
  portfolio.availableMargin = portfolio.totalBalance - portfolio.usedMargin;

  savePositionsData();
  savePortfolioData();

  return position;
}

export function closePosition(positionId: string, exitPrice?: number): Position | null {
  const index = positions.findIndex(p => p.id === positionId);

  if (index === -1) {
    return null;
  }

  const position = positions[index];
  const finalPrice = exitPrice || position.currentPrice;

  // Calculate final PnL
  let finalPnl: number;
  if (position.type === 'long') {
    finalPnl = (finalPrice - position.entryPrice) * position.quantity;
  } else {
    finalPnl = (position.entryPrice - finalPrice) * position.quantity;
  }

  position.status = 'closed';
  position.currentPrice = finalPrice;
  position.pnl = finalPnl;
  position.pnlPercent = ((finalPrice - position.entryPrice) / position.entryPrice) * 100;

  // Update portfolio
  portfolio.totalBalance += finalPnl;
  portfolio.usedMargin -= position.marginUsed;
  portfolio.availableMargin = portfolio.totalBalance - portfolio.usedMargin;
  portfolio.totalPnl = positions
    .filter(p => p.status === 'closed')
    .reduce((sum, p) => sum + p.pnl, 0);
  portfolio.lastUpdate = Date.now();

  savePositionsData();
  savePortfolioData();

  return position;
}

export function updatePositionPrice(symbol: string, currentPrice: number): void {
  let updated = false;

  for (const position of positions) {
    if (position.symbol === symbol && position.status === 'open') {
      position.currentPrice = currentPrice;

      if (position.type === 'long') {
        position.pnl = (currentPrice - position.entryPrice) * position.quantity;
      } else {
        position.pnl = (position.entryPrice - currentPrice) * position.quantity;
      }

      position.pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      updated = true;
    }
  }

  if (updated) {
    savePositionsData();
  }
}

export async function resetPortfolio(): Promise<void> {
  portfolio = { ...DEFAULT_PORTFOLIO };
  positions = [];
  await savePortfolioData();
  await savePositionsData();
}

export function updatePortfolioConfig(updates: Partial<Portfolio>): void {
  portfolio = { ...portfolio, ...updates };
  portfolio.lastUpdate = Date.now();
  savePortfolioData();
}
