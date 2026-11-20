# Evidence — S0 baseline (pre-fix)

**Date:** 2026-11-20
**Branch:** `fix/ame-019-lazy-vapid` (base `main` `06807c2`)
**Node:** v24.15.0 locally (CI pins Node 20; noted in risks)

## Environment note

The local primary worktree has `.env` / `.env.local` (gitignored, not read).
CI has no `.env`, so CI behaviour was reproduced in a throwaway copy at
`/tmp/ame019-ci-sim2` with `node_modules` hard-linked and **no** `.env*` files.
A first attempt with a symlinked `node_modules` gave a false pass: Prisma's env
loader followed the symlink realpath and loaded the primary worktree's `.env`.
The hard-link copy removes that leak; the results below are from it.

## 1. Tests (pre-fix)

```text
$ npm test -- --runInBand
Test Suites: 1 skipped, 138 passed, 138 of 139 total
Tests:       11 skipped, 1667 passed, 1678 total
(exit 0)
```

## 2. Type-check (pre-fix)

```text
$ npm run type-check
> tsc --noEmit
(exit 0)
```

## 3. Lint (pre-fix, whole repo)

```text
$ npm run lint
(exit 1)
61 `Error:` findings, 11 `Warning:` findings
```

Owned file before the change:

```text
$ npx next lint --file src/lib/push-notification-service.ts
✔ No ESLint warnings or errors
```

## 4. Build without VAPID configuration (pre-fix — expected failure, reproduced)

Run in the CI-faithful copy (`/tmp/ame019-ci-sim2`, no `.env*`):

```text
$ env -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT \
    -u NEXT_PUBLIC_VAPID_PUBLIC_KEY CI=true <other CI env from ci.yml> npm run build
  Collecting page data ...
Error: Missing VAPID configuration. Please set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT in .env
    at ... .next/server/app/api/events/orders/route.js
> Build error occurred
[Error: Failed to collect page data for /api/events/orders] {
(exit 1)
```

This is the CI defect: the route import evaluates the push service during page
data collection.

## 5. Import safety (pre-fix, same copy)

```text
$ env -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT \
    npx tsx -e "require('./src/lib/push-notification-service.ts')"
Error: Missing VAPID configuration. ...
(exit 1)
```

## 6. Focused test is red-capable

The new test file was also run against the pre-fix service copy:

```text
$ npx jest src/tests/push-notification-config.test.ts --runInBand
Test Suites: 1 failed, 1 total
Tests:       9 failed, 2 passed, 11 total
```
