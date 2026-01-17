import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Rewriting main to handle relations properly
async function run() {
  const table = await prisma.table.findFirst({
    where: { tableNumber: '1' },
    include: { restaurant: true },
  });

  if (!table) throw new Error('Table 1 not found');

  // Find or Create Session
  let session = await prisma.customerSession.findFirst({
    where: { tableId: table.id, status: 'ACTIVE' },
  });

  if (!session) {
    console.log('Creating new session...');
    session = await prisma.customerSession.create({
      data: {
        tableId: table.id,
        sessionToken: `test-token-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }

  const menuItem = await prisma.menuItem.findFirst();
  const price = 25.0; // Fixed price for simplicity

  const order = await prisma.order.create({
    data: {
      orderNumber: `TST-${Math.floor(Math.random() * 10000)}`,
      restaurantId: table.restaurantId,
      tableId: table.id,
      customerSessionId: session.id,
      status: 'READY',
      paymentStatus: 'PENDING',
      totalAmount: price,
      subtotalAmount: price,
      // Snapshot required fields from restaurant
      taxRateSnapshot: table.restaurant.taxRate,
      serviceChargeRateSnapshot: table.restaurant.serviceChargeRate,
      taxLabelSnapshot: table.restaurant.taxLabel,
      serviceChargeLabelSnapshot: table.restaurant.serviceChargeLabel,
      items: {
        create: {
          menuItemId: menuItem!.id,
          quantity: 1,
          unitPrice: price,
          totalAmount: price,
          status: 'PENDING',
        },
      },
    },
  });

  console.log(
    `✅ Created Order ${order.orderNumber} for Table 1. Amount: ${order.totalAmount}`
  );
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
