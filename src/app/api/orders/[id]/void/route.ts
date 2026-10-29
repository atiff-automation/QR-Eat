import { NextRequest } from 'next/server';
import { handleOrderAdjustmentRequest } from '@/lib/orders/order-adjustment-http';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handleOrderAdjustmentRequest(request, params, 'VOID', {
    resource: 'orders',
    action: 'write',
  });
}
