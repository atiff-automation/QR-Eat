/**
 * Bulk Role Operations Modal Component
 * 
 * Allows platform administrators to perform bulk operations on user roles:
 * - Assign roles to multiple users
 * - Remove roles from multiple users
 * - Update role permissions for multiple users
 * - Activate/deactivate roles for multiple users
 */

'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Users,
  Shield,
  Building2,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  AlertTriangle,
  Settings,
  Save,
  Download,
  Upload,
  Activity,
  UserCheck,
  UserX,
  RotateCcw
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'platform_admin' | 'restaurant_owner' | 'staff';
  isActive: boolean;
}

interface RoleTemplate {
  template: string;
  permissions: string[];
  permissionCount: number;
  categories: string[];
  description: string;
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

interface Permission {
  id: string;
  permissionKey: string;
  description: string;
  category: string;
  isActive: boolean;
}

interface BulkOperationResult {
  userId: string;
  userName: string;
  success: boolean;
  error?: string;
}

interface BulkRoleOperationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedUserIds: string[];
  onOperationComplete: () => void;
}

export function BulkRoleOperationsModal({ 
  isOpen, 
  onClose, 
  selectedUserIds, 
  onOperationComplete 
}: BulkRoleOperationsModalProps) {
  const { hasPermission } = useRole();
  const [users, setUsers] = useState<User[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Operation state
  const [operation, setOperation] = useState<'assign' | 'remove' | 'update' | 'activate' | 'deactivate'>('assign');
  const [selectedRoleTemplate, setSelectedRoleTemplate] = useState<string>('');
  const [selectedUserType, setSelectedUserType] = useState<string>('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('');
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [reason, setReason] = useState<string>('');
  
  // Results state
  const [operationResults, setOperationResults] = useState<BulkOperationResult[]>([]);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      fetchSelectedUsers();
    }
  }, [isOpen, selectedUserIds]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch role templates
      const templatesResult = await ApiClient.get<{
        templates: RoleTemplate[];
      }>('/api/admin/role-templates');
      if (templatesResult.ok && templatesResult.data) {
        setRoleTemplates(templatesResult.data.templates || []);
      }

      // Fetch restaurants
      const restaurantsResult = await ApiClient.get<{
        restaurants: Restaurant[];
      }>('/api/admin/restaurants');
      if (restaurantsResult.ok && restaurantsResult.data) {
        setRestaurants(restaurantsResult.data.restaurants || []);
      }

      // Fetch permissions
      const permissionsResult = await ApiClient.get<{
        permissions: Permission[];
      }>('/api/admin/permissions');
      if (permissionsResult.ok && permissionsResult.data) {
        setPermissions(permissionsResult.data.permissions || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSelectedUsers = async () => {
    if (selectedUserIds.length === 0) return;

    try {
      const data = await ApiClient.post<{
        users: User[];
      }>('/api/admin/users', {
        userIds: selectedUserIds,
        action: 'get_bulk'
      });

      setUsers(data.users || []);
    } catch (error) {
      console.error('Failed to fetch selected users:', error);
    }
  };

  const handleBulkOperation = async () => {
    if (!operation || selectedUserIds.length === 0) return;

    // Validate required fields based on operation
    if (operation === 'assign' || operation === 'update') {
      if (!selectedUserType || !selectedRoleTemplate) {
        alert('User type and role template are required');
        return;
      }

      if ((selectedUserType === 'restaurant_owner' || selectedUserType === 'staff') && !selectedRestaurant) {
        alert('Restaurant selection is required for restaurant owners and staff');
        return;
      }
    }

    setProcessing(true);
    setOperationResults([]);

    try {
      const payload = {
        operation,
        userIds: selectedUserIds,
        ...(operation === 'assign' || operation === 'update') && {
          userType: selectedUserType,
          roleTemplate: selectedRoleTemplate,
          restaurantId: selectedRestaurant || null,
          customPermissions: customPermissions.length > 0 ? customPermissions : null
        },
        reason
      };

      const data = await ApiClient.post<{
        results: BulkOperationResult[];
        success: boolean;
        error?: string;
      }>('/api/admin/users/bulk', payload);

      setOperationResults(data.results || []);
      setShowResults(true);

      if (data.success) {
        onOperationComplete();
      }
    } catch (error) {
      console.error('Bulk operation failed:', error);
      if (error instanceof ApiClientError) {
        alert(`Bulk operation failed: ${error.message}`);
      } else {
        alert('Bulk operation failed. Please try again.');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleCustomPermissionToggle = (permissionKey: string) => {
    if (customPermissions.includes(permissionKey)) {
      setCustomPermissions(customPermissions.filter(p => p !== permissionKey));
    } else {
      setCustomPermissions([...customPermissions, permissionKey]);
    }
  };

  const getSelectedTemplatePermissions = () => {
    const template = roleTemplates.find(t => t.template === selectedRoleTemplate);
    return template?.permissions || [];
  };

  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);

  const getOperationIcon = (op: string) => {
    switch (op) {
      case 'assign':
        return <Plus className="h-5 w-5 text-green-600" />;
      case 'remove':
        return <Trash2 className="h-5 w-5 text-red-600" />;
      case 'update':
        return <Edit className="h-5 w-5 text-blue-600" />;
      case 'activate':
        return <UserCheck className="h-5 w-5 text-green-600" />;
      case 'deactivate':
        return <UserX className="h-5 w-5 text-orange-600" />;
      default:
        return <Settings className="h-5 w-5 text-gray-600" />;
    }
  };

  const getOperationDescription = (op: string) => {
    switch (op) {
      case 'assign':
        return 'Assign new roles to selected users';
      case 'remove':
        return 'Remove specific roles from selected users';
      case 'update':
        return 'Update existing roles for selected users';
      case 'activate':
        return 'Activate roles for selected users';
      case 'deactivate':
        return 'Deactivate roles for selected users';
      default:
        return 'Select an operation';
    }
  };

  const resetForm = () => {
    setOperation('assign');
    setSelectedRoleTemplate('');
    setSelectedUserType('');
    setSelectedRestaurant('');
    setCustomPermissions([]);
    setReason('');
    setOperationResults([]);
    setShowResults(false);
  };

  const exportResults = () => {
    const csvContent = [
      'User ID,User Name,Email,Success,Error',
      ...operationResults.map(result => 
        `${result.userId},"${result.userName}","${users.find(u => u.id === result.userId)?.email || 'Unknown'}",${result.success ? 'Yes' : 'No'},"${result.error || ''}"`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-operation-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

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
                  <Users className="h-5 w-5 mr-2" />
                  Bulk Role Operations
                </h3>
                <p className="text-sm text-gray-500">
                  Perform bulk operations on {selectedUserIds.length} selected users
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

          {loading ? (
            <div className="px-6 py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          ) : showResults ? (
            /* Results View */
            <div className="px-6 py-4">
              <div className="mb-4 flex items-center justify-between">
                <h4 className="text-lg font-medium text-gray-900">Operation Results</h4>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={exportResults}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Results
                  </button>
                  <button
                    onClick={resetForm}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    New Operation
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {operationResults.filter(r => r.success).length}
                    </div>
                    <div className="text-sm text-gray-600">Successful</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {operationResults.filter(r => !r.success).length}
                    </div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-600">
                      {operationResults.length}
                    </div>
                    <div className="text-sm text-gray-600">Total</div>
                  </div>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {operationResults.map((result) => (
                  <div
                    key={result.userId}
                    className={`p-3 rounded-lg border ${
                      result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        {result.success ? (
                          <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                        )}
                        <span className="font-medium">{result.userName}</span>
                      </div>
                      {!result.success && result.error && (
                        <span className="text-sm text-red-600">{result.error}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* Operation Configuration */
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Selected Users */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-4">Selected Users ({users.length})</h4>
                  <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
                    {users.map((user) => (
                      <div key={user.id} className="p-3 border-b border-gray-200 last:border-b-0">
                        <div className="flex items-center">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center">
                            <span className="text-xs font-medium text-white">
                              {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                            </span>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {user.firstName} {user.lastName}
                            </div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                            <div className="text-xs text-gray-500">
                              {user.userType.replace('_', ' ')} • {user.isActive ? 'Active' : 'Inactive'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column - Operation Configuration */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-4">Operation Configuration</h4>
                  
                  <div className="space-y-4">
                    {/* Operation Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Operation Type
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(['assign', 'remove', 'update', 'activate', 'deactivate'] as const).map((op) => (
                          <label
                            key={op}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer ${
                              operation === op
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="operation"
                              value={op}
                              checked={operation === op}
                              onChange={(e) => setOperation(e.target.value as any)}
                              className="sr-only"
                            />
                            <div className="flex items-center">
                              {getOperationIcon(op)}
                              <div className="ml-2">
                                <div className="text-sm font-medium capitalize">{op}</div>
                                <div className="text-xs text-gray-500">
                                  {getOperationDescription(op)}
                                </div>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Role Configuration (for assign/update operations) */}
                    {(operation === 'assign' || operation === 'update') && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            User Type
                          </label>
                          <select
                            value={selectedUserType}
                            onChange={(e) => setSelectedUserType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Select user type</option>
                            <option value="platform_admin">Platform Admin</option>
                            <option value="restaurant_owner">Restaurant Owner</option>
                            <option value="staff">Staff</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Role Template
                          </label>
                          <select
                            value={selectedRoleTemplate}
                            onChange={(e) => setSelectedRoleTemplate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            disabled={!selectedUserType}
                          >
                            <option value="">Select role template</option>
                            {roleTemplates.map((template) => (
                              <option key={template.template} value={template.template}>
                                {template.template.replace('_', ' ')} ({template.permissionCount} permissions)
                              </option>
                            ))}
                          </select>
                        </div>

                        {(selectedUserType === 'restaurant_owner' || selectedUserType === 'staff') && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Restaurant Context
                              <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={selectedRestaurant}
                              onChange={(e) => setSelectedRestaurant(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                              required
                            >
                              <option value="">Select restaurant</option>
                              {restaurants.filter(r => r.isActive).map((restaurant) => (
                                <option key={restaurant.id} value={restaurant.id}>
                                  {restaurant.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </>
                    )}

                    {/* Reason */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Reason (Optional)
                      </label>
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Provide a reason for this bulk operation..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              {processing ? 'Processing...' : showResults ? 'Operation completed' : `${selectedUserIds.length} users selected`}
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                {showResults ? 'Close' : 'Cancel'}
              </button>
              
              {!showResults && hasPermission('users:write') && (
                <button
                  onClick={handleBulkOperation}
                  disabled={processing || selectedUserIds.length === 0}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      {getOperationIcon(operation)}
                      <span className="ml-2">Execute Operation</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}