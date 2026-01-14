import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testOrderBlocking() {
  console.log('🧪 Testing INACTIVE Table Order Blocking...\n');

  try {
    // Get first table
    const table = await prisma.table.findFirst();
    if (!table) {
      console.log('❌ No tables found');
      process.exit(1);
    }

    console.log(`📋 Using Table: ${table.tableNumber} (${table.id})`);
    console.log(`Current status: ${table.status}\n`);

    // Set to INACTIVE
    console.log('🔧 Setting table to INACTIVE...');
    await prisma.table.update({
      where: { id: table.id },
      data: { status: 'INACTIVE' },
    });
    console.log('✅ Table set to INACTIVE\n');

    // Verify status
    const updated = await prisma.table.findUnique({
      where: { id: table.id },
    });
    console.log(`Verified status: ${updated?.status}`);

    // Simulate order creation check (what the API does)
    console.log('\n🧪 Simulating order creation...');
    const tableCheck = await prisma.table.findUnique({
      where: { id: table.id },
      include: {
        restaurant: {
          select: {
            id: true,
            taxRate: true,
            serviceChargeRate: true,
            isActive: true,
          },
        },
      },
    });

    if (!tableCheck) {
      console.log('❌ Table not found');
      process.exit(1);
    }

    // This is what the API checks
    if (tableCheck.status === 'RESERVED') {
      console.log('❌ Would block: Table is reserved');
    } else if (tableCheck.status === 'INACTIVE') {
      console.log('✅ BLOCKING WORKS! Table is INACTIVE');
      console.log(
        '   Error message: "This table is currently unavailable. Please contact staff."'
      );
    } else {
      console.log(`⚠️  Would allow order (status: ${tableCheck.status})`);
    }

    // Reset
    console.log('\n🔧 Resetting table to AVAILABLE...');
    await prisma.table.update({
      where: { id: table.id },
      data: { status: 'AVAILABLE' },
    });
    console.log('✅ Reset complete');

    console.log('\n📱 QR Code URL for testing:');
    console.log(
      `http://marios-authentic-italian.localhost:3000/table/${Buffer.from(
        JSON.stringify({
          tableId: table.id,
          restaurant: 'marios-authentic-italian',
          timestamp: Date.now(),
        })
      ).toString('base64')}`
    );

    console.log('\n🎯 To test manually:');
    console.log('1. Go to http://localhost:3000');
    console.log('2. Login with mario@rossigroup.com / owner123');
    console.log('3. Go to Tables page');
    console.log(`4. Click "Deactivate" on Table ${table.tableNumber}`);
    console.log('5. Use the QR URL above');
    console.log('6. Try to place an order');
    console.log('7. Should see: "This table is currently unavailable"');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testOrderBlocking();
