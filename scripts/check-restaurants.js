const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkRestaurants() {
  try {
    const restaurants = await prisma.restaurant.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        ownerId: true,
        isActive: true,
        owner: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    console.log('🏢 Existing Restaurants:');
    console.log('━'.repeat(80));
    
    if (restaurants.length === 0) {
      console.log('No restaurants found in database.');
    } else {
      restaurants.forEach((restaurant, index) => {
        console.log(`${index + 1}. ${restaurant.name}`);
        console.log(`   Slug: ${restaurant.slug}`);
        console.log(`   Owner: ${restaurant.owner.firstName} ${restaurant.owner.lastName} (${restaurant.owner.email})`);
        console.log(`   Active: ${restaurant.isActive}`);
        console.log(`   ID: ${restaurant.id}`);
        console.log('');
      });
    }

    const owners = await prisma.restaurantOwner.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        restaurants: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });

    console.log('👤 Restaurant Owners:');
    console.log('━'.repeat(80));
    
    owners.forEach((owner, index) => {
      console.log(`${index + 1}. ${owner.firstName} ${owner.lastName} (${owner.email})`);
      console.log(`   Restaurants: ${owner.restaurants.map(r => `${r.name} (${r.slug})`).join(', ')}`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRestaurants();