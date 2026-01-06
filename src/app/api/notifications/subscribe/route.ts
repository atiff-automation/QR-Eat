/**
 * Push Notification Subscribe API
 *
 * POST /api/notifications/subscribe
 * Subscribe to push notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTenantContext, requireAuth } from '@/lib/tenant-context';
import { subscribeToPush } from '@/lib/notifications/push-service';

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext(request);
    requireAuth(context);

    const body = await request.json();
    const { subscription } = SubscribeSchema.parse(body);

    await subscribeToPush(
      context!.userId!,
      context!.userType!,
      context!.restaurantId!,
      subscription
    );

    return NextResponse.json({
      success: true,
      message: 'Subscribed to push notifications',
    });
  } catch (error) {
    console.error('[Notifications API] Subscribe error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to subscribe',
      },
      { status: 500 }
    );
  }
}
