# Manual Testing Guide: ApiClient Refactoring

This guide will help you verify that the ApiClient refactoring is working correctly.

## What We Changed

**BEFORE (Non-standard):**
```typescript
const { data, ok } = await ApiClient.get('/users');
if (ok) {
  // handle success
} else {
  // handle error
}
```

**AFTER (JavaScript Standard):**
```typescript
try {
  const data = await ApiClient.get('/users');
  // handle success - data returned directly
} catch (error) {
  if (error instanceof ApiClientError) {
    // handle error - errors are thrown
  }
}
```

---

## Pre-Test Setup

1. **Open Browser Dev Tools** (F12 or Right-click → Inspect)
2. **Go to the Console tab** - we'll watch for any errors
3. **Go to the Network tab** - we'll see API requests
4. **Navigate to**: http://localhost:3000/login

---

## Test 1: Error Handling (Invalid Credentials)

### Purpose
Verify that ApiClient throws errors correctly and displays them to the user.

### Steps

1. **Fill in invalid credentials:**
   - Email: `test@example.com`
   - Password: `wrongpassword`

2. **Click "Sign in" button**

3. **Expected Results:**
   ✅ **You should see:**
   - Red error message displayed on the page
   - Error message says something like "Invalid credentials" or "Login failed"
   - NO JavaScript errors in the console
   - The page does NOT crash or become unresponsive

4. **Check Console:**
   - Look for: `Login error:` log
   - Should show an ApiClientError with status and message
   - **Verify**: Error is caught in try-catch block (not unhandled)

5. **Check Network Tab:**
   - Find the `rbac-login` request
   - Status should be 401 or 500
   - The app handled the error gracefully

---

## Test 2: Success Scenario (Valid Login)

### Purpose
Verify that ApiClient returns data directly when successful.

### Steps

1. **Use the "Quick Login" buttons OR enter valid credentials:**
   - **Platform Admin**: admin@qrorder.com / admin123
   - **Restaurant Owner**: owner@restaurant.com / owner123
   - **Staff**: staff@restaurant.com / staff123

2. **Click "Sign in" button**

3. **Expected Results:**
   ✅ **You should see:**
   - Successful login
   - Redirect to the appropriate dashboard
   - NO JavaScript errors in the console
   - NO errors about undefined data or missing properties

4. **Check Console:**
   - Look for: `🎯 Login response received:` log
   - Should show the login data (user info, role, etc.)
   - **Verify**: Data is used directly (no `.data` access needed)

5. **Check Network Tab:**
   - Find the `rbac-login` request
   - Status should be 200
   - Response contains user data

---

## Test 3: Multiple Pages (Verify No Regressions)

### Purpose
Ensure other pages using ApiClient still work correctly.

### Steps

After logging in successfully, test these pages:

1. **Dashboard Pages:**
   - Navigate to `/dashboard/menu`
   - Navigate to `/dashboard/staff`
   - Navigate to `/dashboard/tables`
   - Navigate to `/dashboard/settings`

2. **Admin Pages (if logged in as admin):**
   - Navigate to `/admin/dashboard`
   - Navigate to `/admin/restaurants`
   - Navigate to `/admin/users`
   - Navigate to `/admin/analytics`

3. **Expected Results for Each Page:**
   ✅ **You should see:**
   - Page loads without errors
   - Data is fetched and displayed
   - NO JavaScript errors in console
   - NO blank pages or loading spinners that never finish

---

## Test 4: Error Recovery

### Purpose
Verify the app recovers gracefully from errors.

### Steps

1. **Login successfully**

2. **Open Console and run this command:**
   ```javascript
   // Simulate network error by making request to non-existent endpoint
   fetch('/api/nonexistent-endpoint').catch(console.error)
   ```

3. **Navigate around the app**

4. **Expected Results:**
   ✅ **You should see:**
   - App continues to function normally
   - No crashes or frozen UI
   - Error is logged but app recovers

---

## Test 5: Browser Console Verification

### Purpose
Verify the new error pattern in the console.

### Steps

1. **In the browser console, run:**
   ```javascript
   // This simulates what happens in the code
   async function testPattern() {
     try {
       const data = await fetch('/api/auth/me', {
         credentials: 'include'
       }).then(r => r.json());
       console.log('✓ Data returned directly:', data);
     } catch (error) {
       console.log('✓ Error caught in try-catch:', error);
     }
   }
   testPattern();
   ```

2. **Expected Results:**
   - Should see either success data OR error message
   - Error should be caught and logged
   - No unhandled promise rejections

---

## Common Issues to Watch For

### ❌ Signs of Problems:

1. **Unhandled Promise Rejection:**
   - Console shows: `Uncaught (in promise)`
   - This means try-catch is missing somewhere

2. **"Cannot read property of undefined":**
   - Console shows: `Cannot read property 'ok' of undefined`
   - This means old `{ok, data}` pattern still exists somewhere

3. **Blank Pages:**
   - Page loads but shows nothing
   - Check console for errors about missing data

4. **Infinite Loading:**
   - Loading spinner never stops
   - API call might have failed without proper error handling

---

## Success Criteria

✅ **All tests pass if:**

1. Invalid login shows error message (doesn't crash)
2. Valid login works and redirects properly
3. All dashboard pages load and display data
4. No console errors about undefined properties
5. No unhandled promise rejections
6. Network errors are handled gracefully
7. App continues to function after errors

---

## Quick Checklist

Use this checklist while testing:

- [ ] Login page loads without errors
- [ ] Invalid credentials show error message
- [ ] Valid credentials log in successfully
- [ ] Dashboard menu page loads data
- [ ] Dashboard staff page loads data
- [ ] Dashboard tables page loads data
- [ ] No `Cannot read property 'ok'` errors
- [ ] No unhandled promise rejections
- [ ] Network tab shows proper API calls
- [ ] Console shows proper error handling

---

## If You Find Issues

If you encounter any problems:

1. **Note the exact error message** from the console
2. **Note which page** you were on
3. **Note what action** you took (clicked what button, etc.)
4. **Take a screenshot** of the console errors
5. **Check the Network tab** to see the API response

This information will help debug any issues with the refactoring.

---

## Summary

The refactoring changes how errors are handled:
- **Old way**: Check `ok` flag at every call site
- **New way**: Use standard try-catch blocks

Both approaches work, but the new way is:
- More consistent with JavaScript standards
- Cleaner and more readable
- Aligns with popular libraries (axios, fetch with error handling)

If all tests pass, the refactoring is working correctly! ✅
