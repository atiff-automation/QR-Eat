/**
 * Role Switcher Component for RBAC System
 * 
 * This component provides role switching functionality with intuitive UI,
 * implementing Phase 3.1.3 of the RBAC Implementation Plan.
 * 
 * Features:
 * - Role switching dropdown interface
 * - Role-specific icons and colors
 * - Loading states during role transitions
 * - Restaurant context display
 */

'use client';

import { useState } from 'react';
import { useRole } from './RoleProvider';
import { UserRole } from '@/lib/rbac/types';
import { ChevronDown, User, Building, Shield } from 'lucide-react';

export function RoleSwitcher() {
  const { currentRole, availableRoles, switchRole } = useRole();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  if (availableRoles.length <= 1) {
    return null; // Don't show switcher if user has only one role
  }
  
  const handleRoleSwitch = async (roleId: string) => {
    if (roleId === currentRole?.id) {
      setIsOpen(false);
      return;
    }
    
    setIsLoading(true);
    try {
      await switchRole(roleId);
      setIsOpen(false);
    } catch (error) {
      console.error('Role switch failed:', error);
      // Handle error (show toast, etc.)
    } finally {
      setIsLoading(false);
    }
  };
  
  const getRoleIcon = (role: UserRole) => {
    switch (role.userType) {
      case 'platform_admin':
        return <Shield className="h-4 w-4" />;
      case 'restaurant_owner':
        return <Building className="h-4 w-4" />;
      case 'staff':
        return <User className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };
  
  const getRoleLabel = (role: UserRole) => {
    const labels = {
      restaurant_owner: 'Restaurant Owner',
      manager: 'Manager',
      kitchen_staff: 'Kitchen Staff',
      waitstaff: 'Waitstaff',
      platform_admin: 'Platform Admin',
    };
    return labels[role.roleTemplate as keyof typeof labels] || role.roleTemplate;
  };
  
  const getRoleColor = (role: UserRole) => {
    const colors = {
      restaurant_owner: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      kitchen_staff: 'bg-orange-100 text-orange-800',
      waitstaff: 'bg-green-100 text-green-800',
      platform_admin: 'bg-red-100 text-red-800',
    };
    return colors[role.roleTemplate as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };
  
  if (!currentRole) {
    return null;
  }
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {getRoleIcon(currentRole)}
        <span>{getRoleLabel(currentRole)}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="py-1">
            <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">
              Switch Role
            </div>
            {availableRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => handleRoleSwitch(role.id)}
                disabled={isLoading}
                className={`w-full flex items-center space-x-3 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 ${
                  role.id === currentRole?.id ? 'bg-blue-50' : ''
                }`}
              >
                {getRoleIcon(role)}
                <div className="flex-1 text-left">
                  <div className="font-medium">{getRoleLabel(role)}</div>
                  {role.restaurantId && (
                    <div className="text-xs text-gray-500">
                      Restaurant ID: {role.restaurantId.substring(0, 8)}...
                    </div>
                  )}
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded ${getRoleColor(role)}`}>
                  {role.userType.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for space-constrained areas
export function CompactRoleSwitcher() {
  const { currentRole, availableRoles, switchRole } = useRole();
  const [isLoading, setIsLoading] = useState(false);
  
  if (availableRoles.length <= 1) {
    return null;
  }
  
  const handleRoleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const roleId = event.target.value;
    if (roleId === currentRole?.id) return;
    
    setIsLoading(true);
    try {
      await switchRole(roleId);
    } catch (error) {
      console.error('Role switch failed:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const getRoleLabel = (role: UserRole) => {
    const labels = {
      restaurant_owner: 'Owner',
      manager: 'Manager',
      kitchen_staff: 'Kitchen',
      waitstaff: 'Waitstaff',
      platform_admin: 'Admin',
    };
    return labels[role.roleTemplate as keyof typeof labels] || role.roleTemplate;
  };
  
  if (!currentRole) {
    return null;
  }
  
  return (
    <select
      value={currentRole.id}
      onChange={handleRoleChange}
      disabled={isLoading}
      className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
    >
      {availableRoles.map((role) => (
        <option key={role.id} value={role.id}>
          {getRoleLabel(role)}
        </option>
      ))}
    </select>
  );
}