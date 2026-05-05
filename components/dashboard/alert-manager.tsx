/**
 * Alert Manager Component
 * Manage price alerts and notifications
 */

'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface AlertManagerProps {
  className?: string;
}

export function AlertManager({ className }: AlertManagerProps) {
  return (
    <Card className={className}>
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-2">Alert Manager</h3>
        <p className="text-sm text-muted-foreground">Manage price alerts and notifications</p>
        <div className="mt-4">
          <Badge variant="outline">Auto-generated</Badge>
        </div>
      </div>
    </Card>
  );
}
