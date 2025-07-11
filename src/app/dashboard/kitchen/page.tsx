'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStaffAuth } from '@/hooks/useStaffAuth';
import { KitchenDisplayBoard } from '@/components/kitchen/KitchenDisplayBoard';

export default function KitchenPage() {
  const router = useRouter();
  const { staff, loading, error } = useStaffAuth();
  const [hasKitchenPermission, setHasKitchenPermission] = useState(false);

  useEffect(() => {
    if (!loading && !staff) {
      // Use window.location to preserve the redirect parameter properly
      window.location.href = '/login?redirect=' + encodeURIComponent('/dashboard/kitchen');
      return;
    }

    if (staff) {
      // Check if staff has kitchen/orders permissions
      const canViewKitchen = 
        staff.role.permissions.orders?.includes('read') ||
        staff.role.permissions.orders?.includes('write');
      
      setHasKitchenPermission(canViewKitchen);
      
      if (!canViewKitchen) {
        router.push('/dashboard');
      }
    }
  }, [staff, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-xl">Loading Kitchen Display...</p>
        </div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Access Error</h2>
          <p className="text-gray-300 mb-4">{error || 'Authentication required'}</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  if (!hasKitchenPermission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
          <p className="text-gray-300 mb-4">You don't have permission to access the kitchen display.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return <KitchenDisplayBoard />;
}