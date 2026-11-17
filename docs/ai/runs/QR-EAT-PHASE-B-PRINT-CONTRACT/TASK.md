# Task — QR-EAT-PHASE-B-PRINT-CONTRACT (B1-C)

**Status:** CONTRACT FROZEN at **`39031bb`** — independent review **PASS**;
hash stamped by the follow-up docs commit. B1-S is next and is a separate R3
task.
**Revision:** 1
**Approved revision:** 1
**Approved by:** Atiff (Phase B Q1–Q6, 2026-11-17; freeze authorized in the same instruction)
**Approval date:** 2026-11-17
**Next actor:** human (O-1 freeze confirmation, O-9 push decision), then a
separate B1-S planning/implementation task
**Implementer:** Lead (docs-only under `docs/**`; no product code)
**Verifier:** fresh `ame-verifier` (`ses_e17bef5f0ffe7YoVZjaagqTeFe`); `REVIEW-01.md` **PASS**
**Diff base:** `612cde7` (`main`, clean; `df40e1d` is an ancestor)
**Risk:** R2 — API/auth/print contract, docs-only change
**Workflow:** ARCHITECTURE / FEATURE (contract-first)
**Phases:** B1-C contract freeze (this task, complete) → B1-S server implementation (separate R3 task) → B2 Counter → B3 QR/all orders
**Freeze commit:** **`39031bb`** (content commit; hash stamped by the follow-up
docs commit). No push/deploy.
**Updated:** 2026-11-17

> **Input:** `../Tabtep-App/docs/ai/handoffs/QR-EAT-PHASE-B-PRINT-CONTRACT.md`
> **Parent plan:** `../Tabtep-App/docs/ai/runs/2026-11-17-counter-auto-print-phase-b/TASK.md` (approved 2026-11-17)
> **Normative output:** `docs/PRODUCT/PRINT-ACK-CONTRACT.md`
>
> This task is the **contract freeze** only. It changes no server behaviour. The
> handoff explicitly limits B1-C to `docs/PRODUCT/**` and the QR-Eat run
> directory. Server implementation is a separate, approved R3 task (B1-S) that
> must implement this frozen contract before B2 starts.

## Objective

Freeze an owner-approvable Phase B print contract for the QR-Eat server so the
Tabtep Counter (B2) can implement against written semantics instead of guessing
from source. The contract covers:

- the existing station device print-ack and station SSE envelope, recorded from
  the merged code;
- the new Counter staff-authenticated ticket-payload and print-ack endpoints;
- station `printMode: STATION | COUNTER | NONE`;
- the no-Kitchen-device confirmation rule for `COUNTER` / `NONE`;
- cashier PREPARING/READY/SERVED authority with audit;
- print audit, reprint and no-downgrade rules;
- compatibility, rollback and the B2/B3 boundary.

## Approved decisions (inputs, not re-opened)

| # | Decision | Approved choice |
|---|---|---|
| Q1 | Counter/server print path | **A** — add Counter staff-authenticated ticket-payload and print-ack endpoints; do not provision the Counter as a station device |
| Q2 | First release coverage | **A** — B2 prints Counter-created orders first; B3 adds QR/all orders and the Counter order feed |
| Q3 | Kitchen absent | **A** — `COUNTER` / `NONE` stations require no online Kitchen device; cashier may mark PREPARING/READY/SERVED with audit |
| Q4 | Station print mode | **A** — `printMode: STATION \| COUNTER \| NONE`; existing stations default `STATION`; new onboarding defaults `COUNTER`; Kitchen sends `SKIPPED` when it is not the print authority |
| Q5 | Hygiene and boundaries | **A** — B0 Tabtep hygiene is separate; web/role cleanup is out of B1; Kitchen stays on server device pairing |
| Q6 | Build order | **A** — B0 → B1 → B2 → B3; the B1 contract must be frozen before B2 |

Additional constraints from the owner instruction (2026-11-17):

- Do **not** enable loyalty, set `LOYALTY_PHONE_HMAC_KEY`, run the seed, or
  deploy manually.
- Railway auto-deploys `main` on merge; loyalty flags must remain off.
- Freeze the B1 contract at a named commit and report the commit, tests and
  remaining owner decisions.

## Context budget

**Must read:**

- `AGENTS.md`
- this `TASK.md`
- `../Tabtep-App/docs/ai/handoffs/QR-EAT-PHASE-B-PRINT-CONTRACT.md`
- `../Tabtep-App/docs/ai/runs/2026-11-17-counter-auto-print-phase-b/TASK.md`
- `docs/PRODUCT/PRINT-ACK-CONTRACT.md` (the deliverable)
- `docs/PRODUCT/API-CONTRACT.md` (index and conventions)
- `docs/PRODUCT/RELEASE-COMPATIBILITY.md`
- `docs/PRODUCT/CROSS-REPO-WORKFLOW.md`
- `prisma/schema.prisma` — `Station`, `OrderEvent`, `OrderEventPrintStatus`,
  `Device`, `AuditLog`
- `src/app/api/stations/me/print-ack/route.ts`
- `src/app/api/events/station/route.ts`
- `src/app/api/stations/me/snapshot/route.ts`
- `src/app/api/stations/me/settings/route.ts`
- `src/app/api/stations/route.ts`, `src/app/api/stations/[id]/route.ts`
- `src/app/api/counter/orders/[orderId]/ticket/route.ts`
- `src/app/api/counter/orders/route.ts`,
  `src/app/api/counter/orders/[orderId]/send/route.ts`
- `src/app/api/orders/[id]/status/route.ts`
- `src/app/api/counter/changes/route.ts`
- `src/app/api/counter/stations/health/route.ts`
- `src/lib/order-events.ts`
- `src/lib/order-dispatch-service.ts` (via `src/lib/services/order-dispatch-service.ts`)
- `src/lib/counter/ticket-status.ts`
- `src/lib/counter/access.ts`
- `src/lib/station-settings.ts`
- `src/lib/device-auth.ts`
- `src/lib/counter/constants.ts`
- `prisma/seed.ts` — cashier/kitchen role templates
- `src/lib/rbac/permission-constants.ts`

**Read only if unclear:**

- `src/lib/services/counter-order-service.ts`
- `src/app/api/counter/takeaway/route.ts`
- `src/app/api/cron/cleanup-events/route.ts`
- `src/lib/recall.ts`
- `src/lib/rbac/resource-auth.ts`
- `src/lib/tenant-context.ts`
- `docs/DATA-RETENTION.md`
- `docs/TERMINOLOGY.md`, `GLOSSARY.md`

**Do not read by default:**

- the whole repository or the whole `docs/ai/` tree;
- historical run logs;
- generated Prisma client, `.next/`, `node_modules/`;
- `lint_output*.txt`, `tsc_output.txt`;
- Tabtep application source. Read only the handoff and parent plan named above;
  do not scan `../Tabtep-App` code.

If a required document contradicts this task, stop and report the exact
contradiction. Do not guess.

## Scope

**Allowed:**

- `docs/PRODUCT/PRINT-ACK-CONTRACT.md` (new);
- `docs/PRODUCT/API-CONTRACT.md` (index link only);
- `docs/PRODUCT/RELEASE-COMPATIBILITY.md` (B1-C record);
- `docs/ai/ACTIVE.md`, `docs/ai/BACKLOG.md`;
- this run directory: `TASK.md`, `RUN_LOG.md`, `NEXT.md`, `REVIEW-01.md`.

**Not allowed:**

- `src/**`, `prisma/**`, `scripts/**`;
- migrations, seed, database commands;
- deploy, merge, push, tag, flag change, HMAC key change;
- editing `../Tabtep-App/**`;
- changing `df40e1d` code or history;
- implementing B1-S, B2 or B3 here.

## Deliverables

1. **`docs/PRODUCT/PRINT-ACK-CONTRACT.md`** — frozen Phase B print contract,
   versioned `phase-b-print-v1`, with:
   - verified current server surface (device ack, station SSE, snapshot,
     Counter ticket status, order status, station settings);
   - the target B1-S surface and exact request/response/error semantics;
   - station `printMode` storage, defaults, authority matrix and mid-flight rule;
   - Counter ticket-payload endpoint;
   - Counter print-ack endpoint;
   - ack idempotency, reprint, no-downgrade, retry and duplicate rules;
   - `printStatus` projection, including null → `UNKNOWN`;
   - auto-print semantics and what an ack proves / does not prove;
   - cashier PREPARING/READY/SERVED authority and audit;
   - no-Kitchen-device confirmation rule;
   - compatibility, rollout, rollback, security and retention;
   - field-by-field traceability to code or a marked owner decision;
   - the freeze record and remaining owner decisions.
2. **Contract index update** — one link from `docs/PRODUCT/API-CONTRACT.md`.
3. **Release compatibility update** — record the B1 contract version and freeze
   commit; mark Counter/Kitchen minimum versions as "not yet built against this
   contract".
4. **Run artifacts** — `RUN_LOG.md`, `NEXT.md`, `REVIEW-01.md`, plus
   `ACTIVE.md` and `BACKLOG.md` updates.
5. **A named freeze commit** containing only the allowed docs, reported with its
   hash, the checks run, and the remaining owner decisions. Two-step stamp:
   content commit first, then a hash-only record commit (§14.1 of the contract).

## Acceptance criteria

1. The contract covers every item in the handoff's "Contract to write" list:
   station print acknowledgement, station SSE, `OrderEvent.printStatus`, Phase B
   auto-print semantics, and compatibility/versioning.
2. Every existing field, status and endpoint in the contract is traced to a code
   path (file + symbol) or is explicitly marked `B1-S implementation required`.
3. No invented endpoint, field, event, status or permission appears without an
   explicit status: `existing`, `B1-S target`, or `owner decision`.
4. The 7-day `order_events` retention and the full-resync rule (snapshot after
   `CURSOR_EXPIRED` / long offline) are explicit.
5. Null `printStatus` maps to `UNKNOWN` and is never displayed as `PRINTED`.
6. The station device ack's station binding, optional `seq`, `success` /
   `skipped` precedence, replay and no-downgrade behaviour are explicit.
7. The Counter payload endpoint is read-only, tenant-scoped, staff-authenticated,
   and returns the server-authored payload, not a client-built ticket.
8. The Counter ack is staff-authenticated, tenant-scoped, bound to the event's
   station, authority-checked against `printMode`, audited, and no-downgrade.
9. `printMode` defaults: missing/invalid on existing rows → `STATION`; new
   station onboarding → `COUNTER`; `NONE` is KDS-only. No schema migration is
   required for the JSON representation.
10. `COUNTER` / `NONE` stations require no online Kitchen device; mixed orders
    still require an online device for any `STATION` ticket; manager override
    is unchanged.
11. Cashier PREPARING/READY/SERVED authority is limited, audited, and does not
    grant settings, payment or broader kitchen permissions.
12. Print ack is documented as advisory for order state, not a gate that blocks
    confirmation, payment or service.
13. `git diff df40e1d..HEAD -- src prisma scripts` is empty.
14. `npm run type-check`, `npm test -- --runInBand` and `npm run build` pass (or
    the exact pre-existing failure is recorded and unchanged).
15. No loyalty flag, HMAC key, seed, deploy, push or Tabtep edit occurs.
16. Independent verifier returns PASS or PASS WITH NOTES. **PASS** in
    `REVIEW-01.md`.
17. The freeze commit hash is recorded in this task, the contract and the run
    log; the stamp commit changes only hash fields.

## Verification

```bash
git status --short
git merge-base --is-ancestor df40e1d HEAD
git diff df40e1d..HEAD -- src prisma scripts   # must be empty
npm run type-check
npm test -- --runInBand
npm run build
git diff --check
```

Docs-only checks:

```bash
grep -R "loyalty" docs/PRODUCT/PRINT-ACK-CONTRACT.md  # only boundary statements
grep -R "LOYALTY_ENABLED\|LOYALTY_PHONE_HMAC_KEY" docs/PRODUCT/PRINT-ACK-CONTRACT.md
```

The last grep must return only a statement that loyalty is unaffected and stays
off; no instruction to set either value.

## Review focus

- Does the contract describe the merged code accurately, especially
  `success`/`skipped` precedence, optional `seq`, and `printedAt` preservation?
- Is the station SSE envelope the real one (`id`, `event`, `data`; no
  `orderVersion`) and is retention/resync correct?
- Is print authority unambiguous for `STATION`, `COUNTER` and `NONE`, including
  a print-mode change while a ticket is unacked?
- Can a Counter ack downgrade a printed ticket, cross a tenant, or ack a
  non-printable event?
- Does the no-Kitchen rule accidentally drop the guard for mixed/`STATION`
  orders or for unrouted orders?
- Does cashier status authority leak settings/payment/kitchen permissions?
- Is the B2/B3 boundary explicit enough that B2 can start without a Counter
  order feed?
- Are all open product decisions named rather than silently resolved?

## Commit gate

Docs-only R2 freeze. The owner authorized a named freeze commit on 2026-11-17.
Exact paths:

```text
docs/PRODUCT/PRINT-ACK-CONTRACT.md
docs/PRODUCT/API-CONTRACT.md
docs/PRODUCT/RELEASE-COMPATIBILITY.md
docs/ai/ACTIVE.md
docs/ai/BACKLOG.md
docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/TASK.md
docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/RUN_LOG.md
docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/NEXT.md
docs/ai/runs/QR-EAT-PHASE-B-PRINT-CONTRACT/REVIEW-01.md
```

Commit message:

```text
docs(contract): freeze Phase B print-ack and station print mode
```

No push. No deploy. No tag. No seed. No flag change. The commit is local until
the owner pushes it; Railway only deploys after a push/merge.

## Stop point

Stop after the docs-only contract, independent review, freeze record and local
freeze commit. Do **not** implement B1-S, B2 or B3. Do **not** push, deploy,
enable loyalty or edit Tabtep.
