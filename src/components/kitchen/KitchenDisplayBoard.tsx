'use client';

import { useState, useEffect } from 'react';
import { ChefHat, Check } from 'lucide-react';
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
    selectedOptions: {
      id: string;
      name: string;
      priceModifier: number;
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
    <div className="min-h-screen bg-black text-white p-2 md:p-4">
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
      {/* Single Active Orders List (Masonry-like Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 pb-20">
        {[...groupedOrders.confirmed, ...groupedOrders.preparing]
          // Sort by creation time (Oldest first)
          .sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
          .map((order) => {
            const priority = getOrderPriority(order);
            const estimatedTime = order.items.reduce(
              (max, item) => Math.max(max, item.menuItem.preparationTime),
              0
            );

            // Sort items: Active first, Ready last
            const sortedItems = [...order.items].sort((a, b) => {
              if (a.status === 'READY' && b.status !== 'READY') return 1;
              if (a.status !== 'READY' && b.status === 'READY') return -1;
              return 0;
            });

            // Determine border color based on priority
            const borderColor =
              priority === 'urgent'
                ? 'border-red-500'
                : priority === 'warning'
                  ? 'border-orange-500'
                  : 'border-blue-500';

            return (
              <div
                key={order.id}
                className={`bg-gray-900 md:bg-gray-800 rounded-lg p-3 border-l-4 ${borderColor} flex flex-col h-full shadow-lg`}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-2xl md:text-xl font-bold text-white">
                      {order.dailySeq
                        ? `#${String(order.dailySeq).padStart(3, '0')}`
                        : order.orderNumber}
                    </h3>
                    <p className="text-sm text-blue-300 font-medium tracking-wide">
                      Table {order.table.tableNumber}
                      {order.table.tableName && ` - ${order.table.tableName}`}
                    </p>
                    {order.customerSession?.customerName && (
                      <p className="text-xs text-gray-400 truncate max-w-[120px]">
                        {order.customerSession.customerName}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-2xl md:text-xl font-mono font-bold ${getTimeColor(order.createdAt, estimatedTime)}`}
                    >
                      {getOrderAge(order.createdAt)}m
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-3 md:space-y-2 flex-grow mb-4">
                  {sortedItems.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (item.status !== 'READY') {
                          updateItemStatus(item.id, 'READY');
                        } else {
                          // Allow toggling back to PREPARING if clicked again (Undo)
                          updateItemStatus(item.id, 'PREPARING');
                        }
                      }}
                      className={`p-3 md:p-2 rounded border flex justify-between items-center cursor-pointer transition-all active:scale-[0.98] ${
                        item.status === 'READY'
                          ? 'bg-gray-800/50 border-transparent md:bg-gray-700/50 opacity-50'
                          : 'bg-gray-800 border-gray-700/50 hover:bg-gray-700 hover:border-gray-600 md:bg-gray-700 md:hover:bg-gray-600'
                      }`}
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center">
                          <span
                            className={`text-lg md:text-base font-bold md:font-medium leading-tight ${
                              item.status === 'READY'
                                ? 'line-through text-gray-500'
                                : 'text-gray-100'
                            }`}
                          >
                            <span className="text-xl md:text-lg mr-2 inline-block">
                              {item.quantity}×
                            </span>
                            {item.menuItem.name}
                          </span>
                        </div>

                        {/* Variations (Selected Options) */}
                        {item.selectedOptions.length > 0 && (
                          <div className="text-sm md:text-xs text-gray-400 ml-1 mt-1">
                            {item.selectedOptions.map((opt) => (
                              <span key={opt.id} className="block">
                                + {opt.name}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Notes */}
                        {item.specialInstructions && (
                          <div className="text-sm md:text-xs text-yellow-500 italic mt-1 font-medium">
                            &quot;{item.specialInstructions}&quot;
                          </div>
                        )}
                      </div>

                      {/* Desktop Only: Check Icon for clarity (Hidden on mobile per request "remove empty box") */}
                      {item.status === 'READY' && (
                        <Check className="text-green-500 h-6 w-6 ml-2" />
                      )}
                    </div>
                  ))}
                </div>

                {/* Order Special Instructions */}
                {order.specialInstructions && (
                  <div className="bg-yellow-900/30 border border-yellow-700/50 p-3 md:p-2 rounded mb-3">
                    <p className="text-sm md:text-xs text-yellow-200 break-words">
                      <span className="font-bold">Note:</span>{' '}
                      {order.specialInstructions}
                    </p>
                  </div>
                )}

                {/* Ticket Action Button (Bump/Done) */}
                <button
                  onClick={() =>
                    handleBulkItemUpdate(order.id, order.items, 'READY')
                  }
                  className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white h-14 md:h-auto md:py-3 rounded-lg font-bold text-2xl md:text-lg shadow-md transition-colors mt-auto uppercase tracking-wide"
                >
                  DONE
                </button>
              </div>
            );
          })}
      </div>

      {orders.length === 0 && !loading && (
        <div className="text-center py-12">
          <ChefHat className="h-16 w-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-500 mb-2">
            Kitchen is All Clear!
          </h3>
          <p className="text-gray-600">No active orders to prepare</p>
        </div>
      )}
    </div>
  );
}
