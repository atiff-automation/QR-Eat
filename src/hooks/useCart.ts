'use client';

import { useState, useCallback } from 'react';
import { CartItem, Cart, MenuItem, VariationOption } from '@/types/menu';

export function useCart(taxRate: number, serviceChargeRate: number) {
  const [cart, setCart] = useState<Cart>({
    items: [],
    subtotal: 0,
    taxAmount: 0,
    serviceCharge: 0,
    totalAmount: 0,
  });

  const calculateCartTotals = useCallback(
    (items: CartItem[]) => {
      const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
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

  const addToCart = useCallback(
    (
      menuItem: MenuItem,
      quantity: number = 1,
      selectedOptions: VariationOption[] = [],
      specialInstructions?: string
    ) => {
      setCart((prevCart) => {
        // Check if exact same item with same variations exists
        const existingItemIndex = prevCart.items.findIndex(
          (item) =>
            item.menuItemId === menuItem.id &&
            item.specialInstructions === specialInstructions &&
            JSON.stringify(item.selectedOptions.map((o) => o.id).sort()) ===
              JSON.stringify(selectedOptions.map((o) => o.id).sort())
        );

        let newItems: CartItem[];

        // Calculate unit price based on base price + sum of options
        const optionsTotal = selectedOptions.reduce(
          (sum, opt) => sum + opt.priceModifier,
          0
        );
        const unitPrice = menuItem.price + optionsTotal;

        if (existingItemIndex >= 0) {
          // Update existing item quantity
          newItems = [...prevCart.items];
          const existingItem = newItems[existingItemIndex];
          const newQuantity = existingItem.quantity + quantity;

          newItems[existingItemIndex] = {
            ...existingItem,
            quantity: newQuantity,
            totalPrice: Math.round(unitPrice * newQuantity * 100) / 100,
          };
        } else {
          // Add new item
          const totalPrice = Math.round(unitPrice * quantity * 100) / 100;

          const newItem: CartItem = {
            menuItemId: menuItem.id,
            menuItem,
            quantity,
            selectedOptions,
            specialInstructions,
            unitPrice: Math.round(unitPrice * 100) / 100,
            totalPrice,
          };

          newItems = [...prevCart.items, newItem];
        }

        const totals = calculateCartTotals(newItems);

        return {
          items: newItems,
          ...totals,
        };
      });
    },
    [calculateCartTotals]
  );

  const updateCartItem = useCallback(
    (
      itemIndex: number,
      updates: Partial<Pick<CartItem, 'quantity' | 'specialInstructions'>>
    ) => {
      setCart((prevCart) => {
        const newItems = [...prevCart.items];
        const item = newItems[itemIndex];

        if (!item) return prevCart;

        const updatedQuantity = updates.quantity ?? item.quantity;

        if (updatedQuantity <= 0) {
          // Remove item if quantity is 0 or less
          newItems.splice(itemIndex, 1);
        } else {
          // Update item
          newItems[itemIndex] = {
            ...item,
            quantity: updatedQuantity,
            specialInstructions:
              updates.specialInstructions ?? item.specialInstructions,
            totalPrice:
              Math.round(item.unitPrice * updatedQuantity * 100) / 100,
          };
        }

        const totals = calculateCartTotals(newItems);

        return {
          items: newItems,
          ...totals,
        };
      });
    },
    [calculateCartTotals]
  );

  const removeFromCart = useCallback(
    (itemIndex: number) => {
      setCart((prevCart) => {
        const newItems = [...prevCart.items];
        newItems.splice(itemIndex, 1);

        const totals = calculateCartTotals(newItems);

        return {
          items: newItems,
          ...totals,
        };
      });
    },
    [calculateCartTotals]
  );

  const clearCart = useCallback(() => {
    setCart({
      items: [],
      subtotal: 0,
      taxAmount: 0,
      serviceCharge: 0,
      totalAmount: 0,
    });
  }, []);

  const getItemCount = useCallback(() => {
    return cart.items.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart.items]);

  return {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    getItemCount,
  };
}
