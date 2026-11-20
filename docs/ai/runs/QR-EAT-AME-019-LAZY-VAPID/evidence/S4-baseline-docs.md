# Evidence — S4 baseline docs and final checks

**Date:** 2026-11-20
**Branch:** `fix/ame-019-lazy-vapid` (base `main` `06807c2`)

## Measured baseline (post-change, used in the docs)

```text
$ npm test -- --runInBand
Test Suites: 1 skipped, 139 passed, 139 of 140 total
Tests:       11 skipped, 1678 passed, 1689 total
(exit 0)

$ npm run type-check
> tsc --noEmit
(exit 0)

$ npm run lint
(exit 1)
61 `Error:` findings, 11 `Warning:` findings  (unchanged from the pre-fix run)
```

Owned-file lint and format:

```text
$ npx next lint --file src/lib/push-notification-service.ts
✔ No ESLint warnings or errors
$ npx next lint --file src/tests/push-notification-config.test.ts
✔ No ESLint warnings or errors
$ npx prettier --check src/lib/push-notification-service.ts src/tests/push-notification-config.test.ts
All matched files use Prettier code style!
```

## Docs corrected

- `AGENTS.md` → Known baseline: tests `1678 passed, 11 skipped (139 suites
  passed, 1 skipped)`; lint `61 errors, 11 warnings`.
- `docs/ai/PROJECT_PROFILE.md` → Baseline section re-dated to the measured run
  (`06807c2`, `fix/ame-019-lazy-vapid`), test row `140 suites (139 passed, 1
  skipped), 1678 passed, 11 skipped`, build row notes it passes with no VAPID
  environment, lint row `61 errors, 11 warnings`; the "Current known risks" lint
  figure updated from 62 to 61. Policy sections untouched.

## Build gate (post-fix)

CI-faithful copy (`/tmp/ame019-ci-sim2`: no `.env*`, `node_modules` hard-linked
so Prisma's env loader cannot reach the primary worktree's `.env`):

```text
$ env -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT \
    -u NEXT_PUBLIC_VAPID_PUBLIC_KEY CI=true <other CI env from ci.yml> npm run build
✓ Compiled successfully in 14.6s
├ ƒ /api/events/orders
(exit 0)
```

Primary worktree, exact task verification command (`.env` present, keys
configured — no regression in the configured path):

```text
$ env -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT npm run build
✓ Compiled successfully in 23.1s
(exit 0)
```

Pre-fix, the same CI-faithful copy failed at Build with
`Missing VAPID configuration ... Failed to collect page data for
/api/events/orders` (exit 1). See `S0-baseline.md`.

## Working tree

```text
 M AGENTS.md
 M docs/ai/ACTIVE.md                      (pre-existing Lead/task docs, not edited here)
 M docs/ai/BACKLOG.md                     (pre-existing Lead/task docs, not edited here)
 M docs/ai/PROJECT_PROFILE.md
 M src/lib/push-notification-service.ts
?? docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/...   (task docs + this evidence)
?? src/tests/push-notification-config.test.ts
```

No workflow, secret, route, schema, auth or payment change. No dependency
added. Nothing committed or pushed.
