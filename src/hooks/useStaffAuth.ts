'use client';

import { useState, useEffect } from 'react';

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
  logout: () => Promise<void>;
}

export function useStaffAuth(): UseStaffAuthReturn {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();

      if (response.ok && data.success) {
        setStaff(data.staff);
        setError(null);
      } else {
        setStaff(null);
        setError(data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setStaff(null);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
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
    logout
  };
}