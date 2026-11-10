---
description: Run a read-only two-axis review of a diff or branch and record findings when required
agent: ame-lead
subagent: false
---

Use the REVIEW workflow. Product code is read-only.

Review: $ARGUMENTS

Requirements:

1. Pin the diff base.
2. Read `TASK.md` if present; identify the specification source.
3. If resuming, read `NEXT.md` as navigation only. The live diff and `TASK.md`
   are authoritative.
4. Identify the standards sources.
5. Load `ame-verification`.
6. Review on two axes: Spec and Standards.
7. Add consistency, UX/UI, accessibility, API, security, and data checks where
   relevant.
8. Report findings by severity with file/line references.
9. Full `REVIEW-<n>.md` is required for L3/R2/R3, and for L2 FAIL or notes.
   For a clean L1/L2 PASS, record the verdict and evidence in `RUN_LOG.md`.
10. Update the `TASK.md` state header:
    - PASS: `ready_to_commit` if R2/R3, otherwise `done` after normal commit;
    - FAIL: `correction_required`;
    - notes that need a human: `owner_decision_required`.
11. Update `NEXT.md`.
12. Do not edit product code.

If fixes are needed, stop and recommend `/ame-fix <review-report-path>`.
