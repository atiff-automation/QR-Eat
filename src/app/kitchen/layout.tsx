/**
 * Kitchen Layout - Full Screen Display
 * 
 * This layout provides a full-screen experience for kitchen staff
 * without any dashboard navigation sidebar.
 * 
 * This layout is completely separate from the dashboard hierarchy
 * to avoid inheriting the dashboard sidebar and header.
 */

'use client';

import { RoleProvider } from '@/components/rbac/RoleProvider';

interface KitchenLayoutProps {
  children: React.ReactNode;
}

export default function KitchenLayout({ children }: KitchenLayoutProps) {
  return (
    <RoleProvider>
      <div className="min-h-screen bg-gray-900">
        {children}
      </div>
    </RoleProvider>
  );
}