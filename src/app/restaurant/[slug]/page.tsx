'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MenuCategory } from '@/types/menu';
import { useCart } from '@/hooks/useCart';
import { MenuCard } from '@/components/menu/MenuCard';
import { CartSummary } from '@/components/cart/CartSummary';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  address?: string;
  phone?: string;
  email?: string;
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  businessType: string;
}

export default function RestaurantMenuPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [showCart, setShowCart] = useState(false);

  const {
    cart,
    addToCart,
    updateCartItem,
    removeFromCart,
    getItemCount,
  } = useCart(
    restaurant?.taxRate || 0.085,
    restaurant?.serviceChargeRate || 0.12
  );

  useEffect(() => {
    if (slug) {
      fetchRestaurantAndMenu();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const fetchRestaurantAndMenu = async () => {
    try {
      // Fetch restaurant information by slug
      const restaurantResponse = await fetch(`/api/restaurants/${slug}/public`);
      const restaurantData = await restaurantResponse.json();

      if (!restaurantResponse.ok) {
        setError(restaurantData.error || 'Restaurant not found');
        return;
      }

      setRestaurant(restaurantData.restaurant);

      // Fetch menu
      const menuResponse = await fetch(`/api/menu/${restaurantData.restaurant.id}`);
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-800">Loading menu...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-6">
          <AlertTriangle className="h-16 w-16 text-red-600 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Restaurant Not Found</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <Button onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
            <Link href="/" className="block">
              <Button variant="outline" className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!restaurant || menu.length === 0) {
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {restaurant.name}
              </h1>
              {restaurant.address && (
                <p className="text-sm text-gray-600">
                  {restaurant.address}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/login" className="hidden sm:block">
                <Button variant="outline" size="sm">
                  Staff Login
                </Button>
              </Link>
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
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {category.name}
                    <span className="text-xs text-gray-600 block">
                      {category.menuItems.length} items
                    </span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {showCart ? (
              <CartSummary
                cart={cart}
                onUpdateItem={updateCartItem}
                onRemoveItem={removeFromCart}
                onCheckout={() => {
                  // For now, just show a message about needing to scan QR code for full ordering
                  alert('To place an order, please scan the QR code at your table.');
                }}
              />
            ) : (
              <div>
                {activeMenuCategory && (
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                      {activeMenuCategory.name}
                    </h2>
                    {activeMenuCategory.description && (
                      <p className="text-gray-700">
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
                    <p className="text-gray-700">
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
      {getItemCount() > 0 && !showCart && (
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

      {/* Notice Banner */}
      {getItemCount() > 0 && (
        <div className="fixed bottom-20 left-4 right-4 lg:left-auto lg:right-4 lg:w-80">
          <div className="bg-blue-600 text-white p-4 rounded-lg shadow-lg">
            <p className="text-sm">
              💡 <strong>Note:</strong> To place orders, scan the QR code at your table for the full experience!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}