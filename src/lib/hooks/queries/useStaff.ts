import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-client';

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, string[]>;
}

export interface StaffMember {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: 'ACTIVE' | 'INACTIVE';
  lastLoginAt?: string;
  createdAt: string;
  role: {
    id: string;
    name: string;
    description: string;
    permissions: Record<string, string[]>;
  };
  _count?: {
    orders: number;
  };
}

export interface StaffFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  roleId: string;
  status: 'ACTIVE' | 'INACTIVE';
  username: string;
}

/**
 * Hook to fetch all staff members
 */
export function useStaff() {
  return useQuery({
    queryKey: queryKeys.staff.all,
    queryFn: async () => {
      const data = await ApiClient.get<{ staff: StaffMember[] }>(
        '/admin/staff'
      );
      return data.staff || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
  });
}

/**
 * Hook to fetch all roles
 */
export function useRoles() {
  return useQuery({
    queryKey: queryKeys.staff.roles,
    queryFn: async () => {
      const data = await ApiClient.get<{ roles: Role[] }>('/admin/staff/roles');
      return data.roles || [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes (rarely changes)
    gcTime: 15 * 60 * 1000,
  });
}

/**
 * Hook to create a new staff member
 */
export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: StaffFormData) => {
      // Returns credentials to be displayed once
      return ApiClient.post<{
        staff: StaffMember;
        credentials: { username: string; password: string };
      }>('/admin/staff', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}

/**
 * Hook to update an existing staff member
 */
export function useUpdateStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: StaffFormData & { id: string }) => {
      return ApiClient.put<{ staff: StaffMember }>(`/admin/staff/${id}`, data);
    },
    onMutate: async ({ id, ...updates }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.staff.all });

      const previousStaff = queryClient.getQueryData<StaffMember[]>(
        queryKeys.staff.all
      );

      if (previousStaff) {
        queryClient.setQueryData<StaffMember[]>(
          queryKeys.staff.all,
          previousStaff.map((member) =>
            member.id === id ? { ...member, ...updates } : member
          )
        );
      }

      return { previousStaff };
    },
    onError: (err, variables, context) => {
      if (context?.previousStaff) {
        queryClient.setQueryData(queryKeys.staff.all, context.previousStaff);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}

/**
 * Hook to delete a staff member
 */
export function useDeleteStaff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return ApiClient.delete(`/admin/staff/${id}`);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.staff.all });

      const previousStaff = queryClient.getQueryData<StaffMember[]>(
        queryKeys.staff.all
      );

      if (previousStaff) {
        queryClient.setQueryData<StaffMember[]>(
          queryKeys.staff.all,
          previousStaff.filter((member) => member.id !== id)
        );
      }

      return { previousStaff };
    },
    onError: (err, variables, context) => {
      if (context?.previousStaff) {
        queryClient.setQueryData(queryKeys.staff.all, context.previousStaff);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}

/**
 * Hook to toggle staff status
 */
export function useToggleStaffStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      ...otherData
    }: {
      id: string;
      status: 'ACTIVE' | 'INACTIVE';
      // We often need to pass other data to satisfy the PUT endpoint requirements if strictly typed backend
      roleId: string;
      firstName: string;
      lastName: string;
      email: string;
      username: string;
    }) => {
      return ApiClient.put(`/admin/staff/${id}`, { status, ...otherData });
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.staff.all });

      const previousStaff = queryClient.getQueryData<StaffMember[]>(
        queryKeys.staff.all
      );

      if (previousStaff) {
        queryClient.setQueryData<StaffMember[]>(
          queryKeys.staff.all,
          previousStaff.map((member) =>
            member.id === id ? { ...member, status } : member
          )
        );
      }

      return { previousStaff };
    },
    onError: (err, variables, context) => {
      if (context?.previousStaff) {
        queryClient.setQueryData(queryKeys.staff.all, context.previousStaff);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}

/**
 * Hook to reset staff password
 */
export function useResetStaffPassword() {
  // Password reset usually returns new credentials or temporary password
  // It doesn't necessarily change the list view, so we might not need invalidation,
  // but if it changes 'lastLoginAt' or 'status', we might want to.
  // The current implementation in page.tsx re-fetched staff list.
  // We'll invalidate to be safe and consistent.
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return ApiClient.post<{
        temporaryPassword?: string;
        staffEmail: string;
        staffName: string;
      }>(`/owner/staff/${id}/reset-password`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}
