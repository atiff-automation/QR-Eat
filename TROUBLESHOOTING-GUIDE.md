# Troubleshooting Guide
## QR Restaurant System - RBAC Enhanced

**Version**: 2.0  
**Last Updated**: 2025-01-17  
**Audience**: Technical Support, System Administrators, Development Team

---

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Authentication Issues](#authentication-issues)
3. [Permission & Authorization Issues](#permission--authorization-issues)
4. [Role Switching Problems](#role-switching-problems)
5. [Database Issues](#database-issues)
6. [Performance Problems](#performance-problems)
7. [API Issues](#api-issues)
8. [Session Management Issues](#session-management-issues)
9. [Migration Problems](#migration-problems)
10. [Monitoring & Logs](#monitoring--logs)
11. [Emergency Procedures](#emergency-procedures)

---

## Quick Diagnostics

### Health Check Commands

```bash
# Basic system health
curl http://localhost:3000/api/health

# Database connectivity
npx prisma db execute --stdin <<< "SELECT 1;"

# Check RBAC tables
npx prisma db execute --stdin <<< "
  SELECT 
    'user_roles' as table_name, COUNT(*) as count FROM user_roles
  UNION ALL
  SELECT 
    'permissions' as table_name, COUNT(*) as count FROM permissions
  UNION ALL
  SELECT 
    'user_sessions' as table_name, COUNT(*) as count FROM user_sessions;
"

# Test JWT secret
node -e "
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.log('❌ JWT_SECRET not set');
    process.exit(1);
  }
  try {
    const token = jwt.sign({test: true}, secret);
    jwt.verify(token, secret);
    console.log('✅ JWT_SECRET working correctly');
  } catch (e) {
    console.log('❌ JWT_SECRET invalid:', e.message);
  }
"
```

### Environment Validation

```bash
# Check required environment variables
cat > check-env.js << 'EOF'
const required = [
  'DATABASE_URL',
  'JWT_SECRET',
  'NEXTAUTH_SECRET',
  'NODE_ENV'
];

const missing = required.filter(key => !process.env[key]);

if (missing.length > 0) {
  console.log('❌ Missing environment variables:', missing.join(', '));
  process.exit(1);
} else {
  console.log('✅ All required environment variables are set');
}
EOF

node check-env.js
```

---

## Authentication Issues

### Problem: Users Cannot Login

#### Symptoms
- Login form returns "Invalid credentials" for valid users
- Login request fails with 500 error
- Users get redirected back to login page

#### Diagnostic Steps

1. **Check User Exists**:
```sql
-- Check if user exists in any user table
SELECT 'platform_admin' as type, id, email, is_active FROM platform_admins WHERE email = 'user@example.com'
UNION ALL
SELECT 'restaurant_owner' as type, id, email, is_active FROM restaurant_owners WHERE email = 'user@example.com'
UNION ALL
SELECT 'staff' as type, id, email, is_active FROM staff WHERE email = 'user@example.com';
```

2. **Check User Roles**:
```sql
SELECT ur.*, r.name as restaurant_name
FROM user_roles ur
LEFT JOIN restaurants r ON ur.restaurant_id = r.id
WHERE ur.user_id = 'USER_UUID';
```

3. **Check Database Connection**:
```bash
# Test database connectivity
npx prisma db execute --stdin <<< "SELECT NOW();"
```

#### Common Causes & Solutions

**Cause**: Database connection failure  
**Solution**: 
- Check DATABASE_URL environment variable
- Verify database server is running
- Test network connectivity to database

**Cause**: Missing JWT_SECRET  
**Solution**: 
- Set JWT_SECRET in environment variables
- Ensure secret is at least 32 characters long
- Restart application after setting

**Cause**: User has no active roles  
**Solution**: 
```sql
-- Create missing role for user
INSERT INTO user_roles (user_id, user_type, role_template, restaurant_id, is_active)
VALUES ('USER_UUID', 'restaurant_owner', 'restaurant_owner', 'RESTAURANT_UUID', true);
```

**Cause**: Password hash mismatch  
**Solution**: 
- Reset user password through admin interface
- Check bcrypt implementation consistency

---

### Problem: Session Expires Too Quickly

#### Symptoms
- Users get logged out after a few minutes
- "Session expired" errors during normal use
- Frequent authentication prompts

#### Diagnostic Steps

1. **Check Session Configuration**:
```sql
SELECT 
  session_id,
  expires_at,
  last_activity,
  (expires_at - NOW()) as time_remaining
FROM user_sessions 
WHERE user_id = 'USER_UUID'
ORDER BY created_at DESC;
```

2. **Check JWT Expiration**:
```javascript
const jwt = require('jsonwebtoken');
const token = 'YOUR_JWT_TOKEN';
const decoded = jwt.decode(token);
console.log('Token expires at:', new Date(decoded.exp * 1000));
console.log('Current time:', new Date());
```

#### Solutions

**Short Session Timeout**:
- Increase session timeout in environment: `RBAC_SESSION_TIMEOUT=86400` (24 hours)
- Update JWT expiration in auth service

**Clock Skew**:
- Synchronize server time with NTP
- Check timezone configuration

**Session Cleanup Too Aggressive**:
- Review session cleanup cron job frequency
- Adjust cleanup thresholds

---

## Permission & Authorization Issues

### Problem: "Access Denied" / "Insufficient Permissions"

#### Symptoms
- Users see "Insufficient permissions" errors
- Menu items missing or disabled
- API requests return 403 Forbidden

#### Diagnostic Steps

1. **Check User Permissions**:
```sql
-- Get user's computed permissions
SELECT DISTINCT rp.permission_key, p.description, p.category
FROM user_roles ur
JOIN role_permissions rp ON ur.role_template = rp.role_template
JOIN permissions p ON rp.permission_key = p.permission_key
WHERE ur.user_id = 'USER_UUID' AND ur.is_active = true;
```

2. **Check Required Permission for Route**:
```bash
# Check middleware configuration
grep -r "permission.*:" src/middleware.ts
```

3. **Check Role Template Permissions**:
```sql
SELECT rp.permission_key, p.description
FROM role_permissions rp
JOIN permissions p ON rp.permission_key = p.permission_key
WHERE rp.role_template = 'ROLE_TEMPLATE'
ORDER BY p.category, rp.permission_key;
```

#### Common Causes & Solutions

**Missing Role Assignment**:
```sql
-- Assign missing role to user
INSERT INTO user_roles (user_id, user_type, role_template, restaurant_id, is_active)
VALUES ('USER_UUID', 'staff', 'manager', 'RESTAURANT_UUID', true);
```

**Incorrect Permission Mapping**:
```sql
-- Add missing permission to role template
INSERT INTO role_permissions (role_template, permission_key)
VALUES ('manager', 'orders:write');
```

**Route Permission Mismatch**:
- Check middleware route permission mappings
- Update ROUTE_PERMISSIONS configuration
- Ensure API endpoints have correct permission requirements

---

### Problem: Permission Checks Too Slow

#### Symptoms
- Slow page loads
- High database query count
- Timeout errors on permission-heavy pages

#### Diagnostic Steps

1. **Check Query Performance**:
```sql
-- Analyze permission computation queries
EXPLAIN ANALYZE 
SELECT DISTINCT rp.permission_key
FROM user_roles ur
JOIN role_permissions rp ON ur.role_template = rp.role_template
WHERE ur.user_id = 'USER_UUID' AND ur.is_active = true;
```

2. **Check Index Usage**:
```sql
-- Verify indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('user_roles', 'role_permissions', 'permissions');
```

#### Solutions

**Missing Indexes**:
```sql
-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_active ON user_roles(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_role_permissions_template ON role_permissions(role_template);
```

**Implement Permission Caching**:
```typescript
// Add to auth service
const permissionCache = new Map();

static async getCachedPermissions(userId: string): Promise<string[]> {
  const cacheKey = `permissions:${userId}`;
  if (permissionCache.has(cacheKey)) {
    return permissionCache.get(cacheKey);
  }
  
  const permissions = await this.computeUserPermissions(userId);
  permissionCache.set(cacheKey, permissions);
  
  // Cache for 5 minutes
  setTimeout(() => permissionCache.delete(cacheKey), 5 * 60 * 1000);
  
  return permissions;
}
```

---

## Role Switching Problems

### Problem: Role Switcher Not Appearing

#### Symptoms
- Role switcher button missing from UI
- User cannot switch between roles
- Only one role showing despite having multiple

#### Diagnostic Steps

1. **Check Available Roles**:
```sql
SELECT 
  ur.id,
  ur.role_template,
  ur.is_active,
  r.name as restaurant_name
FROM user_roles ur
LEFT JOIN restaurants r ON ur.restaurant_id = r.id
WHERE ur.user_id = 'USER_UUID'
ORDER BY ur.created_at;
```

2. **Check Frontend Role Context**:
```javascript
// Check role context in browser console
console.log('Current user:', useRole());
```

#### Solutions

**User Has Only One Role**:
- Role switcher only appears when user has multiple active roles
- This is expected behavior

**Multiple Roles Not Loading**:
- Check JWT payload includes all available roles
- Verify API endpoint `/api/auth/me` returns all roles
- Check frontend role provider implementation

**Frontend Context Issue**:
- Clear browser cache and cookies
- Check React context provider is wrapping application
- Verify role provider is fetching data correctly

---

### Problem: Role Switch Fails

#### Symptoms
- Role switch request returns error
- UI doesn't update after role switch
- User gets "Role not available" error

#### Diagnostic Steps

1. **Check Role Availability**:
```sql
SELECT * FROM user_roles 
WHERE user_id = 'USER_UUID' 
AND id = 'TARGET_ROLE_ID' 
AND is_active = true;
```

2. **Check Session Validity**:
```sql
SELECT * FROM user_sessions 
WHERE session_id = 'SESSION_ID' 
AND expires_at > NOW();
```

#### Solutions

**Role Not Active**:
```sql
-- Reactivate role
UPDATE user_roles 
SET is_active = true, updated_at = NOW()
WHERE id = 'ROLE_ID';
```

**Session Issues**:
- User needs to log out and log back in
- Clear session from database and regenerate

**Audit Log Failure**:
- Check audit logging is not blocking role switch
- Verify audit_logs table is accessible

---

## Database Issues

### Problem: RBAC Tables Missing or Corrupted

#### Symptoms
- "Table doesn't exist" errors
- Migration failures
- Missing foreign key constraints

#### Diagnostic Steps

1. **Check Table Existence**:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_roles', 'permissions', 'role_permissions', 'audit_logs', 'user_sessions');
```

2. **Check Table Structure**:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'user_roles'
ORDER BY ordinal_position;
```

#### Solutions

**Missing Tables**:
```bash
# Run migrations
npx prisma migrate deploy

# If migrations fail, reset and re-run
npx prisma migrate reset --force
npx prisma migrate deploy
```

**Corrupted Data**:
```bash
# Restore from backup
psql $DATABASE_URL < backup_file.sql

# Or restore specific tables
pg_restore -t user_roles -t permissions backup_file.sql
```

---

### Problem: Permission Data Missing

#### Symptoms
- No permissions in database
- Empty role templates
- Users have no computed permissions

#### Diagnostic Steps

1. **Check Permission Count**:
```sql
SELECT 
  COUNT(*) as total_permissions,
  COUNT(CASE WHEN is_active THEN 1 END) as active_permissions
FROM permissions;
```

2. **Check Role Template Assignments**:
```sql
SELECT 
  role_template,
  COUNT(*) as permission_count
FROM role_permissions
GROUP BY role_template;
```

#### Solutions

**Reseed Permissions**:
```bash
# Run seeding script
node scripts/seed-rbac-data.js

# Or use Prisma seed
npx prisma db seed
```

**Manually Create Missing Permissions**:
```sql
-- Insert basic permissions
INSERT INTO permissions (permission_key, description, category, is_active) VALUES
('orders:read', 'View orders', 'orders', true),
('orders:write', 'Create and edit orders', 'orders', true),
('tables:read', 'View tables', 'tables', true),
('tables:write', 'Manage tables', 'tables', true);

-- Assign to role template
INSERT INTO role_permissions (role_template, permission_key) VALUES
('restaurant_owner', 'orders:read'),
('restaurant_owner', 'orders:write'),
('restaurant_owner', 'tables:read'),
('restaurant_owner', 'tables:write');
```

---

## Performance Problems

### Problem: Slow Authentication

#### Symptoms
- Login takes more than 5 seconds
- Token validation timeouts
- High CPU usage during auth

#### Diagnostic Steps

1. **Profile Authentication Flow**:
```javascript
console.time('auth');
// Run authentication
console.timeEnd('auth');
```

2. **Check Database Query Performance**:
```sql
-- Enable query logging
SET log_statement = 'all';
SET log_min_duration_statement = 100;
```

#### Solutions

**Optimize Permission Computation**:
```sql
-- Create materialized view for common permission queries
CREATE MATERIALIZED VIEW user_permissions_mv AS
SELECT 
  ur.user_id,
  ur.role_template,
  array_agg(DISTINCT rp.permission_key) as permissions
FROM user_roles ur
JOIN role_permissions rp ON ur.role_template = rp.role_template
WHERE ur.is_active = true
GROUP BY ur.user_id, ur.role_template;

-- Refresh periodically
REFRESH MATERIALIZED VIEW user_permissions_mv;
```

**Add Connection Pooling**:
```javascript
// Update Prisma configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + "?connection_limit=10&pool_timeout=20"
    }
  }
});
```

---

### Problem: High Memory Usage

#### Symptoms
- Application memory continuously growing
- Out of memory errors
- Slow garbage collection

#### Diagnostic Steps

1. **Check Session Count**:
```sql
SELECT COUNT(*) as active_sessions FROM user_sessions WHERE expires_at > NOW();
```

2. **Monitor Memory Usage**:
```bash
# Check Node.js memory usage
node -e "console.log(process.memoryUsage())"
```

#### Solutions

**Session Cleanup**:
```sql
-- Clean up expired sessions
DELETE FROM user_sessions WHERE expires_at < NOW();

-- Set up automatic cleanup (add to cron)
-- 0 */6 * * * DELETE FROM user_sessions WHERE expires_at < NOW();
```

**Implement Session Limits**:
```javascript
// Limit concurrent sessions per user
const MAX_SESSIONS_PER_USER = 5;

// Before creating new session
const userSessions = await prisma.userSession.count({
  where: { userId }
});

if (userSessions >= MAX_SESSIONS_PER_USER) {
  // Delete oldest session
  const oldestSession = await prisma.userSession.findFirst({
    where: { userId },
    orderBy: { lastActivity: 'asc' }
  });
  
  await prisma.userSession.delete({
    where: { id: oldestSession.id }
  });
}
```

---

## API Issues

### Problem: API Endpoints Returning 500 Errors

#### Symptoms
- Internal server errors on API calls
- Inconsistent API responses
- Database connection errors in logs

#### Diagnostic Steps

1. **Check API Logs**:
```bash
# View application logs
tail -f logs/application.log | grep ERROR

# Check specific endpoint
curl -v http://localhost:3000/api/auth/me
```

2. **Test Database Connection**:
```javascript
// Test Prisma connection
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');
    
    const result = await prisma.$queryRaw`SELECT NOW()`;
    console.log('✅ Query successful:', result);
  } catch (error) {
    console.log('❌ Database error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();
```

#### Solutions

**Database Connection Issues**:
- Check DATABASE_URL format and credentials
- Verify database server is accessible
- Increase connection pool size if needed

**Missing Error Handling**:
```typescript
// Add comprehensive error handling
export async function GET(request: NextRequest) {
  try {
    // API logic here
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: 'Database error' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

---

### Problem: Middleware Blocking Requests

#### Symptoms
- All requests return 401 or 403
- Public routes being protected
- Middleware not recognizing authentication

#### Diagnostic Steps

1. **Check Middleware Configuration**:
```typescript
// Verify middleware matcher
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/((?!auth|qr|menu|health).)*',
  ],
};
```

2. **Test Token Extraction**:
```javascript
// Check cookie extraction
const token = request.cookies.get('qr_auth_token')?.value;
console.log('Token found:', !!token);
console.log('Token preview:', token?.substring(0, 20) + '...');
```

#### Solutions

**Update Public Routes**:
```typescript
function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    '/login',
    '/register',
    '/qr/',
    '/menu/',
    '/api/auth/login',
    '/api/health',
    // Add more as needed
  ];
  
  return publicRoutes.some(route => pathname.startsWith(route));
}
```

**Fix Token Validation**:
```typescript
// Handle legacy token conversion
let finalToken = token;
if (LegacyTokenAdapter.isLegacyToken(token)) {
  finalToken = await LegacyTokenAdapter.convertLegacyToken(token);
}
```

---

## Session Management Issues

### Problem: Orphaned Sessions

#### Symptoms
- Users appear online but aren't active
- High session count in database
- Performance degradation

#### Diagnostic Steps

1. **Find Orphaned Sessions**:
```sql
-- Sessions without recent activity
SELECT 
  session_id,
  user_id,
  last_activity,
  expires_at,
  (NOW() - last_activity) as inactive_time
FROM user_sessions 
WHERE last_activity < NOW() - INTERVAL '1 hour'
ORDER BY last_activity;
```

2. **Check Session Cleanup Job**:
```bash
# Check if cleanup job is running
crontab -l | grep session
```

#### Solutions

**Manual Cleanup**:
```sql
-- Remove inactive sessions (older than 24 hours)
DELETE FROM user_sessions 
WHERE last_activity < NOW() - INTERVAL '24 hours';

-- Remove expired sessions
DELETE FROM user_sessions 
WHERE expires_at < NOW();
```

**Automated Cleanup**:
```bash
# Add to crontab
# Clean up every 6 hours
0 */6 * * * cd /path/to/app && node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.userSession.deleteMany({
  where: { expiresAt: { lt: new Date() } }
}).then(() => console.log('Sessions cleaned up'));
"
```

---

### Problem: Concurrent Session Conflicts

#### Symptoms
- Users experiencing session conflicts
- Unexpected logouts
- Role switches affecting other sessions

#### Diagnostic Steps

1. **Check Multiple Sessions**:
```sql
SELECT 
  user_id,
  COUNT(*) as session_count,
  array_agg(session_id) as session_ids
FROM user_sessions 
WHERE expires_at > NOW()
GROUP BY user_id
HAVING COUNT(*) > 1;
```

#### Solutions

**Implement Session Strategy**:
```typescript
// Choose session strategy
enum SessionStrategy {
  ALLOW_MULTIPLE = 'allow_multiple',    // Default
  SINGLE_SESSION = 'single_session',    // Force logout other sessions
  DEVICE_BASED = 'device_based'         // One session per device
}

// Implement in auth service
static async createSession(params: CreateSessionParams): Promise<UserSession> {
  const strategy = process.env.SESSION_STRATEGY || SessionStrategy.ALLOW_MULTIPLE;
  
  if (strategy === SessionStrategy.SINGLE_SESSION) {
    // Invalidate existing sessions
    await prisma.userSession.deleteMany({
      where: { userId: params.userId }
    });
  }
  
  // Create new session
  return await prisma.userSession.create({
    data: {
      userId: params.userId,
      sessionId: crypto.randomUUID(),
      // ... other fields
    }
  });
}
```

---

## Migration Problems

### Problem: Migration from Legacy System Failed

#### Symptoms
- Users missing from RBAC system
- Roles not assigned correctly
- Data inconsistencies between old and new system

#### Diagnostic Steps

1. **Check Migration Status**:
```bash
# Run migration verification
node scripts/verify-migration.js
```

2. **Compare User Counts**:
```sql
-- Compare legacy vs RBAC user counts
SELECT 
  'Legacy' as system,
  (SELECT COUNT(*) FROM platform_admins) as admins,
  (SELECT COUNT(*) FROM restaurant_owners) as owners,
  (SELECT COUNT(*) FROM staff) as staff
UNION ALL
SELECT 
  'RBAC' as system,
  (SELECT COUNT(*) FROM user_roles WHERE user_type = 'platform_admin') as admins,
  (SELECT COUNT(*) FROM user_roles WHERE user_type = 'restaurant_owner') as owners,
  (SELECT COUNT(*) FROM user_roles WHERE user_type = 'staff') as staff;
```

#### Solutions

**Re-run Migration**:
```bash
# Re-run user migration
node scripts/migrate-users.js

# Or run specific migration steps
node -e "
const { migratePlatformAdmins, migrateRestaurantOwners, migrateStaff } = require('./scripts/migrate-users.js');
Promise.resolve()
  .then(() => migratePlatformAdmins())
  .then(() => migrateRestaurantOwners())
  .then(() => migrateStaff())
  .then(() => console.log('Migration completed'))
  .catch(console.error);
"
```

**Manual Data Fix**:
```sql
-- Find users without RBAC roles
SELECT pa.id, pa.email, 'platform_admin' as missing_type
FROM platform_admins pa
LEFT JOIN user_roles ur ON pa.id = ur.user_id AND ur.user_type = 'platform_admin'
WHERE ur.id IS NULL

UNION ALL

SELECT ro.id, ro.email, 'restaurant_owner' as missing_type
FROM restaurant_owners ro
LEFT JOIN user_roles ur ON ro.id = ur.user_id AND ur.user_type = 'restaurant_owner'
WHERE ur.id IS NULL

UNION ALL

SELECT s.id, s.email, 'staff' as missing_type
FROM staff s
LEFT JOIN user_roles ur ON s.id = ur.user_id AND ur.user_type = 'staff'
WHERE ur.id IS NULL;
```

---

### Problem: Rollback Required

#### Symptoms
- Critical issues with RBAC system
- Need to revert to legacy authentication
- Data corruption or loss

#### Solution Process

1. **Immediate Response**:
```bash
# Use rollback script
./scripts/rollback-rbac.sh

# Or manual rollback
# Stop application
systemctl stop qr-restaurant-app

# Restore database
psql $DATABASE_URL < backup_file.sql

# Revert code to previous version
git checkout legacy-auth-tag

# Restart application
systemctl start qr-restaurant-app
```

2. **Verify Rollback**:
```bash
# Test legacy authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

---

## Monitoring & Logs

### Key Metrics to Monitor

#### System Health
```bash
# API response times
curl -w "@curl-format.txt" http://localhost:3000/api/health

# Database connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

# Memory usage
free -h
```

#### Authentication Metrics
```sql
-- Authentication success rate (last 24 hours)
SELECT 
  COUNT(CASE WHEN action = 'LOGIN' THEN 1 END) as logins,
  COUNT(CASE WHEN action = 'LOGIN_FAILED' THEN 1 END) as failed_logins,
  (COUNT(CASE WHEN action = 'LOGIN' THEN 1 END) * 100.0 / 
   NULLIF(COUNT(*), 0)) as success_rate
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '24 hours'
AND action IN ('LOGIN', 'LOGIN_FAILED');

-- Average session duration
SELECT AVG(EXTRACT(EPOCH FROM (expires_at - created_at))/3600) as avg_hours
FROM user_sessions
WHERE created_at > NOW() - INTERVAL '7 days';
```

#### Permission Metrics
```sql
-- Permission denied rate
SELECT 
  DATE(created_at) as date,
  COUNT(*) as permission_denials
FROM audit_logs 
WHERE action = 'PERMISSION_DENIED'
AND created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- Most denied permissions
SELECT 
  metadata->>'permission' as permission,
  COUNT(*) as denial_count
FROM audit_logs 
WHERE action = 'PERMISSION_DENIED'
AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY metadata->>'permission'
ORDER BY denial_count DESC;
```

### Log Analysis

#### Application Logs
```bash
# Check for authentication errors
grep -i "auth.*error" /var/log/qr-restaurant/app.log

# Check for permission denials
grep "PERMISSION_DENIED" /var/log/qr-restaurant/app.log

# Check for database errors
grep -i "prisma.*error" /var/log/qr-restaurant/app.log

# Real-time monitoring
tail -f /var/log/qr-restaurant/app.log | grep -E "(ERROR|WARN|PERMISSION_DENIED)"
```

#### Database Logs
```bash
# PostgreSQL logs
tail -f /var/log/postgresql/postgresql-*.log | grep -E "(ERROR|FATAL)"

# Slow queries
grep "duration.*ms" /var/log/postgresql/postgresql-*.log | grep -v "duration: 0"
```

### Setting Up Alerts

#### Email Alerts
```bash
# Create monitoring script
cat > /usr/local/bin/rbac-monitor.sh << 'EOF'
#!/bin/bash

# Check authentication failure rate
FAIL_RATE=$(psql $DATABASE_URL -t -c "
  SELECT COALESCE(
    COUNT(CASE WHEN action = 'LOGIN_FAILED' THEN 1 END) * 100.0 / 
    NULLIF(COUNT(CASE WHEN action LIKE 'LOGIN%' THEN 1 END), 0),
    0
  )
  FROM audit_logs 
  WHERE created_at > NOW() - INTERVAL '1 hour'
")

if (( $(echo "$FAIL_RATE > 20" | bc -l) )); then
  echo "HIGH AUTH FAILURE RATE: $FAIL_RATE%" | mail -s "QR Restaurant Alert" admin@restaurant.com
fi

# Check permission denial rate
DENIAL_COUNT=$(psql $DATABASE_URL -t -c "
  SELECT COUNT(*) 
  FROM audit_logs 
  WHERE action = 'PERMISSION_DENIED' 
  AND created_at > NOW() - INTERVAL '1 hour'
")

if [ "$DENIAL_COUNT" -gt 50 ]; then
  echo "HIGH PERMISSION DENIAL COUNT: $DENIAL_COUNT" | mail -s "QR Restaurant Alert" admin@restaurant.com
fi
EOF

chmod +x /usr/local/bin/rbac-monitor.sh

# Add to crontab (run every hour)
echo "0 * * * * /usr/local/bin/rbac-monitor.sh" | crontab -
```

---

## Emergency Procedures

### Complete System Down

#### Immediate Actions
1. **Check Service Status**:
```bash
systemctl status qr-restaurant-app
systemctl status postgresql
systemctl status nginx
```

2. **Check Logs**:
```bash
journalctl -u qr-restaurant-app -f
tail -f /var/log/qr-restaurant/app.log
```

3. **Quick Restart**:
```bash
systemctl restart qr-restaurant-app
```

#### If Restart Doesn't Work
1. **Database Issues**:
```bash
# Check database connectivity
psql $DATABASE_URL -c "SELECT 1;"

# If connection fails, check PostgreSQL
systemctl status postgresql
systemctl restart postgresql
```

2. **Application Issues**:
```bash
# Check environment variables
sudo -u qr-app env | grep -E "(DATABASE_URL|JWT_SECRET)"

# Check application files
ls -la /opt/qr-restaurant/
```

### Security Incident Response

#### Suspected Breach
1. **Immediate Actions**:
```bash
# Invalidate all sessions
psql $DATABASE_URL -c "DELETE FROM user_sessions;"

# Disable authentication temporarily
# Add to environment: AUTH_DISABLED=true

# Check recent audit logs
psql $DATABASE_URL -c "
  SELECT * FROM audit_logs 
  WHERE created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC;
"
```

2. **Investigation**:
```sql
-- Check for suspicious activity
SELECT 
  user_id,
  action,
  ip_address,
  user_agent,
  created_at
FROM audit_logs 
WHERE created_at > NOW() - INTERVAL '7 days'
AND (
  action = 'PERMISSION_DENIED' 
  OR ip_address NOT LIKE '192.168.%'
  OR ip_address NOT LIKE '10.%'
)
ORDER BY created_at DESC;
```

#### Data Corruption
1. **Stop Application**:
```bash
systemctl stop qr-restaurant-app
```

2. **Assess Damage**:
```sql
-- Check data integrity
SELECT COUNT(*) FROM user_roles WHERE user_id IS NULL;
SELECT COUNT(*) FROM role_permissions WHERE permission_key NOT IN (SELECT permission_key FROM permissions);
```

3. **Restore from Backup**:
```bash
# Restore database
pg_restore -d $DATABASE_NAME backup_file.sql

# Or restore from SQL dump
psql $DATABASE_URL < backup_file.sql
```

### Contact Information

#### Escalation Levels

**Level 1 - Application Issues**:
- Development Team: dev-team@qrrestaurant.com
- Response Time: 2 hours during business hours

**Level 2 - Security Issues**:
- Security Team: security@qrrestaurant.com
- Response Time: 1 hour, 24/7

**Level 3 - Critical System Down**:
- Emergency Hotline: +1-800-QR-EMRG
- Response Time: 30 minutes, 24/7

**External Support**:
- Database Support: postgres-support@provider.com
- Infrastructure: cloud-support@provider.com

---

**Document Information**
- **Created**: 2025-01-17
- **Last Updated**: 2025-01-17
- **Version**: 2.0
- **Next Review**: 2025-02-17
- **Author**: Technical Support Team

*This troubleshooting guide should be updated regularly as new issues are identified and resolved. Please contribute fixes and solutions as they are discovered.*