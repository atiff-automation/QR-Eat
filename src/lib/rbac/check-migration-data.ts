/**
 * Check Migration Data
 * 
 * This utility checks existing data to assess migration needs
 */

import { prisma } from '@/lib/database';

async function checkMigrationData() {
  console.log('🔍 Checking existing data for migration...\n');
  
  try {
    // Check platform admins
    const platformAdmins = await prisma.platformAdmin.findMany();
    console.log(`📊 Platform Admins: ${platformAdmins.length}`);
    
    // Check restaurant owners
    const restaurantOwners = await prisma.restaurantOwner.findMany({
      include: {
        restaurants: true
      }
    });
    console.log(`📊 Restaurant Owners: ${restaurantOwners.length}`);
    
    // Check staff
    const staff = await prisma.staff.findMany({
      include: {
        role: true,
        restaurant: true
      }
    });
    console.log(`📊 Staff Members: ${staff.length}`);
    
    // Check existing user roles
    const userRoles = await prisma.userRole.findMany();
    console.log(`📊 User Roles: ${userRoles.length}`);
    
    // Check restaurants
    const restaurants = await prisma.restaurant.findMany();
    console.log(`📊 Restaurants: ${restaurants.length}`);
    
    // Check staff roles (legacy)
    const staffRoles = await prisma.staffRole.findMany();
    console.log(`📊 Staff Roles (Legacy): ${staffRoles.length}`);
    
    console.log('\n📋 Migration Assessment:');
    
    // Calculate what needs to be migrated
    let migrationNeeded = 0;
    
    // Platform admins that need RBAC roles
    const platformAdminsWithoutRoles = await prisma.platformAdmin.findMany({
      where: {
        NOT: {
          id: {
            in: userRoles.filter(r => r.userType === 'platform_admin').map(r => r.userId)
          }
        }
      }
    });
    
    if (platformAdminsWithoutRoles.length > 0) {
      console.log(`   - Platform admins needing migration: ${platformAdminsWithoutRoles.length}`);
      migrationNeeded += platformAdminsWithoutRoles.length;
    }
    
    // Restaurant owners that need RBAC roles
    const ownersWithoutRoles = await prisma.restaurantOwner.findMany({
      where: {
        NOT: {
          id: {
            in: userRoles.filter(r => r.userType === 'restaurant_owner').map(r => r.userId)
          }
        }
      }
    });
    
    if (ownersWithoutRoles.length > 0) {
      console.log(`   - Restaurant owners needing migration: ${ownersWithoutRoles.length}`);
      migrationNeeded += ownersWithoutRoles.length;
    }
    
    // Staff that need RBAC roles
    const staffWithoutRoles = await prisma.staff.findMany({
      where: {
        NOT: {
          id: {
            in: userRoles.filter(r => r.userType === 'staff').map(r => r.userId)
          }
        }
      }
    });
    
    if (staffWithoutRoles.length > 0) {
      console.log(`   - Staff members needing migration: ${staffWithoutRoles.length}`);
      migrationNeeded += staffWithoutRoles.length;
    }
    
    if (migrationNeeded === 0) {
      console.log('   ✅ All users already have RBAC roles - no migration needed');
    } else {
      console.log(`   ⚠️  Total users needing migration: ${migrationNeeded}`);
    }
    
    // Show detailed breakdown
    console.log('\n🔍 Detailed Analysis:');
    
    if (restaurantOwners.length > 0) {
      console.log('\n   Restaurant Owners:');
      restaurantOwners.forEach(owner => {
        console.log(`   - ${owner.firstName} ${owner.lastName} (${owner.email})`);
        console.log(`     Restaurants: ${owner.restaurants.map(r => r.name).join(', ')}`);
      });
    }
    
    if (staff.length > 0) {
      console.log('\n   Staff Members:');
      staff.forEach(member => {
        console.log(`   - ${member.firstName} ${member.lastName} (${member.email})`);
        console.log(`     Role: ${member.role?.name || 'No role'}`);
        console.log(`     Restaurant: ${member.restaurant?.name || 'No restaurant'}`);
      });
    }
    
    if (staffRoles.length > 0) {
      console.log('\n   Legacy Staff Roles:');
      staffRoles.forEach(role => {
        console.log(`   - ${role.name}: ${role.description || 'No description'}`);
        console.log(`     Level: ${role.level}, System Role: ${role.isSystemRole}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking migration data:', error);
  }
}

// Run check if this file is executed directly
if (require.main === module) {
  checkMigrationData();
}

export { checkMigrationData };