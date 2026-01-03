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
import { ChefHat, Plus, Search } from 'lucide-react';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { POLLING_INTERVALS } from '@/lib/constants/polling-config';

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

  useEffect(() => {
    if (restaurantContext?.id) {
      fetchTables();
      const interval = setInterval(fetchTables, POLLING_INTERVALS.TABLES);
      return () => clearInterval(interval);
    }
  }, [restaurantContext?.id, fetchTables]);

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
  const handleTileClick = (table: Table) => {
    setSelectedTable(table);
    setIsModalOpen(true);
  };

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
      const data = await ApiClient.post<{ qrUrl: string }>(
        `/tables/${tableId}/regenerate-qr`
      );
      alert(`QR code regenerated successfully!\nNew URL: ${data.qrUrl}`);
      fetchTables();
      setIsModalOpen(false); // Close drawer to force refresh contexts if needed
    } catch {
      alert('Failed to regenerate QR');
    }
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

        {filteredTables.length > 0 ? (
          <div className="grid grid-cols-3 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {filteredTables.map((table) => (
              <TableTile
                key={table.id}
                table={table}
                onClick={() => handleTileClick(table)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ChefHat className="w-16 h-16 mb-4 opacity-20" />
            <p className="font-medium">No tables found</p>
          </div>
        )}
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
          setIsModalOpen(false);
          setTimeout(() => {
            setSelectedTable(table);
            setShowQRCodeModal(true);
          }, 300);
        }}
        onRegenerateQR={regenerateQRCode}
      />

      {/* QR Code Modal */}
      {showQRCodeModal && selectedTable && (
        <QRCodeDisplay
          tableId={selectedTable.id}
          tableNumber={selectedTable.tableNumber}
          tableName={selectedTable.tableName}
          restaurantName="Restaurant"
          onClose={() => {
            setShowQRCodeModal(false);
            // Re-open drawer when closing QR? Maybe not.
          }}
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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
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
