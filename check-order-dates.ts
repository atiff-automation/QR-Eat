/**
 * Check actual order creation dates
 */

import { prisma } from './src/lib/database';

async function checkOrderDates() {
  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: ['pending', 'confirmed', 'preparing', 'ready'],
      },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdAt: true,
      table: {
        select: {
          tableNumber: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log('='.repeat(80));
  console.log('ORDER DATE CHECK');
  console.log('='.repeat(80));
  console.log(`Today's Midnight: ${today.toISOString()}`);
  console.log(`Current Time: ${new Date().toISOString()}`);
  console.log('\nRecent Active Orders:');
  console.log('-'.repeat(80));

  orders.forEach((order) => {
    const orderDate = new Date(order.createdAt);
    const isOld = orderDate.getTime() < today.getTime();

    console.log(`${order.orderNumber} (Table ${order.table.tableNumber})`);
    console.log(`  Created: ${order.createdAt.toISOString()}`);
    console.log(`  Status: ${order.status}`);
    console.log(
      `  Is Old? ${isOld ? '✅ YES (before midnight)' : '❌ NO (today)'}`
    );
    console.log('');
  });

  await prisma.$disconnect();
}

checkOrderDates();
