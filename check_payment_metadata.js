const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPaymentMetadata() {
    try {
        const payment = await prisma.payment.findFirst({
            where: {
                order: {
                    orderNumber: 'ORD-422300-927'
                }
            },
            include: {
                order: {
                    select: {
                        orderNumber: true,
                        status: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (payment) {
            console.log('\n✅ Payment Found!');
            console.log('Order Number:', payment.order.orderNumber);
            console.log('Order Status:', payment.order.status);
            console.log('Payment Metadata:', JSON.stringify(payment.paymentMetadata, null, 2));

            if (payment.paymentMetadata?.earlyPayment) {
                console.log('\n🎉 EARLY PAYMENT METADATA SAVED SUCCESSFULLY!');
                console.log('Paid at status:', payment.paymentMetadata.paidAtStatus);
            } else {
                console.log('\n❌ No early payment metadata found');
            }
        } else {
            console.log('❌ Payment not found for order ORD-422300-927');
        }
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkPaymentMetadata();
