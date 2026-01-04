/**
 * Production Fix Script: Fix Stuck Tables
 *
 * One-time script to fix tables currently stuck in 'occupied' status in production.
 *
 * What it does:
 * 1. Connects to production database
 * 2. Ends the expired active session for Table 1
 * 3. Updates Table 1 and Table 2 status to 'available'
 * 4. Logs all changes made
 *
 * Usage:
 *   npx tsx scripts/fix-stuck-tables.ts
 *
 * Database URL should be set in environment variable:
 *   DATABASE_URL=postgresql://...
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

interface FixResult {
  sessionsEnded: number;
  tablesFixed: number;
  details: Array<{
    action: string;
    target: string;
    result: string;
  }>;
}

async function fixStuckTables(): Promise<FixResult> {
  const result: FixResult = {
    sessionsEnded: 0,
    tablesFixed: 0,
    details: [],
  };

  try {
    console.log('🔧 Starting production fix for stuck tables...\n');

    // Step 1: End the expired active session for Table 1
    console.log('Step 1: Checking for expired active sessions...');

    const expiredSessions = await prisma.customerSession.findMany({
      where: {
        status: 'active',
        expiresAt: {
          lt: new Date(),
        },
      },
      include: {
        table: {
          select: {
            tableNumber: true,
          },
        },
      },
    });

    console.log(`Found ${expiredSessions.length} expired active sessions`);

    for (const session of expiredSessions) {
      await prisma.customerSession.update({
        where: { id: session.id },
        data: {
          status: 'ended',
          endedAt: new Date(),
        },
      });

      result.sessionsEnded++;
      result.details.push({
        action: 'End expired session',
        target: `Table ${session.table.tableNumber} - Session ${session.id}`,
        result: 'Success',
      });

      console.log(
        `  ✓ Ended expired session for Table ${session.table.tableNumber}`
      );
    }

    // Step 2: Find tables that should be available but are marked as occupied
    console.log('\nStep 2: Checking for stuck tables...');

    const occupiedTables = await prisma.table.findMany({
      where: {
        status: 'occupied',
      },
      select: {
        id: true,
        tableNumber: true,
        status: true,
      },
    });

    console.log(`Found ${occupiedTables.length} occupied tables to check`);

    for (const table of occupiedTables) {
      // Check if table has any active orders
      const activeOrderCount = await prisma.order.count({
        where: {
          tableId: table.id,
          OR: [
            {
              status: {
                in: ['pending', 'confirmed', 'preparing', 'ready'],
              },
            },
            {
              status: 'served',
              paymentStatus: { notIn: ['paid', 'completed'] },
            },
          ],
        },
      });

      if (activeOrderCount === 0) {
        // No active orders - table should be available
        await prisma.table.update({
          where: { id: table.id },
          data: {
            status: 'available',
            updatedAt: new Date(),
          },
        });

        result.tablesFixed++;
        result.details.push({
          action: 'Fix table status',
          target: `Table ${table.tableNumber}`,
          result: 'occupied → available',
        });

        console.log(
          `  ✓ Fixed Table ${table.tableNumber}: occupied → available`
        );
      } else {
        console.log(
          `  ℹ Table ${table.tableNumber} has ${activeOrderCount} active orders - keeping as occupied`
        );
      }
    }

    console.log('\n✅ Production fix completed successfully!\n');
    console.log('Summary:');
    console.log(`  - Sessions ended: ${result.sessionsEnded}`);
    console.log(`  - Tables fixed: ${result.tablesFixed}`);

    return result;
  } catch (error) {
    console.error('\n❌ Error during production fix:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixStuckTables()
  .then((result) => {
    console.log('\n📋 Detailed Results:');
    console.table(result.details);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
