# NEXT — QR-EAT-AME-015-PG-PUBSUB

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-19

Task contract: `TASK.md`
Task revision: 2 (approved 2026-11-19)

Current step: complete (committed, merged and deployed)

Last completed:

- Revision 1 approved, implemented, reviewed; revision 2 amended the acceptance
  wording after F-1 (single-flight is per module instance).
- Correction cycle 1: R-01–R-05, committable evidence, portable harness.
- Correction cycle 2: initialize generation guard, N-2 evidence correction.
- `REVIEW-03.md` PASS WITH NOTES; F-1/R-06 and N-2 closed; N-6 accepted as
  `AME-018`.
- Local commit `6a51d04`; pushed; Node 20 CI passed type-check and the full test
  suite, Build failed on a pre-existing missing VAPID secret (`AME-019`).
- Merged `19cb485` to `main`; Railway deployment
  `4657048f-e94d-48b7-aa0a-1359b729e452` `SUCCESS`.
- Smoke: health 200 UP/database CONNECTED, root 200, SSE 401 unauthenticated,
  pub/sub startup lines present, 0 error-prefixed log lines.
- No migration, no seed, no production config change.

In progress:

- Nothing.

Next action:

- Plan `AME-016` (reconnect drops per-connection SSE handlers) as the next R2
  reliability task. `AME-018` can ride along if it fits. `AME-019` (CI VAPID
  secret) is a small independent fix.

Blockers:

- None.

Open decisions:

- Whether to close the pilot pre-gate now that AME-015 is deployed, before
  starting AME-016.
- When to fix `AME-019` so CI is trustworthy again.

Read first:

- `TASK.md`
- `REVIEW-03.md`
- `RUN_LOG.md` (Release section)

Do not:

- Start B3-C in `../Tabtep-App` until the pilot pre-gate decision is recorded.
- Change scope without a new task revision.
- Print secrets or PII.
- Trust chat memory over the files and live Git.
