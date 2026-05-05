/**
 * Portfolio Chart Component
 * Visualize portfolio allocation and performance
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PortfolioChartProps {
  className?: string;
}

export function PortfolioChart({ className }: PortfolioChartProps) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Portfolio Chart</h3>
        <p className="text-sm text-muted-foreground">Visualize portfolio allocation and performance</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
