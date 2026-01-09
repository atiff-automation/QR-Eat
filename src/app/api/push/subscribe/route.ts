/**
 * Push Subscription API - Subscribe Endpoint
 *
 * Handles new push notification subscriptions.
 * Validates endpoint, authenticates user, and stores subscription in database.
 *
 * POST /api/push/subscribe
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext, requireAuth } from '@/lib/tenant-context';

// Valid push service domains
const VALID_PUSH_DOMAINS = [
  'fcm.googleapis.com', // Chrome/Android
  'web.push.apple.com', // Safari/iOS
  'updates.push.services.mozilla.com', // Firefox
  'updates-autopush.stage.mozaws.net', // Firefox staging
  'updates-autopush.dev.mozaws.net', // Firefox dev
];

interface SubscriptionRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const context = await getTenantContext(request);
    requireAuth(context);

    const userId = context!.userId!;
    const userType = context!.userType!;
    const restaurantId = context!.restaurantId;

    if (!restaurantId) {
      return NextResponse.json(
        { error: 'Restaurant ID required' },
        { status: 400 }
      );
    }

    // 2. Parse request body
    const body = (await request.json()) as SubscriptionRequest;

    if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json(
        {
          error: 'Invalid subscription format',
          details: 'Missing endpoint or keys',
        },
        { status: 400 }
      );
    }

    // 3. Validate endpoint domain
    try {
      const url = new URL(body.endpoint);
      const isValid = VALID_PUSH_DOMAINS.some((domain) =>
        url.hostname.includes(domain)
      );

      if (!isValid) {
        return NextResponse.json(
          {
            error: 'Invalid push endpoint',
            details: `Endpoint must be from a valid push service: ${VALID_PUSH_DOMAINS.join(', ')}`,
          },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid endpoint URL' },
        { status: 400 }
      );
    }

    // 4. Store subscription (upsert to handle re-subscriptions)
    const subscription = await prisma.pushSubscription.upsert({
      where: {
        endpoint: body.endpoint,
      },
      update: {
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        updatedAt: new Date(),
      },
      create: {
        userId,
        userType,
        restaurantId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
    });

    console.log(
      `[Push Subscribe] User ${userId} (${userType}) subscribed for restaurant ${restaurantId}`
    );

    return NextResponse.json({
      success: true,
      message: 'Push subscription created successfully',
      subscription: {
        id: subscription.id,
        endpoint: subscription.endpoint,
      },
    });
  } catch (error) {
    console.error('[Push Subscribe] Error:', error);

    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
