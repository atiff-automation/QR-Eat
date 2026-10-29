'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Eye, Edit, XCircle, RotateCcw, Ban } from 'lucide-react';
import { useHasPermission, useAuthUser } from '@/lib/hooks/queries/useAuth';
import { ORDER_PERMISSIONS } from '@/lib/rbac/permission-constants';
import type { OrderAdjustmentAction } from '@/lib/orders/order-adjustment-policy';

interface OrderActionsMenuProps {
  order: {
    id: string;
    status: string;
    paymentStatus: string;
  };
  onViewDetails: (orderId: string) => void;
  onModify: (orderId: string) => void;
  onAdjust: (orderId: string, action: OrderAdjustmentAction) => void;
}

/**
 * OrderActionsMenu Component
 *
 * Three-dot dropdown menu for order actions with RBAC permission checks.
 *
 * Features:
 * - Permission-based action visibility
 * - Status-based action availability
 * - Accessible keyboard navigation
 * - Click-outside to close
 * - Mobile-friendly touch targets
 */
export function OrderActionsMenu({
  order,
  onViewDetails,
  onModify,
  onAdjust,
}: OrderActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Permission checks
  const canView = useHasPermission(ORDER_PERMISSIONS.READ);
  const canWrite = useHasPermission(ORDER_PERMISSIONS.WRITE);
  const canRefund = useHasPermission('payments:write');

  // Get user role information
  const { data: authData } = useAuthUser();
  const userType = authData?.currentRole.userType;
  const roleTemplate = authData?.currentRole.roleTemplate;

  // Modify is safe only before the kitchen receives the order. Post-confirm
  // edits are a cancel + re-order; the server enforces the same rule.
  const canModify = order.status === 'PENDING' && canWrite;

  const isOwnerOrManager =
    userType === 'platform_admin' ||
    userType === 'restaurant_owner' ||
    (userType === 'staff' && roleTemplate === 'manager');
  const adjustmentAction: OrderAdjustmentAction = (() => {
    if (order.status === 'CANCELLED') return 'NONE';
    if (['PENDING', 'CONFIRMED', 'PREPARING', 'READY'].includes(order.status)) {
      if (order.status === 'PENDING') {
        return canWrite || isOwnerOrManager ? 'CANCEL' : 'NONE';
      }
      return isOwnerOrManager ? 'CANCEL' : 'NONE';
    }
    if (order.status !== 'SERVED' || !isOwnerOrManager) return 'NONE';
    if (order.paymentStatus === 'PAID') {
      return canRefund ? 'REFUND' : 'NONE';
    }
    if (order.paymentStatus === 'PENDING' || order.paymentStatus === 'FAILED') {
      return 'VOID';
    }
    return 'NONE';
  })();
  const adjustmentLabel =
    adjustmentAction === 'VOID'
      ? 'Void Order'
      : adjustmentAction === 'REFUND'
        ? 'Refund Payment'
        : 'Cancel Order';
  const AdjustmentIcon =
    adjustmentAction === 'VOID'
      ? Ban
      : adjustmentAction === 'REFUND'
        ? RotateCcw
        : XCircle;

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  if (!canView) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="Order actions"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <MoreVertical className="h-5 w-5 text-gray-600" />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1"
          role="menu"
          aria-orientation="vertical"
        >
          {/* View Details */}
          <button
            onClick={() => {
              onViewDetails(order.id);
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left"
            role="menuitem"
          >
            <Eye className="h-4 w-4" />
            View Details
          </button>

          {/* Modify Order */}
          {canModify && (
            <button
              onClick={() => {
                onModify(order.id);
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors text-left"
              role="menuitem"
            >
              <Edit className="h-4 w-4" />
              Modify Order
            </button>
          )}

          {/* Cancel / Void / Refund */}
          {adjustmentAction !== 'NONE' && (
            <>
              <div className="border-t border-gray-200 my-1" />
              <button
                onClick={() => {
                  onAdjust(order.id, adjustmentAction);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                role="menuitem"
              >
                <AdjustmentIcon className="h-4 w-4" />
                {adjustmentLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
