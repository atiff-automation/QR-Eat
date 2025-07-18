/**
 * Permission Manager Component for RBAC System
 * 
 * This component provides comprehensive permission management functionality,
 * implementing the specifications from the RBAC Implementation Plan.
 * 
 * Features:
 * - Role template permission management
 * - Permission viewing and editing
 * - Category-based organization
 * - Real-time updates and validation
 */

'use client';

import { useState, useEffect } from 'react';
import { useRole } from '@/components/rbac/RoleProvider';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { 
  Shield, 
  Users, 
  Settings, 
  Plus, 
  Search, 
  Filter,
  Check,
  X,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

interface Permission {
  id: string;
  permissionKey: string;
  description: string;
  category: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RoleTemplate {
  template: string;
  permissions: Permission[];
  permissionCount: number;
  categories: string[];
  description: string;
  usage?: {
    userCount: number;
    lastUsed: string | null;
  };
}

interface PermissionCategory {
  name: string;
  count: number;
}

export function PermissionManager() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [categories, setCategories] = useState<PermissionCategory[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCreatePermission, setShowCreatePermission] = useState(false);
  
  useEffect(() => {
    fetchPermissions();
    fetchRoleTemplates();
  }, []);
  
  const fetchPermissions = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append('category', selectedCategory);
      if (searchTerm) params.append('search', searchTerm);
      params.append('includeInactive', 'true');
      
      const response = await fetch(`/api/admin/permissions?${params}`);
      const data = await response.json();
      
      if (response.ok) {
        setPermissions(data.permissions);
        setCategories(data.categories);
      } else {
        setError(data.error || 'Failed to fetch permissions');
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
      setError('Network error. Please try again.');
    }
  };
  
  const fetchRoleTemplates = async () => {
    try {
      const response = await fetch('/api/admin/role-templates?includeStats=true');
      const data = await response.json();
      
      if (response.ok) {
        setRoleTemplates(data.templates);
      } else {
        setError(data.error || 'Failed to fetch role templates');
      }
    } catch (error) {
      console.error('Failed to fetch role templates:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const updateRolePermissions = async (template: string, permissions: string[]) => {
    setIsSaving(true);
    setError('');
    
    try {
      const response = await fetch('/api/admin/role-templates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          template, 
          permissions,
          action: 'replace'
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        await fetchRoleTemplates();
        setSuccessMessage(`Role template "${template}" updated successfully`);
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(data.error || 'Failed to update role permissions');
      }
    } catch (error) {
      console.error('Failed to update role permissions:', error);
      setError('Network error. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };
  
  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);
  
  const currentTemplate = roleTemplates.find(t => t.template === selectedTemplate);
  const currentTemplatePermissions = currentTemplate?.permissions.map(p => p.permissionKey) || [];
  
  const getRoleTemplateColor = (template: string) => {
    const colors = {
      platform_admin: 'bg-red-100 text-red-800 border-red-200',
      restaurant_owner: 'bg-purple-100 text-purple-800 border-purple-200',
      manager: 'bg-blue-100 text-blue-800 border-blue-200',
      kitchen_staff: 'bg-orange-100 text-orange-800 border-orange-200',
      waitstaff: 'bg-green-100 text-green-800 border-green-200',
    };
    return colors[template as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200';
  };
  
  const getRoleIcon = (template: string) => {
    switch (template) {
      case 'platform_admin':
        return <Shield className="h-4 w-4" />;
      case 'restaurant_owner':
      case 'manager':
        return <Users className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading permission management...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-2">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
          <button 
            onClick={() => setError('')}
            className="ml-auto text-red-600 hover:text-red-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-2">
          <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
          <span className="text-green-700">{successMessage}</span>
          <button 
            onClick={() => setSuccessMessage('')}
            className="ml-auto text-green-600 hover:text-green-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      
      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search permissions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            {/* Category Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category.name} value={category.name}>
                    {category.name} ({category.count})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Apply Filters */}
            <button
              onClick={fetchPermissions}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              Apply Filters
            </button>
          </div>
          
          <PermissionGuard permission="permissions:write">
            <button
              onClick={() => setShowCreatePermission(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium flex items-center space-x-2"
            >
              <Plus className="h-4 w-4" />
              <span>Add Permission</span>
            </button>
          </PermissionGuard>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Templates */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Role Templates</h2>
            <p className="text-sm text-gray-600 mt-1">
              Select a role template to manage its permissions
            </p>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {roleTemplates.map((template) => (
                <button
                  key={template.template}
                  onClick={() => setSelectedTemplate(template.template)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                    selectedTemplate === template.template
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getRoleIcon(template.template)}
                      <div>
                        <div className="font-medium text-gray-900">
                          {template.template.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        <div className="text-sm text-gray-500">
                          {template.description}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getRoleTemplateColor(template.template)}`}>
                        {template.permissionCount} permissions
                      </div>
                      {template.usage && (
                        <div className="text-xs text-gray-500 mt-1">
                          {template.usage.userCount} users
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        
        {/* Permissions */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Permissions
              {selectedTemplate && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  for {selectedTemplate.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              )}
            </h2>
            {isSaving && (
              <div className="flex items-center space-x-2 mt-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-600">Saving changes...</span>
              </div>
            )}
          </div>
          
          <div className="p-6 max-h-96 overflow-y-auto">
            {selectedTemplate ? (
              <div className="space-y-4">
                {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
                  <div key={category} className="border rounded-lg">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-t-lg"
                    >
                      <div className="flex items-center space-x-2">
                        {expandedCategories.has(category) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="font-medium text-gray-900 capitalize">
                          {category}
                        </span>
                        <span className="text-sm text-gray-500">
                          ({categoryPermissions.length})
                        </span>
                      </div>
                    </button>
                    
                    {expandedCategories.has(category) && (
                      <div className="p-3 space-y-2 border-t border-gray-200">
                        {categoryPermissions.map((permission) => {
                          const hasPermission = currentTemplatePermissions.includes(permission.permissionKey);
                          
                          return (
                            <PermissionGuard key={permission.id} permission="role_templates:write">
                              <label className="flex items-start space-x-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={hasPermission}
                                  onChange={(e) => {
                                    if (currentTemplate) {
                                      const newPermissions = e.target.checked
                                        ? [...currentTemplatePermissions, permission.permissionKey]
                                        : currentTemplatePermissions.filter(p => p !== permission.permissionKey);
                                      updateRolePermissions(selectedTemplate, newPermissions);
                                    }
                                  }}
                                  disabled={isSaving || !permission.isActive}
                                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-1"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className={`font-medium text-sm ${permission.isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {permission.permissionKey}
                                    {!permission.isActive && (
                                      <span className="ml-2 text-xs text-red-500">(Inactive)</span>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    {permission.description}
                                  </div>
                                </div>
                              </label>
                            </PermissionGuard>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Select a role template to view and manage permissions</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Permission Statistics */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Permission Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-600">{permissions.length}</div>
            <div className="text-sm text-blue-600">Total Permissions</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-600">
              {permissions.filter(p => p.isActive).length}
            </div>
            <div className="text-sm text-green-600">Active Permissions</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-purple-600">{categories.length}</div>
            <div className="text-sm text-purple-600">Categories</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="text-2xl font-bold text-orange-600">{roleTemplates.length}</div>
            <div className="text-sm text-orange-600">Role Templates</div>
          </div>
        </div>
      </div>
    </div>
  );
}