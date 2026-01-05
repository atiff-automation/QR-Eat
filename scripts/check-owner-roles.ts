import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasourceUrl:
    'postgresql://postgres:KiWqqGjkOHwMFISVFjmuHMIlgqrJYRcx@centerbeam.proxy.rlwy.net:54297/railway',
});

async function checkOwnerRoles() {
  try {
    console.log('Checking restaurant owner roles...\n');

    // Get Mario owner
    const owner = await prisma.restaurantOwner.findUnique({
      where: { email: 'mario@rossigroup.com' },
    });

    if (!owner) {
      console.error('Owner not found!');
      return;
    }

    console.log('Owner found:', {
      id: owner.id,
      email: owner.email,
      name: `${owner.firstName} ${owner.lastName}`,
    });

    // Check user roles
    const userRoles = await prisma.userRole.findMany({
      where: { userId: owner.id },
    });

    console.log('\nUser Roles:', userRoles.length);
    userRoles.forEach((role) => {
      console.log('  -', role);
    });

    // Check restaurants owned
    const restaurants = await prisma.restaurant.findMany({
      where: { ownerId: owner.id },
    });

    console.log('\nRestaurants owned:', restaurants.length);
    restaurants.forEach((r) => {
      console.log('  -', r.name, `(${r.slug})`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkOwnerRoles();
