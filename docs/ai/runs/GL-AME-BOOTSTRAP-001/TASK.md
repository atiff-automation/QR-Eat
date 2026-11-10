# Task — GL-AME-BOOTSTRAP-001

**Status:** correction_required  
**Revision:** 1  
**Approved revision:** 1  
**Approved by:** Atiff (development-risk decision 2026-11-10)  
**Approval date:** 2026-11-10  
**Next actor:** implementer  
**Risk:** R3  
**Workflow:** BUG / security remediation

## Objective

Remediate the 0.2.1 bootstrap review findings without changing product behavior.

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

- [ ] Review PASS
- [ ] Exact path list published
- [ ] Exact commit message published
- [ ] Human approved
- [ ] No unrelated changes
