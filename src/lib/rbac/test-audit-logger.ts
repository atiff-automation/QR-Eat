/**
 * Audit Logger Test
 * 
 * This file contains tests to verify the audit logging system functionality
 * Run with: npx tsx src/lib/rbac/test-audit-logger.ts
 */

import { AuditLogger } from './audit-logger';

async function testAuditLogger() {
  console.log('🧪 Testing RBAC Audit Logging System...\n');
  
  try {
    // Test 1: Log Authentication
    console.log('1. Testing Authentication Logging...');
    
    const mockRole = {
      id: 'role-123',
      userType: 'staff' as const,
      roleTemplate: 'kitchen_staff',
      restaurantId: 'restaurant-123',
      customPermissions: [],
      isActive: true
    };

    await AuditLogger.logAuthentication(
      'user-123',
      mockRole,
      'session-123',
      {
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser 1.0',
        metadata: {
          userType: 'staff',
          loginMethod: 'password'
        }
      }
    );
    console.log('✅ Authentication logged successfully');

    // Test 2: Log Authentication Failure
    console.log('\n2. Testing Authentication Failure Logging...');
    
    await AuditLogger.logAuthenticationFailure(
      'invalid@example.com',
      'Invalid credentials',
      {
        ipAddress: '192.168.1.2',
        userAgent: 'Test Browser 1.0',
        metadata: {
          attemptedRestaurant: 'test-restaurant'
        }
      }
    );
    console.log('✅ Authentication failure logged successfully');

    // Test 3: Log Role Switch
    console.log('\n3. Testing Role Switch Logging...');
    
    await AuditLogger.logRoleSwitch(
      'user-123',
      'role-old',
      'role-new',
      'session-123',
      {
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser 1.0',
        metadata: {
          fromTemplate: 'kitchen_staff',
          toTemplate: 'manager'
        }
      }
    );
    console.log('✅ Role switch logged successfully');

    // Test 4: Log Permission Denied
    console.log('\n4. Testing Permission Denied Logging...');
    
    await AuditLogger.logPermissionDenied(
      'user-123',
      'staff_management',
      'staff:write',
      'session-123',
      {
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser 1.0',
        metadata: {
          attemptedAction: 'Create new staff member'
        }
      }
    );
    console.log('✅ Permission denied logged successfully');

    // Test 5: Log Logout
    console.log('\n5. Testing Logout Logging...');
    
    await AuditLogger.logLogout(
      'user-123',
      'session-123',
      {
        ipAddress: '192.168.1.1',
        userAgent: 'Test Browser 1.0',
        metadata: {
          sessionDuration: 3600000
        }
      }
    );
    console.log('✅ Logout logged successfully');

    // Test 6: Log Security Event
    console.log('\n6. Testing Security Event Logging...');
    
    await AuditLogger.logSecurityEvent(
      'user-123',
      'SUSPICIOUS_ACTIVITY',
      'medium',
      'Multiple failed login attempts detected',
      {
        ipAddress: '192.168.1.3',
        userAgent: 'Unknown Browser',
        metadata: {
          failedAttempts: 5,
          timeWindow: '5 minutes'
        }
      }
    );
    console.log('✅ Security event logged successfully');

    // Test 7: Get Audit Trail
    console.log('\n7. Testing Audit Trail Retrieval...');
    
    const auditTrail = await AuditLogger.getAuditTrail('user-123', {
      limit: 10
    });
    console.log(`✅ Retrieved ${auditTrail.length} audit log entries`);

    // Test 8: Get Audit Summary
    console.log('\n8. Testing Audit Summary...');
    
    const auditSummary = await AuditLogger.getAuditSummary();
    console.log(`✅ Audit summary: ${auditSummary.totalLogs} total logs, ${auditSummary.securityEvents} security events`);
    console.log(`   - Failed attempts: ${auditSummary.failedAttempts}`);
    console.log(`   - Recent activity entries: ${auditSummary.recentActivity.length}`);

    // Test 9: Clean up old logs (test with 0 days to clean nothing)
    console.log('\n9. Testing Audit Log Cleanup...');
    
    const cleanedCount = await AuditLogger.cleanupOldLogs(0);
    console.log(`✅ Cleanup would remove ${cleanedCount} logs (test run)`);

    // Test 10: Get Audit Statistics
    console.log('\n10. Testing Audit Statistics...');
    
    const auditStats = await AuditLogger.getAuditStatistics();
    console.log(`✅ Audit statistics: ${auditStats.totalLogs} total logs`);
    console.log(`   - Today: ${auditStats.logsToday}`);
    console.log(`   - This week: ${auditStats.logsThisWeek}`);
    console.log(`   - This month: ${auditStats.logsThisMonth}`);
    console.log(`   - Top actions: ${auditStats.topActions.slice(0, 3).map(a => `${a.action} (${a.count})`).join(', ')}`);

    // Test 11: Validate Audit Integrity
    console.log('\n11. Testing Audit Integrity Validation...');
    
    const integrityCheck = await AuditLogger.validateAuditIntegrity();
    console.log(`✅ Audit integrity: ${integrityCheck.isValid ? 'VALID' : 'INVALID'}`);
    console.log(`   - Checked: ${integrityCheck.totalChecked} entries`);
    if (integrityCheck.issues.length > 0) {
      console.log(`   - Issues: ${integrityCheck.issues.join(', ')}`);
    }

    // Test 12: Export Audit Logs (JSON format)
    console.log('\n12. Testing Audit Log Export...');
    
    const exportedLogs = await AuditLogger.exportAuditLogs({
      limit: 5,
      format: 'json'
    });
    const parsedExport = JSON.parse(exportedLogs);
    console.log(`✅ Exported ${parsedExport.length} logs in JSON format`);

    console.log('\n🎉 All Audit Logging tests completed successfully!');
    
    // Display recent audit activity
    if (auditTrail.length > 0) {
      console.log('\n📊 Recent Audit Activity:');
      auditTrail.slice(0, 5).forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.action} by ${entry.userId} at ${entry.createdAt.toISOString()}`);
      });
    }

  } catch (error) {
    console.error('❌ Audit Logger test failed:', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testAuditLogger();
}

export { testAuditLogger };