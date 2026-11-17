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
