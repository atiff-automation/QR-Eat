/**
 * Tables Management Page with RBAC Integration
 *
 * Re-implemented as a mobile-first Tile Grid system.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { useRole } from '@/components/rbac/RoleProvider';
import { QRCodeDisplay } from '@/components/tables/QRCodeDisplay';
import { TableTile } from '@/components/tables/TableTile';
import { TableDetailModal } from '@/components/tables/TableDetailModal';
import { PaymentInterface } from '@/components/pos/PaymentInterface';
import { Plus, Search } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import type { OrderWithDetails } from '@/types/pos';

interface Table {
  id: string;
  tableNumber: string;
  tableName?: string;
  capacity: number;
  status: string;
  qrCodeToken: string;
  locationDescription?: string;
  currentOrders: number;
  lastOrderAt?: string;
}

function TablesContent() {
  const { restaurantContext } = useRole();
  const [tables, setTables] = useState<Table[]>([]);
  const [filteredTables, setFilteredTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Interaction State
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showQRCodeModal, setShowQRCodeModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Payment State
  const [selectedOrders, setSelectedOrders] = useState<OrderWithDetails[]>([]);
  const [originalOrders, setOriginalOrders] = useState<OrderWithDetails[]>([]);
  const [showPaymentInterface, setShowPaymentInterface] = useState(false);
  const [currency, setCurrency] = useState('MYR');

  const fetchTables = useCallback(async () => {
    try {
      if (!restaurantContext?.id) {
        setError('No restaurant selected');
        setLoading(false);
        return;
      }

      const data = await ApiClient.get<{ tables: Table[] }>(
        `/tables?restaurantId=${restaurantContext.id}`
      );

      setTables(data.tables);
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      setError(
        error instanceof ApiClientError
          ? error.message
          : 'Network error. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [restaurantContext?.id]);

  // Fetch restaurant settings for currency
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await ApiClient.get<{ settings: { currency: string } }>(
          '/settings/restaurant'
        );
        setCurrency(data.settings.currency || 'MYR');
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        // Keep default MYR if fetch fails
      }
    };
    fetchSettings();
  }, []);

  // SSE Implementation
  useEffect(() => {
    if (!restaurantContext?.id) return;

    // Initial fetch
    fetchTables();

    // Setup SSE
    console.log('[TablesPage] Setting up SSE connection...');
    const eventSource = new EventSource('/api/events/orders');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'table_status_changed') {
          const { tableId, newStatus } = data.data;
          console.log(
            `[TablesPage] Real-time update: Table ${tableId} -> ${newStatus}`
          );

          setTables((prev) =>
            prev.map((t) =>
              t.id === tableId ? { ...t, status: newStatus } : t
            )
          );

          if (selectedTable?.id === tableId) {
            setSelectedTable((prev) =>
              prev ? { ...prev, status: newStatus } : null
            );
          }
        }
      } catch (error) {
        console.error('[TablesPage] SSE parse error:', error);
      }
    };

    // Keep polling as backup (but less frequent) - 1 minute
    const interval = setInterval(fetchTables, 60000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [restaurantContext?.id, fetchTables, selectedTable?.id]);

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
      fetchTables(); // Refresh immediately
      // Update local state optimistically for snappy feel
      if (selectedTable && selectedTable.id === tableId) {
        setSelectedTable({ ...selectedTable, status });
      }
    } catch (error) {
      console.error('Failed to update table status:', error);
      alert('Failed to update status');
    }
  };

  const regenerateQRCode = async (tableId: string) => {
    try {
      await ApiClient.post<{ qrUrl: string }>(
        `/tables/${tableId}/regenerate-qr`
      );

      // Refresh tables to get the new token
      const data = await ApiClient.get<{ tables: Table[] }>(
        `/tables?restaurantId=${restaurantContext?.id}`
      );
      setTables(data.tables);

      // Update selected table with the new data
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

  const handlePaymentComplete = () => {
    setShowPaymentInterface(false);
    setSelectedOrders([]);
    setOriginalOrders([]); // Clear original orders
    fetchTables(); // Refresh table list
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
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
            Tables
          </h1>
          <PermissionGuard permission="tables:write">
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg transition-transform active:scale-95"
            >
              <Plus className="w-6 h-6" />
            </button>
          </PermissionGuard>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search tables..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 font-medium text-gray-900 transition-all placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Main Grid */}
      <div className="p-4">
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
                setSelectedTable(table);
                setIsModalOpen(true);
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
          onSuccess={fetchTables}
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
