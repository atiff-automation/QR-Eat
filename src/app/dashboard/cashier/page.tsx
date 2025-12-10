/**
 * Cashier Dashboard Page - POS System
 *
 * Following CLAUDE.md principles:
 * - Client Component for real-time updates
 * - RBAC integration
 * - Type Safety
 *
 * @see claudedocs/POS_IMPLEMENTATION_PLAN.md
 */

'use client';

import { CashierDashboard } from '@/components/pos/CashierDashboard';

export default function CashierPage() {
  return (
    <div className="h-full">
      <CashierDashboard />
    </div>
  );
}
