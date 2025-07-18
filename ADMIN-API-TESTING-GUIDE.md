# Admin API Testing Guide

## Overview

This guide provides comprehensive testing for the RBAC Admin API endpoints implemented in Phase 4.1.1. The testing suite covers all CRUD operations, authentication, authorization, error handling, and audit logging for dynamic permission management.

## Test Coverage

### 🔐 **Permission Management API** (`/api/admin/permissions`)
- **GET** - List all permissions with pagination, filtering, and search
- **POST** - Create new permissions with validation
- **PUT** - Update existing permissions
- **DELETE** - Soft delete permissions with conflict checking

### 🎭 **Role Template Management API** (`/api/admin/role-templates`)
- **GET** - List all role templates with permissions and usage statistics
- **POST** - Create new custom role templates
- **PUT** - Update role template permissions (add/remove/replace)

### 👤 **Individual Role Template API** (`/api/admin/role-templates/[template]`)
- **GET** - Get detailed role template information with analytics
- **PUT** - Update specific role template permissions
- **DELETE** - Delete custom role templates (with protection for built-in templates)

### 👥 **User Role Management API** (`/api/admin/users`)
- **GET** - List all users with RBAC role information and backward compatibility
- **POST** - Assign roles to users with validation
- **PUT** - Update user roles and permissions
- **DELETE** - Remove user roles with safety checks

## Test Setup and Installation

### Prerequisites
```bash
# Install test dependencies
npm install --save-dev \
  jest@^29.7.0 \
  @types/jest@^29.5.8 \
  @testing-library/jest-dom@^6.1.4 \
  @testing-library/react@^14.1.2 \
  babel-jest@^29.7.0 \
  jest-environment-node@^29.7.0
```

### Configuration Files
- `jest.config.js` - Main Jest configuration
- `jest.setup.js` - Test setup and mocks
- `src/lib/test-utils.ts` - Comprehensive test utilities and mock factories

### Test Commands
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run only admin API tests
npm run test:admin

# Run only RBAC tests
npm run test:rbac

# Run tests for CI/CD
npm run test:ci
```

## Test Structure

### Test Files Location
```
src/app/api/admin/
├── permissions/
│   └── __tests__/
│       └── route.test.ts
├── role-templates/
│   ├── __tests__/
│   │   └── route.test.ts
│   └── [template]/
│       └── __tests__/
│           └── route.test.ts
└── users/
    └── __tests__/
        └── route.test.ts
```

### Test Utilities
- **Mock Factories**: Pre-configured mock data for permissions, roles, users
- **Request Helpers**: Utilities for creating mock NextRequest objects
- **Database Mocks**: Comprehensive Prisma client mocking
- **Authentication Mocks**: RBAC middleware and legacy auth mocking
- **Audit Logging**: Mock audit trail verification

## Test Categories

### 1. **Authentication & Authorization Tests**
- ✅ RBAC middleware protection
- ✅ Platform admin access control
- ✅ Backward compatibility with legacy authentication
- ✅ Rate limiting validation
- ✅ JWT token validation

### 2. **CRUD Operation Tests**
- ✅ Create operations with validation
- ✅ Read operations with pagination and filtering
- ✅ Update operations with change tracking
- ✅ Delete operations with safety checks
- ✅ Bulk operations and transactions

### 3. **Validation Tests**
- ✅ Input validation and sanitization
- ✅ Business rule enforcement
- ✅ Data consistency checks
- ✅ Permission hierarchy validation
- ✅ Restaurant context validation

### 4. **Error Handling Tests**
- ✅ Database connection failures
- ✅ Invalid input handling
- ✅ Resource not found scenarios
- ✅ Conflict resolution
- ✅ Transaction rollback testing

### 5. **Audit & Security Tests**
- ✅ Audit log creation
- ✅ Security event logging
- ✅ Change tracking
- ✅ IP address logging
- ✅ User agent capture

## Running Tests

### Development Testing
```bash
# Run specific test file
npm test -- src/app/api/admin/permissions/__tests__/route.test.ts

# Run tests with specific pattern
npm test -- --testNamePattern="should create new permission"

# Run tests with verbose output
npm test -- --verbose

# Run tests with coverage for specific directory
npm test -- --coverage src/app/api/admin/permissions
```

### CI/CD Testing
```bash
# Run all tests with coverage (CI mode)
npm run test:ci

# Generate coverage report
npm run test:coverage

# Check test results
echo $? # Exit code: 0 = success, 1 = failure
```

## Test Scenarios

### Permission Management Tests
- **Create Permission**: Validates format, prevents duplicates
- **List Permissions**: Pagination, filtering, search functionality
- **Update Permission**: Change tracking, cache invalidation
- **Delete Permission**: Soft delete, conflict checking, audit logging

### Role Template Tests
- **Template Creation**: Custom templates, validation, permission assignment
- **Template Updates**: Add/remove/replace permissions, user cache clearing
- **Template Deletion**: Built-in protection, user assignment checks
- **Usage Analytics**: User count, recent activity tracking

### User Role Tests
- **Role Assignment**: User validation, restaurant context, permission validation
- **Role Updates**: Change tracking, permission cache clearing
- **Role Deletion**: Safety checks, audit logging
- **User Listing**: RBAC integration, backward compatibility

### Integration Tests
- **Cross-API Validation**: Permission-role-user relationships
- **Database Transactions**: Atomic operations, rollback testing
- **Cache Management**: Permission cache invalidation
- **Audit Trail**: Complete audit log verification

## Coverage Reports

### Expected Coverage Metrics
- **Line Coverage**: > 90%
- **Branch Coverage**: > 85%
- **Function Coverage**: > 95%
- **Statement Coverage**: > 90%

### Coverage Output
```bash
# Generate HTML coverage report
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html
```

## Mock Data and Fixtures

### Test Data Factory
```typescript
// Create test permission
const permission = testDataFactory.permission({
  permissionKey: 'test:permission',
  category: 'test'
});

// Create test role template
const roleTemplate = testDataFactory.roleTemplate({
  template: 'test_template',
  permissions: ['test:permission']
});

// Create test user role
const userRole = testDataFactory.userRole({
  userId: 'user123',
  roleTemplate: 'test_template'
});
```

### Mock Authentication
```typescript
// Mock authorized admin
RBACMiddleware.protect.mockResolvedValue(mockAuthorizedResult);

// Mock unauthorized access
RBACMiddleware.protect.mockResolvedValue(mockUnauthorizedResult);

// Mock legacy authentication
verifyAuthToken.mockResolvedValue({
  isValid: true,
  user: mockPlatformAdmin
});
```

## Troubleshooting

### Common Issues
1. **Database Connection**: Ensure test database is configured
2. **Mock Imports**: Check all dependencies are properly mocked
3. **Async Operations**: Use proper async/await in tests
4. **Memory Leaks**: Clear mocks in beforeEach/afterEach
5. **Test Isolation**: Ensure tests don't depend on each other

### Debug Commands
```bash
# Run tests with debug output
npm test -- --verbose --no-coverage

# Run single test file with debugging
npm test -- --testTimeout=10000 src/app/api/admin/permissions/__tests__/route.test.ts

# Check test setup
npm test -- --listTests
```

## Best Practices

### Test Organization
- Group related tests in `describe` blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Keep tests focused and independent

### Mock Management
- Clear all mocks before each test
- Use factory functions for consistent test data
- Mock external dependencies completely
- Avoid testing implementation details

### Error Testing
- Test both success and failure scenarios
- Verify error messages and status codes
- Test edge cases and boundary conditions
- Ensure proper error handling

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Test Admin APIs
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
      - uses: codecov/codecov-action@v1
```

### Pre-commit Hooks
```json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "npm run test:admin",
      "eslint --fix",
      "prettier --write"
    ]
  }
}
```

## Performance Testing

### Test Execution Time
- Individual test files should complete within 5 seconds
- Full test suite should complete within 30 seconds
- Use `--maxWorkers=4` for parallel execution

### Memory Usage
- Monitor memory usage during test execution
- Clear large objects after tests
- Use `--forceExit` if tests hang

## Security Testing

### Authentication Tests
- Verify all endpoints require authentication
- Test token validation and expiration
- Ensure proper role-based access control

### Input Validation
- Test SQL injection prevention
- Validate XSS protection
- Check for proper input sanitization

### Audit Logging
- Verify all administrative actions are logged
- Check audit log completeness
- Test log tampering protection

## Maintenance

### Regular Updates
- Update test data when schema changes
- Refresh mock implementations
- Update coverage thresholds
- Review and update test scenarios

### Performance Monitoring
- Track test execution times
- Monitor coverage trends
- Identify slow or flaky tests
- Optimize test performance

---

**Phase 4.1.1 Testing Status**: ✅ **COMPLETED**

All admin API endpoints have comprehensive test coverage including:
- 🔐 Authentication and authorization
- 📝 CRUD operations with validation
- 🛡️ Error handling and edge cases
- 📊 Audit logging and security events
- 🔄 Backward compatibility
- 📈 Performance and integration testing

The testing framework provides a solid foundation for continued development and ensures the RBAC system maintains high quality and security standards.