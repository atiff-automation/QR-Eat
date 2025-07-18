/**
 * Kitchen Display Page - Full Screen Interface
 * 
 * This page implements a dedicated full-screen kitchen display
 * separate from the dashboard hierarchy to avoid UI conflicts.
 * 
 * Features:
 * - RBAC-based permission checking
 * - Full-screen kitchen display without sidebar
 * - Real-time order updates
 */

'use client';

import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { KitchenDisplayBoard } from '@/components/kitchen/KitchenDisplayBoard';

export default function KitchenPage() {
  return (
    <PermissionGuard permission="orders:kitchen">
      <KitchenDisplayBoard />
    </PermissionGuard>
  );
}