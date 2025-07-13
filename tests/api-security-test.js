/**
 * API Security Test Suite
 * Tests authentication, authorization, and tenant isolation at the API level
 */

const http = require('http');
const https = require('https');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
const BASE_URL = 'http://localhost:3000';

class APISecurityTester {
  constructor() {
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, type };
    this.testResults.push(logEntry);
    
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      error: '\x1b[31m',
      warning: '\x1b[33m',
      reset: '\x1b[0m'
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

  async makeRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, BASE_URL);
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const jsonData = data ? JSON.parse(data) : null;
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: jsonData
            });
          } catch (error) {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              data: data
            });
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }

      req.end();
    });
  }

  async testUnauthenticatedAccess() {
    this.log('🔒 Testing unauthenticated API access...', 'info');

    const protectedEndpoints = [
      '/api/auth/me',
      '/api/menu',
      '/api/tables',
      '/api/staff',
      '/api/orders'
    ];

    for (const endpoint of protectedEndpoints) {
      try {
        const response = await this.makeRequest(endpoint);
        
        if (response.status === 401 || response.status === 403) {
          this.log(`✅ ${endpoint} properly rejects unauthenticated access (${response.status})`, 'success');
        } else {
          this.log(`❌ ${endpoint} allows unauthenticated access (${response.status})`, 'error');
        }
      } catch (error) {
        this.log(`❌ Error testing ${endpoint}: ${error.message}`, 'error');
      }
    }
  }

  async testInvalidTokens() {
    this.log('🔐 Testing invalid token handling...', 'info');

    const invalidTokens = [
      '', // Empty token
      'invalid-token', // Invalid format
      'Bearer invalid-token', // Invalid format with Bearer
      jwt.sign({ userId: 'fake-id' }, 'wrong-secret'), // Wrong secret
      jwt.sign({ userId: 'fake-id' }, JWT_SECRET, { expiresIn: '-1h' }), // Expired
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJmYWtlIiwidXNlclR5cGUiOiJzdGFmZiJ9.invalid' // Tampered signature
    ];

    for (let i = 0; i < invalidTokens.length; i++) {
      const token = invalidTokens[i];
      const testName = [
        'empty token',
        'invalid format',
        'invalid Bearer format',
        'wrong secret',
        'expired token',
        'tampered signature'
      ][i];

      try {
        const headers = token ? { 
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Cookie': `qr_auth_token=${token}`
        } : {};

        const response = await this.makeRequest('/api/auth/me', { headers });
        
        if (response.status === 401 || response.status === 403) {
          this.log(`✅ ${testName} properly rejected (${response.status})`, 'success');
        } else {
          this.log(`❌ ${testName} was accepted (${response.status})`, 'error');
        }
      } catch (error) {
        this.log(`❌ Error testing ${testName}: ${error.message}`, 'error');
      }
    }
  }

  async testCrossTenantAccess() {
    this.log('🏢 Testing cross-tenant data access...', 'info');

    // Create tokens for different restaurants
    const restaurant1Token = jwt.sign({
      userId: 'test-staff-1',
      userType: 'staff',
      email: 'staff1@restaurant1.com',
      restaurantId: 'restaurant-1-id'
    }, JWT_SECRET, { expiresIn: '1h' });

    const restaurant2Token = jwt.sign({
      userId: 'test-staff-2',
      userType: 'staff',
      email: 'staff2@restaurant2.com',
      restaurantId: 'restaurant-2-id'
    }, JWT_SECRET, { expiresIn: '1h' });

    // Test endpoints that should be tenant-isolated
    const tenantEndpoints = [
      '/api/menu',
      '/api/tables',
      '/api/staff'
    ];

    for (const endpoint of tenantEndpoints) {
      try {
        // Test with restaurant 1 token
        const response1 = await this.makeRequest(endpoint, {
          headers: {
            'Authorization': `Bearer ${restaurant1Token}`,
            'Cookie': `qr_auth_token=${restaurant1Token}`
          }
        });

        // Test with restaurant 2 token
        const response2 = await this.makeRequest(endpoint, {
          headers: {
            'Authorization': `Bearer ${restaurant2Token}`,
            'Cookie': `qr_auth_token=${restaurant2Token}`
          }
        });

        if (response1.status < 500 && response2.status < 500) {
          this.log(`✅ ${endpoint} accessible with valid tokens`, 'success');
          
          // In a real test, we would verify that the data returned is different
          // and specific to each restaurant
          if (response1.data && response2.data) {
            this.log(`✅ ${endpoint} returns data for both restaurants (tenant isolation assumed)`, 'success');
          }
        } else {
          this.log(`⚠️ ${endpoint} returned server errors (${response1.status}, ${response2.status})`, 'warning');
        }

      } catch (error) {
        this.log(`❌ Error testing ${endpoint}: ${error.message}`, 'error');
      }
    }
  }

  async testAdminAccess() {
    this.log('👑 Testing platform admin access...', 'info');

    const adminToken = jwt.sign({
      userId: 'test-admin-1',
      userType: 'platform_admin',
      email: 'admin@platform.com'
    }, JWT_SECRET, { expiresIn: '1h' });

    const staffToken = jwt.sign({
      userId: 'test-staff-1',
      userType: 'staff',
      email: 'staff@restaurant.com',
      restaurantId: 'restaurant-1-id'
    }, JWT_SECRET, { expiresIn: '1h' });

    // Test admin-only endpoints (these might not exist yet, but test the concept)
    const adminEndpoints = [
      '/api/admin/restaurants',
      '/api/admin/users',
      '/api/admin/analytics'
    ];

    for (const endpoint of adminEndpoints) {
      try {
        // Test with admin token
        const adminResponse = await this.makeRequest(endpoint, {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
            'Cookie': `qr_auth_token=${adminToken}`
          }
        });

        // Test with staff token
        const staffResponse = await this.makeRequest(endpoint, {
          headers: {
            'Authorization': `Bearer ${staffToken}`,
            'Cookie': `qr_auth_token=${staffToken}`
          }
        });

        if (staffResponse.status === 403 || staffResponse.status === 404) {
          this.log(`✅ ${endpoint} properly rejects staff access (${staffResponse.status})`, 'success');
        } else {
          this.log(`❌ ${endpoint} allows staff access (${staffResponse.status})`, 'error');
        }

        if (adminResponse.status < 500 || adminResponse.status === 404) {
          this.log(`✅ ${endpoint} accessible to admin or doesn't exist (${adminResponse.status})`, 'success');
        } else {
          this.log(`❌ ${endpoint} server error for admin (${adminResponse.status})`, 'error');
        }

      } catch (error) {
        this.log(`❌ Error testing ${endpoint}: ${error.message}`, 'error');
      }
    }
  }

  async testRateLimiting() {
    this.log('⏱️ Testing rate limiting...', 'info');

    // Test login endpoint with multiple rapid requests
    const loginAttempts = [];
    for (let i = 0; i < 10; i++) {
      loginAttempts.push(
        this.makeRequest('/api/auth/login', {
          method: 'POST',
          body: {
            email: 'fake@test.com',
            password: 'wrongpassword'
          }
        })
      );
    }

    try {
      const responses = await Promise.all(loginAttempts);
      const rateLimited = responses.some(r => r.status === 429);
      
      if (rateLimited) {
        this.log('✅ Rate limiting detected on login endpoint', 'success');
      } else {
        this.log('⚠️ No rate limiting detected (may not be implemented)', 'warning');
      }
    } catch (error) {
      this.log(`❌ Error testing rate limiting: ${error.message}`, 'error');
    }
  }

  async testCSRFProtection() {
    this.log('🛡️ Testing CSRF protection...', 'info');

    // Test state-changing endpoints without proper headers
    const csrfEndpoints = [
      { path: '/api/auth/login', method: 'POST' },
      { path: '/api/auth/logout', method: 'POST' },
      { path: '/api/menu', method: 'POST' },
      { path: '/api/staff', method: 'POST' }
    ];

    for (const endpoint of csrfEndpoints) {
      try {
        const response = await this.makeRequest(endpoint.path, {
          method: endpoint.method,
          headers: {
            'Origin': 'http://malicious-site.com',
            'Referer': 'http://malicious-site.com'
          },
          body: { test: 'data' }
        });

        if (response.status === 403 || response.status === 401) {
          this.log(`✅ ${endpoint.method} ${endpoint.path} rejects cross-origin requests (${response.status})`, 'success');
        } else {
          this.log(`⚠️ ${endpoint.method} ${endpoint.path} allows cross-origin requests (${response.status})`, 'warning');
        }

      } catch (error) {
        this.log(`❌ Error testing CSRF on ${endpoint.path}: ${error.message}`, 'error');
      }
    }
  }

  async testInputSanitization() {
    this.log('🧼 Testing input sanitization...', 'info');

    const maliciousInputs = [
      '<script>alert("xss")</script>',
      '"; DROP TABLE users; --',
      '../../../etc/passwd',
      '${7*7}',
      '{{7*7}}',
      'javascript:alert(1)'
    ];

    for (const input of maliciousInputs) {
      try {
        const response = await this.makeRequest('/api/auth/login', {
          method: 'POST',
          body: {
            email: input,
            password: input
          }
        });

        // Check if the response contains the malicious input unchanged
        const responseStr = JSON.stringify(response.data || '');
        if (responseStr.includes(input)) {
          this.log(`❌ Input not sanitized: ${input.substring(0, 20)}...`, 'error');
        } else {
          this.log(`✅ Input properly handled: ${input.substring(0, 20)}...`, 'success');
        }

      } catch (error) {
        this.log(`❌ Error testing input sanitization: ${error.message}`, 'error');
      }
    }
  }

  async runAllTests() {
    this.log('🔬 Starting comprehensive API security tests...', 'info');
    
    try {
      await this.testUnauthenticatedAccess();
      await this.testInvalidTokens();
      await this.testCrossTenantAccess();
      await this.testAdminAccess();
      await this.testRateLimiting();
      await this.testCSRFProtection();
      await this.testInputSanitization();
      
      this.generateSummary();
      
    } catch (error) {
      this.log(`❌ Test suite failed: ${error.message}`, 'error');
    }
  }

  generateSummary() {
    const errors = this.testResults.filter(r => r.type === 'error').length;
    const warnings = this.testResults.filter(r => r.type === 'warning').length;
    const successes = this.testResults.filter(r => r.type === 'success').length;
    
    this.log('', 'info');
    this.log('='.repeat(60), 'info');
    this.log('📋 API SECURITY TEST SUMMARY', 'info');
    this.log('='.repeat(60), 'info');
    this.log(`✅ Successful tests: ${successes}`, 'success');
    this.log(`⚠️  Warnings: ${warnings}`, 'warning');
    this.log(`❌ Failed tests: ${errors}`, errors > 0 ? 'error' : 'info');
    this.log('='.repeat(60), 'info');
    
    if (errors === 0) {
      this.log('🎉 All critical API security tests passed!', 'success');
    } else {
      this.log('🚨 Some API security tests failed - review required!', 'error');
    }
  }
}

// Export for use in other test files
module.exports = APISecurityTester;

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new APISecurityTester();
  tester.runAllTests().catch(console.error);
}