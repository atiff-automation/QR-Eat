/**
 * Role History Modal Component
 * 
 * Displays the complete history of role changes for a user, including:
 * - Role assignments and removals
 * - Permission changes
 * - Administrative actions
 * - Audit trail information
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  X, 
  History, 
  Calendar, 
  User, 
  Shield, 
  Building2, 
  Plus, 
  Minus, 
  Edit, 
  Trash2, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Filter,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  Activity,
  Settings
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'platform_admin' | 'restaurant_owner' | 'staff';
}

interface RoleHistoryEntry {
  id: string;
  userId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTIVATE' | 'DEACTIVATE';
  actionType: 'role_assignment' | 'permission_change' | 'status_change';
  performedBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
  timestamp: string;
  details: {
    roleTemplate?: string;
    userType?: string;
    restaurantId?: string;
    restaurant?: {
      id: string;
      name: string;
      slug: string;
    };
    changes?: {
      before?: any;
      after?: any;
    };
    customPermissions?: string[];
    reason?: string;
  };
  metadata: {
    ipAddress: string;
    userAgent: string;
    sessionId?: string;
    source: 'admin_panel' | 'api' | 'system';
  };
  severity: 'low' | 'medium' | 'high';
}

interface RoleHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export function RoleHistoryModal({ isOpen, onClose, user }: RoleHistoryModalProps) {
  const { hasPermission } = useRole();
  const [history, setHistory] = useState<RoleHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: ''
  });
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [entriesPerPage] = useState(10);

  useEffect(() => {
    if (isOpen && user) {
      fetchRoleHistory();
    }
  }, [isOpen, user]);

  const fetchRoleHistory = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        userId: user.id,
        ...(actionFilter !== 'all' && { action: actionFilter }),
        ...(severityFilter !== 'all' && { severity: severityFilter }),
        ...(dateRange.start && { startDate: dateRange.start }),
        ...(dateRange.end && { endDate: dateRange.end }),
        ...(searchTerm && { search: searchTerm })
      });

      const response = await fetch(`/api/admin/audit/user-roles?${params}`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data.entries || []);
      } else {
        console.error('Failed to fetch role history:', response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch role history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchRoleHistory();
  };

  const toggleEntryExpansion = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const getActionIcon = (action: string, actionType: string) => {
    switch (action) {
      case 'CREATE':
        return <Plus className="h-4 w-4 text-green-600" />;
      case 'UPDATE':
        return <Edit className="h-4 w-4 text-blue-600" />;
      case 'DELETE':
        return <Trash2 className="h-4 w-4 text-red-600" />;
      case 'ACTIVATE':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'DEACTIVATE':
        return <AlertCircle className="h-4 w-4 text-orange-600" />;
      default:
        return <Activity className="h-4 w-4 text-gray-600" />;
    }
  };

  const getActionDescription = (entry: RoleHistoryEntry) => {
    const { action, details } = entry;
    
    switch (action) {
      case 'CREATE':
        return `Assigned ${details.roleTemplate?.replace('_', ' ')} role${details.restaurant ? ` for ${details.restaurant.name}` : ''}`;
      case 'UPDATE':
        if (details.changes) {
          const changes = [];
          if (details.changes.roleTemplate) {
            changes.push(`role template from ${details.changes.before?.roleTemplate} to ${details.changes.after?.roleTemplate}`);
          }
          if (details.changes.customPermissions) {
            changes.push('custom permissions');
          }
          return `Updated ${changes.join(' and ')}`;
        }
        return 'Updated role';
      case 'DELETE':
        return `Removed ${details.roleTemplate?.replace('_', ' ')} role${details.restaurant ? ` from ${details.restaurant.name}` : ''}`;
      case 'ACTIVATE':
        return `Activated ${details.roleTemplate?.replace('_', ' ')} role`;
      case 'DEACTIVATE':
        return `Deactivated ${details.roleTemplate?.replace('_', ' ')} role`;
      default:
        return 'Unknown action';
    }
  };

  const getSeverityBadge = (severity: string) => {
    const colors = {
      low: 'bg-gray-100 text-gray-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800'
    };

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[severity] || colors.low}`}>
        {severity}
      </span>
    );
  };

  const exportHistory = async () => {
    if (!user) return;

    try {
      const params = new URLSearchParams({
        userId: user.id,
        format: 'csv',
        ...(actionFilter !== 'all' && { action: actionFilter }),
        ...(severityFilter !== 'all' && { severity: severityFilter }),
        ...(dateRange.start && { startDate: dateRange.start }),
        ...(dateRange.end && { endDate: dateRange.end })
      });

      window.open(`/api/admin/audit/user-roles/export?${params}`, '_blank');
    } catch (error) {
      console.error('Failed to export history:', error);
    }
  };

  const filteredHistory = history.filter(entry => {
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      return (
        entry.performedBy.email.toLowerCase().includes(searchLower) ||
        entry.performedBy.firstName.toLowerCase().includes(searchLower) ||
        entry.performedBy.lastName.toLowerCase().includes(searchLower) ||
        entry.details.roleTemplate?.toLowerCase().includes(searchLower) ||
        entry.details.restaurant?.name.toLowerCase().includes(searchLower)
      );
    }
    return true;
  });

  const paginatedHistory = filteredHistory.slice(
    (currentPage - 1) * entriesPerPage,
    currentPage * entriesPerPage
  );

  const totalPages = Math.ceil(filteredHistory.length / entriesPerPage);

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-6xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900 flex items-center">
                  <History className="h-5 w-5 mr-2" />
                  Role History
                </h3>
                <p className="text-sm text-gray-500">
                  {user.firstName} {user.lastName} ({user.email})
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search actions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">All Actions</option>
                  <option value="CREATE">Created</option>
                  <option value="UPDATE">Updated</option>
                  <option value="DELETE">Deleted</option>
                  <option value="ACTIVATE">Activated</option>
                  <option value="DEACTIVATE">Deactivated</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">All Severity</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="flex items-end space-x-2">
                <button
                  onClick={handleSearch}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <Filter className="h-4 w-4 mr-1 inline" />
                  Filter
                </button>
                {hasPermission('audit:export') && (
                  <button
                    onClick={exportHistory}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <Download className="h-4 w-4 mr-1 inline" />
                    Export
                  </button>
                )}
              </div>
            </div>

            {/* Date Range */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
            </div>
          </div>

          {/* History List */}
          <div className="px-6 py-4 max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading history...</p>
              </div>
            ) : paginatedHistory.length > 0 ? (
              <div className="space-y-4">
                {paginatedHistory.map((entry) => (
                  <div
                    key={entry.id}
                    className="border border-gray-200 rounded-lg overflow-hidden"
                  >
                    <div className="p-4 bg-white">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          {getActionIcon(entry.action, entry.actionType)}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {getActionDescription(entry)}
                            </div>
                            <div className="text-xs text-gray-500 flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {new Date(entry.timestamp).toLocaleString()}
                              <User className="h-3 w-3 ml-3 mr-1" />
                              {entry.performedBy.firstName} {entry.performedBy.lastName}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {getSeverityBadge(entry.severity)}
                          <button
                            onClick={() => toggleEntryExpansion(entry.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {expandedEntries.has(entry.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {expandedEntries.has(entry.id) && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <h5 className="font-medium text-gray-900 mb-2">Details</h5>
                              <div className="space-y-1 text-gray-600">
                                {entry.details.roleTemplate && (
                                  <div>Role Template: {entry.details.roleTemplate.replace('_', ' ')}</div>
                                )}
                                {entry.details.userType && (
                                  <div>User Type: {entry.details.userType.replace('_', ' ')}</div>
                                )}
                                {entry.details.restaurant && (
                                  <div>Restaurant: {entry.details.restaurant.name}</div>
                                )}
                                {entry.details.customPermissions && entry.details.customPermissions.length > 0 && (
                                  <div>Custom Permissions: {entry.details.customPermissions.length}</div>
                                )}
                                {entry.details.reason && (
                                  <div>Reason: {entry.details.reason}</div>
                                )}
                              </div>
                            </div>

                            <div>
                              <h5 className="font-medium text-gray-900 mb-2">Metadata</h5>
                              <div className="space-y-1 text-xs text-gray-500">
                                <div>IP: {entry.metadata.ipAddress}</div>
                                <div>Source: {entry.metadata.source}</div>
                                {entry.metadata.sessionId && (
                                  <div>Session: {entry.metadata.sessionId.substring(0, 8)}...</div>
                                )}
                                <div>User Agent: {entry.metadata.userAgent.substring(0, 50)}...</div>
                              </div>
                            </div>

                            {entry.details.changes && (
                              <div className="md:col-span-2">
                                <h5 className="font-medium text-gray-900 mb-2">Changes</h5>
                                <div className="bg-gray-50 p-3 rounded-md">
                                  <pre className="text-xs text-gray-600 whitespace-pre-wrap">
                                    {JSON.stringify(entry.details.changes, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">No role history found</p>
                <p className="text-sm text-gray-400 mt-2">
                  Try adjusting your filters or search criteria
                </p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {(currentPage - 1) * entriesPerPage + 1} to{' '}
                  {Math.min(currentPage * entriesPerPage, filteredHistory.length)} of{' '}
                  {filteredHistory.length} entries
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 text-sm rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 text-sm rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}