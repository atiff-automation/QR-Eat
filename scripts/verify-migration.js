/**
 * RBAC Migration Verification Script
 * 
 * This script performs comprehensive verification of the RBAC migration,
 * checking data integrity, permission assignments, and system functionality.
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

// Verification configuration
const VERIFICATION_CONFIG = {
  // Expected role templates
  REQUIRED_ROLE_TEMPLATES: [
    'platform_admin',
    'restaurant_owner', 
    'manager',
    'kitchen_staff',
    'server_staff'
  ],
  
  // Expected permission categories
  REQUIRED_PERMISSION_CATEGORIES: [
    'platform',
    'restaurant', 
    'orders',
    'tables',
    'staff',
    'analytics',
    'menu',
    'settings',
    'billing'
  ],
  
  // Minimum expected permissions per role
  MIN_PERMISSIONS_PER_ROLE: {
    platform_admin: 15,
    restaurant_owner: 10,
    manager: 8,
    kitchen_staff: 3,
    server_staff: 5
  }
};

// Verification results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  errors: [],
  warnings: [],
  summary: {}
};

// Logging utilities
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const error = (message) => {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`);
  results.errors.push(message);
  results.failed++;
};

const warn = (message) => {
  console.warn(`[${new Date().toISOString()}] WARNING: ${message}`);
  results.warnings.push(message);
  results.warnings++;
};

const success = (message) => {
  console.log(`[${new Date().toISOString()}] SUCCESS: ${message}`);
  results.passed++;
};

/**
 * Verify database schema and tables
 */
async function verifyDatabaseSchema() {
  log('Verifying database schema...');
  
  try {
    // Check if all required RBAC tables exist
    const requiredTables = [
      'user_roles',
      'permissions', 
      'role_permissions',
      'audit_logs',
      'user_sessions'
    ];
    
    for (const table of requiredTables) {
      const tableExists = await prisma.$queryRaw`
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = ${table}
      `;
      
      if (tableExists.length === 0) {
        error(`Required table '${table}' does not exist`);
      } else {
        success(`Table '${table}' exists`);
      }
    }
    
    // Verify table structures have required columns
    await verifyTableStructures();
    
  } catch (err) {
    error(`Database schema verification failed: ${err.message}`);
  }
}

/**
 * Verify table structures
 */
async function verifyTableStructures() {
  log('Verifying table structures...');
  
  try {
    // Check user_roles table structure
    const userRolesColumns = await prisma.$queryRaw`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'user_roles'
    `;
    
    const requiredUserRoleColumns = [
      'id', 'userId', 'userType', 'roleTemplate', 
      'restaurantId', 'customPermissions', 'isActive', 'createdAt', 'updatedAt'
    ];
    
    const existingColumns = userRolesColumns.map(col => col.column_name);
    
    for (const column of requiredUserRoleColumns) {
      if (!existingColumns.includes(column)) {
        error(`user_roles table missing column: ${column}`);
      }
    }
    
    success('Table structures verified');
    
  } catch (err) {
    error(`Table structure verification failed: ${err.message}`);
  }
}

/**
 * Verify permissions data
 */
async function verifyPermissions() {
  log('Verifying permissions data...');
  
  try {
    // Check if permissions are seeded
    const permissionCount = await prisma.permission.count();
    
    if (permissionCount === 0) {
      error('No permissions found in database');
      return;
    }
    
    success(`Found ${permissionCount} permissions`);
    
    // Verify permission categories
    const categories = await prisma.permission.groupBy({
      by: ['category'],
      _count: true
    });
    
    const existingCategories = categories.map(cat => cat.category);
    
    for (const requiredCategory of VERIFICATION_CONFIG.REQUIRED_PERMISSION_CATEGORIES) {
      if (!existingCategories.includes(requiredCategory)) {
        warn(`Missing permission category: ${requiredCategory}`);
      } else {
        const categoryCount = categories.find(cat => cat.category === requiredCategory)._count;
        log(`  ${requiredCategory}: ${categoryCount} permissions`);
      }
    }
    
    // Verify no duplicate permissions
    const duplicatePermissions = await prisma.$queryRaw`
      SELECT permissionKey, COUNT(*) as count
      FROM permissions 
      GROUP BY permissionKey 
      HAVING COUNT(*) > 1
    `;
    
    if (duplicatePermissions.length > 0) {
      error(`Found ${duplicatePermissions.length} duplicate permissions`);
      duplicatePermissions.forEach(dup => {
        error(`  Duplicate permission: ${dup.permissionKey} (${dup.count} times)`);
      });
    } else {
      success('No duplicate permissions found');
    }
    
  } catch (err) {
    error(`Permission verification failed: ${err.message}`);
  }
}

/**
 * Verify role templates
 */
async function verifyRoleTemplates() {
  log('Verifying role templates...');
  
  try {
    // Check if role templates are properly configured
    const roleTemplates = await prisma.roleTemplate.findMany({
      include: {
        _count: {
          select: { permissions: true }
        }
      }
    });
    
    if (roleTemplates.length === 0) {
      error('No role templates found');
      return;
    }
    
    success(`Found ${roleTemplates.length} role templates`);
    
    // Verify required role templates exist
    const existingTemplates = roleTemplates.map(template => template.template);
    
    for (const requiredTemplate of VERIFICATION_CONFIG.REQUIRED_ROLE_TEMPLATES) {
      if (!existingTemplates.includes(requiredTemplate)) {
        error(`Missing required role template: ${requiredTemplate}`);
      } else {
        const template = roleTemplates.find(t => t.template === requiredTemplate);
        const permissionCount = template._count.permissions;
        const minRequired = VERIFICATION_CONFIG.MIN_PERMISSIONS_PER_ROLE[requiredTemplate] || 0;
        
        if (permissionCount < minRequired) {
          warn(`Role template '${requiredTemplate}' has only ${permissionCount} permissions (expected at least ${minRequired})`);
        } else {
          success(`Role template '${requiredTemplate}': ${permissionCount} permissions`);
        }
      }
    }
    
  } catch (err) {
    error(`Role template verification failed: ${err.message}`);
  }
}

/**
 * Verify user role assignments
 */
async function verifyUserRoles() {
  log('Verifying user role assignments...');
  
  try {
    // Get user counts from original tables
    const [platformAdminCount, restaurantOwnerCount, staffCount] = await Promise.all([
      prisma.platformAdmin.count(),
      prisma.restaurantOwner.count(), 
      prisma.staff.count()
    ]);
    
    // Get role counts
    const [platformAdminRoles, restaurantOwnerRoles, staffRoles] = await Promise.all([
      prisma.userRole.count({ where: { userType: 'platform_admin' } }),
      prisma.userRole.count({ where: { userType: 'restaurant_owner' } }),
      prisma.userRole.count({ where: { userType: 'staff' } })
    ]);
    
    log('User to role mapping:');
    log(`  Platform Admins: ${platformAdminCount} users → ${platformAdminRoles} roles`);
    log(`  Restaurant Owners: ${restaurantOwnerCount} users → ${restaurantOwnerRoles} roles`);  
    log(`  Staff: ${staffCount} users → ${staffRoles} roles`);
    
    // Verify platform admins have roles
    if (platformAdminCount > 0 && platformAdminRoles === 0) {
      error('Platform admins exist but no platform admin roles found');
    } else if (platformAdminRoles < platformAdminCount) {
      warn(`Some platform admins may be missing roles: ${platformAdminCount - platformAdminRoles}`);
    } else {
      success('Platform admin roles verified');
    }
    
    // Verify restaurant owners have roles (may have multiple per restaurant)
    if (restaurantOwnerCount > 0 && restaurantOwnerRoles === 0) {
      error('Restaurant owners exist but no restaurant owner roles found');
    } else {
      success('Restaurant owner roles verified');
    }
    
    // Verify staff have roles
    if (staffCount > 0 && staffRoles === 0) {
      error('Staff exist but no staff roles found');
    } else if (staffRoles < staffCount) {
      warn(`Some staff may be missing roles: ${staffCount - staffRoles}`);
    } else {
      success('Staff roles verified');
    }
    
    // Check for orphaned roles (roles without corresponding users)
    await verifyOrphanedRoles();
    
  } catch (err) {
    error(`User role verification failed: ${err.message}`);
  }
}

/**
 * Verify orphaned roles
 */
async function verifyOrphanedRoles() {
  log('Checking for orphaned roles...');
  
  try {
    // Check platform admin roles without users
    const orphanedPlatformRoles = await prisma.$queryRaw`
      SELECT ur.id, ur.userId 
      FROM user_roles ur 
      WHERE ur.userType = 'platform_admin' 
      AND ur.userId NOT IN (SELECT id FROM platform_admins)
    `;
    
    // Check restaurant owner roles without users  
    const orphanedOwnerRoles = await prisma.$queryRaw`
      SELECT ur.id, ur.userId 
      FROM user_roles ur 
      WHERE ur.userType = 'restaurant_owner' 
      AND ur.userId NOT IN (SELECT id FROM restaurant_owners)
    `;
    
    // Check staff roles without users
    const orphanedStaffRoles = await prisma.$queryRaw`
      SELECT ur.id, ur.userId 
      FROM user_roles ur 
      WHERE ur.userType = 'staff' 
      AND ur.userId NOT IN (SELECT id FROM staff)
    `;
    
    const totalOrphaned = orphanedPlatformRoles.length + orphanedOwnerRoles.length + orphanedStaffRoles.length;
    
    if (totalOrphaned > 0) {
      warn(`Found ${totalOrphaned} orphaned roles:`);
      warn(`  Platform admin roles: ${orphanedPlatformRoles.length}`);
      warn(`  Restaurant owner roles: ${orphanedOwnerRoles.length}`);
      warn(`  Staff roles: ${orphanedStaffRoles.length}`);
    } else {
      success('No orphaned roles found');
    }
    
  } catch (err) {
    error(`Orphaned role check failed: ${err.message}`);
  }
}

/**
 * Verify permission computation
 */
async function verifyPermissionComputation() {
  log('Verifying permission computation...');
  
  try {
    // Test permission computation for each role type
    const testUsers = await prisma.$queryRaw`
      SELECT DISTINCT userId, userType, roleTemplate 
      FROM user_roles 
      WHERE isActive = true
      ORDER BY userType
      LIMIT 10
    `;
    
    for (const testUser of testUsers) {
      try {
        // Get user roles
        const userRoles = await prisma.userRole.findMany({
          where: { 
            userId: testUser.userId,
            isActive: true 
          }
        });
        
        if (userRoles.length === 0) {
          warn(`User ${testUser.userId} has no active roles`);
          continue;
        }
        
        // Compute permissions for this user
        const permissions = new Set();
        
        for (const role of userRoles) {
          // Get template permissions
          const rolePermissions = await prisma.rolePermission.findMany({
            where: { roleTemplate: role.roleTemplate },
            include: { permission: true }
          });
          
          rolePermissions.forEach(rp => {
            if (rp.permission.isActive) {
              permissions.add(rp.permission.permissionKey);
            }
          });
          
          // Add custom permissions
          if (role.customPermissions && Array.isArray(role.customPermissions)) {
            role.customPermissions.forEach(perm => permissions.add(perm));
          }
        }
        
        if (permissions.size === 0) {
          warn(`User ${testUser.userId} (${testUser.userType}) has no computed permissions`);
        } else {
          log(`  User ${testUser.userId} (${testUser.userType}): ${permissions.size} permissions`);
        }
        
      } catch (err) {
        warn(`Permission computation failed for user ${testUser.userId}: ${err.message}`);
      }
    }
    
    success('Permission computation verification completed');
    
  } catch (err) {
    error(`Permission computation verification failed: ${err.message}`);
  }
}

/**
 * Verify data integrity
 */
async function verifyDataIntegrity() {
  log('Verifying data integrity...');
  
  try {
    // Check for invalid role templates
    const invalidRoleTemplates = await prisma.userRole.findMany({
      where: {
        roleTemplate: {
          notIn: VERIFICATION_CONFIG.REQUIRED_ROLE_TEMPLATES
        }
      }
    });
    
    if (invalidRoleTemplates.length > 0) {
      warn(`Found ${invalidRoleTemplates.length} roles with invalid templates`);
      const uniqueInvalidTemplates = [...new Set(invalidRoleTemplates.map(r => r.roleTemplate))];
      uniqueInvalidTemplates.forEach(template => {
        warn(`  Invalid template: ${template}`);
      });
    } else {
      success('All role templates are valid');
    }
    
    // Check for roles missing required restaurant context
    const invalidStaffRoles = await prisma.userRole.findMany({
      where: {
        userType: 'staff',
        restaurantId: null
      }
    });
    
    const invalidOwnerRoles = await prisma.userRole.findMany({
      where: {
        userType: 'restaurant_owner',
        restaurantId: null
      }
    });
    
    if (invalidStaffRoles.length > 0) {
      error(`Found ${invalidStaffRoles.length} staff roles without restaurant context`);
    }
    
    if (invalidOwnerRoles.length > 0) {
      error(`Found ${invalidOwnerRoles.length} owner roles without restaurant context`);
    }
    
    if (invalidStaffRoles.length === 0 && invalidOwnerRoles.length === 0) {
      success('Restaurant context validation passed');
    }
    
    // Check for platform admin roles with restaurant context
    const invalidPlatformRoles = await prisma.userRole.findMany({
      where: {
        userType: 'platform_admin',
        restaurantId: { not: null }
      }
    });
    
    if (invalidPlatformRoles.length > 0) {
      warn(`Found ${invalidPlatformRoles.length} platform admin roles with restaurant context`);
    } else {
      success('Platform admin context validation passed');
    }
    
  } catch (err) {
    error(`Data integrity verification failed: ${err.message}`);
  }
}

/**
 * Verify system functionality
 */
async function verifySystemFunctionality() {
  log('Verifying system functionality...');
  
  try {
    // Test basic CRUD operations on RBAC tables
    const testRoleId = crypto.randomUUID();
    const testUserId = crypto.randomUUID();
    
    // Create test role
    await prisma.userRole.create({
      data: {
        id: testRoleId,
        userId: testUserId,
        userType: 'platform_admin',
        roleTemplate: 'platform_admin',
        customPermissions: ['test:permission'],
        isActive: true
      }
    });
    
    // Read test role
    const testRole = await prisma.userRole.findUnique({
      where: { id: testRoleId }
    });
    
    if (!testRole) {
      error('Failed to read created test role');
    } else {
      success('RBAC CRUD operations working');
    }
    
    // Update test role
    await prisma.userRole.update({
      where: { id: testRoleId },
      data: { isActive: false }
    });
    
    // Delete test role
    await prisma.userRole.delete({
      where: { id: testRoleId }
    });
    
    success('System functionality verification completed');
    
  } catch (err) {
    error(`System functionality verification failed: ${err.message}`);
  }
}

/**
 * Generate verification report
 */
function generateVerificationReport() {
  log('Generating verification report...');
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalChecks: results.passed + results.failed,
      passed: results.passed,
      failed: results.failed,
      warnings: results.warnings,
      status: results.failed === 0 ? 'PASSED' : 'FAILED'
    },
    errors: results.errors,
    warnings: results.warnings
  };
  
  log('Verification Report Summary:');
  log(`  Status: ${report.summary.status}`);
  log(`  Total Checks: ${report.summary.totalChecks}`);
  log(`  Passed: ${report.summary.passed}`);
  log(`  Failed: ${report.summary.failed}`);
  log(`  Warnings: ${report.summary.warnings}`);
  
  if (report.errors.length > 0) {
    log('\nErrors:');
    report.errors.forEach((err, index) => {
      log(`  ${index + 1}. ${err}`);
    });
  }
  
  if (report.warnings.length > 0) {
    log('\nWarnings:');
    report.warnings.forEach((warn, index) => {
      log(`  ${index + 1}. ${warn}`);
    });
  }
  
  return report;
}

/**
 * Main verification function
 */
async function main() {
  log('Starting RBAC migration verification...');
  
  try {
    // Connect to database
    await prisma.$connect();
    log('Connected to database');
    
    // Run verification steps
    await verifyDatabaseSchema();
    await verifyPermissions();
    await verifyRoleTemplates();
    await verifyUserRoles();
    await verifyPermissionComputation();
    await verifyDataIntegrity();
    await verifySystemFunctionality();
    
    // Generate report
    const report = generateVerificationReport();
    
    if (report.summary.status === 'FAILED') {
      error('Migration verification FAILED');
      process.exit(1);
    } else {
      success('Migration verification PASSED');
      if (report.summary.warnings > 0) {
        warn(`Verification passed with ${report.summary.warnings} warnings`);
      }
      process.exit(0);
    }
    
  } catch (err) {
    error(`Verification failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification if called directly
if (require.main === module) {
  main();
}

module.exports = {
  main,
  verifyDatabaseSchema,
  verifyPermissions,
  verifyRoleTemplates,
  verifyUserRoles,
  verifyPermissionComputation,
  verifyDataIntegrity
};