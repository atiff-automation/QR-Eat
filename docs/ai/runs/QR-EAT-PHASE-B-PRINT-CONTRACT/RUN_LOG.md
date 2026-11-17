# Run Log — QR-EAT-PHASE-B-PRINT-CONTRACT (B1-C)

**Task:** `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md`
**Risk:** R2 · **Workflow:** ARCHITECTURE / FEATURE (contract-first)
**Base:** `612cde7` (`main`, clean; `df40e1d` ancestor)
**Date:** 2026-11-17
**Mode:** docs-only contract freeze. No `src/**`, `prisma/**`, `scripts/**`,
migration, seed, deploy, push, tag, flag or key change.

## Scope

- Record the merged Phase B print surface from code.
- Freeze the Counter ticket-payload and print-ack contract.
- Freeze `Station.settings.printMode` and its authority matrix.
- Freeze the no-Kitchen confirmation rule and cashier status authority.
- Record print audit/no-downgrade, compatibility, rollback and open owner
  decisions.
- Produce a named freeze commit for B2 to consume.

## Inputs

- `../Tabtep-App/docs/ai/handoffs/QR-EAT-PHASE-B-PRINT-CONTRACT.md`
- `../Tabtep-App/docs/ai/runs/2026-11-17-counter-auto-print-phase-b/TASK.md`
  (approved 2026-11-17, Q1–Q6)
- Owner instruction 2026-11-17: freeze B1, keep loyalty off, do not set the
  HMAC key, do not run seed, do not deploy manually.

## Baseline facts

- `git status --short`: clean before edits.
- `git merge-base --is-ancestor df40e1d HEAD`: **true**.
- `git diff df40e1d..HEAD -- src prisma scripts`: **empty**.
- Baseline suite: **118 passed, 1 skipped; 1444 passed, 11 skipped**.

## Code references used

| Area | Reference |
|---|---|
| Device print-ack | `src/app/api/stations/me/print-ack/route.ts` |
| Device auth/binding | `src/lib/device-auth.ts` |
| Station SSE | `src/app/api/events/station/route.ts` |
| Snapshot/full resync | `src/app/api/stations/me/snapshot/route.ts` |
| Station settings | `src/lib/station-settings.ts`, `src/app/api/stations/me/settings/route.ts` |
| Station create/update | `src/app/api/stations/route.ts`, `src/app/api/stations/[id]/route.ts` |
| Counter ticket status | `src/app/api/counter/orders/[orderId]/ticket/route.ts` |
| Ticket aggregate | `src/lib/counter/ticket-status.ts` |
| Event writer/types | `src/lib/order-events.ts` |
| Confirmation guard | `src/lib/services/order-dispatch-service.ts` |
| Order status | `src/app/api/orders/[id]/status/route.ts` |
| Counter order create/send | `src/app/api/counter/orders/route.ts`, `src/app/api/counter/orders/[orderId]/send/route.ts`, `src/lib/services/counter-order-service.ts` |
| Counter change feed | `src/app/api/counter/changes/route.ts` |
| Counter role gate | `src/lib/counter/access.ts` |
| Role templates | `prisma/seed.ts` |
| Permission constants | `src/lib/rbac/permission-constants.ts` |
| Schema | `prisma/schema.prisma` (`Station`, `OrderEvent`, `Device`, `AuditLog`) |
| Retention | `src/app/api/cron/cleanup-events/route.ts`, `cleanupOrderEvents()` |
| Audit IP | `src/lib/client-ip.ts` |

## Decisions

See `docs/PRODUCT/PRINT-ACK-CONTRACT.md` §13:

- Q1–Q6 are the approved inputs.
- C-1…C-12 are technical contract decisions taken in this freeze.
- O-1…O-9 are remaining owner decisions, reported at freeze.

The most consequential choices:

- `printMode` stays in `Station.settings` JSON; missing → `STATION`; new
  onboarding → `COUNTER`.
- New Counter endpoints are `/api/counter/orders/{orderId}/print-tickets` and
  `/api/counter/orders/{orderId}/print-ack`.
- `eventId` is the ack idempotency key.
- `PRINTED` is terminal; `printedAt` is the first successful print.
- `NONE` events are created `SKIPPED`; no Kitchen device is required.
- Cashier authority is limited to Counter-created orders whose routed stations
  are all `COUNTER`/`NONE`.
- Both device and Counter acks write audit rows.
- B2 does not auto-print cancellation chits; B3 owns the Counter order feed.

## Verification

| Check | Command | Result |
|---|---|---|
| Type-check | `npm run type-check` | **PASS** (no output after `tsc --noEmit`) |
| Tests | `npm test -- --runInBand` | **PASS** — 118 suites passed, 1 skipped; 1444 tests passed, 11 skipped |
| Build | `npm run build` | **PASS** — Next.js production build completed |
| Locked code diff | `git diff df40e1d..HEAD -- src prisma scripts` | **empty** |
| Ancestor | `git merge-base --is-ancestor df40e1d HEAD` | **true** |
| Whitespace | `git diff --check` | **clean** |
| Loyalty guard | `grep -n "LOYALTY_ENABLED\\|LOYALTY_PHONE_HMAC_KEY" docs/PRODUCT/PRINT-ACK-CONTRACT.md` | only the “remain unset” boundary statement |
| Tabtep untouched | `git -C ../Tabtep-App diff --stat` | **empty**; the only status entries are pre-existing untracked `docs/proposals/` and `docs/research/`, not written by this session |

## Evidence

- Contract: `docs/PRODUCT/PRINT-ACK-CONTRACT.md` (1222 lines; `phase-b-print-v1`).
- Index pointer: `docs/PRODUCT/API-CONTRACT.md` §19.
- Release record: `docs/PRODUCT/RELEASE-COMPATIBILITY.md` Phase B section.
- Roadmap/backlog: `docs/ai/ACTIVE.md`, `docs/ai/BACKLOG.md` (AME-009, AME-010).
- Independent review: `REVIEW-01.md` (verdict recorded there).

## Freeze commit

- Freeze commit: **`39031bb`** (content commit; hash stamped by the follow-up
  docs commit). Two-step: content commit, then hash record.
- The commit contains docs only; no push, no deploy, no tag.
- The contract file at `HEAD` names the freeze commit; the pre-stamp commit is
  the content freeze and the stamp commit records its hash.

## Residual risk

- B1-S is not implemented. The new endpoints and `printMode` are a written
  target, not live server behaviour. B2 must not start until B1-S is merged.
- O-1…O-9 remain owner decisions. O-2, O-4, O-5 and O-6 affect B1-S/B2; O-3,
  O-7 and O-8 can be decided later; O-9 is the push/deploy decision.
- The existing device ack has no audit today; B1-S adds it. Until then, the
  audit trail is incomplete for Kitchen acks.
- The existing confirmation guard is any-online-device; B1-S narrows it to
  routed `STATION` stations. A mixed order still needs the Kitchen.
- `requireOrderAccess()` may return 403 for some cross-tenant cases (P7-8); the
  frozen contract requires 404. B1-S must wrap/map it to 404 for the two new
  Counter routes; this is no longer an open choice.
- No hardware, LAN printer, or Counter build was tested. That is B2.
- The contract is local until pushed; B2 in another session may not see the
  commit (O-9).

## No-claims

- No test was claimed unless run.
- No server, schema, migration, seed, deploy, flag or HMAC action was taken.
- Loyalty remains off; the loyalty contract and `df40e1d` are untouched.
- No Tabtep file was edited.
