'use client';

import { useState, useEffect } from 'react';
import { ChefHat } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { useAuthAwarePolling } from '@/hooks/useAuthAwarePolling';
import { POLLING_INTERVALS } from '@/lib/constants/polling-config';
import { KitchenHeader } from './KitchenHeader';
import { useKitchenSettings } from '@/hooks/useKitchenSettings';

interface KitchenOrder {
  id: string;
  orderNumber: string;
  dailySeq?: number;
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
      categoryId: string;
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
  const [sseConnected, setSseConnected] = useState(false);

  // Station Filter Settings
  const {
    categories,
    selectedCategories,
    toggleCategory,
    selectAll,
    deselectAll,
    saving,
  } = useKitchenSettings();

  /**
   * SSE-BACKED CONDITIONAL POLLING
   *
   * Polling is DISABLED when SSE is connected (!sseConnected = false)
   * Polling is ENABLED when SSE disconnects (!sseConnected = true)
   *
   * This prevents redundant requests when SSE is working:
   * - SSE active (95% uptime): 0 polling requests → 0% server load
   * - SSE inactive (5% downtime): Polling every 10s → Maintains data flow
   *
   * @see polling-config.ts - SSE-BACKED POLLING documentation
   */
  const { data: pollingData, error: pollingError } = useAuthAwarePolling<{
    orders: KitchenOrder[];
  }>(
    '/kitchen/orders',
    POLLING_INTERVALS.KITCHEN,
    !sseConnected // ← CONDITIONAL: Only poll when SSE is disconnected
  );

  const handleRealTimeUpdate = (data: {
    type: string;
    data: Record<string, unknown>;
  }) => {
    console.log('Kitchen real-time update received:', data);

    switch (data.type) {
      case 'order_status_changed':
        console.log(
          'Updating order status:',
          data.data.orderId,
          'from',
          data.data.oldStatus,
          'to',
          data.data.newStatus
        );

        // Update specific order status
        setOrders((prevOrders) => {
          console.log(
            'Current orders before update:',
            prevOrders.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              status: o.status,
            }))
          );

          const updated = prevOrders.map((order) => {
            if (order.id === data.data.orderId) {
              console.log(
                'Found order to update:',
                order.orderNumber,
                'from',
                order.status,
                'to',
                data.data.newStatus
              );
              return { ...order, status: data.data.newStatus as string };
            }
            return order;
          });

          console.log(
            'Updated orders:',
            updated.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              status: o.status,
            }))
          );

          // If order not found in current list, refresh orders
          const foundOrder = prevOrders.find(
            (order) => order.id === (data.data.orderId as string)
          );
          if (!foundOrder) {
            console.log('Order not found in current list, refreshing...');
            fetchKitchenOrders();
            return prevOrders;
          }

          // Check if the new status should still be displayed in kitchen
          const kitchenStatuses = ['CONFIRMED', 'PREPARING', 'READY'];
          if (!kitchenStatuses.includes(data.data.newStatus as string)) {
            console.log(
              'Order status',
              data.data.newStatus,
              'should not be displayed in kitchen, refreshing...'
            );
            fetchKitchenOrders();
            return prevOrders;
          }

          return updated;
        });
        break;

      case 'order_created':
        // Refresh orders to get new order
        console.log('New order created, refreshing kitchen orders...');
        fetchKitchenOrders();
        break;

      case 'order_item_status_changed':
        console.log('Kitchen item status changed:', {
          orderId: data.data.orderId,
          itemId: data.data.itemId,
          oldStatus: data.data.oldStatus,
          newStatus: data.data.newStatus,
        });
        // Update specific item status in state
        setOrders((prevOrders) =>
          prevOrders.map((order) => {
            if (order.id === data.data.orderId) {
              return {
                ...order,
                items: order.items.map((item) =>
                  item.id === data.data.itemId
                    ? { ...item, status: data.data.newStatus as string }
                    : item
                ),
              };
            }
            return order;
          })
        );
        break;

      case 'kitchen_notification':
        console.log('Kitchen notification:', data.data.message);
        // Could show toast notification here
        break;

      case 'restaurant_notification':
        console.log('Restaurant notification:', data.data.message);
        // Could show toast notification here
        break;

      case 'connection':
        console.log('Kitchen SSE connection established:', data.data.message);
        break;

      default:
        console.log('Unknown kitchen event type:', data.type);
    }
  };

  // Update orders from auth-aware polling fallback
  useEffect(() => {
    if (pollingData) {
      setOrders(pollingData.orders);
      setError('');
      setLoading(false);
    }
  }, [pollingData]);

  // Handle polling errors
  useEffect(() => {
    if (pollingError) {
      setError(pollingError.message);
      setLoading(false);
    }
  }, [pollingError]);

  useEffect(() => {
    // Fetch initial data on mount
    console.log('[KitchenDisplayBoard] Fetching initial data...');
    fetchKitchenOrders();

    // Set up Server-Sent Events for real-time updates
    console.log('[KitchenDisplayBoard] Establishing SSE connection...');
    const eventSource = new EventSource('/api/events/orders');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleRealTimeUpdate(data);
      } catch (error) {
        console.error('[KitchenDisplayBoard] Error parsing SSE data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('[KitchenDisplayBoard] SSE connection error:', error);
      setSseConnected(false);
      // EventSource will automatically try to reconnect
    };

    eventSource.onopen = () => {
      console.log('[KitchenDisplayBoard] SSE connection established');
      setSseConnected(true);
    };

    return () => {
      console.log('[KitchenDisplayBoard] Cleaning up SSE connection');
      eventSource.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchKitchenOrders = async () => {
    try {
      const data = await ApiClient.get<{ orders: KitchenOrder[] }>(
        '/kitchen/orders'
      );
      setOrders(data.orders);
      setError('');
    } catch (error) {
      console.error('Failed to fetch kitchen orders:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please check connection.'
      );
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

      await ApiClient.patch(`/orders/${orderId}/status`, { status: newStatus });
      console.log(
        '[KitchenDisplay] Order status updated successfully, waiting for SSE confirmation'
      );
      // SSE will send the real update - no need to fetch manually
      // This prevents race conditions between manual fetch and SSE update
    } catch (error) {
      console.error('[KitchenDisplay] Failed to update order status:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
      // Revert optimistic update on error
      fetchKitchenOrders();
    }
  };

  const updateItemStatus = async (itemId: string, newStatus: string) => {
    try {
      // Optimistic update - update item status immediately
      setOrders((prevOrders) =>
        prevOrders.map((order) => ({
          ...order,
          items: order.items.map((item) =>
            item.id === itemId ? { ...item, status: newStatus } : item
          ),
        }))
      );

      await ApiClient.patch(`/kitchen/items/${itemId}/status`, {
        status: newStatus,
      });
      console.log(
        '[KitchenDisplay] Item status updated successfully, waiting for SSE confirmation'
      );
      // SSE will send the real update - no need to fetch manually
    } catch (error) {
      console.error('[KitchenDisplay] Failed to update item status:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
      // Revert optimistic update on error
      fetchKitchenOrders();
    }
  };

  const getOrderAge = (createdAt: string) => {
    const created = new Date(createdAt);
    const diffMs = new Date().getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins;
  };

  const getOrderPriority = (order: KitchenOrder) => {
    const age = getOrderAge(order.createdAt);
    const estimatedTime = order.items.reduce(
      (max, item) => Math.max(max, item.menuItem.preparationTime),
      0
    );

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

  // FILTERING LOGIC
  // 1. Filter items within each order based on selected category
  const filteredOrders = orders
    .map((order) => {
      // If no categories selected (or initial load), show all (Safe Default)
      if (selectedCategories.length === 0) return order;

      const filteredItems = order.items.filter((item) =>
        selectedCategories.includes(item.menuItem.categoryId)
      );

      // Return order with only matching items
      return {
        ...order,
        items: filteredItems,
      };
    })
    // 2. Remove orders that have NO matching items for this station
    .filter((order) => order.items.length > 0);

  // Helper: Determine the effective status for this station based on its items
  const getDisplayStatus = (
    order: KitchenOrder
  ): 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' => {
    // If all items are READY or SERVED, treat as READY (for this station)
    const allReady = order.items.every((item) =>
      ['READY', 'SERVED'].includes(item.status)
    );
    if (allReady) return 'READY';

    // If any item is PREPARING, READY, or SERVED (but not all are ready), treat as PREPARING
    const anyInProgres = order.items.some((item) =>
      ['PREPARING', 'READY', 'SERVED'].includes(item.status)
    );
    if (anyInProgres) return 'PREPARING';

    // Otherwise, it's New
    return 'CONFIRMED';
  };

  const groupedOrders = {
    confirmed: filteredOrders.filter(
      (order) => getDisplayStatus(order) === 'CONFIRMED'
    ),
    preparing: filteredOrders.filter(
      (order) => getDisplayStatus(order) === 'PREPARING'
    ),
    ready: filteredOrders.filter(
      (order) => getDisplayStatus(order) === 'READY'
    ),
  };

  // Bulk update items for "Start Cooking" or "Mark Ready" actions
  const handleBulkItemUpdate = async (
    orderId: string,
    items: { id: string }[],
    newStatus: string
  ) => {
    try {
      // Optimistic update
      setOrders((prev) =>
        prev.map((o) => {
          if (o.id !== orderId) return o;
          return {
            ...o,
            items: o.items.map((i) => {
              if (items.some((target) => target.id === i.id)) {
                return { ...i, status: newStatus };
              }
              return i;
            }),
          };
        })
      );

      // API Calls (Parallel)
      await Promise.all(
        items.map((item) =>
          ApiClient.patch(`/kitchen/items/${item.id}/status`, {
            status: newStatus,
          })
        )
      );

      // Side Effect: If starting cooking, ensure Global Order Status is at least PREPARING
      if (newStatus === 'PREPARING') {
        // We don't await this to avoid blocking the UI response, and we catch errors silently
        ApiClient.patch(`/orders/${orderId}/status`, {
          status: 'PREPARING',
        }).catch((err) =>
          console.warn('Failed to auto-update global order status:', err)
        );
      }

      // If marking items READY, check if ALL items in the original order are now ready
      // This logic is complex to do purely client-side without full order context.
      // Ideally backend handles "Check All Ready".
      // For now, we rely on the waiter/kds visual cue.
    } catch (error) {
      console.error('Failed to bulk update items:', error);
      toast.error('Failed to update items');
      fetchKitchenOrders();
    }
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
      <KitchenHeader
        counts={{
          confirmed: groupedOrders.confirmed.length,
          preparing: groupedOrders.preparing.length,
          ready: groupedOrders.ready.length,
        }}
        categories={categories}
        selectedCategories={selectedCategories}
        onToggleCategory={toggleCategory}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        saving={saving}
      />

      {error && (
        <div className="mb-6 bg-red-600 text-white p-3 rounded-lg">
          <p>{error}</p>
        </div>
      )}

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
              const estimatedTime = order.items.reduce(
                (max, item) => Math.max(max, item.menuItem.preparationTime),
                0
              );

              return (
                <div
                  key={order.id}
                  className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                    priority === 'urgent'
                      ? 'border-red-500'
                      : priority === 'warning'
                        ? 'border-orange-500'
                        : 'border-blue-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-lg font-bold">
                        {order.dailySeq
                          ? `#${String(order.dailySeq).padStart(3, '0')}`
                          : order.orderNumber}
                      </h3>
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
                      <div
                        className={`text-lg font-mono ${getTimeColor(order.createdAt, estimatedTime)}`}
                      >
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
                                    {variation.quantity}×{' '}
                                    {variation.variation.name}
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
                        <strong>Special Instructions:</strong>{' '}
                        {order.specialInstructions}
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() =>
                      handleBulkItemUpdate(order.id, order.items, 'PREPARING')
                    }
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
              const estimatedTime = order.items.reduce(
                (max, item) => Math.max(max, item.menuItem.preparationTime),
                0
              );

              return (
                <div
                  key={order.id}
                  className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                    priority === 'urgent'
                      ? 'border-red-500'
                      : priority === 'warning'
                        ? 'border-orange-500'
                        : 'border-orange-400'
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
                      <div
                        className={`text-lg font-mono ${getTimeColor(order.createdAt, estimatedTime)}`}
                      >
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
                                    {variation.quantity}×{' '}
                                    {variation.variation.name}
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
                            onClick={() => updateItemStatus(item.id, 'READY')}
                            className={`px-2 py-1 text-xs rounded ${
                              item.status === 'READY'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-600 hover:bg-green-600 text-gray-300'
                            }`}
                          >
                            {item.status === 'READY' ? '✓ Done' : 'Mark Done'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() =>
                      handleBulkItemUpdate(order.id, order.items, 'READY')
                    }
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded font-medium"
                  >
                    Mark All Ready
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
                      <div className="text-sm text-gray-400">{age}m ago</div>
                    </div>
                  </div>

                  <div className="space-y-1 mb-3">
                    {order.items.map((item) => (
                      <div key={item.id} className="text-sm">
                        {item.quantity}× {item.menuItem.name}
                      </div>
                    ))}
                  </div>

                  {/* 
                     For 'Mark Served', we can still update the Global Order Status to SERVED
                     if this station is done. 
                     Refinement: 'Mark Served' usually implies the waiter took it.
                     So keeping it as global update is acceptable for now.
                  */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => updateOrderStatus(order.id, 'SERVED')}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded font-medium"
                    >
                      Pickup Completed
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
          <h3 className="text-xl font-medium text-gray-300 mb-2">
            Kitchen is All Clear!
          </h3>
          <p className="text-gray-400">No active orders to prepare</p>
        </div>
      )}
    </div>
  );
}
