/**
 * Server-Side Cart Hook
 *
 * Manages cart state with server-side persistence via table sessions.
 * Each customer gets their own session and cart for independent ordering.
 * Cart updates immediately after user actions (add, update, remove).
 *
 * @see CLAUDE.md - DRY, Single Responsibility, Error Handling
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cart, MenuItem, MenuItemVariation } from '@/types/menu';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { STORAGE_KEYS } from '@/lib/session-constants';

interface ServerCartItem {
  id: string;
  menuItemId: string;
  variationId: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions: string | null;
  menuItem: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
  variation: {
    id: string;
    name: string;
  } | null;
}

interface ServerCart {
  items: ServerCartItem[];
  totalItems: number;
  totalAmount: number;
  sessionId?: string; // Added for persistence
}

export function useServerCart(
  tableId: string | null,
  taxRate: number = 0.085,
  serviceChargeRate: number = 0.12
) {
  const [cart, setCart] = useState<Cart>({
    items: [],
    subtotal: 0,
    taxAmount: 0,
    serviceCharge: 0,
    totalAmount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Initialize session from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSessionId = localStorage.getItem(STORAGE_KEYS.SESSION_ID);
      if (savedSessionId) {
        setSessionId(savedSessionId);
      }
    }
  }, []);

  // Calculate cart totals from server cart
  const calculateTotals = useCallback(
    (serverCart: ServerCart) => {
      const subtotal = serverCart.items.reduce(
        (sum, item) => sum + item.subtotal,
        0
      );
      const taxAmount = subtotal * taxRate;
      const serviceCharge = subtotal * serviceChargeRate;
      const totalAmount = subtotal + taxAmount + serviceCharge;

      return {
        subtotal: Math.round(subtotal * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        serviceCharge: Math.round(serviceCharge * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
      };
    },
    [taxRate, serviceChargeRate]
  );

  // Fetch cart from server
  const fetchCart = useCallback(async () => {
    if (!tableId) return;

    console.log(
      '[fetchCart] Starting fetch for tableId:',
      tableId,
      'sessionId:',
      sessionId
    );

    try {
      // Pass sessionId if we have it
      const queryParams = new URLSearchParams();
      if (sessionId) {
        queryParams.append('sessionId', sessionId);
      }

      const data = await ApiClient.get<{ cart: ServerCart }>(
        `/qr/cart/${tableId}?${queryParams.toString()}`
      );

      const serverCart: ServerCart = data.cart;
      console.log('[fetchCart] Received server cart:', serverCart);

      // Persist session ID if returned
      if (serverCart.sessionId && serverCart.sessionId !== sessionId) {
        console.log('[fetchCart] Updating sessionId:', serverCart.sessionId);
        setSessionId(serverCart.sessionId);
        localStorage.setItem(STORAGE_KEYS.SESSION_ID, serverCart.sessionId);
      }

      const totals = calculateTotals(serverCart);

      // Convert server cart items to client cart format (including server IDs)
      const clientItems = serverCart.items.map((item) => ({
        id: item.id, // ✅ Include server cart item ID
        menuItemId: item.menuItemId,
        menuItem: {
          id: item.menuItem.id,
          name: item.menuItem.name,
          imageUrl: item.menuItem.imageUrl,
          price: item.unitPrice,
        } as MenuItem,
        quantity: item.quantity,
        selectedVariations: item.variation
          ? [
              {
                variationId: item.variation.id,
                variation: {
                  id: item.variation.id,
                  name: item.variation.name,
                } as MenuItemVariation,
                quantity: 1,
              },
            ]
          : [],
        specialInstructions: item.specialInstructions || undefined,
        unitPrice: item.unitPrice,
        totalPrice: item.subtotal,
      }));

      console.log('[fetchCart] Setting cart with', clientItems.length, 'items');
      setCart({
        items: clientItems,
        ...totals,
      });
      setError(null);
    } catch (err) {
      console.error('[fetchCart] Error fetching cart:', err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Network error. Please try again.'
      );
    }
  }, [tableId, calculateTotals, sessionId]);

  // Add item to cart
  const addToCart = useCallback(
    async (
      menuItem: MenuItem,
      quantity: number = 1,
      selectedVariations: Array<{
        variationId: string;
        variation: MenuItemVariation;
        quantity: number;
      }> = [],
      specialInstructions?: string
    ) => {
      if (!tableId) {
        setError('No table selected');
        return;
      }

      console.log(
        '[addToCart] Adding item:',
        menuItem.name,
        'quantity:',
        quantity
      );
      setLoading(true);
      setError(null);

      try {
        const variationId =
          selectedVariations.length > 0
            ? selectedVariations[0].variationId
            : undefined;

        console.log('[addToCart] Calling API...');
        await ApiClient.post('/qr/cart/add', {
          tableId,
          sessionId: sessionId || undefined, // Pass session ID for persistence
          menuItemId: menuItem.id,
          variationId,
          quantity,
          unitPrice: menuItem.price,
          specialInstructions,
        });

        console.log('[addToCart] API success, calling fetchCart...');
        // Refresh cart to get updated state
        await fetchCart();
        console.log('[addToCart] fetchCart completed');
      } catch (err) {
        console.error('[addToCart] Error adding to cart:', err);
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Network error. Please try again.'
        );

        // Handling session mismatch: if error suggests session issues, clear local storage
        if (err instanceof Error && err.message.includes('Session')) {
          localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
          setSessionId(null);
          // Retry fetch to get new session?
        }
      } finally {
        setLoading(false);
      }
    },
    [tableId, fetchCart, sessionId]
  );

  // Update cart item (using server ID - no more race conditions!)
  const updateCartItem = useCallback(
    async (
      itemIndex: number,
      updates: { quantity?: number; specialInstructions?: string }
    ) => {
      if (!tableId) return;

      const item = cart.items[itemIndex];
      if (!item || !item.id) {
        setError('Cart item not found');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // ✅ Use server ID directly - no N+1 query, no race condition!
        await ApiClient.patch(`/qr/cart/items/${item.id}`, {
          quantity: updates.quantity ?? item.quantity,
          specialInstructions: updates.specialInstructions,
        });

        await fetchCart();
      } catch (err) {
        console.error('Error updating cart item:', err);
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Network error. Please try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [tableId, cart.items, fetchCart]
  );

  // Remove item from cart (using server ID - no more race conditions!)
  const removeFromCart = useCallback(
    async (itemIndex: number) => {
      if (!tableId) return;

      const item = cart.items[itemIndex];
      if (!item || !item.id) {
        setError('Cart item not found');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // ✅ Use server ID directly - no N+1 query, no race condition!
        await ApiClient.delete(`/qr/cart/items/${item.id}`);

        await fetchCart();
      } catch (err) {
        console.error('Error removing from cart:', err);
        setError(
          err instanceof ApiClientError
            ? err.message
            : 'Network error. Please try again.'
        );
      } finally {
        setLoading(false);
      }
    },
    [tableId, cart.items, fetchCart]
  );

  /**
   * Clear cart (remove all items)
   *
   * Clears all items from the cart on both server and client.
   * Used when user clicks "Clear All" or when starting a new order.
   *
   * @see CLAUDE.md - Async Operations, Error Handling
   */
  const clearCart = useCallback(async () => {
    if (!tableId) {
      console.warn('[clearCart] No tableId provided');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      console.log(
        '[clearCart] Clearing cart for tableId:',
        tableId,
        'sessionId:',
        sessionId
      );

      // Call API to clear cart on server
      const queryParams = new URLSearchParams();
      if (sessionId) {
        queryParams.append('sessionId', sessionId);
      }

      await ApiClient.delete(
        `/qr/cart/${tableId}/clear?${queryParams.toString()}`
      );

      // Clear local state
      setCart({
        items: [],
        subtotal: 0,
        taxAmount: 0,
        serviceCharge: 0,
        totalAmount: 0,
      });

      console.log('[clearCart] Cart cleared successfully');
    } catch (err) {
      console.error('[clearCart] Error clearing cart:', err);
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to clear cart. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [tableId, sessionId]);

  /**
   * Reset session (clear both state and localStorage)
   *
   * Called when user starts a new order after completing a previous one.
   * Ensures the hook doesn't try to reuse an ended session.
   *
   * @see CLAUDE.md - State Management, Browser API Safety
   */
  const resetSession = useCallback(() => {
    try {
      // Clear state
      setSessionId(null);

      // Clear localStorage
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
      }

      console.log(
        '[useServerCart] Session reset - cleared state and localStorage'
      );
    } catch (error) {
      console.warn('[useServerCart] Failed to reset session:', error);
    }
  }, []);

  // Get total item count
  const getItemCount = useCallback(() => {
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart.items]);

  // Initialize: Fetch cart once on mount (or when sessionId changes?)
  // We need to fetch once tableId is ready. SessionId might be loaded later from effect.
  useEffect(() => {
    if (tableId) {
      fetchCart();
    }
    // No cleanup needed - no polling
  }, [tableId, fetchCart]); // fetchCart depends on sessionId, so this updates when sessionId loads

  return {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    resetSession,
    getItemCount,
    loading,
    error,
    refreshCart: fetchCart,
    sessionId, // Add sessionId to return
  };
}
