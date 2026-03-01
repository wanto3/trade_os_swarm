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

export class PortfolioService {
  private portfolio: Portfolio;
  private positions: Position[] = [];

  constructor() {
    this.portfolio = { ...DEFAULT_PORTFOLIO };
    this.loadData();
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.access(DATA_DIR);
    } catch {
      await fs.mkdir(DATA_DIR, { recursive: true });
    }
  }

  private async loadData(): Promise<void> {
    try {
      await this.ensureDataDir();

      // Load portfolio
      try {
        const portfolioData = await fs.readFile(PORTFOLIO_FILE, 'utf-8');
        this.portfolio = JSON.parse(portfolioData);
      } catch {
        await this.savePortfolio();
      }

      // Load positions
      try {
        const positionsData = await fs.readFile(POSITIONS_FILE, 'utf-8');
        this.positions = JSON.parse(positionsData);
      } catch {
        this.positions = [];
        await this.savePositions();
      }
    } catch (error) {
      console.error('Error loading portfolio data:', error);
    }
  }

  private async savePortfolio(): Promise<void> {
    try {
      await this.ensureDataDir();
      await fs.writeFile(PORTFOLIO_FILE, JSON.stringify(this.portfolio, null, 2));
    } catch (error) {
      console.error('Error saving portfolio:', error);
    }
  }

  private async savePositions(): Promise<void> {
    try {
      await this.ensureDataDir();
      await fs.writeFile(POSITIONS_FILE, JSON.stringify(this.positions, null, 2));
    } catch (error) {
      console.error('Error saving positions:', error);
    }
  }

  getPortfolio(): Portfolio {
    return { ...this.portfolio };
  }

  getPositions(includeClosed: boolean = false): Position[] {
    if (includeClosed) {
      return [...this.positions];
    }
    return this.positions.filter(p => p.status === 'open');
  }

  getPosition(id: string): Position | undefined {
    return this.positions.find(p => p.id === id);
  }

  createPosition(
    symbol: string,
    type: 'long' | 'short',
    entryPrice: number,
    quantity: number,
    leverage: number = 1
  ): Position {
    const marginUsed = (entryPrice * quantity) / leverage;

    if (marginUsed > this.portfolio.availableMargin) {
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

    this.positions.push(position);
    this.portfolio.usedMargin += marginUsed;
    this.portfolio.availableMargin = this.portfolio.totalBalance - this.portfolio.usedMargin;

    this.savePositions();
    this.savePortfolio();

    return position;
  }

  closePosition(positionId: string, exitPrice?: number): Position | null {
    const index = this.positions.findIndex(p => p.id === positionId);

    if (index === -1) {
      return null;
    }

    const position = this.positions[index];
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
    this.portfolio.totalBalance += finalPnl;
    this.portfolio.usedMargin -= position.marginUsed;
    this.portfolio.availableMargin = this.portfolio.totalBalance - this.portfolio.usedMargin;
    this.portfolio.totalPnl = this.positions
      .filter(p => p.status === 'closed')
      .reduce((sum, p) => sum + p.pnl, 0);
    this.portfolio.lastUpdate = Date.now();

    this.savePositions();
    this.savePortfolio();

    return position;
  }

  updatePositionPrice(symbol: string, currentPrice: number): void {
    let updated = false;

    for (const position of this.positions) {
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
      this.savePositions();
    }
  }

  async reset(): Promise<void> {
    this.portfolio = { ...DEFAULT_PORTFOLIO };
    this.positions = [];
    await this.savePortfolio();
    await this.savePositions();
  }

  updateConfig(updates: Partial<Portfolio>): void {
    this.portfolio = { ...this.portfolio, ...updates };
    this.portfolio.lastUpdate = Date.now();
    this.savePortfolio();
  }
}
