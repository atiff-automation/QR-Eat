# Review 01 — QR-EAT-PHASE-B-PRINT-CONTRACT (B1-C)

**Task:** `QR-EAT-PHASE-B-PRINT-CONTRACT` revision 1 (docs-only contract freeze)
**Verifier:** `ame-verifier`, session `ses_e17bef5f0ffe7YoVZjaagqTeFe`
**Date:** 2026-11-17
**Risk:** R2
**Base:** `612cde7` (`main`; `df40e1d` ancestor confirmed)
**Verdict:** **PASS** (initial **PASS WITH NOTES**; one High-severity semantic
finding in the delta cycle, corrected; final micro-delta **PASS**)

## What was reviewed

- `docs/PRODUCT/PRINT-ACK-CONTRACT.md` (`phase-b-print-v1`);
- `docs/PRODUCT/API-CONTRACT.md` §19 pointer;
- `docs/PRODUCT/RELEASE-COMPATIBILITY.md` Phase B record;
- `docs/ai/ACTIVE.md`, `docs/ai/BACKLOG.md` (AME-009/AME-010);
- `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/{TASK.md,RUN_LOG.md,NEXT.md}`.

Read-only against the merged code: device print-ack, station SSE, snapshot,
station settings/CRUD, Counter ticket status, ticket aggregate, order status,
`confirmPendingOrder()`, event writer/types, Counter order create/send/changes/
health, schema, seed role templates, permission constants, `counterAccessDenied`,
`resource-auth`, `client-ip`, and the ticket-status tests.

## Findings

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| R-01 | Medium | Counter `skipped` on an already-printed ticket was ambiguous (409 vs 200 no-op). | **Closed** — skip never downgrades; 200 `NO_DOWNGRADE` audit row; no invented 409. |
| R-02 | Medium | `order.items.added` was asserted as produced today; the writer has no caller on `main`. | **Closed** — marked writer-without-producer in §2.2/§6.3/§8.4; B1-S/B3 must wire it. |
| R-03 | Medium | `SKIPPED → PRINTED` said “mode changes” could revive a ticket, which stamping makes impossible. | **Closed** — limited to stamped `COUNTER`/`STATION`; stamped `NONE` is permanent in v1. |
| R-04 | Low | `downgraded` response field was described for both ack paths but only Counter defines it. | **Closed** — Counter-only; device keeps its response shape and audit-only outcome. |
| R-05 | Low | Audit `oldValues` did not preserve the prior `printDeviceId` when a Counter ack nulls it. | **Closed** — `printDeviceId` added to old/new audit values. |
| R-06 | Low | `printedBy` ambiguous after a reprint. | **Closed** — last authoritative ack source; `printedAt` remains first print. |
| R-07 | Low | Device ack tenant wording implied an explicit restaurant check. | **Closed** — tenant derived via `Device.stationId → Station.restaurantId`; B1-S adds defence in depth. |
| R-08 | Low | Claimed audit retention cleanup exists; only a helper with no scheduled caller exists. | **Closed** — “no scheduled audit cleanup today”; O-5 covers it. |
| R-09 | Low | Status authority table omitted the unconditional platform-admin branch. | **Closed** — admin noted as allowed unconditionally. |
| R-10 | Low | Cashier status audit example lacked `restaurantId`. | **Closed** — added. |
| R-11 | Low | Target says cross-tenant 404, but `requireOrderAccess()` throws 403 for this case. | **Closed** — B1-S must wrap/map to 404 on the two new routes. |
| R-12 | Low | `restaurant:settings` was described as owner/manager; seeded manager lacks it. | **Closed** — owner-only on seeded templates; manager needs a custom grant. |
| R-13 | Low | Kitchen “current release” compatibility overstated. | **Closed** — verified only for unchanged SSE/ack shape; B1-S authority 409 needs a Kitchen check. |
| R-14 | Low | Rollout omitted the B0 gate. | **Closed** — B0 must close before B2. |
| R-15 | Low | A `COUNTER` cancellation chit would be created `PENDING` but never auto-printed, showing a phantom “Printing”. | **Closed** — created `SKIPPED` until O-3; manual print still allowed. |
| R-16 | Note | `FROZEN` placeholder before any commit. | **Closed** — explicit two-step stamp (content commit, then hash record). |
| R-17 | Note | Device JWT wording implied token-carried restaurant/station. | **Closed** — token identifies `deviceId`/`tokenVersion`; live row carries the rest. |
| R-18 | Note | Heartbeat implied always every 15s. | **Closed** — idle-only ping. |
| R-19 | Note | `kitchen:write` unseeded. | **Closed** — called out as a custom grant. |
| N-01 | **High** | A Kitchen `SKIPPED` on a `COUNTER` ticket could change it to `SKIPPED` before B2 polled, hiding it from the `PENDING|FAILED` queue — a silent no-print. | **Closed** — C-13: a non-authority device skip is audit-only and must not change `printStatus`/`printedAt`/`printDeviceId`; B2’s filter now cannot lose the ticket. |
| N-02 | Low | Run log said B1-S “must decide” 403 vs 404 after the contract mandated 404. | **Closed** — contract mandates the mapping. |
| N-03 | Low | Run-log line count stale. | **Closed** — 1222 lines after the stamp, matches `wc -l`. |
| N-04 | Note | Release summary and minimum-version row read as a tension. | **Closed** — both qualify the unchanged shape vs B1-S enforcement. |
| N-05 | Note | `TASK.md`/`NEXT.md` still described a single commit / pending review. | **Deferred by design** — updated in the freeze/stamp close-out. |
| N-06 | Note | The hash-stamp commit would change the file after freeze. | **Closed** — stamp may fill only hash fields; normative text is frozen. |
| L-1 | Low | “Leave it `PENDING`” could be misread as “set `PENDING`”, risking a `PRINTED` downgrade. | **Closed** — “leave `printStatus` unchanged”, with PENDING/FAILED/PRINTED examples. |
| L-2 | Low | “`SKIPPED` means the Counter chose no paper” ignored server-policy cancellation chits. | **Closed** — qualified to order/add-on tickets created PENDING. |
| N-07 | Note | `NONE` row read as two alternative status sources. | **Closed** — server creates `SKIPPED`; device skip is audit-only. |
| N-08 | Note | `printDeviceId` “last ack” ignored audit-only skips. | **Closed** — last authoritative ack that changed the ticket. |

No Blocker or High finding remains. The only High finding (N-01) was corrected
and re-verified.

## Verified

- **Device ack:** auth/binding, optional positive `seq` = `OrderEvent.id`,
  strict-`true` `success`, `skipped` suppressed by `success`, 500-char error,
  `PRINTED`/`FAILED`/`SKIPPED` transitions, `printedAt = existing ?? now`,
  no-downgrade, `lastPrintAt` on success only, response shape, no current audit.
- **SSE:** device auth, 5s re-check, `?since`/`Last-Event-ID`/`device.lastEventId`,
  non-negative safe-int 400, 7-day cutoff → 410 `CURSOR_EXPIRED` + snapshot,
  `retry: 3000`, `id`/`event`/`data` with no `orderVersion`, ascending id, batch
  100, restaurant+station filter, poll-based at-least-once, best-effort cursor,
  60s presence, idle ping.
- **Snapshot/settings/CRUD:** `RepeatableRead`, cursor+open orders, `lastEventId`
  update, normalized settings, POST does not accept settings, PATCH merges four
  keys, device settings/snapshot carry normalization.
- **Counter ticket status:** staff gate, `orders:read`, `requireOrderAccess`,
  status-only fields, `printStatus ?? 'UNKNOWN'`, aggregate from
  `order.created`+`order.items.added` only, ascending event id.
- **Aggregate matrix:** all seven rows match `aggregateTicketStatus()` and
  `src/tests/ticket-status.test.ts`.
- **Order status:** transition→authority table, takeaway `PAID`, `ORDER_RECALLED`,
  optimistic claim, audit, NOTIFY, table/restaurant change, 90s any-online-device
  guard, `offlineDelivered`/manager override, no `printMode` today.
- **Counter entry/send/changes/health:** `orders:write` + `Idempotency-Key`,
  `source='COUNTER'`, confirm unless `sendToKitchen:false`, cashier-retries-own/
  owner-any, `RestaurantChange` cache feed, `lastPrintAt`/`printerStatus`.
- **Schema/roles:** enum, nullable status, print columns, BigInt id, `Device`,
  `Station.settings`, `AuditLog`; `counterAccessDenied` roles; cashier lacks
  kitchen/fulfill/settings; `orders:counter_serve` correctly target-only.
- **Spec coverage:** every handoff “Contract to write” item; Q1–Q6; B1/B2/B3
  split; 7-day retention + full resync; null → `UNKNOWN`.
- **Docs-only:** `git diff df40e1d..HEAD -- src prisma scripts` empty;
  `git status --short` only allowed docs; `git diff --check` clean; Tabtep
  `diff --stat` empty; no loyalty/HMAC/seed/deploy instruction.

## Commands run by the verifier

```text
git log --oneline -5                 # HEAD 612cde7
git merge-base --is-ancestor df40e1d HEAD   # true
git diff df40e1d..HEAD -- src prisma scripts | wc -l   # 0
git status --short
git diff --check                     # clean
git -C ../Tabtep-App diff --stat     # empty
git diff -- docs | sha256sum         # initial 715b6303…; final see stamp
grep -n "LOYALTY_ENABLED\|LOYALTY_PHONE_HMAC_KEY" docs/PRODUCT/PRINT-ACK-CONTRACT.md
grep -rn recordOrderItemsAdded src prisma scripts   # definition only
grep -rn cleanupOldLogs src scripts                 # helper + test caller only
grep -n restaurant:settings prisma/seed.ts          # owner template only
npm run type-check                   # PASS (verifier re-ran once)
```

## Not verified

- `npm test -- --runInBand` (Lead ran: 118 suites passed, 1 skipped; 1444 tests
  passed, 11 skipped) — verifier did not re-run.
- `npm run build` (Lead ran: PASS) — verifier did not re-run.
- No DB, migration, seed, deploy, cron or production action.
- No Counter/Kitchen build, LAN printer or hardware behaviour; B1-S/B2 own that.
- No push/tag; the freeze commit is local by design (O-9).

## Residual risk

- B1-S is not implemented. Every new endpoint, `printMode`, authority 409,
  audit row, `NONE → SKIPPED`, no-Kitchen rule and cashier permission is a
  written target only. B2 must not start until B1-S is merged and B0 is closed.
- `printMode` in JSON is migration-free but unvalidated at the DB layer; a direct
  writer can store an unknown value (normalized to `STATION` on read).
- Device-ack audit will grow `audit_logs`; no scheduled audit cleanup exists
  today. O-5 must decide scheduling/retention.
- `requireOrderAccess()` currently returns 403 for the cross-tenant case; B1-S
  must map it to 404 for the two new routes.
- The contract is local until O-9 is decided; another session cannot use the
  freeze commit until it is pushed.
- Same-model verification can share blind spots; this review was read-only
  against live code and the diff.

## Recommendation

**PASS — proceed to the docs-only content freeze commit, then stamp the hash.**
Do not implement B1-S, B2 or B3 in this task. Do not push, deploy, tag, seed or
change flags without the owner.
