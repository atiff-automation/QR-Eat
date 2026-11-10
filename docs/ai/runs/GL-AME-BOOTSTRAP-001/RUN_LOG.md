# Run Log — GL-AME-BOOTSTRAP-001

**Title:** Remediate AME 0.2.1 bootstrap review findings  
**Type:** bug / security remediation  
**Risk:** R3  
**Spec level:** L2  
**Owner:** AME Lead  
**Date:** 2026-11-10  
**Branch:** `chore/ame-bootstrap-021`  
**Task revision:** 1  
**Approved revision:** 1  
**Correction cycle:** 2 of 3  
**Approved correction scope:** critical + high only (R-01, R-02, R-03)  
**Task contract:** `TASK.md`  
**Latest review:** `REVIEW-03.md` (PASS WITH NOTES — cycle 2)

## Request

Remediate the review findings from the archived 0.1.0 bootstrap attempt against the clean 0.2.1 branch.

## Classification

R3 because the current tree previously contained a production-looking database credential. L2 because the remediation is bounded to credentials, docs, agent permissions, and verification.

## Scope

In scope:

- remove credential values from tracked files (R-01);
- record the R3 risk acceptance with approver, conditions, expiry, evidence (R-02);
- add Lead `.env`/destructive guards and the shell-is-not-a-sandbox note (R-03);
- rerun the documented checks.

Out of scope this cycle (deferred, not approved):

- R-04 CI `VAPID_PRIVATE_KEY` verification — requires a production/secret decision.
- R-05-R-13 medium/low items — R-05, R-06, R-07, R-09, R-12, R-13 were already
  closed before this cycle; R-08, R-10, R-11 remain open.
- Product behavior, credential rotation, history rewrite, deployment, lint cleanup, merge.

## Approvals

| Gate | What was approved | Approved by | Date | Conditions / expiry |
|---|---|---|---|---|
| Design | Remediation scope | Atiff | 2026-11-10 | Dev risk accepted; no rotation/history rewrite yet |
| Correction scope | Critical + high band (R-01, R-02, R-03) | Atiff | 2026-11-10 | Medium/low deferred |
| Commit | Exact paths + message | Atiff | 2026-11-10 | Approved at gate; no push, merge, or history rewrite |

## Execution

Files changed (20 modified, plus new `REVIEW-02.md` and `REVIEW-03.md`):

- `.opencode/agents/ame-lead.md`
- `DEPLOYMENT-STATUS.md`
- `check-railway-migrations.bat`
- `check-status-values.js`
- `check_db_tables.ts`
- `check_order_issue.ts`
- `cleanup_tables.ts`
- `create-tables-railway.bat`
- `docs/ai/AME_BOOTSTRAP.md`
- `docs/ai/PROJECT_PROFILE.md`
- `docs/ai/runs/GL-AME-BOOTSTRAP-001/TASK.md`
- `docs/ai/runs/GL-AME-BOOTSTRAP-001/RUN_LOG.md`
- `fix-railway.bat`
- `fix_invalid_status.ts`
- `migrate-railway.bat`
- `reset-and-seed-railway.bat`
- `run-enum-migration.bat`
- `scripts/apply-enum-migration.ts`
- `scripts/check-owner-roles.ts`
- `seed-railway.bat`

Changes:

- R-01: replaced the hardcoded database connection value with
  `process.env.DATABASE_URL` plus a fail-fast guard in 7 TypeScript/JavaScript
  files. Batch files now require `%DATABASE_URL%` and exit with an error when it
  is unset. `DEPLOYMENT-STATUS.md` now shows `$DATABASE_URL` and
  `psql "$DATABASE_URL"` instead of literal values.
- R-02: added approver, date, expiry, conditions, and evidence to the accepted
  development risk record in `docs/ai/AME_BOOTSTRAP.md`; updated the bootstrap
  status text to state current-tree removal and historical-only exposure.
- R-03: added `read` deny rules for `.env` patterns to the Lead agent, added the
  `rm -fr` variant and broadened `git clean -f*`, and documented that shell is
  not a sandbox and that permission rules are policy, not a boundary.

Commands run:

```text
npm run type-check                    PASS
npm test -- --runInBand               PASS — 57 suites passed, 1 skipped; 524 tests passed, 11 skipped
npm run build                         PASS
npm run lint                          FAIL — 62 errors, 11 warnings (pre-existing baseline, unchanged)
npx prettier --check .opencode/opencode.jsonc <changed text files>  PASS
opencode debug agents                  PASS — ame-lead and ame-verifier load with new rules
```

Prettier was checked on the changed text files and `.opencode/opencode.jsonc`.
Batch files have no inferable Prettier parser and were not checked.

Credential scan (tracked files, filename-only output):

```text
git grep -l -E 'rlwy\.net|centerbeam|PGPASSWORD' -- ':!docs/ai/runs/'  → no matches
git grep -l -E 'postgres(ql)?://[^/[:space:]]+:[^@[:space:]]+@'       → localhost/test placeholders only
git grep -l 'BEGIN ... PRIVATE KEY'                                    → no matches
```

The `docs/ai/runs/` exclusion avoids self-matching this log's documented scan
patterns. No credential values were printed to this log.

Cycle 2 re-run after the documentation fixes: type-check PASS, tests PASS
(57 suites / 524 tests / 11 skipped), build PASS, lint unchanged at 62 errors /
11 warnings, Prettier PASS on changed text files, credential scans no matches.

## Verification

Cycle 1 verdict (`REVIEW-02.md`): FAIL — R-02 incomplete (`PROJECT_PROFILE.md`
still misstated current-tree exposure) plus run-log accuracy notes. R-01 and R-03
passed.

Cycle 2 corrections:

- H-01: corrected the `docs/ai/PROJECT_PROFILE.md` risk block to current-tree
  removal plus historical-only exposure, with a pointer to the recorded
  approval, conditions, and expiry.
- M-01: corrected the R-01 file count to 7 TS/JS files.
- L-01: file count now states 19 modified plus the new `REVIEW-02.md`.
- L-02: Prettier claim scoped to text files and `opencode.jsonc`.
- L-03: credential scan excludes `docs/ai/runs/` to avoid self-matching.
- L-04: bootstrap status and next steps updated for cycle 2. The recorded
  baseline commit is unchanged (R-08 remains deferred).
- L-05: deferred (non-project verifier allowlist entries).

Cycle 2 verdict (`REVIEW-03.md`): PASS WITH NOTES. V-01 file accounting is
corrected in this log; V-02 and V-03 are corrected; V-04 (runtime precedence of
duplicate `ask`/`deny` entries) is deferred to a live permission test.

Findings status:

- R-01: fixed in current tree; historical exposure remains.
- R-02: fixed in `AME_BOOTSTRAP.md`, `PROJECT_PROFILE.md`, and this run log.
- R-03: fixed.

Evidence:

- Commands above.
- `git status` shows only the 20 modified files listed plus new `REVIEW-02.md`
  and `REVIEW-03.md`; no `src/`, `prisma/`, migration, dependency, or Android
  changes.

Not verified:

- CI with the `VAPID_PRIVATE_KEY` secret (R-04, deferred).
- Whether the historical database credential is still active; it was not tested.
- Git history purge and credential rotation (explicitly out of scope).

## Residual risk

- Historical credentials remain in Git history; accepted development risk with
  expiry recorded in `docs/ai/AME_BOOTSTRAP.md`.
- The historical database credential was not rotated. Treat it as compromised
  before any production use.
- Default demo account passwords remain in deployment documentation. They are
  pre-existing and outside R-01, but must not be reused for real accounts.
- Lint baseline remains red (62 errors, 11 warnings).
- R-04, R-08, R-10, R-11 remain open and deferred.

## Release

- Deployed: No
- Smoke test: N/A
- Rollback: N/A
- Monitoring: N/A

## Lessons

- Secret removal must include legacy debug/ops scripts and deployment docs, not
  only `.env` files.
- Permission lists need both `edit` and `read` guards for secret files.

## Next

1. Fresh independent review → `REVIEW-03.md`.
2. Human commit gate with exact path list and message.
3. Do not merge before PASS and explicit approval.

## Post-task migration — 2026-11-10

- `REVIEW-03.md` returned PASS WITH NOTES.
- Human commit gate satisfied; accepted local commit `21f5139`.
- Task status migrated from the 0.2.1 value `awaiting_commit_gate` to the 0.2.5
  value `done`; next actor is none.
- AME kit updated to 0.2.6 on `chore/ame-bootstrap-025`.
- Merged into `main` at `b2f3949`; no push, credential rotation, or history
  rewrite was performed.
- AME 0.2.7 permission ergonomics applied on `chore/ame-027`: removed blanket
  external-directory prompts, added the verifier read-only shell allowlist,
  and removed the absolute kit-source path from `AME_VERSION`.
- AME 0.2.8 applied on `chore/ame-028`: added `which`, `command -v`, `echo`,
  and `sort` to the verifier allowlist after the permission smoke test showed
  those compound-command utilities still prompting.
- AME 0.2.9 applied on `chore/ame-029`: added `./gradlew *` to the portable
  verifier allowlist for Android projects.
