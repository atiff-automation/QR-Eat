/**
 * Role Assignment Modal Component
 * 
 * Allows platform administrators to assign, update, and remove roles for users.
 * Includes role template selection, restaurant context, and custom permissions.
 */

'use client';

import { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  Plus, 
  Trash2, 
  Building2, 
  Shield, 
  Users, 
  Check,
  AlertTriangle,
  User,
  Settings
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  userType: 'platform_admin' | 'restaurant_owner' | 'staff';
  rbacData?: {
    roles: UserRole[];
    permissions: string[];
    permissionCount: number;
  };
}

interface UserRole {
  id: string;
  roleTemplate: string;
  userType: string;
  restaurantId?: string;
  restaurant?: {
    id: string;
    name: string;
    slug: string;
  };
  customPermissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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

interface RoleAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onRoleUpdated: () => void;
}

export function RoleAssignmentModal({ 
  isOpen, 
  onClose, 
  user, 
  onRoleUpdated 
}: RoleAssignmentModalProps) {
  const { hasPermission } = useRole();
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [selectedUserType, setSelectedUserType] = useState<string>('');
  const [selectedRoleTemplate, setSelectedRoleTemplate] = useState<string>('');
  const [selectedRestaurant, setSelectedRestaurant] = useState<string>('');
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (user && !editingRoleId) {
        resetForm();
      }
    }
  }, [isOpen, user, editingRoleId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch role templates
      const templatesResponse = await fetch('/api/admin/role-templates');
      if (templatesResponse.ok) {
        const templatesData = await templatesResponse.json();
        setRoleTemplates(templatesData.templates || []);
      }

      // Fetch restaurants
      const restaurantsResponse = await fetch('/api/admin/restaurants');
      if (restaurantsResponse.ok) {
        const restaurantsData = await restaurantsResponse.json();
        setRestaurants(restaurantsData.restaurants || []);
      }

      // Fetch permissions
      const permissionsResponse = await fetch('/api/admin/permissions');
      if (permissionsResponse.ok) {
        const permissionsData = await permissionsResponse.json();
        setPermissions(permissionsData.permissions || []);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedUserType(user?.userType || '');
    setSelectedRoleTemplate('');
    setSelectedRestaurant('');
    setCustomPermissions([]);
    setEditingRoleId(null);
  };

  const loadRoleForEditing = (role: UserRole) => {
    setEditingRoleId(role.id);
    setSelectedUserType(role.userType);
    setSelectedRoleTemplate(role.roleTemplate);
    setSelectedRestaurant(role.restaurantId || '');
    setCustomPermissions(role.customPermissions || []);
  };

  const handleSaveRole = async () => {
    if (!user || !selectedUserType || !selectedRoleTemplate) {
      return;
    }

    setSaving(true);
    try {
      const payload = {
        userId: user.id,
        userType: selectedUserType,
        roleTemplate: selectedRoleTemplate,
        restaurantId: selectedRestaurant || null,
        customPermissions: customPermissions.length > 0 ? customPermissions : null,
      };

      const response = editingRoleId
        ? await fetch(`/api/admin/users`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roleId: editingRoleId, ...payload }),
          })
        : await fetch(`/api/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (response.ok) {
        onRoleUpdated();
        resetForm();
        onClose();
      } else {
        const errorData = await response.json();
        alert(`Failed to save role: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Failed to save role:', error);
      alert('Failed to save role. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Are you sure you want to remove this role?')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId }),
      });

      if (response.ok) {
        onRoleUpdated();
        resetForm();
      } else {
        const errorData = await response.json();
        alert(`Failed to delete role: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Failed to delete role:', error);
      alert('Failed to delete role. Please try again.');
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

  const requiresRestaurant = selectedUserType === 'restaurant_owner' || selectedUserType === 'staff';

  if (!isOpen || !user) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {editingRoleId ? 'Edit Role' : 'Assign Role'}
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

          {loading ? (
            <div className="px-6 py-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          ) : (
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Current Roles */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-4">Current Roles</h4>
                  <div className="space-y-3">
                    {user.rbacData?.roles && user.rbacData.roles.length > 0 ? (
                      user.rbacData.roles.map((role) => (
                        <div
                          key={role.id}
                          className={`p-4 border rounded-lg ${
                            editingRoleId === role.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center">
                                {role.userType === 'platform_admin' && <Shield className="h-4 w-4 text-purple-600 mr-2" />}
                                {role.userType === 'restaurant_owner' && <Building2 className="h-4 w-4 text-blue-600 mr-2" />}
                                {role.userType === 'staff' && <Users className="h-4 w-4 text-green-600 mr-2" />}
                                <span className="font-medium text-sm">
                                  {role.roleTemplate.replace('_', ' ')}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {role.userType.replace('_', ' ')}
                                {role.restaurant && ` • ${role.restaurant.name}`}
                              </div>
                              {role.customPermissions.length > 0 && (
                                <div className="text-xs text-blue-600 mt-1">
                                  +{role.customPermissions.length} custom permissions
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => loadRoleForEditing(role)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Settings className="h-4 w-4" />
                              </button>
                              {hasPermission('users:delete') && (
                                <button
                                  onClick={() => handleDeleteRole(role.id)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <User className="h-8 w-8 mx-auto mb-2" />
                        <p>No roles assigned</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Role Assignment Form */}
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-4">
                    {editingRoleId ? 'Edit Role' : 'Assign New Role'}
                  </h4>
                  
                  <div className="space-y-4">
                    {/* User Type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        User Type
                      </label>
                      <select
                        value={selectedUserType}
                        onChange={(e) => setSelectedUserType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        disabled={!!editingRoleId}
                      >
                        <option value="">Select user type</option>
                        <option value="platform_admin">Platform Admin</option>
                        <option value="restaurant_owner">Restaurant Owner</option>
                        <option value="staff">Staff</option>
                      </select>
                    </div>

                    {/* Role Template */}
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

                    {/* Restaurant Selection */}
                    {requiresRestaurant && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Restaurant Context
                          {requiresRestaurant && <span className="text-red-500">*</span>}
                        </label>
                        <select
                          value={selectedRestaurant}
                          onChange={(e) => setSelectedRestaurant(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                          required={requiresRestaurant}
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

                    {/* Template Permissions Preview */}
                    {selectedRoleTemplate && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Template Permissions
                        </label>
                        <div className="bg-gray-50 p-3 rounded-md max-h-32 overflow-y-auto">
                          <div className="flex flex-wrap gap-1">
                            {getSelectedTemplatePermissions().map((permission) => (
                              <span
                                key={permission}
                                className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800"
                              >
                                {permission}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Custom Permissions */}
                    {selectedRoleTemplate && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Additional Custom Permissions
                        </label>
                        <div className="border border-gray-300 rounded-md max-h-48 overflow-y-auto">
                          {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
                            <div key={category} className="p-3 border-b border-gray-200 last:border-b-0">
                              <h5 className="font-medium text-sm text-gray-900 mb-2 capitalize">
                                {category}
                              </h5>
                              <div className="space-y-2">
                                {categoryPermissions.map((permission) => {
                                  const isTemplatePermission = getSelectedTemplatePermissions().includes(permission.permissionKey);
                                  const isCustomSelected = customPermissions.includes(permission.permissionKey);
                                  
                                  return (
                                    <label
                                      key={permission.id}
                                      className={`flex items-center space-x-2 p-2 rounded cursor-pointer ${
                                        isTemplatePermission 
                                          ? 'bg-blue-50 opacity-50 cursor-not-allowed' 
                                          : isCustomSelected 
                                            ? 'bg-green-50' 
                                            : 'hover:bg-gray-50'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isTemplatePermission || isCustomSelected}
                                        onChange={() => !isTemplatePermission && handleCustomPermissionToggle(permission.permissionKey)}
                                        disabled={isTemplatePermission}
                                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                      />
                                      <div className="flex-1">
                                        <div className="text-sm font-medium">
                                          {permission.permissionKey}
                                          {isTemplatePermission && (
                                            <span className="ml-2 text-xs text-blue-600">(from template)</span>
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {permission.description}
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center text-sm text-gray-600">
              {requiresRestaurant && !selectedRestaurant && (
                <div className="flex items-center text-red-600">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Restaurant selection required
                </div>
              )}
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              
              {editingRoleId && (
                <button
                  onClick={resetForm}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Add New Role
                </button>
              )}
              
              {hasPermission('users:write') && (
                <button
                  onClick={handleSaveRole}
                  disabled={saving || !selectedUserType || !selectedRoleTemplate || (requiresRestaurant && !selectedRestaurant)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {editingRoleId ? 'Update Role' : 'Assign Role'}
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