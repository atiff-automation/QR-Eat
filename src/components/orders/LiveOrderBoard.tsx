'use client';

import { useState, useEffect } from 'react';

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

export function LiveOrderBoard({ refreshInterval = 30000 }: LiveOrderBoardProps) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [metrics, setMetrics] = useState<KitchenMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    fetchLiveOrders();
    const interval = setInterval(fetchLiveOrders, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const fetchLiveOrders = async () => {
    try {
      const since = lastUpdate ? lastUpdate.toISOString() : undefined;
      const url = `/api/orders/live${since ? `?since=${since}` : ''}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setOrders(data.orders);
        setMetrics(data.metrics);
        setLastUpdate(new Date(data.timestamp));
        setError('');
      } else {
        setError(data.error || 'Failed to fetch live orders');
      }
    } catch (error) {
      console.error('Failed to fetch live orders:', error);
      setError('Network error. Please check your connection.');
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
        fetchLiveOrders(); // Refresh orders after status update
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Failed to update order status:', error);
      setError('Failed to update order status');
    }
  };

  const getStatusColor = (status: string, isOverdue: boolean) => {
    if (isOverdue) return 'bg-red-100 text-red-800 border-red-200';
    
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'preparing': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'ready': return 'bg-green-100 text-green-800 border-green-200';
      case 'served': return 'bg-gray-100 text-gray-800 border-gray-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getNextStatus = (currentStatus: string) => {
    switch (currentStatus) {
      case 'pending': return 'confirmed';
      case 'confirmed': return 'preparing';
      case 'preparing': return 'ready';
      case 'ready': return 'served';
      default: return null;
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
            <div className="text-2xl font-bold text-gray-900">{metrics.totalActiveOrders}</div>
            <div className="text-sm text-gray-600">Active Orders</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-2xl font-bold text-blue-600">{metrics.averagePreparationTime}m</div>
            <div className="text-sm text-gray-600">Avg Prep Time</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-2xl font-bold text-green-600">{metrics.ordersCompletedLastHour}</div>
            <div className="text-sm text-gray-600">Completed (Last Hour)</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="text-2xl font-bold text-orange-600">
              {lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : '--'}
            </div>
            <div className="text-sm text-gray-600">Last Updated</div>
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
        {orders.filter(order => !['served', 'cancelled'].includes(order.status)).map((order) => (
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
              <span className={`px-3 py-1 text-xs font-medium rounded-full border ${getStatusColor(order.status, order.isOverdue)}`}>
                {order.status.toUpperCase()}
              </span>
            </div>

            {/* Table & Customer Info */}
            <div className="space-y-2 mb-4">
              {order.table && (
                <div className="text-sm text-gray-600">
                  📍 Table {order.table.tableNumber} {order.table.tableName && `(${order.table.tableName})`}
                </div>
              )}
              {order.customerSession && (
                <div className="text-sm text-gray-600">
                  👤 {order.customerSession.customerName}
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="space-y-2 mb-4">
              {order.items.slice(0, 3).map((item, index) => (
                <div key={index} className="flex justify-between items-center text-sm">
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
                <span className="text-xs text-gray-600">{order.preparationProgress}%</span>
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
                ⏱️ {formatTime(order.timeRemaining)}
                {order.timeRemaining !== null && ' remaining'}
              </div>
              <div className="text-gray-600">
                ${order.totalAmount.toFixed(2)}
              </div>
            </div>

            {/* Action Button */}
            {getNextStatus(order.status) && (
              <button
                onClick={() => updateOrderStatus(order.id, getNextStatus(order.status)!)}
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
      {orders.filter(order => !['served', 'cancelled'].includes(order.status)).length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">🍽️</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No active orders</h3>
          <p className="text-gray-600">New orders will appear here in real-time</p>
        </div>
      )}
    </div>
  );
}