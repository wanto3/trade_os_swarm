/**
 * Arbitrage Viewer Component
 * Display arbitrage opportunities
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ArbitrageViewerProps {
  className?: string;
}

export function ArbitrageViewer({ className }: ArbitrageViewerProps) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Arbitrage Viewer</h3>
        <p className="text-sm text-muted-foreground">Display arbitrage opportunities</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
