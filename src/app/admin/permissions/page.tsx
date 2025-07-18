/**
 * Admin Permission Management Page
 * 
 * This page implements Step 4.1.1 of the RBAC Implementation Plan,
 * providing comprehensive permission management for platform administrators.
 * 
 * Features:
 * - Dynamic permission viewing and editing
 * - Role template permission management
 * - Permission category organization
 * - Real-time permission updates
 */

'use client';

import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { PermissionManager } from '@/components/admin/PermissionManager';

export default function AdminPermissionsPage() {
  return (
    <PermissionGuard permission="permissions:read">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Permission Management</h1>
              <p className="mt-2 text-gray-600">
                Manage system permissions and role template assignments for the RBAC system.
              </p>
            </div>
            
            <PermissionManager />
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}