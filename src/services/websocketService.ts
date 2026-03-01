import { WebSocketServer, WebSocket } from 'ws';
import type { WebSocketMessage, CryptoPrice, TradingSignal } from '../types/index.js';

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Set<WebSocket>;
  private priceUpdateInterval: NodeJS.Timeout | null = null;

  constructor(port: number = 3001) {
    this.wss = new WebSocketServer({ port });
    this.clients = new Set();

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New client connected');
      this.clients.add(ws);

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);
          this.handleMessage(ws, data);
        } catch (error) {
          console.error('Invalid message format:', error);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send welcome message
      this.sendToClient(ws, {
        type: 'price',
        data: { message: 'Connected to Crypto Trading OS' },
        timestamp: Date.now()
      });
    });

    console.log(`WebSocket server running on port ${port}`);
  }

  private handleMessage(ws: WebSocket, data: any): void {
    switch (data.action) {
      case 'subscribe':
        // Handle subscription to specific symbols
        break;
      case 'unsubscribe':
        // Handle unsubscription
        break;
      default:
        console.log('Unknown action:', data.action);
    }
  }

  broadcast(message: WebSocketMessage): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcastPriceUpdate(price: CryptoPrice): void {
    this.broadcast({
      type: 'price',
      data: price,
      timestamp: Date.now()
    });
  }

  broadcastSignal(signal: TradingSignal): void {
    this.broadcast({
      type: 'signal',
      data: signal,
      timestamp: Date.now()
    });
  }

  startPriceUpdates(priceCallback: () => void, intervalMs: number = 5000): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }

    this.priceUpdateInterval = setInterval(priceCallback, intervalMs);
  }

  stopPriceUpdates(): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
    }
  }

  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  close(): void {
    this.stopPriceUpdates();
    this.clients.forEach(client => client.close());
    this.wss.close();
  }
}
