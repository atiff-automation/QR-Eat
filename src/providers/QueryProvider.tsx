/**
 * TanStack Query Provider
 *
 * Global provider for React Query state management.
 *
 * Following CLAUDE.md principles:
 * - Single Source of Truth
 * - Production Best Practices
 * - Development Tools Integration
 *
 * @see claudedocs/TANSTACK_QUERY_MIGRATION.md
 */

'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useEffect, useState } from 'react';
import { queryClient } from '@/lib/query-client';
import { setupQueryMonitoring } from '@/lib/monitoring/query-monitor';

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * QueryProvider wraps the application with TanStack Query context.
 *
 * Features:
 * - Global query client with optimized defaults
 * - DevTools in development (F12 → React Query tab)
 * - Automatic cache management
 * - Optimistic updates support
 *
 * Usage:
 * ```tsx
 * <QueryProvider>
 *   <App />
 * </QueryProvider>
 * ```
 */
export function QueryProvider({ children }: QueryProviderProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [DevTools, setDevTools] = useState<React.ComponentType<any> | null>(
    null
  );

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Setup DevTools
      import('@tanstack/react-query-devtools').then((mod) => {
        setDevTools(() => mod.ReactQueryDevtools);
      });

      // Setup Query Monitoring
      setupQueryMonitoring(queryClient);
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* DevTools only in development */}
      {DevTools && (
        <DevTools
          initialIsOpen={false}
          buttonPosition="bottom-left"
          position="bottom"
        />
      )}
    </QueryClientProvider>
  );
}
