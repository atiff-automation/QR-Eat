// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixConstraint() {
  try {
    console.log('Dropping foreign key constraint...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "order_modifications" 
      DROP CONSTRAINT IF EXISTS "order_modifications_modifiedBy_fkey"
    `);

    console.log('Making modifiedBy nullable...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "order_modifications" 
      ALTER COLUMN "modifiedBy" DROP NOT NULL
    `);

    console.log('Adding back optional foreign key constraint...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "order_modifications"
      ADD CONSTRAINT "order_modifications_modifiedBy_fkey" 
      FOREIGN KEY ("modifiedBy") REFERENCES "staff"("id") 
      ON DELETE SET NULL
    `);

    console.log('✅ Constraint fixed successfully!');
  } catch (error) {
    console.error('❌ Error fixing constraint:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixConstraint();
