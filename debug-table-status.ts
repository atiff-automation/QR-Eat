/**
 * Debug script to check table status and order counts
 * Run this to diagnose the table status issue
 */

import { prisma } from './src/lib/database';

async function debugTableStatus() {
  console.log('='.repeat(80));
  console.log('TABLE STATUS DEBUG REPORT');
  console.log('='.repeat(80));

  // Get Table 1 and Table 2
  const tables = await prisma.table.findMany({
    where: {
      tableNumber: {
        in: ['1', '2'],
      },
    },
    include: {
      orders: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });

  for (const table of tables) {
    console.log('\n' + '-'.repeat(80));
    console.log(`TABLE ${table.tableNumber}`);
    console.log('-'.repeat(80));
    console.log(`Current Status: ${table.status}`);
    console.log(`Last Updated: ${table.updatedAt}`);
    console.log(`Total Orders: ${table.orders.length}`);

    // Count by status
    const statusCounts = {
      pending: 0,
      confirmed: 0,
      preparing: 0,
      ready: 0,
      served: 0,
      completed: 0,
      cancelled: 0,
    };

    table.orders.forEach((order) => {
      if (
        statusCounts[order.status as keyof typeof statusCounts] !== undefined
      ) {
        statusCounts[order.status as keyof typeof statusCounts]++;
      }
    });

    console.log('\nOrder Status Breakdown:');
    console.log(`  Pending:    ${statusCounts.pending}`);
    console.log(`  Confirmed:  ${statusCounts.confirmed}`);
    console.log(`  Preparing:  ${statusCounts.preparing}`);
    console.log(`  Ready:      ${statusCounts.ready}`);
    console.log(`  Served:     ${statusCounts.served}`);
    console.log(`  Completed:  ${statusCounts.completed}`);
    console.log(`  Cancelled:  ${statusCounts.cancelled}`);

    // Calculate what API would count
    const apiCount =
      statusCounts.pending + statusCounts.confirmed + statusCounts.preparing;
    const activeCount = apiCount + statusCounts.ready;

    console.log('\nAPI Counts:');
    console.log(`  "Items Pending" (API Filter): ${apiCount}`);
    console.log(`  Active Orders (for auto-clear): ${activeCount}`);

    console.log('\nExpected Behavior:');
    if (activeCount === 0) {
      console.log(`  ✅ Table should be "available" (no active orders)`);
    } else {
      console.log(
        `  ⚠️  Table should be "occupied" (${activeCount} active orders)`
      );
    }

    if (table.status === 'available' && activeCount > 0) {
      console.log(
        `  ❌ BUG: Table is "available" but has ${activeCount} active orders!`
      );
    } else if (table.status === 'occupied' && activeCount === 0) {
      console.log(`  ❌ BUG: Table is "occupied" but has no active orders!`);
    } else {
      console.log(`  ✅ Table status matches order state`);
    }

    // Show recent orders
    if (table.orders.length > 0) {
      console.log('\nRecent Orders:');
      table.orders.slice(0, 5).forEach((order, i) => {
        console.log(
          `  ${i + 1}. ${order.orderNumber} - Status: ${order.status}, Payment: ${order.paymentStatus}`
        );
      });
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('END OF REPORT');
  console.log('='.repeat(80));

  await prisma.$disconnect();
}

debugTableStatus().catch((error) => {
  console.error('Debug script failed:', error);
  process.exit(1);
});
