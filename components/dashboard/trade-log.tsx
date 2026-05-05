/**
 * Trade Log Component
 * Display historical trades with filtering
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TradeLogProps {
  className?: string;
}

export function TradeLog({ className }: TradeLogProps) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Trade Log</h3>
        <p className="text-sm text-muted-foreground">Display historical trades with filtering</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
