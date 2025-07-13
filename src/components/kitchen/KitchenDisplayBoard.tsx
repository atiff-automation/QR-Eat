'use client';

import { useState, useEffect } from 'react';
import { getOrderStatusDisplay } from '@/lib/order-utils';
import { formatCurrency } from '@/lib/payment-utils';
import { ChefHat } from 'lucide-react';

interface KitchenOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  confirmedAt?: string;
  estimatedReadyTime?: string;
  specialInstructions?: string;
  table: {
    tableNumber: string;
    tableName?: string;
  };
  customerSession?: {
    customerName?: string;
  };
  items: {
    id: string;
    quantity: number;
    specialInstructions?: string;
    status: string;
    menuItem: {
      name: string;
      preparationTime: number;
    };
    variations: {
      id: string;
      quantity: number;
      variation: {
        name: string;
        variationType: string;
      };
    }[];
  }[];
}

export function KitchenDisplayBoard() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetchKitchenOrders();
    
    // Set up polling for real-time updates every 10 seconds
    const orderInterval = setInterval(fetchKitchenOrders, 10000);
    
    // Update current time every second for timing displays
    const timeInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(orderInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const fetchKitchenOrders = async () => {
    try {
      const response = await fetch('/api/kitchen/orders');
      const data = await response.json();

      if (response.ok) {
        setOrders(data.orders);
        setError('');
      } else {
        setError(data.error || 'Failed to fetch kitchen orders');
      }
    } catch (error) {
      console.error('Failed to fetch kitchen orders:', error);
      setError('Network error. Please check connection.');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        // Immediately refresh orders
        fetchKitchenOrders();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Failed to update order status:', error);
      setError('Network error. Please try again.');
    }
  };

  const updateItemStatus = async (itemId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/kitchen/items/${itemId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        fetchKitchenOrders();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update item status');
      }
    } catch (error) {
      console.error('Failed to update item status:', error);
      setError('Network error. Please try again.');
    }
  };

  const getOrderAge = (createdAt: string) => {
    const created = new Date(createdAt);
    const diffMs = currentTime.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins;
  };

  const getOrderPriority = (order: KitchenOrder) => {
    const age = getOrderAge(order.createdAt);
    const estimatedTime = order.items.reduce((max, item) => 
      Math.max(max, item.menuItem.preparationTime), 0);
    
    if (age > estimatedTime + 10) return 'urgent';
    if (age > estimatedTime) return 'warning';
    return 'normal';
  };

  const getTimeColor = (createdAt: string, estimatedTime: number) => {
    const age = getOrderAge(createdAt);
    if (age > estimatedTime + 10) return 'text-red-600 font-bold';
    if (age > estimatedTime) return 'text-orange-600 font-semibold';
    return 'text-green-600';
  };

  const groupedOrders = {
    confirmed: orders.filter(order => order.status === 'confirmed'),
    preparing: orders.filter(order => order.status === 'preparing'),
    ready: orders.filter(order => order.status === 'ready')
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading Kitchen Display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-white">Kitchen Display System</h1>
          <div className="text-right">
            <div className="text-2xl font-mono">
              {currentTime.toLocaleTimeString()}
            </div>
            <div className="text-sm text-gray-300">
              {currentTime.toLocaleDateString()}
            </div>
          </div>
        </div>
        
        {error && (
          <div className="mt-4 bg-red-600 text-white p-3 rounded-lg">
            <p>{error}</p>
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="bg-blue-800 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold">{groupedOrders.confirmed.length}</div>
            <div className="text-sm">New Orders</div>
          </div>
          <div className="bg-orange-600 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold">{groupedOrders.preparing.length}</div>
            <div className="text-sm">In Progress</div>
          </div>
          <div className="bg-green-600 p-4 rounded-lg text-center">
            <div className="text-2xl font-bold">{groupedOrders.ready.length}</div>
            <div className="text-sm">Ready</div>
          </div>
        </div>
      </div>

      {/* Order Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        {/* New Orders */}
        <div className="space-y-4">
          <div className="bg-blue-800 p-3 rounded-lg">
            <h2 className="text-xl font-bold text-center">New Orders</h2>
          </div>
          
          <div className="space-y-4 max-h-screen overflow-y-auto">
            {groupedOrders.confirmed.map((order) => {
              const priority = getOrderPriority(order);
              const estimatedTime = order.items.reduce((max, item) => 
                Math.max(max, item.menuItem.preparationTime), 0);
              
              return (
                <div
                  key={order.id}
                  className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                    priority === 'urgent' ? 'border-red-500' :
                    priority === 'warning' ? 'border-orange-500' : 'border-blue-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold">{order.orderNumber}</h3>
                      <p className="text-sm text-gray-300">
                        Table {order.table.tableNumber}
                        {order.table.tableName && ` - ${order.table.tableName}`}
                      </p>
                      {order.customerSession?.customerName && (
                        <p className="text-sm text-gray-300">
                          {order.customerSession.customerName}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-mono ${getTimeColor(order.createdAt, estimatedTime)}`}>
                        {getOrderAge(order.createdAt)}m
                      </div>
                      <div className="text-xs text-gray-400">
                        Est: {estimatedTime}m
                      </div>
                    </div>
                  </div>

                  {/* Order Items */}
                  <div className="space-y-2 mb-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="bg-gray-700 p-2 rounded">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <span className="font-medium">
                              {item.quantity}× {item.menuItem.name}
                            </span>
                            {item.variations.length > 0 && (
                              <div className="text-sm text-gray-300 mt-1">
                                {item.variations.map((variation) => (
                                  <span key={variation.id} className="mr-2">
                                    {variation.quantity}× {variation.variation.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.specialInstructions && (
                              <div className="text-sm text-yellow-300 mt-1">
                                Note: {item.specialInstructions}
                              </div>
                            )}
                          </div>
                          <div className="text-xs text-gray-400">
                            {item.menuItem.preparationTime}m
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {order.specialInstructions && (
                    <div className="bg-yellow-900 p-2 rounded mb-3">
                      <p className="text-sm text-yellow-200">
                        <strong>Special Instructions:</strong> {order.specialInstructions}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => updateOrderStatus(order.id, 'preparing')}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded font-medium"
                  >
                    Start Cooking
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* In Progress */}
        <div className="space-y-4">
          <div className="bg-orange-600 p-3 rounded-lg">
            <h2 className="text-xl font-bold text-center">In Progress</h2>
          </div>
          
          <div className="space-y-4 max-h-screen overflow-y-auto">
            {groupedOrders.preparing.map((order) => {
              const priority = getOrderPriority(order);
              const estimatedTime = order.items.reduce((max, item) => 
                Math.max(max, item.menuItem.preparationTime), 0);
              
              return (
                <div
                  key={order.id}
                  className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                    priority === 'urgent' ? 'border-red-500' :
                    priority === 'warning' ? 'border-orange-500' : 'border-orange-400'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold">{order.orderNumber}</h3>
                      <p className="text-sm text-gray-300">
                        Table {order.table.tableNumber}
                        {order.table.tableName && ` - ${order.table.tableName}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-mono ${getTimeColor(order.createdAt, estimatedTime)}`}>
                        {getOrderAge(order.createdAt)}m
                      </div>
                      <div className="text-xs text-gray-400">
                        Est: {estimatedTime}m
                      </div>
                    </div>
                  </div>

                  {/* Order Items with Individual Status */}
                  <div className="space-y-2 mb-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="bg-gray-700 p-2 rounded">
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <span className="font-medium">
                              {item.quantity}× {item.menuItem.name}
                            </span>
                            {item.variations.length > 0 && (
                              <div className="text-sm text-gray-300 mt-1">
                                {item.variations.map((variation) => (
                                  <span key={variation.id} className="mr-2">
                                    {variation.quantity}× {variation.variation.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {item.specialInstructions && (
                              <div className="text-sm text-yellow-300 mt-1">
                                Note: {item.specialInstructions}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => updateItemStatus(item.id, 'ready')}
                            className={`px-2 py-1 text-xs rounded ${
                              item.status === 'ready' 
                                ? 'bg-green-600 text-white' 
                                : 'bg-gray-600 hover:bg-green-600 text-gray-300'
                            }`}
                          >
                            {item.status === 'ready' ? '✓ Done' : 'Mark Done'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => updateOrderStatus(order.id, 'ready')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded font-medium"
                  >
                    Mark Ready
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Ready for Pickup */}
        <div className="space-y-4">
          <div className="bg-green-600 p-3 rounded-lg">
            <h2 className="text-xl font-bold text-center">Ready for Pickup</h2>
          </div>
          
          <div className="space-y-4 max-h-screen overflow-y-auto">
            {groupedOrders.ready.map((order) => {
              const age = getOrderAge(order.createdAt);
              
              return (
                <div
                  key={order.id}
                  className="bg-gray-800 rounded-lg p-4 border-l-4 border-green-500"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold">{order.orderNumber}</h3>
                      <p className="text-sm text-gray-300">
                        Table {order.table.tableNumber}
                        {order.table.tableName && ` - ${order.table.tableName}`}
                      </p>
                      {order.customerSession?.customerName && (
                        <p className="text-sm text-gray-300">
                          {order.customerSession.customerName}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-mono text-green-400">
                        READY
                      </div>
                      <div className="text-sm text-gray-400">
                        {age}m ago
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 mb-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="text-sm">
                        {item.quantity}× {item.menuItem.name}
                      </div>
                    ))}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => updateOrderStatus(order.id, 'served')}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded font-medium"
                    >
                      Mark Served
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {orders.length === 0 && !loading && (
        <div className="text-center py-12">
          <ChefHat className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-300 mb-2">Kitchen is All Clear!</h3>
          <p className="text-gray-400">No active orders to prepare</p>
        </div>
      )}
    </div>
  );
}