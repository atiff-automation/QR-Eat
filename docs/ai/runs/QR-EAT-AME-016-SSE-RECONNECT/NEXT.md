# NEXT — QR-EAT-AME-016-SSE-RECONNECT

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-19

Task contract: `TASK.md`
Task revision: 1 (approved 2026-11-19)

Current step: complete (committed, merged and deployed)

Last completed:

- Revision 1 approved and implemented; verifier PASS WITH NOTES
  (`REVIEW-01.md`), no blocker or high finding.
- Session teardown separated from full disposal; reconnect preserves subscriber
  listeners; deliberate close cannot schedule a second reconnect; NOTIFY
  publication ownership-gated (`AME-018` closed).
- Red proof 5 failed / 1 passed; verifier reproduced it and independently ran a
  disposable-PostgreSQL probe (post-fix 1 frame, pre-fix 0 frames plus chained
  reconnects).
- Commit `312b09c`; merge `d6fc6ba`; Railway deployment
  `8d457eb7-8ea6-4550-9536-c39f94a44094` `SUCCESS`.
- Smoke: health 200 UP/database CONNECTED, root 200, SSE 401 unauthenticated,
  pub/sub startup lines present, 0 error-prefixed log lines.
- No migration, no seed, no production config change.

In progress:

- Nothing.

Next action:

- `AME-019` (CI `Build` red: missing `VAPID_PRIVATE_KEY` repository secret) is
  the next small item so CI is trustworthy again.
- Then the pilot pre-gate decision, and only afterwards B3-C in `../Tabtep-App`.
- `AME-017` (one LISTEN session per process) stays deferred.

Blockers:

- None.

Open decisions:

- Fix `AME-019` via a CI-only throwaway key secret or lazy VAPID initialisation.
- Whether the pilot pre-gate is now satisfied for the staff feed.

Read first:

- `TASK.md`
- `REVIEW-01.md`
- `RUN_LOG.md` (Release section)

Do not:

- Start B3-C before the pilot pre-gate decision is recorded.
- Change scope without a new task revision.
- Print secrets or PII.
- Trust chat memory over the files and live Git.
