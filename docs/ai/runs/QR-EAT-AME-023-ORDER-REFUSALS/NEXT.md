# NEXT — QR-EAT-AME-023-ORDER-REFUSALS

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-20

Task contract: `TASK.md`
Task revision: 1 (planning; awaiting owner approval)

Current step: commit gate — awaiting owner authorization, then the CI gate

Last completed:

- Revision 1 implemented and reviewed: `REVIEW-01.md` PASS WITH NOTES, no code
  correction required.
- Anonymous 401 on six order routes (cookie and Bearer verified); `modify`
  refusals identical 404; audit event behaviour recorded (status writes none,
  pre-existing).
- Table/restaurant audit: 11 and 35 sites, with the path-id vs context-id
  reachability distinction added to `AME-024`.
- Local gates: 15 focused, 91 regression, 1724 full, integration 20/20 three
  times.
- No commit, push, CI run, deploy or shared-database action.

In progress:

- Nothing. Commit authorization pending.

Next action:

- On authorization: commit, push `fix/ame-023-order-refusals`, require both CI
  jobs green, then the merge/deploy decision.

Blockers:

- CI cannot run until the push.

Open decisions:

- Merge after both jobs green.
- `AME-024` should start with the path-id routes (`restaurants/[id]`, tables),
  not the context-id ones.
