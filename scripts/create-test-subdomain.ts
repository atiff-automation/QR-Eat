import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const TARGET_SLUG = 'slug-restaurant';
  console.log(`Checking for existing restaurant with slug: ${TARGET_SLUG}...`);

  try {
    // 1. Check if the restaurant already exists
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { slug: TARGET_SLUG },
    });

    if (existingRestaurant) {
      console.log(
        `✅ Restaurant already exists: ${existingRestaurant.name} (${existingRestaurant.id})`
      );
      return;
    }

    // 2. Ensure an owner exists (or find the first one)
    console.log('Finding or creating an owner...');
    let owner = await prisma.restaurantOwner.findFirst();

    if (!owner) {
      console.log('No owner found. Creating a test owner...');
      owner = await prisma.restaurantOwner.create({
        data: {
          email: 'test-owner@example.com',
          passwordHash: 'hashed_placeholder_password', // In a real scenario, this should be a valid hash
          firstName: 'Test',
          lastName: 'Owner',
          companyName: 'Test Corp',
        },
      });
      console.log(`Created test owner: ${owner.email}`);
    } else {
      console.log(`Using existing owner: ${owner.email}`);
    }

    // 3. Create the restaurant
    console.log(`Creating restaurant with slug "${TARGET_SLUG}"...`);
    const newRestaurant = await prisma.restaurant.create({
      data: {
        name: 'Slug Restaurant Test',
        slug: TARGET_SLUG,
        ownerId: owner.id,
        address: '123 Web Scale Blvd',
        businessType: 'restaurant',
        cuisineTypes: ['Test', 'Fusion'],
        currency: 'MYR',
        phone: '+60123456789',
        description: 'A test restaurant for subdomain routing verification.',
        operatingHours: {
          monday: { open: '09:00', close: '22:00', closed: false },
          tuesday: { open: '09:00', close: '22:00', closed: false },
          wednesday: { open: '09:00', close: '22:00', closed: false },
          thursday: { open: '09:00', close: '22:00', closed: false },
          friday: { open: '09:00', close: '23:00', closed: false },
          saturday: { open: '10:00', close: '23:00', closed: false },
          sunday: { open: '10:00', close: '22:00', closed: false },
        },
      },
    });

    console.log(`✅ Successfully created restaurant!`);
    console.log(`   ID: ${newRestaurant.id}`);
    console.log(`   Name: ${newRestaurant.name}`);
    console.log(`   Slug: ${newRestaurant.slug}`);
    console.log(`   URL (Dev): http://${TARGET_SLUG}.localhost:3000`);
    console.log(
      `   URL (Prod): https://${TARGET_SLUG}.tabtep.app (requires DNS setup)`
    );
  } catch (error) {
    console.error('❌ Error creating test data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
