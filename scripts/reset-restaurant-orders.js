/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetRestaurantOrders() {
  const args = process.argv.slice(2);
  const slug = args[0];

  if (!slug) {
    console.error('Please provide a restaurant slug as an argument.');
    console.error('Usage: node scripts/reset-restaurant-orders.js <slug>');
    process.exit(1);
  }

  try {
    // Verified: Order model has onDelete: Cascade for:
    // - OrderItem
    // - Payment
    // - PaymentIntent
    // - TransactionFee
    // - OrderModification

    // 1. Find the restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: slug },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!restaurant) {
      console.error(`❌ Restaurant with slug "${slug}" not found.`);
      process.exit(1);
    }

    console.log(`\nFound Restaurant: ${restaurant.name} (${restaurant.id})`);
    console.log(`Current Order Count: ${restaurant._count.orders}`);
    console.log(
      `\n⚠️  WARNING: This will PERMANENTLY DELETE all ${restaurant._count.orders} orders for this restaurant.`
    );
    console.log(
      '   This includes order items, payments, transaction fees, and modifications.'
    );
    console.log('   THIS ACTION CANNOT BE UNDONE.\n');

    // For safety, require a second argument "CONFIRM" to actually execute
    const confirm = args[1];
    if (confirm !== 'CONFIRM') {
      console.log(
        'To proceed, run the command again with "CONFIRM" as the second argument:'
      );
      console.log(`node scripts/reset-restaurant-orders.js ${slug} CONFIRM`);
      process.exit(0);
    }

    console.log('🗑️  Deleting orders...');

    // Delete orders
    const deleteResult = await prisma.order.deleteMany({
      where: {
        restaurantId: restaurant.id,
      },
    });

    console.log(`✅ Successfully deleted ${deleteResult.count} orders.`);

    // Reset daily sequence if it exists
    const seqResult = await prisma.dailySequence.deleteMany({
      where: {
        restaurantId: restaurant.id,
      },
    });
    console.log(
      `Requested daily sequence reset. Deleted ${seqResult.count} sequence records.`
    );

    // Verify
    const finalCount = await prisma.order.count({
      where: { restaurantId: restaurant.id },
    });

    console.log(`\nVerification: Remaining orders: ${finalCount}`);
  } catch (error) {
    console.error('Error resetting orders:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetRestaurantOrders();
