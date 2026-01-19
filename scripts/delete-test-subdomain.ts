import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const TARGET_SLUG = 'slug-restaurant';
  console.log(`Attempting to delete restaurant with slug: ${TARGET_SLUG}...`);

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: TARGET_SLUG },
    });

    if (!restaurant) {
      console.log(
        `ℹ️ Restaurant "${TARGET_SLUG}" not found. Nothing to delete.`
      );
      return;
    }

    await prisma.restaurant.delete({
      where: { slug: TARGET_SLUG },
    });

    console.log(
      `✅ Successfully deleted restaurant: ${restaurant.name} (${restaurant.id})`
    );
  } catch (error) {
    console.error('❌ Error deleting restaurant:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
