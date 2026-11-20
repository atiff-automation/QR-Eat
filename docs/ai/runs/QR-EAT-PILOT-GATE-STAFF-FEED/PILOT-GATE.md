# Pilot Gate — Staff Feed Reliability

**Scope:** the staff realtime feed (Counter/Kitchen screens) and the tenant
boundary of the order API.
**Repositories:** QR-Eat (`main` `5dc8c8d`, live deployment
`ddf8e3a7-87cb-4bdb-8060-8f74e627fb2d` at `5dc8c8d`), contract consumed by
`../Tabtep-App`.
**Decision requested:** GO / GO WITH CONDITIONS / HOLD.
**Prepared:** 2026-11-21
**Prepared by:** Lead (AME), from deployed evidence.

---

## 1. Why this gate exists

Between 2026-11-19 and 2026-11-21 the staff feed went from "works most of the
time" to "verified, deployed, and guarded in CI". This record states exactly what
was proven, how, what was not proven, and what the operator must watch during the
first pilot sessions. It is the gate B3-C (Android Counter) was waiting for.

## 2. What changed and what proves it

| Item | Change | Production evidence | CI evidence |
|---|---|---|---|
| AME-015 | Duplicate SSE refresh frames on concurrent first connections | Deployed `4657048f` at `19cb485`. Duplicate count is **not** measurable in production (no staff accounts); local two-tenant harness measured **2 → 0**, reproduced by the verifier | Merged before `AME-019`; CI was red for the unrelated VAPID Build defect. Local + verifier evidence only |
| AME-016 | Reconnect dropped per-connection handlers; streams went silent after a DB blip | Deployed `8d457eb7` at `d6fc6ba`. Module-level real-PostgreSQL probe: LISTEN backend terminated, reconnect in ~5 s, listener received **1** frame post-fix and **0** pre-fix; self-triggered reconnect chaining observed pre-fix | Same as above (pre-`AME-019`); reproduced by verifier |
| AME-018 | NOTIFY client publication race during teardown | Shipped with AME-016 (S4) | Included in AME-016 verification |
| AME-019 | CI Build required a runtime secret; every run red | Deployed `589bd7a3`; health UP | Branch `44644311211` green; `main` `44647023835` green — first green `main` run in the period |
| AME-013 | No real-database tenant isolation test existed | Deployed `76a24002` | Run `44685856443` green; the `integration` job runs on **every push** (postgres:16, 20 assertions) |
| AME-020 | Cross-tenant vs missing orders distinguishable (403 vs 404); anonymous SSE 500 | Deployed `8f775ad3`; 16 order-id routes swept; production `401` confirmed on SSE | Run `44748587813` green |
| AME-023 | Anonymous order reads returned 500; `modify` returned 500 for both refusals | Deployed `636888ff`; production `GET /api/orders/{uuid}` now **401** `AUTHENTICATION_REQUIRED` (was 500) | Run `44797626219` green |
| AME-007 | Old T1–T7 isolation backlog item | Audited: delivered at `14b1641` / `534612a`; T5 (RLS) split out as `AME-021` | Verification record in the run directory |

Every item above has `TASK.md`, `RUN_LOG.md` and one or more independent
`REVIEW-*.md` files under `docs/ai/runs/`.

## 3. What the pilot user should now experience

- One refresh signal per order event per connected screen (no double refresh).
- After a database restart or network blip, screens resume receiving events
  without the user reloading.
- An expired/missing session is refused with `401`, not a server error.
- A screen belonging to restaurant A never receives restaurant B's events, and a
  foreign order id is indistinguishable from a missing one on every order route.
- CI runs a real two-tenant isolation suite on every push, so a regression in
  these properties is caught before merge.

## 4. What was not proven (read this before signing)

1. **No real staff accounts in production.** Duplicate-frame and reconnect
   behaviour were proven locally and at the module/LISTEN seam, not with two
   production devices. The first pilot session is the real test; §6 gives the
   observation checklist.
2. **Handler-level tests, not full HTTP.** The isolation suite invokes route
   handlers directly. Middleware and real header parsing are not exercised; the
   B3-S manual staging gate remains the end-to-end reference.
3. **Platform admins can still mutate tenant order status** on
   `PATCH /orders/[id]/status`, and that reveals existence there
   (`AME-022`, policy decision, open).
4. **Table and `restaurants/[id]` refusal shapes** are not yet uniform
   (`AME-024`, open). The audit found no caller-reachable existence leak outside
   those path-id routes, but they are unfixed.
5. **No database-level RLS.** Isolation is application-layer (`AME-021`,
   deferred). Acceptable for a small pilot with known restaurants; not the right
   end state for scale.
6. **Push notifications degrade silently** if VAPID is misconfigured: one warning
   line, no crash (`AME-019` trade). Watch for
   `[Push] VAPID configuration ... disabled`.
7. **One extra idle LISTEN connection per process** (`AME-017`, cosmetic).

## 5. Release and rollback

- Live: Railway service `QR-Eat` at `5dc8c8d`, deployment
  `ddf8e3a7-87cb-4bdb-8060-8f74e627fb2d`, health UP, database CONNECTED.
- No migrations, seeds or configuration changes are pending from this work.
- Rollback: redeploy the previous deployment tag. Every change in this set is
  application code; none requires a data rollback.
- The isolation harness runs only in CI and against disposable databases; it
  never touches production.

## 6. First-session observation checklist (operator)

Do this once, with two staff devices signed into the **same** restaurant:

1. Open the staff order screen on both devices.
2. Create one order, add one item, then cancel another order.
3. Confirm each action produces **one** refresh on each device, not two.
4. Restart the database (or wait for a maintenance restart) and repeat step 3.
   Events must resume without reloading the screen.
5. Check the server log for `PostgreSQL pub/sub initialized successfully` after
   the restart, and for the absence of `❌`, `Failed to publish`, `FATAL`.
6. Sign out on one device and confirm the staff stream request is refused with
   `401`, not `500`.
7. Record the outcome (frame counts, restart recovery) in the pilot log.

If step 3 shows duplicates, or step 4 does not resume, stop and reopen the
relevant AME item before continuing the pilot.

## 7. Decision

Recommended: **GO WITH CONDITIONS** — conditions are the §6 checklist being
executed and recorded on the first session, and no open defect emerging from it.

Not recommended to hold for `AME-024` or `AME-022`: neither is a caller-reachable
leak on the order surface today, and both are tracked with defined scope.
`AME-021` (RLS) is a pre-scale item, not a pilot blocker.

| Field | Value |
|---|---|
| Decision | **GO WITH CONDITIONS** |
| Decided by | Atiff |
| Date | 2026-11-21 |
| Conditions accepted | The §6 first-session checklist is executed and recorded on the first pilot session. Any duplicate-frame result or failure to resume after a database restart reopens the relevant AME item before the pilot continues. |
| Condition status (2026-11-21) | **Technical equivalents executed in production** (see §9): exactly-once frames for create/add/cancel on two concurrent streams, and recovery after an administrator database restart with no client reconnect. Outstanding: the same observation on two real staff devices, plus the visual "row appears once" confirmation. |
| Follow-ups started | `AME-024` (tables/restaurants), `AME-022` (admin policy) |
| Not conditions | `AME-021` (RLS) is pre-scale; `AME-017` is cosmetic |

**Conditions, verbatim:** the gate is open for a pilot **only** on the basis that
the observation checklist is run on the first session and its result recorded.
A duplicate refresh, or a stream that does not resume after a database restart,
is a stop-and-reopen event, not a note.

## 9. Production check — 2026-11-21

Run against `https://tabtep.app` (deployment at `5dc8c8d` / `0425940`) with a
signed-in owner session, driven through the authenticated browser. No
credentials were written to chat, logs or evidence.

**Method:** two concurrent `EventSource` connections to `/api/events/orders` from
the same authenticated page; count frames by type per stream; trigger actions
through the real API; then restart the Railway PostgreSQL service and repeat one
action.

| Step | Action | Result |
|---|---|---|
| 1 | Two concurrent streams open | Both `readyState=1`, one `connection` frame each, zero errors |
| 2 | Create order (takeaway, routed to station) | `201`, status `CONFIRMED`, ticket `QUEUED`; each stream **exactly one** `order_created`, one `order_status_changed`, one `kitchen_notification` |
| 3 | Add one item | `200`, version `2 → 3`; each stream **exactly one** `order_items_added` |
| 4 | Cancel the order | `200`; each stream **exactly one** `order_cancelled` |
| 5 | Restart the PostgreSQL service | Server log: `terminating connection due to administrator command`, `Attempting to reconnect (1/5)` ×2, then `PostgreSQL LISTEN client connected` ×2. Both streams stayed open (`readyState=1`, **zero** errors) |
| 6 | Create order after the restart | `201`; each stream **exactly one** `order_created`, one `order_status_changed`, one `kitchen_notification`, **without reloading** |
| 7 | Anonymous probes | `GET /api/orders` → 401; `GET /api/orders/{uuid}` → 401 `AUTHENTICATION_REQUIRED`; `GET /api/events/orders` → 401 |

**Cleanup:** both created orders were cancelled (`200`); the streams were closed.
No customer data, no PII, no credentials recorded.

**What this proves:** exactly-once delivery on a live server, and recovery of the
server-side listener after a real administrator restart, with the HTTP streams
left intact.

**What it does not prove:** the **cold-start** race (the server was warm; the
duplicate defect needed two concurrent first connections on a cold process — that
remains proven by the local two-tenant harness and the AME-015 module tests), and
the visual two-device acceptance.

**Visual check attempted, not claimed:** a second browser tab on the web orders
page was used to look for a duplicate row. The created takeaway order was not
visible on that page at all (the API returned it), and the second tab showed a
partial total after the database restart. Neither is evidence of duplicate frames;
both are recorded as `AME-025` for investigation. The staff surface is the
Android Counter, so this does not gate the pilot.

**Observation for the backlog:** the restart produced **two** LISTEN reconnects,
because Next bundles `instrumentation.ts` and the route as separate module graphs.
That is the known `AME-017` condition, not a defect; it also confirms the fix
holds in both graphs.

## 8. References

- `docs/ai/runs/QR-EAT-AME-015-PG-PUBSUB/`
- `docs/ai/runs/QR-EAT-AME-016-SSE-RECONNECT/`
- `docs/ai/runs/QR-EAT-AME-019-LAZY-VAPID/`
- `docs/ai/runs/QR-EAT-AME-013-TENANT-HARNESS/`
- `docs/ai/runs/QR-EAT-AME-020-REFUSAL-SHAPE/`
- `docs/ai/runs/QR-EAT-AME-023-ORDER-REFUSALS/`
- `docs/ai/runs/QR-EAT-AME-007-TENANT-VERIFY/`
- `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/B3-C-HANDOFF.md` (post-freeze update
  2026-11-21: `401`/`404` shapes, stream durability, two-device checklist)
- `Tabtep-App/docs/MASTER-REFERENCE.md` (§4, §8) and
  `TENANT-ISOLATION-AUDIT.md`
