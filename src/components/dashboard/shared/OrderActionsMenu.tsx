'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Eye, Edit, XCircle } from 'lucide-react';
import { useHasPermission, useAuthUser } from '@/lib/hooks/queries/useAuth';
import { ORDER_PERMISSIONS } from '@/lib/rbac/permission-constants';

interface OrderActionsMenuProps {
  order: {
    id: string;
    status: string;
  };
  onViewDetails: (orderId: string) => void;
  onModify: (orderId: string) => void;
  onCancel: (orderId: string) => void;
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
  onCancel,
}: OrderActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Permission checks
  const canView = useHasPermission(ORDER_PERMISSIONS.READ);
  const canWrite = useHasPermission(ORDER_PERMISSIONS.WRITE);

  // Get user role information
  const { data: authData } = useAuthUser();
  const userType = authData?.currentRole.userType;
  const roleTemplate = authData?.currentRole.roleTemplate;

  // Determine if user can modify based on order status and role
  const canModifyBasedOnRole = () => {
    // PENDING orders: anyone with write permission can modify
    if (order.status === 'PENDING') {
      return canWrite;
    }

    // CONFIRMED+ orders: only owner, platform_admin, or manager can modify
    if (userType === 'platform_admin' || userType === 'restaurant_owner') {
      return canWrite;
    }

    if (userType === 'staff' && roleTemplate === 'manager') {
      return canWrite;
    }

    return false;
  };

  const canModify = canModifyBasedOnRole();

  // For cancel, use same logic for now
  const canCancelOrder_ = canModify;

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

          {/* Cancel Order */}
          {canCancelOrder_ && (
            <>
              <div className="border-t border-gray-200 my-1" />
              <button
                onClick={() => {
                  onCancel(order.id);
                  setIsOpen(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                role="menuitem"
              >
                <XCircle className="h-4 w-4" />
                Cancel Order
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
