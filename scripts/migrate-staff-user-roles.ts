/**
 * Migration Script: Create UserRole records for existing staff members
 *
 * This script fixes the issue where staff members created before the RBAC fix
 * don't have corresponding UserRole records, preventing them from logging in.
 *
 * Run this script once after deploying the staff creation fix.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Map StaffRole name to valid RBAC roleTemplate
const mapRoleNameToTemplate = (roleName: string): string => {
  const mapping: Record<string, string> = {
    Manager: 'manager',
    'Assistant Manager': 'manager', // Map to manager since assistant_manager is not a valid template
    Waiter: 'waiter',
    Kitchen: 'kitchen_staff', // Map to kitchen_staff (not just 'kitchen')
    'Kitchen Staff': 'kitchen_staff',
    Cashier: 'cashier',
  };

  return mapping[roleName] || roleName.toLowerCase().replace(/\s+/g, '_');
};

async function migrateExistingStaff() {
  console.log(
    '🔄 Starting migration: Creating UserRole records for existing staff...\n'
  );

  try {
    // Find all active staff members
    const allStaff = await prisma.staff.findMany({
      where: {
        isActive: true,
      },
      include: {
        role: true,
      },
    });

    console.log(`📊 Found ${allStaff.length} active staff members\n`);

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const staff of allStaff) {
      try {
        // Check if UserRole already exists
        const existingUserRole = await prisma.userRole.findFirst({
          where: { userId: staff.id },
        });

        if (existingUserRole) {
          console.log(
            `⏭️  Skipped: ${staff.firstName} ${staff.lastName} (${staff.email}) - UserRole already exists`
          );
          skipped++;
          continue;
        }

        // Convert role name to roleTemplate format using proper mapping
        const roleTemplate = mapRoleNameToTemplate(staff.role.name);

        // Create UserRole record
        await prisma.userRole.create({
          data: {
            userId: staff.id,
            userType: 'staff',
            roleTemplate: roleTemplate,
            restaurantId: staff.restaurantId,
            customPermissions: [],
            isActive: staff.isActive,
          },
        });

        console.log(
          `✅ Created: ${staff.firstName} ${staff.lastName} (${staff.email}) - Role: ${roleTemplate}`
        );
        created++;
      } catch (error) {
        console.error(
          `❌ Error for ${staff.firstName} ${staff.lastName} (${staff.email}):`,
          error
        );
        errors++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Created: ${created}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log(`   📊 Total: ${allStaff.length}\n`);

    if (errors === 0) {
      console.log('✅ Migration completed successfully!');
    } else {
      console.log(
        '⚠️  Migration completed with errors. Please review the error messages above.'
      );
    }
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateExistingStaff()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
