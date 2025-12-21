# Token Expiration Fix - Summary

## Issue Identified

The login endpoint was returning **incorrect token expiration time** in the response body:
- **Actual JWT expiration**: 5 minutes (correct in the token itself)
- **Reported expiration**: 24 hours (wrong in the response data)

This caused confusion during testing - tokens were expiring correctly, but the client thought they had 24 hours.

## Root Cause

**File**: `src/app/api/auth/rbac-login/route.ts` (Line 168)

**Problem Code**:
```typescript
tokenExpiration: {
  accessToken: session.expiresAt,  // ❌ WRONG - returns session expiration (24 hours)
  refreshToken: refreshTokenResult.expiresAt,
},
```

The code was using `session.expiresAt` which represents the **session expiration** (24 hours), not the **JWT token expiration** (5 minutes configured in JWT_EXPIRES_IN).

## Fix Applied

### 1. Added Missing Import

```typescript
import { EnhancedJWTService } from '@/lib/rbac/jwt';
```

### 2. Fixed Token Expiration Response

**Changed line 168 from**:
```typescript
accessToken: session.expiresAt,  // Session expiration (24 hours)
```

**To**:
```typescript
accessToken: EnhancedJWTService.getTokenExpirationTime(),  // JWT expiration (5 minutes)
```

## Verification

### Environment Configuration
- ✅ `.env` has `JWT_EXPIRES_IN="5m"`
- ✅ `.env.local` has `JWT_EXPIRES_IN="5m"`
- ✅ JWT_CONFIG correctly reads "5m" from environment
- ✅ `parseExpiresIn("5m")` correctly returns 300 seconds

### Login Response Verification

**Test Command**:
```bash
curl -X POST http://localhost:3000/api/auth/rbac-login \
  -H "Content-Type: application/json" \
  -d '{"email":"mario@marios-authentic.com","password":"staff123"}'
```

**Response**:
```json
{
  "tokenExpiration": {
    "accessToken": "2025-12-21T00:37:01.166Z",   // ✅ 5 minutes from now
    "refreshToken": "2026-01-04T00:32:01.162Z"   // ✅ 14 days from now
  }
}
```

**Verification**:
- Login time: ~00:32:01
- Access token expires: 00:37:01
- **Difference: 5 minutes** ✅

### Console Logs Confirm

```
🔧 JWT_CONFIG initialized: { expiresIn: '5m', fromEnv: '5m', fallback: '30m', usingEnv: true }
🔧 parseExpiresIn called with: 5m
✅ parseExpiresIn: Parsed { amount: '5', unit: 'm', value: 5 }
✅ parseExpiresIn: Returning 300 seconds
```

## Files Modified

1. **src/app/api/auth/rbac-login/route.ts**
   - Added `EnhancedJWTService` import
   - Fixed line 168 to use `EnhancedJWTService.getTokenExpirationTime()`

2. **.env**
   - Changed `JWT_EXPIRES_IN` from "30m" to "5m" for testing

## Refresh Endpoint Status

✅ **Already Correct**: The refresh endpoint (`src/app/api/auth/refresh/route.ts`) was already using the correct approach on line 195:

```typescript
const accessTokenExpiration = EnhancedJWTService.getTokenExpirationTime();
```

No changes needed for the refresh endpoint.

## Next Steps for Testing

### Local Testing

1. **Login and verify response**:
   ```bash
   curl -X POST http://localhost:3000/api/auth/rbac-login \
     -H "Content-Type: application/json" \
     -d '{"email":"mario@marios-authentic.com","password":"staff123"}' \
     -c /tmp/test_cookies.txt
   ```

2. **Wait 5+ minutes** for token to expire

3. **Make an API call** (should trigger 401 → reactive refresh):
   ```bash
   curl -b /tmp/test_cookies.txt http://localhost:3000/api/pos/orders/pending
   ```

4. **Expected Console Output**:
   ```
   🔍 ApiClient: Response not OK for /api/pos/orders/pending { status: 401 }
   🔐 ApiClient.isAuthEndpoint("/api/pos/orders/pending") = false
   🔄 ApiClient: 401 detected for /api/pos/orders/pending
   🚀 ApiClient: Triggering token refresh
   🔄 forceTokenRefresh: Called
   ✅ forceTokenRefresh: Refresh completed successfully
   ✅ ApiClient: Token refresh successful, retrying /api/pos/orders/pending
   ✅ ApiClient: Retry successful
   ```

5. **Expected Toast Messages**:
   - "Refreshing session..."
   - "Session refreshed successfully"

### Production (Railway) Testing

The debug version with comprehensive logging was deployed to Railway (commit `11a55b6`).

**User should**:
1. Login to production site
2. Wait 5 minutes for JWT to expire
3. Open browser DevTools Console
4. Navigate or wait for polling request
5. **Copy ALL console output** showing the reactive refresh flow

## Status

✅ **Fix Complete**: Login endpoint now returns correct JWT expiration time
✅ **Verified Locally**: Token expiration shows 5 minutes correctly
⏳ **Pending**: Test reactive 401 refresh after token expires (local + production)

---

**Fixed**: 2025-12-21
**Developer**: Claude
**Related**: DEBUG_TOKEN_REFRESH_ISSUE.md
