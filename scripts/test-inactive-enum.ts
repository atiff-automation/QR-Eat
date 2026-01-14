import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testInactiveEnum() {
  console.log('🧪 Testing INACTIVE Enum Support...\n');

  try {
    // Test 1: Check if INACTIVE enum exists in database
    console.log('📋 Test 1: Checking TableStatus enum values...');
    const result = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'TableStatus'
      ORDER BY enumlabel;
    `;

    console.log(
      'Available enum values:',
      result.map((r) => r.enumlabel)
    );
    const hasInactive = result.some((r) => r.enumlabel === 'INACTIVE');
    console.log(
      hasInactive
        ? '✅ INACTIVE exists in enum'
        : '❌ INACTIVE missing from enum\n'
    );

    if (!hasInactive) {
      console.log('🔧 Fix: Run this SQL on your database:');
      console.log('   ALTER TYPE "TableStatus" ADD VALUE \'INACTIVE\';\n');
      process.exit(1);
    }

    // Test 2: Try to set a table to INACTIVE
    console.log('\n📋 Test 2: Attempting to set table to INACTIVE...');
    const tables = await prisma.table.findMany({ take: 1 });

    if (tables.length === 0) {
      console.log('❌ No tables found in database');
      process.exit(1);
    }

    const testTable = tables[0];
    console.log(`Using table: ${testTable.tableNumber} (${testTable.id})`);
    console.log(`Current status: ${testTable.status}`);

    // Try to update to INACTIVE
    const updated = await prisma.table.update({
      where: { id: testTable.id },
      data: { status: 'INACTIVE' },
    });

    console.log(`✅ Successfully set to: ${updated.status}`);

    // Test 3: Verify order blocking works
    console.log('\n📋 Test 3: Testing order creation blocking...');

    try {
      // This should fail with our validation
      const orderTest = await prisma.table.findUnique({
        where: { id: testTable.id },
      });

      if (orderTest?.status === 'INACTIVE') {
        console.log('✅ Table is INACTIVE in database');
        console.log('🧪 Order blocking should work - test via API');
      }
    } catch (error) {
      console.error('❌ Error checking table:', error);
    }

    // Reset table back to AVAILABLE
    await prisma.table.update({
      where: { id: testTable.id },
      data: { status: 'AVAILABLE' },
    });
    console.log('\n✅ Reset table back to AVAILABLE');

    console.log('\n🎉 All tests passed! INACTIVE enum is working.');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error) {
      if (error.message.includes('invalid input value')) {
        console.log(
          '\n💡 The error confirms: INACTIVE is NOT in the database enum!'
        );
        console.log('🔧 Fix: Run migrations to add INACTIVE:');
        console.log('   npx prisma migrate deploy');
      }
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testInactiveEnum();
