/**
 * Push Notifications Hook
 *
 * Production-ready React hook for managing push notification subscriptions.
 * Handles permission requests, subscription management, and platform detection.
 *
 * Features:
 * - Browser support detection
 * - Permission state management
 * - Subscription/unsubscription
 * - Error handling with user-friendly messages
 * - iOS detection
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { urlBase64ToUint8Array } from '@/lib/utils/url-base64';

interface PushNotificationState {
  isSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({
    isSupported: false,
    permission: 'default',
    isSubscribed: false,
    isLoading: true,
    error: null,
  });

  /**
   * Check if push notifications are supported
   */
  const checkSupport = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }, []);

  /**
   * Check current notification permission
   */
  const checkPermission = useCallback(():
    | NotificationPermission
    | 'unsupported' => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }, []);

  /**
   * Check if currently subscribed to push notifications
   */
  const checkSubscription = useCallback(async (): Promise<boolean> => {
    try {
      if (!checkSupport()) return false;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      return subscription !== null;
    } catch (error) {
      console.error('[Push] Error checking subscription:', error);
      return false;
    }
  }, [checkSupport]);

  /**
   * Initialize state on mount
   */
  useEffect(() => {
    const initialize = async () => {
      const supported = checkSupport();
      const permission = checkPermission();
      const subscribed = await checkSubscription();

      setState({
        isSupported: supported,
        permission,
        isSubscribed: subscribed,
        isLoading: false,
        error: null,
      });
    };

    initialize();
  }, [checkSupport, checkPermission, checkSubscription]);

  /**
   * Request notification permission from user
   */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (!state.isSupported) {
        setState((prev) => ({
          ...prev,
          error: 'Push notifications are not supported in this browser',
        }));
        return false;
      }

      const permission = await Notification.requestPermission();

      setState((prev) => ({
        ...prev,
        permission,
        error: null,
      }));

      if (permission === 'denied') {
        setState((prev) => ({
          ...prev,
          error:
            'Notification permission denied. Please enable in browser settings.',
        }));
        return false;
      }

      return permission === 'granted';
    } catch (error) {
      console.error('[Push] Error requesting permission:', error);
      setState((prev) => ({
        ...prev,
        error: 'Failed to request notification permission',
      }));
      return false;
    }
  }, [state.isSupported]);

  /**
   * Subscribe to push notifications
   */
  const subscribe = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // Check support
      if (!state.isSupported) {
        throw new Error('Push notifications are not supported');
      }

      // Request permission if not granted
      if (state.permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          setState((prev) => ({ ...prev, isLoading: false }));
          return false;
        }
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Get VAPID public key from environment
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Subscribe to push manager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // Send subscription to backend
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save subscription');
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: true,
        isLoading: false,
        error: null,
      }));

      console.log('[Push] Successfully subscribed to push notifications');
      return true;
    } catch (error) {
      console.error('[Push] Error subscribing:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to subscribe to notifications',
      }));
      return false;
    }
  }, [state.isSupported, state.permission, requestPermission]);

  /**
   * Unsubscribe from push notifications
   */
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (!state.isSupported) {
        throw new Error('Push notifications are not supported');
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setState((prev) => ({
          ...prev,
          isSubscribed: false,
          isLoading: false,
        }));
        return true;
      }

      // Unsubscribe from push manager
      await subscription.unsubscribe();

      // Remove from backend
      const response = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to remove subscription');
      }

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        isLoading: false,
        error: null,
      }));

      console.log('[Push] Successfully unsubscribed from push notifications');
      return true;
    } catch (error) {
      console.error('[Push] Error unsubscribing:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to unsubscribe from notifications',
      }));
      return false;
    }
  }, [state.isSupported]);

  /**
   * Get current subscription
   */
  const getSubscription =
    useCallback(async (): Promise<PushSubscription | null> => {
      try {
        if (!state.isSupported) return null;

        const registration = await navigator.serviceWorker.ready;
        return await registration.pushManager.getSubscription();
      } catch (error) {
        console.error('[Push] Error getting subscription:', error);
        return null;
      }
    }, [state.isSupported]);

  /**
   * Clear error message
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    // State
    isSupported: state.isSupported,
    permission: state.permission,
    isSubscribed: state.isSubscribed,
    isLoading: state.isLoading,
    error: state.error,

    // Methods
    subscribe,
    unsubscribe,
    requestPermission,
    getSubscription,
    clearError,
  };
}
