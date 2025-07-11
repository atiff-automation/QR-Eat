'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MenuCategory, Table } from '@/types/menu';
import { OrderResponse } from '@/types/order';
import { useCart } from '@/hooks/useCart';
import { MenuCard } from '@/components/menu/MenuCard';
import { CartSummary } from '@/components/cart/CartSummary';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { OrderConfirmation } from '@/components/order/OrderConfirmation';
import { Button } from '@/components/ui/Button';

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

  const {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    getItemCount,
    clearCart,
  } = useCart(
    table?.restaurant.taxRate || 0.085,
    table?.restaurant.serviceChargeRate || 0.12
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
      const tableResponse = await fetch(`/api/qr/${token}`);
      const tableData = await tableResponse.json();

      if (!tableResponse.ok) {
        setError(tableData.error || 'Failed to load table information');
        return;
      }

      setTable(tableData.table);

      // Fetch menu
      const menuResponse = await fetch(
        `/api/menu/${tableData.table.restaurant.id}`
      );
      const menuData = await menuResponse.json();

      if (!menuResponse.ok) {
        setError(menuData.error || 'Failed to load menu');
        return;
      }

      setMenu(menuData.menu);

      // Set first category as active
      if (menuData.menu.length > 0) {
        setActiveCategory(menuData.menu[0].id);
      }
    } catch {
      setError('Network error. Please try again.');
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">⚠️</div>
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
          <p className="text-gray-600">No menu available</p>
        </div>
      </div>
    );
  }

  const activeMenuCategory = menu.find((cat) => cat.id === activeCategory);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {table.restaurant.name}
              </h1>
              <p className="text-sm text-gray-600">
                Table {table.tableNumber}
                {table.tableName && ` - ${table.tableName}`}
              </p>
            </div>
            <Button
              onClick={() => setShowCart(!showCart)}
              variant="outline"
              className="relative"
            >
              Cart ({getItemCount()})
              {getItemCount() > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {getItemCount()}
                </span>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Menu Categories Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-4 sticky top-24">
              <h2 className="font-semibold text-gray-900 mb-3">Categories</h2>
              <nav className="space-y-1">
                {menu.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setActiveCategory(category.id);
                      setShowCart(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      activeCategory === category.id
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {category.name}
                    <span className="text-xs text-gray-400 block">
                      {category.menuItems.length} items
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {currentOrder ? (
              <OrderConfirmation
                order={currentOrder}
                onNewOrder={handleNewOrder}
              />
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
              />
            ) : (
              <div>
                {activeMenuCategory && (
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {activeMenuCategory.name}
                    </h2>
                    {activeMenuCategory.description && (
                      <p className="text-gray-600">
                        {activeMenuCategory.description}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeMenuCategory?.menuItems.map((item) => (
                    <MenuCard
                      key={item.id}
                      item={item}
                      onAddToCart={addToCart}
                    />
                  ))}
                </div>

                {activeMenuCategory?.menuItems.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-500">
                      No items available in this category
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Cart Button */}
      {getItemCount() > 0 && !showCart && !showCheckout && !currentOrder && (
        <div className="fixed bottom-4 right-4 lg:hidden">
          <Button
            onClick={() => setShowCart(true)}
            size="lg"
            className="rounded-full shadow-lg"
          >
            View Cart ({getItemCount()})
          </Button>
        </div>
      )}
    </div>
  );
}
