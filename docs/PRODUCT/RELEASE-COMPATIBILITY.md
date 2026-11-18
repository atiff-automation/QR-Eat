# Release Compatibility — Tabtep

**Status:** loyalty addendum recorded · frozen 2026-11-16 · merged and tagged 2026-11-17 · deployed 2026-11-17 with loyalty flags off  
**Owner:** QR-Eat

Use this file to record which server version is compatible with which Counter and
Station versions. Do not infer compatibility from dates alone.

## Current release record

Fill from the actual deployed tags/build files. Do not copy stale values from
older docs.

| Surface | Version | Commit/tag | Notes |
|---|---|---|---|
| Server (QR-Eat) | `main` | **`phase-loyalty-promo-v1`** (frozen `df40e1d`) | Loyalty surface implemented and merged into `main` with a merge commit on 2026-11-17; tagged, pushed and **deployed 2026-11-17**; both switches off and `LOYALTY_PHONE_HMAC_KEY` unset, so the surface is inert; pilot pending |
| API contract | v1 + §18.20 loyalty addendum | `docs/PRODUCT/API-CONTRACT.md` | Additive; no path-version bump |
| Counter | not yet built against this addendum | — | Must implement `docs/PRODUCT/COUNTER-HANDOFF-LOYALTY.md` |
| Kitchen/Station | unchanged | — | No loyalty surface; no Station route or contract was touched on this branch (verified: no diff under `src/app/api/stations`) |

## Compatibility rules

- Server changes must be additive/backward-compatible within the current API
  version.
- Breaking changes require a new path version and a client migration plan.
- Clients must tolerate additive fields.
- Clients must not depend on undocumented fields or ordering.
- Every mutating request must be idempotent.
- Event consumers must resync on gaps, not guess.
- Payment and order semantics are server-authoritative.

## Release order

1. Backend contract change and server tests.
2. Deploy backend in a backward-compatible form.
3. Verify server in staging.
4. Release client update.
5. Verify integrated behavior.
6. Remove old server compatibility only after all supported clients are updated.

## Rollback

- Server: previous deployment/tag; database migration must have a rollback or
  forward-fix plan.
- Counter/Station: previous signed APK; do not break the station credential or
  local cache format without a migration.
- Record the rollback decision in the run log.

## Minimum supported versions

| Client | Minimum supported | Reason |
|---|---|---|
| Counter | not yet released against the loyalty addendum | The addendum is new; no Counter build implements it |
| Kitchen/Station | current release | No Station endpoint or contract changed; unaffected by the addendum |

## Verification

- Server: type-check, tests, build.
- Counter: unit tests, lint, debug build, device smoke.
- Station: unit tests, lint, debug build, device smoke, print/SSE checks.
- Cross-repo: one end-to-end order/payment/print path where relevant.

## Loyalty addendum record (2026-11-14; frozen 2026-11-16)

| Fact | Value |
|---|---|
| Normative source | Tabtep `§18.20`, v1.4.3, task revision 14 |
| Server frozen | `df40e1d` (last commit that changed server behaviour, stamped 2026-11-16) |
| Freeze gate | REVIEW-29 **FAIL** → REVIEW-30 **PASS WITH NOTES**; P11 human payment/migration pass **PASS** (2026-11-16) |
| Activation | `LOYALTY_ENABLED` (literal `true`) **and** `LoyaltySettings.enabled`; `LOYALTY_PHONE_HMAC_KEY` required |
| Default state | Both switches off; behaviour identical to the pre-loyalty server except `PaymentBatch.outcome = 'GUEST'` (P9-09) |
| Client-visible changes | Z `grossSales` is now pre-tax (P8-1); `outcome` appears on new batches; stored payment replay omits name/phone (P10-3) |
| Platform fact | Railway sets `X-Real-IP` to the client and prepends the client to `X-Forwarded-For`; the last XFF entry is an internal hop (P9-10) |
| Unsigned | P8-6: `net` includes tax and service; the P&L is not statutory until an accountant signs |
| Merge and tag | Merged into `main` on 2026-11-17 with a merge commit (`merge: loyalty promo v1`); no squash or rebase; `df40e1d` remains an ancestor |
| Deployment | **Deployed 2026-11-17** from `main` to Railway production (`SUCCESS`, health UP, migrations applied by the start command). `LOYALTY_ENABLED` and `LOYALTY_PHONE_HMAC_KEY` are unset; the pilot remains a separate owner gate |
| Credentials | The credential exposed in Git history is not rotated; rotation is a pre-production gate before real users |
| Verification | P9 drills 45/45 upgrade, 47/47 concurrency, 31/31 permissions; P11 four-lens review PASS WITH NOTES; human payment/migration pass PASS; post-merge tests 1444 passed / 11 skipped, type-check and build green |

### Compatibility rules for this addendum

- The loyalty surface is additive. A Counter build that ignores it keeps
  working, except for the `grossSales` meaning change above.
- The Counter must tolerate the new bill and payment fields and must not
  recompute totals, rewards or rounding.
- Enabling loyalty for a restaurant is a server-side action; the client needs no
  flag.
- Rolling back is unsetting `LOYALTY_ENABLED`; no client change is required.

## Phase B print contract record (B1-C, 2026-11-17)

| Fact | Value |
|---|---|
| Contract | `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1` |
| Status | **Frozen and owner-approved (O-1–O-9)**; B1-C changed no server behaviour |
| Freeze commit | **`39031bb`** (content commit; recorded by the follow-up docs commit) |
| Push/deploy | Pushed `origin/main` at `7bca846`; Railway auto-deploy `735145f3-b3d9-49c2-a811-bb67245dafc1` **SUCCESS**; health **200 UP**, database **CONNECTED**; docs-only, no manual deploy |
| Base | `612cde7` (clean `main`; `df40e1d` ancestor) |
| Server | B1-S is approved (`docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md`); not built by B1-C |
| Web | B1-W is approved (`docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md`) and waits for B1-S |
| Counter (B2) | **Not yet built against this contract**; B2 starts only after B1-S and B1-W |
| Kitchen/Station | Compatible with the unchanged SSE/ack shape; B1-S print-authority enforcement and device-ack audit are not yet Kitchen-checked |
| Schema | None; `Station.settings.printMode` is JSON and additive |
| Activation | `printMode` is the switch; no new environment flag |
| Rollback | Set the station `printMode` to `STATION` and stop Counter auto-print |
| Loyalty | Unchanged; flags stay off, HMAC key unset |

Minimum supported versions:

| Client | Minimum supported | Reason |
|---|---|---|
| Counter | not yet released against `phase-b-print-v1` | B2 has not started |
| Kitchen/Station | current release verified only for the unchanged SSE/ack shape; **not yet checked against B1-S authority enforcement** | SSE and frame shape unchanged; old station builds that omit `seq` keep working, but a build that sends `success:true` on a `COUNTER`/`NONE` station receives `409 PRINT_AUTHORITY_INVALID`. B1-S must run a Kitchen check before B2. |
| Server | B1-S required for the new Counter endpoints and `printMode` | B1-C is docs-only |
| Web | B1-W required for the owner `printMode` control | Approved, blocked by B1-S API |

## B1-S print server record (2026-11-17)

| Fact | Value |
|---|---|
| Contract | `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1` (frozen `39031bb`) |
| Task | `docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/TASK.md` revision 1 |
| Status | **MERGED & DEPLOYED** — verifier PASS WITH NOTES; all findings closed; commit `fd014d4`; merge `6d59a56` |
| Branch | `feat/b1-s-print-server`, based on `main` `58b64d9` (code base `612cde7`) |
| Diff hash | tracked product `84ce705de553556e1373e37edfc9d04bae9fc26adabb8325ce8e7a9b4a426e4b`; product+new `0578ac6a9f3c621e09170938db33b9da7523cd4b61e50b1dfcbc1bb37672e683`; full tracked `62fb8da15841a4cfab493ba6e3c0bf212aa1d8664bfe4d60cd2bc52e995c2ec2` |
| Server surface | `printMode`, stamped event payloads, device-ack authority/audit, Counter `print-tickets`/`print-ack`, no-Kitchen confirm, cashier C-8 status, `orders:counter_serve` |
| Schema | None; `Station.settings.printMode` is JSON and additive |
| Seed | `orders:counter_serve` mapping added; **seed not run** |
| Activation | `printMode` is the switch; no new environment flag |
| Rollback | Set the station `printMode` to `STATION` and stop Counter auto-print |
| Loyalty | Unchanged; flags stay off, HMAC key unset |
| Verification | type-check PASS; targeted 11 suites/114 tests; full 128 suites/1553 passed, 11 skipped; build PASS |
| Deviation | Contract internal conflict R-04: §7.2 `INVALID_ACK` vs §7.5 `VALIDATION_FAILED` for `success:true`+`skipped:true`; implemented §7.2. Contract text unchanged. |
| Deployment | Railway auto-deploy `cb4f7519-2f2a-4b9a-b09c-c4af6553d36f` from `6d59a56` **SUCCESS**; health **200 UP**, database **CONNECTED**; `LOYALTY_ENABLED` and `LOYALTY_PHONE_HMAC_KEY` **UNSET**; no manual deploy |

Compatibility note:

- Counter is not yet built against these endpoints; B2 starts after B1-S and
  B1-W merge.
- Kitchen/Station current SSE/ack shape is unchanged; the new `COUNTER`/`NONE`
  authority 409 is a behavioural change and needs a Kitchen check before B2.
- Existing station builds that omit `seq` keep working; their ack remains
  advisory (device `lastPrintAt` only).

## B1-W web print-mode control record (2026-11-17)

| Fact | Value |
|---|---|
| Task | `docs/ai/runs/QR-EAT-B1-W-PRINT-MODE-WEB/TASK.md` revision 1 |
| Contract | `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1` |
| Status | **MERGED & DEPLOYED** — verifier PASS WITH NOTES; commit `c78f773`; merge `d63bdbc` |
| Base | `main` `f63096c`; B1-S code `6d59a56` |
| Surface | `/dashboard/stations` per-station `printMode` control + `COUNTER` create default + guidance/setup reminder |
| Scope | No server route, auth/RBAC, schema, seed, dependency or B2 change |
| Evidence | `REVIEW-01.md`; desktop/mobile card screenshots; forced-400 revert screenshot |
| Rollback | The control is additive; no data migration. Existing stations read as `STATION`, new as `COUNTER`. |
| Deployment | Railway auto-deploy `c4d79c4b-5414-4413-b904-af1219a42f58` from `d63bdbc` **SUCCESS**; health **200 UP**, database **CONNECTED**; `LOYALTY_ENABLED` and `LOYALTY_PHONE_HMAC_KEY` **UNSET**; no manual deploy |

## B3-S Counter feed server record (2026-11-18)

| Fact | Value |
|---|---|
| Contract | `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`, `phase-b-counter-feed-v1` (additive to frozen `phase-b-print-v1`) |
| Task | `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/TASK.md` revision 1 |
| Status | **FROZEN** `phase-b-counter-feed-v1` at `4bf9d38` (content commit); verifier PASS; not pushed/deployed/merged |
| Branch | `feat/b3-s-counter-feed`, base `a0e3753` |
| Freeze | Contract `docs/PRODUCT/COUNTER-FEED-CONTRACT.md`; content commit `4bf9d385959b7f83a2dea6fd9cb3fd0abd11f141` (2026-11-18); stamp recorded in this docs commit |
| Server surface | `POST /api/orders/{orderId}/items`; durable `DELETE /api/orders/{id}` cancellation; `PATCH /status` CANCELLED → 409 `USE_CANCEL_ENDPOINT`; additive staff SSE `order_items_added`/`order_cancelled`; in-transaction order change rows; `counterAutoPrint` |
| Schema | Additive `order_mutation_idempotency`; two additive migrations |
| Permissions | Migration idempotently seeds `orders:counter_serve` and the cashier mapping; seed unchanged; cashier route fallback retained for one release |
| Compatibility | B2 `phase-b-print-v1` text, ticket fields, ack matrix and `COUNTER` cancellation `SKIPPED` unchanged. `counterAutoPrint` is additive. The only behavioural break is the deliberate legacy status-cancel 409. |
| Audit | Durable in-transaction `audit_logs` row; the RBAC `SECURITY_EVENT` remains a best-effort post-commit signal, restored after review. |
| Verification | Verifier **PASS** (`REVIEW-02.md`; `REVIEW-01.md` was PASS WITH NOTES, all findings closed); type-check PASS; full tests **136 suites / 1644 passed, 11 skipped**; build PASS; lint 61/11 (baseline 62/11); `prisma migrate deploy` PASS on disposable Postgres 16, second deploy no-op, permission SQL applied twice left one permission and one cashier mapping; `migrate diff` no difference |
| Diff binding | Reviewed diff: full tracked `3b25135d…`, product `94a6c404…`, product+new `e419e8f0…`. Post-review docs-only delta N-01/N-02/N-03 confirmed by the verifier; code, schema, migrations and tests unchanged. Final commit hash is recorded in the freeze stamp. |
| Migration rollback | Both migrations are additive. Dropping the table loses retry receipts; deleting the two seeded rows loses the new permission mapping. No destructive down migration is required. |
| Deployment | **Not deployed.** Requires explicit human authorization after freeze, commit and the two-tenant staging gate. |
| Loyalty | Unchanged; flags stay off, HMAC key unset |
| B3-C gate | Counter work does not start until the freeze stamp/hash is recorded in this file and `B3-C-HANDOFF.md` |

Compatibility note:

- Counter builds that do not call add-items are unaffected.
- A Counter/web client that still calls `PATCH /status` with `CANCELLED` now gets
  409 and must switch to `DELETE`; the active QR-Eat and Tabtep clients were
  re-checked and already use `DELETE`.
- The two-tenant manual staging gate is still required before deployment.
