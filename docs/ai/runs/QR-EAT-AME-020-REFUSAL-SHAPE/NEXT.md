# NEXT — QR-EAT-AME-020-REFUSAL-SHAPE

<!--
Bookmark only. TASK.md and live Git are authoritative.
Update at phase boundaries, before compaction, and before ending a session.
-->

Updated: 2026-11-20

Task contract: `TASK.md`
Task revision: 2 (approved 2026-11-20)

Current step: complete (committed, both CI jobs green, merged and deployed)

Last completed:

- Revision 1: order read/write refusal normalisation, SSE 401, four extra
  call sites from the audit, harness tightened.
- `REVIEW-01.md` PASS WITH NOTES → F-1 (status route leak) → revision 2.
- Revision 2: status route identical 404, recall check moved behind the tenant
  boundary, harness assertion added.
- `REVIEW-02.md` PASS WITH NOTES: F-1 closed, 16-route sweep clean, four
  mutation proofs.
- Commit `e1e2da6`; CI `44748587813` success (verify 2m43s, integration 18
  assertions); merge `8487f08`; deployment `8f775ad3…` SUCCESS; health UP, SSE
  401, no migration.
- Deploy smoke found a pre-existing anonymous 500 on `GET /api/orders/{id}`;
  opened as `AME-023`.

In progress:

- Nothing.

Next action:

- `AME-023` (`R2`, ready): fold the remaining refusal/status consistency into one
  bounded task — `modify` 500→404, anonymous order-route 500→401, and the other
  resource helpers' raw-403 pattern.
- Record the pilot pre-gate decision (see below).
- `AME-022` (`R3`, ready) is a policy decision: whether platform admins may
  mutate tenant business data. Do not start without the owner's direction.

Blockers:

- None.

Open decisions:

- Pilot pre-gate: with AME-015/016/018/019/013/020 delivered and CI green, is the
  gate satisfied before or after `AME-023`?
- `AME-022` admin policy.
- `AME-017` stays deferred; `AME-021` (RLS) stays deferred.

Read first:

- `TASK.md`
- `REVIEW-02.md`
- `RUN_LOG.md` (Release section)

Do not:

- Treat anonymous order-route 500s as fixed; `AME-023` owns that.
- Treat platform-admin status mutation as resolved; `AME-022` owns the policy.
- Print secrets or PII.
- Trust chat memory over the files and live Git.
