
import { PrismaClient } from '@prisma/client';
import { GenerateOrderNumber } from '../src/lib/utils/order-number'; // Assuming this utility exists or I'll implement a simple one

const prisma = new PrismaClient();

async function main() {
    console.log('🧪 Creating Test Order for Table 1...');

    const table = await prisma.table.findFirst({
        where: { tableNumber: '1' },
    });

    if (!table) {
        throw new Error('Table 1 not found');
    }

    // Find a random menu item to add
    const menuItem = await prisma.menuItem.findFirst();
    if (!menuItem) {
        throw new Error('No menu items found');
    }

    const orderNumber = `TEST-${Date.now()}`;

    // Create Order
    const order = await prisma.order.create({
        data: {
            orderNumber: orderNumber,
            restaurantId: table.restaurantId,
            tableId: table.id,
            customerSessionId: 'test-session-id', // Needs a valid or dummy session ID? Schema says String (uuid?) or just String.
            // Let's check schema for CustomerSession relation. It is required.
            // We need to find an active session or create one.
            status: 'READY',
            paymentStatus: 'PENDING',
            totalAmount: menuItem.price,
            subtotalAmount: menuItem.price,
            items: {
                create: {
                    menuItemId: menuItem.id,
                    quantity: 1,
                    unitPrice: menuItem.price,
                    totalAmount: menuItem.price
                }
            }
        }
    });

    // Wait order requires customerSessionId which is a relation.
    // I need to use 'connect' or 'create' for customerSession.
    // Actually, I should check if there is an active session for Table 1.
}

// Rewriting main to handle relations properly
async function run() {
    const table = await prisma.table.findFirst({
        where: { tableNumber: '1' },
    });

    // Find or Create Session
    let session = await prisma.customerSession.findFirst({
        where: { tableId: table?.id, status: 'ACTIVE' }
    });

    if (!session) {
        console.log('Creating new session...');
        session = await prisma.customerSession.create({
            data: {
                tableId: table!.id,
                sessionToken: `test-token-${Date.now()}`,
                expiresAt: new Date(Date.now() + 3600000),
            }
        });
    }

    const menuItem = await prisma.menuItem.findFirst();
    const price = 25.00; // Fixed price for simplicity

    const order = await prisma.order.create({
        data: {
            orderNumber: `TST-${Math.floor(Math.random() * 10000)}`,
            restaurantId: table!.restaurantId,
            tableId: table!.id,
            customerSessionId: session.id,
            status: 'READY',
            paymentStatus: 'PENDING',
            totalAmount: price,
            subtotalAmount: price,
            items: {
                create: {
                    menuItemId: menuItem!.id,
                    quantity: 1,
                    unitPrice: price,
                    totalAmount: price,
                    status: 'PENDING' // Assuming OrderItemStatus
                }
            }
        }
    });

    console.log(`✅ Created Order ${order.orderNumber} for Table 1. Amount: ${order.totalAmount}`);
}

run()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
