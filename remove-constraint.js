// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function removeConstraint() {
  try {
    console.log('Removing foreign key constraint completely...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "order_modifications" 
      DROP CONSTRAINT IF EXISTS "order_modifications_modifiedBy_fkey"
    `);

    console.log('✅ Foreign key constraint removed successfully!');
    console.log(
      'Now modifiedBy can store any user ID (platform_admin, restaurant_owner, or staff)'
    );
  } catch (error) {
    console.error('❌ Error removing constraint:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeConstraint();
