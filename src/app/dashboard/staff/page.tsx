'use client';

import { useState, useEffect } from 'react';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { useRole } from '@/components/rbac/RoleProvider';
import CredentialsModal from '@/components/CredentialsModal';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Shield,
  Clock,
  Mail,
  Phone,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  Save,
  Eye,
  EyeOff
} from 'lucide-react';

interface StaffMember {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  role: {
    id: string;
    name: string;
    description: string;
    permissions: Record<string, string[]>;
  };
}

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, string[]>;
}

interface StaffFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleId: string;
  isActive: boolean;
}

function StaffPageContent() {
  const { user, hasPermission, restaurantContext } = useRole();
  const isOwner = user?.userType === 'restaurant_owner';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<StaffFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    roleId: '',
    isActive: true
  });
  
  // Credentials modal state
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [newStaffCredentials, setNewStaffCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [newStaffName, setNewStaffName] = useState('');

  // Check if user has permission to manage staff
  const canManageStaff = isOwner;
  const canViewStaff = isOwner || (user?.role?.permissions?.staff?.includes('read'));


  useEffect(() => {
    fetchStaff();
    fetchRoles();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get<{ staff: StaffMember[] }>('/admin/staff');

      setStaff(data.staff || []);
    } catch (error) {
      console.error('Failed to fetch staff:', error);
      if (error instanceof ApiClientError) {
        setError(error.message);
      } else {
        setError('Failed to load staff members');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const data = await ApiClient.get<{ roles: Role[] }>('/admin/staff/roles');

      setRoles(data.roles || []);
    } catch (error) {
      console.error('Failed to fetch roles:', error);
      // Fallback to empty array if API fails
      setRoles([]);
    }
  };

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      roleId: '',
      isActive: true
    });
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (member: StaffMember) => {
    setFormData({
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      phone: member.phone || '',
      roleId: member.role.id,
      isActive: member.isActive
    });
    setSelectedStaff(member);
    setShowEditModal(true);
  };

  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setSelectedStaff(null);
    resetForm();
    setError('');
    setSuccess('');
  };

  const closeCredentialsModal = () => {
    setShowCredentialsModal(false);
    setNewStaffCredentials(null);
    setNewStaffName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setError('');
      
      // Validation
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.roleId) {
        setError('Please fill in all required fields');
        return;
      }

      // Find the selected role
      const selectedRole = roles.find(role => role.id === formData.roleId);
      if (!selectedRole) {
        setError('Invalid role selected');
        return;
      }


      // Create or update staff member via API
      if (showEditModal && selectedStaff) {
        // Update existing staff member
        await ApiClient.put(`/admin/staff/${selectedStaff.id}`, formData);

        await fetchStaff(); // Refresh the list
        setSuccess('Staff member updated successfully!');
      } else {
        // Add new staff member
        const data = await ApiClient.post<{ credentials?: { username: string; password: string } }>('/admin/staff', formData);

        await fetchStaff(); // Refresh the list

        // Show credentials modal
        if (data.credentials) {
          setNewStaffCredentials(data.credentials);
          setNewStaffName(`${formData.firstName} ${formData.lastName}`);
          setShowCredentialsModal(true);
        }

        setSuccess('Staff member added successfully!');
      }

      closeModals();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Failed to save staff member:', error);
      setError('Failed to save staff member');
    }
  };

  const handleResetPassword = async (member: StaffMember) => {
    if (window.confirm(`Reset password for ${member.firstName} ${member.lastName}? They will be required to change it on next login.`)) {
      try {
        const data = await ApiClient.post<{
          temporaryPassword?: string;
          staffEmail: string;
          staffName: string;
        }>(`/owner/staff/${member.id}/reset-password`);

        await fetchStaff(); // Refresh the list

        // Show the new temporary password
        if (data.temporaryPassword) {
          setNewStaffCredentials({
            email: data.staffEmail,
            password: data.temporaryPassword,
            username: member.username
          });
          setNewStaffName(data.staffName);
          setShowCredentialsModal(true);
        }

        setSuccess('Password reset successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } catch (error) {
        console.error('Failed to reset password:', error);
        if (error instanceof ApiClientError) {
          setError(error.message);
        } else {
          setError('Failed to reset password');
        }
      }
    }
  };

  const handleDelete = async (member: StaffMember) => {
    if (window.confirm(`Are you sure you want to delete ${member.firstName} ${member.lastName}?`)) {
      try {
        await ApiClient.delete(`/admin/staff/${member.id}`);

        await fetchStaff(); // Refresh the list
        setSuccess('Staff member deleted successfully!');
        setTimeout(() => setSuccess(''), 3000);
      } catch (error) {
        console.error('Failed to delete staff member:', error);
        if (error instanceof ApiClientError) {
          setError(error.message);
        } else {
          setError('Failed to delete staff member');
        }
      }
    }
  };

  const formatLastLogin = (lastLoginAt?: string) => {
    if (!lastLoginAt) return 'Never';
    return new Date(lastLoginAt).toLocaleDateString();
  };

  const getStatusIcon = (isActive: boolean) => {
    return isActive ? (
      <CheckCircle className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  // Check access permissions
  if (!canViewStaff) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="text-red-600 mb-4">Access Denied</div>
          <p className="text-gray-600">You don't have permission to view staff management.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-gray-600">Loading staff members...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff Management</h1>
          <p className="text-gray-600">
            {isOwner 
              ? "Manage restaurant staff members and their roles" 
              : "View restaurant staff members and their roles"
            }
          </p>
        </div>
        {canManageStaff && (
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Staff Member
          </button>
        )}
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-red-600">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            <span className="text-green-600">{success}</span>
          </div>
        </div>
      )}

      {/* Staff List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Staff Members ({staff.length})</h2>
        </div>

        {staff.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No staff members found</h3>
            <p className="text-gray-600 mb-4">Get started by adding your first staff member</p>
            {canManageStaff && (
              <button
                onClick={openAddModal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium flex items-center mx-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Staff Member
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Staff Member
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  {canManageStaff && (
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {staff.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <Users className="h-5 w-5 text-gray-600" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {member.firstName} {member.lastName}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            {member.email}
                          </div>
                          {member.phone && (
                            <div className="text-sm text-gray-500 flex items-center">
                              <Phone className="h-3 w-3 mr-1" />
                              {member.phone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Shield className="h-4 w-4 text-blue-600 mr-2" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{member.role.name}</div>
                          <div className="text-sm text-gray-500">{member.role.description}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(member.isActive)}
                        <span className={`ml-2 text-sm ${member.isActive ? 'text-green-600' : 'text-red-600'}`}>
                          {member.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatLastLogin(member.lastLoginAt)}
                      </div>
                    </td>
                    {canManageStaff && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openEditModal(member)}
                            className="text-blue-600 hover:text-blue-900"
                            title="Edit staff member"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleResetPassword(member)}
                            className="text-orange-600 hover:text-orange-900"
                            title="Reset password"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(member)}
                            className="text-red-600 hover:text-red-900"
                            title="Delete staff member"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Roles Section - Only show for owners */}
      {isOwner && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Roles & Permissions</h2>
            <p className="text-sm text-gray-600">Available roles for staff members (Owner Access Only)</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {roles.map((role) => (
                <div key={role.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <Shield className="h-5 w-5 text-blue-600 mr-2" />
                    <h3 className="font-medium text-gray-900">{role.name}</h3>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{role.description}</p>
                  <div className="space-y-1">
                    <h4 className="text-xs font-medium text-gray-500 uppercase">Permissions:</h4>
                    {Object.entries(role.permissions).map(([module, perms]) => (
                      <div key={module} className="text-xs text-gray-600">
                        <span className="font-medium">{module}:</span> {perms.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Staff Modal - Only for owners */}
      {showAddModal && canManageStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Staff Member</h3>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>


              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <Shield className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-blue-800">
                      Automatic Credential Generation
                    </p>
                    <p className="text-xs text-blue-700">
                      Username and password will be automatically generated and displayed after creation.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  required
                  value={formData.roleId}
                  onChange={(e) => setFormData(prev => ({ ...prev, roleId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} - {role.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Active</span>
                </label>
              </div>

              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md flex items-center"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Add Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal - Only for owners */}
      {showEditModal && canManageStaff && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Staff Member</h3>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>


              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Password (leave blank to keep current)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  Password must be at least 8 characters long
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  required
                  value={formData.roleId}
                  onChange={(e) => setFormData(prev => ({ ...prev, roleId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} - {role.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Active</span>
                </label>
              </div>

              {error && (
                <div className="text-red-600 text-sm">{error}</div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={closeModals}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md flex items-center"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Update Staff Member
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Credentials Modal */}
      {showCredentialsModal && newStaffCredentials && (
        <CredentialsModal
          isOpen={showCredentialsModal}
          onClose={closeCredentialsModal}
          credentials={newStaffCredentials}
          staffName={newStaffName}
        />
      )}
    </div>
  );
}

export default function StaffPage() {
  return (
    <PermissionGuard permission="staff:read">
      <StaffPageContent />
    </PermissionGuard>
  );
}