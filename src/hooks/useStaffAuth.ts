'use client';

import { useState, useEffect } from 'react';
import { ApiClient, ApiClientError } from '@/lib/api-client';

interface StaffRole {
  id: string;
  name: string;
  permissions: {
    [key: string]: string[];
  };
}

interface Staff {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
  };
}

interface UseStaffAuthReturn {
  staff: Staff | null;
  loading: boolean;
  error: string | null;
  redirectingToChangePassword: boolean;
  logout: () => Promise<void>;
}

export function useStaffAuth(): UseStaffAuthReturn {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [redirectingToChangePassword, setRedirectingToChangePassword] = useState(false);

  const fetchStaff = async () => {
    try {
      const data = await ApiClient.get<{
        user?: any;
        staff?: any;
      }>('/auth/me');

      // Handle both new multi-user API and legacy staff API
      const userData = data.user || data.staff;

      // Check if staff must change password
      if (userData && userData.userType === 'staff' && userData.mustChangePassword === true) {
        console.log('🔄 Kitchen staff must change password, redirecting...', {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName
        });
        setRedirectingToChangePassword(true);
        window.location.href = '/change-password';
        return;
      }

      setStaff(userData);
      setError(null);
    } catch (error) {
      console.error('Auth check failed:', error);
      setStaff(null);
      setError(error instanceof ApiClientError ? error.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await ApiClient.post('/auth/logout');
      setStaff(null);
      // Redirect will be handled by the component
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  return {
    staff,
    loading,
    error,
    redirectingToChangePassword,
    logout
  };
}