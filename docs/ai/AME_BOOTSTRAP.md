# AME Bootstrap Status — QR-Eat

**Date:** 2026-11-10  
**Branch:** `chore/ame-bootstrap-021`  
**Status:** 0.2.1 setup complete; correction cycle 2 in progress

## Clean restart

- Archived old attempt: `archive/ame-bootstrap-v1`
- Started from `main` at `2918f46`
- Installed AME kit **0.2.1**
- Redid the security cleanup on this branch

## Completed

- [x] Removed tracked `.railway-env-config.txt` and `.railway-env-update.txt`
- [x] Added `.railway-env-*.txt` to `.gitignore`
- [x] Replaced hardcoded VAPID private key with `${{ secrets.VAPID_PRIVATE_KEY }}`
- [x] `AGENTS.md`
- [x] `GLOSSARY.md`
- [x] `docs/ai/PROJECT_PROFILE.md`
- [x] `docs/ai/BACKLOG.md`
- [x] `docs/ai/runs/`
- [x] `docs/PRODUCT/`
- [x] AME 0.2.1 core/templates/checklists
- [x] Five commands: audit, bug, feature, fix, review
- [x] Four skills
- [x] Five-command / four-skill adapter validation
- [x] Agent permissions checked
- [x] No product code changed

## Runtime

- OpenCode CLI **V2.2.6**
- Desktop **V2.1.3**
- Default model: `opencode-go/deepseek-v4.1-flash`
- Live provider and `ame-lead` tests passed earlier

## Baseline

| Check | Result |
|---|---|
| Type-check | PASS — recorded at `5dd1b76`; re-verified on the `ddfc870` working tree (R-08 commit pin deferred) |
| Tests | PASS — 57 suites, 524 tests, 11 skipped |
| Build | PASS |
| Lint | FAIL — 62 errors, 11 warnings (pre-existing) |

Re-verification evidence: `docs/ai/runs/GL-AME-BOOTSTRAP-001/RUN_LOG.md`.

## Accepted development risk

**Approved by:** Atiff (project owner)  
**Approval date:** 2026-11-10  
**Expiry:** first production deployment, or 2026-12-31, whichever is earlier;
renew in writing before expiry.  
**Conditions:** no merge or deployment while a live credential is present in the
tree; rotate database, JWT, NEXTAUTH, payment, and VAPID credentials before
production; purge Git history before production; configure CI secrets; re-run
the documented checks.  
**Evidence:** `docs/ai/runs/GL-AME-BOOTSTRAP-001/REVIEW-01.md`,
`docs/ai/runs/GL-AME-BOOTSTRAP-001/RUN_LOG.md`.

Rotation and Git history rewrite are deferred until production/real users.

Current tree: the `.railway-env-*.txt` files are removed, and the credential
values were removed from legacy debug/ops scripts and documentation in
correction cycle 1 of `GL-AME-BOOTSTRAP-001` (2026-11-10). The credential still
exists in Git history and was not rotated. Do not merge or use real credentials.

Before production:

- rotate database, JWT, NEXTAUTH, payment, and VAPID credentials as applicable;
- purge Git history;
- configure CI secrets;
- re-run CI.

## Review status

- `REVIEW-01.md` — FAIL (critical + high findings).
- `REVIEW-02.md` — FAIL (R-02 documentation gap; run-log accuracy).

Correction cycle 2 addresses the `REVIEW-02.md` findings. The branch is **not
ready to merge** until a fresh review passes.

## Next

1. Fresh `/ame-review` after correction cycle 2 → `REVIEW-03.md`.
2. Human commit gate with exact paths and message.
3. Deferred follow-ups: R-04, R-08, R-10, R-11.
4. Do not merge before PASS and explicit approval.
