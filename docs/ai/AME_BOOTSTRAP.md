# AME Bootstrap Status — QR-Eat

**Date:** 2026-11-10
**Branch:** `main`  
**Status:** 0.2.8 installed; remediation task closed; verifier allowlist completed

## Clean restart

- Archived old attempt: `archive/ame-bootstrap-v1`
- Started from `main` at `2918f46`
- Installed AME kit **0.2.1** on `chore/ame-bootstrap-021`
- Upgraded to AME kit **0.2.6** on `chore/ame-bootstrap-025`
- Applied AME kit **0.2.7** permission ergonomics; merged into `main` at `ebc6948`
- Applied AME kit **0.2.8** verifier allowlist on `chore/ame-028`
- Redid the security cleanup on the bootstrap branch

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
- [x] AME 0.2.8 core/templates/checklists
- [x] Eight commands: ame, plan, bug, feature, review, fix, resume, audit
- [x] Five skills: grilling, debugging, verification, engineering-discipline, handoff
- [x] Eight-command / five-skill adapter validation
- [x] `ACTIVE.md` pointer installed
- [x] Context budget added to the task template
- [x] Lead `.env`/destructive-shell guards preserved
- [x] Blanket `external_directory` prompt removed
- [x] Verifier read-only shell allowlist added, with `.env` denies
- [x] Added `which`, `command -v`, `echo`, and `sort` to the verifier allowlist
- [x] Absolute kit-source path removed from `AME_VERSION`
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
- `REVIEW-03.md` — PASS WITH NOTES; human commit gate satisfied; accepted local
  commit `21f5139`.
- Task `GL-AME-BOOTSTRAP-001` is **done**.
- Deferred follow-ups: R-04, R-08, R-10, R-11.

The 0.2.6 kit upgrade is committed at `f58b31d` and merged into `main` at
`b2f3949`. The 0.2.7 permission-ergonomics patch is merged into `main` at
`ebc6948`.

## Next

1. Restart OpenCode/Desktop so the running background server reloads the agents.
2. Run one small `/ame` pilot task and confirm the prompt noise is reduced.
3. Keep the deferred follow-ups visible: R-04, R-08, R-10, R-11.
4. Do not merge product work before explicit approval.
