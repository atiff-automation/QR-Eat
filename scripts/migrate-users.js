/**
 * User Migration Script for RBAC System
 * 
 * This script migrates existing users from the legacy system to the new RBAC system.
 * It creates appropriate user roles based on existing user types and relationships.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Migration configuration
const MIGRATION_CONFIG = {
  // Batch size for processing users
  BATCH_SIZE: 100,
  
  // Default role templates for user types
  DEFAULT_ROLES: {
    platform_admin: 'platform_admin',
    restaurant_owner: 'restaurant_owner', 
    manager: 'manager',
    kitchen_staff: 'kitchen_staff',
    server_staff: 'server_staff'
  },
  
  // Role template priority (higher number = higher privilege)
  ROLE_PRIORITY: {
    platform_admin: 100,
    restaurant_owner: 80,
    manager: 60,
    kitchen_staff: 40,
    server_staff: 30
  }
};

// Logging utilities
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const error = (message) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
};

const success = (message) => {
  console.log(`[${new Date().toISOString()}] SUCCESS: ${message}`);
};

// Migration statistics
const stats = {
  platformAdmins: { total: 0, migrated: 0, failed: 0 },
  restaurantOwners: { total: 0, migrated: 0, failed: 0 },
  staff: { total: 0, migrated: 0, failed: 0 },
  errors: []
};

/**
 * Migrate platform administrators
 */
async function migratePlatformAdmins() {
  log('Migrating platform administrators...');
  
  try {
    // Fetch all platform admins
    const platformAdmins = await prisma.platformAdmin.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true
      }
    });
    
    stats.platformAdmins.total = platformAdmins.length;
    log(`Found ${platformAdmins.length} platform administrators`);
    
    // Process in batches
    for (let i = 0; i < platformAdmins.length; i += MIGRATION_CONFIG.BATCH_SIZE) {
      const batch = platformAdmins.slice(i, i + MIGRATION_CONFIG.BATCH_SIZE);
      
      for (const admin of batch) {
        try {
          // Check if user role already exists
          const existingRole = await prisma.userRole.findFirst({
            where: {
              userId: admin.id,
              userType: 'platform_admin',
              roleTemplate: MIGRATION_CONFIG.DEFAULT_ROLES.platform_admin
            }
          });
          
          if (existingRole) {
            log(`Platform admin ${admin.email} already has RBAC role, skipping`);
            stats.platformAdmins.migrated++;
            continue;
          }
          
          // Create user role
          await prisma.userRole.create({
            data: {
              userId: admin.id,
              userType: 'platform_admin',
              roleTemplate: MIGRATION_CONFIG.DEFAULT_ROLES.platform_admin,
              restaurantId: null, // Platform admins are not restaurant-scoped
              customPermissions: [],
              isActive: admin.isActive,
              createdAt: admin.createdAt || new Date(),
              updatedAt: new Date()
            }
          });
          
          stats.platformAdmins.migrated++;
          log(`Migrated platform admin: ${admin.email}`);
          
        } catch (err) {
          error(`Failed to migrate platform admin ${admin.email}: ${err.message}`);
          stats.platformAdmins.failed++;
          stats.errors.push({
            type: 'platform_admin',
            user: admin.email,
            error: err.message
          });
        }
      }
    }
    
    success(`Platform admin migration completed: ${stats.platformAdmins.migrated}/${stats.platformAdmins.total} successful`);
    
  } catch (err) {
    error(`Platform admin migration failed: ${err.message}`);
    throw err;
  }
}

/**
 * Migrate restaurant owners
 */
async function migrateRestaurantOwners() {
  log('Migrating restaurant owners...');
  
  try {
    // Fetch all restaurant owners with their restaurants
    const restaurantOwners = await prisma.restaurantOwner.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        restaurants: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true
          }
        }
      }
    });
    
    stats.restaurantOwners.total = restaurantOwners.length;
    log(`Found ${restaurantOwners.length} restaurant owners`);
    
    // Process in batches
    for (let i = 0; i < restaurantOwners.length; i += MIGRATION_CONFIG.BATCH_SIZE) {
      const batch = restaurantOwners.slice(i, i + MIGRATION_CONFIG.BATCH_SIZE);
      
      for (const owner of batch) {
        try {
          // Create role for each restaurant owned
          for (const restaurant of owner.restaurants) {
            // Check if user role already exists for this restaurant
            const existingRole = await prisma.userRole.findFirst({
              where: {
                userId: owner.id,
                userType: 'restaurant_owner',
                roleTemplate: MIGRATION_CONFIG.DEFAULT_ROLES.restaurant_owner,
                restaurantId: restaurant.id
              }
            });
            
            if (existingRole) {
              log(`Restaurant owner ${owner.email} already has role for ${restaurant.name}, skipping`);
              continue;
            }
            
            // Create user role for this restaurant
            await prisma.userRole.create({
              data: {
                userId: owner.id,
                userType: 'restaurant_owner',
                roleTemplate: MIGRATION_CONFIG.DEFAULT_ROLES.restaurant_owner,
                restaurantId: restaurant.id,
                customPermissions: [],
                isActive: owner.isActive && restaurant.isActive,
                createdAt: owner.createdAt || new Date(),
                updatedAt: new Date()
              }
            });
            
            log(`Created owner role for ${owner.email} at ${restaurant.name}`);
          }
          
          stats.restaurantOwners.migrated++;
          log(`Migrated restaurant owner: ${owner.email} (${owner.restaurants.length} restaurants)`);
          
        } catch (err) {
          error(`Failed to migrate restaurant owner ${owner.email}: ${err.message}`);
          stats.restaurantOwners.failed++;
          stats.errors.push({
            type: 'restaurant_owner',
            user: owner.email,
            error: err.message
          });
        }
      }
    }
    
    success(`Restaurant owner migration completed: ${stats.restaurantOwners.migrated}/${stats.restaurantOwners.total} successful`);
    
  } catch (err) {
    error(`Restaurant owner migration failed: ${err.message}`);
    throw err;
  }
}

/**
 * Migrate staff members
 */
async function migrateStaff() {
  log('Migrating staff members...');
  
  try {
    // Fetch all staff with their restaurant and role information
    const staff = await prisma.staff.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
        isActive: true,
        createdAt: true,
        restaurantId: true,
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true
          }
        },
        role: {
          select: {
            id: true,
            name: true,
            permissions: true
          }
        }
      }
    });
    
    stats.staff.total = staff.length;
    log(`Found ${staff.length} staff members`);
    
    // Process in batches
    for (let i = 0; i < staff.length; i += MIGRATION_CONFIG.BATCH_SIZE) {
      const batch = staff.slice(i, i + MIGRATION_CONFIG.BATCH_SIZE);
      
      for (const member of batch) {
        try {
          // Determine role template based on existing role
          const roleTemplate = mapLegacyRoleToTemplate(member.role);
          
          // Check if user role already exists
          const existingRole = await prisma.userRole.findFirst({
            where: {
              userId: member.id,
              userType: 'staff',
              restaurantId: member.restaurantId
            }
          });
          
          if (existingRole) {
            log(`Staff member ${member.email} already has RBAC role, skipping`);
            stats.staff.migrated++;
            continue;
          }
          
          // Extract custom permissions from legacy role
          const customPermissions = extractCustomPermissions(member.role);
          
          // Create user role
          await prisma.userRole.create({
            data: {
              userId: member.id,
              userType: 'staff',
              roleTemplate: roleTemplate,
              restaurantId: member.restaurantId,
              customPermissions: customPermissions,
              isActive: member.isActive && (member.restaurant?.isActive ?? true),
              createdAt: member.createdAt || new Date(),
              updatedAt: new Date()
            }
          });
          
          stats.staff.migrated++;
          log(`Migrated staff member: ${member.email} (${roleTemplate}${customPermissions.length > 0 ? ` + ${customPermissions.length} custom permissions` : ''})`);
          
        } catch (err) {
          error(`Failed to migrate staff member ${member.email}: ${err.message}`);
          stats.staff.failed++;
          stats.errors.push({
            type: 'staff',
            user: member.email,
            error: err.message
          });
        }
      }
    }
    
    success(`Staff migration completed: ${stats.staff.migrated}/${stats.staff.total} successful`);
    
  } catch (err) {
    error(`Staff migration failed: ${err.message}`);
    throw err;
  }
}

/**
 * Map legacy role to new role template
 */
function mapLegacyRoleToTemplate(legacyRole) {
  if (!legacyRole || !legacyRole.name) {
    return MIGRATION_CONFIG.DEFAULT_ROLES.server_staff; // Default fallback
  }
  
  const roleName = legacyRole.name.toLowerCase();
  
  // Manager roles
  if (roleName.includes('manager') || roleName.includes('supervisor') || roleName.includes('lead')) {
    return MIGRATION_CONFIG.DEFAULT_ROLES.manager;
  }
  
  // Kitchen roles
  if (roleName.includes('kitchen') || roleName.includes('cook') || roleName.includes('chef')) {
    return MIGRATION_CONFIG.DEFAULT_ROLES.kitchen_staff;
  }
  
  // Server roles (default)
  if (roleName.includes('server') || roleName.includes('waiter') || roleName.includes('waitress') || 
      roleName.includes('host') || roleName.includes('hostess') || roleName.includes('cashier')) {
    return MIGRATION_CONFIG.DEFAULT_ROLES.server_staff;
  }
  
  // Default to server staff
  return MIGRATION_CONFIG.DEFAULT_ROLES.server_staff;
}

/**
 * Extract custom permissions from legacy role
 */
function extractCustomPermissions(legacyRole) {
  const customPermissions = [];
  
  if (!legacyRole || !legacyRole.permissions) {
    return customPermissions;
  }
  
  // Map legacy permissions to new permission keys
  const permissionMap = {
    'VIEW_ANALYTICS': 'analytics:read',
    'MANAGE_SETTINGS': 'settings:write',
    'MANAGE_MENU': 'menu:write',
    'DELETE_ORDERS': 'orders:delete',
    'REFUND_ORDERS': 'orders:refund',
    'VIEW_REPORTS': 'analytics:read',
    'MANAGE_STAFF': 'staff:write',
    'MANAGE_TABLES': 'tables:write'
  };
  
  // Extract permissions that aren't part of standard role templates
  if (typeof legacyRole.permissions === 'object') {
    for (const [legacyPerm, newPerm] of Object.entries(permissionMap)) {
      if (legacyRole.permissions[legacyPerm] && newPerm) {
        customPermissions.push(newPerm);
      }
    }
  }
  
  return customPermissions;
}

/**
 * Clean up orphaned or duplicate roles
 */
async function cleanupRoles() {
  log('Cleaning up orphaned or duplicate roles...');
  
  try {
    // Find duplicate roles (same user, type, template, restaurant)
    const duplicates = await prisma.$queryRaw`
      SELECT userId, userType, roleTemplate, restaurantId, COUNT(*) as count
      FROM user_roles 
      GROUP BY userId, userType, roleTemplate, restaurantId 
      HAVING COUNT(*) > 1
    `;
    
    if (duplicates.length > 0) {
      log(`Found ${duplicates.length} sets of duplicate roles`);
      
      for (const duplicate of duplicates) {
        // Keep the most recent role, delete others
        const rolesToDelete = await prisma.userRole.findMany({
          where: {
            userId: duplicate.userId,
            userType: duplicate.userType,
            roleTemplate: duplicate.roleTemplate,
            restaurantId: duplicate.restaurantId
          },
          orderBy: { createdAt: 'desc' },
          skip: 1 // Keep the first (most recent) one
        });
        
        for (const role of rolesToDelete) {
          await prisma.userRole.delete({ where: { id: role.id } });
          log(`Deleted duplicate role: ${role.id}`);
        }
      }
    }
    
    success('Role cleanup completed');
    
  } catch (err) {
    error(`Role cleanup failed: ${err.message}`);
    // Don't throw here, cleanup is not critical
  }
}

/**
 * Validate migration results
 */
async function validateMigration() {
  log('Validating migration results...');
  
  try {
    // Count users and roles
    const [userCounts, roleCounts] = await Promise.all([
      {
        platformAdmins: await prisma.platformAdmin.count(),
        restaurantOwners: await prisma.restaurantOwner.count(),
        staff: await prisma.staff.count()
      },
      {
        platformAdminRoles: await prisma.userRole.count({ where: { userType: 'platform_admin' } }),
        restaurantOwnerRoles: await prisma.userRole.count({ where: { userType: 'restaurant_owner' } }),
        staffRoles: await prisma.userRole.count({ where: { userType: 'staff' } })
      }
    ]);
    
    log('Migration validation results:');
    log(`  Platform Admins: ${userCounts.platformAdmins} users → ${roleCounts.platformAdminRoles} roles`);
    log(`  Restaurant Owners: ${userCounts.restaurantOwners} users → ${roleCounts.restaurantOwnerRoles} roles`);
    log(`  Staff: ${userCounts.staff} users → ${roleCounts.staffRoles} roles`);
    
    // Check for users without roles
    const usersWithoutRoles = await prisma.$queryRaw`
      SELECT 'platform_admin' as type, id, email FROM platform_admins 
      WHERE id NOT IN (SELECT userId FROM user_roles WHERE userType = 'platform_admin')
      UNION ALL
      SELECT 'restaurant_owner' as type, id, email FROM restaurant_owners
      WHERE id NOT IN (SELECT userId FROM user_roles WHERE userType = 'restaurant_owner')  
      UNION ALL
      SELECT 'staff' as type, id, email FROM staff
      WHERE id NOT IN (SELECT userId FROM user_roles WHERE userType = 'staff')
    `;
    
    if (usersWithoutRoles.length > 0) {
      error(`Found ${usersWithoutRoles.length} users without RBAC roles:`);
      usersWithoutRoles.forEach(user => {
        error(`  ${user.type}: ${user.email} (${user.id})`);
      });
    } else {
      success('All users have corresponding RBAC roles');
    }
    
    success('Migration validation completed');
    
  } catch (err) {
    error(`Migration validation failed: ${err.message}`);
    throw err;
  }
}

/**
 * Generate migration report
 */
function generateReport() {
  log('Generating migration report...');
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalUsers: stats.platformAdmins.total + stats.restaurantOwners.total + stats.staff.total,
      totalMigrated: stats.platformAdmins.migrated + stats.restaurantOwners.migrated + stats.staff.migrated,
      totalFailed: stats.platformAdmins.failed + stats.restaurantOwners.failed + stats.staff.failed,
      successRate: 0
    },
    details: {
      platformAdmins: stats.platformAdmins,
      restaurantOwners: stats.restaurantOwners,
      staff: stats.staff
    },
    errors: stats.errors
  };
  
  report.summary.successRate = report.summary.totalUsers > 0 
    ? ((report.summary.totalMigrated / report.summary.totalUsers) * 100).toFixed(2)
    : 0;
  
  log('Migration Report:');
  log(`  Total Users: ${report.summary.totalUsers}`);
  log(`  Successfully Migrated: ${report.summary.totalMigrated}`);
  log(`  Failed: ${report.summary.totalFailed}`);
  log(`  Success Rate: ${report.summary.successRate}%`);
  
  if (report.errors.length > 0) {
    log(`  Errors: ${report.errors.length}`);
    report.errors.forEach((err, index) => {
      log(`    ${index + 1}. ${err.type} ${err.user}: ${err.error}`);
    });
  }
  
  return report;
}

/**
 * Main migration function
 */
async function main() {
  log('Starting user migration to RBAC system...');
  
  try {
    // Connect to database
    await prisma.$connect();
    log('Connected to database');
    
    // Run migration steps
    await migratePlatformAdmins();
    await migrateRestaurantOwners();
    await migrateStaff();
    await cleanupRoles();
    await validateMigration();
    
    // Generate report
    const report = generateReport();
    
    if (report.summary.totalFailed > 0) {
      error(`Migration completed with ${report.summary.totalFailed} failures`);
      process.exit(1);
    } else {
      success('User migration completed successfully!');
      process.exit(0);
    }
    
  } catch (err) {
    error(`Migration failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration if called directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  migratePlatformAdmins,
  migrateRestaurantOwners,
  migrateStaff,
  mapLegacyRoleToTemplate,
  extractCustomPermissions
};