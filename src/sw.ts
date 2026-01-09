import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the
// actual precache manifest. By default, this string is set to
// `"self.__SW_MANIFEST"`.
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
    // 1. NEVER CACHE: Auth endpoints (verified pattern: /api/auth/*)
    {
      urlPattern: /^https?:\/\/.*\/api\/auth\/.*/,
      handler: 'NetworkOnly',
    },

    // 2. NEVER CACHE: Payment endpoints (verified pattern: /api/*/pay*)
    {
      urlPattern: /^https?:\/\/.*\/api\/.*\/pay.*/,
      handler: 'NetworkOnly',
    },

    // 3. NEVER CACHE: Mutation endpoints (verified: create/modify/update/delete/status)
    {
      urlPattern:
        /^https?:\/\/.*\/api\/.*(create|modify|update|delete|status).*/,
      handler: 'NetworkOnly',
    },

    // 4. Static Assets - Cache First (30 days)
    {
      urlPattern: /^https?.*\.(js|css|woff|woff2|ttf|eot)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'static-resources',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        },
      },
    },

    // 5. Images - Cache First (7 days)
    {
      urlPattern: /^https?.*\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'image-cache',
        expiration: {
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60,
        },
      },
    },

    // 6. Menu & Restaurant Data - Stale While Revalidate (1 hour)
    {
      urlPattern: /^https?:\/\/.*\/api\/(menu|restaurants|tables)\/[^/]+$/,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'menu-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 60 * 60,
        },
      },
    },

    // 7. Order List/Stats - Network First (5 min cache fallback)
    {
      urlPattern: /^https?:\/\/.*\/api\/orders\/(list|stats|live)$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'orders-cache',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 5 * 60,
        },
      },
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
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');

  let notificationData = {
    title: 'New Notification',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: {},
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
      // Note: sound property only works on Android
      // iOS does not support custom notification sounds
      ...(notificationData.sound && { sound: notificationData.sound }),
    })
  );
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click received');

  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/dashboard/orders';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if no matching window found
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

/**
 * Handle push subscription changes (CRITICAL for subscription renewals)
 * Browsers periodically renew subscriptions - this ensures we stay subscribed
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription change detected');

  event.waitUntil(
    (async () => {
      try {
        // Get VAPID public key from environment
        // Note: In production, this should be injected during build
        const vapidPublicKey = 'NEXT_PUBLIC_VAPID_PUBLIC_KEY_PLACEHOLDER';

        // Subscribe to new push manager
        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        // Send new subscription to backend
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
