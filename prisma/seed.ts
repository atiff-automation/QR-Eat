import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting multi-tenant SaaS database seeding...');

  // ==============================================
  // 1. CREATE PLATFORM ADMIN
  // ==============================================
  const hashedPassword = await bcrypt.hash('admin123', 12);

  const platformAdmin = await prisma.platformAdmin.upsert({
    where: { email: 'admin@qrorder.com' },
    update: {},
    create: {
      email: 'admin@qrorder.com',
      passwordHash: hashedPassword,
      firstName: 'Platform',
      lastName: 'Administrator',
      role: 'super_admin',
      isActive: true,
    },
  });

  console.log('✅ Created platform admin:', platformAdmin.email);

  // ==============================================
  // 2. CREATE SUBSCRIPTION PLANS
  // ==============================================
  const subscriptionPlans = await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { name: 'Basic' },
      update: {},
      create: {
        name: 'Basic',
        monthlyFee: 99.0,
        transactionFeeRate: 0.029, // 2.9%
        maxTables: 10,
        maxStaff: 5,
        features: {
          analytics: 'basic',
          customBranding: false,
          multiLocation: false,
          apiAccess: false,
          prioritySupport: false,
        },
        sortOrder: 1,
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: 'Pro' },
      update: {},
      create: {
        name: 'Pro',
        monthlyFee: 199.0,
        transactionFeeRate: 0.025, // 2.5%
        maxTables: 25,
        maxStaff: 15,
        features: {
          analytics: 'advanced',
          customBranding: true,
          multiLocation: true,
          apiAccess: false,
          prioritySupport: true,
        },
        sortOrder: 2,
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: 'Enterprise' },
      update: {},
      create: {
        name: 'Enterprise',
        monthlyFee: 399.0,
        transactionFeeRate: 0.02, // 2.0%
        maxTables: null, // unlimited
        maxStaff: null, // unlimited
        features: {
          analytics: 'premium',
          customBranding: true,
          multiLocation: true,
          apiAccess: true,
          prioritySupport: true,
          dedicatedManager: true,
        },
        sortOrder: 3,
      },
    }),
  ]);

  console.log(
    '✅ Created subscription plans:',
    subscriptionPlans.map((p) => p.name)
  );

  // ==============================================
  // 3. CREATE STAFF ROLES (SYSTEM ROLES)
  // ==============================================
  const staffRoles = await Promise.all([
    prisma.staffRole.upsert({
      where: { name: 'Manager' },
      update: {},
      create: {
        name: 'Manager',
        description: 'Restaurant manager with full operational access',
        isSystemRole: true,
        level: 9,
        permissions: {
          menu: ['read', 'write', 'delete'],
          orders: ['read', 'write', 'delete'],
          staff: ['read', 'write', 'delete'],
          reports: ['read', 'write'],
          settings: ['read', 'write'],
          tables: ['read', 'write', 'delete'],
          kitchen: ['read', 'write'],
          analytics: ['read'],
        },
      },
    }),
    prisma.staffRole.upsert({
      where: { name: 'Assistant Manager' },
      update: {},
      create: {
        name: 'Assistant Manager',
        description: 'Assistant manager with limited management access',
        isSystemRole: true,
        level: 7,
        permissions: {
          menu: ['read', 'write'],
          orders: ['read', 'write', 'delete'],
          staff: ['read'],
          reports: ['read'],
          settings: ['read'],
          tables: ['read', 'write'],
          kitchen: ['read', 'write'],
        },
      },
    }),
    prisma.staffRole.upsert({
      where: { name: 'Waiter' },
      update: {},
      create: {
        name: 'Waiter',
        description: 'Server with order and table management access',
        isSystemRole: true,
        level: 5,
        permissions: {
          menu: ['read'],
          orders: ['read', 'write'],
          tables: ['read', 'write'],
          reports: ['read'],
        },
      },
    }),
    prisma.staffRole.upsert({
      where: { name: 'Kitchen' },
      update: {},
      create: {
        name: 'Kitchen',
        description: 'Kitchen staff with order preparation access',
        isSystemRole: true,
        level: 4,
        permissions: {
          orders: ['read', 'write'],
          kitchen: ['read', 'write'],
          menu: ['read'],
        },
      },
    }),
    prisma.staffRole.upsert({
      where: { name: 'Cashier' },
      update: {},
      create: {
        name: 'Cashier',
        description: 'Cashier with payment processing access',
        isSystemRole: true,
        level: 3,
        permissions: {
          orders: ['read', 'write'],
          payments: ['read', 'write'],
          menu: ['read'],
        },
      },
    }),
  ]);

  console.log(
    '✅ Created staff roles:',
    staffRoles.map((r) => r.name)
  );

  // ==============================================
  // 4. CREATE RESTAURANT OWNERS
  // ==============================================
  const ownerPassword = await bcrypt.hash('owner123', 12);

  const restaurantOwners = await Promise.all([
    // Owner 1: Single Location Owner
    prisma.restaurantOwner.upsert({
      where: { email: 'mario@rossigroup.com' },
      update: {},
      create: {
        email: 'mario@rossigroup.com',
        passwordHash: ownerPassword,
        firstName: 'Mario',
        lastName: 'Rossi',
        phone: '+1-555-100-0001',
        companyName: 'Rossi Restaurant Group',
        isActive: true,
        emailVerified: true,
        mustChangePassword: true,
      },
    }),
    // Owner 2: Chain Owner
    prisma.restaurantOwner.upsert({
      where: { email: 'john@tastychainfood.com' },
      update: {},
      create: {
        email: 'john@tastychainfood.com',
        passwordHash: ownerPassword,
        firstName: 'John',
        lastName: 'Smith',
        phone: '+1-555-200-0001',
        companyName: 'Tasty Chain Food Corp',
        isActive: true,
        emailVerified: true,
        mustChangePassword: true,
      },
    }),
  ]);

  console.log(
    '✅ Created restaurant owners:',
    restaurantOwners.map((o) => o.email)
  );

  // ==============================================
  // 5. CREATE RESTAURANTS
  // ==============================================
  const restaurants = await Promise.all([
    // Mario's Restaurant (Basic Plan)
    prisma.restaurant.upsert({
      where: { slug: 'marios-authentic-italian' },
      update: {},
      create: {
        ownerId: restaurantOwners[0].id,
        name: "Mario's Authentic Italian",
        slug: 'marios-authentic-italian',
        address: '123 Little Italy Street, New York, NY 10013',
        phone: '+1-555-123-4567',
        email: 'info@marios-authentic.com',
        timezone: 'America/New_York',
        currency: 'USD',
        taxRate: 0.0875, // NYC tax rate
        serviceChargeRate: 0.18, // 18% service charge
        businessType: 'restaurant',
        brandingConfig: {
          colors: {
            primary: '#c41e3a',
            secondary: '#228b22',
            background: '#ffffff',
            text: '#333333',
          },
          logo: null,
          theme: 'classic',
        },
      },
    }),
    // Tasty Burger (Pro Plan - Location 1)
    prisma.restaurant.upsert({
      where: { slug: 'tasty-burger-downtown' },
      update: {},
      create: {
        ownerId: restaurantOwners[1].id,
        name: 'Tasty Burger Downtown',
        slug: 'tasty-burger-downtown',
        address: '456 Main Street, Los Angeles, CA 90210',
        phone: '+1-555-456-7890',
        email: 'downtown@tastyburger.com',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        taxRate: 0.0925, // CA tax rate
        serviceChargeRate: 0.15, // 15% service charge
        businessType: 'restaurant',
        brandingConfig: {
          colors: {
            primary: '#ff6b35',
            secondary: '#004d40',
            background: '#fafafa',
            text: '#212121',
          },
          logo: null,
          theme: 'modern',
        },
      },
    }),
    // Tasty Burger (Pro Plan - Location 2)
    prisma.restaurant.upsert({
      where: { slug: 'tasty-burger-westside' },
      update: {},
      create: {
        ownerId: restaurantOwners[1].id,
        name: 'Tasty Burger Westside',
        slug: 'tasty-burger-westside',
        address: '789 Sunset Blvd, Los Angeles, CA 90028',
        phone: '+1-555-789-0123',
        email: 'westside@tastyburger.com',
        timezone: 'America/Los_Angeles',
        currency: 'USD',
        taxRate: 0.0925,
        serviceChargeRate: 0.15,
        businessType: 'restaurant',
        brandingConfig: {
          colors: {
            primary: '#ff6b35',
            secondary: '#004d40',
            background: '#fafafa',
            text: '#212121',
          },
          logo: null,
          theme: 'modern',
        },
      },
    }),
  ]);

  console.log(
    '✅ Created restaurants:',
    restaurants.map((r) => r.name)
  );

  // ==============================================
  // 6. CREATE SUBSCRIPTIONS
  // ==============================================
  const now = new Date();
  const nextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate()
  );

  const subscriptions = [];

  try {
    subscriptions.push(
      // Mario's Basic subscription
      await prisma.subscription.create({
        data: {
          restaurantId: restaurants[0].id,
          planId: subscriptionPlans[0].id, // Basic
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextMonth,
          stripeCustomerId: 'cus_mock_mario',
          stripeSubscriptionId: 'sub_mock_mario',
        },
      }),
      // Tasty Burger Downtown Pro subscription
      await prisma.subscription.create({
        data: {
          restaurantId: restaurants[1].id,
          planId: subscriptionPlans[1].id, // Pro
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextMonth,
          stripeCustomerId: 'cus_mock_tasty',
          stripeSubscriptionId: 'sub_mock_tasty_1',
        },
      }),
      // Tasty Burger Westside Pro subscription
      await prisma.subscription.create({
        data: {
          restaurantId: restaurants[2].id,
          planId: subscriptionPlans[1].id, // Pro
          status: 'active',
          currentPeriodStart: now,
          currentPeriodEnd: nextMonth,
          stripeCustomerId: 'cus_mock_tasty',
          stripeSubscriptionId: 'sub_mock_tasty_2',
        },
      })
    );
  } catch {
    console.log('⚠️  Subscriptions may already exist, skipping...');
  }

  console.log('✅ Created subscriptions:', subscriptions.length);

  // ==============================================
  // 7. CREATE ROLE HIERARCHIES FOR EACH RESTAURANT
  // ==============================================
  const managerRole = staffRoles.find((r) => r.name === 'Manager')!;
  const waiterRole = staffRoles.find((r) => r.name === 'Waiter')!;
  const kitchenRole = staffRoles.find((r) => r.name === 'Kitchen')!;

  for (const restaurant of restaurants) {
    try {
      await Promise.all([
        // Manager (top level)
        prisma.staffRoleHierarchy.upsert({
          where: {
            restaurantId_roleId: {
              restaurantId: restaurant.id,
              roleId: managerRole.id,
            },
          },
          update: {},
          create: {
            restaurantId: restaurant.id,
            roleId: managerRole.id,
            parentId: null,
            maxCount: 1,
          },
        }),
        // Waiter (reports to manager)
        prisma.staffRoleHierarchy.upsert({
          where: {
            restaurantId_roleId: {
              restaurantId: restaurant.id,
              roleId: waiterRole.id,
            },
          },
          update: {},
          create: {
            restaurantId: restaurant.id,
            roleId: waiterRole.id,
            parentId: null, // Will be updated later
            maxCount: 5,
          },
        }),
        // Kitchen (reports to manager)
        prisma.staffRoleHierarchy.upsert({
          where: {
            restaurantId_roleId: {
              restaurantId: restaurant.id,
              roleId: kitchenRole.id,
            },
          },
          update: {},
          create: {
            restaurantId: restaurant.id,
            roleId: kitchenRole.id,
            parentId: null, // Will be updated later
            maxCount: 3,
          },
        }),
      ]);
    } catch {
      console.log(
        `⚠️  Role hierarchies for ${restaurant.name} may already exist, skipping...`
      );
    }
  }

  console.log('✅ Created role hierarchies for all restaurants');

  // ==============================================
  // 8. CREATE SAMPLE DATA FOR MARIO'S RESTAURANT
  // ==============================================
  const marioRestaurant = restaurants[0];

  // Create menu categories
  const categories = await Promise.all([
    prisma.menuCategory.create({
      data: {
        restaurantId: marioRestaurant.id,
        name: 'Appetizers',
        description: 'Traditional Italian starters',
        displayOrder: 1,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: marioRestaurant.id,
        name: 'Pasta',
        description: 'Fresh handmade pasta dishes',
        displayOrder: 2,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: marioRestaurant.id,
        name: 'Pizza',
        description: 'Wood-fired authentic Italian pizza',
        displayOrder: 3,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: marioRestaurant.id,
        name: 'Desserts',
        description: 'Traditional Italian desserts',
        displayOrder: 4,
      },
    }),
    prisma.menuCategory.create({
      data: {
        restaurantId: marioRestaurant.id,
        name: 'Beverages',
        description: 'Italian wines and beverages',
        displayOrder: 5,
      },
    }),
  ]);

  console.log("✅ Created menu categories for Mario's:", categories.length);

  // Create menu items
  const menuItems = await Promise.all([
    // Appetizers
    prisma.menuItem.create({
      data: {
        restaurantId: marioRestaurant.id,
        categoryId: categories[0].id,
        name: 'Bruschetta alla Nonna',
        description:
          'Traditional toasted bread with fresh tomatoes, garlic, and basil',
        price: 12.99,
        preparationTime: 8,
        calories: 180,
        allergens: ['gluten'],
        dietaryInfo: ['vegetarian'],
        isAvailable: true,
        isFeatured: true,
        displayOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: marioRestaurant.id,
        categoryId: categories[0].id,
        name: 'Antipasto Misto',
        description:
          'Mixed Italian cured meats, cheeses, and marinated vegetables',
        price: 18.99,
        preparationTime: 5,
        calories: 320,
        allergens: ['dairy'],
        dietaryInfo: [],
        isAvailable: true,
        displayOrder: 2,
      },
    }),
    // Pasta
    prisma.menuItem.create({
      data: {
        restaurantId: marioRestaurant.id,
        categoryId: categories[1].id,
        name: 'Spaghetti Carbonara',
        description:
          'Classic Roman pasta with eggs, pancetta, and pecorino romano',
        price: 22.99,
        preparationTime: 15,
        calories: 680,
        allergens: ['gluten', 'dairy', 'eggs'],
        dietaryInfo: [],
        isAvailable: true,
        isFeatured: true,
        displayOrder: 1,
      },
    }),
    prisma.menuItem.create({
      data: {
        restaurantId: marioRestaurant.id,
        categoryId: categories[1].id,
        name: 'Penne Arrabbiata',
        description:
          'Spicy tomato sauce with garlic, red chilies, and fresh basil',
        price: 19.99,
        preparationTime: 12,
        calories: 520,
        allergens: ['gluten'],
        dietaryInfo: ['vegetarian', 'vegan'],
        isAvailable: true,
        displayOrder: 2,
      },
    }),
    // Pizza
    prisma.menuItem.create({
      data: {
        restaurantId: marioRestaurant.id,
        categoryId: categories[2].id,
        name: 'Pizza Margherita',
        description:
          'San Marzano tomatoes, fresh mozzarella di bufala, and basil',
        price: 24.99,
        preparationTime: 12,
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
        restaurantId: marioRestaurant.id,
        categoryId: categories[2].id,
        name: 'Pizza Diavola',
        description: 'Spicy salami, mozzarella, tomato sauce, and hot peppers',
        price: 27.99,
        preparationTime: 12,
        calories: 720,
        allergens: ['gluten', 'dairy'],
        dietaryInfo: [],
        isAvailable: true,
        displayOrder: 2,
      },
    }),
    // Desserts
    prisma.menuItem.create({
      data: {
        restaurantId: marioRestaurant.id,
        categoryId: categories[3].id,
        name: 'Tiramisu della Casa',
        description:
          'Traditional tiramisu with espresso-soaked ladyfingers and mascarpone',
        price: 9.99,
        preparationTime: 3,
        calories: 420,
        allergens: ['dairy', 'eggs', 'gluten'],
        dietaryInfo: [],
        isAvailable: true,
        displayOrder: 1,
      },
    }),
    // Beverages
    prisma.menuItem.create({
      data: {
        restaurantId: marioRestaurant.id,
        categoryId: categories[4].id,
        name: 'Chianti Classico',
        description: 'Traditional Tuscan red wine, bottle',
        price: 45.0,
        preparationTime: 2,
        calories: 125,
        allergens: ['sulfites'],
        dietaryInfo: ['vegan'],
        isAvailable: true,
        displayOrder: 1,
      },
    }),
  ]);

  console.log("✅ Created menu items for Mario's:", menuItems.length);

  // Create tables for Mario's
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tables: any[] = [];
  try {
    const existingTables = await prisma.table.findMany({
      where: { restaurantId: marioRestaurant.id },
    });

    if (existingTables.length === 0) {
      tables = await Promise.all([
        prisma.table.create({
          data: {
            restaurantId: marioRestaurant.id,
            tableNumber: '1',
            tableName: 'Window Table',
            qrCodeToken: Buffer.from(
              JSON.stringify({
                tableId: 'mario-table-1',
                restaurant: marioRestaurant.slug,
                timestamp: Date.now(),
              })
            ).toString('base64url'),
            capacity: 2,
            status: 'AVAILABLE',
            locationDescription: 'By the front window',
          },
        }),
        prisma.table.create({
          data: {
            restaurantId: marioRestaurant.id,
            tableNumber: '2',
            tableName: 'Center Table',
            qrCodeToken: Buffer.from(
              JSON.stringify({
                tableId: 'mario-table-2',
                restaurant: marioRestaurant.slug,
                timestamp: Date.now(),
              })
            ).toString('base64url'),
            capacity: 4,
            status: 'AVAILABLE',
            locationDescription: 'Center dining area',
          },
        }),
        prisma.table.create({
          data: {
            restaurantId: marioRestaurant.id,
            tableNumber: '3',
            tableName: 'Romantic Booth',
            qrCodeToken: Buffer.from(
              JSON.stringify({
                tableId: 'mario-table-3',
                restaurant: marioRestaurant.slug,
                timestamp: Date.now(),
              })
            ).toString('base64url'),
            capacity: 2,
            status: 'AVAILABLE',
            locationDescription: 'Intimate corner booth',
          },
        }),
      ]);
    } else {
      tables = existingTables;
      console.log("⚠️  Tables for Mario's already exist, skipping...");
    }
  } catch (error) {
    console.log('⚠️  Error creating tables, they may already exist:', error);
  }

  console.log("✅ Created tables for Mario's:", tables.length);

  // Create staff for Mario's
  const staffPassword = await bcrypt.hash('staff123', 12);
  const staff = await Promise.all([
    // Manager
    prisma.staff.create({
      data: {
        restaurantId: marioRestaurant.id,
        roleId: managerRole.id,
        email: 'mario@marios-authentic.com',
        username: 'mario_manager',
        passwordHash: staffPassword,
        firstName: 'Mario',
        lastName: 'Rossi',
        phone: '+1-555-123-0001',
        employeeId: 'EMP001',
        hireDate: new Date('2024-01-15'),
        hourlyRate: 25.0,
        isActive: true,
        emailVerified: true,
        mustChangePassword: true,
      },
    }),
    // Waiter
    prisma.staff.create({
      data: {
        restaurantId: marioRestaurant.id,
        roleId: waiterRole.id,
        email: 'luigi@marios-authentic.com',
        username: 'luigi_waiter',
        passwordHash: staffPassword,
        firstName: 'Luigi',
        lastName: 'Verde',
        phone: '+1-555-123-0002',
        employeeId: 'EMP002',
        hireDate: new Date('2024-02-01'),
        hourlyRate: 18.0,
        isActive: true,
        emailVerified: true,
        mustChangePassword: true,
      },
    }),
    // Kitchen
    prisma.staff.create({
      data: {
        restaurantId: marioRestaurant.id,
        roleId: kitchenRole.id,
        email: 'giuseppe@marios-authentic.com',
        username: 'giuseppe_kitchen',
        passwordHash: staffPassword,
        firstName: 'Giuseppe',
        lastName: 'Bianchi',
        phone: '+1-555-123-0003',
        employeeId: 'EMP003',
        hireDate: new Date('2024-01-20'),
        hourlyRate: 20.0,
        isActive: true,
        emailVerified: true,
        mustChangePassword: true,
      },
    }),
  ]);

  console.log("✅ Created staff for Mario's:", staff.length);

  // ==============================================
  // 9. RBAC PERMISSIONS AND ROLE TEMPLATES
  // ==============================================

  // Create RBAC permissions
  const rbacPermissions = [
    // Platform Management (Super Admin only)
    {
      key: 'platform:read',
      description: 'View platform information',
      category: 'platform',
    },
    {
      key: 'platform:write',
      description: 'Edit platform settings',
      category: 'platform',
    },
    {
      key: 'platform:delete',
      description: 'Delete platform data',
      category: 'platform',
    },

    // Restaurant Management
    {
      key: 'restaurant:read',
      description: 'View restaurant information',
      category: 'restaurant',
    },
    {
      key: 'restaurant:write',
      description: 'Edit restaurant settings',
      category: 'restaurant',
    },
    {
      key: 'restaurant:settings',
      description: 'Access restaurant settings',
      category: 'restaurant',
    },
    {
      key: 'restaurants:create',
      description: 'Create new restaurants',
      category: 'restaurant',
    },
    {
      key: 'restaurants:read',
      description: 'View all restaurants',
      category: 'restaurant',
    },
    {
      key: 'restaurants:write',
      description: 'Edit any restaurant',
      category: 'restaurant',
    },
    {
      key: 'restaurants:delete',
      description: 'Delete restaurants',
      category: 'restaurant',
    },

    // Order Management
    { key: 'orders:read', description: 'View orders', category: 'orders' },
    {
      key: 'orders:write',
      description: 'Create and edit orders',
      category: 'orders',
    },
    {
      key: 'orders:kitchen',
      description: 'Kitchen display access',
      category: 'orders',
    },
    {
      key: 'orders:update',
      description: 'Update order progress/status',
      category: 'orders',
    },
    {
      key: 'orders:fulfill',
      description: 'Mark orders as ready/served',
      category: 'orders',
    },

    // Table Management
    { key: 'tables:read', description: 'View tables', category: 'tables' },
    { key: 'tables:write', description: 'Manage tables', category: 'tables' },
    { key: 'tables:qr', description: 'Generate QR codes', category: 'tables' },

    // Staff Management
    {
      key: 'staff:read',
      description: 'View staff information',
      category: 'staff',
    },
    {
      key: 'staff:write',
      description: 'Edit staff information',
      category: 'staff',
    },
    {
      key: 'staff:invite',
      description: 'Invite new staff members',
      category: 'staff',
    },
    {
      key: 'staff:delete',
      description: 'Delete staff members',
      category: 'staff',
    },
    {
      key: 'staff:roles',
      description: 'Manage staff roles',
      category: 'staff',
    },

    // Analytics & Reporting
    {
      key: 'analytics:read',
      description: 'View analytics and reports',
      category: 'analytics',
    },
    {
      key: 'analytics:export',
      description: 'Export data',
      category: 'analytics',
    },
    {
      key: 'analytics:platform',
      description: 'View platform-wide analytics',
      category: 'analytics',
    },

    // Menu Management
    { key: 'menu:read', description: 'View menu items', category: 'menu' },
    { key: 'menu:write', description: 'Manage menu items', category: 'menu' },
    { key: 'menu:delete', description: 'Delete menu items', category: 'menu' },

    // Settings
    {
      key: 'settings:read',
      description: 'View settings',
      category: 'settings',
    },
    {
      key: 'settings:write',
      description: 'Edit settings',
      category: 'settings',
    },
    {
      key: 'settings:platform',
      description: 'Edit platform settings',
      category: 'settings',
    },

    // Billing & Subscriptions
    {
      key: 'billing:read',
      description: 'View billing information',
      category: 'billing',
    },
    {
      key: 'billing:write',
      description: 'Manage billing',
      category: 'billing',
    },
    {
      key: 'subscriptions:read',
      description: 'View subscriptions',
      category: 'subscriptions',
    },
    {
      key: 'subscriptions:write',
      description: 'Manage subscriptions',
      category: 'subscriptions',
    },

    // User Management (Super Admin)
    { key: 'users:read', description: 'View all users', category: 'users' },
    { key: 'users:write', description: 'Manage users', category: 'users' },
    { key: 'users:delete', description: 'Delete users', category: 'users' },

    // Payment Management (for POS system)
    {
      key: 'payments:read',
      description: 'View payment information',
      category: 'payments',
    },
    {
      key: 'payments:write',
      description: 'Process payments',
      category: 'payments',
    },
  ];

  const permissions = await Promise.all(
    rbacPermissions.map((perm) =>
      prisma.permission.upsert({
        where: { permissionKey: perm.key },
        update: {},
        create: {
          permissionKey: perm.key,
          description: perm.description,
          category: perm.category,
          isActive: true,
        },
      })
    )
  );

  console.log('✅ Created RBAC permissions:', permissions.length);

  // Create role templates with permissions
  const roleTemplates = [
    {
      template: 'platform_admin',
      permissions: [
        'platform:read',
        'platform:write',
        'platform:delete',
        'restaurants:create',
        'restaurants:read',
        'restaurants:write',
        'restaurants:delete',
        'subscriptions:read',
        'subscriptions:write',
        'billing:read',
        'billing:write',
        'analytics:platform',
        'analytics:export',
        'users:read',
        'users:write',
        'users:delete',
        'settings:platform',
      ],
    },
    {
      template: 'restaurant_owner',
      permissions: [
        'restaurant:read',
        'restaurant:write',
        'restaurant:settings',
        'orders:read',
        'orders:write',
        'orders:fulfill',
        'tables:read',
        'tables:write',
        'tables:qr',
        'staff:read',
        'staff:write',
        'staff:invite',
        'staff:delete',
        'staff:roles',
        'analytics:read',
        'analytics:export',
        'menu:read',
        'menu:write',
        'menu:delete',
        'settings:read',
        'settings:write',
        'billing:read',
        'payments:read',
        'payments:write',
      ],
    },
    {
      template: 'manager',
      permissions: [
        'restaurant:read',
        'orders:read',
        'orders:write',
        'orders:fulfill',
        'tables:read',
        'tables:write',
        'tables:qr',
        'staff:read', // Can only VIEW staff, not manage
        'analytics:read',
        'menu:read',
        'menu:write',
        'settings:read',
        'payments:read',
        'payments:write',
      ],
    },
    {
      template: 'waiter',
      permissions: [
        'orders:read',
        'orders:write', // Can create and modify PENDING orders
        'tables:read',
        'menu:read',
      ],
    },
    {
      template: 'kitchen_staff',
      permissions: [
        'orders:read',
        'orders:kitchen',
        'orders:update', // Can view and update order progress
      ],
    },
    {
      template: 'cashier',
      permissions: [
        'orders:read',
        'orders:write',
        'payments:read',
        'payments:write',
        'tables:read', // Need to see which table customer is from
        'menu:read', // Need to see item details for payment verification
      ],
    },
  ];

  const rolePermissions = await Promise.all(
    roleTemplates.flatMap((roleTemplate) =>
      roleTemplate.permissions.map((permissionKey) =>
        prisma.rolePermission.upsert({
          where: {
            roleTemplate_permissionKey: {
              roleTemplate: roleTemplate.template,
              permissionKey: permissionKey,
            },
          },
          update: {},
          create: {
            roleTemplate: roleTemplate.template,
            permissionKey: permissionKey,
          },
        })
      )
    )
  );

  console.log('✅ Created role-permission mappings:', rolePermissions.length);

  // Create initial user roles for existing users
  const platformAdminRole = await prisma.userRole.create({
    data: {
      userId: platformAdmin.id,
      userType: 'platform_admin',
      restaurantId: null,
      roleTemplate: 'platform_admin',
      customPermissions: [],
      isActive: true,
    },
  });

  const ownerRoles = await Promise.all([
    prisma.userRole.create({
      data: {
        userId: restaurantOwners[0].id,
        userType: 'restaurant_owner',
        restaurantId: restaurants[0].id,
        roleTemplate: 'restaurant_owner',
        customPermissions: [],
        isActive: true,
      },
    }),
    prisma.userRole.create({
      data: {
        userId: restaurantOwners[1].id,
        userType: 'restaurant_owner',
        restaurantId: restaurants[1].id,
        roleTemplate: 'restaurant_owner',
        customPermissions: [],
        isActive: true,
      },
    }),
    prisma.userRole.create({
      data: {
        userId: restaurantOwners[1].id,
        userType: 'restaurant_owner',
        restaurantId: restaurants[2].id,
        roleTemplate: 'restaurant_owner',
        customPermissions: [],
        isActive: true,
      },
    }),
  ]);

  const staffUserRoles = await Promise.all([
    // Manager
    prisma.userRole.create({
      data: {
        userId: staff[0].id,
        userType: 'staff',
        restaurantId: staff[0].restaurantId,
        roleTemplate: 'manager',
        customPermissions: [],
        isActive: true,
      },
    }),
    // Waiter
    prisma.userRole.create({
      data: {
        userId: staff[1].id,
        userType: 'staff',
        restaurantId: staff[1].restaurantId,
        roleTemplate: 'waiter',
        customPermissions: [],
        isActive: true,
      },
    }),
    // Kitchen staff
    prisma.userRole.create({
      data: {
        userId: staff[2].id,
        userType: 'staff',
        restaurantId: staff[2].restaurantId,
        roleTemplate: 'kitchen_staff',
        customPermissions: [],
        isActive: true,
      },
    }),
  ]);

  console.log(
    '✅ Created initial user roles:',
    [platformAdminRole, ...ownerRoles, ...staffUserRoles].length
  );

  // ==============================================
  // 10. SUMMARY AND TEST CREDENTIALS
  // ==============================================
  console.log(
    '\n🎉 Multi-tenant SaaS database seeding completed successfully!'
  );
  console.log('\n📊 Summary:');
  console.log(`Platform Admins: 1`);
  console.log(`Subscription Plans: ${subscriptionPlans.length}`);
  console.log(`Restaurant Owners: ${restaurantOwners.length}`);
  console.log(`Restaurants: ${restaurants.length}`);
  console.log(`Staff Roles: ${staffRoles.length}`);
  console.log(`Subscriptions: ${subscriptions.length}`);

  console.log('\n🔑 Test Credentials:');
  console.log('\n📱 Platform Admin:');
  console.log('Email: admin@qrorder.com');
  console.log('Password: admin123');

  console.log('\n🏢 Restaurant Owners:');
  console.log('Mario (Single Location): mario@rossigroup.com / owner123');
  console.log('John (Chain Owner): john@tastychainfood.com / owner123');

  console.log("\n👥 Staff (Mario's Restaurant):");
  console.log('Manager: mario@marios-authentic.com / staff123');
  console.log('Waiter: luigi@marios-authentic.com / staff123');
  console.log('Kitchen: giuseppe@marios-authentic.com / staff123');

  console.log('\n🍽️ Restaurant Subdomains:');
  restaurants.forEach((restaurant) => {
    console.log(`${restaurant.name}: http://${restaurant.slug}.localhost:3000`);
  });

  console.log("\n📱 Mario's QR Codes:");
  tables.forEach((table) => {
    console.log(
      `Table ${table.tableNumber}: http://${marioRestaurant.slug}.localhost:3000/table/${table.qrCodeToken}`
    );
  });

  console.log('\n🛠️ Admin URLs:');
  console.log('Platform Admin: http://admin.localhost:3000');
  console.log('Owner Portal: http://owner.localhost:3000');
  console.log('Prisma Studio: http://localhost:5555 (run: npm run db:studio)');

  console.log('\n💡 Next Steps:');
  console.log('1. Set up subdomain routing middleware');
  console.log('2. Implement authentication for each user type');
  console.log('3. Create admin, owner, and staff portals');
  console.log('4. Integrate Stripe for subscription billing');
  console.log('5. Test multi-tenant data isolation');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
