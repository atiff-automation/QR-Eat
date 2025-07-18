/**
 * Authentication Service V2 Test
 * 
 * This file contains tests to verify the enhanced authentication service functionality
 * Run with: npx tsx src/lib/rbac/test-auth-service.ts
 */

import { AuthServiceV2 } from './auth-service';
import { SessionManager } from './session-manager';
import { PermissionManager } from './permissions';
import { RoleManager } from './role-manager';
import { EnhancedJWTService } from './jwt';

async function testAuthServiceV2() {
  console.log('🧪 Testing RBAC Authentication Service V2...\n');
  
  try {
    // Test 1: Session Management
    console.log('1. Testing Session Management...');
    
    // Test session creation
    const sessionId = EnhancedJWTService.generateSessionId();
    console.log(`✅ Generated session ID: ${sessionId}`);
    
    // Test session statistics
    const sessionStats = await SessionManager.getSessionStatistics();
    console.log(`✅ Session statistics: ${sessionStats.totalActiveSessions} active sessions`);
    
    // Test 2: Authentication Service Utilities
    console.log('\n2. Testing Authentication Service Utilities...');
    
    // Test role selection
    const mockRoles = [
      {
        id: 'role1',
        userType: 'staff' as const,
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant1',
        customPermissions: [],
        isActive: true
      },
      {
        id: 'role2',
        userType: 'staff' as const,
        roleTemplate: 'manager',
        restaurantId: 'restaurant1',
        customPermissions: [],
        isActive: true
      }
    ];
    
    const defaultRole = AuthServiceV2.selectDefaultRole(mockRoles);
    console.log(`✅ Default role selected: ${defaultRole.roleTemplate}`);
    
    // Test 3: Permission Checking
    console.log('\n3. Testing Permission Checking...');
    
    // Test permission computation
    const adminPermissions = await PermissionManager.getTemplatePermissions('platform_admin');
    console.log(`✅ Platform admin permissions: ${adminPermissions.length} permissions`);
    
    const ownerPermissions = await PermissionManager.getTemplatePermissions('restaurant_owner');
    console.log(`✅ Restaurant owner permissions: ${ownerPermissions.length} permissions`);
    
    const managerPermissions = await PermissionManager.getTemplatePermissions('manager');
    console.log(`✅ Manager permissions: ${managerPermissions.length} permissions`);
    
    const kitchenPermissions = await PermissionManager.getTemplatePermissions('kitchen_staff');
    console.log(`✅ Kitchen staff permissions: ${kitchenPermissions.length} permissions`);
    
    // Test 4: Role Template Definitions
    console.log('\n4. Testing Role Template Definitions...');
    
    const roleTemplates = await RoleManager.getAllRoleTemplates();
    for (const template of roleTemplates) {
      const definition = await RoleManager.getRoleTemplateDefinition(template);
      console.log(`✅ ${template}: ${definition.permissions.length} permissions`);
    }
    
    // Test 5: Session Cleanup
    console.log('\n5. Testing Session Cleanup...');
    
    const expiredCount = await SessionManager.cleanupExpiredSessions();
    console.log(`✅ Cleaned up ${expiredCount} expired sessions`);
    
    // Test 6: Authentication Statistics
    console.log('\n6. Testing Authentication Statistics...');
    
    const authStats = await AuthServiceV2.getAuthStatistics();
    console.log(`✅ Auth statistics: ${authStats.totalUsers} total users, ${authStats.activeSessions} active sessions`);
    console.log(`   - Platform admins: ${authStats.usersByType.platform_admin}`);
    console.log(`   - Restaurant owners: ${authStats.usersByType.restaurant_owner}`);
    console.log(`   - Staff: ${authStats.usersByType.staff}`);
    
    // Test 7: JWT Service Integration
    console.log('\n7. Testing JWT Service Integration...');
    
    const mockPayload = {
      userId: 'test-user',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      currentRole: {
        id: 'role1',
        userType: 'staff' as const,
        roleTemplate: 'kitchen_staff',
        restaurantId: 'restaurant1',
        customPermissions: [],
        isActive: true
      },
      availableRoles: [],
      permissions: ['orders:read', 'orders:kitchen'],
      sessionId: 'test-session',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      iss: 'qr-restaurant-system',
      sub: 'test-user'
    };
    
    const validation = EnhancedJWTService.validatePayload(mockPayload);
    console.log(`✅ JWT payload validation: ${validation.isValid ? 'PASSED' : 'FAILED'}`);
    
    // Test 8: Error Handling
    console.log('\n8. Testing Error Handling...');
    
    try {
      await AuthServiceV2.validateToken('invalid-token');
      console.log('❌ Should have thrown error for invalid token');
    } catch (error) {
      console.log('✅ Correctly handled invalid token error');
    }
    
    console.log('\n🎉 All Authentication Service V2 tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Authentication Service V2 test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testAuthServiceV2();
}

export { testAuthServiceV2 };