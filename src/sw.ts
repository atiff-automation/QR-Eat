/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkOnly, CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'serwist';

// This declares the value of `injectionPoint` to TypeScript.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1. NEVER CACHE: Auth endpoints
    {
      matcher: /^https?:\/\/.*\/api\/auth\/.*/,
      handler: new NetworkOnly(),
    },

    // 2. NEVER CACHE: Payment endpoints
    {
      matcher: /^https?:\/\/.*\/api\/.*\/pay.*/,
      handler: new NetworkOnly(),
    },

    // 3. NEVER CACHE: Mutation endpoints
    {
      matcher:
        /^https?:\/\/.*\/api\/.*(create|modify|update|delete|status).*/,
      handler: new NetworkOnly(),
    },

    // 4. Static Assets - Cache First (30 days)
    {
      matcher: /^https?.*\.(js|css|woff|woff2|ttf|eot)$/,
      handler: new CacheFirst({
        cacheName: 'static-resources',
      }),
    },

    // 5. Images - Cache First (7 days)
    {
      matcher: /^https?.*\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: new CacheFirst({
        cacheName: 'image-cache',
      }),
    },

    // 6. Menu & Restaurant Data - Stale While Revalidate (1 hour)
    {
      matcher: /^https?:\/\/.*\/api\/(menu|restaurants|tables)\/[^/]+$/,
      handler: new StaleWhileRevalidate({
        cacheName: 'menu-cache',
      }),
    },

    // 7. Order List/Stats - Network First (5 min cache fallback)
    {
      matcher: /^https?:\/\/.*\/api\/orders\/(list|stats|live)$/,
      handler: new NetworkFirst({
        cacheName: 'orders-cache',
        networkTimeoutSeconds: 5,
      }),
    },
  ],
  // Fallback to offline page for navigation requests
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.mode === 'navigate',
      },
    ],
  },
});

serwist.addEventListeners();

/**
 * Push Notification Event Handlers
 */

// Helper function to convert URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Handle incoming push notifications
 */
self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW] Push event received');

  let notificationData = {
    title: 'New Notification',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: {},
    sound: undefined as string | undefined,
  };

  // Parse push event data
  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (error) {
      console.error('[SW] Error parsing push data:', error);
    }
  }

  // Show notification
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon || '/icons/icon-192x192.png',
      badge: notificationData.badge || '/icons/badge-72x72.png',
      vibrate: [200, 100, 200],
      data: notificationData.data,
      requireInteraction: false,
      ...(notificationData.sound && { sound: notificationData.sound }),
    } as NotificationOptions)
  );
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log('[SW] Notification click received');

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/dashboard/orders';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return (client as WindowClient).focus();
          }
        }
        // Open new window if no matching window found
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
  );
});

/**
 * Handle push subscription changes
 */
self.addEventListener('pushsubscriptionchange', (event: any) => {
  console.log('[SW] Push subscription change detected');

  event.waitUntil(
    (async () => {
      try {
        const vapidPublicKey = 'NEXT_PUBLIC_VAPID_PUBLIC_KEY_PLACEHOLDER';

        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
        });

        await fetch('/api/push/update-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oldEndpoint: event.oldSubscription?.endpoint,
            newSubscription: newSubscription.toJSON(),
          }),
        });

        console.log('[SW] Push subscription renewed successfully');
      } catch (error) {
        console.error('[SW] Failed to renew push subscription:', error);
      }
    })()
  );
});
