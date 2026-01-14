import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getCorrectQRUrl() {
  console.log('🔍 Getting Correct QR URLs for Testing...\n');

  try {
    const tables = await prisma.table.findMany({
      where: {
        restaurant: {
          subdomain: 'marios-authentic-italian',
        },
      },
      include: {
        restaurant: {
          select: {
            subdomain: true,
          },
        },
      },
      take: 3,
    });

    console.log(`Found ${tables.length} tables:\n`);

    tables.forEach((table, index) => {
      const qrData = {
        tableId: table.id,
        restaurant: table.restaurant.subdomain,
        timestamp: Date.now(),
      };

      const token = Buffer.from(JSON.stringify(qrData)).toString('base64');
      const qrUrl = `http://localhost:3000/qr/${token}`;

      console.log(`Table ${index + 1}: ${table.tableNumber}`);
      console.log(`  ID: ${table.id}`);
      console.log(`  Status: ${table.status}`);
      console.log(`  QR URL: ${qrUrl}`);
      console.log('');
    });

    console.log('\n🧪 Test Steps:');
    console.log('1. Login to http://localhost:3000');
    console.log('2. Go to Tables page');
    console.log('3. Click "Deactivate" on any table above');
    console.log('4. Copy the corresponding QR URL');
    console.log('5. Open in incognito window');
    console.log('6. Try to place order');
    console.log(
      '7. Should see: "This table is currently unavailable. Please contact staff."'
    );
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

getCorrectQRUrl();
