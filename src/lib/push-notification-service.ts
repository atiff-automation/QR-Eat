/**
 * Push Notification Service
 *
 * Production-ready service for sending Web Push notifications using VAPID authentication.
 * Handles subscription management, error handling, and batch sending.
 *
 * Features:
 * - VAPID authentication
 * - 410/404 error handling (expired/invalid subscriptions)
 * - Endpoint validation (fcm.googleapis.com, web.push.apple.com, etc.)
 * - Batch sending with concurrency control
 * - Payload size validation (4KB limit)
 * - Comprehensive error logging
 */

import webpush from 'web-push';
import { prisma } from '@/lib/database';

// VAPID configuration
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT!;

// Validate VAPID configuration on startup
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
  throw new Error(
    'Missing VAPID configuration. Please set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in .env'
  );
}

// Configure web-push with VAPID details
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Valid push service domains
const VALID_PUSH_DOMAINS = [
  'fcm.googleapis.com', // Chrome/Android
  'web.push.apple.com', // Safari/iOS
  'updates.push.services.mozilla.com', // Firefox
  'updates-autopush.stage.mozaws.net', // Firefox staging
  'updates-autopush.dev.mozaws.net', // Firefox dev
];

// Maximum payload size (4KB as per Web Push spec)
const MAX_PAYLOAD_SIZE = 4096;

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  sound?: string;
  data?: Record<string, unknown>;
}

class PushNotificationService {
  /**
   * Validate subscription endpoint domain
   */
  private isValidEndpoint(endpoint: string): boolean {
    try {
      const url = new URL(endpoint);
      return VALID_PUSH_DOMAINS.some((domain) => url.hostname.includes(domain));
    } catch {
      return false;
    }
  }

  /**
   * Validate payload size
   */
  private validatePayloadSize(payload: NotificationPayload): void {
    const payloadString = JSON.stringify(payload);
    const payloadSize = new TextEncoder().encode(payloadString).length;

    if (payloadSize > MAX_PAYLOAD_SIZE) {
      throw new Error(
        `Payload size (${payloadSize} bytes) exceeds maximum (${MAX_PAYLOAD_SIZE} bytes)`
      );
    }
  }

  /**
   * Remove expired/invalid subscription from database
   */
  private async removeSubscription(endpoint: string): Promise<void> {
    try {
      await prisma.pushSubscription.delete({
        where: { endpoint },
      });
      console.log(`[Push] Removed invalid subscription: ${endpoint}`);
    } catch (error) {
      console.error(`[Push] Error removing subscription:`, error);
    }
  }

  /**
   * Send notification to a single subscription
   */
  async sendNotification(
    subscription: PushSubscription,
    payload: NotificationPayload
  ): Promise<boolean> {
    try {
      // Validate endpoint
      if (!this.isValidEndpoint(subscription.endpoint)) {
        console.warn(
          `[Push] Invalid endpoint domain: ${subscription.endpoint}`
        );
        await this.removeSubscription(subscription.endpoint);
        return false;
      }

      // Validate payload size
      this.validatePayloadSize(payload);

      // Send notification
      await webpush.sendNotification(subscription, JSON.stringify(payload));

      console.log(
        `[Push] Notification sent successfully to ${subscription.endpoint}`
      );
      return true;
    } catch (error) {
      // Handle specific error codes
      const pushError = error as { statusCode?: number; message?: string };

      if (pushError.statusCode === 410) {
        // 410 Gone - Subscription expired/unsubscribed
        console.log(
          `[Push] Subscription expired (410): ${subscription.endpoint}`
        );
        await this.removeSubscription(subscription.endpoint);
        return false;
      } else if (pushError.statusCode === 404) {
        // 404 Not Found - Endpoint doesn't exist
        console.log(
          `[Push] Subscription not found (404): ${subscription.endpoint}`
        );
        await this.removeSubscription(subscription.endpoint);
        return false;
      } else {
        // Other errors - log but don't remove subscription
        console.error(
          `[Push] Error sending notification (${pushError.statusCode}):`,
          pushError.message
        );
        throw error;
      }
    }
  }

  /**
   * Send notification to all subscriptions for a restaurant
   * Uses batch sending with concurrency control
   */
  async sendToRestaurant(
    restaurantId: string,
    payload: NotificationPayload
  ): Promise<{ sent: number; failed: number }> {
    try {
      // Fetch all subscriptions for restaurant
      const subscriptions = await prisma.pushSubscription.findMany({
        where: { restaurantId },
      });

      if (subscriptions.length === 0) {
        console.log(
          `[Push] No subscriptions found for restaurant ${restaurantId}`
        );
        return { sent: 0, failed: 0 };
      }

      console.log(
        `[Push] Sending notification to ${subscriptions.length} subscriptions for restaurant ${restaurantId}`
      );

      // Convert to web-push format
      const pushSubscriptions: PushSubscription[] = subscriptions.map(
        (sub) => ({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        })
      );

      // Send in batches of 10 concurrent requests
      const BATCH_SIZE = 10;
      let sent = 0;
      let failed = 0;

      for (let i = 0; i < pushSubscriptions.length; i += BATCH_SIZE) {
        const batch = pushSubscriptions.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map((sub) => this.sendNotification(sub, payload))
        );

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            sent++;
          } else {
            failed++;
          }
        });
      }

      console.log(
        `[Push] Batch complete: ${sent} sent, ${failed} failed for restaurant ${restaurantId}`
      );

      return { sent, failed };
    } catch (error) {
      console.error(
        `[Push] Error sending to restaurant ${restaurantId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Send notification to specific user across all their devices
   */
  async sendToUser(
    userId: string,
    userType: string,
    payload: NotificationPayload
  ): Promise<{ sent: number; failed: number }> {
    try {
      const subscriptions = await prisma.pushSubscription.findMany({
        where: {
          userId,
          userType,
        },
      });

      if (subscriptions.length === 0) {
        console.log(`[Push] No subscriptions found for user ${userId}`);
        return { sent: 0, failed: 0 };
      }

      const pushSubscriptions: PushSubscription[] = subscriptions.map(
        (sub) => ({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        })
      );

      let sent = 0;
      let failed = 0;

      const results = await Promise.allSettled(
        pushSubscriptions.map((sub) => this.sendNotification(sub, payload))
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          sent++;
        } else {
          failed++;
        }
      });

      return { sent, failed };
    } catch (error) {
      console.error(`[Push] Error sending to user ${userId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
