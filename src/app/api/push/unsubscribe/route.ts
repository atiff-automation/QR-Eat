/**
 * Push Subscription API - Unsubscribe Endpoint
 *
 * Handles push notification unsubscriptions.
 * Removes subscription from database.
 *
 * POST /api/push/unsubscribe
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext, requireAuth } from '@/lib/tenant-context';

interface UnsubscribeRequest {
  endpoint: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const context = await getTenantContext(request);
    requireAuth(context);

    const userId = context!.userId!;

    // 2. Parse request body
    const body = (await request.json()) as UnsubscribeRequest;

    if (!body.endpoint) {
      return NextResponse.json({ error: 'Endpoint required' }, { status: 400 });
    }

    // 3. Delete subscription
    // Only allow users to delete their own subscriptions
    const deleted = await prisma.pushSubscription.deleteMany({
      where: {
        endpoint: body.endpoint,
        userId,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { error: 'Subscription not found or unauthorized' },
        { status: 404 }
      );
    }

    console.log(
      `[Push Unsubscribe] User ${userId} unsubscribed from ${body.endpoint}`
    );

    return NextResponse.json({
      success: true,
      message: 'Push subscription removed successfully',
    });
  } catch (error) {
    console.error('[Push Unsubscribe] Error:', error);

    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
