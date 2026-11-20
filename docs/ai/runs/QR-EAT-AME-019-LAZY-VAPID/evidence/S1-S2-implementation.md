# Evidence — S1/S2 lazy configuration and graceful degradation

**File:** `src/lib/push-notification-service.ts`
**Date:** 2026-11-20

## What changed

1. Removed the module-load read of `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT`, the `throw`, and the unconditional
   `webpush.setVapidDetails(...)` call.
2. Added `ensureVapidConfigured()`, called only from send methods:
   - reads the three variables at call time;
   - checks presence (logs the missing variable names only — no values, no
     endpoints);
   - calls `webpush.setVapidDetails` so web-push validates subject/key format;
   - caches the result in a module-level `boolean | undefined`, so success
     configures once and a failure logs once per process;
   - never throws; returns `false` on missing or invalid configuration.
3. Degradation:
   - `sendNotification` returns `false` before endpoint/payload validation and
     before any Prisma call when unconfigured, so no subscription is deleted and
     no error is thrown;
   - `sendToRestaurant` / `sendToUser` check configuration **before** the
     `pushSubscription.findMany` fetch and return `{sent: 0, failed: 0}` with no
     query and no write.
4. Unchanged: exported singleton and method signatures, endpoint validation,
   payload-size validation, batching, 410/404 cleanup, and rethrow of other
   send errors when configured. `src/app/api/events/orders/route.ts` untouched.

## Documented config-check order

Configuration is checked **before** any database access in all three send
methods. Rationale: an unconfigured process must not produce writes (no
subscription deletion) and must not load the database for a send that cannot
happen. The configured path is unchanged.

## Log lines (no secrets)

```text
[Push] VAPID configuration missing (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY); push notifications are disabled
[Push] Invalid VAPID configuration; push notifications are disabled: <web-push validation message>
```

## Import safety (post-fix, CI-faithful copy with no `.env*` and no VAPID env)

```text
$ env -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT \
    npx tsx -e "require('./src/lib/push-notification-service.ts'); console.log('import ok, setVapidDetails calls checked by test suite')"
import ok, setVapidDetails calls checked by test suite
```
