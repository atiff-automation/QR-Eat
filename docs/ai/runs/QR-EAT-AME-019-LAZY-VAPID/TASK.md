# Task — QR-EAT-AME-019-LAZY-VAPID

**Status:** ready_to_commit
**Revision:** 1
**Approved revision:** 1
**Approved by:** Atiff
**Approval date:** 2026-11-20
**Approval basis:** “approve” — revision 1 as presented, D1–D7 binding
**Approval hash:** `sha256:dd0e4a2826556d5fad05a194554fb8b1419959951613885dc88d052c8bfc5bc1`
(revision-1 content as presented for approval, before this approval block was
stamped)
**Next actor:** human (commit authorization; AC5 CI run follows the push)
**Implementer session:** `ses_e09cec90affe6nXlbpxeqIxx3K`
**Verifier session:** `ses_e09c3d815ffe0I4lCcWfid8pb9`
**Diff base:** `main` `06807c27ca615eae9ec13f397dd0a491577e130f`
**Diff hash:** tracked
`sha256:1a97edfa175a9b3b4a736ff4d99eb898c6b8fd7b917afaa1dc801a1414533d91`;
untracked committable set
`sha256:ae87e3aec7595deab06dee68341e71873065a94f8f8bfd1f5e3f16916733c4f4`
(recorded before the Lead's R-01/R-04 docs edits and this review file)
**Review file:** `REVIEW-01.md` — PASS WITH NOTES (R-01–R-05; AC5 pending)
**Implementer:** ame-implementer
**Implementer session:**
**Verifier session:**
**Diff base:**
**Diff hash:**
**Review file:**
**Risk:** **R1** — build/CI configuration defect; no user-facing behaviour change
when VAPID is configured, graceful degradation when it is not
**Complexity:** L2
**Workflow:** BUG (build requires a runtime secret at module load)
**Branch:** `fix/ame-019-lazy-vapid` (create from `main` `06807c2`; do not push
until the CI gate below)
**Source item:** `docs/ai/BACKLOG.md` → `AME-019`
**Updated:** 2026-11-20

**Implementation status:** implemented on `fix/ame-019-lazy-vapid`
(uncommitted) and reviewed (REVIEW-01 PASS WITH NOTES). Ready for the commit
gate; AC5 (branch CI green) is satisfied only after the push and a green run.

## Objective

Make the build independent of runtime VAPID secrets. Today
`src/lib/push-notification-service.ts` throws at module import when
`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` are missing. The staff
SSE route imports that module, so `next build` fails during page-data collection
for `/api/events/orders` unless placeholder keys are supplied. That is why every
CI run — including `main` — fails at the Build step, and why local builds needed
ephemeral placeholders. Validate and configure VAPID lazily on first use instead,
so builds need no secret and push stays best-effort at runtime.

## Verified facts that shape the plan

Evidence read on 2026-11-20 at `main` `06807c2`.

1. **The throw is at module load.** `push-notification-service.ts:19-32` reads the
   three env vars and calls `webpush.setVapidDetails(...)` at import time, and
   throws if any is missing.
2. **One import site.** `src/app/api/events/orders/route.ts:23` imports
   `pushNotificationService`; Next evaluates it while collecting page data for
   that route, which is where the build fails. No other module imports the
   service.
3. **CI has no private key.** `.github/workflows/ci.yml:29-31` inlines
   `VAPID_PUBLIC_KEY` and `VAPID_SUBJECT` but reads
   `VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}`, and the repository has
   **zero** secrets (`gh secret list` is empty). Every recent CI run on `main`
   fails at Build with `Missing VAPID configuration`.
4. **The failure is environmental, not in the AME-015/016 code.** Both releases
   passed type-check and the full test suite on Node 20 in CI; only Build failed.
   Railway builds succeed because production has real VAPID values.
5. **Local builds also need placeholders.** The verifier and implementer generated
   ephemeral, format-valid keys for `npm run build`. A build that needs fake keys
   is a smell: build-time evaluation should not require runtime credentials.
6. **Push is already best-effort at the call site.** `route.ts` calls
   `sendToRestaurant(...).catch(...)` after delivering the SSE frame; a push
   failure never affects the stream. Runtime push is optional for the SSE path.
7. **Baseline docs are stale.** `AGENTS.md` and `PROJECT_PROFILE.md` claim 524
   tests and 62 lint errors; measured on 2026-11-19: 1667 passed / 11 skipped and
   61 lint errors. Correct them in this task while the baseline is being measured.

## Binding decisions

| # | Decision | Consequence |
|---|---|---|
| D1 | Build must not require VAPID configuration | Importing the module must never throw. Configuration is checked on first send, not at module load. |
| D2 | No CI or repository secret is added | The workflow is left unchanged; the empty `VAPID_PRIVATE_KEY` becomes harmless. Do not add secrets or inline a private key. |
| D3 | Runtime behaviour is unchanged when configured | With all three vars present and valid, `setVapidDetails` is applied once before the first send and the send path behaves exactly as today. |
| D4 | Missing configuration degrades gracefully | A send attempt logs one clear warning and returns a no-op result (`false` for a single subscription, `{sent: 0, failed: 0}` for batch/user). No throw at import, no unhandled rejection, no subscription deletion. |
| D5 | Invalid configuration is a runtime error, not a build error | If keys are present but malformed, the first send logs the error and returns the same no-op shape; do not crash the process. |
| D6 | Tests prove both directions | Build-without-env, import-without-env and no-op send; plus configured path still calls `webpush.sendNotification` and `setVapidDetails` once. |
| D7 | CI green on the branch is the release gate | The branch's CI run must pass type-check, tests and Build on Node 20. This is the acceptance evidence for the defect, not just a local build. |

## Scope

### S0 — Baseline and guardrails

- Create `fix/ame-019-lazy-vapid` from `main` `06807c2`; confirm a clean tree.
- Record the real baseline: `npm test -- --runInBand`, `npm run type-check`,
  `npm run build` **without any VAPID env** (expected to fail before the fix),
  and lint attribution for the owned files.
- No push until the CI gate; no deploy, migration or seed during implementation.

### S1 — Lazy VAPID configuration

- Replace the module-level read/validate/`setVapidDetails` with a lazy
  configuration helper that:
  - reads the three env vars at call time;
  - validates presence and lets `webpush.setVapidDetails` validate format;
  - caches a configured/not-configured outcome so success configures once and
    failure logs once per process;
  - never throws to the caller of a send method.
- Keep the exported API (`pushNotificationService` and its methods) unchanged.
- Keep endpoint validation, payload-size validation and 410/404 subscription
  cleanup exactly as they are.
- Do not change `route.ts`; if it must change, stop and report why.

### S2 — Graceful degradation

- `sendNotification`: return `false` when unconfigured (or invalid), without
  calling `webpush`, and without deleting the subscription.
- `sendToRestaurant` / `sendToUser`: return `{sent: 0, failed: 0}` when
  unconfigured; do not query for subscriptions unnecessarily — decide and
  document one order (config check before or after the fetch) and keep it
  consistent.
- Log a single, clear warning (no secrets, no full endpoints in logs).

### S3 — Regression tests

- New/extended `src/tests/push-notification-config.test.ts`:
  1. importing the module with no VAPID env does not throw;
  2. `sendNotification` with no config returns `false`, does not call
     `webpush.sendNotification`, does not touch Prisma;
  3. `sendToRestaurant` / `sendToUser` with no config return zeros and do no
     writes;
  4. configured path: valid generated keys → `setVapidDetails` applied once,
     `sendNotification` calls `webpush.sendNotification` and returns `true`;
  5. malformed keys do not crash the process and do not delete subscriptions.
- Reuse the existing test style; mock `web-push` and `@/lib/database`. Do not
  weaken existing tests.

### S4 — Baseline docs correction (R0 rider)

- Update the measured baseline in `AGENTS.md` and `docs/ai/PROJECT_PROFILE.md`
  (test counts, lint counts) with the numbers recorded in this run. Change only
  the baseline facts; do not rewrite policy sections.

## Non-goals

- Adding a repository or CI secret; changing `.github/workflows/ci.yml`.
- Changing push notification behaviour when configured, subscription schema,
  service worker, or client subscription flow.
- The staff SSE route, pub/sub, event contract, auth, payments.
- `AME-017` (one LISTEN session per process).
- Deploy, migration, seed, production configuration.

## Ownership

**Files/modules owned (implementer):**

```text
src/lib/push-notification-service.ts
src/tests/push-notification-config.test.ts            (new)
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/RUN_LOG.md     (append implementation evidence)
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/**    (new)
AGENTS.md                                             (baseline facts only)
docs/ai/PROJECT_PROFILE.md                            (baseline facts only)
```

**Do not touch:**

```text
.github/workflows/ci.yml
src/app/api/events/orders/route.ts
src/lib/postgres-pubsub.ts
prisma/**  (schema, migrations, seed)
docs/PRODUCT/**
auth, RBAC, payments
src/sw.ts, src/lib/hooks/usePushNotifications.ts
TASK.md / NEXT.md (Lead-owned)
.env* / .railway-env-*.txt / any secret
```

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`, this `TASK.md`
- `src/lib/push-notification-service.ts`
- `.github/workflows/ci.yml` (read-only; understand the env)
- `src/app/api/events/orders/route.ts` (import + call site only)

**Read only if unclear:**

- `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/REVIEW-03.md` (CI note)
- existing tests that mock `web-push`

**Do not read by default:**

- the whole repository or the whole `docs/ai/` tree
- `../Tabtep-App`
- `.env`, `.env.local`, `.railway-env-*.txt`
- generated build output

## Test plan

Covered by S3. Behavioural matrix:

| Case | Expectation |
|---|---|
| Import, no VAPID env | no throw |
| Send single, no config | `false`, no web-push call, no DB write |
| Send batch/user, no config | `{sent: 0, failed: 0}`, no DB write |
| Valid config | `setVapidDetails` once; `webpush.sendNotification` called; existing 410/404 handling intact |
| Malformed config | logged, no crash, no subscription deletion |
| Build, no VAPID env | `npm run build` passes (command-level evidence) |

## Acceptance criteria

1. `npm run build` passes with **no** VAPID variables in the environment.
2. Importing `push-notification-service` with no VAPID configuration does not
   throw and does not call `setVapidDetails`.
3. A send attempt without configuration is a logged no-op: no throw, no
   unhandled rejection, no subscription deletion, no Prisma write.
4. With valid configuration the send path is unchanged (`setVapidDetails` once,
   `webpush.sendNotification` called, 410/404 cleanup preserved).
5. The pushed branch's CI run is **green** (type-check, full tests, Build on
   Node 20) — the defect's release gate.
6. Full tests and type-check pass locally; owned files add no lint findings.
7. No workflow, secret, route, contract, schema, auth or payment change; no
   dependency added.
8. `AGENTS.md` and `PROJECT_PROFILE.md` baseline facts match the measured run.
9. No deploy, migration, seed or production configuration change.

## Verification commands

```text
git status --porcelain --untracked-files=all
env -u VAPID_PUBLIC_KEY -u VAPID_PRIVATE_KEY -u VAPID_SUBJECT npm run build
npx jest src/tests/push-notification-config.test.ts --runInBand
npm test -- --runInBand
npm run type-check
git diff --stat
# after pushing the branch only:
gh run watch <run-id> --exit-status
```

The build command may still need the project's other non-VAPID build-time env
(the CI list); if so, use only those names, with ephemeral non-secret values in
the shell. Never write `.env*`, never print secrets or tokens. Do not claim a
command passed unless it was run.

## Review focus

- Import safety: nothing in the module can throw at load.
- Lazy configuration is applied exactly once and only when needed.
- Configured behaviour identical to today, including 410/404 cleanup and error
  rethrow for other send failures.
- Unconfigured behaviour: no crash, no writes, one clear log line.
- No secret added, workflow untouched.
- CI run on the branch genuinely green (Build included), not just local.
- Baseline docs numbers match the recorded run.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Lazy config masks a real misconfiguration in production | Push silently stops | One explicit warning per process; health/ops can grep it; push remains best-effort by design |
| Config check order changes DB load | Extra queries when unconfigured | Decide and document one order; test the no-write property |
| Cached failure prevents later recovery | Push stays off after env appears | Cache the configured state per process; document that env is read at first send (as today at import) |
| Build passes but runtime push breaks | Silent feature loss | Configured-path tests plus a manual check with real keys in a local env if available (no secrets in evidence) |
| CI gate is flaky for other reasons | Ambiguous result | Record the run ID and step results; if another pre-existing failure appears, stop and report |

## Approval

**Approval applies to this exact revision only.** A material change requires a new
revision and new approval. Approval includes the R1 allowance to edit
`src/lib/push-notification-service.ts` and the baseline facts in `AGENTS.md` and
`PROJECT_PROFILE.md`; it is not deploy, push to `main`, migration or seed
permission.

## Commit gate

- [ ] Implementer is `ame-implementer`, not the Lead
- [ ] Implementer session recorded
- [ ] Verifier is a fresh `ame-verifier`
- [ ] Verifier session recorded
- [ ] Review PASS
- [ ] Review diff hash matches the current diff
- [ ] Changed files are within the owned files
- [ ] Exact path list published
- [ ] Exact commit message published
- [ ] Commit authorization recorded (R1; it is product code, so the gate still applies)
- [ ] Human approved
- [ ] No unrelated changes

**Proposed commit message (awaiting authorization):**

```text
fix(push): configure VAPID lazily so builds need no runtime secret

- stop throwing at module import when VAPID keys are absent
- configure web-push once on first send; degrade to a logged no-op
- keep the configured send path, 410/404 cleanup and API unchanged
- add import-safety and graceful-degradation tests
- correct the stale test and lint baseline in the project docs
```

**Exact path list (14 files, base `06807c2`):**

```text
AGENTS.md
docs/ai/ACTIVE.md
docs/ai/BACKLOG.md
docs/ai/PROJECT_PROFILE.md
src/lib/push-notification-service.ts
src/tests/push-notification-config.test.ts
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/TASK.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/RUN_LOG.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/NEXT.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/REVIEW-01.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S0-baseline.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S1-S2-implementation.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S3-tests.md
docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/evidence/S4-baseline-docs.md
```

No workflow, secret, route, schema, migration, auth, payment, dependency or
generated file is in the list. The commit is local; the branch push exists only
to run CI (AC5), and merge/deploy is a separate decision after a green run.

**Commit authorized by:** Atiff
**Authorization date:** 2026-11-20
**Authorization scope:** one local commit with the exact path list and message
above, plus pushing `fix/ame-019-lazy-vapid` to run the AC5 CI gate. Merge and
deploy are not authorized until CI is green.

**Post-commit state:** commit `5abad63`; branch CI `44644311211` **success**
(AC5); merge `54993fe` on `main`; main CI `44647023835` **success**; Railway
deployment `589bd7a3-146e-4c10-8bd4-c28f1cdd0a17` `SUCCESS`, health UP, no
migration.

## Residual risks and follow-ups

- Push remains best-effort; an unconfigured process will not notify devices until
  restarted with keys. That matches today's behaviour when keys are absent at
  runtime, but it is now silent instead of fatal — the warning line is the signal.
- `AME-017` stays deferred with its trigger conditions.
- The pilot pre-gate decision remains after this task.

## Return format

```text
Summary:
Files changed:
Commands run and results (incl. build without VAPID and CI run id):
Deviations:
Blockers:
Residual risks:
Recommended next action:
```
