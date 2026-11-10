# Task — GL-AME-BOOTSTRAP-001

**Status:** awaiting_commit_gate  
**Revision:** 1  
**Approved revision:** 1  
**Approved by:** Atiff (development-risk decision 2026-11-10)  
**Approval date:** 2026-11-10  
**Next actor:** human  
**Correction cycle:** 2 of 3 complete (`REVIEW-03.md` PASS WITH NOTES)  
**Risk:** R3  
**Workflow:** BUG / security remediation

## Objective

Remediate the 0.2.1 bootstrap review findings without changing product behavior.

**Approved correction scope (cycle 2):** critical + high findings only —
R-01, R-02, R-03. Medium and low findings are deferred and out of scope for
this cycle.

## Scope

- Remove plaintext credential values from tracked files.
- Correct AME documentation that misstates exposure.
- Add the R3 remediation record and evidence.
- Fix Lead/Verifier permission and command mismatches.
- Correct auth and API documentation paths.
- Re-run type-check, tests, build, and lint on this branch.
- Add a secret-scanning check or documented manual scan.

## Non-goals

- No auth, payment, RBAC, ordering, UI, or database behavior change.
- No credential rotation.
- No Git history rewrite or force-push.
- No production deployment.
- No lint-baseline cleanup.
- No merge.

## Ownership

**Files/modules owned:** files named in `REVIEW-01.md`, `.opencode/agents/*`, `.github/workflows/ci.yml`, `docs/ai/*`, `docs/PRODUCT/*`, `AGENTS.md`, `GLOSSARY.md`, `.gitignore`.

**Do not touch:** application code under `src/`, `prisma/`, migrations, dependencies.

## Acceptance criteria

1. No plaintext database/JWT/NEXTAUTH credential remains in tracked files.
2. Docs state current-tree removal and historical exposure accurately.
3. R3 approval and evidence are recorded.
4. Lead `.env`/destructive shell guards are present.
5. Verifier command allowlist matches `npm run type-check`, build, format:check.
6. Auth paths and API documentation path are correct.
7. `AME_VERSION` is portable.
8. Money convention is explicit.
9. JSONC formatting passes.
10. Baseline is re-run on this branch and recorded.
11. Fresh review returns PASS or PASS WITH NOTES.
12. No merge without human commit-gate approval.

**Cycle-2 applicability:** criteria 1-5 and 9-12 apply fully. Criterion 6
applies for the auth paths (already correct); the API-documentation path maps to
deferred R-10. Criterion 7 maps to deferred R-11. Criterion 8 maps to R-12,
already closed. Review must report deferred criteria as deferred, not as
cycle-1 failures.

## Verification

```text
npm run type-check
npm test -- --runInBand
npm run build
npm run lint
npx prettier --check .opencode/opencode.jsonc
```

## Review focus

- Credential removal from current tree.
- Truthful exposure documentation.
- Agent permission policy.
- Path and command accuracy.
- No product-code changes.

## Commit gate

- [x] Review PASS (`REVIEW-03.md` PASS WITH NOTES)
- [x] Exact path list published
- [x] Exact commit message published
- [x] Human approved (2026-11-10)
- [x] No unrelated changes
