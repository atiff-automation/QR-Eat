'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MenuCategory, Table } from '@/types/menu';
import { OrderResponse } from '@/types/order';
import { useServerCart } from '@/hooks/useServerCart';
import { MenuCard } from '@/components/menu/MenuCard';
import { CartSummary } from '@/components/cart/CartSummary';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { OrderConfirmation } from '@/components/order/OrderConfirmation';
import { FloatingCartBar } from '@/components/cart/FloatingCartBar';
import { CategoryDropdown } from '@/components/menu/CategoryDropdown';
import { SearchBar } from '@/components/menu/SearchBar';
import { Button } from '@/components/ui/Button';
import { AlertTriangle } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

export default function QRMenuPage() {
  const params = useParams();
  const token = params.token as string;

  const [table, setTable] = useState<Table | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<OrderResponse | null>(null);
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false);

  const {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    resetSession,
    error: cartError,
    sessionId,
  } = useServerCart(
    table?.id || null,
    table?.restaurant.taxRate
      ? parseFloat(table.restaurant.taxRate.toString())
      : 0.085,
    table?.restaurant.serviceChargeRate
      ? parseFloat(table.restaurant.serviceChargeRate.toString())
      : 0.12
  );

  useEffect(() => {
    if (token) {
      fetchTableAndMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const fetchTableAndMenu = async () => {
    try {
      // Fetch table information
      const tableResponse = await ApiClient.get<{ table: Table }>(
        `/api/qr/${token}`
      );
      setTable(tableResponse.table);

      // Fetch menu
      const menuResponse = await ApiClient.get<{ menu: MenuCategory[] }>(
        `/api/menu/${tableResponse.table.restaurant.id}`
      );
      setMenu(menuResponse.menu);

      // Set first category as active
      if (menuResponse.menu.length > 0) {
        setActiveCategory(menuResponse.menu[0].id);
      }
    } catch (error) {
      console.error('[QR Menu] Failed to fetch table and menu:', error);
      if (error instanceof ApiClientError) {
        setError(error.message || 'Failed to load menu');
      } else {
        setError('Network error. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = () => {
    setShowCheckout(true);
    setShowCart(false);
  };

  const handleOrderCreate = (order: OrderResponse) => {
    setCurrentOrder(order);
    setShowCheckout(false);
    // Cart is already cleared by the backend during order creation
    // No need to call clearCart() here to avoid 404 error
  };

  const handleNewOrder = () => {
    resetSession(); // Clear session state and localStorage
    setCurrentOrder(null);
    setShowCheckout(false);
    setShowCart(false);
  };

  const handleClearAll = async () => {
    await clearCart();
    // Navigation handled automatically by useEffect when cart becomes empty
  };

  // Auto-navigate to menu when cart becomes empty
  useEffect(() => {
    if (showCart && cart.items.length === 0) {
      console.log('[QRMenuPage] Cart is empty, navigating to menu');
      setShowCart(false);
    }
  }, [cart.items.length, showCart]);

  // Auto-update active category based on scroll position
  useEffect(() => {
    // Only run on menu view (not cart/checkout/order confirmation)
    if (showCart || showCheckout || currentOrder) return;

    // Create Intersection Observer to track visible category sections
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the category section that's most visible
        let maxRatio = 0;
        let mostVisibleCategory = '';

        entries.forEach((entry) => {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisibleCategory = entry.target.id;
          }
        });

        // Update active category if we found a visible one
        // Only update if at least 30% of section is visible (prevents flickering)
        if (mostVisibleCategory && maxRatio > 0.3) {
          setActiveCategory(mostVisibleCategory);
        }
      },
      {
        // Trigger when 30%, 50%, 70%, or 100% of section is visible
        threshold: [0, 0.3, 0.5, 0.7, 1],
        // Offset from top (account for sticky header) and bottom (focus on upper viewport)
        rootMargin: '-100px 0px -50% 0px',
      }
    );

    // Observe all category sections
    menu.forEach((category) => {
      const element = document.getElementById(category.id);
      if (element) {
        observer.observe(element);
      }
    });

    // Cleanup: disconnect observer when component unmounts or dependencies change
    return () => observer.disconnect();
  }, [menu, showCart, showCheckout, currentOrder]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto mb-4"></div>
          <p className="text-gray-800">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 text-red-600 mx-auto mb-4" />
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (!table || menu.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-800">No menu available</p>
        </div>
      </div>
    );
  }

  // All categories are now displayed - no filtering needed

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Conditional Menu Header (Restaurant Info & Search) */}
      {!showCart && !showCheckout && !currentOrder && (
        <>
          {/* Restaurant Identity - Scrolls Away */}
          <div className="bg-white pb-2 relative z-30">
            {/* Powered by QR-Eat & Table Number - Top Bar */}
            <div className="flex justify-between items-center px-4 pt-3 pb-2 text-xs font-medium text-gray-500 border-b border-gray-50">
              <div className="flex items-center space-x-1">
                <span>Powered by</span>
                <span className="text-orange-500 font-bold">QR-Eat</span>
              </div>
              <div className="bg-gray-100 px-3 py-1 rounded-full text-gray-700 font-semibold">
                Table {table.tableNumber}
              </div>
            </div>

            {/* Restaurant Name */}
            <div className="text-center px-6 pt-6 pb-6">
              <h1 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">
                {table.restaurant.name}
              </h1>
              <p className="text-xs text-gray-500 uppercase tracking-widest font-semibold">
                Authentic Italian Cuisine
              </p>
            </div>
          </div>

          {/* Category & Search Bar - Sticky */}
          <div className="sticky top-0 z-40 bg-white px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <CategoryDropdown
                  categories={menu}
                  activeCategory={activeCategory}
                  onCategoryChange={(id) => {
                    setActiveCategory(id);
                    const element = document.getElementById(id);
                    if (element) {
                      element.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      });
                    }
                  }}
                  onModalStateChange={setIsAnyModalOpen}
                />
              </div>
              <SearchBar
                menu={menu}
                cart={cart}
                onAddToCart={addToCart}
                onModalStateChange={setIsAnyModalOpen}
              />
            </div>
          </div>
        </>
      )}

      {/* Cart Error Display */}
      {cartError && (
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-3 flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800">{cartError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {currentOrder ? (
          <OrderConfirmation order={currentOrder} onNewOrder={handleNewOrder} />
        ) : showCheckout ? (
          <CheckoutForm
            cart={cart}
            tableId={table.id}
            sessionId={sessionId}
            onOrderCreate={handleOrderCreate}
            onCancel={() => setShowCheckout(false)}
          />
        ) : showCart ? (
          <CartSummary
            cart={cart}
            onUpdateItem={updateCartItem}
            onRemoveItem={removeFromCart}
            onCheckout={handleCheckout}
            onBack={() => setShowCart(false)}
            onClearAll={handleClearAll}
          />
        ) : (
          <div className="space-y-8">
            {/* Render ALL categories */}
            {menu.map((category) => (
              <section
                key={category.id}
                id={category.id}
                className="scroll-mt-16"
              >
                {/* Category Header */}
                <div className="mb-3">
                  <h2 className="text-xl font-bold text-gray-900">
                    {category.name}
                  </h2>
                  {category.description && (
                    <p className="text-gray-600 text-sm mt-0.5">
                      {category.description}
                    </p>
                  )}
                </div>

                {/* Menu Items Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {category.menuItems.map((item) => {
                    // Calculate total quantity of this item in cart
                    const cartQuantity = cart.items
                      .filter((cartItem) => cartItem.menuItemId === item.id)
                      .reduce((sum, cartItem) => sum + cartItem.quantity, 0);

                    return (
                      <MenuCard
                        key={item.id}
                        item={item}
                        onAddToCart={addToCart}
                        onModalStateChange={setIsAnyModalOpen}
                        cartQuantity={cartQuantity}
                      />
                    );
                  })}
                </div>

                {/* Empty State */}
                {category.menuItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No items available in this category
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart Bar - Hidden when modal is open */}
      {!showCart && !showCheckout && !currentOrder && !isAnyModalOpen && (
        <FloatingCartBar cart={cart} onReviewCart={() => setShowCart(true)} />
      )}
    </div>
  );
}
