'use client';

import { useState, useEffect, useMemo } from 'react';
import { formatPrice } from '@/lib/qr-utils';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { OrderCard, OrderSummary } from './shared/OrderCard';
import { Search } from 'lucide-react';

interface OrderStats {
  totalOrders: number;
  pendingOrders: number;
  confirmedOrders: number;
  preparingOrders: number;
  readyOrders: number;
  servedOrders: number;
  cancelledOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
}

export function OrdersOverview() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleRealTimeUpdate = (data: {
    type: string;
    data: Record<string, unknown>;
  }) => {
    console.log('Real-time update received:', data);

    switch (data.type) {
      case 'order_status_changed':
        console.log(
          'Dashboard updating order status:',
          data.data.orderId,
          'from',
          data.data.oldStatus,
          'to',
          data.data.newStatus
        );

        setOrders((prevOrders) => {
          const updated = prevOrders.map((order) => {
            if (order.id === (data.data.orderId as string)) {
              console.log('Found order to update:', order.orderNumber);
              return { ...order, status: data.data.newStatus as string };
            }
            return order;
          });

          const foundOrder = prevOrders.find(
            (order) => order.id === (data.data.orderId as string)
          );
          if (!foundOrder) {
            console.log('Order not found in current list, refreshing...');
            fetchOrders();
            return prevOrders;
          }

          return updated;
        });

        fetchStats();
        break;

      case 'order_created':
        console.log('New order created, refreshing dashboard orders...');
        fetchOrders();
        fetchStats();
        break;

      case 'restaurant_notification':
        console.log('Restaurant notification:', data.data.message);
        break;

      case 'kitchen_notification':
        console.log('Kitchen notification:', data.data.message);
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

      const data = await ApiClient.get<{
        success: boolean;
        orders: OrderSummary[];
      }>('/orders', { params });

      setOrders(data.orders);
    } catch (error) {
      console.error('Failed to fetch orders:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    }
  };

  const fetchStats = async () => {
    try {
      const data = await ApiClient.get<{ success: boolean; stats: OrderStats }>(
        '/orders/stats'
      );

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
      await Promise.all([fetchOrders(), fetchStats()]);
      setError('');
    } catch (error) {
      console.error('Failed to update order status:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;

    const query = searchQuery.toLowerCase();
    return orders.filter(
      (order) =>
        order.orderNumber.toLowerCase().includes(query) ||
        order.table.tableNumber.toLowerCase().includes(query) ||
        order.table.tableName?.toLowerCase().includes(query) ||
        order.customerSession?.customerName?.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  // Sort orders by priority (pending first) and creation time
  const sortedOrders = useMemo(() => {
    const statusPriority: Record<string, number> = {
      pending: 1,
      confirmed: 2,
      preparing: 3,
      ready: 4,
      served: 5,
    };

    return [...filteredOrders].sort((a, b) => {
      // First, sort by status priority (pending orders first)
      const priorityDiff =
        (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
      if (priorityDiff !== 0) return priorityDiff;

      // Within same status, sort by creation time (oldest first - FIFO)
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [filteredOrders]);

  const filterOptions = [
    { value: 'all', label: 'All Orders' },
    { value: 'pending', label: 'Pending' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'preparing', label: 'Preparing' },
    { value: 'ready', label: 'Ready' },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="animate-pulse">
          <div className="bg-gray-200 h-10 rounded-lg mb-3"></div>
          <div className="bg-gray-200 h-12 rounded-lg mb-3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-200 h-32 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Compact Metrics with Search Button */}
      {stats && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* Metrics */}
            <div className="flex items-center gap-x-2 text-sm">
              {/* Active Orders - Blue */}
              <div className="flex items-center gap-1 whitespace-nowrap">
                <span className="font-bold text-blue-600 text-base">
                  {stats.pendingOrders +
                    stats.confirmedOrders +
                    stats.preparingOrders +
                    stats.readyOrders}
                </span>
                <span className="text-gray-600">Active</span>
              </div>

              <span className="text-gray-300">•</span>

              {/* Pending Orders - Orange */}
              <div className="flex items-center gap-1 whitespace-nowrap">
                <span className="font-bold text-orange-600 text-base">
                  {stats.pendingOrders}
                </span>
                <span className="text-gray-600">Pending</span>
              </div>

              <span className="text-gray-300">•</span>

              {/* Revenue - Green */}
              <div className="flex items-center gap-1 whitespace-nowrap">
                <span className="font-bold text-green-600 text-base">
                  {formatPrice(stats.totalRevenue)}
                </span>
                <span className="text-gray-600">Today</span>
              </div>
            </div>

            {/* Search Icon Button */}
            <button
              onClick={() => setShowSearchModal(true)}
              className="flex-shrink-0 p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Search and filter orders"
            >
              <Search className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Search & Filter
              </h2>
              <button
                onClick={() => setShowSearchModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5 text-gray-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4">
              {/* Search Input */}
              <div>
                <label
                  htmlFor="modal-search"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Search Orders
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    id="modal-search"
                    type="text"
                    placeholder="Order #, table, or customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Filter by Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Status
                </label>
                <div className="space-y-2">
                  {filterOptions.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="status-filter"
                        value={option.value}
                        checked={filter === option.value}
                        onChange={(e) => setFilter(e.target.value)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Results Count */}
              {(searchQuery || filter !== 'all') && (
                <div className="pt-2 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    {sortedOrders.length}{' '}
                    {sortedOrders.length === 1 ? 'order' : 'orders'} found
                  </p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => {
                  setSearchQuery('');
                  setFilter('all');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Clear All
              </button>
              <button
                onClick={() => setShowSearchModal(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {sortedOrders.length > 0 ? (
        <div className="grid grid-cols-1 gap-3">
          {sortedOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusUpdate={updateOrderStatus}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No orders found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery
                ? `No orders match "${searchQuery}"`
                : filter !== 'all'
                  ? `No ${filter} orders at the moment.`
                  : 'No orders have been placed yet.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
