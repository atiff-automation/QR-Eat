/**
 * Tables Management Page with RBAC Integration
 *
 * Re-implemented as a mobile-first Tile Grid system.
 */

'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-client';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { useRole } from '@/components/rbac/RoleProvider';
import { QRCodeDisplay } from '@/components/tables/QRCodeDisplay';
import { TableTile } from '@/components/tables/TableTile';
import { TableDetailModal } from '@/components/tables/TableDetailModal';
import { PaymentInterface } from '@/components/pos/PaymentInterface';
import { Search } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import type { OrderWithDetails } from '@/types/pos';
import { useCurrency } from '@/lib/hooks/queries/useRestaurantSettings';
import { useTables, type Table } from '@/lib/hooks/queries/useTables';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import {
  canOpenTableModal,
  getStaffModalBlockMessage,
} from '@/lib/table-utils';

// Table interface imported from useTables hooks

function TablesContent() {
  const { restaurantContext } = useRole();

  // TanStack Query for data fetching
  const {
    data: tables = [],
    isLoading: loading,
    error: queryError,
  } = useTables(restaurantContext?.id);
  const [filteredTables, setFilteredTables] = useState<Table[]>([]);
  const error = queryError?.message || '';
  const [showAddModal, setShowAddModal] = useState(false);

  // Interaction State
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<Table | null>(
    null
  );

  // Payment State
  const [selectedOrders, setSelectedOrders] = useState<OrderWithDetails[]>([]);
  const [originalOrders, setOriginalOrders] = useState<OrderWithDetails[]>([]);
  const [showPaymentInterface, setShowPaymentInterface] = useState(false);
  const currency = useCurrency(); // Get currency from context
  const queryClient = useQueryClient();

  // No manual fetch function needed - TanStack Query handles this

  // SSE Implementation for real-time updates
  useEffect(() => {
    if (!restaurantContext?.id) return;

    // Setup SSE for real-time order updates
    console.log('[TablesPage] Setting up SSE connection...');
    const eventSource = new EventSource('/api/events/orders');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle Table Status Changes
        if (data.type === 'table_status_changed') {
          const { tableId, newStatus } = data.data;
          console.log(
            `[TablesPage] Real-time update: Table ${tableId} -> ${newStatus}`
          );

          // Optimistic update handled by SSE - just invalidate cache
          queryClient.invalidateQueries({ queryKey: queryKeys.tables.all });

          if (selectedTable?.id === tableId) {
            setSelectedTable((prev) =>
              prev ? { ...prev, status: newStatus } : null
            );
          }
        }

        // Handle New Orders -> Trigger Immediate Refresh for Modal
        if (data.type === 'order_created') {
          const { tableId } = data.data;
          if (tableId) {
            console.log(
              `[TablesPage] New order for table ${tableId}, invalidating cache...`
            );
            queryClient.invalidateQueries({
              queryKey: queryKeys.tables.orders(tableId),
            });
          }
        }
        // Handle Payment Completion -> Trigger Immediate Refresh for Modal
        if (data.type === 'payment_completed') {
          const { tableId } = data.data;
          if (tableId) {
            console.log(
              `[TablesPage] Payment completed for table ${tableId}, invalidating cache...`
            );
            // Invalidate tables list to refresh
            queryClient.invalidateQueries({ queryKey: queryKeys.tables.all });

            // 2. Remove Table Details Modal Orders (to prevent payment button flicker)
            queryClient.removeQueries({
              queryKey: queryKeys.tables.orders(tableId),
            });
          }
        }
      } catch (error) {
        console.error('[TablesPage] SSE parse error:', error);
      }
    };

    // No polling needed - TanStack Query handles refetching
    return () => {
      eventSource.close();
    };
  }, [restaurantContext?.id, selectedTable?.id, queryClient]);

  // Filter Logic
  useEffect(() => {
    if (!searchQuery) {
      setFilteredTables(tables);
    } else {
      const lowerQuery = searchQuery.toLowerCase();
      setFilteredTables(
        tables.filter(
          (t) =>
            t.tableNumber.toLowerCase().includes(lowerQuery) ||
            t.tableName?.toLowerCase().includes(lowerQuery)
        )
      );
    }
  }, [searchQuery, tables]);

  // Actions
  const updateTableStatus = async (tableId: string, status: string) => {
    try {
      await ApiClient.patch(`/tables/${tableId}/status`, { status });
      // Invalidate cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.tables.all });
      // Update local state optimistically for snappy feel
      if (selectedTable && selectedTable.id === tableId) {
        setSelectedTable({
          ...selectedTable,
          status: status as Table['status'],
        });
      }
    } catch (error) {
      console.error('Failed to update table status:', error);
      alert('Failed to update status');
    }
  };

  const toggleTableActive = async (table: Table) => {
    try {
      const newStatus = table.status === 'INACTIVE' ? 'AVAILABLE' : 'INACTIVE';

      await ApiClient.patch(`/tables/${table.id}/status`, {
        status: newStatus,
      });

      // Invalidate cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.tables.all });

      if (selectedTable?.id === table.id) {
        setSelectedTable({ ...selectedTable, status: newStatus });
      }

      console.log(
        `Table ${table.tableNumber} ${newStatus === 'INACTIVE' ? 'deactivated' : 'activated'}`
      );
    } catch (error) {
      console.error('Failed to toggle table status:', error);
      if (error instanceof ApiClientError) {
        alert(error.message);
      } else {
        alert('Failed to toggle table status');
      }
    }
  };

  const handleDeleteTable = (table: Table) => {
    setDeleteConfirmation(table);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmation) return;

    try {
      await ApiClient.delete(`/tables/${deleteConfirmation.id}`);
      // Invalidate cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.tables.all });
      console.log(
        `Table "${deleteConfirmation.tableName || deleteConfirmation.tableNumber}" deleted successfully`
      );
      setDeleteConfirmation(null);
    } catch (error) {
      console.error('Failed to delete table:', error);
      setDeleteConfirmation(null);
      if (error instanceof ApiClientError) {
        // Show the helpful error message from the API
        alert(error.message);
      } else {
        alert('Failed to delete table. Please try again.');
      }
    }
  };

  const regenerateQRCode = async (tableId: string) => {
    try {
      await ApiClient.post<{ qrUrl: string }>(
        `/tables/${tableId}/regenerate-qr`
      );

      // Invalidate cache to get fresh data with new token
      queryClient.invalidateQueries({ queryKey: queryKeys.tables.all });

      // Update selected table with the new data
      const data = await ApiClient.get<{ tables: Table[] }>(
        `/tables?restaurantId=${restaurantContext?.id}`
      );
      const updatedTable = data.tables.find((t) => t.id === tableId);
      if (updatedTable) {
        setSelectedTable(updatedTable);
      }

      alert('QR code regenerated successfully! The old code is now invalid.');
    } catch {
      alert('Failed to regenerate QR');
    }
  };

  // Payment Handler - Process payment for all table orders
  const handleProcessPayment = (
    tableId: string,
    orders: OrderWithDetails[]
  ) => {
    if (orders.length === 0) {
      alert('No unpaid orders for this table');
      return;
    }

    // Use first order as reference (for tableId and display)
    // The actual payment will process ALL orders via table payment endpoint
    setSelectedOrders([orders[0]]);
    setOriginalOrders(orders); // Pass all orders for total calculation
    setShowPaymentInterface(true);
    setIsModalOpen(false); // Close table modal
  };

  // Payment Handler - Callback when payment is successful
  const handlePaymentComplete = () => {
    // Remove the cache for this specific table's orders to prevent flicker
    queryClient.removeQueries({
      queryKey: queryKeys.tables.orders(selectedOrders[0]?.tableId),
    });
    // Refresh the main table list
    queryClient.invalidateQueries({ queryKey: queryKeys.tables.all });
    setShowPaymentInterface(false);
    setSelectedOrders([]);
    setOriginalOrders([]);
  };

  if (loading) {
    return (
      <div className="p-4 grid grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-gray-100 rounded-2xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header & Search using Staff Page Style */}
      <div className="px-5 pt-6 pb-2">
        {/* Search Container */}
        <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 mb-4 flex items-center">
          {/* Search Icon */}
          <div className="pl-2">
            <Search className="text-gray-400 w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border-none text-sm font-medium focus:ring-0 text-gray-900 placeholder:text-gray-500 ml-2"
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="px-5 space-y-3">
        {error && (
          <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {/* Tables Grid - Responsive Modern Layout */}
        <div className="grid grid-cols-2 xs:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-4">
          {filteredTables.map((table) => (
            <TableTile
              key={table.id}
              table={table}
              onClick={() => {
                // Block modal opening for INACTIVE tables
                if (!canOpenTableModal(table.status)) {
                  const message = getStaffModalBlockMessage(table.status);
                  alert(message);
                  return;
                }

                setSelectedTable(table);
                setIsModalOpen(true);
              }}
              onToggleActive={(table, e) => {
                e.stopPropagation();
                toggleTableActive(table);
              }}
              onDelete={(table, e) => {
                e.stopPropagation();
                handleDeleteTable(table);
              }}
            />
          ))}
          {filteredTables.length === 0 && (
            <div className="col-span-full py-12 text-center text-gray-400">
              No tables found
            </div>
          )}
        </div>
      </div>

      {/* Add Table Modal */}
      {showAddModal && (
        <AddTableModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() =>
            queryClient.invalidateQueries({ queryKey: queryKeys.tables.all })
          }
          restaurantContext={restaurantContext}
        />
      )}

      {/* Detail Modal */}
      <TableDetailModal
        table={selectedTable}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUpdateStatus={updateTableStatus}
        onShowQR={(table) => {
          // Stacked Modal Pattern: Keep the detail modal open in the background
          setSelectedTable(table);
          setShowQRCodeModal(true);
        }}
        onProcessPayment={handleProcessPayment}
        currency={currency}
      />

      {/* QR Code Modal */}
      {showQRCodeModal && selectedTable && (
        <QRCodeDisplay
          tableId={selectedTable.id}
          tableNumber={selectedTable.tableNumber}
          tableName={selectedTable.tableName}
          qrToken={selectedTable.qrCodeToken}
          restaurantName="Restaurant"
          onClose={() => setShowQRCodeModal(false)}
          onRegenerate={regenerateQRCode}
        />
      )}

      {/* Payment Interface */}
      {showPaymentInterface && selectedOrders[0] && (
        <PaymentInterface
          order={selectedOrders[0]}
          relatedOrders={originalOrders}
          currency={currency}
          onClose={() => setShowPaymentInterface(false)}
          onPaymentComplete={handlePaymentComplete}
        />
      )}

      {/* Floating Action Button */}
      <PermissionGuard permission="tables:write">
        <FloatingActionButton
          onClick={() => setShowAddModal(true)}
          ariaLabel="Add Table"
        />
      </PermissionGuard>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteConfirmation}
        title="Delete Table"
        message={`Are you sure you want to delete "${
          deleteConfirmation?.tableName || deleteConfirmation?.tableNumber
        }"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmation(null)}
        isLoading={false}
        variant="danger"
        confirmText="Delete Table"
      />
    </div>
  );
}

export default function TablesPage() {
  return (
    <PermissionGuard permission="tables:read">
      <TablesContent />
    </PermissionGuard>
  );
}

// Add Table Modal Content (Copied & simplified from original)
function AddTableModal({
  onClose,
  onSuccess,
  restaurantContext,
}: {
  onClose: () => void;
  onSuccess: () => void;
  restaurantContext: { id: string; name: string } | null;
}) {
  const [formData, setFormData] = useState({
    tableNumber: '',
    tableName: '',
    capacity: '',
    locationDescription: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      await ApiClient.post('/tables', {
        ...formData,
        restaurantId: restaurantContext?.id,
      });

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to create table:', error);
      setError('Failed to create table');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <h3 className="font-bold text-gray-900">New Table</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200"
          >
            <div className="w-5 h-5 flex items-center justify-center">✕</div>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Number
            </label>
            <input
              type="text"
              value={formData.tableNumber}
              onChange={(e) =>
                setFormData({ ...formData, tableNumber: e.target.value })
              }
              className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
              placeholder="e.g. 12"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Capacity
              </label>
              <input
                type="number"
                value={formData.capacity}
                onChange={(e) =>
                  setFormData({ ...formData, capacity: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                min="1"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                Name (Opt)
              </label>
              <input
                type="text"
                value={formData.tableName}
                onChange={(e) =>
                  setFormData({ ...formData, tableName: e.target.value })
                }
                className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                placeholder="Win..."
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
              Location
            </label>
            <input
              value={formData.locationDescription}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  locationDescription: e.target.value,
                })
              }
              className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
              placeholder="Near window..."
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 active:scale-95 transition-all text-sm"
          >
            {isSubmitting ? 'Creating...' : 'Create Table'}
          </button>
        </form>
      </div>
    </div>
  );
}
