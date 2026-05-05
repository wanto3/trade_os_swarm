/**
 * Crypto Screener Component
 * Filter coins by market cap, volume, price
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface CryptoScreenerProps {
  className?: string;
}

export function CryptoScreener({ className }: CryptoScreenerProps) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Crypto Screener</h3>
        <p className="text-sm text-muted-foreground">Filter coins by market cap, volume, price</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
