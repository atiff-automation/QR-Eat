import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testInactiveBlocking() {
  console.log('🧪 Testing INACTIVE Blocking via API Call...\n');

  try {
    // Get a table and set it to INACTIVE
    const table = await prisma.table.findFirst();
    if (!table) {
      console.log('❌ No tables found');
      process.exit(1);
    }

    console.log(`📋 Using Table: ${table.tableNumber} (${table.id})`);

    // Set to INACTIVE
    await prisma.table.update({
      where: { id: table.id },
      data: { status: 'INACTIVE' },
    });
    console.log('✅ Table set to INACTIVE\n');

    // Try to create an order via API
    console.log('🧪 Attempting to create order via API...');
    const response = await fetch('http://localhost:3000/api/qr/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tableId: table.id,
        customerInfo: { name: 'Test Customer' },
        specialInstructions: 'Test order on INACTIVE table',
      }),
    });

    const data = await response.json();

    console.log('\n📊 API Response:');
    console.log(`Status: ${response.status}`);
    console.log(`Body:`, JSON.stringify(data, null, 2));

    if (response.status === 400 && data.error?.includes('unavailable')) {
      console.log(
        '\n✅ BLOCKING WORKS! INACTIVE table correctly blocked order'
      );
    } else if (response.status === 200) {
      console.log('\n❌ BUG CONFIRMED! Order was created on INACTIVE table');
    } else {
      console.log('\n⚠️  Unexpected response');
    }

    // Reset table
    await prisma.table.update({
      where: { id: table.id },
      data: { status: 'AVAILABLE' },
    });
    console.log('\n✅ Reset table to AVAILABLE');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testInactiveBlocking();
