/**
 * Dashboard Layout with RBAC Integration
 *
 * This layout wraps all dashboard routes with the RoleProvider to ensure
 * RBAC context is available throughout the dashboard application.
 *
 * Implements Step 3.2.2 of the RBAC Implementation Plan.
 *
 * Features:
 * - Responsive viewport (uses browser default)
 */

'use client';

import { RoleProvider } from '@/components/rbac/RoleProvider';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { InstallPrompt } from '@/components/InstallPrompt';

interface DashboardLayoutWrapperProps {
  children: React.ReactNode;
}

export default function DashboardLayoutWrapper({
  children,
}: DashboardLayoutWrapperProps) {
  return (
    <RoleProvider>
      <DashboardLayout>
        {children}
        <InstallPrompt />
      </DashboardLayout>
    </RoleProvider>
  );
}
