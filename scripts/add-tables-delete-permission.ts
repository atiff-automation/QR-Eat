/**
 * Add tables:delete permission to system
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addTablesDeletePermission() {
  console.log('🔧 Adding tables:delete permission to system...\n');

  try {
    // Step 1: Create the permission in permissions table
    console.log('1️⃣ Creating permission in permissions table...');
    const permission = await prisma.permission.upsert({
      where: { permissionKey: 'tables:delete' },
      update: {},
      create: {
        permissionKey: 'tables:delete',
        description: 'Delete tables',
        category: 'tables',
        isActive: true,
      },
    });
    console.log('✅ Permission created:', permission.permissionKey);

    // Step 2: Add to restaurant_owner role
    console.log('\n2️⃣ Adding permission to restaurant_owner role...');
    const rolePermission = await prisma.rolePermission.upsert({
      where: {
        roleTemplate_permissionKey: {
          roleTemplate: 'restaurant_owner',
          permissionKey: 'tables:delete',
        },
      },
      update: {},
      create: {
        roleTemplate: 'restaurant_owner',
        permissionKey: 'tables:delete',
      },
    });
    console.log(
      '✅ Added to restaurant_owner role:',
      rolePermission.roleTemplate
    );

    console.log('\n🎉 Done! Now logout and login to get the permission.');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

addTablesDeletePermission();
