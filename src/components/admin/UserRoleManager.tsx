/**
 * User Role Manager Component
 * 
 * Comprehensive user role management interface for platform administrators.
 * Includes user listing, role assignment, role history, and bulk operations.
 */

'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  UserCheck,
  UserX,
  Shield,
  Building2,
  Mail,
  Phone,
  Plus,
  Edit,
  Trash2,
  History,
  Download,
  Upload,
  MoreVertical,
  Eye,
  Settings,
  UserPlus,
  Clock,
  Activity
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import { RoleAssignmentModal } from './RoleAssignmentModal';
import { RoleHistoryModal } from './RoleHistoryModal';
import { BulkRoleOperationsModal } from './BulkRoleOperationsModal';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  userType: 'platform_admin' | 'restaurant_owner' | 'staff';
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  restaurant?: {
    id: string;
    name: string;
    slug: string;
  };
  restaurants?: Array<{
    id: string;
    name: string;
    slug: string;
  }>;
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
  usage?: {
    userCount: number;
    lastUsed?: string;
  };
}

interface UserStats {
  total: number;
  platformAdmins: number;
  restaurantOwners: number;
  staff: number;
  active: number;
  inactive: number;
}

export function UserRoleManager() {
  const { hasPermission } = useRole();
  const [users, setUsers] = useState<User[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [userTypeFilter, setUserTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(20);
  const [includeRoles, setIncludeRoles] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchRoleTemplates();
  }, [includeRoles, includeInactive, userTypeFilter, currentPage]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: usersPerPage.toString(),
        includeRoles: includeRoles.toString(),
        includeInactive: includeInactive.toString(),
        ...(userTypeFilter !== 'all' && { userType: userTypeFilter }),
        ...(searchTerm && { search: searchTerm }),
      });

      const data = await ApiClient.get<{
        users: User[];
        summary: UserStats;
      }>(`/api/admin/users?${params}`);

      setUsers(data.users || []);
      setUserStats(data.summary || null);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoleTemplates = async () => {
    try {
      const data = await ApiClient.get<{
        templates: RoleTemplate[];
      }>('/api/admin/role-templates?includeStats=true');

      setRoleTemplates(data.templates || []);
    } catch (error) {
      console.error('Failed to fetch role templates:', error);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchUsers();
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = !searchTerm || 
      user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesUserType = userTypeFilter === 'all' || user.userType === userTypeFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'ACTIVE' && user.isActive) ||
                         (statusFilter === 'inactive' && !user.isActive);
    
    return matchesSearch && matchesUserType && matchesStatus;
  });

  const getUserTypeIcon = (userType: string) => {
    switch (userType) {
      case 'platform_admin':
        return <Shield className="h-4 w-4 text-purple-600" />;
      case 'restaurant_owner':
        return <Building2 className="h-4 w-4 text-blue-600" />;
      case 'staff':
        return <Users className="h-4 w-4 text-green-600" />;
      default:
        return <Users className="h-4 w-4 text-gray-600" />;
    }
  };

  const getUserTypeLabel = (userType: string) => {
    switch (userType) {
      case 'platform_admin':
        return 'Platform Admin';
      case 'restaurant_owner':
        return 'Restaurant Owner';
      case 'staff':
        return 'Staff';
      default:
        return userType;
    }
  };

  const getRoleTemplateBadge = (template: string) => {
    const colors = {
      platform_admin: 'bg-purple-100 text-purple-800',
      restaurant_owner: 'bg-blue-100 text-blue-800',
      manager: 'bg-indigo-100 text-indigo-800',
      kitchen_staff: 'bg-orange-100 text-orange-800',
    };
    
    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        colors[template] || 'bg-gray-100 text-gray-800'
      }`}>
        {template.replace('_', ' ')}
      </span>
    );
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUsers([...selectedUsers, userId]);
    } else {
      setSelectedUsers(selectedUsers.filter(id => id !== userId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUsers(filteredUsers.map(user => user.id));
    } else {
      setSelectedUsers([]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading user management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      {userStats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Users</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.total}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-purple-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Admins</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.platformAdmins}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Building2 className="h-8 w-8 text-blue-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Owners</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.restaurantOwners}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Staff</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.staff}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <UserCheck className="h-8 w-8 text-green-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Active</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.active}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <UserX className="h-8 w-8 text-red-600" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Inactive</p>
                <p className="text-2xl font-bold text-gray-900">{userStats.inactive}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search users..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="pl-10 pr-4 py-2 w-64 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Types</option>
              <option value="platform_admin">Platform Admins</option>
              <option value="restaurant_owner">Restaurant Owners</option>
              <option value="staff">Staff</option>
            </select>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeRoles}
                  onChange={(e) => setIncludeRoles(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Include Roles</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">Include Inactive</span>
              </label>
            </div>
            
            <PermissionGuard permission="users:write">
              <div className="flex space-x-2">
                <button
                  onClick={() => setShowUserModal(true)}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Assign Role
                </button>
                
                {selectedUsers.length > 0 && (
                  <button
                    onClick={() => setShowBulkModal(true)}
                    className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Bulk Actions ({selectedUsers.length})
                  </button>
                )}
                
                <button
                  onClick={() => window.open('/api/admin/users/export', '_blank')}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </button>
              </div>
            </PermissionGuard>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type & Roles
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Restaurant Context
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status & Activity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedUsers.includes(user.id)}
                      onChange={(e) => handleSelectUser(user.id, e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-400 to-purple-500 flex items-center justify-center">
                        <span className="text-sm font-medium text-white">
                          {user.firstName.charAt(0)}{user.lastName.charAt(0)}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <Mail className="h-3 w-3 mr-1" />
                          {user.email}
                        </div>
                        {user.phone && (
                          <div className="text-sm text-gray-500 flex items-center">
                            <Phone className="h-3 w-3 mr-1" />
                            {user.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-2">
                      <div className="flex items-center">
                        {getUserTypeIcon(user.userType)}
                        <span className="ml-2 text-sm font-medium text-gray-900">
                          {getUserTypeLabel(user.userType)}
                        </span>
                      </div>
                      {includeRoles && user.rbacData && user.rbacData.roles.length > 0 && (
                        <div className="space-y-1">
                          {user.rbacData.roles.slice(0, 2).map((role) => (
                            <div key={role.id}>
                              {getRoleTemplateBadge(role.roleTemplate)}
                            </div>
                          ))}
                          {user.rbacData.roles.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{user.rbacData.roles.length - 2} more roles
                            </div>
                          )}
                        </div>
                      )}
                      {includeRoles && user.rbacData && (
                        <div className="text-xs text-gray-500">
                          {user.rbacData.permissionCount} permissions
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {user.userType === 'restaurant_owner' && user.restaurants ? (
                        <div className="space-y-1">
                          {user.restaurants.slice(0, 2).map((restaurant, index) => (
                            <div key={index} className="flex items-center">
                              <Building2 className="h-3 w-3 text-blue-600 mr-1" />
                              <span className="text-blue-600 hover:underline cursor-pointer">
                                {restaurant.name}
                              </span>
                            </div>
                          ))}
                          {user.restaurants.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{user.restaurants.length - 2} more
                            </div>
                          )}
                        </div>
                      ) : user.userType === 'staff' && user.restaurant ? (
                        <div className="flex items-center">
                          <Building2 className="h-3 w-3 text-blue-600 mr-1" />
                          <span className="text-blue-600 hover:underline cursor-pointer">
                            {user.restaurant.name}
                          </span>
                        </div>
                      ) : user.userType === 'platform_admin' ? (
                        <span className="text-gray-500 flex items-center">
                          <Shield className="h-3 w-3 mr-1" />
                          Platform Level
                        </span>
                      ) : (
                        <span className="text-gray-500">None</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="space-y-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.isActive ? (
                          <>
                            <UserCheck className="h-3 w-3 mr-1" />
                            Active
                          </>
                        ) : (
                          <>
                            <UserX className="h-3 w-3 mr-1" />
                            Inactive
                          </>
                        )}
                      </span>
                      <div className="text-xs text-gray-500 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        Last login: {user.lastLoginAt 
                          ? new Date(user.lastLoginAt).toLocaleDateString()
                          : 'Never'
                        }
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowUserModal(true);
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      
                      <PermissionGuard permission="users:write">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setShowRoleModal(true);
                          }}
                          className="text-indigo-600 hover:text-indigo-900"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      </PermissionGuard>
                      
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowHistoryModal(true);
                        }}
                        className="text-green-600 hover:text-green-900"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      
                      <PermissionGuard permission="users:delete">
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to remove this user\'s roles?')) {
                              // handleDeleteUserRoles(user.id);
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </PermissionGuard>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No users found</p>
              <p className="text-sm text-gray-400 mt-2">
                Try adjusting your search criteria or filters
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {filteredUsers.length > 0 && (
        <div className="bg-white px-6 py-3 flex items-center justify-between border-t border-gray-200 rounded-lg shadow">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={filteredUsers.length < usersPerPage}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{(currentPage - 1) * usersPerPage + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(currentPage * usersPerPage, filteredUsers.length)}
                </span>{' '}
                of <span className="font-medium">{filteredUsers.length}</span> results
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={filteredUsers.length < usersPerPage}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <RoleAssignmentModal
        isOpen={showRoleModal}
        onClose={() => {
          setShowRoleModal(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onRoleUpdated={() => {
          fetchUsers();
          setSelectedUser(null);
        }}
      />

      <RoleHistoryModal
        isOpen={showHistoryModal}
        onClose={() => {
          setShowHistoryModal(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
      />

      <BulkRoleOperationsModal
        isOpen={showBulkModal}
        onClose={() => {
          setShowBulkModal(false);
          setSelectedUsers([]);
        }}
        selectedUserIds={selectedUsers}
        onOperationComplete={() => {
          fetchUsers();
          setSelectedUsers([]);
          setShowBulkModal(false);
        }}
      />
    </div>
  );
}