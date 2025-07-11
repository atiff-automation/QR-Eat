'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { QRCodeDisplay } from '@/components/tables/QRCodeDisplay';

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

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'layout'>('grid');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  useEffect(() => {
    fetchTables();
    // Set up real-time updates every 30 seconds
    const interval = setInterval(fetchTables, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchTables = async () => {
    try {
      const response = await fetch('/api/tables');
      const data = await response.json();

      if (response.ok) {
        setTables(data.tables);
      } else {
        setError(data.error || 'Failed to fetch tables');
      }
    } catch (error) {
      console.error('Failed to fetch tables:', error);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateTableStatus = async (tableId: string, status: string) => {
    try {
      const response = await fetch(`/api/tables/${tableId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        fetchTables(); // Refresh tables
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to update table status');
      }
    } catch (error) {
      console.error('Failed to update table status:', error);
      setError('Network error. Please try again.');
    }
  };

  const generateQRCode = (token: string) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/qr/${token}`;
  };

  const regenerateQRCode = async (tableId: string) => {
    try {
      const response = await fetch(`/api/tables/${tableId}/regenerate-qr`, {
        method: 'POST'
      });

      if (response.ok) {
        const data = await response.json();
        alert(`QR code regenerated successfully!\nNew URL: ${data.qrUrl}`);
        fetchTables(); // Refresh tables
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to regenerate QR code');
      }
    } catch (error) {
      console.error('Failed to regenerate QR code:', error);
      setError('Network error. Please try again.');
    }
  };

  const showTableQRCode = (table: Table) => {
    setSelectedTable(table);
    setShowQRCode(true);
  };

  const toggleTableSelection = (tableId: string) => {
    setSelectedTables(prev => 
      prev.includes(tableId) 
        ? prev.filter(id => id !== tableId)
        : [...prev, tableId]
    );
  };

  const selectAllTables = () => {
    setSelectedTables(tables.map(table => table.id));
  };

  const clearSelection = () => {
    setSelectedTables([]);
  };

  const generateBulkQRCodes = async () => {
    if (selectedTables.length === 0) {
      alert('Please select tables first');
      return;
    }

    try {
      const response = await fetch('/api/tables/bulk-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableIds: selectedTables })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Open print window with all QR codes
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(data.printHTML);
          printWindow.document.close();
          printWindow.focus();
          printWindow.print();
        }
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to generate QR codes');
      }
    } catch (error) {
      console.error('Failed to generate bulk QR codes:', error);
      setError('Network error. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'occupied':
        return 'bg-blue-100 text-blue-800';
      case 'reserved':
        return 'bg-yellow-100 text-yellow-800';
      case 'cleaning':
        return 'bg-orange-100 text-orange-800';
      case 'maintenance':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const statusOptions = [
    { value: 'available', label: 'Available' },
    { value: 'occupied', label: 'Occupied' },
    { value: 'reserved', label: 'Reserved' },
    { value: 'cleaning', label: 'Cleaning' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-gray-200 h-48 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Table Management</h1>
            <p className="text-gray-800">Monitor and manage restaurant tables</p>
            {selectedTables.length > 0 && (
              <p className="text-sm text-blue-600 mt-1">
                {selectedTables.length} table{selectedTables.length !== 1 ? 's' : ''} selected
              </p>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {/* Bulk Actions */}
            {selectedTables.length > 0 && (
              <div className="flex items-center space-x-2 mr-4 p-2 bg-blue-50 rounded-lg">
                <button
                  onClick={generateBulkQRCodes}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm font-medium"
                >
                  🖨️ Print QR Codes ({selectedTables.length})
                </button>
                <button
                  onClick={clearSelection}
                  className="text-gray-700 hover:text-gray-900 px-2 py-1 rounded text-sm"
                >
                  Clear
                </button>
              </div>
            )}
            
            {/* Selection Actions */}
            <div className="flex rounded-lg bg-gray-100 p-1">
              <button
                onClick={selectedTables.length === tables.length ? clearSelection : selectAllTables}
                className="px-3 py-1 text-sm font-medium rounded-md transition-colors bg-white text-gray-900 shadow-sm"
              >
                {selectedTables.length === tables.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            {/* View Mode Toggle */}
            <div className="flex rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Grid View
              </button>
              <button
                onClick={() => setViewMode('layout')}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  viewMode === 'layout'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Layout View
              </button>
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              Add Table
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-600">{error}</p>
          </div>
        )}

        {/* Tables Display */}
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {tables.map((table) => (
            <div key={table.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 relative">
              {/* Selection Checkbox */}
              <div className="absolute top-3 left-3">
                <input
                  type="checkbox"
                  checked={selectedTables.includes(table.id)}
                  onChange={() => toggleTableSelection(table.id)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </div>
              
              <div className="flex items-center justify-between mb-4 ml-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Table {table.tableNumber}
                </h3>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(table.status)}`}>
                  {table.status}
                </span>
              </div>

              {table.tableName && (
                <p className="text-sm text-gray-600 mb-2">{table.tableName}</p>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Capacity:</span>
                  <span className="text-gray-900">{table.capacity} guests</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Active Orders:</span>
                  <span className="text-gray-900">{table.currentOrders}</span>
                </div>
                {table.lastOrderAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Last Order:</span>
                    <span className="text-gray-900">
                      {new Date(table.lastOrderAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {table.locationDescription && (
                  <div className="text-sm">
                    <span className="text-gray-500">Location:</span>
                    <p className="text-gray-900 mt-1">{table.locationDescription}</p>
                  </div>
                )}
              </div>

              {/* Status Update */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Update Status
                </label>
                <select
                  value={table.status}
                  onChange={(e) => updateTableStatus(table.id, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900 font-medium bg-white"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value} className="text-gray-900 font-medium">
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* QR Code Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => showTableQRCode(table)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium"
                >
                  📱 View QR Code
                </button>
                <button
                  onClick={() => {
                    const qrUrl = generateQRCode(table.qrCodeToken);
                    navigator.clipboard.writeText(qrUrl);
                    alert('QR URL copied to clipboard!');
                  }}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-md text-sm font-medium"
                >
                  📋 Copy QR URL
                </button>
                <button
                  onClick={() => {
                    const qrUrl = generateQRCode(table.qrCodeToken);
                    window.open(qrUrl, '_blank');
                  }}
                  className="w-full bg-green-100 hover:bg-green-200 text-green-700 px-3 py-2 rounded-md text-sm font-medium"
                >
                  👁️ Preview Menu
                </button>
                <button
                  onClick={() => regenerateQRCode(table.id)}
                  className="w-full bg-orange-100 hover:bg-orange-200 text-orange-700 px-3 py-2 rounded-md text-sm font-medium"
                >
                  🔄 Regenerate QR
                </button>
              </div>
            </div>
            ))}
          </div>
        ) : (
          /* Layout View */
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Restaurant Floor Plan</h2>
              <p className="text-sm text-gray-600">Interactive table layout view</p>
            </div>
            
            <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-4 min-h-96">
              {tables.map((table, index) => (
                <div
                  key={table.id}
                  className={`relative flex items-center justify-center rounded-lg border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                    table.status === 'available' 
                      ? 'border-green-300 bg-green-50 hover:bg-green-100' 
                      : table.status === 'occupied'
                      ? 'border-blue-300 bg-blue-50 hover:bg-blue-100'
                      : table.status === 'reserved'
                      ? 'border-yellow-300 bg-yellow-50 hover:bg-yellow-100'
                      : table.status === 'cleaning'
                      ? 'border-orange-300 bg-orange-50 hover:bg-orange-100'
                      : 'border-red-300 bg-red-50 hover:bg-red-100'
                  }`}
                  style={{
                    aspectRatio: '1',
                    gridColumn: `span ${Math.min(table.capacity, 3)}`,
                  }}
                  title={`Table ${table.tableNumber} - ${table.status} (${table.capacity} guests)`}
                >
                  <div className="text-center">
                    <div className="text-lg font-bold text-gray-800">
                      T{table.tableNumber}
                    </div>
                    <div className="text-xs text-gray-600">
                      {table.capacity}👥
                    </div>
                    {table.currentOrders > 0 && (
                      <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                        {table.currentOrders}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Layout Legend */}
            <div className="mt-6 flex flex-wrap gap-4 justify-center text-sm">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-green-100 border border-green-300 rounded mr-2"></div>
                <span>Available</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded mr-2"></div>
                <span>Occupied</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded mr-2"></div>
                <span>Reserved</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded mr-2"></div>
                <span>Cleaning</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-red-100 border border-red-300 rounded mr-2"></div>
                <span>Maintenance</span>
              </div>
            </div>
          </div>
        )}

        {tables.length === 0 && !loading && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">🪑</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No tables found</h3>
            <p className="text-gray-600 mb-4">Get started by adding your first table</p>
            <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium">
              Add Table
            </button>
          </div>
        )}

        {/* Add Table Modal */}
        {showAddModal && <AddTableModal onClose={() => setShowAddModal(false)} onSuccess={fetchTables} />}
        
        {/* QR Code Display Modal */}
        {showQRCode && selectedTable && (
          <QRCodeDisplay
            tableId={selectedTable.id}
            tableNumber={selectedTable.tableNumber}
            tableName={selectedTable.tableName}
            restaurantName="Restaurant" // You can get this from the API or context
            onClose={() => {
              setShowQRCode(false);
              setSelectedTable(null);
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

// Add Table Modal Component
function AddTableModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    tableNumber: '',
    tableName: '',
    capacity: '',
    locationDescription: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        onSuccess();
        onClose();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to create table');
      }
    } catch (error) {
      console.error('Failed to create table:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Add New Table</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Table Number *
            </label>
            <input
              type="text"
              value={formData.tableNumber}
              onChange={(e) => setFormData({ ...formData, tableNumber: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Table Name
            </label>
            <input
              type="text"
              value={formData.tableName}
              onChange={(e) => setFormData({ ...formData, tableName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              placeholder="e.g., Window Table"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Capacity *
            </label>
            <input
              type="number"
              value={formData.capacity}
              onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              min="1"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location Description
            </label>
            <textarea
              value={formData.locationDescription}
              onChange={(e) => setFormData({ ...formData, locationDescription: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-900"
              rows={2}
              placeholder="e.g., Near the window, by the bar"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}