# Reconciliation report — QR-Eat loyalty docs before Tabtep Phase B

**Date:** 2026-11-17
**Repository:** `/home/atiff/Desktop/QR-Eat`
**Branch:** `feat/loyalty-promo-v1`
**Frozen server commit:** `df40e1d`
**Commit before this work:** `955045a` (docs-only freeze stamp)
**Commit containing this report:** the docs-only commit whose parent is `955045a`
(subject `docs: reconcile loyalty freeze state`). Git is authoritative for the
exact hash.

**Source handoff:** `../Tabtep-App/docs/ai/handoffs/QR-EAT-LOYALTY-RECONCILIATION.md`

## Scope

Docs-only reconciliation of the loyalty run directory and the product docs, so a
Counter session reads one consistent freeze. No product behaviour changed.

Allowed and used:

- documentation under `docs/PRODUCT/` and
  `docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/`;
- one docs-only commit on `feat/loyalty-promo-v1`;
- the local, git-ignored `.env.example` key-name correction (not committed).

Not used: `src/**`, `prisma/**`, `scripts/**`, migrations, seed, database
commands, merge, push, tag, deploy, loyalty flag changes, Tabtep worktrees.

## Verification before editing

```text
git rev-parse --short HEAD                            -> 955045a
git branch --show-current                             -> feat/loyalty-promo-v1
git status --porcelain                                -> clean
git diff --stat df40e1d..HEAD -- src prisma scripts   -> empty
git ls-remote --heads origin feat/loyalty-promo-v1    -> no remote branch
git rev-parse --abbrev-ref --symbolic-full-name @{u}  -> no upstream configured
```

## Contradictions reconciled

| # | Document | Before | After |
|---|---|---|---|
| 1 | `NEXT.md` | "P11-prep complete; P11 is next" | P11 complete: REVIEW-29 FAIL → REVIEW-30 PASS WITH NOTES, human pass PASS, freeze stamped |
| 2 | `NEXT.md` | two different "Pilot" steps, both numbered 3 | one Pilot step, numbered 3, gated on the merge decision |
| 3 | `TASK.md` | header froze after P11 but metadata said "Updated 2026-11-14 · P6, P7, P8 and P9 complete" | metadata says P6–P11 complete, frozen `df40e1d`, human pass PASS |
| 4 | `RELEASE-COMPATIBILITY.md` | "P11 four-lens review pending" beside its own frozen header | REVIEW-29 FAIL → REVIEW-30 PASS WITH NOTES; human pass PASS |
| 5 | `API-CONTRACT.md` | "The final hash is stamped after the P11 review passes" directly under the freeze stamp | stamping sentence removed; frozen state recorded (unmerged, unpushed, untagged, undeployed) |
| 6 | `COUNTER-HANDOFF-LOYALTY.md` | candidate freeze `e5f6046` | frozen **`df40e1d`** |
| 7 | `OPEN-ITEMS.md` | P11-1 and P11-2 gates still open | both CLOSED with evidence |
| 8 | `TASK.md` / `API-CONTRACT.md` | "P11 PASS" | REVIEW-29 **FAIL** → REVIEW-30 **PASS WITH NOTES**; P11 human pass **PASS** |
| 9 | local `.env.example` (ignored) | `LOYALTY_PHONE_HASH_KEY` | `LOYALTY_PHONE_HMAC_KEY` (not committed) |
| 10 | modify idempotency | addendum table: header; handoff: body, header returns 400 | recorded as owner decision `OI-1`; no semantics changed |

### Item 10 detail — `PATCH /api/orders/{id}/modify`

The implementation was read (not edited): it parses `idempotencyKey` from the
JSON body; there is no header read. A header-only request fails validation with
400. The addendum surface table still says `Idempotency-Key`; the Counter handoff
documents the body form. Per the handoff, neither statement was changed. The
contradiction is captured as `OI-1` in `OPEN-ITEMS.md` and cross-referenced from
`API-CONTRACT.md` §18.20.2/§18.20.4 and the Counter handoff.

## Files changed in the commit

```text
docs/PRODUCT/API-CONTRACT.md
docs/PRODUCT/COUNTER-HANDOFF-LOYALTY.md
docs/PRODUCT/RELEASE-COMPATIBILITY.md
docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/NEXT.md
docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/OPEN-ITEMS.md
docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/RECONCILIATION-REPORT.md
docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/RUN_LOG.md
docs/ai/runs/QR-EAT-LOYALTY-PROMO-V1/TASK.md
```

The commit hook (lint-staged + prettier) ran on the Markdown; it made no content
change.

## Verification after the commit

```text
git status --porcelain                                -> clean
git rev-parse HEAD^                                   -> 955045a
git diff df40e1d..HEAD -- src prisma scripts          -> empty
git ls-remote --heads origin feat/loyalty-promo-v1    -> no remote branch
```

`.env.example` remains untracked and git-ignored (`.gitignore:34`), corrected in
the working tree only.

## Acceptance criteria

| Criterion | Result |
|---|---|
| Docs agree: frozen `df40e1d`, human pass PASS, review PASS WITH NOTES, unmerged/undeployed, flags off | Met |
| `COUNTER-HANDOFF-LOYALTY.md` names `df40e1d`, not `e5f6046` | Met |
| Modify-idempotency contradiction corrected with approval or recorded as an owner decision | Recorded as `OI-1` (no approval given) |
| `git diff df40e1d..HEAD -- src prisma scripts` empty | Met |
| `git status` clean except the untracked `.env.example` correction | Met |
| No secret value printed, committed or copied into a doc | Met (key name only; placeholder unchanged) |

## Remaining owner decisions

1. **Merge target.** Local `main` is 17 commits ahead of `origin/main`;
   `feat/loyalty-promo-v1` is 77 commits ahead of `origin/main` (60 ahead of
   local `main`). Choose: merge to local `main`, and/or push the feature branch
   and open a PR against `origin/main`. Do not let a tool choose — a naive
   merge-and-push can publish unrelated AME/security history.
2. **`OI-1` modify idempotency.** Either correct the addendum table to the
   implemented body contract (and add an interpretation-register row) or change
   the server to accept the header (which requires a new freeze). No action taken.
3. **P8-6 (pre-existing, carried).** `net` includes tax and service; the P&L is
   non-statutory until the owner/accountant signs
   `docs/PRODUCT/P8-6-ACCOUNTING-SIGNOFF.md`.

## No forbidden action taken

No merge, push, tag, deploy, flag change, migration, seed, database command, or
edit to `src/**`, `prisma/**`, `scripts/**`, or any Tabtep worktree. The stop
point in the handoff is respected.

## Post-merge note (2026-11-17)

The owner later resolved the two remaining decisions recorded above: **OI-1 A** (docs-only
correction to the implemented body contract) and **merge A** (review/push local `main`, then merge
with a merge commit). The resolution and the merge evidence are in `RUN_LOG.md`.
