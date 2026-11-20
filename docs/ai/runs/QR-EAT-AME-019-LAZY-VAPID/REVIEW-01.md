# Review 01 — QR-EAT-AME-019-LAZY-VAPID

**Reviewer:** fresh `ame-verifier` (session `ses_e09c3d815ffe0I4lCcWfid8pb9`),
independent of the implementer, read-only
**Date:** 2026-11-20
**Spec:** `TASK.md` revision 1 (approved); D1–D7, S0–S4, AC1–AC9
**Verdict:** **PASS WITH NOTES**
**Risk:** R1

## Diff binding

| Item | Value |
|---|---|
| Base | `main` `06807c27ca615eae9ec13f397dd0a491577e130f` |
| Tracked diff (`git diff --binary \| sha256sum`) | `1a97edfa175a9b3b4a736ff4d99eb898c6b8fd7b917afaa1dc801a1414533d91` |
| Untracked committable set | `ae87e3aec7595deab06dee68341e71873065a94f8f8bfd1f5e3f16916733c4f4` |
| Combined | `6bf7618cb354e3c2269ad8fb94d10c7539168a01ed3be073b68b218979561d6a` |
| Tracked stat | `push-notification-service.ts` 74/12; `PROJECT_PROFILE.md` 8/7; `ACTIVE.md` 4/4; `AGENTS.md` 2/2; `BACKLOG.md` 1/1 |

Any post-review edit (including Lead edits to TASK/NEXT/ACTIVE) invalidates these
hashes; the code-file hash is the stable binding.

## Findings

| ID | Severity | Location | Issue | Disposition |
|---|---|---|---|---|
| R-01 | low | `ACTIVE.md:10`, `BACKLOG.md:28`, `NEXT.md:13`, `RUN_LOG.md:9` | Stale navigation/board state: "task branch not created", `planning`, "awaiting owner approval", "Branch/commit: not created". Lead-owned, no product impact. | **Fixed by the Lead** at the phase transition: ACTIVE/BACKLOG/NEXT/RUN_LOG refreshed to `awaiting_review`/branch-created state. |
| R-02 | low | `src/tests/push-notification-config.test.ts` | Configured-path tests exercise 410 cleanup but not the 404 branch or the non-410 rethrow. Both are byte-identical to base, so the static evidence is sound; they are not dynamically protected. | Accepted as a note. The diff does not touch those branches; adding cases would grow scope without changing the verdict. Recorded as a follow-up. |
| R-03 | note | `push-notification-service.ts:31-34` | The configured/not-configured cache is per module instance, not process-global. If Next ever bundles this module into more than one server graph (the `AME-017` pattern), setup/logging could occur once per instance. Exactly one import site today. | Accepted. Document if multi-graph bundling becomes real. |
| R-04 | note | `AGENTS.md:45` | The 1678 count is the post-fix/branch count including the 11 new tests; `PROJECT_PROFILE.md` states that caveat, `AGENTS.md` did not. | **Fixed by the Lead**: AGENTS.md now states the count includes the AME-019 tests. |
| R-05 | note | `docs/ai/AME_BOOTSTRAP.md:61-63`; `BACKLOG.md:19` (`AME-002`) | Other historical docs still cite 57 suites / 524 tests / 62 lint errors. Pre-existing, outside S4's approved two-document scope, and partly historical record (the AME-002 title records the original count). | Accepted, no action in this task; record as documentation drift if it becomes misleading. |

No blocker, high or medium finding.

## Acceptance criteria

| AC | Result | Evidence |
|---|---|---|
| AC1 build with no VAPID env | **PASS** | CI-faithful copy, no `.env*`, Node 20: exit 0, `/api/events/orders` built |
| AC2 import safety | **PASS** | `env -i` import succeeds; top level reads no env |
| AC3 unconfigured send no-op | **PASS** | tests; config check precedes endpoint/Prisma in all three paths |
| AC4 configured path unchanged | **PASS** (404 static only) | diff below the inserted checks is unchanged; 410 dynamic test |
| AC5 **branch CI green** | **NOT SATISFIED — PENDING** | branch not pushed; no run exists. Explicitly not claimed. |
| AC6 tests/type-check/lint | **PASS** | 1678/11 on Node 24 and on Node 20 without `.env`; tsc exit 0; owned lint clean |
| AC7 no workflow/secret/route/schema change | **PASS** | scope check |
| AC8 baseline docs accurate | **PASS** | numbers match; attribution explicit |
| AC9 no deploy/migration/seed | **PASS** | no such action |

## Spec and standards

- **D1:** module-level validation, throw and `setVapidDetails` are gone; only an
  env-name list and an undefined cache remain at the top level.
- **D3:** synchronous helper caches success and failure; presence checked, format
  delegated to `web-push`; no key material in logs (missing-config logs names
  only; invalid-config logs the web-push message, which is length-only for keys).
- **D4/D5:** all three send methods check configuration before endpoint
  validation and before any Prisma access; unconfigured or invalid yields
  `false` / `{sent:0,failed:0}` with no deletion and no throw. The unconfigured
  invalid-endpoint case is explicitly tested.
- **Configured path:** endpoint validation, payload validation, send, 410, 404 and
  the rethrow for other errors are byte-identical to base.
- **Security/data:** no secrets added, no key values logged, no PII, no route/auth
  /payment/schema change, no dependency added.

## Test quality

- Focused suite 11/11; full suite 1678 passed / 11 skipped on Node 24 and on a
  Node 20 copy without `.env`.
- Red-capability on the base module: **9 failed / 2 passed**. The two passes are
  configured-path cases that set valid env before load and do not assert import
  safety; every D1/D4/D5 assertion fails on base for the right reason.
- Module-cache isolation is correct: `jest.isolateModules` + `requireActual` per
  case; a leaked cache boolean would break the later invalid-config assertions.
- No test asserting the new behaviour would pass under an import-time VAPID
  requirement.

## Independent command results

```text
focused push-config suite        11/11 PASS
full suite (Node 24)             139 passed / 1 skipped; 1678 passed / 11 skipped
full suite (Node 20, no .env)    1678 passed / 11 skipped
type-check                       exit 0 (Node 24 and Node 20)
repo lint                        61 errors / 11 warnings (unchanged)
owned eslint / prettier          clean
no-VAPID build, Node 20, no .env pre-fix: exit 1 (Missing VAPID, page-data)
no-VAPID build, Node 20, no .env post-fix: exit 0
env -i import                    IMPORT_OK_NO_ENV
```

## Not verified

- **AC5/D7 is not satisfied**: the branch is not committed or pushed, so there is
  no CI run. This remains the release gate and must not be treated as green.
- Hosted CI uses Node 20.x latest; the verifier used local `v20.15.0`.
- No real VAPID credentials or end-to-end push delivery.
- 404 cleanup and non-410 rethrow checked statically (R-02).
- The hosted CI Prisma generate step was not re-run (hard-linked client reused).

## Residual risk

- Push is a silent no-op with one log line when VAPID is absent or malformed; log
  monitoring is the only runtime signal.
- A cached `false` needs a process restart after env is corrected.
- Per-module-instance cache (R-03).
- No Postgres/Redis runtime smoke; the change does not touch those paths.

## Routing

**PASS WITH NOTES.** Implementation is ready for the commit gate; **do not merge
or release until AC5 is satisfied** — commit and push the branch, then require a
green CI run with Build included on Node 20. R-01/R-04 are fixed by the Lead;
R-02/R-03/R-05 are recorded and accepted. No merge, push, deploy, migration or
seed by this review.
