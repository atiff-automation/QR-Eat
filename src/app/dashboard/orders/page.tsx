'use client';

import { OrdersOverview } from '@/components/dashboard/OrdersOverview';

export default function OrdersPage() {
  return (
    <div className="p-2 md:p-6">
      <OrdersOverview />
    </div>
  );
}
