/**
 * RBAC-Enhanced Dashboard Layout
 *
 * This component provides the main dashboard layout with integrated RBAC functionality,
 * implementing Phase 3.2.1 of the RBAC Implementation Plan.
 *
 * Features:
 * - Role-based navigation filtering
 * - Permission-based component rendering
 * - Role switcher integration
 * - Restaurant context display
 */

'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Home,
  ClipboardList,
  ChefHat,
  UtensilsCrossed,
  Users,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  CreditCard,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { RoleSwitcher } from '@/components/rbac/RoleSwitcher';
import { NotificationBell } from './NotificationBell';
import { DashboardClock } from '@/components/ui/LiveClock';
import { ApiClient } from '@/lib/api-client';
import { AUTH_ROUTES } from '@/lib/auth-routes';
import { RestaurantProvider } from '@/contexts/RestaurantContext';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, currentRole, restaurantContext, isLoading } = useRole();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Debug logging
  if (process.env.NODE_ENV === 'development') {
    console.log('🏗️ DashboardLayout render:', {
      isLoading,
      hasUser: !!user,
      hasCurrentRole: !!currentRole,
      user: user,
      currentRole: currentRole,
    });
  }

  const handleLogout = async () => {
    try {
      await ApiClient.post('/auth/logout');
      router.push(AUTH_ROUTES.LOGIN);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user || !currentRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">Authentication required</p>
          <button
            onClick={() => router.push(AUTH_ROUTES.LOGIN)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // Navigation items with permission requirements
  const navigationItems: Array<{
    name: string;
    href: string;
    icon: LucideIcon;
    current: boolean;
    permission: string | undefined;
  }> = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      current: pathname === '/dashboard',
      permission: undefined, // No permission required for dashboard home
    },
    {
      name: 'Orders',
      href: '/dashboard/orders',
      icon: ClipboardList,
      current: pathname.startsWith('/dashboard/orders'),
      permission: 'orders:read',
    },
    {
      name: 'Tables',
      href: '/dashboard/tables',
      icon: ChefHat,
      current: pathname.startsWith('/dashboard/tables'),
      permission: 'tables:read',
    },
    {
      name: 'Kitchen',
      href: '/kitchen',
      icon: UtensilsCrossed,
      current: pathname.startsWith('/kitchen'),
      permission: 'orders:kitchen',
    },
    {
      name: 'Menu',
      href: '/dashboard/menu',
      icon: UtensilsCrossed,
      current: pathname.startsWith('/dashboard/menu'),
      permission: 'menu:read',
    },
    // {
    //   name: 'Cashier',
    //   href: '/dashboard/cashier',
    //   icon: CreditCard,
    //   current: pathname.startsWith('/dashboard/cashier'),
    //   permission: 'orders:write',
    // },
    {
      name: 'Staff',
      href: '/dashboard/staff',
      icon: Users,
      current: pathname.startsWith('/dashboard/staff'),
      permission: 'staff:read',
    },
    {
      name: 'Reports',
      href: '/dashboard/reports',
      icon: BarChart3,
      current: pathname.startsWith('/dashboard/reports'),
      permission: 'analytics:read',
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      current: pathname.startsWith('/dashboard/settings'),
      permission: 'settings:read',
    },
  ];

  const getPageIcon = (): LucideIcon => {
    if (pathname === '/dashboard') return Home;
    if (pathname.includes('/orders')) return ClipboardList;
    if (pathname.includes('/tables')) return ChefHat;
    if (pathname.includes('/kitchen')) return UtensilsCrossed;
    if (pathname.includes('/menu')) return UtensilsCrossed;
    if (pathname.includes('/cashier')) return CreditCard;
    if (pathname.includes('/staff')) return Users;
    if (pathname.includes('/reports')) return BarChart3;
    if (pathname.includes('/settings')) return Settings;
    return Home;
  };

  const getPageTitle = () => {
    if (pathname === '/dashboard') return 'Dashboard';
    if (pathname.includes('/orders')) return 'Orders';
    if (pathname.includes('/tables')) return 'Tables';
    if (pathname.includes('/kitchen')) return 'Kitchen Display';
    if (pathname.includes('/menu')) return 'Menu';
    if (pathname.includes('/cashier')) return 'Cashier / POS';
    if (pathname.includes('/staff')) return 'Staff';
    if (pathname.includes('/reports')) return 'Reports';
    if (pathname.includes('/settings')) return 'Settings';
    return 'Dashboard';
  };

  return (
    <RestaurantProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Mobile sidebar */}
        <div
          className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${
            isSidebarOpen
              ? 'opacity-100 pointer-events-auto'
              : 'opacity-0 pointer-events-none'
          }`}
        >
          <div
            className={`fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${
              isSidebarOpen ? 'opacity-100' : 'opacity-0'
            }`}
            onClick={() => setIsSidebarOpen(false)}
          ></div>
          <div
            className={`relative flex flex-col w-64 bg-white h-full transform transition-transform duration-300 ease-in-out ${
              isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <span className="text-lg font-semibold text-gray-900">
                {restaurantContext?.name || 'Menu'}
              </span>
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 px-4 py-4 space-y-2">
              {navigationItems.map((item) => (
                <PermissionGuard key={item.name} permission={item.permission}>
                  <Link
                    href={item.href}
                    onClick={() => setIsSidebarOpen(false)}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                      item.current
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                </PermissionGuard>
              ))}
            </nav>

            <div className="flex-shrink-0 border-t border-gray-200 p-4">
              <div className="flex items-center mb-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </span>
                  </div>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>

              <Link
                href="/change-password"
                className="w-full mb-2 bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors"
                title="Change Password"
              >
                <Lock className="h-4 w-4 mr-2" />
                Change Password
              </Link>

              <button
                onClick={handleLogout}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
          <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
            <div className="flex items-center flex-shrink-0 px-4 py-5 border-b border-gray-200">
              <div className="flex-1">
                <h1 className="text-lg font-semibold text-gray-900">
                  {restaurantContext?.name || 'Dashboard'}
                </h1>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="text-xs text-gray-500">Role:</span>
                  <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                    {currentRole.roleTemplate.replace('_', ' ')}
                  </span>
                </div>
              </div>
            </div>

            <nav className="flex-1 px-4 py-4 space-y-2">
              {navigationItems.map((item) => (
                <PermissionGuard key={item.name} permission={item.permission}>
                  <Link
                    href={item.href}
                    className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                      item.current
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                </PermissionGuard>
              ))}
            </nav>

            <div className="flex-shrink-0 border-t border-gray-200 p-4">
              <div className="flex items-center mb-3">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {user.firstName[0]}
                      {user.lastName[0]}
                    </span>
                  </div>
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>

              <Link
                href="/change-password"
                className="w-full mb-2 bg-gray-50 hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center transition-colors"
                title="Change Password"
              >
                <Lock className="h-4 w-4 mr-2" />
                Change Password
              </Link>

              <button
                onClick={handleLogout}
                className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="lg:pl-64">
          {/* Top header */}
          <header className="sticky top-0 z-30 bg-white shadow-sm border-b border-gray-200">
            <div className="px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-2">
                <div className="flex items-center">
                  <button
                    onClick={() => setIsSidebarOpen(true)}
                    className="touch-target lg:hidden mr-2 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    aria-label="Open navigation menu"
                  >
                    <Menu className="h-6 w-6" />
                  </button>
                  <div className="flex items-center gap-2">
                    {(() => {
                      const PageIcon = getPageIcon();
                      return (
                        <PageIcon className="h-5 w-5 sm:h-6 sm:w-6 text-gray-700" />
                      );
                    })()}
                    <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                      {getPageTitle()}
                    </h1>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  {/* Role Switcher */}
                  <RoleSwitcher />

                  {/* Notifications */}
                  <PermissionGuard permission="notifications:read">
                    <NotificationBell />
                  </PermissionGuard>

                  {/* Live Clock - Local Browser Timezone */}
                  <DashboardClock />
                </div>
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </RestaurantProvider>
  );
}
