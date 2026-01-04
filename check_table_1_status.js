
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTableOrders() {
  try {
    // 1. Find Table 1
    const table = await prisma.table.findFirst({
      where: { tableNumber: '1' } // Assuming '1' is the number
    });

    if (!table) {
      console.log('Table 1 not found.');
      return;
    }

    console.log(`Found Table 1: ID=${table.id}, RestaurantID=${table.restaurantId}`);

    // 2. Fetch all orders for this table
    const orders = await prisma.order.findMany({
      where: { tableId: table.id },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('--- Last 10 Orders for Table 1 ---');
    orders.forEach(o => {
      console.log(`Order: ${o.orderNumber} | Status: ${o.status} | Payment: ${o.paymentStatus} | Total: ${o.totalAmount}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTableOrders();
