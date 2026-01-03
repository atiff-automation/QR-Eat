/**
 * Data Migration: Fix Stuck Orders and Table Status
 *
 * This script fixes the issue where orders have paymentStatus='completed'
 * but status is still 'pending' or 'confirmed', causing incorrect table status
 * and "Items Pending" counts.
 *
 * Run this ONCE to fix existing data.
 */

import { prisma } from './src/lib/database';
import { autoUpdateTableStatus } from './src/lib/table-status-manager';

async function fixStuckOrders() {
  console.log('='.repeat(80));
  console.log('DATA MIGRATION: Fix Stuck Orders and Table Status');
  console.log('='.repeat(80));

  try {
    // Step 1: Fix orders where payment is completed but status is not 'served'
    console.log(
      '\n[Step 1] Fixing orders with completed payment but incorrect status...'
    );

    const stuckOrders = await prisma.order.findMany({
      where: {
        paymentStatus: 'completed',
        status: {
          in: ['pending', 'confirmed', 'preparing', 'ready'],
        },
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        tableId: true,
        table: {
          select: {
            tableNumber: true,
          },
        },
      },
    });

    console.log(`Found ${stuckOrders.length} stuck orders to fix`);

    if (stuckOrders.length > 0) {
      // Update all stuck orders to 'served'
      const updateResult = await prisma.order.updateMany({
        where: {
          paymentStatus: 'completed',
          status: {
            in: ['pending', 'confirmed', 'preparing', 'ready'],
          },
        },
        data: {
          status: 'served',
          servedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      console.log(`✅ Updated ${updateResult.count} orders to 'served' status`);

      // Show sample of fixed orders
      console.log('\nSample of fixed orders:');
      stuckOrders.slice(0, 5).forEach((order) => {
        console.log(
          `  - ${order.orderNumber} (Table ${order.table.tableNumber}): ${order.status} → served`
        );
      });
    } else {
      console.log('✅ No stuck orders found');
    }

    // Step 2: Get unique table IDs that had stuck orders
    const affectedTableIds = [...new Set(stuckOrders.map((o) => o.tableId))];
    console.log(
      `\n[Step 2] Updating status for ${affectedTableIds.length} affected tables...`
    );

    // Step 3: Auto-update table status for all affected tables
    for (const tableId of affectedTableIds) {
      const table = await prisma.table.findUnique({
        where: { id: tableId },
        select: { tableNumber: true, status: true },
      });

      if (table) {
        console.log(
          `  Processing Table ${table.tableNumber} (current: ${table.status})...`
        );
        await autoUpdateTableStatus(tableId);

        // Check new status
        const updatedTable = await prisma.table.findUnique({
          where: { id: tableId },
          select: { status: true },
        });

        if (updatedTable && updatedTable.status !== table.status) {
          console.log(
            `    ✅ Updated: ${table.status} → ${updatedTable.status}`
          );
        } else {
          console.log(`    ℹ️  No change needed (still ${table.status})`);
        }
      }
    }

    // Step 4: Fix tables with no orders but status is 'occupied'
    console.log(
      '\n[Step 3] Fixing tables with no orders but status is "occupied"...'
    );

    const orphanedTables = await prisma.table.findMany({
      where: {
        status: 'occupied',
      },
      include: {
        _count: {
          select: {
            orders: {
              where: {
                status: {
                  in: ['pending', 'confirmed', 'preparing', 'ready'],
                },
              },
            },
          },
        },
      },
    });

    const tablesToClear = orphanedTables.filter((t) => t._count.orders === 0);

    console.log(
      `Found ${tablesToClear.length} occupied tables with no active orders`
    );

    if (tablesToClear.length > 0) {
      for (const table of tablesToClear) {
        await prisma.table.update({
          where: { id: table.id },
          data: {
            status: 'available',
            updatedAt: new Date(),
          },
        });
        console.log(
          `  ✅ Cleared Table ${table.tableNumber}: occupied → available`
        );
      }
    } else {
      console.log('✅ No orphaned tables found');
    }

    // Step 5: Summary
    console.log('\n' + '='.repeat(80));
    console.log('MIGRATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`✅ Fixed ${stuckOrders.length} stuck orders`);
    console.log(`✅ Updated ${affectedTableIds.length} table statuses`);
    console.log(`✅ Cleared ${tablesToClear.length} orphaned tables`);
    console.log('='.repeat(80));
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
fixStuckOrders()
  .then(() => {
    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
