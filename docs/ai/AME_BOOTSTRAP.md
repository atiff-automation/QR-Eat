# AME Bootstrap Status — QR-Eat

**Date:** 2026-11-10  
**Branch:** `chore/ame-bootstrap-021`  
**Status:** 0.2.1 setup complete; remediation review open

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
| Type-check | PASS — branch `5dd1b76` |
| Tests | PASS — 57 suites, 524 tests, 11 skipped |
| Build | PASS |
| Lint | FAIL — 62 errors, 11 warnings (pre-existing) |

## Accepted development risk

Rotation and Git history rewrite are deferred until production/real users.

Current tree: the `.railway-env-*.txt` files are removed, but the same
credential remains in legacy debug/ops scripts and documentation until
`GL-AME-BOOTSTRAP-001` is remediated. Do not merge or use real credentials.
Before production:

- rotate database, JWT, NEXTAUTH, payment, and VAPID credentials as applicable;
- purge Git history;
- configure CI secrets;
- re-run CI.

## Review status

The prior review findings are ported to:

```text
docs/ai/runs/GL-AME-BOOTSTRAP-001/REVIEW-01.md
```

The branch is **not ready to merge** until remediation and a fresh review pass.

## Next

1. Run `/ame-fix docs/ai/runs/GL-AME-BOOTSTRAP-001/REVIEW-01.md`
2. Fix critical/high findings first.
3. Re-run baseline on this branch.
4. Fresh `/ame-review`.
5. Human commit gate.
6. Do not merge before PASS.
