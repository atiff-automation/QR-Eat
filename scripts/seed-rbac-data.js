/**
 * RBAC Data Seeding Script
 * 
 * This script seeds the database with initial permissions and role templates
 * required for the RBAC system to function properly.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Initial permissions - Comprehensive set for the QR Restaurant System
const INITIAL_PERMISSIONS = [
  // Platform Management (Super Admin only)
  { key: 'platform:read', description: 'View platform information', category: 'platform' },
  { key: 'platform:write', description: 'Edit platform settings', category: 'platform' },
  { key: 'platform:delete', description: 'Delete platform data', category: 'platform' },
  
  // Restaurant Management
  { key: 'restaurant:read', description: 'View restaurant information', category: 'restaurant' },
  { key: 'restaurant:write', description: 'Edit restaurant settings', category: 'restaurant' },
  { key: 'restaurant:settings', description: 'Access restaurant settings', category: 'restaurant' },
  { key: 'restaurants:create', description: 'Create new restaurants', category: 'restaurant' },
  { key: 'restaurants:read', description: 'View all restaurants', category: 'restaurant' },
  { key: 'restaurants:write', description: 'Edit any restaurant', category: 'restaurant' },
  { key: 'restaurants:delete', description: 'Delete restaurants', category: 'restaurant' },
  
  // Order Management
  { key: 'orders:read', description: 'View orders', category: 'orders' },
  { key: 'orders:write', description: 'Create and edit orders', category: 'orders' },
  { key: 'orders:kitchen', description: 'Kitchen display access', category: 'orders' },
  { key: 'orders:update', description: 'Update order progress/status', category: 'orders' },
  { key: 'orders:fulfill', description: 'Mark orders as ready/served', category: 'orders' },
  { key: 'orders:cancel', description: 'Cancel orders', category: 'orders' },
  { key: 'orders:refund', description: 'Process order refunds', category: 'orders' },
  { key: 'orders:delete', description: 'Delete orders', category: 'orders' },
  
  // Table Management
  { key: 'tables:read', description: 'View tables', category: 'tables' },
  { key: 'tables:write', description: 'Manage tables', category: 'tables' },
  { key: 'tables:qr', description: 'Generate QR codes', category: 'tables' },
  { key: 'tables:delete', description: 'Delete tables', category: 'tables' },
  
  // Staff Management
  { key: 'staff:read', description: 'View staff information', category: 'staff' },
  { key: 'staff:write', description: 'Edit staff information', category: 'staff' },
  { key: 'staff:invite', description: 'Invite new staff members', category: 'staff' },
  { key: 'staff:delete', description: 'Delete staff members', category: 'staff' },
  { key: 'staff:roles', description: 'Manage staff roles', category: 'staff' },
  
  // Analytics & Reporting
  { key: 'analytics:read', description: 'View analytics and reports', category: 'analytics' },
  { key: 'analytics:export', description: 'Export data', category: 'analytics' },
  { key: 'analytics:platform', description: 'View platform-wide analytics', category: 'analytics' },
  
  // Menu Management
  { key: 'menu:read', description: 'View menu items', category: 'menu' },
  { key: 'menu:write', description: 'Manage menu items', category: 'menu' },
  { key: 'menu:delete', description: 'Delete menu items', category: 'menu' },
  { key: 'menu:categories', description: 'Manage menu categories', category: 'menu' },
  
  // Settings
  { key: 'settings:read', description: 'View settings', category: 'settings' },
  { key: 'settings:write', description: 'Edit settings', category: 'settings' },
  { key: 'settings:platform', description: 'Edit platform settings', category: 'settings' },
  
  // Billing & Subscriptions
  { key: 'billing:read', description: 'View billing information', category: 'billing' },
  { key: 'billing:write', description: 'Manage billing', category: 'billing' },
  { key: 'subscriptions:read', description: 'View subscriptions', category: 'subscriptions' },
  { key: 'subscriptions:write', description: 'Manage subscriptions', category: 'subscriptions' },
  
  // User Management (Super Admin)
  { key: 'users:read', description: 'View all users', category: 'users' },
  { key: 'users:write', description: 'Manage users', category: 'users' },
  { key: 'users:delete', description: 'Delete users', category: 'users' },
  { key: 'users:bulk', description: 'Bulk user operations', category: 'users' },
  
  // Audit & Security
  { key: 'audit:read', description: 'View audit logs', category: 'audit' },
  { key: 'audit:export', description: 'Export audit logs', category: 'audit' },
  
  // Notifications
  { key: 'notifications:read', description: 'View notifications', category: 'notifications' },
  { key: 'notifications:write', description: 'Manage notifications', category: 'notifications' },
  
  // API Access
  { key: 'api:read', description: 'API read access', category: 'api' },
  { key: 'api:write', description: 'API write access', category: 'api' }
];

// Role templates with their assigned permissions
const ROLE_TEMPLATES = {
  // 1. Platform Admin - Complete platform control
  platform_admin: [
    'platform:read', 'platform:write', 'platform:delete',
    'restaurants:create', 'restaurants:read', 'restaurants:write', 'restaurants:delete',
    'subscriptions:read', 'subscriptions:write',
    'billing:read', 'billing:write',
    'analytics:platform', 'analytics:export',
    'users:read', 'users:write', 'users:delete', 'users:bulk',
    'audit:read', 'audit:export',
    'settings:platform',
    'api:read', 'api:write'
  ],
  
  // 2. Restaurant Owner - Full restaurant control
  restaurant_owner: [
    'restaurant:read', 'restaurant:write', 'restaurant:settings',
    'orders:read', 'orders:write', 'orders:fulfill', 'orders:cancel', 'orders:refund',
    'tables:read', 'tables:write', 'tables:qr', 'tables:delete',
    'staff:read', 'staff:write', 'staff:invite', 'staff:delete', 'staff:roles',
    'analytics:read', 'analytics:export',
    'menu:read', 'menu:write', 'menu:delete', 'menu:categories',
    'settings:read', 'settings:write',
    'billing:read',
    'notifications:read', 'notifications:write',
    'api:read', 'api:write'
  ],
  
  // 3. Manager - Restaurant operations management
  manager: [
    'restaurant:read',
    'orders:read', 'orders:write', 'orders:fulfill', 'orders:cancel',
    'tables:read', 'tables:write', 'tables:qr',
    'staff:read', // Can view staff but not manage
    'analytics:read',
    'menu:read', 'menu:write',
    'settings:read',
    'notifications:read',
    'api:read'
  ],
  
  // 4. Kitchen Staff - Kitchen operations only
  kitchen_staff: [
    'orders:read', 'orders:kitchen', 'orders:update', // Can view and update order progress
    'menu:read', // Can view menu items for order details
    'notifications:read'
  ],
  
  // 5. Server Staff - Front of house operations
  server_staff: [
    'orders:read', 'orders:write', 'orders:fulfill',
    'tables:read', 'tables:qr',
    'menu:read',
    'notifications:read',
    'api:read'
  ]
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

/**
 * Seed permissions
 */
async function seedPermissions() {
  log('Seeding permissions...');
  
  try {
    let created = 0;
    let updated = 0;
    
    for (const permissionData of INITIAL_PERMISSIONS) {
      const existingPermission = await prisma.permission.findUnique({
        where: { permissionKey: permissionData.key }
      });
      
      if (existingPermission) {
        // Update existing permission
        await prisma.permission.update({
          where: { permissionKey: permissionData.key },
          data: {
            description: permissionData.description,
            category: permissionData.category,
            isActive: true
          }
        });
        updated++;
      } else {
        // Create new permission
        await prisma.permission.create({
          data: {
            permissionKey: permissionData.key,
            description: permissionData.description,
            category: permissionData.category,
            isActive: true
          }
        });
        created++;
      }
    }
    
    success(`Permissions seeded: ${created} created, ${updated} updated`);
    
  } catch (err) {
    error(`Permission seeding failed: ${err.message}`);
    throw err;
  }
}

/**
 * Seed role templates
 */
async function seedRoleTemplates() {
  log('Seeding role templates...');
  
  try {
    let created = 0;
    let updated = 0;
    
    for (const [template, permissions] of Object.entries(ROLE_TEMPLATES)) {
      // Check if role template already exists
      const existingTemplate = await prisma.roleTemplate.findUnique({
        where: { template }
      });
      
      if (existingTemplate) {
        // Update existing template
        await prisma.roleTemplate.update({
          where: { template },
          data: {
            permissions,
            isActive: true,
            updatedAt: new Date()
          }
        });
        updated++;
      } else {
        // Create new template
        await prisma.roleTemplate.create({
          data: {
            template,
            permissions,
            isActive: true
          }
        });
        created++;
      }
      
      // Create/update role-permission mappings
      await updateRolePermissions(template, permissions);
    }
    
    success(`Role templates seeded: ${created} created, ${updated} updated`);
    
  } catch (err) {
    error(`Role template seeding failed: ${err.message}`);
    throw err;
  }
}

/**
 * Update role permission mappings
 */
async function updateRolePermissions(template, permissions) {
  try {
    // Delete existing mappings for this template
    await prisma.rolePermission.deleteMany({
      where: { roleTemplate: template }
    });
    
    // Create new mappings
    for (const permissionKey of permissions) {
      // Verify permission exists
      const permission = await prisma.permission.findUnique({
        where: { permissionKey }
      });
      
      if (!permission) {
        error(`Permission '${permissionKey}' not found for role template '${template}'`);
        continue;
      }
      
      await prisma.rolePermission.create({
        data: {
          roleTemplate: template,
          permissionKey: permissionKey
        }
      });
    }
    
    log(`Role permissions updated for template: ${template} (${permissions.length} permissions)`);
    
  } catch (err) {
    error(`Role permission update failed for ${template}: ${err.message}`);
    throw err;
  }
}

/**
 * Clean up inactive data
 */
async function cleanupInactiveData() {
  log('Cleaning up inactive permissions...');
  
  try {
    // Mark permissions not in current set as inactive
    const currentPermissionKeys = INITIAL_PERMISSIONS.map(p => p.key);
    
    const inactiveCount = await prisma.permission.updateMany({
      where: {
        permissionKey: {
          notIn: currentPermissionKeys
        }
      },
      data: {
        isActive: false
      }
    });
    
    if (inactiveCount.count > 0) {
      log(`Marked ${inactiveCount.count} permissions as inactive`);
    }
    
    // Clean up orphaned role permissions
    await prisma.rolePermission.deleteMany({
      where: {
        permission: {
          isActive: false
        }
      }
    });
    
    success('Cleanup completed');
    
  } catch (err) {
    error(`Cleanup failed: ${err.message}`);
    // Don't throw here, cleanup is not critical
  }
}

/**
 * Verify seeded data
 */
async function verifySeedData() {
  log('Verifying seeded data...');
  
  try {
    // Count permissions
    const permissionCount = await prisma.permission.count({
      where: { isActive: true }
    });
    
    // Count role templates
    const templateCount = await prisma.roleTemplate.count({
      where: { isActive: true }
    });
    
    // Count role permissions
    const rolePermissionCount = await prisma.rolePermission.count();
    
    log(`Verification results:`);
    log(`  Active permissions: ${permissionCount}`);
    log(`  Active role templates: ${templateCount}`);
    log(`  Role-permission mappings: ${rolePermissionCount}`);
    
    // Verify each role template has permissions
    for (const template of Object.keys(ROLE_TEMPLATES)) {
      const mappingCount = await prisma.rolePermission.count({
        where: { roleTemplate: template }
      });
      
      if (mappingCount === 0) {
        error(`Role template '${template}' has no permission mappings`);
      } else {
        log(`  ${template}: ${mappingCount} permissions`);
      }
    }
    
    success('Data verification completed');
    
  } catch (err) {
    error(`Data verification failed: ${err.message}`);
    throw err;
  }
}

/**
 * Main seeding function
 */
async function main() {
  log('Starting RBAC data seeding...');
  
  try {
    // Connect to database
    await prisma.$connect();
    log('Connected to database');
    
    // Run seeding steps
    await seedPermissions();
    await seedRoleTemplates();
    await cleanupInactiveData();
    await verifySeedData();
    
    success('RBAC data seeding completed successfully!');
    process.exit(0);
    
  } catch (err) {
    error(`Seeding failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run seeding if called directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  seedPermissions,
  seedRoleTemplates,
  INITIAL_PERMISSIONS,
  ROLE_TEMPLATES
};