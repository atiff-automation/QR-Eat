import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create test restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Mario's Local Test Restaurant",
      slug: 'marios-local',
      address: '123 Test Street, Local City, LC 12345',
      phone: '+1-555-123-4567',
      email: 'info@marios-local.com',
      timezone: 'America/New_York',
      currency: 'USD',
      taxRate: 0.085, // 8.5%
      serviceChargeRate: 0.12, // 12%
    },
  });

  console.log('✅ Created restaurant:', restaurant.name);

  // Create staff roles
  const managerRole = await prisma.staffRole.create({
    data: {
      name: 'Manager',
      description: 'Restaurant manager with full access',
      permissions: {
        orders: ['read', 'write', 'delete'],
        menu: ['read', 'write', 'delete'],
        staff: ['read', 'write'],
        reports: ['read'],
        settings: ['read', 'write'],
      },
    },
  });

  const serverRole = await prisma.staffRole.create({
    data: {
      name: 'Server',
      description: 'Server with order management access',
      permissions: {
        orders: ['read', 'write'],
        menu: ['read'],
        tables: ['read', 'write'],
      },
    },
  });

  const kitchenRole = await prisma.staffRole.create({
    data: {
      name: 'Kitchen',
      description: 'Kitchen staff with order preparation access',
      permissions: {
        orders: ['read', 'write'],
        kitchen: ['read', 'write'],
      },
    },
  });

  console.log('✅ Created staff roles:', [
    managerRole.name,
    serverRole.name,
    kitchenRole.name,
  ]);

  // Create menu categories
  const categories = await Promise.all([
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Appetizers',
        description: 'Start your meal right',
        displayOrder: 1,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Main Courses',
        description: 'Hearty and delicious mains',
        displayOrder: 2,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Desserts',
        description: 'Sweet endings',
        displayOrder: 3,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Beverages',
        description: 'Refreshing drinks',
        displayOrder: 4,
      },
    }),
  ]);

  console.log('✅ Created categories:', categories.length);

  // Create menu items
  const menuItems = await Promise.all([
    // Appetizers
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[0].id,
        name: 'Bruschetta',
        description: 'Toasted bread with tomatoes, garlic, and basil',
        price: 8.99,
        preparationTime: 10,
        calories: 150,
        allergens: ['gluten'],
        dietaryInfo: ['vegetarian'],
        isAvailable: true,
        displayOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[0].id,
        name: 'Calamari Rings',
        description: 'Crispy fried squid with marinara sauce',
        price: 12.99,
        preparationTime: 15,
        calories: 280,
        allergens: ['seafood', 'gluten'],
        dietaryInfo: [],
        isAvailable: true,
        displayOrder: 2,
      },
    }),
    // Main Courses
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[1].id,
        name: 'Margherita Pizza',
        description: 'Fresh tomato sauce, mozzarella, and basil',
        price: 16.99,
        preparationTime: 20,
        calories: 650,
        allergens: ['gluten', 'dairy'],
        dietaryInfo: ['vegetarian'],
        isAvailable: true,
        isFeatured: true,
        displayOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[1].id,
        name: 'Pasta Carbonara',
        description: 'Spaghetti with eggs, pancetta, and parmesan',
        price: 18.99,
        preparationTime: 25,
        calories: 720,
        allergens: ['gluten', 'dairy', 'eggs'],
        dietaryInfo: [],
        isAvailable: true,
        displayOrder: 2,
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[1].id,
        name: 'Grilled Salmon',
        description: 'Atlantic salmon with lemon herb butter',
        price: 24.99,
        preparationTime: 18,
        calories: 420,
        allergens: ['fish'],
        dietaryInfo: ['gluten-free', 'keto-friendly'],
        isAvailable: true,
        displayOrder: 3,
      },
    }),
    // Desserts
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[2].id,
        name: 'Tiramisu',
        description: 'Classic Italian coffee-flavored dessert',
        price: 7.99,
        preparationTime: 5,
        calories: 380,
        allergens: ['dairy', 'eggs', 'gluten'],
        dietaryInfo: [],
        isAvailable: true,
        displayOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[2].id,
        name: 'Chocolate Lava Cake',
        description: 'Warm chocolate cake with molten center',
        price: 8.99,
        preparationTime: 12,
        calories: 450,
        allergens: ['dairy', 'eggs', 'gluten'],
        dietaryInfo: [],
        isAvailable: true,
        displayOrder: 2,
      },
    }),
    // Beverages
    prisma.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categories[3].id,
        name: 'Italian Soda',
        description: 'Sparkling water with natural fruit flavors',
        price: 3.99,
        preparationTime: 2,
        calories: 120,
        allergens: [],
        dietaryInfo: ['vegan', 'gluten-free'],
        isAvailable: true,
        displayOrder: 1,
      },
    }),
  ]);

  console.log('✅ Created menu items:', menuItems.length);

  // Add menu item variations for pizza
  const pizzaSizes = await Promise.all([
    prisma.menuItemVariation.create({
      data: {
        menuItemId: menuItems[2].id, // Margherita Pizza
        name: 'Small (10")',
        priceModifier: -2.0,
        variationType: 'size',
        isRequired: true,
        displayOrder: 1,
      },
    }),
    prisma.menuItemVariation.create({
      data: {
        menuItemId: menuItems[2].id,
        name: 'Medium (12")',
        priceModifier: 0.0,
        variationType: 'size',
        isRequired: true,
        displayOrder: 2,
      },
    }),
    prisma.menuItemVariation.create({
      data: {
        menuItemId: menuItems[2].id,
        name: 'Large (14")',
        priceModifier: 3.0,
        variationType: 'size',
        isRequired: true,
        displayOrder: 3,
      },
    }),
    // Pizza toppings
    prisma.menuItemVariation.create({
      data: {
        menuItemId: menuItems[2].id,
        name: 'Extra Cheese',
        priceModifier: 2.0,
        variationType: 'topping',
        isRequired: false,
        displayOrder: 1,
      },
    }),
    prisma.menuItemVariation.create({
      data: {
        menuItemId: menuItems[2].id,
        name: 'Pepperoni',
        priceModifier: 3.0,
        variationType: 'topping',
        isRequired: false,
        displayOrder: 2,
      },
    }),
  ]);

  console.log('✅ Created menu variations:', pizzaSizes.length);

  // Create test tables
  const tables = await Promise.all([
    prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: '1',
        tableName: 'Window Table 1',
        qrCodeToken: Buffer.from(
          JSON.stringify({
            tableId: 'table-1',
            restaurant: restaurant.slug,
            timestamp: Date.now(),
          })
        ).toString('base64url'),
        capacity: 2,
        status: 'available',
        locationDescription: 'By the front window',
      },
    }),
    prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: '2',
        tableName: 'Center Table 2',
        qrCodeToken: Buffer.from(
          JSON.stringify({
            tableId: 'table-2',
            restaurant: restaurant.slug,
            timestamp: Date.now(),
          })
        ).toString('base64url'),
        capacity: 4,
        status: 'available',
        locationDescription: 'Center of dining room',
      },
    }),
    prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: '3',
        tableName: 'Booth 3',
        qrCodeToken: Buffer.from(
          JSON.stringify({
            tableId: 'table-3',
            restaurant: restaurant.slug,
            timestamp: Date.now(),
          })
        ).toString('base64url'),
        capacity: 6,
        status: 'available',
        locationDescription: 'Cozy corner booth',
      },
    }),
    prisma.table.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: '4',
        tableName: 'Patio Table 4',
        qrCodeToken: Buffer.from(
          JSON.stringify({
            tableId: 'table-4',
            restaurant: restaurant.slug,
            timestamp: Date.now(),
          })
        ).toString('base64url'),
        capacity: 4,
        status: 'available',
        locationDescription: 'Outdoor patio seating',
      },
    }),
  ]);

  console.log('✅ Created tables:', tables.length);

  // Create test staff
  const hashedPassword = await bcrypt.hash('password123', 10);
  const staff = await Promise.all([
    prisma.staff.create({
      data: {
        restaurantId: restaurant.id,
        roleId: managerRole.id,
        email: 'manager@marios-local.com',
        username: 'manager',
        passwordHash: hashedPassword,
        firstName: 'Mario',
        lastName: 'Rossi',
        phone: '+1-555-001-0001',
        isActive: true,
      },
    }),
    prisma.staff.create({
      data: {
        restaurantId: restaurant.id,
        roleId: serverRole.id,
        email: 'server@marios-local.com',
        username: 'server1',
        passwordHash: hashedPassword,
        firstName: 'Luigi',
        lastName: 'Verde',
        phone: '+1-555-001-0002',
        isActive: true,
      },
    }),
    prisma.staff.create({
      data: {
        restaurantId: restaurant.id,
        roleId: kitchenRole.id,
        email: 'kitchen@marios-local.com',
        username: 'kitchen1',
        passwordHash: hashedPassword,
        firstName: 'Giuseppe',
        lastName: 'Bianchi',
        phone: '+1-555-001-0003',
        isActive: true,
      },
    }),
  ]);

  console.log('✅ Created staff:', staff.length);

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📋 Test Data Summary:');
  console.log(`Restaurant: ${restaurant.name} (${restaurant.slug})`);
  console.log(`Menu Categories: ${categories.length}`);
  console.log(`Menu Items: ${menuItems.length}`);
  console.log(`Tables: ${tables.length}`);
  console.log(`Staff Members: ${staff.length}`);

  console.log('\n🔑 Test Credentials:');
  console.log('Manager: manager@marios-local.com / password123');
  console.log('Server: server@marios-local.com / password123');
  console.log('Kitchen: kitchen@marios-local.com / password123');

  console.log('\n📱 Test QR Codes:');
  tables.forEach((table) => {
    console.log(
      `Table ${table.tableNumber}: http://localhost:3000/qr/${table.qrCodeToken}`
    );
  });

  console.log('\n🔧 Development URLs:');
  console.log('App: http://localhost:3000');
  console.log('Prisma Studio: http://localhost:5555 (run: npm run db:studio)');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
