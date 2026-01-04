I need to update all status values to uppercase in multiple API files. Here's a summary of what needs to be fixed:

## Files that need status value updates:

1. **src/app/api/orders/[id]/route.ts** - Line 315
2. **src/app/api/orders/[id]/modify/route.ts** - Line 61
3. **src/app/api/orders/table/[tableId]/route.ts** - Line 28
4. **src/app/api/orders/stats/route.ts** - Line 80
5. **src/app/api/orders/table/[tableId]/pay-all/route.ts** - Line 38
6. **src/app/api/orders/live/route.ts** - Line 160
7. **src/app/api/orders/create/route.ts** - Lines 102, 103, 120

## Pattern to replace:
- 'pending' → 'PENDING'
- 'confirmed' → 'CONFIRMED'
- 'preparing' → 'PREPARING'
- 'ready' → 'READY'
- 'served' → 'SERVED'
- 'cancelled' → 'CANCELLED'
- 'completed' → 'COMPLETED'
- 'paid' → 'PAID'
- 'active' → 'ACTIVE'
- 'ended' → 'ENDED'
- 'available' → 'AVAILABLE'
- 'occupied' → 'OCCUPIED'

This is critical because the database now uses enum types with uppercase values.
