'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { formatPrice } from '@/lib/qr-utils';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { OrderCard, OrderSummary } from './shared/OrderCard';
import { ViewOrderDetailsModal } from './modals/ViewOrderDetailsModal';
import { ModifyOrderModal } from './modals/ModifyOrderModal';
import { CancelOrderModal } from './modals/CancelOrderModal';
import { Search, AlertTriangle, Filter } from 'lucide-react';
import { debug } from '@/lib/debug';

// Constants
const DEFAULT_ORDER_LIMIT = 50;
const UNKNOWN_STATUS_PRIORITY = 999;

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

type TimeFilter = 'today' | 'all_time';
type StatusFilter = 'active' | 'served' | 'cancelled' | 'all';

export function OrdersOverview() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [stats, setStats] = useState<OrderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter States
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [lapsedCount, setLapsedCount] = useState(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Modal states
  const [viewDetailsOrderId, setViewDetailsOrderId] = useState<string | null>(
    null
  );
  const [modifyOrder, setModifyOrder] = useState<OrderSummary | null>(null);
  const [cancelOrder, setCancelOrder] = useState<OrderSummary | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const params: Record<string, string> = {};

      // Time Filter Logic
      if (timeFilter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        params.startDate = today.toISOString();
      }

      // Status Filter Logic
      if (statusFilter === 'active') {
        params.status = 'all'; // Get all relevant, but exclude served/cancelled
        params.excludeServed = 'true';
      } else if (statusFilter === 'all') {
        params.status = 'all';
        params.excludeServed = 'false'; // Show everything
      } else {
        params.status = statusFilter; // Specific status (served, cancelled)
        if (statusFilter === 'served' || statusFilter === 'cancelled') {
          params.excludeServed = 'false'; // Ensure they are returned
        }
      }

      params.limit = DEFAULT_ORDER_LIMIT.toString();

      const data = await ApiClient.get<{
        success: boolean;
        orders: OrderSummary[];
        lapsedCount?: number;
      }>('/orders', { params });

      setOrders(data.orders);
      if (data.lapsedCount !== undefined) {
        setLapsedCount(data.lapsedCount);
      }
    } catch (error) {
      debug.error('Failed to fetch orders:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    }
  }, [timeFilter, statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const params: Record<string, string> = {};

      // Pass time filter to metrics
      if (timeFilter === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        params.startDate = today.toISOString();
      } else if (timeFilter === 'all_time') {
        params.period = 'all';
      }

      const data = await ApiClient.get<{ success: boolean; stats: OrderStats }>(
        '/orders/stats',
        { params }
      );

      setStats(data.stats);
    } catch (error) {
      debug.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  const handleRealTimeUpdate = useCallback(
    (data: { type: string; data: Record<string, unknown> }) => {
      debug.info('SSE', 'Real-time update received:', data);

      switch (data.type) {
        case 'order_status_changed':
          setOrders((prevOrders) => {
            const updated = prevOrders.map((order) => {
              if (order.id === (data.data.orderId as string)) {
                return { ...order, status: data.data.newStatus as string };
              }
              return order;
            });
            return updated;
          });
          // Refresh to ensure list consistency (e.g. order moving out of view)
          fetchOrders();
          fetchStats();
          break;

        case 'order_created':
          debug.info('Order Created', 'Refreshing dashboard orders...');
          fetchOrders();
          fetchStats();
          break;

        default:
          break;
      }
    },
    [fetchOrders, fetchStats]
  );

  useEffect(() => {
    fetchOrders();
    fetchStats();

    const eventSource = new EventSource('/api/events/orders');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleRealTimeUpdate(data);
      } catch (error) {
        debug.error('Error parsing SSE data:', error);
      }
    };

    return () => {
      eventSource.close();
    };
  }, [fetchOrders, fetchStats, handleRealTimeUpdate]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await ApiClient.patch(`/orders/${orderId}/status`, { status: newStatus });
      await Promise.all([fetchOrders(), fetchStats()]);
      setError('');
    } catch (error) {
      debug.error('Failed to update order status:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    }
  };

  // Modal handlers
  const handleViewDetails = (orderId: string) => {
    setViewDetailsOrderId(orderId);
  };

  const handleModify = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (order) setModifyOrder(order);
  };

  const handleCancel = (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (order) setCancelOrder(order);
  };

  const handleModalSuccess = async () => {
    await Promise.all([fetchOrders(), fetchStats()]);
    setError('');
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

  // Sort orders
  const sortedOrders = useMemo(() => {
    const statusPriority: Record<string, number> = {
      pending: 1,
      confirmed: 2,
      preparing: 3,
      ready: 4,
    };

    return [...filteredOrders].sort((a, b) => {
      const priorityDiff =
        (statusPriority[a.status] || UNKNOWN_STATUS_PRIORITY) -
        (statusPriority[b.status] || UNKNOWN_STATUS_PRIORITY);
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [filteredOrders]);

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
    <div className="max-w-2xl md:max-w-7xl mx-auto space-y-2">
      {/* 1. Mobile-First Header: Metrics + Toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Horizontal Metrics Bar */}
          {stats ? (
            <div className="flex-1 flex items-center gap-4 bg-white px-4 py-3 rounded-xl border border-gray-200 shadow-sm">
              {/* Active Orders */}
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold text-blue-600">
                  {stats.pendingOrders +
                    stats.confirmedOrders +
                    stats.preparingOrders +
                    stats.readyOrders}
                </span>
                <span className="text-xs text-gray-500">Active</span>
              </div>

              {/* Pending Orders */}
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold text-orange-600">
                  {stats.pendingOrders}
                </span>
                <span className="text-xs text-gray-500">Pending</span>
              </div>

              {/* Revenue with Time Label */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-base font-bold text-green-600">
                  {formatPrice(stats.totalRevenue)}
                </span>
                <span className="text-xs text-gray-500">
                  {timeFilter === 'today' ? 'Today' : 'All Time'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 h-12 bg-gray-100 rounded-xl animate-pulse" />
          )}

          {/* Right: Simple Filter Icon */}
          <button
            onClick={() => setShowSearchModal(!showSearchModal)}
            className="p-3 rounded-xl bg-white border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all shadow-sm flex-shrink-0"
          >
            <Filter className="h-5 w-5" />
          </button>
        </div>

        {/* 2. Collapsible: Search & Filters */}
        {showSearchModal && (
          <div className="bg-gray-50 p-2 rounded-xl space-y-2 animate-in fade-in slide-in-from-top-2 border border-gray-100">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            {/* Time Segment */}
            <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
              <button
                onClick={() => setTimeFilter('today')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all ${
                  timeFilter === 'today'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setTimeFilter('all_time')}
                className={`flex-1 py-1 text-xs font-semibold rounded-md transition-all ${
                  timeFilter === 'all_time'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                All Time
              </button>
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'active', label: 'Active' },
                { id: 'served', label: 'Served' },
                { id: 'cancelled', label: 'Cancelled' },
                { id: 'all', label: 'History' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id as StatusFilter)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                    statusFilter === tab.id
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. Slim Lapsed Order Warning */}
      {timeFilter === 'today' && lapsedCount > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r-lg flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-1 mx-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs font-medium text-amber-800">
              <span className="font-bold">{lapsedCount} active</span> from
              yesterday
            </p>
          </div>
          <button
            onClick={() => {
              setTimeFilter('all_time');
              setStatusFilter('active');
            }}
            className="text-xs font-bold text-amber-700 hover:text-amber-900 underline decoration-amber-300 underline-offset-2"
          >
            View
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {sortedOrders.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {sortedOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onStatusUpdate={updateOrderStatus}
              onViewDetails={handleViewDetails}
              onModify={handleModify}
              onCancel={handleCancel}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
              <Filter className="h-6 w-6 text-gray-400" />
            </div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">
              No orders found
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {timeFilter === 'today'
                ? 'No orders for today match your filter.'
                : 'No orders found in history.'}
            </p>
          </div>
        </div>
      )}
      {/* Modals */}
      {viewDetailsOrderId && (
        <ViewOrderDetailsModal
          orderId={viewDetailsOrderId}
          isOpen={!!viewDetailsOrderId}
          onClose={() => setViewDetailsOrderId(null)}
        />
      )}

      {modifyOrder && (
        <ModifyOrderModal
          order={modifyOrder}
          isOpen={!!modifyOrder}
          onClose={() => setModifyOrder(null)}
          onSuccess={handleModalSuccess}
        />
      )}

      {cancelOrder && (
        <CancelOrderModal
          order={cancelOrder}
          isOpen={!!cancelOrder}
          onClose={() => setCancelOrder(null)}
          onSuccess={handleModalSuccess}
        />
      )}
    </div>
  );
}
