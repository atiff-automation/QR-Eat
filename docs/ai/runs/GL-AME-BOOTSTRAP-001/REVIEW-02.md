# Review — GL-AME-BOOTSTRAP-001 correction cycle 1

**Reviewer:** ame-verifier (independent subagent)  
**Date:** 2026-11-10  
**Verdict:** FAIL  
**Diff base:** `ddfc870` (working tree); branch context `main...HEAD`  
**Spec source:** `TASK.md` revision 1, approved correction scope R-01/R-02/R-03  
**Risk:** R3

## Findings

| ID | Severity | Location | Issue | Required fix | Verification |
|---|---|---|---|---|---|
| H-01 | high | `docs/ai/PROJECT_PROFILE.md` lines 152-156 | R-02 incomplete: risk block still says the credential remains in the current tree and has no approver/date/conditions/expiry/evidence. Contradicts `AME_BOOTSTRAP.md`. | Replace with corrected current-tree vs history wording and cross-reference the recorded approval, conditions, and expiry. | File grep + diff |
| M-01 | medium | `docs/ai/runs/GL-AME-BOOTSTRAP-001/RUN_LOG.md` | R-01 entry says "8 TypeScript/JavaScript files"; the changed set is 7 plus 7 batch files. | Correct the count. | Run log review |
| L-01 | low | `RUN_LOG.md` | Log says 18 files; `git status` shows 19 because the run log itself is modified and unlisted. | State "18 plus this run log" or list 19. | `git status` |
| L-02 | low | `RUN_LOG.md` | Prettier claim is not reproducible over batch files (no parser). | Scope the claim to text files and cite the JSONC check. | `npx prettier --check .opencode/opencode.jsonc` |
| L-03 | low | `RUN_LOG.md` | Credential scan now self-matches the run log's documented pattern. | Exclude `docs/ai/runs/` or note the self-match. | `git grep -l` |
| L-04 | low | `docs/ai/AME_BOOTSTRAP.md` | Status and next-step text still say remediation review open / run `/ame-fix`; baseline label is stale. | Update status and next steps to cycle 2; keep baseline label out of scope or mark it. | File review |
| L-05 | low | `.opencode/agents/ame-verifier.md` | Non-project dead allowlist entries (`bun`, `pytest`, `ruff`). | Deferred; R-06-class cleanup, not required this cycle. | `opencode debug agents` |

## Passed checks

- R-01: no credential value remains in tracked files; historical 15-file set is now zero.
- Fail-fast guards present in 7 TS/JS files and 7 batch files.
- R-03: Lead `.env` read/edit denies, destructive-shell denies, and shell-not-a-sandbox note present; both agents load.
- No changes under `src/`, `prisma/`, migrations, dependencies, or the Android repo.
- Type-check, tests (57 suites / 524 tests / 11 skipped), build pass; lint counts unchanged at 62 errors / 11 warnings.
- `npx prettier --check .opencode/opencode.jsonc` passes.

## Not verified

- Runtime enforcement of the new read/shell deny rules.
- Whether the historical credential is still active (not tested).
- CI with the VAPID secret (R-04, deferred).
- `tsc` coverage of root scripts (tsconfig includes `src/**` only); inspected manually.
- Android repository commits beyond a clean working tree.

## Residual risk

- Historical credentials remain in Git history and were not rotated; expiry recorded.
- Default demo account passwords remain in deployment documentation (pre-existing).
- Lint baseline remains red.
- Deferred and open: R-04, R-08, R-10, R-11.

## Routing

`FAIL` → implementer, correction cycle 2 (within the 3-cycle limit): fix H-01 and M-01/L-01-L-04. Doc-only edits under the approved R-02 scope. Then fresh review as `REVIEW-03.md`, then the commit gate.
