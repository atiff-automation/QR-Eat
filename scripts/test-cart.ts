import { prisma } from '../src/lib/database';
import { getTableCart, addToTableCart } from '../src/lib/table-session';

async function main() {
  const tableId = 'ac47367b-5b39-4672-9cc0-eaea46d092f0';

  console.log(`Testing Cart Lifecycle for table: ${tableId}`);

  try {
    // 1. Get a menu item to add
    const menuItem = await prisma.menuItem.findFirst({
      where: { isAvailable: true },
      include: { variations: true },
    });

    if (!menuItem) {
      console.error('No available menu item found to test.');
      return;
    }
    console.log(`Found menu item: ${menuItem.name} (${menuItem.id})`);

    // 2. Add to cart
    console.log('Adding to cart...');
    const cartItem = await addToTableCart({
      tableId,
      menuItemId: menuItem.id,
      quantity: 1,
      unitPrice: Number(menuItem.price), // Passing base price
      variationIds:
        menuItem.variations.length > 0 ? [menuItem.variations[0].id] : [],
      specialInstructions: 'Test script addition',
    });
    console.log('Added cart item:', cartItem.id);

    // 3. Get cart using the SESSION ID from the added item's operation
    // Using 'startedAt' as createdAt does not exist on CustomerSession
    const session = await prisma.customerSession.findFirst({
      where: { tableId, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
    });

    if (!session) {
      throw new Error('No active session found after adding item!');
    }
    console.log(`Using session: ${session.id}`);

    const cart = await getTableCart(tableId, session.id);
    console.log('getTableCart successful!');
    console.log('Cart Items:', JSON.stringify(cart.items, null, 2));
    console.log(
      `Total Items: ${cart.totalItems}, Total Amount: ${cart.totalAmount}`
    );
  } catch (error) {
    console.error('Test failed with error:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
