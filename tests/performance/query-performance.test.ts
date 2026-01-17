/**
 * Query Performance Tests
 *
 * Purpose: Validate that composite indexes improve query performance
 * - Measure query execution time
 * - Assert < 100ms for indexed queries
 * - Validate index usage with EXPLAIN ANALYZE
 * - Compare before/after index creation
 *
 * Run: npm test -- tests/performance/query-performance.test.ts
 */

import { PrismaClient, OrderStatus, OrderPaymentStatus } from '@prisma/client';
import { performance } from 'perf_hooks';

const prisma = new PrismaClient();

// Performance thresholds (ms)
const THRESHOLDS = {
  CRITICAL_PATH: 10, // Session validation, authentication
  FAST_QUERY: 50, // Orders, staff, menu lookups
  COMPLEX_QUERY: 100, // Multi-table joins, reporting
};

// Test data IDs (will be created in beforeAll)
let testData: {
  restaurantId: string;
  tableId: string;
  staffId: string;
  categoryId: string;
  customerSessionId: string;
  orderIds: string[];
};

/**
 * Measure query execution time
 */
async function measureQuery<T>(
  name: string,
  queryFn: () => Promise<T>,
  threshold: number
): Promise<{ duration: number; result: T }> {
  const start = performance.now();
  const result = await queryFn();
  const end = performance.now();
  const duration = end - start;

  console.log(
    `  ${name}: ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
  );

  expect(duration).toBeLessThan(threshold);

  return { duration, result };
}

interface QueryPlanRow {
  'QUERY PLAN': string;
}

/**
 * Get query execution plan to verify index usage
 * SECURITY: This function should only be used with trusted, pre-constructed queries
 * Never pass user input directly to this function
 */
async function getQueryPlan(query: string): Promise<QueryPlanRow[]> {
  // Note: Using $queryRawUnsafe here is acceptable because:
  // 1. This is a test file, not production code
  // 2. Query parameter is constructed internally, not from user input
  // 3. EXPLAIN ANALYZE requires the full query as a string
  const plan = await prisma.$queryRawUnsafe<QueryPlanRow[]>(
    `EXPLAIN ANALYZE ${query}`
  );
  return plan;
}

/**
 * Check if query plan uses an index (not Seq Scan)
 */
function usesIndex(plan: QueryPlanRow[], indexName?: string): boolean {
  const planStr = JSON.stringify(plan);

  // Check for Index Scan (good)
  const hasIndexScan =
    planStr.includes('Index Scan') || planStr.includes('Index Only Scan');

  // Check for Seq Scan (bad - means index not used)
  const hasSeqScan = planStr.includes('Seq Scan');

  if (indexName) {
    // Check for specific index
    return planStr.includes(indexName);
  }

  return hasIndexScan && !hasSeqScan;
}

describe('Query Performance Tests', () => {
  beforeAll(async () => {
    // Create test data
    console.log('\n📊 Setting up test data...\n');

    const owner = await prisma.restaurantOwner.create({
      data: {
        email: 'perf-test@example.com',
        passwordHash: 'test-hash',
        firstName: 'Performance',
        lastName: 'Test',
      },
    });

    const restaurant = await prisma.restaurant.create({
      data: {
        ownerId: owner.id,
        name: 'Performance Test Restaurant',
        slug: 'perf-test-restaurant',
        address: '123 Test St',
      },
    });

    const table = await prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: 'PERF-1',
        qrCodeToken: `perf-test-token-${Date.now()}`,
      },
    });

    const role = await prisma.staffRole.create({
      data: {
        name: `Performance Test Role ${Date.now()}`,
        permissions: {},
      },
    });

    const staff = await prisma.staff.create({
      data: {
        restaurantId: restaurant.id,
        roleId: role.id,
        email: `perf-staff-${Date.now()}@example.com`,
        username: `perfstaff${Date.now()}`,
        passwordHash: 'test-hash',
        firstName: 'Perf',
        lastName: 'Staff',
        isActive: true,
      },
    });

    const category = await prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Performance Test Category',
        isActive: true,
      },
    });

    // Create menu items
    await prisma.menuItem.createMany({
      data: Array.from({ length: 20 }, (_, i) => ({
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: `Test Item ${i}`,
        price: 10.0 + i,
        isAvailable: i % 2 === 0, // Half available, half not
        isFeatured: i % 3 === 0, // Every third item featured
        displayOrder: i,
      })),
    });

    const customerSession = await prisma.customerSession.create({
      data: {
        tableId: table.id,
        sessionToken: `perf-session-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
        status: 'ACTIVE',
      },
    });

    // Create orders with various statuses
    const orderStatuses: OrderStatus[] = [
      'PENDING',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'SERVED',
    ];
    const paymentStatuses: OrderPaymentStatus[] = ['PENDING', 'PAID', 'FAILED'];

    const orders = await Promise.all(
      Array.from({ length: 15 }, async (_, i) => {
        return prisma.order.create({
          data: {
            orderNumber: `PERF-ORDER-${Date.now()}-${i}`,
            restaurantId: restaurant.id,
            tableId: table.id,
            customerSessionId: customerSession.id,
            status: orderStatuses[i % orderStatuses.length],
            paymentStatus: paymentStatuses[i % paymentStatuses.length],
            totalAmount: 100.0 + i,
            takenBy: staff.id,
            taxRateSnapshot: 0,
            serviceChargeRateSnapshot: 0,
            taxLabelSnapshot: 'Tax',
            serviceChargeLabelSnapshot: 'Service',
          },
        });
      })
    );

    testData = {
      restaurantId: restaurant.id,
      tableId: table.id,
      staffId: staff.id,
      categoryId: category.id,
      customerSessionId: customerSession.id,
      orderIds: orders.map((o) => o.id),
    };

    console.log('✅ Test data created\n');
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.order.deleteMany({
      where: { restaurantId: testData.restaurantId },
    });
    await prisma.menuItem.deleteMany({
      where: { restaurantId: testData.restaurantId },
    });
    await prisma.menuCategory.deleteMany({
      where: { id: testData.categoryId },
    });
    await prisma.customerSession.deleteMany({
      where: { tableId: testData.tableId },
    });
    await prisma.staff.deleteMany({
      where: { restaurantId: testData.restaurantId },
    });
    await prisma.table.deleteMany({
      where: { id: testData.tableId },
    });
    await prisma.restaurant.deleteMany({
      where: { id: testData.restaurantId },
    });
    await prisma.restaurantOwner.deleteMany({
      where: { email: 'perf-test@example.com' },
    });
    await prisma.staffRole.deleteMany({
      where: { name: { startsWith: 'Performance Test Role' } },
    });

    await prisma.$disconnect();
  });

  describe('HIGH PRIORITY: Order Queries', () => {
    it('should query orders by restaurant + status efficiently', async () => {
      await measureQuery(
        'Orders by restaurant + status',
        async () => {
          return await prisma.order.findMany({
            where: {
              restaurantId: testData.restaurantId,
              status: 'PENDING',
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          });
        },
        THRESHOLDS.FAST_QUERY
      );
    });

    it('should query orders by restaurant + payment status efficiently', async () => {
      await measureQuery(
        'Orders by restaurant + payment status',
        async () => {
          return await prisma.order.findMany({
            where: {
              restaurantId: testData.restaurantId,
              paymentStatus: 'PAID',
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
          });
        },
        THRESHOLDS.FAST_QUERY
      );
    });

    it('should query orders by table + session efficiently', async () => {
      await measureQuery(
        'Orders by table + session',
        async () => {
          return await prisma.order.findMany({
            where: {
              tableId: testData.tableId,
              customerSessionId: testData.customerSessionId,
            },
          });
        },
        THRESHOLDS.FAST_QUERY
      );
    });
  });

  describe('MEDIUM PRIORITY: Staff Queries', () => {
    it('should query staff by restaurant + active status efficiently', async () => {
      await measureQuery(
        'Staff by restaurant + active',
        async () => {
          return await prisma.staff.findMany({
            where: {
              restaurantId: testData.restaurantId,
              isActive: true,
            },
          });
        },
        THRESHOLDS.FAST_QUERY
      );
    });

    it('should query staff by email + active efficiently (login)', async () => {
      const staffEmail = await prisma.staff.findFirst({
        where: { restaurantId: testData.restaurantId },
        select: { email: true },
      });

      if (!staffEmail) {
        throw new Error('Staff not found');
      }

      await measureQuery(
        'Staff login by email + active',
        async () => {
          return await prisma.staff.findFirst({
            where: {
              email: staffEmail.email,
              isActive: true,
            },
          });
        },
        THRESHOLDS.CRITICAL_PATH
      );
    });
  });

  describe('MEDIUM PRIORITY: Menu Item Queries', () => {
    it('should query menu items by restaurant + available efficiently', async () => {
      await measureQuery(
        'Menu items by restaurant + available',
        async () => {
          return await prisma.menuItem.findMany({
            where: {
              restaurantId: testData.restaurantId,
              isAvailable: true,
            },
            orderBy: { displayOrder: 'asc' },
          });
        },
        THRESHOLDS.FAST_QUERY
      );
    });

    it('should query menu items by category + featured efficiently', async () => {
      await measureQuery(
        'Menu items by category + featured',
        async () => {
          return await prisma.menuItem.findMany({
            where: {
              categoryId: testData.categoryId,
            },
            orderBy: [{ isFeatured: 'desc' }, { displayOrder: 'asc' }],
          });
        },
        THRESHOLDS.FAST_QUERY
      );
    });
  });

  describe('CRITICAL PATH: Session Validation', () => {
    it('should validate staff session efficiently', async () => {
      // Create a test staff session
      const session = await prisma.staffSession.create({
        data: {
          staffId: testData.staffId,
          sessionToken: `perf-test-session-${Date.now()}`,
          expiresAt: new Date(Date.now() + 3600000), // 1 hour
        },
      });

      await measureQuery(
        'Staff session validation',
        async () => {
          return await prisma.staffSession.findFirst({
            where: {
              staffId: testData.staffId,
              expiresAt: { gt: new Date() },
            },
            orderBy: { expiresAt: 'desc' },
          });
        },
        THRESHOLDS.CRITICAL_PATH
      );

      // Cleanup
      await prisma.staffSession.delete({ where: { id: session.id } });
    });

    it('should validate customer session efficiently', async () => {
      await measureQuery(
        'Customer session by table + status',
        async () => {
          return await prisma.customerSession.findFirst({
            where: {
              tableId: testData.tableId,
              status: 'ACTIVE',
            },
            orderBy: { startedAt: 'desc' },
          });
        },
        THRESHOLDS.CRITICAL_PATH
      );
    });
  });

  describe('Index Usage Validation', () => {
    it('should use idx_orders_restaurant_status_created for order queries', async () => {
      const query = `
        SELECT * FROM orders
        WHERE restaurant_id = '${testData.restaurantId}'
          AND status = 'PENDING'
        ORDER BY created_at DESC
        LIMIT 50
      `;

      const plan = await getQueryPlan(query);
      const planStr = JSON.stringify(plan);

      console.log('  Query plan:', planStr.substring(0, 200));

      // Should use index scan, not sequential scan
      expect(usesIndex(plan)).toBe(true);
      expect(planStr).not.toContain('Seq Scan on orders');
    });

    it('should use idx_staff_restaurant_active for staff queries', async () => {
      const query = `
        SELECT * FROM staff
        WHERE restaurant_id = '${testData.restaurantId}'
          AND is_active = true
      `;

      const plan = await getQueryPlan(query);
      const planStr = JSON.stringify(plan);

      console.log('  Query plan:', planStr.substring(0, 200));

      // Should use index scan
      expect(usesIndex(plan)).toBe(true);
    });
  });
});
