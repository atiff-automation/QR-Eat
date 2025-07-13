/**
 * Cascade Deletion Test
 * Tests proper database cascade deletion behavior for multi-tenant SaaS
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

class CascadeDeletionTester {
  constructor() {
    this.testData = {};
  }

  async log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      error: '\x1b[31m',
      warning: '\x1b[33m',
      reset: '\x1b[0m'
    };
    console.log(`${colors[type]}${message}${colors.reset}`);
  }

  async createTestData() {
    await this.log('Creating test data...', 'info');

    // Create test restaurant owner
    const ownerPassword = await bcrypt.hash('test123', 10);
    const testOwner = await prisma.restaurantOwner.create({
      data: {
        email: 'cascade-test-owner@test.com',
        passwordHash: ownerPassword,
        firstName: 'Test',
        lastName: 'Owner',
        companyName: 'Test Company'
      }
    });
    this.testData.owner = testOwner;

    // Create test restaurant
    const testRestaurant = await prisma.restaurant.create({
      data: {
        ownerId: testOwner.id,
        name: 'Cascade Test Restaurant',
        slug: 'cascade-test-restaurant',
        address: '123 Cascade Test Street',
        phone: '+1234567890',
        email: 'test@cascade.com'
      }
    });
    this.testData.restaurant = testRestaurant;

    // Create test role
    const testRole = await prisma.staffRole.create({
      data: {
        name: 'Cascade Test Role',
        description: 'Role for cascade testing',
        permissions: { test: ['read'] },
        level: 1
      }
    });
    this.testData.role = testRole;

    // Create test staff
    const staffPassword = await bcrypt.hash('staff123', 10);
    const testStaff = await prisma.staff.create({
      data: {
        restaurantId: testRestaurant.id,
        roleId: testRole.id,
        email: 'cascade-test-staff@test.com',
        username: 'cascade_test_staff',
        passwordHash: staffPassword,
        firstName: 'Test',
        lastName: 'Staff'
      }
    });
    this.testData.staff = testStaff;

    // Create test table
    const testTable = await prisma.table.create({
      data: {
        restaurantId: testRestaurant.id,
        tableNumber: 'CT1',
        tableName: 'Cascade Test Table',
        qrCodeToken: 'cascade-test-qr',
        capacity: 4
      }
    });
    this.testData.table = testTable;

    // Create test menu category
    const testCategory = await prisma.menuCategory.create({
      data: {
        restaurantId: testRestaurant.id,
        name: 'Cascade Test Category',
        description: 'Category for cascade testing'
      }
    });
    this.testData.category = testCategory;

    // Create test menu item
    const testMenuItem = await prisma.menuItem.create({
      data: {
        restaurantId: testRestaurant.id,
        categoryId: testCategory.id,
        name: 'Cascade Test Item',
        description: 'Menu item for cascade testing',
        price: 10.99
      }
    });
    this.testData.menuItem = testMenuItem;

    await this.log('Test data created successfully', 'success');
  }

  async testRestaurantDeletion() {
    await this.log('Testing restaurant deletion with related data...', 'info');

    try {
      // First, check what data exists
      const beforeDeletion = {
        restaurant: await prisma.restaurant.findUnique({ where: { id: this.testData.restaurant.id } }),
        staff: await prisma.staff.findMany({ where: { restaurantId: this.testData.restaurant.id } }),
        tables: await prisma.table.findMany({ where: { restaurantId: this.testData.restaurant.id } }),
        categories: await prisma.menuCategory.findMany({ where: { restaurantId: this.testData.restaurant.id } }),
        menuItems: await prisma.menuItem.findMany({ where: { restaurantId: this.testData.restaurant.id } })
      };

      await this.log(`Before deletion - Restaurant: ${beforeDeletion.restaurant ? 'exists' : 'missing'}`, 'info');
      await this.log(`Before deletion - Staff: ${beforeDeletion.staff.length} records`, 'info');
      await this.log(`Before deletion - Tables: ${beforeDeletion.tables.length} records`, 'info');
      await this.log(`Before deletion - Categories: ${beforeDeletion.categories.length} records`, 'info');
      await this.log(`Before deletion - Menu Items: ${beforeDeletion.menuItems.length} records`, 'info');

      // Try to delete the restaurant
      await prisma.restaurant.delete({
        where: { id: this.testData.restaurant.id }
      });

      // Check what data remains
      const afterDeletion = {
        restaurant: await prisma.restaurant.findUnique({ where: { id: this.testData.restaurant.id } }),
        staff: await prisma.staff.findMany({ where: { restaurantId: this.testData.restaurant.id } }),
        tables: await prisma.table.findMany({ where: { restaurantId: this.testData.restaurant.id } }),
        categories: await prisma.menuCategory.findMany({ where: { restaurantId: this.testData.restaurant.id } }),
        menuItems: await prisma.menuItem.findMany({ where: { restaurantId: this.testData.restaurant.id } })
      };

      await this.log(`After deletion - Restaurant: ${afterDeletion.restaurant ? 'exists' : 'deleted'}`, 'info');
      await this.log(`After deletion - Staff: ${afterDeletion.staff.length} records`, 'info');
      await this.log(`After deletion - Tables: ${afterDeletion.tables.length} records`, 'info');
      await this.log(`After deletion - Categories: ${afterDeletion.categories.length} records`, 'info');
      await this.log(`After deletion - Menu Items: ${afterDeletion.menuItems.length} records`, 'info');

      // Verify cascade deletion worked properly
      if (!afterDeletion.restaurant) {
        await this.log('✅ Restaurant successfully deleted', 'success');
      } else {
        await this.log('❌ Restaurant still exists after deletion', 'error');
      }

      if (afterDeletion.staff.length === 0) {
        await this.log('✅ Staff properly cascade deleted', 'success');
      } else {
        await this.log('❌ Staff not cascade deleted', 'error');
      }

      if (afterDeletion.tables.length === 0) {
        await this.log('✅ Tables properly cascade deleted', 'success');
      } else {
        await this.log('❌ Tables not cascade deleted', 'error');
      }

      if (afterDeletion.categories.length === 0) {
        await this.log('✅ Categories properly cascade deleted', 'success');
      } else {
        await this.log('❌ Categories not cascade deleted', 'error');
      }

      if (afterDeletion.menuItems.length === 0) {
        await this.log('✅ Menu items properly cascade deleted', 'success');
      } else {
        await this.log('❌ Menu items not cascade deleted', 'error');
      }

    } catch (error) {
      await this.log(`❌ Restaurant deletion failed: ${error.message}`, 'error');
      await this.log(`Error code: ${error.code}`, 'error');
      
      if (error.code === 'P2003') {
        await this.log('Foreign key constraint violation - cascade deletion not properly configured', 'error');
      }
    }
  }

  async cleanUp() {
    await this.log('Cleaning up test data...', 'info');

    try {
      // Delete in reverse order of dependencies
      await prisma.menuItem.deleteMany({
        where: { restaurantId: this.testData.restaurant?.id }
      });

      await prisma.menuCategory.deleteMany({
        where: { restaurantId: this.testData.restaurant?.id }
      });

      await prisma.table.deleteMany({
        where: { restaurantId: this.testData.restaurant?.id }
      });

      await prisma.staff.deleteMany({
        where: { restaurantId: this.testData.restaurant?.id }
      });

      await prisma.restaurant.deleteMany({
        where: { id: this.testData.restaurant?.id }
      });

      await prisma.restaurantOwner.deleteMany({
        where: { id: this.testData.owner?.id }
      });

      await prisma.staffRole.deleteMany({
        where: { id: this.testData.role?.id }
      });

      await this.log('Cleanup completed', 'success');

    } catch (error) {
      await this.log(`Cleanup error: ${error.message}`, 'error');
    }
  }

  async runTest() {
    try {
      await this.createTestData();
      await this.testRestaurantDeletion();
    } catch (error) {
      await this.log(`Test failed: ${error.message}`, 'error');
    } finally {
      await this.cleanUp();
      await prisma.$disconnect();
    }
  }
}

// Run if executed directly
if (require.main === module) {
  const tester = new CascadeDeletionTester();
  tester.runTest().catch(console.error);
}

module.exports = CascadeDeletionTester;