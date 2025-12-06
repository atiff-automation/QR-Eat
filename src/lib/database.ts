import { PrismaClient } from '@prisma/client';
import {
  PG_SESSION_VARS,
  USER_TYPES,
  DEFAULT_VALUES,
  RLS_ERRORS,
} from './rls-constants';
import { TenantContextSchema, type TenantContext } from './rls-schemas';

// Type for Prisma transaction client
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Re-export types and schemas for convenience
export type { TenantContext } from './rls-schemas';
export { TenantContextSchema } from './rls-schemas';

// ============================================
// ROW-LEVEL SECURITY (RLS) METHODS
// ============================================

/**
 * Execute database operations with tenant context for RLS enforcement.
 * Uses PostgreSQL session variables to pass context to RLS policies.
 *
 * @param context - Tenant context (restaurantId, userId, userType)
 * @param operation - Database operation to execute within tenant context
 * @returns Result of the operation
 * @throws Error if validation fails or database operation fails
 *
 * @example
 * const orders = await withTenantContext(
 *   { restaurantId: '...', userId: '...', userType: 'staff' },
 *   async (tx) => tx.order.findMany()
 * );
 */
export async function withTenantContext<T>(
  context: TenantContext,
  operation: (prisma: TransactionClient) => Promise<T>
): Promise<T> {
  try {
    // Validate tenant context with Zod schema
    const validatedContext = TenantContextSchema.parse(context);

    return await prisma.$transaction(async (tx) => {
      // Set session variables using set_config for SQL injection safety
      // The 'true' parameter makes it transaction-local (safe for connection pooling)
      await tx.$executeRaw`SELECT set_config(${PG_SESSION_VARS.RESTAURANT_ID}, ${validatedContext.restaurantId}, true)`;
      await tx.$executeRaw`SELECT set_config(${PG_SESSION_VARS.USER_ID}, ${validatedContext.userId}, true)`;
      await tx.$executeRaw`SELECT set_config(${PG_SESSION_VARS.USER_TYPE}, ${validatedContext.userType}, true)`;

      // Set customer session token if provided (for customer orders)
      if (validatedContext.customerSessionToken) {
        await tx.$executeRaw`SELECT set_config(${PG_SESSION_VARS.CUSTOMER_SESSION_TOKEN}, ${validatedContext.customerSessionToken}, true)`;
      }

      // Execute the operation with RLS context applied
      return await operation(tx);
    });
  } catch (error) {
    // Re-throw Zod validation errors with clear context
    if (error instanceof Error) {
      throw new Error(
        `${RLS_ERRORS.DATABASE_OPERATION_FAILED}: ${error.message}`
      );
    }
    throw new Error(RLS_ERRORS.DATABASE_OPERATION_FAILED);
  }
}

/**
 * Execute database operations as platform admin (bypasses RLS).
 * Use sparingly - only for legitimate admin operations.
 *
 * @param operation - Database operation to execute with admin privileges
 * @returns Result of the operation
 * @throws Error if database operation fails
 *
 * @example
 * const allRestaurants = await asAdmin(async (tx) => tx.restaurant.findMany());
 */
export async function asAdmin<T>(
  operation: (prisma: TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config(${PG_SESSION_VARS.USER_TYPE}, ${USER_TYPES.PLATFORM_ADMIN}, true)`;
      return await operation(tx);
    });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `${RLS_ERRORS.DATABASE_OPERATION_FAILED}: ${error.message}`
      );
    }
    throw new Error(RLS_ERRORS.DATABASE_OPERATION_FAILED);
  }
}

/**
 * Execute database operations as a customer with session context.
 *
 * @param restaurantId - Restaurant ID from subdomain
 * @param sessionToken - Customer session token from cookie
 * @param operation - Database operation to execute
 * @returns Result of the operation
 * @throws Error if validation fails or database operation fails
 *
 * @example
 * const myOrders = await asCustomer(
 *   restaurantId,
 *   sessionToken,
 *   async (tx) => tx.order.findMany()
 * );
 */
export async function asCustomer<T>(
  restaurantId: string,
  sessionToken: string,
  operation: (prisma: TransactionClient) => Promise<T>
): Promise<T> {
  try {
    return await withTenantContext(
      {
        restaurantId,
        userId: DEFAULT_VALUES.ANONYMOUS_USER_ID,
        userType: USER_TYPES.CUSTOMER,
        customerSessionToken: sessionToken,
      },
      operation
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `${RLS_ERRORS.DATABASE_OPERATION_FAILED}: ${error.message}`
      );
    }
    throw new Error(RLS_ERRORS.DATABASE_OPERATION_FAILED);
  }
}

// ============================================
// DATABASE HEALTH & LIFECYCLE
// ============================================

// Database connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    // Log generic error only for security
    if (process.env.NODE_ENV === 'development') {
      console.error('Database connection failed');
    }
    return false;
  }
}

/**
 * Gracefully disconnect from the database.
 * Should be called during application shutdown.
 *
 * @throws Error if disconnection fails
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Database disconnection failed:', err);
    }
    throw new Error('Failed to disconnect from database');
  }
}
