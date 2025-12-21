# Debugging Token Refresh Issue - Investigation Plan

**Issue**: Reactive token refresh not triggering after 5-minute JWT expiration on Railway production

**Symptoms**:
- ✓ RoleProvider loads user info successfully
- ✓ SSE connection established
- ❌ After 5 minutes: GET /api/pos/orders/pending returns 401
- ❌ No toast messages appear ("Refreshing session..." / "Session refreshed successfully")
- ❌ Logout button fails with 401 error
- ❌ Error: "Failed to fetch pending orders"

---

## 🔍 Investigation Steps

### Step 1: Verify Debug Build Deployed

**Action**: Wait for Railway to finish deploying build `11a55b6`

**Verify**:
1. Check Railway dashboard shows deployment status: "Deployed"
2. Check deployment logs show successful build completion
3. Refresh the production site to load new code

---

### Step 2: Reproduce Issue and Capture Console Logs

**Action**: Login and wait for token expiration

**Steps**:
1. Open https://qr-eat-production.up.railway.app/login
2. Open browser DevTools (F12) → Console tab
3. Login with test credentials
4. Wait 5 minutes for JWT to expire
5. Let polling request trigger (or manually navigate somewhere)
6. **COPY ALL CONSOLE OUTPUT** and send to me

---

### Step 3: Analyze Expected vs Actual Console Output

**Expected Console Flow (if working correctly)**:

```javascript
// When 401 happens:
🔍 ApiClient: Response not OK for /api/pos/orders/pending { status: 401, isAuthEndpoint: false }
🔐 ApiClient.isAuthEndpoint("/api/pos/orders/pending") = false
🔄 ApiClient: 401 detected for /api/pos/orders/pending { attempts: 0, maxAttempts: 1, willRetry: true }
🚀 ApiClient: Triggering token refresh for /api/pos/orders/pending
🔄 forceTokenRefresh: Called { refreshInProgress: false, hasPromise: false }
🔄 forceTokenRefresh: Starting new refresh
[Toast appears: "Refreshing session..."]
✅ forceTokenRefresh: Refresh completed successfully
[Toast appears: "Session refreshed successfully"]
🔄 forceTokenRefresh: Cleanup complete
✅ ApiClient: Token refresh successful, retrying /api/pos/orders/pending
🔍 ApiClient: Response not OK for /api/pos/orders/pending (if retry also fails)
  OR
✅ ApiClient: Retry successful for /api/pos/orders/pending (if retry works)
```

**Possible Problem Scenarios**:

#### Scenario A: No ApiClient logs at all
```
GET /api/pos/orders/pending 401 (Unauthorized)
Fetch pending orders error: Error: Failed to fetch pending orders
[NO ApiClient logs]
```
→ **Problem**: Production build doesn't have the new code
→ **Fix**: Verify Railway build cache cleared

#### Scenario B: isAuthEndpoint returns true incorrectly
```
🔍 ApiClient: Response not OK for /api/pos/orders/pending { status: 401, isAuthEndpoint: true }
🔐 ApiClient.isAuthEndpoint("/api/pos/orders/pending") = true
❌ ApiClient: Throwing error for /api/pos/orders/pending
```
→ **Problem**: isAuthEndpoint logic is wrong
→ **Fix**: Check endpoint path includes logic

#### Scenario C: 401 handler not triggering
```
🔍 ApiClient: Response not OK for /api/pos/orders/pending { status: 401, isAuthEndpoint: false }
🔐 ApiClient.isAuthEndpoint("/api/pos/orders/pending") = false
❌ ApiClient: Throwing error for /api/pos/orders/pending
[NO "🔄 ApiClient: 401 detected" log]
```
→ **Problem**: Condition `if (response.status === 401 && !this.isAuthEndpoint(endpoint))` not met
→ **Fix**: Check response.status value

#### Scenario D: Max retries already exceeded
```
🔍 ApiClient: Response not OK for /api/pos/orders/pending { status: 401, isAuthEndpoint: false }
🔐 ApiClient.isAuthEndpoint("/api/pos/orders/pending") = false
🔄 ApiClient: 401 detected for /api/pos/orders/pending { attempts: 1, maxAttempts: 1, willRetry: false }
❌ ApiClient: Max retries exceeded for /api/pos/orders/pending
🔄 ApiClient: Redirecting to login (max retries)
```
→ **Problem**: Retry counter not being cleared between requests
→ **Fix**: Clear retryAttempts Map on successful responses

#### Scenario E: Refresh fails
```
🔍 ApiClient: Response not OK for /api/pos/orders/pending { status: 401, isAuthEndpoint: false }
🔐 ApiClient.isAuthEndpoint("/api/pos/orders/pending") = false
🔄 ApiClient: 401 detected for /api/pos/orders/pending { attempts: 0, maxAttempts: 1, willRetry: true }
🚀 ApiClient: Triggering token refresh for /api/pos/orders/pending
🔄 forceTokenRefresh: Called { refreshInProgress: false, hasPromise: false }
🔄 forceTokenRefresh: Starting new refresh
[Toast appears: "Refreshing session..."]
❌ forceTokenRefresh: Refresh failed [error details]
❌ ApiClient: Refresh failed for /api/pos/orders/pending [error]
🔄 ApiClient: Redirecting to login
```
→ **Problem**: Refresh endpoint returning error
→ **Fix**: Check refresh endpoint logs on Railway

---

### Step 4: Test Logout Behavior

**Action**: Try logout immediately after login (before token expires)

**Expected**:
```
🔍 ApiClient: Response not OK for /api/auth/logout { status: 200, isAuthEndpoint: true }
🔐 ApiClient.isAuthEndpoint("/api/auth/logout") = true
[Success - no 401 handler triggered]
```

**If logout fails with 401**:
```
🔍 ApiClient: Response not OK for /api/auth/logout { status: 401, isAuthEndpoint: true }
🔐 ApiClient.isAuthEndpoint("/api/auth/logout") = true
❌ ApiClient: Throwing error for /api/auth/logout
```
→ **Problem**: Backend is rejecting logout request due to expired token
→ **Fix**: Backend logout endpoint should NOT validate token (allow expired tokens to logout)

---

## 🎯 Quick Diagnostic Questions

Based on console logs, answer these:

1. **Do you see ANY `🔍 ApiClient:` logs?**
   - YES → Code deployed correctly
   - NO → Build cache issue, need to force rebuild

2. **What does `isAuthEndpoint("/api/pos/orders/pending")` return?**
   - `false` → Correct
   - `true` → Bug in isAuthEndpoint logic

3. **Do you see `🔄 ApiClient: 401 detected` log?**
   - YES → 401 handler triggered, check next steps
   - NO → Condition not met, check why

4. **Do you see `🔄 forceTokenRefresh: Called`?**
   - YES → Refresh attempted, check if it succeeds
   - NO → forceTokenRefresh never called, check caller

5. **Do you see any toasts appear?**
   - "Refreshing session..." → Refresh started
   - "Session refreshed successfully" → Refresh completed
   - NO toasts → forceTokenRefresh not called or toasts suppressed

6. **Do you see `✅ ApiClient: Retry successful`?**
   - YES → Everything working!
   - NO → Refresh failed or retry failed

---

## 🔧 Immediate Fixes Based on Findings

### If: No ApiClient logs at all
```bash
# Clear Railway build cache
1. Go to Railway Dashboard → Project Settings
2. Click "Clear Build Cache"
3. Trigger new deployment
```

### If: isAuthEndpoint returns wrong value
**Problem**: Endpoint path matching is incorrect

**Check**: Does `/api/pos/orders/pending` include any of these?
- `/auth/login`
- `/auth/rbac-login`
- `/auth/logout`
- `/auth/rbac-logout`
- `/api/auth/login`
- `/api/auth/logout`
- `/api/auth/refresh`

**Answer**: NO → should return `false`

### If: Refresh endpoint fails
**Check Railway logs for refresh endpoint**:
```
POST /api/auth/refresh
→ What error is backend returning?
```

### If: Backend rejects logout with 401
**Fix needed**: Logout endpoint should accept expired tokens

```typescript
// In logout route handler:
// BEFORE: Validates token → rejects if expired
// AFTER: Allows expired tokens, just clears session
```

---

## 📋 Information Needed from You

Please provide:

1. **Full console output** from browser DevTools after token expires
2. **Railway deployment logs** showing:
   - Build completion status
   - Any errors during build
   - Deployment confirmation
3. **Railway application logs** showing:
   - What happens when POST /api/auth/refresh is called
   - What happens when POST /api/auth/logout is called with expired token
4. **Screenshot** of browser DevTools Console showing the exact sequence of logs

---

## 🚀 Next Actions

Once I see the console logs, I can:
1. Pinpoint exact failure point in the flow
2. Identify root cause (code issue vs deployment issue vs backend issue)
3. Provide targeted fix
4. Verify fix works

**Please reproduce the issue with the debug build and send me the console logs!**

---

**Debug build deployed**: Commit `11a55b6`
**Status**: Waiting for Railway deployment and console log analysis
**Expected time**: ~2 min (deployment) + 5 min (wait for expiry) = ~7 minutes total
