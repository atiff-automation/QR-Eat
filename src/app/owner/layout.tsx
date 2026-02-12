'use client';

import { RoleProvider } from '@/components/rbac/RoleProvider';

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleProvider>{children}</RoleProvider>;
}
