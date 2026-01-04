// Test script to check if all table orders are marked as paid
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTablePaymentStatus(tableId) {
    try {
        const orders = await prisma.order.findMany({
            where: {
                tableId: tableId
            },
            include: {
                payment: true
            },
            orderBy: {
                createdAt: 'asc'
            }
        });

        console.log(`\n📊 Orders for table ${tableId}:`);
        console.log('='.repeat(60));

        orders.forEach((order, index) => {
            console.log(`\nOrder ${index + 1}:`);
            console.log(`  Order Number: ${order.orderNumber}`);
            console.log(`  Total Amount: RM ${order.totalAmount}`);
            console.log(`  Payment Status: ${order.paymentStatus}`);
            console.log(`  Order Status: ${order.status}`);

            if (order.payment) {
                console.log(`  ✅ Payment Record:`);
                console.log(`     Receipt: ${order.payment.receiptNumber}`);
                console.log(`     Cash Received: RM ${order.payment.cashReceived}`);
                console.log(`     Change Given: RM ${order.payment.changeGiven}`);
            } else {
                console.log(`  ❌ No payment record`);
            }
        });

        const paidCount = orders.filter(o => o.paymentStatus === 'PAID').length;
        const unpaidCount = orders.filter(o => o.paymentStatus === 'PENDING').length;

        console.log('\n' + '='.repeat(60));
        console.log(`📈 Summary:`);
        console.log(`   Total Orders: ${orders.length}`);
        console.log(`   Paid: ${paidCount}`);
        console.log(`   Unpaid: ${unpaidCount}`);

        if (unpaidCount > 0 && paidCount > 0) {
            console.log('\n⚠️  WARNING: Some orders are paid but others are not!');
        }

    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await prisma.$disconnect();
    }
}

// Get table ID from command line or use default
const tableId = process.argv[2] || 'mario-table-1';
checkTablePaymentStatus(tableId);
