import { defaultCache } from '@serwist/next/worker';
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
            urlPattern: /^https?:\/\/.*\/api\/.*(create|modify|update|delete|status).*/,
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
