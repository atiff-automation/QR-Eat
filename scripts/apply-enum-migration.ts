/**
 * Apply Enum Migration to Production Database
 *
 * This script will:
 * 1. Create enum types
 * 2. Convert existing string columns to use enums
 * 3. Handle case conversion (lowercase to uppercase)
 */

import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

async function applyEnumMigration() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('✅ Connected to production database\n');

    // Step 1: Create enum types
    console.log('Step 1: Creating enum types...');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✓ OrderStatus enum created');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "OrderPaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✓ OrderPaymentStatus enum created');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✓ TableStatus enum created');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "CustomerSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'EXPIRED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✓ CustomerSessionStatus enum created');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✓ OrderItemStatus enum created');

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✓ PaymentStatus enum created\n');

    // Step 2: Convert columns to use enums
    console.log('Step 2: Converting columns to use enums...');

    // Orders table - status
    await client.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;`
    );
    await client.query(`
      ALTER TABLE "orders" 
      ALTER COLUMN "status" TYPE "OrderStatus" 
      USING (UPPER("status")::"OrderStatus");
    `);
    await client.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING';`
    );
    console.log('  ✓ orders.status converted to OrderStatus enum');

    // Orders table - paymentStatus
    await client.query(
      `ALTER TABLE "orders" ALTER COLUMN "paymentStatus" DROP DEFAULT;`
    );
    await client.query(`
      ALTER TABLE "orders" 
      ALTER COLUMN "paymentStatus" TYPE "OrderPaymentStatus" 
      USING (UPPER("paymentStatus")::"OrderPaymentStatus");
    `);
    await client.query(
      `ALTER TABLE "orders" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';`
    );
    console.log(
      '  ✓ orders.paymentStatus converted to OrderPaymentStatus enum'
    );

    // Tables table - status
    await client.query(
      `ALTER TABLE "tables" ALTER COLUMN "status" DROP DEFAULT;`
    );
    await client.query(`
      ALTER TABLE "tables" 
      ALTER COLUMN "status" TYPE "TableStatus" 
      USING (UPPER("status")::"TableStatus");
    `);
    await client.query(
      `ALTER TABLE "tables" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';`
    );
    console.log('  ✓ tables.status converted to TableStatus enum');

    // Customer sessions table - status
    await client.query(
      `ALTER TABLE "customer_sessions" ALTER COLUMN "status" DROP DEFAULT;`
    );
    await client.query(`
      ALTER TABLE "customer_sessions" 
      ALTER COLUMN "status" TYPE "CustomerSessionStatus" 
      USING (UPPER("status")::"CustomerSessionStatus");
    `);
    await client.query(
      `ALTER TABLE "customer_sessions" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';`
    );
    console.log(
      '  ✓ customer_sessions.status converted to CustomerSessionStatus enum'
    );

    // Order items table - status
    await client.query(
      `ALTER TABLE "order_items" ALTER COLUMN "status" DROP DEFAULT;`
    );
    await client.query(`
      ALTER TABLE "order_items" 
      ALTER COLUMN "status" TYPE "OrderItemStatus" 
      USING (UPPER("status")::"OrderItemStatus");
    `);
    await client.query(
      `ALTER TABLE "order_items" ALTER COLUMN "status" SET DEFAULT 'PENDING';`
    );
    console.log('  ✓ order_items.status converted to OrderItemStatus enum');

    // Payments table - status
    await client.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT;`
    );
    await client.query(`
      ALTER TABLE "payments" 
      ALTER COLUMN "status" TYPE "PaymentStatus" 
      USING (UPPER("status")::"PaymentStatus");
    `);
    await client.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'PENDING';`
    );
    console.log('  ✓ payments.status converted to PaymentStatus enum');

    console.log('\n✅ Migration completed successfully!');
    console.log('\nAll status columns now use strict enum types.');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the migration
applyEnumMigration()
  .then(() => {
    console.log('\n🎉 Database schema updated!');
    console.log('You can now redeploy the application.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
