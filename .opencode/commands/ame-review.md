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
3. Identify the standards sources.
4. Load `ame-verification`.
5. Review on two axes: Spec and Standards.
6. Add consistency, UX/UI, accessibility, API, security, and data checks where relevant.
7. Report findings by severity with file/line references.
8. Full `REVIEW-<n>.md` is required for L3/R2/R3, and for L2 FAIL or notes.
   For a clean L1/L2 PASS, record the verdict and evidence in `RUN_LOG.md`.
9. Update the `TASK.md` state header.
10. Do not edit product code.

If fixes are needed, stop and recommend `/ame-fix <review-report-path>`.
