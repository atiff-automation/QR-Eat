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
    error: cartError,
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
    clearCart();
  };

  const handleNewOrder = () => {
    setCurrentOrder(null);
    setShowCheckout(false);
    setShowCart(false);
  };

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

  const activeMenuCategory = menu.find((cat) => cat.id === activeCategory);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Mobile-First Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">
                {table.restaurant.name}
              </h1>
              <p className="text-sm text-gray-600">
                Table {table.tableNumber}
                {table.tableName && ` - ${table.tableName}`}
              </p>
            </div>
            <SearchBar menu={menu} />
          </div>
        </div>
      </header>

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

      <div className="max-w-7xl mx-auto px-4 py-4">
        {currentOrder ? (
          <OrderConfirmation order={currentOrder} onNewOrder={handleNewOrder} />
        ) : showCheckout ? (
          <CheckoutForm
            cart={cart}
            tableId={table.id}
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
          />
        ) : (
          <div>
            {/* Category Dropdown */}
            <div className="mb-4">
              <CategoryDropdown
                categories={menu}
                activeCategory={activeCategory}
                onSelectCategory={(categoryId) => {
                  setActiveCategory(categoryId);
                  setShowCart(false);
                }}
              />
            </div>

            {/* Category Title */}
            {activeMenuCategory && (
              <div className="mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  {activeMenuCategory.name}
                </h2>
                {activeMenuCategory.description && (
                  <p className="text-gray-600 mt-1">
                    {activeMenuCategory.description}
                  </p>
                )}
              </div>
            )}

            {/* Menu Items - Mobile-First Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {activeMenuCategory?.menuItems.map((item) => (
                <MenuCard
                  key={item.id}
                  item={item}
                  onAddToCart={addToCart}
                  onModalStateChange={setIsAnyModalOpen}
                />
              ))}
            </div>

            {activeMenuCategory?.menuItems.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-700">
                  No items available in this category
                </p>
              </div>
            )}
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
