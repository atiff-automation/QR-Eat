# Review — GL-AME-BOOTSTRAP-001 revision 1

**Reviewer:** Ported from the 2026-11-10 review of `archive/ame-bootstrap-v1`  
**Date:** 2026-11-10  
**Verdict:** FAIL — revalidate on `chore/ame-bootstrap-021`  
**Diff base:** `main`  
**Spec source:** `TASK.md` revision 1  
**Risk:** R3

## Findings

| ID | Severity | Location | Issue | Required fix | Verification |
|---|---|---|---|---|---|
| R-01 | critical | `DEPLOYMENT-STATUS.md` and 14 root/script files | Plaintext Railway/Postgres credential remained in tracked files, including a file modified by the branch | Remove or parameterize every tracked credential; do not print values | Secret scan + `git grep` |
| R-02 | high | `docs/ai/AME_BOOTSTRAP.md`, `docs/ai/PROJECT_PROFILE.md`, `docs/ai/runs/` | R3 risk acceptance had no approver, conditions, expiry, or run log | Record approval, conditions, evidence, residual risk | Review of run log |
| R-03 | high | `.opencode/agents/ame-lead.md` | Lead could read `.env` and run broad destructive shell commands | Add `.env`/destructive guards; document that shell is not a sandbox | `opencode debug agents` |
| R-04 | medium | `.github/workflows/ci.yml` | CI depends on an unverified `VAPID_PRIVATE_KEY` secret | Configure the secret or document the blocker; avoid false green | CI run |
| R-05 | medium | `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md` | `src/lib/auth` path does not exist | Replace with `src/lib/auth.ts`, `auth-utils.ts`, `device-auth.ts`, `rbac/` | File existence check |
| R-06 | medium | `.opencode/agents/ame-lead.md` | Allowlist referenced agents not installed | Remove dead entries until agents exist | `opencode debug agents` |
| R-07 | medium | `.opencode/agents/ame-verifier.md` | Verifier allowed `npm run typecheck*`; project uses `type-check` | Fix allowlist; add build/format commands | `opencode debug agents` |
| R-08 | low | `docs/ai/PROJECT_PROFILE.md` | Baseline was for `main`, not branch HEAD | Re-run baseline on HEAD and record commit | Test output |
| R-09 | low | `AGENTS.md`, profile, bootstrap status | Baseline test counts inconsistent | Record exact suite/test counts | Test output |
| R-10 | low | `docs/ai/PROJECT_PROFILE.md` | `docs/API-DOCUMENTATION.md` path does not exist; file is at repo root | Fix path | File check |
| R-11 | low | `docs/ai/AME_VERSION` | Machine-local absolute source path | Record kit version/source portably | File check |
| R-12 | low | `docs/PRODUCT/API-CONTRACT.md` | Money convention ambiguous | Use actual Prisma `Decimal(10,2)` convention | Code/config check |
| R-13 | low | `.opencode/opencode.jsonc` | Prettier check fails on trailing comma | Format file | Prettier |

## Passed checks

- AME artifacts present and coherent.
- OpenCode V2 loads `ame-lead` and `ame-verifier`.
- Verifier is read-only.
- No product code, schema, migration, dependency, or Android changes.
- Cross-repo contract index and paths are internally consistent.
- Route counts match.

## Not verified

- Full review on the clean `chore/ame-bootstrap-021` HEAD.
- CI with the VAPID secret.
- Live permission prompts.
- Whether the Railway credential is still active; it must not be tested.

## Residual risk

- The current tree must have no credential values after remediation.
- Historical credentials remain in Git history; accepted development risk.
- Lint baseline remains red.

## Routing

`FAIL` → implement remediation, then fresh review `REVIEW-02.md`.

## Evidence

Prior review evidence: `git status`, diff stats, `opencode debug agents`, credential scan, route counts, test counts, Prettier check. No credential values printed.
