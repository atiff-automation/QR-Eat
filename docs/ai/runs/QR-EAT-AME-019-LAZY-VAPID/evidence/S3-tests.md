# Evidence — S3 regression tests

**File:** `src/tests/push-notification-config.test.ts` (new)
**Date:** 2026-11-20

## Design

- `jest.mock('web-push')` returns a default object whose
  `setVapidDetails` / `sendNotification` are shared `jest.fn()`s.
- `jest.mock('@/lib/database')` returns a `prisma` object with only
  `pushSubscription.findMany` / `delete` mocks, so any query or write is
  visible.
- Each test loads the service with `jest.isolateModules` +
  `jest.requireActual`, giving a fresh module-level VAPID cache without adding a
  test-only export to the production API.
- Env vars are cleared before every test and restored afterwards.
- Configured-path keys come from web-push's own
  `generateVAPIDKeys()` (real module via `jest.requireActual`).

## Cases

| Case | Assertion |
|---|---|
| Import, no VAPID env | no throw; `setVapidDetails` not called |
| `sendNotification`, no config | resolves `false`; no web-push send; no Prisma find/delete |
| unconfigured + invalid endpoint | no subscription deletion |
| repeated unconfigured sends | one `console.warn` |
| `sendToRestaurant` / `sendToUser`, no config | `{sent: 0, failed: 0}`; no query; no delete |
| valid config | `setVapidDetails` once, lazily; `sendNotification` called; second send does not reconfigure |
| 410 while configured | resolves `false`; `pushSubscription.delete` called with the endpoint |
| configured `sendToRestaurant` | two subscriptions → `{sent: 2, failed: 0}` |
| malformed subject/keys | resolves `false`, no send, no delete, one `console.error` (real web-push validation via `mockImplementation`) |
| malformed keys, valid subject, batch | `{sent: 0, failed: 0}`, no query |

## Results

Post-fix, focused run:

```text
$ npx jest src/tests/push-notification-config.test.ts --runInBand
PASS src/tests/push-notification-config.test.ts
Tests:       11 passed, 11 total
(exit 0)
```

Red-capable check against the pre-fix service (CI-faithful copy):

```text
$ npx jest src/tests/push-notification-config.test.ts --runInBand
Test Suites: 1 failed, 1 total
Tests:       9 failed, 2 passed, 11 total
```

Full suite after the change (see `S4` evidence for the recorded run):

```text
Test Suites: 1 skipped, 139 passed, 139 of 140 total
Tests:       11 skipped, 1678 passed, 1689 total
```
