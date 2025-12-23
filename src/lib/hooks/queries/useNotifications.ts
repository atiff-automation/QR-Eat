/**
 * Notifications Query Hooks
 *
 * TanStack Query hooks for notification state management.
 * Replaces manual state management in NotificationBell component.
 *
 * Following CLAUDE.md principles:
 * - Type Safety
 * - Built-in Polling
 * - Cache Management
 *
 * @see claudedocs/TANSTACK_QUERY_MIGRATION.md
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

// =============================================================================
// Type Definitions
// =============================================================================

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationsResponse {
  notifications: Notification[];
}

export interface PasswordResetResponse {
  staffName: string;
  staffEmail: string;
  temporaryPassword?: string;
}

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Fetch user notifications with polling
 *
 * Features:
 * - Auto-polling (60 seconds)
 * - Real-time updates
 * - Unread count
 *
 * Usage:
 * ```tsx
 * const { notifications, unreadCount, isLoading } = useNotifications();
 * ```
 */
export function useNotifications() {
  const { data, isLoading, isFetching, error, refetch } = useQuery<
    NotificationsResponse,
    Error
  >({
    queryKey: queryKeys.notifications.all,
    queryFn: async () => {
      try {
        const response =
          await ApiClient.get<NotificationsResponse>('/notifications');
        return response;
      } catch (error) {
        console.error('❌ useNotifications: Failed to fetch', error);
        // Return empty array on error instead of throwing
        return { notifications: [] };
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Poll every 60 seconds
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return {
    notifications,
    unreadCount,
    isLoading,
    isRefreshing: isFetching && !isLoading,
    error: error?.message ?? null,
    refetch,
  };
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Mark notification as read
 *
 * Usage:
 * ```tsx
 * const { mutate: markAsRead } = useMarkNotificationAsRead();
 *
 * markAsRead('notification-id');
 * ```
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (notificationId: string) => {
      await ApiClient.patch(`/notifications/${notificationId}`, {
        isRead: true,
      });
    },

    // Optimistic update
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.notifications.all,
      });

      const previousNotifications =
        queryClient.getQueryData<NotificationsResponse>(
          queryKeys.notifications.all
        );

      // Optimistically mark as read
      if (previousNotifications) {
        queryClient.setQueryData<NotificationsResponse>(
          queryKeys.notifications.all,
          {
            notifications: previousNotifications.notifications.map((n) =>
              n.id === notificationId ? { ...n, isRead: true } : n
            ),
          }
        );
      }

      return { previousNotifications };
    },

    onError: (error, notificationId, context) => {
      // Rollback on error
      if (context?.previousNotifications) {
        queryClient.setQueryData(
          queryKeys.notifications.all,
          context.previousNotifications
        );
      }
      console.error('❌ useMarkAsRead: Failed', error);
    },

    onSuccess: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },
  });
}

/**
 * Reset staff password
 *
 * Usage:
 * ```tsx
 * const { mutate: resetPassword, isPending } = useResetStaffPassword();
 *
 * resetPassword(
 *   { staffId: '123', notificationId: '456' },
 *   {
 *     onSuccess: (data) => {
 *       console.log('New password:', data.temporaryPassword);
 *     },
 *   }
 * );
 * ```
 */
export function useResetStaffPassword() {
  const queryClient = useQueryClient();

  return useMutation<
    PasswordResetResponse,
    Error,
    { staffId: string; notificationId: string }
  >({
    mutationFn: async ({ staffId }) => {
      const response = await ApiClient.post<PasswordResetResponse>(
        `/owner/staff/${staffId}/reset-password`
      );
      return response;
    },

    onSuccess: (data, variables) => {
      // Update notification as completed
      const previousNotifications =
        queryClient.getQueryData<NotificationsResponse>(
          queryKeys.notifications.all
        );

      if (previousNotifications) {
        queryClient.setQueryData<NotificationsResponse>(
          queryKeys.notifications.all,
          {
            notifications: previousNotifications.notifications.map((n) =>
              n.id === variables.notificationId
                ? {
                    ...n,
                    isRead: true,
                    metadata: {
                      ...n.metadata,
                      completed: true,
                      completedAt: new Date().toISOString(),
                    },
                  }
                : n
            ),
          }
        );
      }

      // Refetch to ensure consistency
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.all,
      });
    },

    onError: (error) => {
      console.error('❌ useResetStaffPassword: Failed', error);
    },
  });
}
