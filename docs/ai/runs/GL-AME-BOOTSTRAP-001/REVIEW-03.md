# Review — GL-AME-BOOTSTRAP-001 correction cycle 2

**Reviewer:** ame-verifier (independent subagent)  
**Date:** 2026-11-10  
**Verdict:** PASS WITH NOTES  
**Diff base:** `ddfc870` (working tree); branch `chore/ame-bootstrap-021`  
**Spec source:** `TASK.md` revision 1, approved correction scope R-01/R-02/R-03  
**Risk:** R3

## Findings

| ID | Severity | Location | Issue | Required fix | Verification |
|---|---|---|---|---|---|
| V-01 | medium | `RUN_LOG.md` | File accounting: log says 19 modified but `git status` shows 20; `docs/ai/PROJECT_PROFILE.md` is missing from the list. Evidence sentence is false. | State 20 modified, add `PROJECT_PROFILE.md`, correct the evidence sentence. | `git status` vs run-log list |
| V-02 | low | `TASK.md` | Scope and applicability sections still labelled "cycle 1". | Relabel to cycle 2. | File review |
| V-03 | low | `docs/ai/AME_BOOTSTRAP.md` | Baseline table attributes type-check to `5dd1b76`; current re-run is only in the run log. | Add a re-verified pointer; R-08 stays deferred. | Baseline run + file review |
| V-04 | low | `.opencode/agents/*` | Resolved config lists both `read *.env => ask` (default) and `=> deny` (agent); precedence not runtime-tested. | Deferred; runtime test of a denied read. | Not verified |

Deferred by human approval (not failures): R-04, R-08, R-10, R-11, L-05. R-05/R-06/R-07/R-09/R-12/R-13 remain closed.

## Passed checks

- H-01 corrected: `PROJECT_PROFILE.md` now states current-tree removal, historical-only exposure, and cross-references approval/conditions/expiry. No contradiction with `AME_BOOTSTRAP.md`.
- M-01, L-02, L-03, L-04 corrected.
- R-01 holds: no production-host, user-info, or private-key markers in tracked files; only localhost dev/test placeholders. No values in review artifacts.
- R-02 approval record complete.
- R-03 `.env` read/edit denies, destructive-shell denies, and sandbox note present; both agents load.
- Scope: only 20 working-tree modifications plus new `REVIEW-02.md`; no `src/`, `prisma/`, `.github/`, dependency, migration, or Android changes.
- Type-check, tests (57 suites / 524 tests / 11 skipped), build pass; lint baseline unchanged at 62 errors / 11 warnings.

## Spec findings

| Criterion | Status |
|---|---|
| 1 no plaintext DB/JWT/NEXTAUTH credential | Met for the reviewed credential; pre-existing fallback/dev JWT literals in `src/` are out of scope |
| 2 truthful exposure docs | Met |
| 3 R3 approval + evidence | Met |
| 4 Lead `.env`/destructive guards | Met |
| 5 Verifier command allowlist | Met |
| 6 auth/API doc paths | Auth paths correct; API-doc path deferred to R-10 |
| 7 `AME_VERSION` portable | Deferred R-11 |
| 8 money convention | Closed R-12 |
| 9 JSONC formatting | Met |
| 10 baseline re-run/recorded | Met |
| 11 fresh review | This report |
| 12 no merge | Met |

## Not verified

- Runtime enforcement/precedence of the `.env` read denies and destructive-shell denies.
- Whether the historical credential is still active (not tested).
- CI with the `VAPID_PRIVATE_KEY` secret (R-04).
- `tsc` coverage of root scripts (`tsconfig` covers `src/**`); guards inspected manually.
- Prettier over `.bat` files (no parser).

## Residual risk

- Historical credential remains in Git history and was not rotated; treat as compromised before production.
- Permission rules are policy, not a sandbox; duplicate `ask`/`deny` precedence unverified.
- Pre-existing demo-account passwords remain in deployment documentation.
- Pre-existing development fallback JWT secret literals in `src/` (out of scope).
- Lint baseline red (62 errors, 11 warnings).
- Deferred: R-04, R-08, R-10, R-11, L-05.

## Routing

`PASS WITH NOTES` → Lead corrects V-01 before the commit gate and records the notes. Human decides at the R3 commit gate. Do not merge without explicit approval.
