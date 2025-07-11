'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { OrdersOverview } from '@/components/dashboard/OrdersOverview';

export default function OrdersPage() {
  return (
    <DashboardLayout>
      <div className="p-6">
        <OrdersOverview />
      </div>
    </DashboardLayout>
  );
}