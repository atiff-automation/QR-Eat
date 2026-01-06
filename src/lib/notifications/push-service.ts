/**
 * Push Notification Service
 * Handles sending web push notifications for order alerts
 *
 * @see implementation_plan_production_v3.md - Push Notifications
 */

import webpush from 'web-push';
import { prisma } from '@/lib/database';

// Configure web-push with VAPID keys
if (
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Send order notification to all subscribed devices for a restaurant
 */
export async function sendOrderNotification(
  restaurantId: string,
  orderId: string,
  orderNumber: string
): Promise<void> {
  try {
    // Get all subscriptions for this restaurant
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { restaurantId },
    });

    if (subscriptions.length === 0) {
      console.log(
        '[Push] No subscriptions found for restaurant:',
        restaurantId
      );
      return;
    }

    const payload = JSON.stringify({
      title: 'New Order',
      body: `Order #${orderNumber} received`,
      url: `/dashboard/orders`,
      orderId,
      tag: `order-${orderId}`,
    });

    // Send to all subscribed devices
    const promises = subscriptions.map((sub) =>
      webpush
        .sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        )
        .catch((error) => {
          console.error('[Push] Failed to send notification:', error);
          // If subscription is invalid (410 Gone), delete it
          if (error.statusCode === 410) {
            console.log('[Push] Removing invalid subscription:', sub.id);
            return prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
        })
    );

    await Promise.all(promises);
    console.log(
      `[Push] Sent ${subscriptions.length} notifications for order ${orderNumber}`
    );
  } catch (error) {
    console.error('[Push] Failed to send order notifications:', error);
  }
}

/**
 * Subscribe a device to push notifications
 */
export async function subscribeToPush(
  userId: string,
  userType: string,
  restaurantId: string,
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }
): Promise<void> {
  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        userType,
        restaurantId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId,
        userType,
        restaurantId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
    console.log('[Push] Subscription saved for user:', userId);
  } catch (error) {
    console.error('[Push] Failed to save subscription:', error);
    throw error;
  }
}

/**
 * Unsubscribe a device from push notifications
 */
export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  try {
    await prisma.pushSubscription.delete({
      where: { endpoint },
    });
    console.log('[Push] Subscription removed:', endpoint);
  } catch (error) {
    console.error('[Push] Failed to remove subscription:', error);
    throw error;
  }
}
