# RBAC System Documentation
## QR Restaurant System - Role-Based Access Control

**Version**: 1.0  
**Last Updated**: 2025-01-17  
**Status**: Production Ready

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [User Types & Roles](#user-types--roles)
4. [Permission System](#permission-system)
5. [Authentication & Sessions](#authentication--sessions)
6. [API Reference](#api-reference)
7. [Database Schema](#database-schema)
8. [Security Features](#security-features)
9. [Migration Guide](#migration-guide)
10. [Troubleshooting](#troubleshooting)
11. [Maintenance](#maintenance)

---

## System Overview

### Purpose
The RBAC (Role-Based Access Control) system provides enterprise-grade security and access management for the QR Restaurant System. It replaces the legacy cookie-based authentication with a comprehensive permission-based system that supports role switching, audit logging, and granular access control.

### Key Features
- **Single JWT Token**: Unified authentication using enhanced JWT payload
- **Role Switching**: Users can switch between available roles within a single session
- **Granular Permissions**: Fine-grained access control with 50+ permissions across 9 categories
- **Audit Logging**: Complete activity trail for compliance and security monitoring
- **Session Management**: Secure session handling with automatic cleanup
- **Restaurant Context**: Multi-restaurant support with proper scope isolation

### Benefits
- ✅ **Enhanced Security**: Eliminates session mixing vulnerabilities
- ✅ **Improved UX**: Seamless role switching without logout/login
- ✅ **Scalability**: Supports multi-restaurant and franchise operations
- ✅ **Compliance**: Complete audit trail for regulatory requirements
- ✅ **Maintainability**: Centralized permission management

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Application                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Role      │  │  Permission │  │      Role Switcher      │ │
│  │   Provider  │  │   Guards    │  │      Component         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Enhanced JWT  │
                    │   Middleware    │
                    │   (validates    │
                    │   permissions)  │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Auth Service  │
                    │   V2 (handles   │
                    │   authentication│
                    │   & role mgmt)  │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Database      │
                    │   (RBAC schema  │
                    │   with audit    │
                    │   logging)      │
                    └─────────────────┘
```

### Data Flow

1. **Authentication**: User provides credentials, system validates and creates session
2. **Token Generation**: Enhanced JWT token created with user, role, and permission context
3. **Permission Checking**: Middleware validates permissions for each request
4. **Role Switching**: User can switch roles, triggering token regeneration and audit logging
5. **Session Management**: Sessions tracked and managed with automatic cleanup

---

## User Types & Roles

### User Type Hierarchy

```
Platform Admin (Super Admin)
├── Restaurant Owner
│   ├── Manager
│   ├── Kitchen Staff
│   └── Server Staff
```

### Role Templates

#### 1. Platform Admin
**User Type**: `platform_admin`  
**Template**: `platform_admin`  
**Scope**: Platform-wide  
**Key Capabilities**:
- Manage all restaurants
- Create/delete restaurant accounts
- Access platform analytics
- Manage billing and subscriptions
- Full user management

**Permissions**: 15+ including:
- `platform:read`, `platform:write`, `platform:delete`
- `restaurants:create`, `restaurants:delete`
- `users:read`, `users:write`, `users:delete`
- `analytics:platform`

#### 2. Restaurant Owner
**User Type**: `restaurant_owner`  
**Template**: `restaurant_owner`  
**Scope**: Specific restaurant(s)  
**Key Capabilities**:
- Full restaurant management
- Staff management (create, edit, delete)
- Access to all restaurant data
- Billing and settings access

**Permissions**: 18+ including:
- `restaurant:read`, `restaurant:write`, `restaurant:settings`
- `staff:read`, `staff:write`, `staff:invite`, `staff:delete`, `staff:roles`
- `orders:read`, `orders:write`, `orders:fulfill`
- `analytics:read`, `analytics:export`

#### 3. Manager
**User Type**: `staff`  
**Template**: `manager`  
**Scope**: Specific restaurant  
**Key Capabilities**:
- Restaurant operations management
- View staff (cannot edit/delete)
- Order and table management
- Basic analytics access

**Permissions**: 11+ including:
- `restaurant:read`
- `orders:read`, `orders:write`, `orders:fulfill`
- `tables:read`, `tables:write`, `tables:qr`
- `staff:read` (view only)
- `analytics:read`

#### 4. Kitchen Staff
**User Type**: `staff`  
**Template**: `kitchen_staff`  
**Scope**: Specific restaurant  
**Key Capabilities**:
- Kitchen display access
- Order status updates
- Menu item viewing

**Permissions**: 4 including:
- `orders:read`, `orders:kitchen`, `orders:update`
- `menu:read`

#### 5. Server Staff
**User Type**: `staff`  
**Template**: `server_staff`  
**Scope**: Specific restaurant  
**Key Capabilities**:
- Take and manage orders
- Table management
- QR code generation

**Permissions**: 6 including:
- `orders:read`, `orders:write`, `orders:fulfill`
- `tables:read`, `tables:qr`
- `menu:read`

---

## Permission System

### Permission Categories

1. **Platform** (3 permissions): Platform management and settings
2. **Restaurant** (7 permissions): Restaurant-specific operations
3. **Orders** (8 permissions): Order management and processing
4. **Tables** (4 permissions): Table and QR code management
5. **Staff** (5 permissions): Staff and role management
6. **Analytics** (3 permissions): Reports and data export
7. **Menu** (4 permissions): Menu item management
8. **Settings** (3 permissions): Configuration management
9. **Billing** (4 permissions): Billing and subscription management

### Permission Naming Convention

```
<category>:<action>
```

**Examples**:
- `orders:read` - View orders
- `orders:write` - Create/edit orders
- `orders:kitchen` - Kitchen display access
- `staff:roles` - Manage staff roles
- `analytics:export` - Export data

### Permission Inheritance

Permissions are **additive** - users with multiple roles receive the combined permissions of all their active roles. Custom permissions can be added to override or extend template permissions.

### Permission Checking

```typescript
// Component-level permission checking
<PermissionGuard permission="orders:write">
  <CreateOrderButton />
</PermissionGuard>

// Hook-based permission checking
const { hasPermission } = useRole();
if (hasPermission('staff:write')) {
  // Show staff management UI
}

// API-level permission checking (automatic via middleware)
// Route: /api/staff → Requires: staff:read
// Route: /api/orders → Requires: orders:read
```

---

## Authentication & Sessions

### Enhanced JWT Payload

```typescript
interface EnhancedJWTPayload {
  // User Identity
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  
  // Role & Context
  currentRole: UserRole;
  availableRoles: UserRole[];
  restaurantContext?: RestaurantContext;
  
  // Permissions (computed)
  permissions: string[];
  
  // Session Management
  sessionId: string;
  
  // JWT Standard Claims
  iat: number;
  exp: number;
  iss: string;
  sub: string;
}
```

### Session Lifecycle

1. **Creation**: Session created on successful authentication
2. **Validation**: Each request validates session existence and expiration
3. **Activity Tracking**: Last activity timestamp updated on each request
4. **Role Updates**: Session updated when user switches roles
5. **Cleanup**: Expired sessions automatically removed

### Cookie Configuration

```typescript
Cookie Name: 'qr_auth_token'
HttpOnly: true
Secure: true (production)
SameSite: 'lax'
MaxAge: 24 hours
Path: '/'
```

### Security Features

- **Token Rotation**: New token generated on role switch
- **Session Validation**: Server-side session verification
- **Automatic Cleanup**: Expired session removal
- **IP Tracking**: IP address logged for audit trail
- **User Agent Tracking**: Device information for security monitoring

---

## API Reference

### Authentication Endpoints

#### POST /api/auth/login
Authenticate user and create session.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password",
  "restaurantSlug": "optional-restaurant-slug"
}
```

**Response**:
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "currentRole": {
      "id": "uuid",
      "userType": "restaurant_owner",
      "roleTemplate": "restaurant_owner",
      "restaurantId": "uuid"
    },
    "availableRoles": [...],
    "permissions": ["restaurant:read", "orders:write", ...]
  },
  "restaurant": {
    "id": "uuid",
    "name": "Restaurant Name",
    "slug": "restaurant-slug"
  }
}
```

#### POST /api/auth/switch-role
Switch user's active role.

**Request**:
```json
{
  "newRoleId": "uuid"
}
```

**Response**:
```json
{
  "message": "Role switched successfully",
  "currentRole": {
    "id": "uuid",
    "roleTemplate": "manager"
  },
  "permissions": ["restaurant:read", "orders:read", ...]
}
```

#### GET /api/auth/me
Get current user information.

**Response**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "currentRole": {...},
    "availableRoles": [...],
    "permissions": [...],
    "sessionId": "uuid"
  },
  "restaurant": {...}
}
```

#### POST /api/auth/logout
Invalidate current session.

**Response**:
```json
{
  "message": "Logout successful"
}
```

### Admin Endpoints

#### GET /api/admin/permissions
Get all permissions (requires `admin:permissions:read`).

#### GET /api/admin/role-templates
Get all role templates (requires `admin:roles:read`).

#### PUT /api/admin/role-templates/:template
Update role template permissions (requires `admin:roles:write`).

#### GET /api/admin/audit-logs
Get audit logs (requires `admin:audit:read`).

---

## Database Schema

### Core RBAC Tables

#### user_roles
```sql
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_type VARCHAR(50) NOT NULL, -- 'restaurant_owner', 'staff', 'platform_admin'
    restaurant_id UUID, -- NULL for platform admins
    role_template VARCHAR(100) NOT NULL,
    custom_permissions JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);
```

#### permissions
```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### role_permissions
```sql
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_template VARCHAR(100) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    granted_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (permission_key) REFERENCES permissions(permission_key)
);
```

#### audit_logs
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(200),
    from_role VARCHAR(100),
    to_role VARCHAR(100),
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### user_sessions
```sql
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    current_role_id UUID NOT NULL,
    restaurant_context_id UUID,
    jwt_token_hash VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (current_role_id) REFERENCES user_roles(id),
    FOREIGN KEY (restaurant_context_id) REFERENCES restaurants(id)
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_restaurant_id ON user_roles(restaurant_id);
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

---

## Security Features

### Access Control

1. **Route Protection**: Middleware enforces permissions on all protected routes
2. **API Security**: All API endpoints require appropriate permissions
3. **Component Guards**: UI components conditionally render based on permissions
4. **SQL Injection Prevention**: Parameterized queries and ORM usage
5. **XSS Protection**: Input sanitization and output encoding

### Session Security

1. **Secure Cookies**: HttpOnly, Secure, SameSite attributes
2. **Token Validation**: JWT signature verification and expiration checking
3. **Session Binding**: Tokens tied to specific sessions in database
4. **Activity Tracking**: Last activity monitoring for session timeout
5. **Concurrent Session Management**: Multiple device support with proper isolation

### Audit & Monitoring

1. **Complete Audit Trail**: All authentication and role changes logged
2. **Permission Denied Logging**: Failed access attempts recorded
3. **Session Analytics**: Login patterns and session duration tracking
4. **Security Event Monitoring**: Suspicious activity detection
5. **Data Export**: Audit logs can be exported for compliance

### Data Protection

1. **Encryption at Rest**: Database encryption for sensitive data
2. **Encryption in Transit**: HTTPS/TLS for all communications
3. **Password Security**: Bcrypt hashing with salt
4. **Data Minimization**: Only necessary data stored in tokens
5. **GDPR Compliance**: User data handling follows privacy regulations

---

## Migration Guide

### Pre-Migration Checklist

- [ ] Database backup completed
- [ ] Application backup completed
- [ ] Test environment validated
- [ ] Migration scripts reviewed
- [ ] Rollback plan prepared
- [ ] Team notified of maintenance window

### Migration Process

1. **Backup**: Create full database backup
2. **Schema Migration**: Run Prisma migrations to create RBAC tables
3. **Data Seeding**: Populate permissions and role templates
4. **User Migration**: Convert existing users to RBAC system
5. **Verification**: Run comprehensive verification tests
6. **Configuration**: Update environment variables
7. **Testing**: Validate all functionality works correctly

### Post-Migration Tasks

- [ ] Verify all users can login
- [ ] Test role switching functionality
- [ ] Confirm permission enforcement
- [ ] Check audit logging
- [ ] Monitor system performance
- [ ] Update documentation

### Rollback Procedure

If issues are encountered:

1. **Immediate**: Use `scripts/rollback-rbac.sh`
2. **Database**: Restore from pre-migration backup
3. **Configuration**: Revert environment variables
4. **Verification**: Test legacy system functionality
5. **Communication**: Notify stakeholders of rollback

---

## Troubleshooting

### Common Issues

#### Authentication Failures

**Symptom**: Users cannot login  
**Possible Causes**:
- Database connection issues
- JWT secret misconfiguration
- Session table corruption

**Resolution**:
1. Check database connectivity
2. Verify JWT_SECRET environment variable
3. Check user_sessions table for orphaned sessions
4. Review application logs for specific errors

#### Permission Denied Errors

**Symptom**: Users get "Insufficient permissions" errors  
**Possible Causes**:
- Missing role assignments
- Incorrect permission mappings
- Middleware configuration issues

**Resolution**:
1. Check user_roles table for user's active roles
2. Verify role_permissions table for role's permissions
3. Check middleware route permission mappings
4. Review audit_logs for permission denied entries

#### Role Switching Problems

**Symptom**: Role switching fails or doesn't update UI  
**Possible Causes**:
- Session management issues
- Token regeneration failures
- Client-side cache problems

**Resolution**:
1. Check user_sessions table for session validity
2. Verify available roles for user
3. Clear browser cache and cookies
4. Check network requests for errors

#### Performance Issues

**Symptom**: Slow authentication or permission checking  
**Possible Causes**:
- Missing database indexes
- Complex permission computations
- Excessive audit logging

**Resolution**:
1. Check database query performance
2. Verify indexes are created
3. Review permission computation logic
4. Consider permission caching

### Debug Tools

#### Database Queries

```sql
-- Check user's roles
SELECT * FROM user_roles WHERE user_id = 'user-uuid';

-- Check role permissions
SELECT rp.*, p.description 
FROM role_permissions rp 
JOIN permissions p ON rp.permission_key = p.permission_key 
WHERE rp.role_template = 'role-template';

-- Check active sessions
SELECT * FROM user_sessions WHERE user_id = 'user-uuid' AND expires_at > NOW();

-- Check recent audit logs
SELECT * FROM audit_logs WHERE user_id = 'user-uuid' ORDER BY created_at DESC LIMIT 10;
```

#### API Testing

```bash
# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Test user info
curl http://localhost:3000/api/auth/me \
  -H "Cookie: qr_auth_token=JWT_TOKEN"

# Test role switching
curl -X POST http://localhost:3000/api/auth/switch-role \
  -H "Content-Type: application/json" \
  -H "Cookie: qr_auth_token=JWT_TOKEN" \
  -d '{"newRoleId":"role-uuid"}'
```

### Monitoring & Alerts

#### Key Metrics to Monitor

1. **Authentication Rate**: Successful vs failed logins
2. **Session Duration**: Average session length
3. **Permission Denials**: Failed access attempts
4. **Role Switches**: Frequency of role changes
5. **Token Validation Time**: JWT processing performance

#### Alert Thresholds

- Authentication failure rate > 10%
- Permission denial rate > 5%
- Session creation failure rate > 1%
- JWT validation time > 100ms
- Database query time > 500ms

---

## Maintenance

### Regular Tasks

#### Daily
- [ ] Monitor application logs for errors
- [ ] Check authentication metrics
- [ ] Review permission denial alerts

#### Weekly
- [ ] Clean up expired sessions
- [ ] Review audit logs for anomalies
- [ ] Check database performance metrics

#### Monthly
- [ ] Audit user role assignments
- [ ] Review permission template changes
- [ ] Update security documentation
- [ ] Performance optimization review

### Database Maintenance

#### Session Cleanup
```sql
-- Remove expired sessions (automated via cron job)
DELETE FROM user_sessions WHERE expires_at < NOW();
```

#### Audit Log Archival
```sql
-- Archive old audit logs (keep 1 year)
DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '1 year';
```

#### Performance Optimization
```sql
-- Analyze table statistics
ANALYZE user_roles, permissions, role_permissions, audit_logs, user_sessions;

-- Check index usage
SELECT schemaname, tablename, attname, n_distinct, correlation 
FROM pg_stats 
WHERE tablename IN ('user_roles', 'permissions', 'audit_logs', 'user_sessions');
```

### Security Updates

#### Regular Reviews
- [ ] Review and update permission definitions
- [ ] Audit role template assignments
- [ ] Check for unused permissions
- [ ] Validate user access patterns
- [ ] Update security policies

#### Emergency Procedures
- [ ] Immediate session invalidation procedures
- [ ] User account lockout procedures
- [ ] Security incident response plan
- [ ] Data breach notification procedures

### Backup & Recovery

#### Backup Strategy
- **Daily**: Automated database backups
- **Weekly**: Full system backups
- **Monthly**: Archive backups for compliance

#### Recovery Procedures
1. **Identify**: Determine scope of issue
2. **Isolate**: Prevent further damage
3. **Restore**: Use appropriate backup
4. **Verify**: Test system functionality
5. **Document**: Record incident and resolution

---

## Support & Resources

### Documentation Links
- [API Documentation](./API-DOCUMENTATION.md)
- [Migration Procedures](./scripts/README.md)
- [Testing Guide](./TESTING-PROCEDURES.md)

### Contact Information
- **Development Team**: [team@example.com]
- **Security Team**: [security@example.com]
- **System Administration**: [admin@example.com]

### External Resources
- [JWT.io](https://jwt.io/) - JWT token debugging
- [OWASP RBAC](https://owasp.org/www-project-access-control/) - Security best practices
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) - Database reference

---

**Document Information**
- **Created**: 2025-01-17
- **Last Updated**: 2025-01-17
- **Version**: 1.0
- **Author**: Development Team
- **Review Date**: 2025-02-17

*This documentation is maintained as part of the QR Restaurant System codebase. Please update as the system evolves.*