import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fetching all restaurants...');
  try {
    const restaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (restaurants.length === 0) {
      console.log('No restaurants found.');
    } else {
      console.log('\nList of Restaurants:');
      console.log('--------------------------------------------------');
      console.log(
        `${'Name'.padEnd(30)} | ${'Slug (Subdomain)'.padEnd(30)} | ${'Status'}`
      );
      console.log('--------------------------------------------------');
      restaurants.forEach((r) => {
        const status = r.isActive ? 'Active' : 'Inactive';
        console.log(`${r.name.padEnd(30)} | ${r.slug.padEnd(30)} | ${status}`);
      });
      console.log('--------------------------------------------------');
      console.log(`\nTotal: ${restaurants.length} restaurants`);
    }
  } catch (error) {
    console.error('Error fetching restaurants:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
