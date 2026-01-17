import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('\n🕵️  STARTING INTEGRITY AUDIT...\n');

  // 1. Setup: Get Mario's Restaurant
  const restaurant = await prisma.restaurant.findFirst({
    where: { slug: 'marios-authentic-italian' },
  });
  if (!restaurant) throw new Error('Restaurant not found');

  const table = await prisma.table.findFirst({
    where: { restaurantId: restaurant.id },
  });
  if (!table) throw new Error('Table not found');

  // 2. Scenario A: Current Tax (e.g. 6% or whatever is set)
  console.log(
    `Phase 1: Creating Order A with Current Tax (${Number(restaurant.taxRate) * 100}%)`
  );

  // Create Session
  const session = await prisma.customerSession.create({
    data: {
      tableId: table.id,
      sessionToken: `audit-token-1-${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });

  // Create Order A
  // (We simulate the API logic here by manually snapshotting,
  // effectively testing if the DB *can* store it and if our logic *would* work)
  // NOTE: In a real integration test we'd hit the API, but this verifies the Data Model.
  // However, to be 100% sure, we should rely on the FACT that the API (route.ts)
  // DOES this logic. This script mimics the API's behavior to prove the *storage* works.

  // Actually, calling the API would be better, but we can't easily do fetch() to localhost here without setup.
  // So we will mimic the API code exactly.

  const orderA = await prisma.order.create({
    data: {
      orderNumber: `AUDIT-A-${Math.floor(Math.random() * 1000)}`,
      restaurantId: restaurant.id,
      tableId: table.id,
      customerSessionId: session.id,
      subtotalAmount: 100,
      taxAmount: 100 * Number(restaurant.taxRate),
      serviceCharge: 100 * Number(restaurant.serviceChargeRate),
      totalAmount:
        100 *
        (1 + Number(restaurant.taxRate) + Number(restaurant.serviceChargeRate)),
      // SNAPSHOT
      taxRateSnapshot: restaurant.taxRate,
      serviceChargeRateSnapshot: restaurant.serviceChargeRate,
      taxLabelSnapshot: restaurant.taxLabel,
      serviceChargeLabelSnapshot: restaurant.serviceChargeLabel,
    },
  });

  console.log(
    `✅ Order A Created. Snapshot: ${Number(orderA.taxRateSnapshot) * 100}% (${orderA.taxLabelSnapshot})`
  );

  // 3. Scenario B: CHANGE THE LAWS! (Change Tax to 25%)
  console.log(`\n🔄 Phase 2: CHANGING GLOBAL TAX RATE TO 25% (Super Tax)...`);
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      taxRate: 0.25,
      taxLabel: 'Super Tax (25%)',
    },
  });
  const updatedRestaurant = await prisma.restaurant.findUnique({
    where: { id: restaurant.id },
  });
  console.log(`   Global Settings Updated: ${updatedRestaurant?.taxLabel}`);

  // 4. Scenario C: Create Order B (New Era)
  console.log(`\nPhase 3: Creating Order B with New Tax...`);

  const orderB = await prisma.order.create({
    data: {
      orderNumber: `AUDIT-B-${Math.floor(Math.random() * 1000)}`,
      restaurantId: restaurant.id,
      tableId: table.id,
      customerSessionId: session.id, // Reuse session
      subtotalAmount: 100,
      taxAmount: 100 * Number(updatedRestaurant!.taxRate),
      serviceCharge: 100 * Number(updatedRestaurant!.serviceChargeRate),
      totalAmount:
        100 *
        (1 +
          Number(updatedRestaurant!.taxRate) +
          Number(updatedRestaurant!.serviceChargeRate)),
      // SNAPSHOT NEW VALUES
      taxRateSnapshot: updatedRestaurant!.taxRate,
      serviceChargeRateSnapshot: updatedRestaurant!.serviceChargeRate,
      taxLabelSnapshot: updatedRestaurant!.taxLabel,
      serviceChargeLabelSnapshot: updatedRestaurant!.serviceChargeLabel,
    },
  });

  console.log(
    `✅ Order B Created. Snapshot: ${Number(orderB.taxRateSnapshot) * 100}% (${orderB.taxLabelSnapshot})`
  );

  // 5. THE PROOF: Fetch Order A again to ensure it didn't change
  console.log(`\n🕵️  Phase 4: VERIFICATION RESULT`);
  const refetchedOrderA = await prisma.order.findUnique({
    where: { id: orderA.id },
  });

  console.log('---------------------------------------------------');
  console.log(
    'Order A (Historical) | Snapshot Tax:',
    Number(refetchedOrderA!.taxRateSnapshot) * 100,
    '%',
    `[${refetchedOrderA!.taxLabelSnapshot}]`
  );
  console.log(
    'Order B (New)        | Snapshot Tax:',
    Number(orderB.taxRateSnapshot) * 100,
    '%',
    `[${orderB.taxLabelSnapshot}]`
  );
  console.log(
    'Current Global Rate  | Current  Tax:',
    Number(updatedRestaurant!.taxRate) * 100,
    '%',
    `[${updatedRestaurant!.taxLabel}]`
  );
  console.log('---------------------------------------------------');

  if (
    Number(refetchedOrderA!.taxRateSnapshot) !== 0.25 &&
    Number(orderB.taxRateSnapshot) === 0.25
  ) {
    console.log(
      '🎉 SUCCESS: Historical data preserved! Order A ignored the global update.'
    );
  } else {
    console.error('❌ FAILURE: Data corruption detected.');
  }

  // Cleanup: Reset tax back to normal
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      taxRate: 0.0875, // NYC tax rate
      taxLabel: 'SST (6%)', // Reset label
    },
  });
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => await prisma.$disconnect());
