# Task — QR-EAT-B1-S-PRINT-SERVER (B1-S)

**Status:** **MERGED & DEPLOYED** — verifier **PASS WITH NOTES**; all findings
closed; commit `fd014d4`; merge `6d59a56`; Railway deployment
`cb4f7519-2f2a-4b9a-b09c-c4af6553d36f` **SUCCESS**; health **UP**; loyalty/HMAC
unset
**Revision:** 1
**Approved revision:** 1
**Approved by:** Atiff (contract freeze approval + B1-S creation, 2026-11-17)
**Approval date:** 2026-11-17
**Next actor:** B1-W implementer (web `printMode` control), then B2
**Risk:** **R3** — auth-adjacent station/device endpoints, order status, audit, tenant isolation
**Workflow:** FEATURE / ARCHITECTURE (contract implementation)
**Contract:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md`, `phase-b-print-v1`, frozen `39031bb`
**Contract task:** `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md`
**Code base:** `612cde7` (the freeze commits changed docs only; verify at start)
**Workflow position:** B0 closed (Tabtep) → **B1-S (this task)** → B1-W → B2 → B3
**Updated:** 2026-11-17

> This task implements the frozen contract. Do not re-open Q1–Q6 or O-1–O-9.
> If a clause cannot be implemented exactly, stop and report the clause, the
> conflicting code and the proposed deviation. Do not silently reinterpret it.
> Do not edit `../Tabtep-App`.

## Objective

Implement the server side of `phase-b-print-v1`:

- station `printMode: STATION | COUNTER | NONE`, with the frozen defaults;
- server-authored event payloads stamped with the effective print mode;
- Counter staff ticket-payload and print-ack endpoints;
- device print-ack authority, audit, reprint and no-downgrade rules;
- initial `OrderEvent.printStatus` for each mode;
- no-Kitchen-device confirmation for `COUNTER` / `NONE`;
- cashier PREPARING/READY/SERVED authority with audit;
- the `orders:counter_serve` permission with a cashier compatibility fallback;
- tests, type-check, build and contract traceability.

No schema migration, seed run, loyalty change, web UI or client work.

## Approved contract decisions (do not re-open)

All of Q1–Q6 and O-1–O-9 are approved. The implementation follows contract §13:

| Decision | Implementation consequence |
|---|---|
| C-1 `printMode` JSON, missing → `STATION`, new onboarding → `COUNTER` | No migration; normalize on read; write the new default on station create. |
| C-2 stamp mode in printable payloads | A mode change does not move an unacked ticket. |
| C-3 `/print-tickets` + `/print-ack` | New Counter routes; existing ticket-status route unchanged. |
| C-4 `eventId` is the ack key | No separate idempotency table. |
| C-5 `PRINTED` terminal, `printedAt` first print | No downgrade; reprint updates attempt/error/audit only. |
| C-6 ack is advisory | Never block confirmation/payment/READY/SERVED on print state. |
| C-7 `NONE` initial `SKIPPED` | Server sets it at event creation; device skip is audit-only. |
| C-8 cashier scope | `source='COUNTER'` + at least one routed station + all routed `COUNTER`/`NONE`. |
| C-9 permission + fallback | `orders:counter_serve` in constants/seed; cashier role fallback until the row exists. |
| C-10 audit both ack paths | Device and Counter acks write `AuditLog`. |
| C-11 cancellation D-3 | B2 does not auto-print; `COUNTER` cancellation starts `SKIPPED`. |
| C-12 no Counter SSE | No staff stream in this task. |
| C-13 non-authority device skip | Audit-only; never changes `printStatus`/`printedAt`/`printDeviceId`. |

## Scope

### S0 — Baseline and guardrails

- Verify `main` is clean, `df40e1d` is an ancestor, and the frozen contract is
  present at `docs/PRODUCT/PRINT-ACK-CONTRACT.md`.
- Record baseline `npm run type-check`, `npm test -- --runInBand`,
  `npm run build`; confirm the code diff from `612cde7` is empty.
- Read the contract and the code references before editing.
- No DB, seed, deploy or production action.

### S1 — `printMode` storage and station API

- `src/lib/station-settings.ts`: add `PrintMode = 'STATION' | 'COUNTER' |
  'NONE'`; include it in `StationSettings`; normalize missing/null/invalid to
  `STATION`; merge preserves it.
- `src/app/api/stations/route.ts`: `POST` accepts an optional `printMode`;
  a new station writes the normalized settings with `printMode='COUNTER'` by
  default. Do not backfill existing stations.
- `src/app/api/stations/[id]/route.ts`: `PATCH settings.printMode` accepts the
  three values, rejects anything else with 400; `GET` returns the stored object.
- `src/app/api/stations/me/settings/route.ts` and
  `src/app/api/stations/me/snapshot/route.ts`: return `printMode` through the
  normalizer (no shape break beyond the additive field).
- `GET /api/stations` / `GET /api/stations/{id}` keep returning stored settings;
  clients treat a missing key as `STATION`.
- Tests: defaults, invalid value, create default, PATCH merge, device settings,
  snapshot settings.

### S2 — Event payload stamping and initial status

- Extend routing/event creation (`src/lib/order-events.ts`) to resolve each
  grouped station’s effective `printMode` and stamp it into the payload of
  `order.created`, `order.items.added` and `order.cancelled`.
- Initial `printStatus`:
  - `STATION` → `PENDING`;
  - `COUNTER` → `PENDING` for `order.created`/`order.items.added`, `SKIPPED` for
    `order.cancelled` (until B3);
  - `NONE` → `SKIPPED` with `printAttemptedAt=null`, `printError='KDS only — not
    printed'`, `printDeviceId=null`.
- Non-ticket events (`order.status.changed`, `order.item.status.changed`,
  `order.recalled`, `order.recall.cleared`) stay `printStatus=null`.
- `order.items.added` keeps its writer; wiring a producer is **not** required in
  this task unless the existing add-items path already calls it. Do not invent a
  producer. Record the producer gap.
- Tests: payload stamp, each initial status, cancellation, no print mode on
  non-ticket events, idempotent `recordOrderCreated`.

### S3 — Print-ack service, device authority and audit

- Extract the transition/authority logic into a domain module
  (`src/lib/print/print-ack-service.ts` or the closest existing domain module),
  not duplicated in routes.
- Implement the authority matrix and transition matrix exactly:
  - authority 409 `PRINT_AUTHORITY_INVALID`;
  - non-authority device `SKIPPED` is audit-only (C-13);
  - `PRINTED` terminal; `printedAt` first print; no-downgrade 200/no-op;
  - `printDeviceId` last authoritative ack; Counter ack nulls it and audit keeps
    the prior value.
- `src/app/api/stations/me/print-ack/route.ts`:
  - enforce authority;
  - keep optional `seq` and legacy response compatibility;
  - add audit for every event-level ack (`changedBy=device.id`,
    `changedByType='device'`);
  - optional `reprint` support per contract §8.6; if omitted, behave as today.
- `src/lib/print/print-ack-service.ts` must be pure/no-route dependency where
  practical and unit-tested.

### S4 — Counter ticket payload and print-ack

- `GET /api/counter/orders/{orderId}/print-tickets`
  (`src/app/api/counter/orders/[orderId]/print-tickets/route.ts`):
  - `counterAccessDenied`, `orders:read`, `requireOrderAccess`;
  - map cross-tenant 403 from the existing helper to **404**;
  - return the contract §6.2 shape with `printMode`, payload, status, attempts,
    `printedBy`, `canAck`; `UNKNOWN` for null;
  - only printable events; ordered by `eventId`; empty array is 200;
  - read-only.
- `POST /api/counter/orders/{orderId}/print-ack`
  (`src/app/api/counter/orders/[orderId]/print-ack/route.ts`):
  - `counterAccessDenied`, `orders:write`, `requireOrderAccess`, 404 mapping;
  - validate body per §7.2; `eventId` is the idempotency key;
  - authority, transitions, no-downgrade, `reprint`, `downgraded`, `replayed`;
  - audit row in the same transaction (§7.4), including `restaurantId` and
    `printDeviceId` old/new;
  - no payload/PII in audit.
- Tests: auth/role/permission, cross-tenant 404, wrong order/event, authority
  409, skip-after-print 200 no-op, idempotent success, reprint semantics,
  `printedBy`, audit shape, empty list.

### S5 — No-Kitchen confirmation and cashier status

- `src/lib/services/order-dispatch-service.ts`:
  - resolve the order’s routed stations;
  - require an online device on a routed `STATION` station when any ticket is
    `STATION`;
  - skip the guard when every routed station is `COUNTER`/`NONE`;
  - keep the existing any-online-device guard for unrouted orders;
  - keep `offlineDelivered` and manager-only `X-Station-Override` semantics;
  - audit `printAuthority`, routed station ids and `noKitchenDevice`.
- `src/lib/rbac/permission-constants.ts`: add `orders:counter_serve`.
- `prisma/seed.ts`: grant it to `cashier`. **Do not run the seed.**
- `src/app/api/orders/[id]/status/route.ts`:
  - cashier may `PREPARING`/`READY`/`SERVED` only when C-8 holds, using the
    event-stamped modes when events exist, otherwise routing + current settings;
  - keep owner/manager, kitchen, waiter and platform-admin behaviour;
  - keep `CONFIRMED`/`CANCELLED` owner/manager only;
  - keep takeaway `PAID` and `ORDER_RECALLED` guards;
  - audit `restaurantId`, `changedByType`, `category`, `description`, authority
    marker and role template; no PII;
  - fallback: `roleTemplate === 'cashier'` until the seeded permission exists.
- Tests: no-Kitchen skip, mixed order still blocked, unrouted unchanged, manager
  override, cashier allowed on C-8, denied on `STATION`, denied on non-Counter
  source, denied `CONFIRMED`/`CANCELLED`, audit fields, permission mapping.

### S6 — Verification, compatibility and close-out

- Run the full verification.
- Update `docs/PRODUCT/RELEASE-COMPATIBILITY.md` with the B1-S server record.
- Update `docs/PRODUCT/API-CONTRACT.md` only if a path/field must be added to
  the index; do not amend the frozen contract text.
- Write `RUN_LOG.md`, `NEXT.md`, and the review file. Record any deviation and
  the contract clause.
- If a change to the frozen contract is required: **stop**, do not edit the
  contract, and return for owner approval.

## File ownership (expected)

```text
src/lib/station-settings.ts
src/app/api/stations/route.ts
src/app/api/stations/[id]/route.ts
src/app/api/stations/me/settings/route.ts
src/app/api/stations/me/snapshot/route.ts
src/lib/order-events.ts
src/lib/print/print-ack-service.ts                  (new)
src/app/api/stations/me/print-ack/route.ts
src/app/api/counter/orders/[orderId]/print-tickets/route.ts (new)
src/app/api/counter/orders/[orderId]/print-ack/route.ts     (new)
src/lib/services/order-dispatch-service.ts
src/lib/rbac/permission-constants.ts
src/app/api/orders/[id]/status/route.ts
prisma/seed.ts                                      (mapping only; not run)
src/lib/print/__tests__/**                          (new)
src/tests/**                                        (affected tests)
docs/PRODUCT/RELEASE-COMPATIBILITY.md
docs/ai/runs/QR-EAT-B1-S-PRINT-SERVER/**
```

Sensitive paths under `AGENTS.md`: station/device routes, order status, RBAC
permission constants, audit. **This task is the owner’s explicit approval to
touch those paths for B1-S.** Do not change `src/lib/auth.ts`,
`src/lib/auth-utils.ts`, `src/lib/device-auth.ts` or `src/lib/rbac/` beyond the
permission constant and, only if strictly necessary, a scoped helper. If auth
semantics must change, stop.

## Not in scope

- B1-W web UI, B2 Counter, B3 QR/all orders/feed.
- Any schema migration or new dependency.
- Running the seed, enabling loyalty, setting `LOYALTY_PHONE_HMAC_KEY`,
  deploying, pushing or tagging.
- Printer IP/credential storage or LAN transport (Counter is client-side).
- A Counter order SSE.
- Changing `order_events` retention or the existing `/ticket` status route shape.
- Web/role cleanup.

## Acceptance criteria

1. `printMode` normalizes missing/invalid to `STATION`; new stations write
   `COUNTER`; existing rows are not backfilled; PATCH rejects invalid values.
2. Printable event payloads carry the effective `printMode`; a later station
   change does not move an existing stamped ticket.
3. Initial statuses match §5.1: `NONE` → `SKIPPED`, `COUNTER` cancellation →
   `SKIPPED`, `STATION`/`COUNTER` order/add-on → `PENDING`, non-tickets → null.
4. Device ack enforces authority, writes audit, preserves `printedAt`, never
   downgrades `PRINTED`, and treats a non-authority skip as audit-only.
5. Counter `/print-tickets` returns the contract shape, tenant-scoped, 404 on
   cross-tenant, `UNKNOWN` for null, read-only, empty list 200.
6. Counter `/print-ack` validates, enforces authority, is idempotent by
   `eventId`, returns `downgraded`/`replayed`/`reprint`, writes audit in the
   same transaction, never leaks payload/PII.
7. `COUNTER`/`NONE` orders confirm without a Kitchen device; mixed orders still
   require a routed `STATION` device; unrouted orders keep the existing guard;
   manager override and offline delivery are unchanged.
8. Cashier PREPARING/READY/SERVED is allowed only under C-8, audited, and does
   not grant `CONFIRMED`, `CANCELLED`, settings, payment or kitchen authority.
9. `orders:counter_serve` exists in constants and the cashier seed mapping; the
   route works before the seed row exists via the role-template fallback.
10. No print ack blocks confirmation, payment, READY or SERVED.
11. `npm run type-check`, `npm test -- --runInBand`, `npm run build` pass.
12. No schema migration, seed run, loyalty flag/key change, deploy, push or
    Tabtep edit occurs.
13. Independent verifier PASS or PASS WITH NOTES; findings closed or recorded.
14. Contract clauses are traced in the run log; deviations stop the task.

## Verification

```bash
git status --short
git merge-base --is-ancestor df40e1d HEAD
git diff <task-base>..HEAD --stat
npm run type-check
npx jest src/lib/print src/app/api/counter/orders src/app/api/stations src/tests/order-dispatch-service.test.ts src/tests/ticket-status.test.ts
npm test -- --runInBand
npm run build
git diff --check
```

No DB command is required. If a test needs a database, use the existing mocked
patterns; do not run migrations or seed.

## Review focus

- Authority matrix and non-authority `SKIPPED`; can a Kitchen skip hide a
  `COUNTER` ticket from B2?
- Can a Counter ack downgrade `PRINTED`, cross a tenant, ack the wrong order or
  a non-printable event?
- Is `eventId` truly idempotent under concurrent/retried acks?
- Is the no-Kitchen rule exact for mixed and unrouted orders?
- Does cashier authority leak any broader permission or bypass the takeaway/
  recall guards?
- Is audit tenant-scoped, PII-free and in the same transaction as the event
  update?
- Does the implementation preserve legacy device clients that omit `seq`?
- No schema/seed/deploy/loyalty side effect.

## Context budget

**Must read:**

- `AGENTS.md`, `docs/ai/PROJECT_PROFILE.md`
- `docs/PRODUCT/PRINT-ACK-CONTRACT.md` (all of it)
- `docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md` and `REVIEW-01.md`
- the code references in contract §15.1
- the files named in the S1–S5 scope
- `docs/WEB-UI-STANDARD.md` only for vocabulary/standard references; B1-W owns UI

**Read only if unclear:**

- `src/lib/services/counter-order-service.ts`
- `src/app/api/counter/orders/route.ts`,
  `src/app/api/counter/orders/[orderId]/send/route.ts`
- `src/lib/counter/access.ts`, `src/lib/counter/ticket-status.ts`
- `src/lib/rbac/resource-auth.ts`, `src/lib/tenant-context.ts`
- `src/lib/client-ip.ts`
- existing test patterns for route mocks

**Do not read by default:**

- the whole repository or whole `docs/ai/` tree;
- historical run logs;
- `../Tabtep-App` source (contract and handoff only);
- generated Prisma client, `.next/`, `node_modules/`, lint/tsc output.

## Commit gate

R3 commit requires: exact path list, diff hash, verification evidence,
independent review verdict, and explicit human commit authorization. The
implementer does not commit. Do not push. Do not deploy. Do not run seed.

## Stop point

Stop after implementation + review + close-out, or at the first contract
conflict. Do not start B1-W, B2 or B3.
