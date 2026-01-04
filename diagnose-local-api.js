
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- DIAGNOSTIC START ---');

    try {
        // 1. Simulate Stats API Query
        console.log('\n[TEST 1] Testing Stats API Logic...');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Exact query from api/orders/stats/route.ts
        const statsWhere = {
            createdAt: {
                gte: today,
                lte: new Date(),
            },
            // Note: We are simulating without restaurant/tenant filter first
            // to see if raw data fetch works.
        };

        console.log('Querying Order stats with filter:', JSON.stringify(statsWhere));

        const count = await prisma.order.count({ where: statsWhere });
        console.log(`✅ Success! Count: ${count}`);

        // 2. Simulate Order List API Query
        console.log('\n[TEST 2] Testing Order List API Logic (Active Orders)...');

        // Simulate "Active Orders" filter: excludeServed=true, status=all
        const listWhere = {
            status: { notIn: ['SERVED', 'CANCELLED'] }
        };

        console.log('Querying Order List with filter:', JSON.stringify(listWhere));

        // Try to fetch ONE order with full relation include (just like the API)
        // This often catches relation errors (e.g. invalid tableId)
        const order = await prisma.order.findFirst({
            where: listWhere,
            include: {
                table: true,
                customerSession: true,
                items: {
                    include: {
                        menuItem: true
                    }
                },
                // We'll skip conditional 'restaurant' include for now as it's simple
            }
        });

        if (order) {
            console.log('✅ Success! Found an active order.');
            console.log('Order ID:', order.id);
            console.log('Status:', order.status);
        } else {
            console.log('✅ Success! Query ran but found no active orders.');
        }

        // 3. Deep Enum Validation Check
        // We already fixed status/paymentStatus, checking others
        console.log('\n[TEST 3] Deep Enum Validation...');

        const invalidItems = await prisma.orderItem.findFirst({
            where: {
                status: { notIn: ['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED'] }
            }
        });

        if (invalidItems) console.error('❌ FAIL: Found OrderItem with invalid status!');
        else console.log('✅ OrderItem statuses look clean.');


    } catch (error) {
        console.error('\n❌ CRITICAL FAILURE DETECTED');
        console.error('Error Type:', error.name);
        console.error('Message:', error.message);
        if (error.code) console.error('Prisma Code:', error.code);
        if (error.meta) console.error('Meta:', JSON.stringify(error.meta));
    } finally {
        await prisma.$disconnect();
        console.log('\n--- DIAGNOSTIC END ---');
    }
}

main();
