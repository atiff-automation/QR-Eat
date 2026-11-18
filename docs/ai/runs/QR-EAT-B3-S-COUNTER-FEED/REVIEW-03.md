# REVIEW-03 — B3-S deployment gate evidence

**Reviewer:** `ame-verifier` (fresh read-only session `ses_e11776ab4ffedPxvLZyzwujORG`)
**Review date:** 2026-11-18
**Subject:** two-tenant staging gate evidence for `QR-EAT-B3-S-COUNTER-FEED`
(TASK revision 1, acceptance criterion 16)
**Base:** `a0e3753`; content commit `4bf9d38`; freeze stamp `fc14d01`;
`feat/b3-s-counter-feed`
**Risk:** R3 (tenant isolation, order mutation, print facts, SSE, migration)
**Verdict:** **PASS WITH NOTES** — no product defect; evidence-record defects
corrected by the Lead in this revision.

## Bindings

- Code binding is unchanged from `REVIEW-02.md`: `git diff 4bf9d38 -- src
  prisma` is empty after the gate; no product, schema, migration or test file
  changed during the gate or the record correction.
- Frozen contract unchanged since `fc14d01`.
- Gate evidence: `evidence/SHA256SUMS` (15 files) — harness scripts, production
  and development run logs, `evidence.json`, case 7a/7b logs, build log,
  migration logs and the production server log. The disposable local signing
  value is redacted in the copied harness.
- The Lead session id is not exposed to the runtime; evidence is bound by
  hashes instead.

## Findings and disposition

| ID | Severity | Finding | Disposition |
|---|---|---|---|
| F-01 | medium | `1.tenants.list` flagged only rows belonging to neither tenant, so it could not detect B→A leakage | **Fixed** — per-tenant assertions, plus new `2g.list-isolation` run with orders present on both tenants (`aRows 2 / bRows 1 / cross 0`). Final run supersedes the old claim. |
| F-02 | medium | Case 7 was not part of the 44-check run and the permission rows were confounded by fixture upserts | **Fixed** — case 7a now runs on a separate `qreat_migrate` database with migrations only (1 permission / 1 cashier mapping, second deploy no-op), case 7b is a separate fallback check, and the record reports 46 + 3 checks separately. |
| F-03 | medium | SSE assertions were relaxed between the development and production runs without recording it | **Recorded** — "Harness revision and assertion semantics" states the duplicate-tolerant assertions, the duplicate count and the development-run failures explicitly. |
| F-04 | low | Case 6 count recorded as 7 but 8 checks exist | **Fixed** — case 6 is recorded as 8 checks. |
| F-05 | low | `TASK.md`, `BACKLOG.md`, `RELEASE-COMPATIBILITY.md` and `B3-C-HANDOFF.md` still said the gate was pending | **Fixed** — all four now say gate PASSED 2026-11-18, deployment approval pending; `AME-014` updated and `AME-015` added. |
| F-06 | low | `5.sse.reconnect-cursor` was tautological | **Fixed in wording** — case 5 now claims only cursor readability/consistency; the recovery row is proven by `6.changes.cursor-advance` (`rows 4`). |
| F-07 | low | The 410 case is synthetic, not a retention test | **Recorded** — labelled synthetic in the record. |
| F-08 | low | Evidence lived in `/tmp` with no harness hash or executor id | **Fixed** — evidence copied into the task run directory with `SHA256SUMS`; executor limitation recorded. |
| F-09 | low | No explicit cross-tenant idempotency-key replay check | **Fixed** — new `2h.cross-tenant-key-no-replay` (`isDuplicate:false`, B receipt 1, A events unchanged). |

## Verification performed

- Read the production run log: 46 PASS, 0 FAIL, `SUMMARY {"total":46,"failed":0}`.
- Cross-checked `evidence.json` (46 results, `failed: 0`).
- Read the development run log and confirmed the two FAILs were the
  duplicate-frame assertions now disclosed.
- Confirmed the duplicate-SSE characterisation from the production server log:
  every tenant-A notification twice, tenant B only `connection`, tenant-B
  events filtered by the permission check.
- Checked state non-duplication from the same run: one event per add, one chit
  per station, unchanged counts on replay, one chit/receipt for concurrent
  same-key cancel, version increments once.
- Checked case 7a counts and case 7b fallback JSON (`hasCounterServe:false`,
  `patchStatus:200`, order PREPARING).
- Checked the frozen contract and freeze commit metadata; no contract text
  changed by the record.
- Scanned the modified docs and evidence for tokens, connection strings and
  real PII: none found (`gate.invalid` fixtures are synthetic).

## Not verified (gated by read-only instruction)

- No independent rerun of the harness, tests, build or migrations.
- The pre-existing attribution of the pub/sub race was not proven against
  `a0e3753`; it is a plausible attribution, so it is recorded as an observation
  and a backlog item (`AME-015`), not as a B3-S contract failure.

## Residual risk

- Duplicate SSE refresh frames on a cold server with concurrent staff streams;
  non-stateful, follow-up `AME-015`.
- `AME-013` (real Postgres two-tenant integration harness) remains open; this
  gate is the current staging isolation evidence.
- Evidence retention now lives in the repository; prune only with the run log.

## Routing

**PASS WITH NOTES** → Lead corrected the record (this revision). No product-code
correction is required. Deployment remains a separate explicit human decision;
`main` push, merge, deploy and production seed/migration are unauthorized.
