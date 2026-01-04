
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Connecting to LOCAL Database for Comprehensive Audit...');

    try {
        // ============================================================================
        // 1. Audit Order.status
        // Valid: PENDING, CONFIRMED, PREPARING, READY, SERVED, CANCELLED
        // Invalid: completed (lowercase or uppercase)
        // ============================================================================
        console.log('\n--- Auditing Order.status ---');

        // Check for invalid 'COMPLETED'
        const invalidOrderStatus = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM "orders" WHERE status = 'COMPLETED'
    `;
        console.log(`Orders with invalid 'COMPLETED' status: ${invalidOrderStatus[0].count}`);

        if (invalidOrderStatus[0].count > 0) {
            console.log('Fixing: Updating Order.status from COMPLETED to SERVED...');
            await prisma.$executeRaw`UPDATE "orders" SET status = 'SERVED' WHERE status = 'COMPLETED'`;
        }

        // Check for Lowercase
        const lowercaseOrderStatus = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM "orders" WHERE status::text != UPPER(status::text)
    `;
        console.log(`Orders with lowercase status: ${lowercaseOrderStatus[0].count}`);

        if (lowercaseOrderStatus[0].count > 0) {
            console.log('Fixing: Uppercasing Order.status...');
            await prisma.$executeRaw`
        UPDATE "orders" SET status = UPPER(status) 
        WHERE status::text != UPPER(status::text)
      `;
        }


        // ============================================================================
        // 2. Audit Order.paymentStatus
        // Valid: PENDING, PAID, REFUNDED, FAILED
        // Invalid: COMPLETED (This is often confused with Payment.status)
        // ============================================================================
        console.log('\n--- Auditing Order.paymentStatus ---');

        // Check for invalid 'COMPLETED' usage in paymentStatus
        const invalidPaymentStatus = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM "orders" WHERE "paymentStatus" = 'COMPLETED'
    `;
        console.log(`Orders with invalid 'COMPLETED' paymentStatus: ${invalidPaymentStatus[0].count}`);

        if (invalidPaymentStatus[0].count > 0) {
            console.log('Fixing: Updating Order.paymentStatus from COMPLETED to PAID...');
            await prisma.$executeRaw`UPDATE "orders" SET "paymentStatus" = 'PAID' WHERE "paymentStatus" = 'COMPLETED'`;
        }

        // Check for Lowercase
        const lowercasePaymentStatus = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM "orders" WHERE "paymentStatus"::text != UPPER("paymentStatus"::text)
    `;
        console.log(`Orders with lowercase paymentStatus: ${lowercasePaymentStatus[0].count}`);

        if (lowercasePaymentStatus[0].count > 0) {
            console.log('Fixing: Uppercasing Order.paymentStatus...');
            await prisma.$executeRaw`
        UPDATE "orders" SET "paymentStatus" = UPPER("paymentStatus") 
        WHERE "paymentStatus"::text != UPPER("paymentStatus"::text)
      `;
        }


        // ============================================================================
        // 3. Audit Payment.status (The separate Payment model)
        // Valid: PENDING, COMPLETED, FAILED, REFUNDED
        // Valid here IS 'COMPLETED', query should just check for lowercase
        // ============================================================================
        console.log('\n--- Auditing Payment.status ---');

        const lowercasePaymentModelStatus = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM "payments" WHERE status::text != UPPER(status::text)
    `;
        console.log(`Payments with lowercase status: ${lowercasePaymentModelStatus[0].count}`);

        if (lowercasePaymentModelStatus[0].count > 0) {
            console.log('Fixing: Uppercasing Payment.status...');
            await prisma.$executeRaw`
        UPDATE "payments" SET status = UPPER(status) 
        WHERE status::text != UPPER(status::text)
      `;
        }

        // Check for 'PAID' in Payment model (which would be invalid, should be COMPLETED)
        const invalidPaymentModelStatus = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM "payments" WHERE status = 'PAID'
    `;
        console.log(`Payments with invalid 'PAID' status: ${invalidPaymentModelStatus[0].count}`);

        if (invalidPaymentModelStatus[0].count > 0) {
            console.log('Fixing: Updating Payment.status from PAID to COMPLETED...');
            await prisma.$executeRaw`UPDATE "payments" SET status = 'COMPLETED' WHERE status = 'PAID'`;
        }


        // ============================================================================
        // 4. Audit Table.status
        // Valid: AVAILABLE, OCCUPIED, RESERVED
        // ============================================================================
        console.log('\n--- Auditing Table.status ---');

        const lowercaseTableStatus = await prisma.$queryRaw`
      SELECT count(*)::int as count FROM "tables" WHERE status::text != UPPER(status::text)
    `;
        console.log(`Tables with lowercase status: ${lowercaseTableStatus[0].count}`);

        if (lowercaseTableStatus[0].count > 0) {
            console.log('Fixing: Uppercasing Table.status...');
            await prisma.$executeRaw`
        UPDATE "tables" SET status = UPPER(status) 
        WHERE status::text != UPPER(status::text)
      `;
        }

        console.log('\nComprehensive Audit Completed Successfully.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
