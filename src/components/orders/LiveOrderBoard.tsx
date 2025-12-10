'use client';

import { useState, useEffect, useRef } from 'react';
import { User, UtensilsCrossed, Clock } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface LiveOrder {
  id: string;
  status: string;
  totalAmount: number;
  estimatedCompletion: string | null;
  timeRemaining: number | null;
  isOverdue: boolean;
  preparationProgress: number;
  table: {
    tableNumber: string;
    tableName: string;
  } | null;
  customerSession: {
    customerName: string;
    customerPhone: string;
  } | null;
  items: Array<{
    quantity: number;
    menuItem: {
      name: string;
      preparationTime: number;
      category: {
        name: string;
      };
    };
  }>;
  createdAt: string;
}

interface KitchenMetrics {
  activeOrders: Record<string, number>;
  averagePreparationTime: number;
  ordersCompletedLastHour: number;
  totalActiveOrders: number;
}

interface LiveOrderBoardProps {
  refreshInterval?: number;
}

export function LiveOrderBoard({
  refreshInterval = 30000,
}: LiveOrderBoardProps) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [metrics, setMetrics] = useState<KitchenMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Handle real-time updates from SSE
  const handleRealTimeUpdate = (data: {
    type: string;
    data: Record<string, unknown>;
  }) => {
    console.log('[LiveOrderBoard] Real-time update received:', data);

    switch (data.type) {
      case 'order_created':
        console.log('[LiveOrderBoard] New order created, refreshing...');
        fetchLiveOrders();
        break;

      case 'order_status_changed':
        console.log('[LiveOrderBoard] Order status changed:', {
          orderId: data.data.orderId,
          oldStatus: data.data.oldStatus,
          newStatus: data.data.newStatus,
        });

        // Update order in state without full refresh
        setOrders((prevOrders) => {
          const updated = prevOrders.map((order) => {
            if (order.id === data.data.orderId) {
              return { ...order, status: data.data.newStatus as string };
            }
            return order;
          });

          // If order not found or status moved out of view, refresh
          const orderFound = prevOrders.some(
            (order) => order.id === data.data.orderId
          );
          if (!orderFound) {
            fetchLiveOrders();
            return prevOrders;
          }

          return updated;
        });
        break;

      case 'order_item_status_changed':
        console.log('[LiveOrderBoard] Order item status changed:', {
          orderId: data.data.orderId,
          itemId: data.data.itemId,
          oldStatus: data.data.oldStatus,
          newStatus: data.data.newStatus,
        });
        // Refresh to get updated item statuses
        fetchLiveOrders();
        break;

      case 'kitchen_notification':
      case 'restaurant_notification':
        console.log('[LiveOrderBoard] Notification:', data.data.message);
        break;

      case 'connection':
        console.log(
          '[LiveOrderBoard] SSE connection established:',
          data.data.message
        );
        setSseConnected(true);
        break;

      default:
        console.log('[LiveOrderBoard] Unknown event type:', data.type);
    }
  };

  useEffect(() => {
    fetchLiveOrders();

    // Set up Server-Sent Events for real-time updates
    // Note: Polling fallback below ensures we catch any missed events
    console.log('[LiveOrderBoard] Establishing SSE connection...');
    const eventSource = new EventSource('/api/events/orders');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleRealTimeUpdate(data);
      } catch (error) {
        console.error('[LiveOrderBoard] Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[LiveOrderBoard] SSE connection error:', error);
      setSseConnected(false);
      // EventSource will automatically try to reconnect
    };

    eventSource.onopen = () => {
      console.log('[LiveOrderBoard] SSE connection established');
      setSseConnected(true);
    };

    // Keep polling as fallback (runs even when SSE connected for reliability)
    // Polling catches any events that SSE might have missed
    let fallbackInterval: NodeJS.Timeout | undefined;
    if (refreshInterval > 0) {
      fallbackInterval = setInterval(() => {
        if (!sseConnected) {
          console.log(
            '[LiveOrderBoard] SSE not connected, using fallback polling'
          );
        } else {
          console.log('[LiveOrderBoard] Periodic polling check (SSE backup)');
        }
        fetchLiveOrders();
      }, refreshInterval);
    }

    return () => {
      console.log('[LiveOrderBoard] Cleaning up SSE connection');
      eventSource.close();
      if (fallbackInterval) {
        clearInterval(fallbackInterval);
      }
    };
  }, [refreshInterval]);

  const fetchLiveOrders = async () => {
    try {
      const since = lastUpdate ? lastUpdate.toISOString() : undefined;

      const response = await ApiClient.get<{
        orders: LiveOrder[];
        metrics: KitchenMetrics;
        timestamp: string;
      }>('/api/orders/live', {
        params: since ? { since } : undefined
      });

      setOrders(response.orders);
      setMetrics(response.metrics);
      setLastUpdate(new Date(response.timestamp));
      setError('');
    } catch (error) {
      console.error('[LiveOrderBoard] Failed to fetch live orders:', error);
      if (error instanceof ApiClientError) {
        setError(error.message || 'Failed to fetch live orders');
      } else {
        setError('Network error. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      // Optimistic update - update UI immediately
      setOrders((prevOrders) =>
        prevOrders.map((order) =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );

      await ApiClient.patch(`/api/orders/${orderId}/status`, { status: newStatus });

      console.log(
        '[LiveOrderBoard] Order status updated successfully, waiting for SSE confirmation'
      );
      // SSE will send the real update - no need to fetch manually
      // This prevents race conditions between manual fetch and SSE update
    } catch (error) {
      console.error('[LiveOrderBoard] Failed to update order status:', error);
      if (error instanceof ApiClientError) {
        setError(error.message || 'Failed to update order status');
      } else {
        setError('Failed to update order status');
      }
      // Revert optimistic update on error
      fetchLiveOrders();
    }
  };

  const getStatusColor = (status: string, isOverdue: boolean) => {
    if (isOverdue) return 'bg-red-100 text-red-800 border-red-200';

    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmed':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'preparing':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'ready':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'served':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getNextStatus = (currentStatus: string) => {
    switch (currentStatus) {
      case 'pending':
        return 'confirmed';
      case 'confirmed':
        return 'preparing';
      case 'preparing':
        return 'ready';
      case 'ready':
        return 'served';
      default:
        return null;
    }
  };

  const formatTime = (minutes: number | null) => {
    if (minutes === null) return '--';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Kitchen Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-2xl font-bold text-gray-900">
              {metrics.totalActiveOrders}
            </div>
            <div className="text-sm text-gray-600">Active Orders</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-2xl font-bold text-blue-600">
              {metrics.averagePreparationTime}m
            </div>
            <div className="text-sm text-gray-600">Avg Prep Time</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-2xl font-bold text-green-600">
              {metrics.ordersCompletedLastHour}
            </div>
            <div className="text-sm text-gray-600">Completed (Last Hour)</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {lastUpdate
                    ? new Date(lastUpdate).toLocaleTimeString()
                    : '--'}
                </div>
                <div className="text-sm text-gray-600">Last Updated</div>
              </div>
              <div className="flex items-center space-x-2">
                <div
                  className={`w-3 h-3 rounded-full ${sseConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}
                ></div>
                <span className="text-xs text-gray-500">
                  {sseConnected ? 'Live' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchLiveOrders}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Live Orders Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {orders
          .filter((order) => !['served', 'cancelled'].includes(order.status))
          .map((order) => (
            <div
              key={order.id}
              className={`bg-white rounded-lg shadow-sm border p-6 ${
                order.isOverdue ? 'ring-2 ring-red-500' : ''
              }`}
            >
              {/* Order Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <span className="text-lg font-semibold text-gray-900">
                    #{order.id.slice(-6)}
                  </span>
                  {order.isOverdue && (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                      OVERDUE
                    </span>
                  )}
                </div>
                <span
                  className={`px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(order.status, order.isOverdue)}`}
                >
                  {order.status.toUpperCase()}
                </span>
              </div>

              {/* Table & Customer Info */}
              <div className="space-y-2 mb-4">
                {order.table && (
                  <div className="text-sm text-gray-600">
                    📍 Table {order.table.tableNumber}{' '}
                    {order.table.tableName && `(${order.table.tableName})`}
                  </div>
                )}
                {order.customerSession && (
                  <div className="text-sm text-gray-600">
                    <User className="h-3 w-3 mr-1 inline" />{' '}
                    {order.customerSession.customerName}
                  </div>
                )}
              </div>

              {/* Order Items */}
              <div className="space-y-2 mb-4">
                {order.items.slice(0, 3).map((item, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-gray-900">
                      {item.quantity}x {item.menuItem.name}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {item.menuItem.category.name}
                    </span>
                  </div>
                ))}
                {order.items.length > 3 && (
                  <div className="text-xs text-gray-500">
                    +{order.items.length - 3} more items
                  </div>
                )}
              </div>

              {/* Preparation Progress */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-600">Progress</span>
                  <span className="text-xs text-gray-600">
                    {order.preparationProgress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      order.isOverdue ? 'bg-red-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${order.preparationProgress}%` }}
                  ></div>
                </div>
              </div>

              {/* Time Information */}
              <div className="flex justify-between items-center mb-4 text-sm">
                <div className="text-gray-600">
                  <Clock className="h-3 w-3 mr-1 inline" />{' '}
                  {formatTime(order.timeRemaining)}
                  {order.timeRemaining !== null && ' remaining'}
                </div>
                <div className="text-gray-600">
                  ${order.totalAmount.toFixed(2)}
                </div>
              </div>

              {/* Action Button */}
              {getNextStatus(order.status) && (
                <button
                  onClick={() =>
                    updateOrderStatus(order.id, getNextStatus(order.status)!)
                  }
                  className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                    order.isOverdue
                      ? 'bg-red-600 hover:bg-red-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  Mark as {getNextStatus(order.status)?.toUpperCase()}
                </button>
              )}
            </div>
          ))}
      </div>

      {/* Empty State */}
      {orders.filter((order) => !['served', 'cancelled'].includes(order.status))
        .length === 0 && (
        <div className="text-center py-12">
          <UtensilsCrossed className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No active orders
          </h3>
          <p className="text-gray-600">
            New orders will appear here in real-time
          </p>
        </div>
      )}
    </div>
  );
}
