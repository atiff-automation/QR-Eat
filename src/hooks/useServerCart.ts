/**
 * Server-Side Cart Hook
 *
 * Manages cart state with server-side persistence via table sessions.
 * Includes automatic polling for multi-device cart synchronization.
 *
 * @see CLAUDE.md - DRY, Single Responsibility, Error Handling
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Cart, MenuItem, MenuItemVariation } from '@/types/menu';

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
}

// Polling interval for multi-device sync (10 seconds)
const POLL_INTERVAL_MS = 10000;

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
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

    try {
      const response = await fetch(`/api/qr/cart/${tableId}`);
      const data = await response.json();

      if (response.ok) {
        const serverCart: ServerCart = data.cart;
        const totals = calculateTotals(serverCart);

        // Convert server cart items to client cart format
        const clientItems = serverCart.items.map((item) => ({
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

        setCart({
          items: clientItems,
          ...totals,
        });
        setError(null);
      } else {
        setError(data.error || 'Failed to load cart');
      }
    } catch (err) {
      console.error('Error fetching cart:', err);
      setError('Network error. Please try again.');
    }
  }, [tableId, calculateTotals]);

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

      setLoading(true);
      setError(null);

      try {
        const variationId =
          selectedVariations.length > 0
            ? selectedVariations[0].variationId
            : undefined;

        const response = await fetch('/api/qr/cart/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableId,
            menuItemId: menuItem.id,
            variationId,
            quantity,
            unitPrice: menuItem.price,
            specialInstructions,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          // Refresh cart to get updated state
          await fetchCart();
        } else {
          setError(data.error || 'Failed to add item to cart');
        }
      } catch (err) {
        console.error('Error adding to cart:', err);
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [tableId, fetchCart]
  );

  // Update cart item
  const updateCartItem = useCallback(
    async (
      itemIndex: number,
      updates: { quantity?: number; specialInstructions?: string }
    ) => {
      if (!tableId) return;

      const item = cart.items[itemIndex];
      if (!item) return;

      // Get the server cart item ID (we need to store this)
      // For now, we'll fetch the cart and match by menuItemId and variation
      setLoading(true);
      setError(null);

      try {
        // First, fetch current cart to get item IDs
        const cartResponse = await fetch(`/api/qr/cart/${tableId}`);
        const cartData = await cartResponse.json();

        if (!cartResponse.ok) {
          setError('Failed to update cart');
          return;
        }

        const serverCart: ServerCart = cartData.cart;
        const serverItem = serverCart.items[itemIndex];

        if (!serverItem) {
          setError('Cart item not found');
          return;
        }

        const response = await fetch(`/api/qr/cart/${serverItem.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantity: updates.quantity ?? item.quantity,
            specialInstructions: updates.specialInstructions,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          await fetchCart();
        } else {
          setError(data.error || 'Failed to update cart item');
        }
      } catch (err) {
        console.error('Error updating cart item:', err);
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [tableId, cart.items, fetchCart]
  );

  // Remove item from cart
  const removeFromCart = useCallback(
    async (itemIndex: number) => {
      if (!tableId) return;

      setLoading(true);
      setError(null);

      try {
        // Fetch current cart to get item ID
        const cartResponse = await fetch(`/api/qr/cart/${tableId}`);
        const cartData = await cartResponse.json();

        if (!cartResponse.ok) {
          setError('Failed to remove item');
          return;
        }

        const serverCart: ServerCart = cartData.cart;
        const serverItem = serverCart.items[itemIndex];

        if (!serverItem) {
          setError('Cart item not found');
          return;
        }

        const response = await fetch(`/api/qr/cart/${serverItem.id}`, {
          method: 'DELETE',
        });

        const data = await response.json();

        if (response.ok) {
          await fetchCart();
        } else {
          setError(data.error || 'Failed to remove cart item');
        }
      } catch (err) {
        console.error('Error removing from cart:', err);
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [tableId, fetchCart]
  );

  // Clear cart (already handled by order creation)
  const clearCart = useCallback(() => {
    setCart({
      items: [],
      subtotal: 0,
      taxAmount: 0,
      serviceCharge: 0,
      totalAmount: 0,
    });
  }, []);

  // Get total item count
  const getItemCount = useCallback(() => {
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart.items]);

  // Initialize: Fetch cart and start polling
  useEffect(() => {
    if (tableId) {
      fetchCart();

      // Start polling for multi-device sync
      pollIntervalRef.current = setInterval(() => {
        fetchCart();
      }, POLL_INTERVAL_MS);
    }

    // Cleanup on unmount
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [tableId, fetchCart]);

  return {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    getItemCount,
    loading,
    error,
    refreshCart: fetchCart,
  };
}
