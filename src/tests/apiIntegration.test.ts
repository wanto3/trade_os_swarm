import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import { spawn } from 'child_process';
import { WebSocket } from 'ws';

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3001';

let serverProcess: any;

describe('API Integration Tests', () => {
  beforeAll(async () => {
    // Start the server
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      stdio: 'pipe'
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await axios.get(`${API_URL}/api/health`);

      expect(response.status).toBe(200);
      expect(response.data.status).toBe('ok');
      expect(response.data.timestamp).toBeDefined();
    });
  });

  describe('Price Endpoints', () => {
    it('should get prices for default symbols', async () => {
      const response = await axios.get(`${API_URL}/api/prices`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toBeInstanceOf(Array);
      expect(response.data.data.length).toBeGreaterThan(0);
    });

    it('should get prices for custom symbols', async () => {
      const response = await axios.get(`${API_URL}/api/prices?symbols=BTC,ETH`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data).toHaveLength(2);
      expect(response.data.data[0].symbol).toBe('BTC');
      expect(response.data.data[1].symbol).toBe('ETH');
    });

    it('should return prices with correct structure', async () => {
      const response = await axios.get(`${API_URL}/api/prices`);
      const price = response.data.data[0];

      expect(price).toHaveProperty('symbol');
      expect(price).toHaveProperty('price');
      expect(price).toHaveProperty('change24h');
      expect(price).toHaveProperty('volume24h');
      expect(price).toHaveProperty('marketCap');
      expect(price).toHaveProperty('timestamp');
    });

    it('should return numeric price values', async () => {
      const response = await axios.get(`${API_URL}/api/prices`);
      const price = response.data.data[0];

      expect(typeof price.price).toBe('number');
      expect(typeof price.change24h).toBe('number');
      expect(typeof price.volume24h).toBe('number');
      expect(typeof price.marketCap).toBe('number');
    });

    it('should handle single symbol request', async () => {
      const response = await axios.get(`${API_URL}/api/prices?symbols=SOL`);

      expect(response.status).toBe(200);
      expect(response.data.data).toHaveLength(1);
      expect(response.data.data[0].symbol).toBe('SOL');
    });
  });

  describe('Signal Endpoints', () => {
    it('should generate trading signal for BTC', async () => {
      const response = await axios.get(`${API_URL}/api/signals/BTC`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.symbol).toBe('BTC');
    });

    it('should return valid signal structure', async () => {
      const response = await axios.get(`${API_URL}/api/signals/ETH`);
      const signal = response.data.data;

      expect(signal).toHaveProperty('symbol');
      expect(signal).toHaveProperty('action');
      expect(signal).toHaveProperty('confidence');
      expect(signal).toHaveProperty('reasons');
      expect(signal).toHaveProperty('indicators');
      expect(signal).toHaveProperty('timestamp');
    });

    it('should return valid action values', async () => {
      const response = await axios.get(`${API_URL}/api/signals/BTC`);
      const { action } = response.data.data;

      expect(['BUY', 'SELL', 'HOLD']).toContain(action);
    });

    it('should return confidence within valid range', async () => {
      const response = await axios.get(`${API_URL}/api/signals/BTC`);
      const { confidence } = response.data.data;

      expect(confidence).toBeGreaterThanOrEqual(0);
      expect(confidence).toBeLessThanOrEqual(100);
    });

    it('should include reasons array', async () => {
      const response = await axios.get(`${API_URL}/api/signals/SOL`);
      const { reasons } = response.data.data;

      expect(Array.isArray(reasons)).toBe(true);
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.length).toBeLessThanOrEqual(3);
    });

    it('should include technical indicators', async () => {
      const response = await axios.get(`${API_URL}/api/signals/ADA`);
      const { indicators } = response.data.data;

      expect(Array.isArray(indicators)).toBe(true);
      if (indicators.length > 0) {
        expect(indicators[0]).toHaveProperty('name');
        expect(indicators[0]).toHaveProperty('value');
        expect(indicators[0]).toHaveProperty('signal');
        expect(indicators[0]).toHaveProperty('confidence');
      }
    });
  });

  describe('Position Calculation Endpoints', () => {
    it('should calculate position for BUY order', async () => {
      const response = await axios.post(`${API_URL}/api/position/calculate`, {
        symbol: 'BTC',
        action: 'BUY',
        currentPrice: 50000
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.action).toBe('BUY');
    });

    it('should calculate position for SELL order', async () => {
      const response = await axios.post(`${API_URL}/api/position/calculate`, {
        symbol: 'BTC',
        action: 'SELL',
        currentPrice: 50000
      });

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.action).toBe('SELL');
    });

    it('should return position calculation details', async () => {
      const response = await axios.post(`${API_URL}/api/position/calculate`, {
        symbol: 'ETH',
        action: 'BUY',
        currentPrice: 3000,
        stopLossPercent: 2,
        targetPercent: 5
      });

      const position = response.data.data;

      expect(position).toHaveProperty('entryPrice', 3000);
      expect(position).toHaveProperty('stopLoss');
      expect(position).toHaveProperty('targetPrice');
      expect(position).toHaveProperty('positionSize');
      expect(position).toHaveProperty('marginRequired');
      expect(position).toHaveProperty('riskReward');
      expect(position).toHaveProperty('leverage');
    });

    it('should calculate correct stop loss for BUY', async () => {
      const response = await axios.post(`${API_URL}/api/position/calculate`, {
        symbol: 'BTC',
        action: 'BUY',
        currentPrice: 50000,
        stopLossPercent: 2
      });

      expect(response.data.data.stopLoss).toBeCloseTo(49000, 0);
    });

    it('should calculate correct target for BUY', async () => {
      const response = await axios.post(`${API_URL}/api/position/calculate`, {
        symbol: 'BTC',
        action: 'BUY',
        currentPrice: 50000,
        targetPercent: 5
      });

      expect(response.data.data.targetPrice).toBeCloseTo(52500, 0);
    });

    it('should handle missing required fields', async () => {
      try {
        await axios.post(`${API_URL}/api/position/calculate`, {
          symbol: 'BTC'
          // Missing currentPrice
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.success).toBe(false);
      }
    });

    it('should calculate risk-reward ratio correctly', async () => {
      const response = await axios.post(`${API_URL}/api/position/calculate`, {
        symbol: 'BTC',
        action: 'BUY',
        currentPrice: 50000,
        stopLossPercent: 2,
        targetPercent: 6
      });

      expect(response.data.data.riskReward).toBeCloseTo(3, 1);
    });
  });

  describe('Config Endpoints', () => {
    it('should return configuration', async () => {
      const response = await axios.get(`${API_URL}/api/config`);

      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });

    it('should include trading limits in config', async () => {
      const response = await axios.get(`${API_URL}/api/config`);
      const config = response.data.data;

      expect(config).toHaveProperty('maxLeverage');
      expect(config).toHaveProperty('maxRiskPerTrade');
      expect(config).toHaveProperty('minRiskReward');
      expect(config).toHaveProperty('supportedSymbols');
    });

    it('should include supported symbols array', async () => {
      const response = await axios.get(`${API_URL}/api/config`);
      const { supportedSymbols } = response.data.data;

      expect(Array.isArray(supportedSymbols)).toBe(true);
      expect(supportedSymbols.length).toBeGreaterThan(0);
      expect(supportedSymbols).toContain('BTC');
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 for unknown endpoints', async () => {
      try {
        await axios.get(`${API_URL}/api/unknown`);
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should handle invalid signal symbol gracefully', async () => {
      const response = await axios.get(`${API_URL}/api/signals/UNKNOWN`);

      // Should still return a response, even if insufficient data
      expect(response.status).toBeLessThan(500);
    });
  });
});

describe('WebSocket Integration Tests', () => {
  let ws: WebSocket;

  const connectWebSocket = (): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      ws = new WebSocket(WS_URL);

      ws.on('open', () => resolve(ws));
      ws.on('error', reject);

      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });
  };

  const closeWebSocket = (): Promise<void> => {
    return new Promise((resolve) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.on('close', () => resolve());
        ws.close();
      } else {
        resolve();
      }
    });
  };

  beforeAll(async () => {
    if (!serverProcess) {
      serverProcess = spawn('npm', ['run', 'dev'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  });

  afterAll(async () => {
    await closeWebSocket();
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should connect to WebSocket server', async () => {
    await expect(connectWebSocket()).resolves.toBeDefined();
    await closeWebSocket();
  });

  it('should receive welcome message on connection', async () => {
    await connectWebSocket();

    const message = await new Promise<any>((resolve) => {
      ws.on('message', (data: string) => {
        resolve(JSON.parse(data.toString()));
      });

      setTimeout(() => resolve(null), 2000);
    });

    expect(message).toBeDefined();
    expect(message.type).toBeDefined();
    await closeWebSocket();
  });

  it('should receive price updates', async () => {
    await connectWebSocket();

    const priceMessage = await new Promise<any>((resolve) => {
      ws.on('message', (data: string) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'price' && message.data.symbol) {
          resolve(message);
        }
      });

      setTimeout(() => resolve(null), 10000);
    });

    expect(priceMessage).toBeDefined();
    expect(priceMessage.type).toBe('price');
    expect(priceMessage.data.symbol).toBeDefined();
    expect(priceMessage.data.price).toBeDefined();
    await closeWebSocket();
  });

  it('should handle JSON messages correctly', async () => {
    await connectWebSocket();

    ws.send(JSON.stringify({ action: 'subscribe', symbol: 'BTC' }));

    const response = await new Promise<any>((resolve) => {
      ws.on('message', (data: string) => {
        try {
          resolve(JSON.parse(data.toString()));
        } catch {
          resolve(null);
        }
      });

      setTimeout(() => resolve(null), 1000);
    });

    expect(response).toBeDefined();
    await closeWebSocket();
  });
});

describe('Data Latency Tests', () => {
  beforeAll(async () => {
    if (!serverProcess) {
      serverProcess = spawn('npm', ['run', 'dev'], {
        cwd: process.cwd(),
        stdio: 'pipe'
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should respond to price requests within acceptable time', async () => {
    const start = Date.now();
    await axios.get(`${API_URL}/api/prices`);
    const end = Date.now();

    expect(end - start).toBeLessThan(1000); // Less than 1 second
  });

  it('should respond to signal requests within acceptable time', async () => {
    const start = Date.now();
    await axios.get(`${API_URL}/api/signals/BTC`);
    const end = Date.now();

    expect(end - start).toBeLessThan(1000);
  });

  it('should handle multiple concurrent requests', async () => {
    const start = Date.now();
    await Promise.all([
      axios.get(`${API_URL}/api/prices`),
      axios.get(`${API_URL}/api/signals/BTC`),
      axios.get(`${API_URL}/api/signals/ETH`),
      axios.get(`${API_URL}/api/config`)
    ]);
    const end = Date.now();

    expect(end - start).toBeLessThan(2000);
  });
});
