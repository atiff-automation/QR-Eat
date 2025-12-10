'use client';

import { useState, useEffect } from 'react';
import { getOrderStatusDisplay } from '@/lib/order-utils';
import { formatPrice } from '@/lib/qr-utils';
import { ClipboardList, Clock, ChefHat, DollarSign } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
  estimatedReadyTime?: string;
  table: {
    tableNumber: string;
    tableName?: string;
  };
  customerSession?: {
    customerName?: string;
    customerPhone?: string;
  };
  items: {
    id: string;
    quantity: number;
    menuItem: {
      name: string;
    };
  }[];
}

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  preparingOrders: number;
  readyOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
}

export function OrdersOverview() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const handleRealTimeUpdate = (data: { type: string; data: Record<string, unknown> }) => {
    console.log('Real-time update received:', data);
    
    switch (data.type) {
      case 'order_status_changed':
        console.log('Dashboard updating order status:', data.data.orderId, 'from', data.data.oldStatus, 'to', data.data.newStatus);
        
        // Update specific order status
        setOrders(prevOrders => {
          const updated = prevOrders.map(order => {
            if (order.id === data.data.orderId) {
              console.log('Found order to update:', order.orderNumber);
              return { ...order, status: data.data.newStatus };
            }
            return order;
          });
          
          // If order not found in current list, refresh orders
          const foundOrder = prevOrders.find(order => order.id === data.data.orderId);
          if (!foundOrder) {
            console.log('Order not found in current list, refreshing...');
            fetchOrders();
            return prevOrders;
          }
          
          return updated;
        });
        
        // Refresh stats to get updated counts
        fetchStats();
        break;
        
      case 'order_created':
        // Add new order to the list and refresh stats
        console.log('New order created, refreshing dashboard orders...');
        fetchOrders();
        fetchStats();
        break;
        
      case 'restaurant_notification':
        console.log('Restaurant notification:', data.data.message);
        // Could show toast notification here
        break;
        
      case 'kitchen_notification':
        console.log('Kitchen notification:', data.data.message);
        // These are meant for kitchen display
        break;
        
      case 'connection':
        console.log('SSE connection established:', data.data.message);
        break;
        
      default:
        console.log('Unknown event type:', data.type);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchStats();
    
    // Set up Server-Sent Events for real-time updates
    const eventSource = new EventSource('/api/events/orders');
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleRealTimeUpdate(data);
      } catch (error) {
        console.error('Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      // Fallback to polling if SSE fails
      const fallbackInterval = setInterval(() => {
        fetchOrders();
        fetchStats();
      }, 15000);
      
      return () => clearInterval(fallbackInterval);
    };

    eventSource.onopen = () => {
      console.log('SSE connection established');
    };

    return () => {
      eventSource.close();
    };
  }, [filter]);

  const fetchOrders = async () => {
    try {
      const params: Record<string, string> = {};
      if (filter !== 'all') {
        params.status = filter;
      }
      params.limit = '20';

      const data = await ApiClient.get<{ success: boolean; orders: OrderSummary[] }>('/orders', { params });

      setOrders(data.orders);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setError(error instanceof ApiClientError ? error.message : 'Network error. Please try again.');
    }
  };

  const fetchStats = async () => {
    try {
      const data = await ApiClient.get<{ success: boolean; stats: OrderStats }>('/orders/stats');

      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await ApiClient.patch(`/orders/${orderId}/status`, { status: newStatus });

      // Immediately refresh orders and stats for responsive updates
      await Promise.all([fetchOrders(), fetchStats()]);
      setError(''); // Clear any previous errors
    } catch (error) {
      console.error('Failed to update order status:', error);
      setError(error instanceof ApiClientError ? error.message : 'Network error. Please try again.');
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All Orders' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'preparing', label: 'Preparing' },
    { value: 'ready', label: 'Ready' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-gray-200 h-24 rounded-lg"></div>
            ))}
          </div>
          <div className="bg-gray-200 h-96 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-700">Total Orders</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalOrders}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                  <Clock className="h-4 w-4 text-yellow-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Pending</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.pendingOrders}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                  <ChefHat className="h-4 w-4 text-orange-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Preparing</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.preparingOrders}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                  <DollarSign className="h-4 w-4 text-green-600" />
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Revenue</p>
                <p className="text-2xl font-semibold text-gray-900">{formatPrice(stats.totalRevenue)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="bg-white shadow-sm rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-medium text-gray-900">Recent Orders</h3>
            <div className="mt-3 sm:mt-0">
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="block w-full sm:w-auto pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-md"
              >
                {filterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-6 py-4 bg-red-50 border-b border-red-200">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Table
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {orders.map((order) => {
                const statusDisplay = getOrderStatusDisplay(order.status);
                return (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {order.orderNumber}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(order.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        Table {order.table.tableNumber}
                        {order.table.tableName && (
                          <div className="text-sm text-gray-500">{order.table.tableName}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {order.customerSession?.customerName || 'Walk-in'}
                      </div>
                      {order.customerSession?.customerPhone && (
                        <div className="text-sm text-gray-500">
                          {order.customerSession.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {order.items.slice(0, 2).map((item) => (
                          <div key={item.id}>
                            {item.quantity}× {item.menuItem.name}
                          </div>
                        ))}
                        {order.items.length > 2 && (
                          <div className="text-sm text-gray-500">
                            +{order.items.length - 2} more items
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusDisplay.color}`}>
                        {statusDisplay.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex space-x-2">
                        {order.status === 'pending' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'confirmed')}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Confirm
                          </button>
                        )}
                        {order.status === 'confirmed' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                            className="text-orange-600 hover:text-orange-900"
                          >
                            Start
                          </button>
                        )}
                        {order.status === 'preparing' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'ready')}
                            className="text-green-600 hover:text-green-900"
                          >
                            Ready
                          </button>
                        )}
                        {order.status === 'ready' && (
                          <button
                            onClick={() => updateOrderStatus(order.id, 'served')}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Served
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {orders.length === 0 && !loading && (
            <div className="text-center py-12">
              <p className="text-gray-500">No orders found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}