/**
 * Admin User Role Management Page
 *
 * This page provides comprehensive user role management for platform administrators.
 * It allows viewing, assigning, updating, and removing user roles with full RBAC integration.
 */

'use client';

import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { UserRoleManager } from '@/components/admin/UserRoleManager';

export default function AdminUsersPage() {
  return (
    <DashboardLayout>
      <PermissionGuard
        permission="users:read"
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Access Denied
              </h2>
              <p className="text-gray-600 mb-4">
                You don&apos;t have permission to manage users.
              </p>
              <p className="text-sm text-gray-500">
                Required permission: users:read
              </p>
            </div>
          </div>
        }
      >
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900">
                User Management
              </h1>
              <p className="mt-2 text-gray-600">
                Manage user roles and permissions across the platform
              </p>
            </div>

            <UserRoleManager />
          </div>
        </div>
      </PermissionGuard>
    </DashboardLayout>
  );
}
