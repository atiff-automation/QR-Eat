import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl:
    'postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway',
});

async function createTables() {
  try {
    console.log('Creating tables for Mario restaurant...');

    // Get Mario restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: 'marios-authentic-italian' },
    });

    if (!restaurant) {
      console.error('Mario restaurant not found!');
      return;
    }

    // Create tables using raw SQL to avoid enum issues
    await prisma.$executeRaw`
      INSERT INTO tables (id, "restaurantId", "tableNumber", "tableName", "qrCodeToken", capacity, status, "locationDescription", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${restaurant.id},
        '1',
        'Window Table',
        encode(convert_to('{"tableId":"mario-table-1","restaurant":"marios-authentic-italian","timestamp":' || extract(epoch from now())::bigint || '}', 'UTF8'), 'base64'),
        2,
        'AVAILABLE',
        'By the front window',
        NOW(),
        NOW()
      ) ON CONFLICT ("restaurantId", "tableNumber") DO NOTHING
    `;

    await prisma.$executeRaw`
      INSERT INTO tables (id, "restaurantId", "tableNumber", "tableName", "qrCodeToken", capacity, status, "locationDescription", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${restaurant.id},
        '2',
        'Center Table',
        encode(convert_to('{"tableId":"mario-table-2","restaurant":"marios-authentic-italian","timestamp":' || extract(epoch from now())::bigint || '}', 'UTF8'), 'base64'),
        4,
        'AVAILABLE',
        'Center dining area',
        NOW(),
        NOW()
      ) ON CONFLICT ("restaurantId", "tableNumber") DO NOTHING
    `;

    await prisma.$executeRaw`
      INSERT INTO tables (id, "restaurantId", "tableNumber", "tableName", "qrCodeToken", capacity, status, "locationDescription", "createdAt", "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        ${restaurant.id},
        '3',
        'Romantic Booth',
        encode(convert_to('{"tableId":"mario-table-3","restaurant":"marios-authentic-italian","timestamp":' || extract(epoch from now())::bigint || '}', 'UTF8'), 'base64'),
        2,
        'AVAILABLE',
        'Intimate corner booth',
        NOW(),
        NOW()
      ) ON CONFLICT ("restaurantId", "tableNumber") DO NOTHING
    `;

    console.log('Tables created successfully!');

    // Verify
    const tables = await prisma.$queryRaw`
      SELECT "tableNumber", "tableName", status 
      FROM tables 
      WHERE "restaurantId" = ${restaurant.id}
      ORDER BY "tableNumber"
    `;

    console.log('Tables in database:', tables);
  } catch (error) {
    console.error('Error creating tables:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTables();
