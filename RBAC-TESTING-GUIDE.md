# RBAC Implementation Testing Guide

## Overview
This document provides comprehensive step-by-step testing procedures to validate the Role-Based Access Control (RBAC) implementation in Tabtep. Follow these tests systematically to ensure all features work correctly.

## Quick Start

### Ready to Test? Follow These Steps:

1. **Start the server**: `npm run dev`
2. **Open your browser**: Go to `http://localhost:3000/login`
3. **Login as Platform Admin**: 
   - Email: `admin@qrorder.com`
   - Password: `admin123`
4. **Navigate to**: `http://localhost:3000/admin/permissions`
5. **Begin systematic testing** using the guide below

## Prerequisites

### Test Environment Setup
1. **Server Running**: Start the development server
   ```bash
   npm run dev  
   ```

2. **Database Seeded**: Ensure test data is available (✅ Already completed)
   ```bash
   npm run db:seed
   ```

3. **Test Accounts**: The following test accounts are available after seeding:
   - **Platform Admin**: `admin@qrorder.com` / `admin123`
   - **Restaurant Owner**: `mario@rossigroup.com` / `owner123`
   - **Staff Manager**: `mario@marios-authentic.com` / `staff123`
   - **Staff Waiter**: `luigi@marios-authentic.com` / `staff123`
   - **Staff Kitchen**: `giuseppe@marios-authentic.com` / `staff123`

## Testing Structure

### Phase 1: Authentication & Access Control Testing
### Phase 2: Admin Permission Management Testing
### Phase 3: User Role Management Testing
### Phase 4: Security & Authorization Testing
### Phase 5: Integration & Edge Case Testing

---

## Phase 1: Authentication & Access Control Testing

### Test 1.1: Platform Admin Login & Access
**Objective**: Verify platform admin can access all admin features

**Steps**:
1. Navigate to `http://localhost:3000/login`
2. Login with Platform Admin credentials:
   - Email: `admin@qrorder.com`
   - Password: `admin123`
3. Verify redirect to admin dashboard: `http://localhost:3000/admin/dashboard`
4. Check navigation menu includes:
   - Dashboard
   - Users
   - Permissions
   - Restaurants
   - Settings
   - Analytics

**Expected Results**:
- ✅ Successful login
- ✅ Access to all admin sections
- ✅ No access denied errors

### Test 1.2: Restaurant Owner Login & Access Restrictions
**Objective**: Verify restaurant owners cannot access admin features

**Steps**:
1. Logout from admin account
2. Login with Restaurant Owner credentials:
   - Email: `mario@rossigroup.com`
   - Password: `owner123`
3. Verify redirect to owner dashboard: `http://localhost:3000/owner/dashboard`
4. Attempt to access admin URLs directly:
   - `http://localhost:3000/admin/dashboard`
   - `http://localhost:3000/admin/users`
   - `http://localhost:3000/admin/permissions`

**Expected Results**:
- ✅ Successful owner login
- ✅ Redirect to owner dashboard
- ❌ Access denied to all admin URLs (403 or redirect)

### Test 1.3: Staff Login & Access Restrictions
**Objective**: Verify staff cannot access admin or owner features

**Steps**:
1. Logout from owner account
2. Login with Staff credentials:
   - Email: `mario@marios-authentic.com`
   - Password: `staff123`
3. Verify redirect to staff dashboard: `http://localhost:3000/dashboard`
4. Attempt to access restricted URLs:
   - `http://localhost:3000/admin/dashboard`
   - `http://localhost:3000/owner/dashboard`

**Expected Results**:
- ✅ Successful staff login
- ✅ Access to staff features only
- ❌ Access denied to admin and owner features

---

## Phase 2: Admin Permission Management Testing

### Test 2.1: Permission Management Interface
**Objective**: Test the admin permissions page functionality

**Steps** (logged in as Platform Admin):
1. Navigate to `http://localhost:3000/admin/permissions`
2. Verify page loads with:
   - Permission list table
   - Search functionality
   - Category filter dropdown
   - "Create Permission" button
3. Test search functionality:
   - Search for "users"
   - Verify filtering works
4. Test category filtering:
   - Select "Users" category
   - Verify only user-related permissions show

**Expected Results**:
- ✅ Permission management page loads
- ✅ All permissions displayed in table format
- ✅ Search and filter functions work correctly
- ✅ No JavaScript errors in console

### Test 2.2: Create New Permission
**Objective**: Test creating new permissions

**Steps**:
1. On permissions page, click "Create Permission"
2. Fill out permission form:
   - Permission Key: `test:read`
   - Description: `Test read permission`
   - Category: `test`
3. Submit form
4. Verify new permission appears in list
5. Search for the new permission to confirm it exists

**Expected Results**:
- ✅ Permission creation form opens
- ✅ Form validation works
- ✅ New permission created successfully
- ✅ Permission visible in list

### Test 2.3: Edit Existing Permission
**Objective**: Test editing permission details

**Steps**:
1. Find an existing permission in the list
2. Click edit button (pencil icon)
3. Modify the description
4. Save changes
5. Verify changes are reflected in the list

**Expected Results**:
- ✅ Edit form pre-populated with current values
- ✅ Changes saved successfully
- ✅ Updated information displayed

### Test 2.4: Permission Analytics & Statistics
**Objective**: Test permission usage analytics

**Steps**:
1. Scroll to permission statistics section
2. Verify display of:
   - Total permissions count
   - Permissions by category
   - Active vs inactive permissions
3. Check that numbers are accurate

**Expected Results**:
- ✅ Statistics display correctly
- ✅ Numbers match actual permission counts
- ✅ Category breakdown is accurate

---

## Phase 3: User Role Management Testing

### Test 3.1: User Management Interface
**Objective**: Test the admin users page functionality

**Steps** (logged in as Platform Admin):
1. Navigate to `http://localhost:3000/admin/users`
2. Verify page loads with:
   - User list table with role information
   - Search functionality
   - User type filter
   - "Assign Role" button
3. Test user search:
   - Search by email
   - Search by name
4. Test user type filtering:
   - Filter by "Staff"
   - Filter by "Restaurant Owner"

**Expected Results**:
- ✅ User management page loads
- ✅ All users displayed with current roles
- ✅ Search and filter functions work
- ✅ Role information correctly displayed

### Test 3.2: Role Assignment
**Objective**: Test assigning roles to users

**Steps**:
1. Click "Assign Role" button
2. Select a user from dropdown
3. Choose role template (e.g., "Manager")
4. Select restaurant (if applicable)
5. Add custom permissions (optional)
6. Submit role assignment
7. Verify new role appears in user's role list

**Expected Results**:
- ✅ Role assignment form works correctly
- ✅ Restaurant selection appears for staff roles
- ✅ Custom permissions can be added
- ✅ Role assigned successfully

### Test 3.3: Role Modification
**Objective**: Test modifying existing user roles

**Steps**:
1. Find a user with existing roles
2. Click "Edit Role" button
3. Modify role template or custom permissions
4. Save changes
5. Verify role updates are reflected
6. Check audit log shows the change

**Expected Results**:
- ✅ Role modification form pre-populated
- ✅ Changes saved successfully
- ✅ Updated role information displayed
- ✅ Audit trail created

### Test 3.4: Role Removal
**Objective**: Test removing roles from users

**Steps**:
1. Find a user with multiple roles
2. Click "Remove Role" button on one role
3. Confirm removal in dialog
4. Verify role is removed from user
5. Ensure user still has at least one role

**Expected Results**:
- ✅ Role removal confirmation dialog appears
- ✅ Role removed successfully
- ✅ User retains at least one role (system prevents removing last role)
- ✅ Audit log records removal

### Test 3.5: Bulk Role Operations
**Objective**: Test bulk role assignment/removal

**Steps**:
1. Click "Bulk Operations" button
2. Select multiple users from list
3. Choose operation (Assign/Remove role)
4. Configure role settings
5. Execute bulk operation
6. Verify all selected users are updated

**Expected Results**:
- ✅ Bulk operation interface functional
- ✅ Multiple user selection works
- ✅ Bulk operation executes successfully
- ✅ All targeted users updated correctly

---

## Phase 4: Security & Authorization Testing

### Test 4.1: Permission-Based UI Elements
**Objective**: Verify UI elements show/hide based on permissions

**Steps**:
1. Login as Platform Admin
2. Navigate to admin pages and note all visible buttons/sections
3. Login as Restaurant Owner
4. Try accessing same pages - verify restricted elements hidden
5. Login as Staff
6. Verify even more restrictions in place

**Expected Results**:
- ✅ Platform admin sees all features
- ✅ Restaurant owner sees limited features
- ✅ Staff sees minimal admin features
- ✅ No unauthorized buttons/links visible

### Test 4.2: API Endpoint Security
**Objective**: Test API endpoint protection

**Steps**:
1. Open browser developer tools (F12)
2. Go to Network tab
3. While logged in as staff, attempt to access admin API:
   - Try: `GET /api/admin/permissions`
   - Try: `POST /api/admin/users` (create role)
   - Try: `DELETE /api/admin/permissions/[id]`
4. Check response status codes

**Expected Results**:
- ✅ All unauthorized API calls return 403 Forbidden
- ✅ No sensitive data leaked in error responses
- ✅ Proper error messages returned

### Test 4.3: Session Management
**Objective**: Test session handling and timeouts

**Steps**:
1. Login as Platform Admin
2. Note session cookie in browser dev tools
3. Wait for session timeout (or manually expire)
4. Try to access admin pages
5. Verify redirect to login
6. Login again and verify session restored

**Expected Results**:
- ✅ Expired sessions redirect to login
- ✅ Fresh login creates new session
- ✅ Session data properly managed

### Test 4.4: Cross-Restaurant Data Isolation
**Objective**: Ensure users can only access their restaurant's data

**Steps**:
1. Login as Restaurant Owner
2. Note current restaurant ID in URL/context
3. Try to modify URL to access different restaurant:
   - Change restaurant ID in URL
   - Try to access another restaurant's data
4. Verify access denied

**Expected Results**:
- ✅ Users cannot access other restaurants' data
- ✅ Proper access control enforcement
- ✅ Error handling for unauthorized access

---

## Phase 5: Integration & Edge Case Testing

### Test 5.1: Role Template Management
**Objective**: Test role template functionality

**Steps**:
1. Navigate to role template management (if available)
2. Create new role template:
   - Name: "Test Manager"
   - Permissions: Select multiple permissions
3. Save template
4. Assign template to a user
5. Verify user receives all template permissions

**Expected Results**:
- ✅ Role template created successfully
- ✅ Template can be assigned to users
- ✅ Users inherit template permissions

### Test 5.2: Audit Logging
**Objective**: Verify audit trails are created

**Steps**:
1. Perform various RBAC operations:
   - Create permission
   - Assign role
   - Remove role
   - Modify permissions
2. Check audit logs (if accessible via UI)
3. Verify all actions are logged with:
   - Timestamp
   - User who performed action
   - Action details
   - Target user/resource

**Expected Results**:
- ✅ All RBAC actions logged
- ✅ Audit entries contain complete information
- ✅ Logs are properly formatted and searchable

### Test 5.3: Error Handling
**Objective**: Test system behavior under error conditions

**Steps**:
1. Try invalid operations:
   - Assign non-existent role
   - Remove user's last role
   - Create duplicate permission
2. Test network failures:
   - Disconnect internet during role assignment
   - Submit form with network timeout
3. Verify graceful error handling

**Expected Results**:
- ✅ Appropriate error messages displayed
- ✅ No system crashes or breaks
- ✅ User can recover from errors

### Test 5.4: Performance Testing
**Objective**: Test system performance with large datasets

**Steps**:
1. Navigate to users page with many users
2. Test search performance with large user list
3. Test permission management with many permissions
4. Check page load times:
   - Admin dashboard
   - User management
   - Permission management

**Expected Results**:
- ✅ Pages load within reasonable time (< 3 seconds)
- ✅ Search functions remain responsive
- ✅ No browser freezing or delays

### Test 5.5: Browser Compatibility
**Objective**: Test across different browsers

**Steps**:
1. Test in Chrome, Firefox, Safari, Edge
2. For each browser:
   - Login process
   - Navigation
   - Form submissions
   - JavaScript functionality
3. Check for browser-specific issues

**Expected Results**:
- ✅ Consistent behavior across browsers
- ✅ No browser-specific errors
- ✅ Responsive design works properly

---

## Test Checklist Summary

### Phase 1: Authentication & Access Control
- [ ] Platform Admin login and access
- [ ] Restaurant Owner access restrictions
- [ ] Staff access restrictions

### Phase 2: Permission Management
- [ ] Permission management interface
- [ ] Create new permission
- [ ] Edit existing permission
- [ ] Permission analytics

### Phase 3: User Role Management
- [ ] User management interface
- [ ] Role assignment
- [ ] Role modification
- [ ] Role removal
- [ ] Bulk operations

### Phase 4: Security & Authorization
- [ ] Permission-based UI elements
- [ ] API endpoint security
- [ ] Session management
- [ ] Cross-restaurant data isolation

### Phase 5: Integration & Edge Cases
- [ ] Role template management
- [ ] Audit logging
- [ ] Error handling
- [ ] Performance testing
- [ ] Browser compatibility

---

## Issue Reporting Template

When issues are found during testing, use this template:

### Issue Report
**Test Phase**: [Phase Number]
**Test Case**: [Test Case Number]
**Browser**: [Browser Name and Version]
**Severity**: [High/Medium/Low]

**Description**: 
[Clear description of the issue]

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result**: 
[What should happen]

**Actual Result**: 
[What actually happened]

**Screenshots**: 
[If applicable]

**Console Errors**: 
[Any JavaScript errors from browser console]

---

## Test Completion Criteria

The RBAC implementation testing is considered complete when:

✅ **All test phases passed (100% checklist completion)**
✅ **No high-severity issues remain**
✅ **Security tests all pass**
✅ **Performance meets requirements**
✅ **Cross-browser compatibility confirmed**

## Notes

- Perform testing in a clean browser session
- Clear cache between major test phases
- Take screenshots of any issues found
- Test with realistic data volumes
- Verify mobile responsiveness if applicable

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Created By**: Claude Code Assistant  
**Purpose**: RBAC Implementation Validation