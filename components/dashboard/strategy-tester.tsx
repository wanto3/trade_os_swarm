/**
 * Strategy Tester Component
 * Configure and run backtests
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface StrategyTesterProps {
  className?: string;
}

export function StrategyTester({ className }: StrategyTesterProps) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Strategy Tester</h3>
        <p className="text-sm text-muted-foreground">Configure and run backtests</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
