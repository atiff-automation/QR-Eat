/**
 * Service Worker Registration Component
 *
 * Registers the service worker in production mode.
 * This component is invisible and should be included in the root layout.
 */

'use client';

import { useEffect } from 'react';

export function RegisterServiceWorker() {
  useEffect(() => {
    // Only register in production and if service worker is supported
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log(
            '[SW] Service Worker registered successfully:',
            registration.scope
          );
        })
        .catch((error) => {
          console.error('[SW] Service Worker registration failed:', error);
        });
    }
  }, []);

  // This component renders nothing
  return null;
}
