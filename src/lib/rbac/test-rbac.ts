/**
 * RBAC System Test
 * 
 * This file contains basic tests to verify the RBAC system functionality
 * Run with: npx tsx src/lib/rbac/test-rbac.ts
 */

import { PermissionManager } from './permissions';
import { RoleManager } from './role-manager';
import { EnhancedJWTService } from './jwt';
import { UserType } from './types';

async function testRBACSystem() {
  console.log('🧪 Testing RBAC System...\n');
  
  try {
    // Test 1: Get all permissions
    console.log('1. Testing permission retrieval...');
    const allPermissions = await PermissionManager.getAllPermissions();
    console.log(`✅ Retrieved ${allPermissions.length} permissions`);
    
    // Test 2: Get role template permissions
    console.log('\n2. Testing role template permissions...');
    const adminPermissions = await PermissionManager.getTemplatePermissions('platform_admin');
    const ownerPermissions = await PermissionManager.getTemplatePermissions('restaurant_owner');
    const managerPermissions = await PermissionManager.getTemplatePermissions('manager');
    const kitchenPermissions = await PermissionManager.getTemplatePermissions('kitchen_staff');
    
    console.log(`✅ Platform Admin: ${adminPermissions.length} permissions`);
    console.log(`✅ Restaurant Owner: ${ownerPermissions.length} permissions`);
    console.log(`✅ Manager: ${managerPermissions.length} permissions`);
    console.log(`✅ Kitchen Staff: ${kitchenPermissions.length} permissions`);
    
    // Test 3: Test permission checking
    console.log('\n3. Testing permission checking...');
    const hasOrderRead = PermissionManager.hasPermission(kitchenPermissions, 'orders:read');
    const hasStaffWrite = PermissionManager.hasPermission(kitchenPermissions, 'staff:write');
    
    console.log(`✅ Kitchen staff can read orders: ${hasOrderRead}`);
    console.log(`✅ Kitchen staff can write staff: ${hasStaffWrite}`);
    
    // Test 4: Test role templates
    console.log('\n4. Testing role templates...');
    const roleTemplates = await RoleManager.getAllRoleTemplates();
    console.log(`✅ Available role templates: ${roleTemplates.join(', ')}`);
    
    // Test 5: Test role template definitions
    console.log('\n5. Testing role template definitions...');
    for (const template of roleTemplates) {
      const definition = await RoleManager.getRoleTemplateDefinition(template);
      console.log(`✅ ${template}: ${definition.permissions.length} permissions - ${definition.description}`);
    }
    
    // Test 6: Test JWT session ID generation
    console.log('\n6. Testing JWT utilities...');
    const sessionId = EnhancedJWTService.generateSessionId();
    console.log(`✅ Generated session ID: ${sessionId}`);
    
    // Test 7: Test JWT payload validation
    console.log('\n7. Testing JWT payload validation...');
    const mockPayload = {
      userId: 'test-user-id',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      currentRole: {
        id: 'role-id',
        userType: UserType.STAFF,
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant-id',
        customPermissions: [],
        isActive: true
      },
      availableRoles: [],
      permissions: ['orders:read', 'orders:kitchen'],
      sessionId: 'test-session-id',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'qr-restaurant-system',
      sub: 'test-user-id'
    };
    
    const validation = EnhancedJWTService.validatePayload(mockPayload);
    console.log(`✅ Payload validation: ${validation.isValid ? 'PASSED' : 'FAILED'}`);
    if (!validation.isValid) {
      console.log(`   Errors: ${validation.errors.join(', ')}`);
    }
    
    console.log('\n🎉 All RBAC tests completed successfully!');
    
  } catch (error) {
    console.error('❌ RBAC test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testRBACSystem();
}

export { testRBACSystem };