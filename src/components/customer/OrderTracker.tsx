'use client';

import { useState, useEffect } from 'react';

interface OrderStatus {
  id: string;
  status: string;
  estimatedCompletion: string | null;
  timeRemaining: number | null;
  preparationProgress: number;
  totalAmount: number;
  items: Array<{
    quantity: number;
    menuItem: {
      name: string;
      price: number;
    };
  }>;
  createdAt: string;
  table: {
    tableNumber: string;
    tableName: string;
  } | null;
}

interface OrderTrackerProps {
  orderId: string;
  customerView?: boolean;
}

export function OrderTracker({ orderId, customerView = false }: OrderTrackerProps) {
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (orderId) {
      fetchOrderStatus();
      const interval = setInterval(fetchOrderStatus, 15000); // Check every 15 seconds
      return () => clearInterval(interval);
    }
  }, [orderId]);

  const fetchOrderStatus = async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}/status`);
      const data = await response.json();

      if (response.ok) {
        setOrder(data.order);
        setError('');
      } else {
        setError(data.error || 'Failed to fetch order status');
      }
    } catch (error) {
      console.error('Failed to fetch order status:', error);
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          title: 'Order Received',
          description: 'Your order has been received and is being reviewed',
          icon: '📝',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100'
        };
      case 'confirmed':
        return {
          title: 'Order Confirmed',
          description: 'Your order has been confirmed and will be prepared soon',
          icon: '✅',
          color: 'text-blue-600',
          bgColor: 'bg-blue-100'
        };
      case 'preparing':
        return {
          title: 'Being Prepared',
          description: 'Your delicious meal is currently being prepared',
          icon: '👨‍🍳',
          color: 'text-orange-600',
          bgColor: 'bg-orange-100'
        };
      case 'ready':
        return {
          title: 'Ready for Pickup',
          description: 'Your order is ready! Please come to the counter or wait at your table',
          icon: '🔔',
          color: 'text-green-600',
          bgColor: 'bg-green-100'
        };
      case 'served':
        return {
          title: 'Order Complete',
          description: 'Enjoy your meal! Thank you for dining with us',
          icon: '🍽️',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100'
        };
      case 'cancelled':
        return {
          title: 'Order Cancelled',
          description: 'Your order has been cancelled',
          icon: '❌',
          color: 'text-red-600',
          bgColor: 'bg-red-100'
        };
      default:
        return {
          title: 'Unknown Status',
          description: 'Unable to determine order status',
          icon: '❓',
          color: 'text-gray-600',
          bgColor: 'bg-gray-100'
        };
    }
  };

  const formatTimeRemaining = (minutes: number | null) => {
    if (minutes === null || minutes <= 0) return null;
    
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} remaining`;
    }
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m remaining`;
  };

  const getProgressPercentage = (status: string, progress: number) => {
    const statusOrder = ['pending', 'confirmed', 'preparing', 'ready', 'served'];
    const currentIndex = statusOrder.indexOf(status);
    const baseProgress = (currentIndex / (statusOrder.length - 1)) * 100;
    
    if (status === 'preparing') {
      // Use actual preparation progress for preparing status
      return Math.min(baseProgress + (progress / statusOrder.length), 100);
    }
    
    return baseProgress;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600">{error || 'Order not found'}</p>
        <button 
          onClick={fetchOrderStatus}
          className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  const statusInfo = getStatusInfo(order.status);
  const progressPercentage = getProgressPercentage(order.status, order.preparationProgress);
  const timeRemaining = formatTimeRemaining(order.timeRemaining);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Order #{order.id.slice(-6)}
          </h2>
          {order.table && (
            <p className="text-sm text-gray-600">
              Table {order.table.tableNumber} {order.table.tableName && `(${order.table.tableName})`}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-gray-900">
            ${order.totalAmount.toFixed(2)}
          </div>
          <div className="text-sm text-gray-600">
            {new Date(order.createdAt).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Current Status */}
      <div className={`${statusInfo.bgColor} rounded-lg p-4 mb-6`}>
        <div className="flex items-center space-x-3">
          <div className="text-2xl">{statusInfo.icon}</div>
          <div>
            <h3 className={`font-semibold ${statusInfo.color}`}>
              {statusInfo.title}
            </h3>
            <p className="text-sm text-gray-700">
              {statusInfo.description}
            </p>
          </div>
        </div>
        
        {timeRemaining && (
          <div className="mt-3 text-sm font-medium text-gray-800">
            ⏱️ {timeRemaining}
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Progress</span>
          <span className="text-sm text-gray-600">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>

      {/* Status Timeline */}
      <div className="space-y-3 mb-6">
        {['pending', 'confirmed', 'preparing', 'ready', 'served'].map((status, index) => {
          const isCompleted = ['pending', 'confirmed', 'preparing', 'ready', 'served'].indexOf(order.status) >= index;
          const isCurrent = order.status === status;
          
          return (
            <div key={status} className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${
                isCompleted 
                  ? isCurrent ? 'bg-blue-600 ring-4 ring-blue-200' : 'bg-green-600'
                  : 'bg-gray-300'
              }`}></div>
              <span className={`text-sm ${
                isCompleted ? 'text-gray-900 font-medium' : 'text-gray-500'
              }`}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Order Items */}
      {customerView && (
        <div className="border-t pt-4">
          <h4 className="font-medium text-gray-900 mb-3">Your Order</h4>
          <div className="space-y-2">
            {order.items.map((item, index) => (
              <div key={index} className="flex justify-between items-center text-sm">
                <span className="text-gray-900">
                  {item.quantity}x {item.menuItem.name}
                </span>
                <span className="text-gray-600">
                  ${(item.quantity * item.menuItem.price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div className="flex items-center justify-center mt-4 text-xs text-gray-500">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-2"></div>
        Updates automatically every 15 seconds
      </div>
    </div>
  );
}