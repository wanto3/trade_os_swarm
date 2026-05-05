/**
 * Order Book Component
 * Real-time order book with bid/ask visualization
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface OrderBookProps {
  className?: string;
}

export function OrderBook({ className }: OrderBookProps) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Order Book</h3>
        <p className="text-sm text-muted-foreground">Real-time order book with bid/ask visualization</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
