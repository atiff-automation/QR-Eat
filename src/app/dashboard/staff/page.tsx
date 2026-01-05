'use client';

import { useState, useEffect } from 'react';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { useRole } from '@/components/rbac/RoleProvider';
import CredentialsModal from '@/components/CredentialsModal';
import { ApiClient, ApiClientError } from '@/lib/api-client';
import {
  Plus,
  Pencil,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Search,
  RefreshCw,
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

  // UX State
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string | 'all'>(
    'all'
  );
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
  const [newStaffEmail, setNewStaffEmail] = useState('');

  // Check if user has permission to manage staff based on RBAC
  const canManageStaff = isOwner;
  // For viewing, we check if they have the 'staff:read' permission
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
          setNewStaffCredentials({
            username: data.credentials.username,
            password: data.credentials.password,
          });
          setNewStaffName(`${formData.firstName} ${formData.lastName}`);
          setNewStaffEmail(formData.email);
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
            username: member.username,
            password: data.temporaryPassword,
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
        closeModals(); // Close the edit modal
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

  // Toggle Status Function
  const handleToggleStatus = async (
    member: StaffMember,
    e: React.MouseEvent
  ) => {
    e.stopPropagation(); // Prevent card click

    // Don't allow toggling own status
    if (member.id === user?.id) {
      return;
    }

    try {
      // Optimistic update
      setStaff((prev) =>
        prev.map((s) =>
          s.id === member.id ? { ...s, isActive: !s.isActive } : s
        )
      );

      await ApiClient.put(`/admin/staff/${member.id}`, {
        isActive: !member.isActive,
        roleId: member.role.id,
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        username: member.username,
      });
    } catch (error) {
      // Revert on failure
      setStaff((prev) =>
        prev.map((s) =>
          s.id === member.id ? { ...s, isActive: !!member.isActive } : s
        )
      );
      console.error('Failed to toggle status:', error);
    }
  };

  // Filter staff based on selected role
  const filteredStaff =
    selectedRoleFilter === 'all'
      ? staff
      : staff.filter((member) => member.role.id === selectedRoleFilter);

  // Check access permissions
  if (!canViewStaff) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="text-red-500 mb-2 font-medium">Access Denied</div>
          <p className="text-gray-500 text-sm">
            You don&apos;t have permission to view staff management.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      {/* 
        Phase 3: Menu-Aligned UI 
        - Title lives in Nav (assumed), but we'll keep a minimal one here just in case.
        - Horizontal Pills for Roles (like Menu Categories).
      */}
      {/* 
        Phase 3: Menu-Aligned UI 
        - Title lives in DashboardLayout.
        - Horizontal Pills for Roles (like Menu Categories).
      */}
      <div className="px-5 pt-6 pb-2">
        {/* Phase 4: Menu-Style Dropdown Filter */}
        <div className="flex items-center justify-between bg-white p-2 rounded-xl shadow-sm border border-gray-100 mb-4">
          <div className="flex-1 max-w-xs">
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="w-full bg-transparent border-none text-sm font-medium focus:ring-0 text-gray-900 cursor-pointer"
            >
              <option value="all">All Roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => fetchStaff()}
            className="p-2 text-gray-400 hover:text-blue-600 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mx-5 mb-4 bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-red-100">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="mx-5 mb-4 bg-green-50 text-green-600 px-4 py-3 rounded-xl text-sm flex items-center gap-2 border border-green-100">
          <CheckCircle className="h-4 w-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* 
        Phase 3: Card List
        - Individual white cards
        - Rounded-xl, Shadow-sm
        - Layout: Avatar | Info | Actions (Toggle + Edit)
      */}
      <div className="px-5 space-y-3">
        {filteredStaff.length === 0 ? (
          <div className="text-center py-20 px-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="bg-gray-50 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-gray-900 font-medium mb-1">No staff found</h3>
            <p className="text-gray-500 text-sm">
              {selectedRoleFilter !== 'all'
                ? 'Try selecting a different role filter.'
                : 'Get started by adding your first staff member.'}
            </p>
          </div>
        ) : (
          filteredStaff.map((member) => (
            <div
              key={member.id}
              onClick={() => openEditModal(member)}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center justify-between active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-4">
                {/* Avatar: Rounded Square with initials */}
                <div
                  className={`
                  h-12 w-12 rounded-xl flex items-center justify-center text-base font-bold flex-shrink-0
                  ${member.isActive ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}
                `}
                >
                  {member.firstName[0]}
                  {member.lastName[0]}
                </div>

                {/* Info */}
                <div>
                  <h3 className="font-bold text-gray-900 text-[15px]">
                    {member.firstName} {member.lastName}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                      {member.role.name}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions Column: Toggle + Edit Icon */}
              <div
                className="flex flex-col items-end gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Status Toggle */}
                {canManageStaff && (
                  <button
                    onClick={(e) => handleToggleStatus(member, e)}
                    className={`
                      relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
                      ${member.isActive ? 'bg-green-500' : 'bg-gray-200'}
                    `}
                    disabled={member.id === user?.id}
                  >
                    <span className="sr-only">Use setting</span>
                    <span
                      aria-hidden="true"
                      className={`
                        pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                        ${member.isActive ? 'translate-x-5' : 'translate-x-0'}
                      `}
                    />
                  </button>
                )}

                {/* Edit Icon */}
                <button
                  onClick={() => openEditModal(member)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button (Mobile/Desktop) - Blue Circle with Plus */}
      {canManageStaff && (
        <button
          onClick={openAddModal}
          className="fixed bottom-6 right-6 h-14 w-14 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full shadow-lg hover:shadow-xl flex items-center justify-center transition-all transform hover:scale-105 active:scale-95 z-20"
          aria-label="Add Staff"
        >
          <Plus className="h-7 w-7" />
        </button>
      )}

      {/* Add Staff Modal - Matches Edit Modal Style */}
      {showAddModal && canManageStaff && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-xl animate-scale-in overflow-hidden">
            {/* Header - Gray background standard */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900">Add Staff</h3>
              <button
                onClick={closeModals}
                className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  ✕
                </div>
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                      First Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Jane"
                      value={formData.firstName}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          firstName: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                      Last Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Doe"
                      value={formData.lastName}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          lastName: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="jane@example.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Phone (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="+1 234 567 890"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Role
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
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a role...</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-800">
                    Login credentials will be auto-generated and shown after
                    creation.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all"
                  >
                    Create Staff Member
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Modal - Menu Style */}
      {showEditModal && canManageStaff && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-xl animate-scale-in overflow-hidden">
            {/* Header - Gray background standard */}
            <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900">Edit / Manage</h3>
              <button
                onClick={closeModals}
                className="p-1 rounded-full hover:bg-gray-200 text-gray-500 transition-colors"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  ✕
                </div>
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                      First Name
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
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                      Last Name
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
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value,
                      }))
                    }
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-gray-500 mb-1">
                    Role
                  </label>
                  <div className="relative">
                    <select
                      required
                      value={formData.roleId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          roleId: e.target.value,
                        }))
                      }
                      className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-gray-900 appearance-none"
                    >
                      <option value="">Select a role...</option>
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <ChevronRight className="h-4 w-4 rotate-90" />
                    </div>
                  </div>
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                  <span className="text-sm font-medium text-gray-900">
                    Account Status
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        isActive: !prev.isActive,
                      }))
                    }
                    className={`
                      relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
                      ${formData.isActive ? 'bg-green-500' : 'bg-gray-200'}
                    `}
                  >
                    <span className="sr-only">Use setting</span>
                    <span
                      aria-hidden="true"
                      className={`
                        pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                        ${formData.isActive ? 'translate-x-5' : 'translate-x-0'}
                      `}
                    />
                  </button>
                </div>

                <div className="pt-4 flex flex-col gap-3">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-sm transition-all"
                  >
                    Save Changes
                  </button>

                  {selectedStaff && (
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleResetPassword(selectedStaff)}
                        className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-all"
                      >
                        Reset Password
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(selectedStaff)}
                        className="flex-1 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 font-medium rounded-lg transition-all"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </form>
            </div>
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
          staffEmail={newStaffEmail}
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
