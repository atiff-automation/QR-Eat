/**
 * Push Subscription API - Update Subscription Endpoint
 *
 * Handles subscription renewals from pushsubscriptionchange events.
 * Updates old subscription with new endpoint and keys.
 *
 * POST /api/push/update-subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getTenantContext, requireAuth } from '@/lib/tenant-context';

interface UpdateSubscriptionRequest {
  oldEndpoint?: string;
  newSubscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const context = await getTenantContext(request);
    requireAuth(context);

    const userId = context!.userId!;

    // 2. Parse request body
    const body = (await request.json()) as UpdateSubscriptionRequest;

    if (
      !body.newSubscription?.endpoint ||
      !body.newSubscription?.keys?.p256dh ||
      !body.newSubscription?.keys?.auth
    ) {
      return NextResponse.json(
        { error: 'Invalid subscription format' },
        { status: 400 }
      );
    }

    // 3. If old endpoint provided, try to update existing subscription
    if (body.oldEndpoint) {
      const existingSubscription = await prisma.pushSubscription.findFirst({
        where: {
          endpoint: body.oldEndpoint,
          userId,
        },
      });

      if (existingSubscription) {
        // Update existing subscription with new endpoint and keys
        const updated = await prisma.pushSubscription.update({
          where: {
            id: existingSubscription.id,
          },
          data: {
            endpoint: body.newSubscription.endpoint,
            p256dh: body.newSubscription.keys.p256dh,
            auth: body.newSubscription.keys.auth,
            updatedAt: new Date(),
          },
        });

        console.log(
          `[Push Update] Updated subscription for user ${userId}: ${body.oldEndpoint} → ${body.newSubscription.endpoint}`
        );

        return NextResponse.json({
          success: true,
          message: 'Subscription updated successfully',
          subscription: {
            id: updated.id,
            endpoint: updated.endpoint,
          },
        });
      }
    }

    // 4. If no old endpoint or subscription not found, create new subscription
    // This handles cases where the old subscription was already removed
    const newSubscription = await prisma.pushSubscription.upsert({
      where: {
        endpoint: body.newSubscription.endpoint,
      },
      update: {
        p256dh: body.newSubscription.keys.p256dh,
        auth: body.newSubscription.keys.auth,
        updatedAt: new Date(),
      },
      create: {
        userId,
        userType: context!.userType!,
        restaurantId: context!.restaurantId!,
        endpoint: body.newSubscription.endpoint,
        p256dh: body.newSubscription.keys.p256dh,
        auth: body.newSubscription.keys.auth,
      },
    });

    console.log(
      `[Push Update] Created new subscription for user ${userId}: ${body.newSubscription.endpoint}`
    );

    return NextResponse.json({
      success: true,
      message: 'Subscription renewed successfully',
      subscription: {
        id: newSubscription.id,
        endpoint: newSubscription.endpoint,
      },
    });
  } catch (error) {
    console.error('[Push Update] Error:', error);

    if (error instanceof Error && error.message.includes('Access denied')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
