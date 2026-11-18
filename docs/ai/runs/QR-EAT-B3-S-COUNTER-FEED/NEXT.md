# NEXT — QR-EAT-B3-S-COUNTER-FEED

<!--
Bookmark only. TASK.md and live Git are authoritative.
-->

Updated: 2026-11-19

Task contract: `docs/ai/runs/QR-EAT-B3-S-COUNTER-FEED/TASK.md`
Task revision: 1 (approved 2026-11-18)

Current step: **DEPLOYED AND HEALTHY**. `phase-b-counter-feed-v1` merged to
`main` at `ab63894`, pushed, and deployed as Railway
`27852ccb-f16c-468a-9885-bf99f6771918` (`SUCCESS`). Health `UP`, database
`CONNECTED`; both B3-S migrations applied by `prisma migrate deploy`; seed not
run.

Next action:
1. Close `AME-014` after this record is pushed (see `BACKLOG.md`).
2. B3-C starts in a separate `../Tabtep-App` session against
   `docs/PRODUCT/COUNTER-FEED-CONTRACT.md` + `B3-C-HANDOFF.md`; server is
   healthy, but B3-C end-to-end is not yet claimed.
3. Backlog `AME-015`: single-flight `pgPubSub.initialize()/subscribe()`
   (duplicate SSE refresh frames on cold concurrent connect).
4. Keep `AME-013` (real Postgres harness) before pilot.

Blockers:
- None for server availability.
- B3-C code and its verification are a separate cross-repo task.

Guardrails:
- No `db:seed` in production; `prisma migrate deploy` is the path.
- No loyalty flag or HMAC key changes.
- Rollback target if needed: deployment `8a9abe48…` or revert `ab63894`.
