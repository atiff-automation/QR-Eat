'use client';

import { useState, useEffect } from 'react';
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
  LogOut
} from 'lucide-react';

interface Staff {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: {
    id: string;
    name: string;
    description: string;
    permissions: Record<string, string[]>;
  };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
  };
  lastLoginAt?: string;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (response.ok) {
        // Handle both new multi-user API and legacy staff API
        const userData = data.user || data.staff;
        setStaff(userData);
      } else {
        if (response.status === 401) {
          router.push('/login');
        }
      }
    } catch (error) {
      console.error('Failed to fetch user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
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

  if (!staff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">Authentication required</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      current: pathname === '/dashboard',
    },
    {
      name: 'Orders',
      href: '/dashboard/orders',
      icon: ClipboardList,
      current: pathname.startsWith('/dashboard/orders'),
      permissions: ['orders']
    },
    {
      name: 'Tables',
      href: '/dashboard/tables',
      icon: ChefHat,
      current: pathname.startsWith('/dashboard/tables'),
      permissions: ['tables']
    },
    {
      name: 'Menu',
      href: '/dashboard/menu',
      icon: UtensilsCrossed,
      current: pathname.startsWith('/dashboard/menu'),
      permissions: ['menu']
    },
    {
      name: 'Staff',
      href: '/dashboard/staff',
      icon: Users,
      current: pathname.startsWith('/dashboard/staff'),
      permissions: ['staff']
    },
    {
      name: 'Reports',
      href: '/dashboard/reports',
      icon: BarChart3,
      current: pathname.startsWith('/dashboard/reports'),
      permissions: ['reports']
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      current: pathname.startsWith('/dashboard/settings'),
      permissions: ['settings']
    },
  ];

  const hasPermission = (permissions?: string[]) => {
    if (!permissions || permissions.length === 0) return true;
    if (!staff?.role?.permissions) return false;
    return permissions.some(permission => 
      staff.role.permissions[permission] && 
      staff.role.permissions[permission].length > 0
    );
  };

  const filteredNavigation = navigation.filter(item => hasPermission(item.permissions));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setIsSidebarOpen(false)}></div>
        <div className="relative flex flex-col w-64 bg-white h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <span className="text-lg font-semibold text-gray-900">Menu</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            {filteredNavigation.map((item) => (
              <Link
                key={item.name}
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
            ))}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex items-center flex-shrink-0 px-4 py-5 border-b border-gray-200">
            <h1 className="text-lg font-semibold text-gray-900">
              {staff.restaurant.name}
            </h1>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            {filteredNavigation.map((item) => (
              <Link
                key={item.name}
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
            ))}
          </nav>
          <div className="flex-shrink-0 border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {staff.firstName[0]}{staff.lastName[0]}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {staff.firstName} {staff.lastName}
                </p>
                <p className="text-xs text-gray-500">{staff.role.name}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-3 w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center"
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
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden mr-4 text-gray-400 hover:text-gray-600"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <h1 className="text-xl font-semibold text-gray-900">
                  {pathname === '/dashboard' ? 'Dashboard' :
                   pathname.includes('/orders') ? 'Orders' :
                   pathname.includes('/tables') ? 'Tables' :
                   pathname.includes('/menu') ? 'Menu Management' :
                   pathname.includes('/staff') ? 'Staff Management' :
                   pathname.includes('/reports') ? 'Reports' :
                   pathname.includes('/settings') ? 'Settings' : 'Dashboard'}
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-500">
                  {new Date().toLocaleString('en-US', {
                    timeZone: staff.restaurant.timezone,
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </div>
                <div className="lg:hidden">
                  <button
                    onClick={handleLogout}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}