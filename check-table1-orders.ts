/**
 * Check Table 1 orders payment status
 */

import { prisma } from './src/lib/database';

async function checkTable1Orders() {
  const table1 = await prisma.table.findFirst({
    where: { tableNumber: '1' },
    include: {
      orders: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 40,
      },
    },
  });

  if (!table1) {
    console.log('Table 1 not found');
    return;
  }

  console.log(`\nTable 1 Orders (showing last 40):`);
  console.log('='.repeat(100));

  const statusBreakdown = {
    'pending-pending': 0,
    'pending-completed': 0,
    'confirmed-pending': 0,
    'confirmed-completed': 0,
    'served-completed': 0,
    other: 0,
  };

  table1.orders.forEach((order, i) => {
    const key =
      `${order.status}-${order.paymentStatus}` as keyof typeof statusBreakdown;
    if (statusBreakdown[key] !== undefined) {
      statusBreakdown[key]++;
    } else {
      statusBreakdown['other']++;
    }

    if (i < 10) {
      console.log(
        `${i + 1}. ${order.orderNumber} | ` +
          `Status: ${order.status.padEnd(10)} | ` +
          `Payment: ${order.paymentStatus.padEnd(10)} | ` +
          `Amount: $${order.totalAmount}`
      );
    }
  });

  console.log('\n' + '='.repeat(100));
  console.log('Status Breakdown:');
  console.log(
    `  Pending + Pending Payment:    ${statusBreakdown['pending-pending']}`
  );
  console.log(
    `  Pending + Completed Payment:  ${statusBreakdown['pending-completed']} ❌ (BUG if > 0)`
  );
  console.log(
    `  Confirmed + Pending Payment:  ${statusBreakdown['confirmed-pending']}`
  );
  console.log(
    `  Confirmed + Completed Payment: ${statusBreakdown['confirmed-completed']} ❌ (BUG if > 0)`
  );
  console.log(
    `  Served + Completed Payment:   ${statusBreakdown['served-completed']}`
  );
  console.log(`  Other combinations:           ${statusBreakdown['other']}`);
  console.log('='.repeat(100));

  await prisma.$disconnect();
}

checkTable1Orders();
