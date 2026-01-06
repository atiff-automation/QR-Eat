/**
 * Admin Layout with RBAC Integration
 *
 * This layout wraps all admin routes with the RoleProvider to ensure
 * RBAC context is available throughout the admin application.
 *
 * Features:
 * - RBAC context provision for admin pages
 * - Platform admin permission enforcement
 * - Consistent admin styling and structure
 * - Responsive viewport (uses browser default)
 */

'use client';

import { RoleProvider } from '@/components/rbac/RoleProvider';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <RoleProvider>{children}</RoleProvider>;
}
