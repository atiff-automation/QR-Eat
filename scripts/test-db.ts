import { prisma } from '../src/lib/database';

async function main() {
  const restaurantId = 'cb28dac2-b56a-4b56-9519-0345fed10b42';
  console.log(
    `Testing DB connection and query for restaurant: ${restaurantId}`
  );

  try {
    const categories = await prisma.menuCategory.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      include: {
        menuItems: {
          where: {
            isAvailable: true,
          },
          include: {
            variations: {
              orderBy: {
                displayOrder: 'asc',
              },
            },
          },
        },
      },
    });
    console.log('Query successful!');
    console.log(`Found ${categories.length} categories.`);
  } catch (error) {
    console.error('Query failed with error:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
