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
  Mail,
  Phone,
  AlertTriangle,
  CheckCircle,
  X,
  Save,
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
  const { user } = useRole();
  const isOwner = user?.userType === 'restaurant_owner';
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null);
  const [formData, setFormData] = useState<StaffFormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    roleId: '',
    isActive: true,
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
  const canViewStaff =
    isOwner || user?.role?.permissions?.staff?.includes('read');

  useEffect(() => {
    fetchStaff();
    fetchRoles();
  }, []);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const data = await ApiClient.get<{ staff: StaffMember[] }>(
        '/admin/staff'
      );

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
      isActive: true,
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
      isActive: member.isActive,
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
      if (
        !formData.firstName ||
        !formData.lastName ||
        !formData.email ||
        !formData.roleId
      ) {
        setError('Please fill in all required fields');
        return;
      }

      // Find the selected role
      const selectedRole = roles.find((role) => role.id === formData.roleId);
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
        const data = await ApiClient.post<{
          credentials?: { username: string; password: string };
        }>('/admin/staff', formData);

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
    if (
      window.confirm(
        `Reset password for ${member.firstName} ${member.lastName}? They will be required to change it on next login.`
      )
    ) {
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
            username: member.username,
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
    if (
      window.confirm(
        `Are you sure you want to delete ${member.firstName} ${member.lastName}?`
      )
    ) {
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

  // Check access permissions
  if (!canViewStaff) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="text-center">
          <div className="text-red-600 mb-4">Access Denied</div>
          <p className="text-gray-600">
            You don&apos;t have permission to view staff management.
          </p>
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Staff Management
            </h1>
            <p className="text-sm text-gray-600 mt-0.5">
              {isOwner
                ? 'Manage restaurant staff members and their roles'
                : 'View restaurant staff members and their roles'}
            </p>
          </div>
          {canManageStaff && (
            <button
              onClick={openAddModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-medium flex items-center text-sm sm:px-4"
            >
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Staff</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0" />
            <span className="text-red-600 text-sm">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2 flex-shrink-0" />
            <span className="text-green-600 text-sm">{success}</span>
          </div>
        </div>
      )}

      {/* Roles Section - Horizontal Scroll */}
      {isOwner && roles.length > 0 && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Roles</h2>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {roles.map((role) => (
              <div
                key={role.id}
                className="flex-shrink-0 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 min-w-[160px]"
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <Shield className="h-3.5 w-3.5 text-blue-600" />
                  <h3 className="font-medium text-sm text-gray-900">
                    {role.name}
                  </h3>
                </div>
                <p className="text-xs text-gray-600 line-clamp-2">
                  {role.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff List - Card View */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Staff Members ({staff.length})
          </h2>
        </div>

        {staff.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 text-center py-12">
            <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <h3 className="text-base font-medium text-gray-900 mb-1">
              No staff members found
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Get started by adding your first staff member
            </p>
            {canManageStaff && (
              <button
                onClick={openAddModal}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center text-sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Staff Member
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {staff.map((member) => (
              <div
                key={member.id}
                className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-blue-700 font-medium text-sm">
                        {member.firstName[0]}
                        {member.lastName[0]}
                      </span>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 text-sm truncate">
                          {member.firstName} {member.lastName}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-600">
                            {member.role.name}
                          </span>
                          <span className="text-gray-300">•</span>
                          <div className="flex items-center gap-1">
                            {member.isActive ? (
                              <>
                                <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                <span className="text-xs text-green-600">
                                  Active
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                <span className="text-xs text-red-600">
                                  Inactive
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      {canManageStaff && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(member)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(member)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Contact Info */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Mail className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{member.email}</span>
                      </div>
                      {member.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Phone className="h-3 w-3 flex-shrink-0" />
                          <span>{member.phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Staff Modal */}
      {showAddModal && canManageStaff && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Add Staff Member
              </h3>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        firstName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">
                      Automatic Credential Generation
                    </p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Username and password will be automatically generated and
                      displayed after creation.
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
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      roleId: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        isActive: e.target.checked,
                      }))
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Active</span>
                </label>
              </div>

              {error && <div className="text-red-600 text-sm">{error}</div>}

              <div className="flex justify-end gap-2 pt-2">
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

      {/* Edit Staff Modal */}
      {showEditModal && canManageStaff && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Edit Staff Member
              </h3>
              <button
                onClick={closeModals}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        firstName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        lastName: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, email: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  required
                  value={formData.roleId}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      roleId: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        isActive: e.target.checked,
                      }))
                    }
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">Active</span>
                </label>
              </div>

              {selectedStaff && (
                <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                  <button
                    type="button"
                    onClick={() => handleResetPassword(selectedStaff)}
                    className="text-sm font-medium text-orange-700 hover:text-orange-800"
                  >
                    Reset Password
                  </button>
                  <p className="text-xs text-orange-600 mt-1">
                    Generate a new temporary password for this staff member
                  </p>
                </div>
              )}

              {error && <div className="text-red-600 text-sm">{error}</div>}

              <div className="flex justify-end gap-2 pt-2">
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
