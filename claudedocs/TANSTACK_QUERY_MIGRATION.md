# TanStack Query Migration - Production Implementation Plan

## Executive Summary

**Problem**: Current architecture uses React Context for server state, causing performance issues (infinite re-renders, manual state management, custom polling logic).

**Solution**: Migrate to TanStack Query (React Query) for all server state management.

**Impact**:
- Eliminates 300+ lines of custom state management
- Fixes infinite re-render bug
- Improves performance and caching
- Reduces bundle size
- Aligns with industry best practices (2024)

---

## Architecture Comparison

### Current (Anti-Pattern)
```typescript
React Context (RoleProvider)
  └── Manual useState/useEffect
  └── Custom polling logic
  └── Manual cache invalidation
  └── Manual error handling
  └── Manual loading states
  └── Causes re-render cascades
```

### Target (Best Practice)
```typescript
TanStack Query
  ├── Automatic caching (5min default)
  ├── Built-in polling (refetchInterval)
  ├── Automatic cache invalidation
  ├── Built-in error retry
  ├── Built-in loading states
  └── Normalized re-renders (only affected components)
```

---

## Migration Strategy

### Phase 1: Setup & Infrastructure ⚙️
**Time**: 30 minutes

1. Install TanStack Query
2. Create QueryClientProvider wrapper
3. Set up DevTools (development only)
4. Configure global defaults

**Files to create**:
- `src/lib/query-client.ts` - QueryClient configuration
- `src/providers/QueryProvider.tsx` - App-level provider

---

### Phase 2: Core Authentication (Critical Path) 🔐
**Time**: 1-2 hours

**Priority**: HIGH - Fixes infinite re-render bug

**Current**:
- `src/components/rbac/RoleProvider.tsx` (200 lines)
- Manual state management for user/roles/permissions

**Target**:
- `src/lib/hooks/queries/useAuth.ts` - Auth queries
- `src/lib/hooks/mutations/useAuthMutations.ts` - Auth mutations
- Remove RoleProvider state management
- Keep RoleProvider as thin wrapper (context for computed values only)

**Queries to create**:
```typescript
useAuthUser()       // GET /api/auth/me
useSwitchRole()     // POST /api/auth/switch-role (mutation)
useLogout()         // POST /api/auth/logout (mutation)
```

**Benefits**:
- Fixes infinite re-render immediately
- Auto-refetch on window focus
- Automatic error handling
- Built-in loading states

---

### Phase 3: Orders & Polling 📦
**Time**: 1 hour

**Priority**: HIGH - Critical business logic

**Current**:
- `src/lib/hooks/use-pending-orders.ts` (106 lines)
- Custom polling logic with setInterval
- Manual state management

**Target**:
- `src/lib/hooks/queries/useOrders.ts` - Order queries
- Built-in polling with refetchInterval

**Queries to create**:
```typescript
usePendingOrders()  // GET /api/pos/orders/pending (with polling)
useOrderById(id)    // GET /api/orders/{id}
useUpdateOrder()    // PATCH /api/orders/{id} (mutation)
```

**Migration**:
1. Create useQuery with refetchInterval: 30000
2. Replace use-pending-orders.ts hook usage
3. Remove custom polling logic

---

### Phase 4: Notifications 🔔
**Time**: 30 minutes

**Priority**: MEDIUM

**Current**:
- `src/components/dashboard/NotificationBell.tsx`
- Manual useEffect polling

**Target**:
- `src/lib/hooks/queries/useNotifications.ts`

**Queries to create**:
```typescript
useNotifications()      // GET /api/notifications (with polling)
useMarkAsRead()         // PATCH /api/notifications/{id} (mutation)
usePasswordReset()      // POST /api/owner/staff/{id}/reset-password (mutation)
```

---

### Phase 5: Other Polling Hooks 🔄
**Time**: 1 hour

**Priority**: MEDIUM

**Files**:
- `src/hooks/useAuthAwarePolling.ts`
- `src/components/kitchen/KitchenDisplayBoard.tsx`
- `src/components/orders/LiveOrderBoard.tsx`

**Strategy**: Replace custom polling with TanStack Query refetchInterval

---

### Phase 6: Cleanup & Optimization 🧹
**Time**: 30 minutes

**Priority**: LOW (but important)

1. Remove unused custom hooks
2. Delete old state management code
3. Update tests
4. Remove manual loading/error states
5. Consolidate API client usage

---

## Implementation Details

### 1. Global QueryClient Configuration

```typescript
// src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // Cache for 5 minutes
      gcTime: 10 * 60 * 1000,          // Garbage collect after 10 minutes
      retry: 1,                         // Retry failed requests once
      refetchOnWindowFocus: true,       // Auto-refetch on tab focus
      refetchOnReconnect: true,         // Auto-refetch on network reconnect
    },
    mutations: {
      retry: 0,                         // Don't retry mutations
    },
  },
});
```

### 2. Query Keys Convention

```typescript
// src/lib/query-keys.ts
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
    session: ['auth', 'session'] as const,
  },
  orders: {
    all: ['orders'] as const,
    pending: ['orders', 'pending'] as const,
    byId: (id: string) => ['orders', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    unread: ['notifications', 'unread'] as const,
  },
  staff: {
    all: ['staff'] as const,
    byId: (id: string) => ['staff', id] as const,
  },
} as const;
```

### 3. Example: Auth Hook Migration

**Before (RoleProvider.tsx)**:
```typescript
const [user, setUser] = useState(null);
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  const fetchUser = async () => {
    try {
      const data = await ApiClient.get('/auth/me');
      setUser(data.user);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };
  fetchUser();
}, []);
```

**After (useAuth.ts)**:
```typescript
export const useAuthUser = () => {
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => ApiClient.get('/auth/me'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
};

// Usage
const { data, isLoading, error, refetch } = useAuthUser();
// data = { user, currentRole, permissions, ... }
// No manual state management needed!
```

### 4. Example: Mutation with Cache Invalidation

```typescript
export const useSwitchRole = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roleId: string) =>
      ApiClient.post('/auth/switch-role', { roleId }),
    onSuccess: () => {
      // Automatically refetch user data after role switch
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
    },
  });
};

// Usage
const { mutate: switchRole, isPending } = useSwitchRole();
switchRole('new-role-id'); // That's it!
```

### 5. Example: Polling

**Before (use-pending-orders.ts)**:
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    loadOrders();
  }, 30000);
  return () => clearInterval(interval);
}, []);
```

**After**:
```typescript
export const usePendingOrders = () => {
  return useQuery({
    queryKey: queryKeys.orders.pending,
    queryFn: fetchPendingOrders,
    refetchInterval: 30000, // Built-in polling!
    // Automatic pause when window not focused
    // Automatic resume when window focused
  });
};
```

---

## Migration Checklist

### Phase 1: Setup ✅
- [ ] Install `@tanstack/react-query`
- [ ] Install `@tanstack/react-query-devtools` (dev dependency)
- [ ] Create `src/lib/query-client.ts`
- [ ] Create `src/providers/QueryProvider.tsx`
- [ ] Wrap app with QueryClientProvider
- [ ] Add DevTools (development only)

### Phase 2: Auth Migration ✅
- [ ] Create `src/lib/query-keys.ts`
- [ ] Create `src/lib/hooks/queries/useAuth.ts`
- [ ] Implement `useAuthUser()` query
- [ ] Implement `useSwitchRole()` mutation
- [ ] Implement `useLogout()` mutation
- [ ] Refactor RoleProvider to use queries
- [ ] Test authentication flow
- [ ] Verify infinite re-render is fixed

### Phase 3: Orders Migration ✅
- [ ] Create `src/lib/hooks/queries/useOrders.ts`
- [ ] Implement `usePendingOrders()` with polling
- [ ] Replace use-pending-orders.ts usage in CashierDashboard
- [ ] Test polling behavior
- [ ] Verify cache invalidation on mutations

### Phase 4: Notifications Migration ✅
- [ ] Create `src/lib/hooks/queries/useNotifications.ts`
- [ ] Implement `useNotifications()` query
- [ ] Implement `useMarkAsRead()` mutation
- [ ] Refactor NotificationBell component
- [ ] Test notification updates

### Phase 5: Cleanup ✅
- [ ] Remove old use-pending-orders.ts
- [ ] Remove manual state from RoleProvider
- [ ] Remove custom polling logic
- [ ] Update all imports
- [ ] Remove unused code
- [ ] Verify no regressions

---

## Testing Strategy

### 1. Unit Tests
```typescript
// Test query hooks in isolation
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

test('useAuthUser fetches user data', async () => {
  const { result } = renderHook(() => useAuthUser(), {
    wrapper: QueryClientProvider,
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data.user).toBeDefined();
});
```

### 2. Integration Tests
- Verify cache invalidation after mutations
- Test polling behavior
- Verify error handling and retry logic

### 3. Manual Testing
- [ ] Login flow works
- [ ] Role switching works
- [ ] Orders polling updates correctly
- [ ] Notifications update in real-time
- [ ] No infinite re-renders in console
- [ ] DevTools show correct query states

---

## Performance Benchmarks

### Before Migration
- **Console renders**: 200+ per second (CRITICAL BUG)
- **Network requests**: Duplicate/unnecessary fetches
- **Bundle size**: Custom state management overhead
- **Memory usage**: Increasing over time

### After Migration (Expected)
- **Console renders**: 1 per second (clock timer only)
- **Network requests**: Optimized with caching
- **Bundle size**: -50KB (removing custom logic)
- **Memory usage**: Stable (automatic garbage collection)

---

## Rollback Plan

If critical issues arise:

1. **Keep old code temporarily**: Don't delete RoleProvider immediately
2. **Feature flag**: Use environment variable to toggle between old/new
3. **Gradual migration**: Migrate one feature at a time
4. **Monitoring**: Watch for errors in production logs

---

## Documentation Updates Needed

After migration:
- [ ] Update `claudedocs/CODING_STANDARDS.md` - Add TanStack Query patterns
- [ ] Create `claudedocs/QUERY_PATTERNS.md` - Query/mutation examples
- [ ] Update component documentation
- [ ] Add JSDoc comments to hooks

---

## Estimated Total Time

| Phase | Time | Priority |
|-------|------|----------|
| Setup | 30 min | HIGH |
| Auth Migration | 1-2 hours | HIGH |
| Orders Migration | 1 hour | HIGH |
| Notifications | 30 min | MEDIUM |
| Other Polling | 1 hour | MEDIUM |
| Cleanup | 30 min | LOW |
| **TOTAL** | **4-6 hours** | - |

---

## Success Metrics

After migration is complete:

✅ **Performance**:
- Console shows <10 renders per second (vs 200+ before)
- No re-render cascade warnings
- Stable memory usage

✅ **Developer Experience**:
- 50% less state management code
- Built-in loading/error states
- DevTools for debugging queries

✅ **User Experience**:
- Faster page loads (cached data)
- Automatic background updates
- No UI lag or freezing

---

## Next Steps

1. **Approve this plan**
2. **Start Phase 1** (Setup)
3. **Implement incrementally** (one phase at a time)
4. **Test thoroughly** after each phase
5. **Deploy to production** once all phases complete

---

**Migration Lead**: Claude
**Document Version**: 1.0
**Last Updated**: 2025-12-21
