/**
 * Status Standardization Script
 *
 * Migrates inconsistent status values in production database to standardized values.
 *
 * What it does:
 * 1. Migrates Order.paymentStatus: 'completed' → 'paid'
 * 2. Migrates CustomerSession.status: 'completed' → 'ended'
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/standardize-statuses.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

interface MigrationResult {
  orderPaymentStatusUpdated: number;
  customerSessionStatusUpdated: number;
  details: Array<{
    table: string;
    field: string;
    from: string;
    to: string;
    count: number;
  }>;
}

async function standardizeStatuses(): Promise<MigrationResult> {
  const result: MigrationResult = {
    orderPaymentStatusUpdated: 0,
    customerSessionStatusUpdated: 0,
    details: [],
  };

  try {
    console.log('🔧 Starting status standardization...\n');

    // Step 1: Standardize Order Payment Status
    console.log('Step 1: Standardizing Order payment status...');
    console.log('  Migrating: paymentStatus "completed" → "paid"');

    const orderPaymentResult = await prisma.order.updateMany({
      where: { paymentStatus: 'completed' },
      data: { paymentStatus: 'paid' },
    });

    result.orderPaymentStatusUpdated = orderPaymentResult.count;
    result.details.push({
      table: 'orders',
      field: 'paymentStatus',
      from: 'completed',
      to: 'paid',
      count: orderPaymentResult.count,
    });

    console.log(`  ✓ Updated ${orderPaymentResult.count} orders\n`);

    // Step 2: Standardize Customer Session Status
    console.log('Step 2: Standardizing Customer session status...');
    console.log('  Migrating: status "completed" → "ended"');

    const sessionResult = await prisma.customerSession.updateMany({
      where: { status: 'completed' },
      data: { status: 'ended' },
    });

    result.customerSessionStatusUpdated = sessionResult.count;
    result.details.push({
      table: 'customer_sessions',
      field: 'status',
      from: 'completed',
      to: 'ended',
      count: sessionResult.count,
    });

    console.log(`  ✓ Updated ${sessionResult.count} sessions\n`);

    // Verification
    console.log('Step 3: Verifying changes...');

    const orderPaymentStatuses = await prisma.order.groupBy({
      by: ['paymentStatus'],
      _count: true,
    });

    const sessionStatuses = await prisma.customerSession.groupBy({
      by: ['status'],
      _count: true,
    });

    console.log('\n📊 Current Status Distribution:');
    console.log('\nOrder Payment Statuses:');
    console.table(
      orderPaymentStatuses.map((s) => ({
        paymentStatus: s.paymentStatus,
        count: s._count,
      }))
    );

    console.log('\nCustomer Session Statuses:');
    console.table(
      sessionStatuses.map((s) => ({
        status: s.status,
        count: s._count,
      }))
    );

    console.log('\n✅ Status standardization complete!');
    console.log('\nSummary:');
    console.log(
      `  - Order payment statuses updated: ${result.orderPaymentStatusUpdated}`
    );
    console.log(
      `  - Customer session statuses updated: ${result.customerSessionStatusUpdated}`
    );

    return result;
  } catch (error) {
    console.error('\n❌ Error during status standardization:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the standardization
standardizeStatuses()
  .then((result) => {
    console.log('\n📋 Detailed Results:');
    console.table(result.details);
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
