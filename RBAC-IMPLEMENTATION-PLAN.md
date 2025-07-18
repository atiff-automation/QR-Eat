# QR Restaurant System - RBAC Implementation Plan

## Executive Summary

This document outlines the comprehensive implementation plan for migrating from a cookie-based multi-session authentication system to an enterprise-grade Role-Based Access Control (RBAC) system. This change addresses critical security vulnerabilities and aligns with industry best practices used by major platforms like AWS, Slack, and Shopify.

### Key Objectives
- **Eliminate session mixing vulnerabilities** between different user types
- **Implement granular permission-based access control**
- **Enable role switching within single sessions**
- **Prepare for multi-restaurant/franchise scalability**
- **Establish audit logging and compliance readiness**

### Impact Assessment
- **High Impact**: Core authentication, authorization, and session management
- **Medium Impact**: UI components, API endpoints, middleware
- **Low Impact**: Customer-facing features, QR ordering system

---

## Current State Analysis

### Existing System Issues
1. **Security Vulnerability**: Cookie mixing allows unintended access between user types
2. **Limited Scalability**: Hard-coded user type cookies don't scale for complex organizations
3. **No Audit Trail**: No logging of role changes or permission usage
4. **Poor UX**: Users must logout/login to switch between roles
5. **Maintenance Burden**: Multiple authentication cookie types to manage

### Current Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   qr_owner_     │    │   qr_staff_     │    │   qr_admin_     │
│   token         │    │   token         │    │   token         │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Middleware    │
                    │   (checks all   │
                    │   cookie types) │
                    └─────────────────┘
```

### Files Currently Impacted
- `src/lib/auth.ts` - Core authentication logic
- `src/app/api/auth/login/route.ts` - Login endpoint
- `src/app/api/auth/logout/route.ts` - Logout endpoint
- `src/app/api/auth/me/route.ts` - User info endpoint
- `src/middleware.ts` - Authentication middleware
- `src/components/dashboard/DashboardLayout.tsx` - Dashboard layout
- `src/app/dashboard/kitchen/page.tsx` - Kitchen display
- `src/app/admin/dashboard/page.tsx` - Admin dashboard
- `src/app/api/debug-auth/route.ts` - Debug authentication

---

## Target Architecture

### New RBAC System Design
```
┌─────────────────────────────────────────────────────────────────┐
│                        Single JWT Token                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   User      │  │  Current    │  │      Computed           │ │
│  │   Identity  │  │  Role       │  │      Permissions        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Permission    │
                    │   Middleware    │
                    │   (validates    │
                    │   permissions)  │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Role-Aware    │
                    │   UI Components │
                    │   (conditional  │
                    │   rendering)    │
                    └─────────────────┘
```

### Core Components
1. **Enhanced JWT Payload** - Single token with role and permission context
2. **Permission System** - Granular permissions for fine-grained access control
3. **Role Templates** - Pre-defined role configurations
4. **Role Switching** - In-session role transitions with audit logging
5. **Permission Middleware** - Route-level permission validation
6. **Role-Aware UI** - Components that adapt based on user permissions
7. **Audit System** - Complete activity logging for compliance

---

## Phase-by-Phase Implementation Plan

## Phase 1: Foundation & Core RBAC System (Week 1-2)

### Phase 1.1: Database Schema Design (Day 1-2)

#### Step 1.1.1: Create Enhanced User Role System
**Files to create/modify:**
- `prisma/schema.prisma`
- `prisma/migrations/`

**Database Changes:**
```sql
-- New tables for RBAC
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_type VARCHAR(50) NOT NULL, -- 'restaurant_owner', 'staff', 'platform_admin'
    restaurant_id UUID, -- NULL for platform admins
    role_template VARCHAR(100) NOT NULL, -- 'owner', 'manager', 'kitchen_staff', 'server'
    custom_permissions JSONB, -- Override permissions
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (restaurant_id) REFERENCES restaurants(id)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    permission_key VARCHAR(100) UNIQUE NOT NULL, -- 'orders:read', 'tables:write'
    description TEXT,
    category VARCHAR(50), -- 'orders', 'tables', 'staff', 'analytics'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_template VARCHAR(100) NOT NULL,
    permission_key VARCHAR(100) NOT NULL,
    granted_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (permission_key) REFERENCES permissions(permission_key)
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL, -- 'LOGIN', 'ROLE_SWITCH', 'PERMISSION_DENIED'
    resource VARCHAR(200), -- '/dashboard/tables', 'orders:read'
    from_role VARCHAR(100),
    to_role VARCHAR(100),
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    current_role_id UUID NOT NULL,
    restaurant_context_id UUID,
    jwt_token_hash VARCHAR(255), -- Hash of JWT for validation
    expires_at TIMESTAMP NOT NULL,
    last_activity TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (current_role_id) REFERENCES user_roles(id),
    FOREIGN KEY (restaurant_context_id) REFERENCES restaurants(id)
);
```

**Action Items:**
- [ ] Create new Prisma schema additions
- [ ] Generate migration files
- [ ] Test migration on development database
- [ ] Seed initial permissions and role templates
- [ ] Create rollback migration

#### Step 1.1.2: Seed Initial Data
**Files to create:**
- `prisma/seeds/permissions.ts`
- `prisma/seeds/role-templates.ts`

**Seed Data Structure:**
```typescript
// Initial permissions - Updated for 4 user types
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
  
  // Table Management
  { key: 'tables:read', description: 'View tables', category: 'tables' },
  { key: 'tables:write', description: 'Manage tables', category: 'tables' },
  { key: 'tables:qr', description: 'Generate QR codes', category: 'tables' },
  
  // Staff Management (differentiated permissions)
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
];

// Role templates with permissions - Updated based on user requirements
const ROLE_TEMPLATES = {
  // 1. Super Admin (Platform Admin) - Manages restaurant creation/deletion
  platform_admin: [
    'platform:read', 'platform:write', 'platform:delete',
    'restaurants:create', 'restaurants:read', 'restaurants:write', 'restaurants:delete',
    'subscriptions:read', 'subscriptions:write',
    'billing:read', 'billing:write',
    'analytics:platform', 'analytics:export',
    'users:read', 'users:write', 'users:delete',
    'settings:platform'
  ],
  
  // 2. Restaurant Owner - Full control of restaurant, can create staff
  restaurant_owner: [
    'restaurant:read', 'restaurant:write', 'restaurant:settings',
    'orders:read', 'orders:write', 'orders:fulfill',
    'tables:read', 'tables:write', 'tables:qr',
    'staff:read', 'staff:write', 'staff:invite', 'staff:delete', 'staff:roles',
    'analytics:read', 'analytics:export',
    'menu:read', 'menu:write', 'menu:delete',
    'settings:read', 'settings:write',
    'billing:read'
  ],
  
  // 3. Manager - Restaurant dashboard access, CANNOT create/edit/delete staff
  manager: [
    'restaurant:read',
    'orders:read', 'orders:write', 'orders:fulfill',
    'tables:read', 'tables:write', 'tables:qr',
    'staff:read', // Can only VIEW staff, not manage
    'analytics:read',
    'menu:read', 'menu:write',
    'settings:read'
  ],
  
  // 4. Kitchen Staff - Kitchen display system only
  kitchen_staff: [
    'orders:read', 'orders:kitchen', 'orders:update', // Can view and update order progress
    'menu:read' // Can view menu items for order details
  ]
};
```

**Action Items:**
- [ ] Create seed files for permissions and role templates
- [ ] Run seed scripts on development database
- [ ] Verify seed data integrity
- [ ] Create seed rollback scripts

### Phase 1.2: Enhanced JWT System (Day 3-4)

#### Step 1.2.1: Create Enhanced JWT Payload Structure
**Files to create:**
- `src/lib/rbac/types.ts`
- `src/lib/rbac/jwt.ts`

**Enhanced JWT Structure:**
```typescript
// src/lib/rbac/types.ts
export interface EnhancedJWTPayload {
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

export interface UserRole {
  id: string;
  userType: 'restaurant_owner' | 'staff' | 'platform_admin';
  roleTemplate: string;
  restaurantId?: string;
  customPermissions?: string[];
  isActive: boolean;
}

export interface RestaurantContext {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  timezone: string;
  currency: string;
}
```

**Action Items:**
- [ ] Create comprehensive type definitions
- [ ] Implement JWT payload validation
- [ ] Create JWT generation utilities
- [ ] Add JWT verification with enhanced payload
- [ ] Create migration utilities for existing tokens

#### Step 1.2.2: Implement Permission Computation Logic
**Files to create:**
- `src/lib/rbac/permissions.ts`
- `src/lib/rbac/role-manager.ts`

**Permission System:**
```typescript
// src/lib/rbac/permissions.ts
export class PermissionManager {
  static async computeUserPermissions(userId: string): Promise<string[]> {
    // Get user's active roles
    const userRoles = await prisma.userRoles.findMany({
      where: { userId, isActive: true },
      include: {
        rolePermissions: {
          include: {
            permission: true
          }
        }
      }
    });
    
    // Combine permissions from all roles
    const permissions = new Set<string>();
    
    for (const role of userRoles) {
      // Add template permissions
      const templatePermissions = await this.getTemplatePermissions(role.roleTemplate);
      templatePermissions.forEach(p => permissions.add(p));
      
      // Add custom permissions
      if (role.customPermissions) {
        role.customPermissions.forEach(p => permissions.add(p));
      }
    }
    
    return Array.from(permissions);
  }
  
  static async getTemplatePermissions(template: string): Promise<string[]> {
    const rolePermissions = await prisma.rolePermissions.findMany({
      where: { roleTemplate: template },
      include: { permission: true }
    });
    
    return rolePermissions
      .filter(rp => rp.permission.isActive)
      .map(rp => rp.permission.permissionKey);
  }
  
  static hasPermission(userPermissions: string[], requiredPermission: string): boolean {
    return userPermissions.includes(requiredPermission);
  }
  
  static hasAnyPermission(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.some(permission => 
      userPermissions.includes(permission)
    );
  }
  
  static hasAllPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
  }
}
```

**Action Items:**
- [ ] Implement permission computation logic
- [ ] Create role template management
- [ ] Add permission validation utilities
- [ ] Create permission caching mechanism
- [ ] Add unit tests for permission logic

### Phase 1.3: Authentication Service V2 (Day 5-7)

#### Step 1.3.1: Create Enhanced Authentication Service
**Files to create:**
- `src/lib/rbac/auth-service.ts`
- `src/lib/rbac/session-manager.ts`

**Enhanced Authentication Service:**
```typescript
// src/lib/rbac/auth-service.ts
export class AuthServiceV2 {
  static async authenticate(
    email: string, 
    password: string, 
    restaurantSlug?: string
  ): Promise<AuthenticationResult> {
    // Validate credentials (reuse existing logic)
    const user = await this.validateCredentials(email, password);
    
    // Get all available roles for this user
    const availableRoles = await this.getUserAvailableRoles(user.id, restaurantSlug);
    
    if (availableRoles.length === 0) {
      throw new Error('No active roles found for user');
    }
    
    // Select default role (highest privilege)
    const defaultRole = this.selectDefaultRole(availableRoles);
    
    // Compute permissions for default role
    const permissions = await PermissionManager.computeUserPermissions(user.id);
    
    // Create session
    const session = await SessionManager.createSession({
      userId: user.id,
      currentRoleId: defaultRole.id,
      restaurantContextId: defaultRole.restaurantId,
      permissions,
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent()
    });
    
    // Generate JWT token
    const token = await this.generateEnhancedToken({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      currentRole: defaultRole,
      availableRoles,
      permissions,
      sessionId: session.sessionId,
      restaurantContext: defaultRole.restaurantId ? 
        await this.getRestaurantContext(defaultRole.restaurantId) : undefined
    });
    
    // Log successful authentication
    await AuditLogger.logAuthentication(user.id, defaultRole, session.sessionId);
    
    return {
      user,
      token,
      session,
      currentRole: defaultRole,
      availableRoles,
      permissions
    };
  }
  
  static async switchRole(
    sessionId: string, 
    newRoleId: string
  ): Promise<RoleSwitchResult> {
    // Validate session
    const session = await SessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Invalid session');
    }
    
    // Validate new role is available to user
    const availableRoles = await this.getUserAvailableRoles(session.userId);
    const newRole = availableRoles.find(role => role.id === newRoleId);
    
    if (!newRole) {
      throw new Error('Role not available for user');
    }
    
    // Compute new permissions
    const newPermissions = await PermissionManager.computeUserPermissions(session.userId);
    
    // Update session
    await SessionManager.updateSession(sessionId, {
      currentRoleId: newRoleId,
      restaurantContextId: newRole.restaurantId,
      permissions: newPermissions
    });
    
    // Log role switch
    await AuditLogger.logRoleSwitch(
      session.userId, 
      session.currentRoleId, 
      newRoleId, 
      sessionId
    );
    
    // Generate new token
    const newToken = await this.generateEnhancedToken({
      userId: session.userId,
      currentRole: newRole,
      availableRoles,
      permissions: newPermissions,
      sessionId,
      restaurantContext: newRole.restaurantId ?
        await this.getRestaurantContext(newRole.restaurantId) : undefined
    });
    
    return {
      token: newToken,
      currentRole: newRole,
      permissions: newPermissions
    };
  }
  
  static async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as EnhancedJWTPayload;
      
      // Validate session still exists
      const session = await SessionManager.getSession(payload.sessionId);
      if (!session || session.expiresAt < new Date()) {
        throw new Error('Session expired');
      }
      
      // Update last activity
      await SessionManager.updateLastActivity(payload.sessionId);
      
      return {
        isValid: true,
        payload,
        session
      };
    } catch (error) {
      return {
        isValid: false,
        error: error.message
      };
    }
  }
  
  static async logout(sessionId: string): Promise<void> {
    // Get session info for logging
    const session = await SessionManager.getSession(sessionId);
    
    // Invalidate session
    await SessionManager.invalidateSession(sessionId);
    
    // Log logout
    if (session) {
      await AuditLogger.logLogout(session.userId, sessionId);
    }
  }
}
```

**Action Items:**
- [ ] Implement core authentication logic
- [ ] Create role switching mechanism
- [ ] Add token validation with session checking
- [ ] Implement logout functionality
- [ ] Add comprehensive error handling
- [ ] Create unit tests for authentication service

#### Step 1.3.2: Implement Session Management
**Files to create:**
- `src/lib/rbac/session-manager.ts`

**Session Management:**
```typescript
// src/lib/rbac/session-manager.ts
export class SessionManager {
  static async createSession(params: CreateSessionParams): Promise<UserSession> {
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const session = await prisma.userSessions.create({
      data: {
        userId: params.userId,
        sessionId,
        currentRoleId: params.currentRoleId,
        restaurantContextId: params.restaurantContextId,
        expiresAt,
        lastActivity: new Date()
      }
    });
    
    return session;
  }
  
  static async getSession(sessionId: string): Promise<UserSession | null> {
    return await prisma.userSessions.findUnique({
      where: { sessionId },
      include: {
        user: true,
        currentRole: true,
        restaurantContext: true
      }
    });
  }
  
  static async updateSession(sessionId: string, updates: Partial<UserSession>): Promise<void> {
    await prisma.userSessions.update({
      where: { sessionId },
      data: {
        ...updates,
        lastActivity: new Date()
      }
    });
  }
  
  static async updateLastActivity(sessionId: string): Promise<void> {
    await prisma.userSessions.update({
      where: { sessionId },
      data: { lastActivity: new Date() }
    });
  }
  
  static async invalidateSession(sessionId: string): Promise<void> {
    await prisma.userSessions.delete({
      where: { sessionId }
    });
  }
  
  static async invalidateAllUserSessions(userId: string): Promise<void> {
    await prisma.userSessions.deleteMany({
      where: { userId }
    });
  }
  
  static async cleanupExpiredSessions(): Promise<void> {
    await prisma.userSessions.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
  }
}
```

**Action Items:**
- [ ] Implement session CRUD operations
- [ ] Add session cleanup mechanisms
- [ ] Create session validation logic
- [ ] Add session analytics tracking
- [ ] Create session management utilities

### Phase 1.4: Audit Logging System (Day 8)

#### Step 1.4.1: Implement Comprehensive Audit Logging
**Files to create:**
- `src/lib/rbac/audit-logger.ts`

**Audit Logging System:**
```typescript
// src/lib/rbac/audit-logger.ts
export class AuditLogger {
  static async logAuthentication(
    userId: string, 
    role: UserRole, 
    sessionId: string
  ): Promise<void> {
    await prisma.auditLogs.create({
      data: {
        userId,
        action: 'LOGIN',
        metadata: {
          roleId: role.id,
          roleTemplate: role.roleTemplate,
          restaurantId: role.restaurantId,
          sessionId
        },
        ipAddress: this.getClientIP(),
        userAgent: this.getUserAgent(),
        createdAt: new Date()
      }
    });
  }
  
  static async logRoleSwitch(
    userId: string, 
    fromRoleId: string, 
    toRoleId: string, 
    sessionId: string
  ): Promise<void> {
    await prisma.auditLogs.create({
      data: {
        userId,
        action: 'ROLE_SWITCH',
        fromRole: fromRoleId,
        toRole: toRoleId,
        metadata: {
          sessionId,
          timestamp: new Date().toISOString()
        },
        ipAddress: this.getClientIP(),
        userAgent: this.getUserAgent()
      }
    });
  }
  
  static async logPermissionDenied(
    userId: string, 
    resource: string, 
    permission: string, 
    sessionId: string
  ): Promise<void> {
    await prisma.auditLogs.create({
      data: {
        userId,
        action: 'PERMISSION_DENIED',
        resource,
        metadata: {
          permission,
          sessionId,
          timestamp: new Date().toISOString()
        },
        ipAddress: this.getClientIP(),
        userAgent: this.getUserAgent()
      }
    });
  }
  
  static async logLogout(userId: string, sessionId: string): Promise<void> {
    await prisma.auditLogs.create({
      data: {
        userId,
        action: 'LOGOUT',
        metadata: {
          sessionId,
          timestamp: new Date().toISOString()
        },
        ipAddress: this.getClientIP(),
        userAgent: this.getUserAgent()
      }
    });
  }
  
  static async getAuditTrail(
    userId: string, 
    options: AuditTrailOptions = {}
  ): Promise<AuditLog[]> {
    const {
      startDate,
      endDate,
      actions,
      limit = 100,
      offset = 0
    } = options;
    
    return await prisma.auditLogs.findMany({
      where: {
        userId,
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
        ...(actions && { action: { in: actions } })
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset
    });
  }
}
```

**Action Items:**
- [ ] Implement core audit logging functions
- [ ] Create audit trail querying capabilities
- [ ] Add audit log analytics
- [ ] Create audit log cleanup procedures
- [ ] Add audit log export functionality

---

## Phase 2: Migration & Backward Compatibility (Week 3)

### Phase 2.1: Create Migration Layer (Day 9-10)

#### Step 2.1.1: Implement Backward Compatibility
**Files to create:**
- `src/lib/rbac/migration-utils.ts`
- `src/lib/rbac/legacy-adapter.ts`

**Migration Strategy:**
```typescript
// src/lib/rbac/migration-utils.ts
export class MigrationUtils {
  static async migrateExistingUsers(): Promise<void> {
    // Migrate restaurant owners
    await this.migrateRestaurantOwners();
    
    // Migrate staff members
    await this.migrateStaffMembers();
    
    // Migrate platform admins
    await this.migratePlatformAdmins();
    
    // Create default sessions for active users
    await this.createDefaultSessions();
  }
  
  static async migrateRestaurantOwners(): Promise<void> {
    const owners = await prisma.restaurantOwner.findMany({
      include: { restaurants: true }
    });
    
    for (const owner of owners) {
      for (const restaurant of owner.restaurants) {
        await prisma.userRoles.create({
          data: {
            userId: owner.id,
            userType: 'restaurant_owner',
            restaurantId: restaurant.id,
            roleTemplate: 'restaurant_owner',
            isActive: true
          }
        });
      }
    }
  }
  
  static async migrateStaffMembers(): Promise<void> {
    const staff = await prisma.staff.findMany({
      include: { role: true }
    });
    
    for (const member of staff) {
      // Map existing roles to new templates
      const roleTemplate = this.mapLegacyRoleToTemplate(member.role);
      
      await prisma.userRoles.create({
        data: {
          userId: member.id,
          userType: 'staff',
          restaurantId: member.restaurantId,
          roleTemplate,
          isActive: member.isActive
        }
      });
    }
  }
  
  static mapLegacyRoleToTemplate(role: any): string {
    // Map existing staff roles to new templates
    if (role.name.toLowerCase().includes('kitchen')) {
      return 'kitchen_staff';
    }
    if (role.name.toLowerCase().includes('server')) {
      return 'server_staff';
    }
    if (role.name.toLowerCase().includes('manager')) {
      return 'manager';
    }
    return 'server_staff'; // default
  }
}
```

**Action Items:**
- [ ] Create user migration scripts
- [ ] Implement role mapping logic
- [ ] Create data validation checks
- [ ] Add migration rollback capabilities
- [ ] Test migration on staging data

#### Step 2.1.2: Create Legacy Token Support
**Files to create:**
- `src/lib/rbac/legacy-token-adapter.ts`

**Legacy Token Support:**
```typescript
// src/lib/rbac/legacy-token-adapter.ts
export class LegacyTokenAdapter {
  static async convertLegacyToken(legacyToken: string): Promise<string> {
    // Verify legacy token
    const legacyPayload = jwt.verify(legacyToken, JWT_SECRET) as any;
    
    // Map legacy payload to new format
    const user = await this.getUserFromLegacyPayload(legacyPayload);
    const availableRoles = await AuthServiceV2.getUserAvailableRoles(user.id);
    const defaultRole = AuthServiceV2.selectDefaultRole(availableRoles);
    const permissions = await PermissionManager.computeUserPermissions(user.id);
    
    // Create new session
    const session = await SessionManager.createSession({
      userId: user.id,
      currentRoleId: defaultRole.id,
      restaurantContextId: defaultRole.restaurantId,
      permissions
    });
    
    // Generate new token
    const newToken = await AuthServiceV2.generateEnhancedToken({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      currentRole: defaultRole,
      availableRoles,
      permissions,
      sessionId: session.sessionId
    });
    
    return newToken;
  }
  
  static isLegacyToken(token: string): boolean {
    try {
      const payload = jwt.decode(token) as any;
      return !payload.sessionId; // New tokens have sessionId
    } catch {
      return false;
    }
  }
}
```

**Action Items:**
- [ ] Implement legacy token conversion
- [ ] Create token format detection
- [ ] Add graceful token migration
- [ ] Create token validation bridge
- [ ] Add temporary dual-token support

### Phase 2.2: Update Authentication Endpoints (Day 11-12)

#### Step 2.2.1: Update Login Endpoint
**Files to modify:**
- `src/app/api/auth/login/route.ts`

**Enhanced Login Endpoint:**
```typescript
// src/app/api/auth/login/route.ts
export async function POST(request: NextRequest) {
  try {
    const { email, password, restaurantSlug } = await request.json();
    
    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }
    
    // Authenticate using new RBAC system
    const result = await AuthServiceV2.authenticate(email, password, restaurantSlug);
    
    const response = NextResponse.json({
      message: 'Login successful',
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        currentRole: result.currentRole,
        availableRoles: result.availableRoles,
        permissions: result.permissions
      },
      ...(result.session.restaurantContext && {
        restaurant: result.session.restaurantContext
      })
    });
    
    // Set single authentication cookie
    response.cookies.set({
      name: 'qr_auth_token',
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/'
    });
    
    // Clear any legacy cookies
    const legacyCookies = ['qr_owner_token', 'qr_staff_token', 'qr_admin_token'];
    legacyCookies.forEach(cookieName => {
      response.cookies.set({
        name: cookieName,
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
      });
    });
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Authentication failed' },
      { status: 401 }
    );
  }
}
```

**Action Items:**
- [ ] Update login endpoint to use RBAC
- [ ] Add role context to response
- [ ] Clear legacy cookies
- [ ] Add comprehensive error handling
- [ ] Update response format

#### Step 2.2.2: Create Role Switching Endpoint
**Files to create:**
- `src/app/api/auth/switch-role/route.ts`

**Role Switching Endpoint:**
```typescript
// src/app/api/auth/switch-role/route.ts
export async function POST(request: NextRequest) {
  try {
    const { newRoleId } = await request.json();
    
    // Extract session from current token
    const token = request.cookies.get('qr_auth_token')?.value;
    if (!token) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 }
      );
    }
    
    const validation = await AuthServiceV2.validateToken(token);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }
    
    // Switch role
    const result = await AuthServiceV2.switchRole(
      validation.payload.sessionId,
      newRoleId
    );
    
    const response = NextResponse.json({
      message: 'Role switched successfully',
      currentRole: result.currentRole,
      permissions: result.permissions
    });
    
    // Update cookie with new token
    response.cookies.set({
      name: 'qr_auth_token',
      value: result.token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/'
    });
    
    return response;
  } catch (error) {
    console.error('Role switch error:', error);
    return NextResponse.json(
      { error: error.message || 'Role switch failed' },
      { status: 400 }
    );
  }
}
```

**Action Items:**
- [ ] Create role switching endpoint
- [ ] Add session validation
- [ ] Update authentication cookie
- [ ] Add comprehensive error handling
- [ ] Add audit logging

#### Step 2.2.3: Update User Info Endpoint
**Files to modify:**
- `src/app/api/auth/me/route.ts`

**Enhanced User Info Endpoint:**
```typescript
// src/app/api/auth/me/route.ts
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('qr_auth_token')?.value;
    
    if (!token) {
      return NextResponse.json(
        { error: 'No authentication token found' },
        { status: 401 }
      );
    }
    
    // Handle legacy token conversion
    let finalToken = token;
    if (LegacyTokenAdapter.isLegacyToken(token)) {
      finalToken = await LegacyTokenAdapter.convertLegacyToken(token);
    }
    
    const validation = await AuthServiceV2.validateToken(finalToken);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }
    
    const payload = validation.payload;
    
    return NextResponse.json({
      user: {
        id: payload.userId,
        email: payload.email,
        firstName: payload.firstName,
        lastName: payload.lastName,
        currentRole: payload.currentRole,
        availableRoles: payload.availableRoles,
        permissions: payload.permissions,
        sessionId: payload.sessionId
      },
      ...(payload.restaurantContext && {
        restaurant: payload.restaurantContext
      })
    });
  } catch (error) {
    console.error('User info error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user information' },
      { status: 500 }
    );
  }
}
```

**Action Items:**
- [ ] Update user info endpoint
- [ ] Add legacy token handling
- [ ] Include role and permission info
- [ ] Add session validation
- [ ] Update response format

### Phase 2.3: Update Middleware (Day 13)

#### Step 2.3.1: Implement Permission-Based Middleware
**Files to modify:**
- `src/middleware.ts`

**Enhanced Middleware:**
```typescript
// src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { AuthServiceV2 } from '@/lib/rbac/auth-service';
import { LegacyTokenAdapter } from '@/lib/rbac/legacy-token-adapter';
import { AuditLogger } from '@/lib/rbac/audit-logger';

// Route permission mappings
const ROUTE_PERMISSIONS = {
  '/dashboard': null, // No specific permission required
  '/dashboard/tables': 'tables:read',
  '/dashboard/kitchen': 'orders:kitchen',
  '/dashboard/staff': 'staff:read',
  '/dashboard/analytics': 'analytics:read',
  '/dashboard/settings': 'settings:read',
  '/api/orders': 'orders:read',
  '/api/tables': 'tables:read',
  '/api/staff': 'staff:read',
  '/api/menu': 'menu:read',
  '/api/analytics': 'analytics:read',
} as const;

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Skip middleware for public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }
  
  // Skip middleware for API routes that don't require auth
  if (isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }
  
  // Get authentication token
  const token = request.cookies.get('qr_auth_token')?.value;
  
  if (!token) {
    return redirectToLogin(request);
  }
  
  try {
    // Handle legacy token conversion
    let finalToken = token;
    if (LegacyTokenAdapter.isLegacyToken(token)) {
      finalToken = await LegacyTokenAdapter.convertLegacyToken(token);
    }
    
    // Validate token
    const validation = await AuthServiceV2.validateToken(finalToken);
    if (!validation.isValid) {
      return redirectToLogin(request);
    }
    
    const payload = validation.payload;
    
    // Check route permissions
    const requiredPermission = getRequiredPermission(pathname);
    if (requiredPermission) {
      if (!payload.permissions.includes(requiredPermission)) {
        // Log permission denied
        await AuditLogger.logPermissionDenied(
          payload.userId,
          pathname,
          requiredPermission,
          payload.sessionId
        );
        
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
    }
    
    // Add user context to request headers
    const response = NextResponse.next();
    response.headers.set('x-user-id', payload.userId);
    response.headers.set('x-user-email', payload.email);
    response.headers.set('x-user-role', payload.currentRole.roleTemplate);
    response.headers.set('x-user-permissions', JSON.stringify(payload.permissions));
    response.headers.set('x-session-id', payload.sessionId);
    
    if (payload.restaurantContext) {
      response.headers.set('x-restaurant-id', payload.restaurantContext.id);
    }
    
    return response;
  } catch (error) {
    console.error('Middleware error:', error);
    return redirectToLogin(request);
  }
}

function isPublicRoute(pathname: string): boolean {
  const publicRoutes = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/qr/',
    '/menu/',
    '/_next/',
    '/favicon.ico',
    '/api/auth/login',
    '/api/auth/register',
    '/api/qr/',
    '/api/menu/',
  ];
  
  return publicRoutes.some(route => pathname.startsWith(route));
}

function isPublicApiRoute(pathname: string): boolean {
  const publicApiRoutes = [
    '/api/qr/',
    '/api/menu/',
    '/api/health',
  ];
  
  return publicApiRoutes.some(route => pathname.startsWith(route));
}

function getRequiredPermission(pathname: string): string | null {
  // Find the most specific route match
  const routes = Object.keys(ROUTE_PERMISSIONS).sort((a, b) => b.length - a.length);
  
  for (const route of routes) {
    if (pathname.startsWith(route)) {
      return ROUTE_PERMISSIONS[route];
    }
  }
  
  return null;
}

function redirectToLogin(request: NextRequest): NextResponse {
  const redirectUrl = new URL('/login', request.url);
  redirectUrl.searchParams.set('redirect', request.nextUrl.pathname);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/((?!auth|qr|menu|health).)*',
  ],
};
```

**Action Items:**
- [ ] Update middleware with permission checking
- [ ] Add legacy token handling
- [ ] Implement audit logging for permission denials
- [ ] Add user context headers
- [ ] Update route protection configuration

---

## Phase 3: UI Enhancement & Role Context (Week 4)

### Phase 3.1: Create Role Context System (Day 14-15)

#### Step 3.1.1: Implement Role Context Providers
**Files to create:**
- `src/components/rbac/RoleProvider.tsx`
- `src/components/rbac/PermissionGuard.tsx`
- `src/components/rbac/RoleSwitcher.tsx`

**Role Context Provider:**
```typescript
// src/components/rbac/RoleProvider.tsx
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserRole, EnhancedJWTPayload } from '@/lib/rbac/types';

interface RoleContextType {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  currentRole: UserRole | null;
  availableRoles: UserRole[];
  permissions: string[];
  sessionId: string | null;
  restaurantContext: any | null;
  isLoading: boolean;
  switchRole: (roleId: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  refresh: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | null>(null);

export function useRole(): RoleContextType {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RoleContextType['user']>(null);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restaurantContext, setRestaurantContext] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const fetchUserInfo = async () => {
    try {
      const response = await fetch('/api/auth/me');
      const data = await response.json();
      
      if (response.ok) {
        setUser(data.user);
        setCurrentRole(data.user.currentRole);
        setAvailableRoles(data.user.availableRoles);
        setPermissions(data.user.permissions);
        setSessionId(data.user.sessionId);
        setRestaurantContext(data.restaurant);
      } else {
        // Handle authentication errors
        console.error('Failed to fetch user info:', data.error);
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Error fetching user info:', error);
      window.location.href = '/login';
    } finally {
      setIsLoading(false);
    }
  };
  
  const switchRole = async (roleId: string): Promise<void> => {
    try {
      const response = await fetch('/api/auth/switch-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newRoleId: roleId }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setCurrentRole(data.currentRole);
        setPermissions(data.permissions);
        
        // Refresh the page to reload data with new role context
        window.location.reload();
      } else {
        throw new Error(data.error || 'Role switch failed');
      }
    } catch (error) {
      console.error('Role switch error:', error);
      throw error;
    }
  };
  
  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };
  
  const hasAnyPermission = (requiredPermissions: string[]): boolean => {
    return requiredPermissions.some(permission => permissions.includes(permission));
  };
  
  const hasAllPermissions = (requiredPermissions: string[]): boolean => {
    return requiredPermissions.every(permission => permissions.includes(permission));
  };
  
  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    await fetchUserInfo();
  };
  
  useEffect(() => {
    fetchUserInfo();
  }, []);
  
  const contextValue: RoleContextType = {
    user,
    currentRole,
    availableRoles,
    permissions,
    sessionId,
    restaurantContext,
    isLoading,
    switchRole,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refresh,
  };
  
  return (
    <RoleContext.Provider value={contextValue}>
      {children}
    </RoleContext.Provider>
  );
}
```

**Action Items:**
- [ ] Create role context provider
- [ ] Add user info fetching
- [ ] Implement role switching
- [ ] Add permission checking utilities
- [ ] Create error handling

#### Step 3.1.2: Create Permission Guard Component
**Files to create:**
- `src/components/rbac/PermissionGuard.tsx`

**Permission Guard Component:**
```typescript
// src/components/rbac/PermissionGuard.tsx
'use client';

import { ReactNode } from 'react';
import { useRole } from './RoleProvider';

interface PermissionGuardProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGuard({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGuardProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = useRole();
  
  let hasAccess = false;
  
  if (permission) {
    hasAccess = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    hasAccess = requireAll 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  } else {
    // If no permissions specified, allow access
    hasAccess = true;
  }
  
  if (!hasAccess) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// Convenience components for common permission patterns
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permission="admin:access" fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function OwnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permission="restaurant:write" fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}

export function StaffOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <PermissionGuard permissions={['orders:read', 'tables:read']} fallback={fallback}>
      {children}
    </PermissionGuard>
  );
}
```

**Action Items:**
- [ ] Create permission guard component
- [ ] Add convenience components
- [ ] Implement permission checking logic
- [ ] Add fallback handling
- [ ] Create usage examples

#### Step 3.1.3: Create Role Switcher Component
**Files to create:**
- `src/components/rbac/RoleSwitcher.tsx`

**Role Switcher Component:**
```typescript
// src/components/rbac/RoleSwitcher.tsx
'use client';

import { useState } from 'react';
import { useRole } from './RoleProvider';
import { UserRole } from '@/lib/rbac/types';
import { ChevronDown, User, Building, Shield } from 'lucide-react';

export function RoleSwitcher() {
  const { currentRole, availableRoles, switchRole } = useRole();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  if (availableRoles.length <= 1) {
    return null; // Don't show switcher if user has only one role
  }
  
  const handleRoleSwitch = async (roleId: string) => {
    if (roleId === currentRole?.id) {
      setIsOpen(false);
      return;
    }
    
    setIsLoading(true);
    try {
      await switchRole(roleId);
      setIsOpen(false);
    } catch (error) {
      console.error('Role switch failed:', error);
      // Handle error (show toast, etc.)
    } finally {
      setIsLoading(false);
    }
  };
  
  const getRoleIcon = (role: UserRole) => {
    switch (role.userType) {
      case 'platform_admin':
        return <Shield className="h-4 w-4" />;
      case 'restaurant_owner':
        return <Building className="h-4 w-4" />;
      case 'staff':
        return <User className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };
  
  const getRoleLabel = (role: UserRole) => {
    const labels = {
      restaurant_owner: 'Restaurant Owner',
      manager: 'Manager',
      kitchen_staff: 'Kitchen Staff',
      server_staff: 'Server',
      platform_admin: 'Platform Admin',
    };
    return labels[role.roleTemplate] || role.roleTemplate;
  };
  
  const getRoleColor = (role: UserRole) => {
    const colors = {
      restaurant_owner: 'bg-purple-100 text-purple-800',
      manager: 'bg-blue-100 text-blue-800',
      kitchen_staff: 'bg-orange-100 text-orange-800',
      server_staff: 'bg-green-100 text-green-800',
      platform_admin: 'bg-red-100 text-red-800',
    };
    return colors[role.roleTemplate] || 'bg-gray-100 text-gray-800';
  };
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {getRoleIcon(currentRole!)}
        <span>{getRoleLabel(currentRole!)}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-md shadow-lg z-50">
          <div className="py-1">
            <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">
              Switch Role
            </div>
            {availableRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => handleRoleSwitch(role.id)}
                disabled={isLoading}
                className={`w-full flex items-center space-x-3 px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 ${
                  role.id === currentRole?.id ? 'bg-blue-50' : ''
                }`}
              >
                {getRoleIcon(role)}
                <div className="flex-1 text-left">
                  <div className="font-medium">{getRoleLabel(role)}</div>
                  {role.restaurantId && (
                    <div className="text-xs text-gray-500">
                      Restaurant ID: {role.restaurantId.substring(0, 8)}...
                    </div>
                  )}
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded ${getRoleColor(role)}`}>
                  {role.userType.replace('_', ' ')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Action Items:**
- [ ] Create role switcher component
- [ ] Add role switching logic
- [ ] Implement role icons and labels
- [ ] Add loading states
- [ ] Create error handling

### Phase 3.2: Update Dashboard Components (Day 16-17)

#### Step 3.2.1: Update Dashboard Layout
**Files to modify:**
- `src/components/dashboard/DashboardLayout.tsx`

**Enhanced Dashboard Layout:**
```typescript
// src/components/dashboard/DashboardLayout.tsx
'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  Home, 
  ClipboardList, 
  ChefHat, 
  UtensilsCrossed, 
  Users, 
  BarChart3, 
  Settings,
  Menu,
  X,
  LogOut
} from 'lucide-react';
import { useRole } from '@/components/rbac/RoleProvider';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { RoleSwitcher } from '@/components/rbac/RoleSwitcher';
import { NotificationBell } from './NotificationBell';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, currentRole, restaurantContext, isLoading } = useRole();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }
  
  if (!user || !currentRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-red-600 mb-4">Authentication required</p>
          <button
            onClick={() => router.push('/login')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }
  
  // Navigation items with permission requirements
  const navigationItems = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: Home,
      current: pathname === '/dashboard',
      permission: null,
    },
    {
      name: 'Orders',
      href: '/dashboard/orders',
      icon: ClipboardList,
      current: pathname.startsWith('/dashboard/orders'),
      permission: 'orders:read',
    },
    {
      name: 'Tables',
      href: '/dashboard/tables',
      icon: ChefHat,
      current: pathname.startsWith('/dashboard/tables'),
      permission: 'tables:read',
    },
    {
      name: 'Kitchen',
      href: '/dashboard/kitchen',
      icon: UtensilsCrossed,
      current: pathname.startsWith('/dashboard/kitchen'),
      permission: 'orders:kitchen',
    },
    {
      name: 'Menu',
      href: '/dashboard/menu',
      icon: UtensilsCrossed,
      current: pathname.startsWith('/dashboard/menu'),
      permission: 'menu:read',
    },
    {
      name: 'Staff',
      href: '/dashboard/staff',
      icon: Users,
      current: pathname.startsWith('/dashboard/staff'),
      permission: 'staff:read',
    },
    {
      name: 'Reports',
      href: '/dashboard/reports',
      icon: BarChart3,
      current: pathname.startsWith('/dashboard/reports'),
      permission: 'analytics:read',
    },
    {
      name: 'Settings',
      href: '/dashboard/settings',
      icon: Settings,
      current: pathname.startsWith('/dashboard/settings'),
      permission: 'settings:read',
    },
  ];
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-40 lg:hidden ${isSidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setIsSidebarOpen(false)}></div>
        <div className="relative flex flex-col w-64 bg-white h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <span className="text-lg font-semibold text-gray-900">Menu</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-4 space-y-2">
            {navigationItems.map((item) => (
              <PermissionGuard key={item.name} permission={item.permission}>
                <Link
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    item.current
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              </PermissionGuard>
            ))}
          </nav>
        </div>
      </div>
      
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex items-center flex-shrink-0 px-4 py-5 border-b border-gray-200">
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-gray-900">
                {restaurantContext?.name || 'Dashboard'}
              </h1>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs text-gray-500">Role:</span>
                <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                  {currentRole.roleTemplate.replace('_', ' ')}
                </span>
              </div>
            </div>
          </div>
          
          <nav className="flex-1 px-4 py-4 space-y-2">
            {navigationItems.map((item) => (
              <PermissionGuard key={item.name} permission={item.permission}>
                <Link
                  href={item.href}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium ${
                    item.current
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              </PermissionGuard>
            ))}
          </nav>
          
          <div className="flex-shrink-0 border-t border-gray-200 p-4">
            <div className="flex items-center mb-3">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {user.firstName[0]}{user.lastName[0]}
                  </span>
                </div>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-gray-500">
                  {user.email}
                </p>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium flex items-center justify-center"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="lg:hidden mr-4 text-gray-400 hover:text-gray-600"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <h1 className="text-xl font-semibold text-gray-900">
                  {pathname === '/dashboard' ? 'Dashboard' :
                   pathname.includes('/orders') ? 'Orders' :
                   pathname.includes('/tables') ? 'Tables' :
                   pathname.includes('/kitchen') ? 'Kitchen Display' :
                   pathname.includes('/menu') ? 'Menu Management' :
                   pathname.includes('/staff') ? 'Staff Management' :
                   pathname.includes('/reports') ? 'Reports' :
                   pathname.includes('/settings') ? 'Settings' : 'Dashboard'}
                </h1>
              </div>
              
              <div className="flex items-center space-x-4">
                {/* Role Switcher */}
                <RoleSwitcher />
                
                {/* Notifications */}
                <PermissionGuard permission="notifications:read">
                  <NotificationBell />
                </PermissionGuard>
                
                {/* Restaurant Time */}
                {restaurantContext && (
                  <div className="text-sm text-gray-500">
                    {new Date().toLocaleString('en-US', {
                      timeZone: restaurantContext.timezone,
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                )}
                
                {/* Mobile logout */}
                <div className="lg:hidden">
                  <button
                    onClick={handleLogout}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm flex items-center"
                  >
                    <LogOut className="h-4 w-4 mr-1" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
```

**Action Items:**
- [ ] Update dashboard layout with RBAC
- [ ] Add role switcher to header
- [ ] Implement permission-based navigation
- [ ] Add role context indicators
- [ ] Update user information display

#### Step 3.2.2: Update App Layout
**Files to modify:**
- `src/app/layout.tsx`

**Updated App Layout:**
```typescript
// src/app/layout.tsx
import { Inter } from 'next/font/google';
import './globals.css';
import { RoleProvider } from '@/components/rbac/RoleProvider';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <RoleProvider>
          {children}
        </RoleProvider>
      </body>
    </html>
  );
}
```

**Action Items:**
- [ ] Add role provider to app layout
- [ ] Ensure proper context wrapping
- [ ] Update global styles if needed
- [ ] Test context availability

### Phase 3.3: Update Page Components (Day 18)

#### Step 3.3.1: Update Kitchen Display Page
**Files to modify:**
- `src/app/dashboard/kitchen/page.tsx`

**Updated Kitchen Page:**
```typescript
// src/app/dashboard/kitchen/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/components/rbac/RoleProvider';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { KitchenDisplayBoard } from '@/components/kitchen/KitchenDisplayBoard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';

function KitchenContent() {
  const router = useRouter();
  const { hasPermission } = useRole();
  
  useEffect(() => {
    if (!hasPermission('orders:kitchen')) {
      router.push('/dashboard');
    }
  }, [hasPermission, router]);
  
  return (
    <PermissionGuard 
      permission="orders:kitchen"
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Access Denied</h2>
            <p className="text-gray-300 mb-4">You don't have permission to access the kitchen display.</p>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      }
    >
      <KitchenDisplayBoard />
    </PermissionGuard>
  );
}

export default function KitchenPage() {
  return (
    <DashboardLayout>
      <KitchenContent />
    </DashboardLayout>
  );
}
```

**Action Items:**
- [ ] Update kitchen page with RBAC
- [ ] Add permission guards
- [ ] Update access control logic
- [ ] Test permission enforcement

#### Step 3.3.2: Update Tables Page
**Files to modify:**
- `src/app/dashboard/tables/page.tsx`

**Updated Tables Page:**
```typescript
// src/app/dashboard/tables/page.tsx
'use client';

import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { useRole } from '@/components/rbac/RoleProvider';
// ... existing imports

function TablesContent() {
  const { hasPermission } = useRole();
  // ... existing component logic
  
  return (
    <div className="p-6 space-y-6">
      {/* Existing tables content */}
      
      {/* Add permission-based actions */}
      <PermissionGuard permission="tables:write">
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
        >
          Add Table
        </button>
      </PermissionGuard>
      
      {/* Rest of existing content */}
    </div>
  );
}

export default function TablesPage() {
  return (
    <DashboardLayout>
      <PermissionGuard permission="tables:read">
        <TablesContent />
      </PermissionGuard>
    </DashboardLayout>
  );
}
```

**Action Items:**
- [ ] Update tables page with RBAC
- [ ] Add permission-based actions
- [ ] Update component access controls
- [ ] Test permission enforcement

---

## Phase 4: Advanced Features & Testing (Week 5-6)

### Phase 4.1: Advanced RBAC Features (Day 19-21)

#### Step 4.1.1: Implement Dynamic Permission Management
**Files to create:**
- `src/app/admin/permissions/page.tsx`
- `src/components/admin/PermissionManager.tsx`

**Permission Management Interface:**
```typescript
// src/components/admin/PermissionManager.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRole } from '@/components/rbac/RoleProvider';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';

interface Permission {
  id: string;
  permissionKey: string;
  description: string;
  category: string;
  isActive: boolean;
}

interface RoleTemplate {
  template: string;
  permissions: string[];
}

export function PermissionManager() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  
  useEffect(() => {
    fetchPermissions();
    fetchRoleTemplates();
  }, []);
  
  const fetchPermissions = async () => {
    try {
      const response = await fetch('/api/admin/permissions');
      const data = await response.json();
      if (response.ok) {
        setPermissions(data.permissions);
      }
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
    }
  };
  
  const fetchRoleTemplates = async () => {
    try {
      const response = await fetch('/api/admin/role-templates');
      const data = await response.json();
      if (response.ok) {
        setRoleTemplates(data.templates);
      }
    } catch (error) {
      console.error('Failed to fetch role templates:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  const updateRolePermissions = async (template: string, permissions: string[]) => {
    try {
      const response = await fetch(`/api/admin/role-templates/${template}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ permissions }),
      });
      
      if (response.ok) {
        await fetchRoleTemplates();
      }
    } catch (error) {
      console.error('Failed to update role permissions:', error);
    }
  };
  
  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.category]) {
      acc[permission.category] = [];
    }
    acc[permission.category].push(permission);
    return acc;
  }, {} as Record<string, Permission[]>);
  
  if (isLoading) {
    return <div className="p-6">Loading permissions...</div>;
  }
  
  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Permission Management</h1>
        <PermissionGuard permission="admin:permissions:write">
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
          >
            Add Permission
          </button>
        </PermissionGuard>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Templates */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Role Templates</h2>
          <div className="space-y-2">
            {roleTemplates.map((template) => (
              <button
                key={template.template}
                onClick={() => setSelectedTemplate(template.template)}
                className={`w-full text-left p-3 rounded border ${
                  selectedTemplate === template.template
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="font-medium">{template.template.replace('_', ' ')}</div>
                <div className="text-sm text-gray-500">
                  {template.permissions.length} permissions
                </div>
              </button>
            ))}
          </div>
        </div>
        
        {/* Permissions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">
            Permissions
            {selectedTemplate && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                for {selectedTemplate.replace('_', ' ')}
              </span>
            )}
          </h2>
          
          {selectedTemplate ? (
            <div className="space-y-4">
              {Object.entries(groupedPermissions).map(([category, categoryPermissions]) => (
                <div key={category} className="border rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-2 capitalize">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {categoryPermissions.map((permission) => {
                      const template = roleTemplates.find(t => t.template === selectedTemplate);
                      const hasPermission = template?.permissions.includes(permission.permissionKey);
                      
                      return (
                        <label
                          key={permission.id}
                          className="flex items-center space-x-3 p-2 rounded hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={hasPermission}
                            onChange={(e) => {
                              if (template) {
                                const newPermissions = e.target.checked
                                  ? [...template.permissions, permission.permissionKey]
                                  : template.permissions.filter(p => p !== permission.permissionKey);
                                updateRolePermissions(selectedTemplate, newPermissions);
                              }
                            }}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-sm">{permission.permissionKey}</div>
                            <div className="text-xs text-gray-500">{permission.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              Select a role template to view permissions
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Action Items:**
- [ ] Create permission management interface
- [ ] Add role template management
- [ ] Implement permission assignment
- [ ] Add permission validation
- [ ] Create permission audit trail

#### Step 4.1.2: Implement User Role Management
**Files to create:**
- `src/app/admin/users/page.tsx`
- `src/components/admin/UserRoleManager.tsx`

**Action Items:**
- [ ] Create user role management interface
- [ ] Add user role assignment
- [ ] Implement role history tracking
- [ ] Add bulk role operations
- [ ] Create role analytics

### Phase 4.2: Testing & Validation (Day 22-24)

#### Step 4.2.1: Create Comprehensive Test Suite
**Files to create:**
- `__tests__/rbac/auth-service.test.ts`
- `__tests__/rbac/permission-manager.test.ts`
- `__tests__/rbac/session-manager.test.ts`

**Test Strategy:**
```typescript
// __tests__/rbac/auth-service.test.ts
describe('AuthServiceV2', () => {
  describe('authenticate', () => {
    it('should authenticate user with correct credentials', async () => {
      // Test authentication
    });
    
    it('should compute correct permissions for user role', async () => {
      // Test permission computation
    });
    
    it('should create session with correct context', async () => {
      // Test session creation
    });
  });
  
  describe('switchRole', () => {
    it('should switch role successfully', async () => {
      // Test role switching
    });
    
    it('should update permissions after role switch', async () => {
      // Test permission updates
    });
    
    it('should log audit trail for role switch', async () => {
      // Test audit logging
    });
  });
});
```

**Action Items:**
- [ ] Create unit tests for all RBAC components
- [ ] Add integration tests for authentication flow
- [ ] Create performance tests for permission checking
- [ ] Add security tests for token validation
- [ ] Create migration tests

#### Step 4.2.2: Create Manual Testing Procedures
**Files to create:**
- `TESTING-PROCEDURES.md`

**Testing Procedures:**
```markdown
# RBAC Testing Procedures

## Test Scenarios

### Authentication Tests
1. **Login with Different User Types**
   - Test owner login
   - Test staff login
   - Test admin login
   - Verify correct permissions assigned

2. **Role Switching Tests**
   - Test switching between available roles
   - Verify permission updates
   - Test UI updates after role switch

3. **Permission Enforcement Tests**
   - Test access to restricted routes
   - Test permission-based UI elements
   - Test API endpoint protection

### Security Tests
1. **Token Validation Tests**
   - Test expired token handling
   - Test invalid token rejection
   - Test session validation

2. **Permission Bypass Tests**
   - Test direct route access
   - Test API endpoint security
   - Test client-side permission bypass

### Performance Tests
1. **Permission Checking Performance**
   - Test permission computation speed
   - Test middleware performance
   - Test UI rendering performance
```

**Action Items:**
- [ ] Create comprehensive testing procedures
- [ ] Add security testing checklist
- [ ] Create performance benchmarks
- [ ] Add user acceptance testing scripts
- [ ] Create rollback testing procedures

---

## Phase 5: Deployment & Cleanup (Week 7)

### Phase 5.1: Production Deployment (Day 25-26)

#### Step 5.1.1: Create Deployment Scripts
**Files to create:**
- `scripts/migrate-rbac.sh`
- `scripts/rollback-rbac.sh`

**Deployment Strategy:**
```bash
#!/bin/bash
# scripts/migrate-rbac.sh

echo "Starting RBAC migration..."

# 1. Backup current database
echo "Creating database backup..."
pg_dump $DATABASE_URL > rbac_migration_backup.sql

# 2. Run migrations
echo "Running database migrations..."
npx prisma migrate deploy

# 3. Seed permissions and roles
echo "Seeding permissions and roles..."
npx prisma db seed

# 4. Migrate existing users
echo "Migrating existing users..."
node scripts/migrate-users.js

# 5. Verify migration
echo "Verifying migration..."
node scripts/verify-migration.js

echo "RBAC migration completed successfully!"
```

**Action Items:**
- [ ] Create deployment automation scripts
- [ ] Add database migration scripts
- [ ] Create rollback procedures
- [ ] Add deployment verification
- [ ] Create monitoring setup

#### Step 5.1.2: Update Documentation
**Files to create:**
- `RBAC-SYSTEM-DOCUMENTATION.md`
- `API-DOCUMENTATION.md`

**Action Items:**
- [ ] Create comprehensive system documentation
- [ ] Update API documentation
- [ ] Create user guides
- [ ] Add troubleshooting guides
- [ ] Create maintenance procedures

### Phase 5.2: Legacy System Cleanup (Day 27-28)

#### Step 5.2.1: Remove Legacy Code
**Files to remove/modify:**
- Remove legacy authentication logic
- Clean up old cookie handling
- Remove deprecated API endpoints

**Action Items:**
- [ ] Remove legacy authentication code
- [ ] Clean up old cookie handling
- [ ] Remove deprecated endpoints
- [ ] Update error handling
- [ ] Clean up unused imports

#### Step 5.2.2: Final Testing & Validation
**Action Items:**
- [ ] Run comprehensive test suite
- [ ] Perform security audit
- [ ] Test performance benchmarks
- [ ] Validate user workflows
- [ ] Confirm rollback procedures

---

## Risk Management

### High-Risk Areas
1. **Data Migration**: Risk of data loss during user migration
2. **Session Management**: Risk of session conflicts during transition
3. **Permission Enforcement**: Risk of access control bypasses
4. **Performance Impact**: Risk of decreased system performance

### Mitigation Strategies
1. **Comprehensive Backups**: Full database backups before each phase
2. **Staged Rollout**: Gradual feature deployment with rollback capability
3. **Monitoring**: Real-time monitoring of system performance and errors
4. **Testing**: Extensive testing at each phase before proceeding

### Rollback Plan
1. **Database Rollback**: Scripts to restore previous database state
2. **Code Rollback**: Git-based rollback to previous stable version
3. **Session Cleanup**: Scripts to clean up any orphaned sessions
4. **User Communication**: Procedures to inform users of any issues

---

## Success Metrics

### Security Metrics
- [ ] Zero session mixing incidents
- [ ] 100% permission enforcement coverage
- [ ] Complete audit trail for all role changes
- [ ] Zero unauthorized access attempts

### Performance Metrics
- [ ] <100ms permission checking latency
- [ ] <200ms role switching time
- [ ] <500ms middleware processing time
- [ ] Zero impact on customer ordering performance

### User Experience Metrics
- [ ] Seamless role switching experience
- [ ] Clear role context indicators
- [ ] Intuitive permission-based UI
- [ ] Zero user confusion incidents

---

## Timeline Summary

| Phase | Duration | Key Deliverables |
|-------|----------|------------------|
| Phase 1 | Week 1-2 | Core RBAC system, database schema, enhanced JWT |
| Phase 2 | Week 3 | Migration layer, updated endpoints, enhanced middleware |
| Phase 3 | Week 4 | Role-aware UI, permission guards, role switcher |
| Phase 4 | Week 5-6 | Advanced features, comprehensive testing |
| Phase 5 | Week 7 | Production deployment, legacy cleanup |

---

## Appendices

### Appendix A: Database Schema Changes
- Complete DDL for new tables
- Migration scripts
- Rollback procedures

### Appendix B: API Changes
- New endpoint specifications
- Updated request/response formats
- Authentication requirements

### Appendix C: UI Component Changes
- Component API changes
- New component specifications
- Style guide updates

---

*This document is a living reference that will be updated throughout the implementation process. All changes will be tracked and documented.*

**Last Updated**: [Current Date]  
**Version**: 1.0  
**Status**: Ready for Implementation