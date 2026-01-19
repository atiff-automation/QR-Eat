/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyReset() {
  const restaurantId = '8cf4cd45-5a84-496f-ac6c-7cc33a41adb6'; // Restoran Mari Tandang

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        _count: {
          select: {
            menuItems: true,
            categories: true,
            orders: true,
            tables: true,
          },
        },
      },
    });

    if (!restaurant) {
      console.log('Restaurant not found!');
      return;
    }

    console.log('Verification Results for:', restaurant.name);
    console.log('----------------------------------------');
    console.log('Orders (Should be 0):', restaurant._count.orders);
    console.log('Menu Items (Should be > 0):', restaurant._count.menuItems);
    console.log('Categories (Should be > 0):', restaurant._count.categories);
    console.log('Tables (Should be > 0):', restaurant._count.tables);
    console.log('Settings (Tax Rate):', restaurant.taxRate);
  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyReset();
